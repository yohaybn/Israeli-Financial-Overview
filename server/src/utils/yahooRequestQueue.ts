import { AsyncLocalStorage } from 'node:async_hooks';

/** Stock/equity quotes and chart closes — run before FX, search, and other aux traffic. */
export type YahooRequestPriority = 'stock' | 'aux';

const priorityContext = new AsyncLocalStorage<YahooRequestPriority>();

type QueueJob<T> = {
    priority: YahooRequestPriority;
    run: () => Promise<T>;
    resolve: (v: T) => void;
    reject: (reason: unknown) => void;
};

const pending: QueueJob<unknown>[] = [];
let pumpRunning = false;
/** True while a queued job is executing (yahoo-finance2 fetch must run inline, not re-enqueue). */
let insideQueuedJob = false;
let lastStartedAt = 0;
let backoffUntilMs = 0;
let circuitOpenUntilMs = 0;
const recent429AtMs: number[] = [];

function minGapMs(): number {
    const raw = process.env.YAHOO_MIN_GAP_MS;
    const n = raw != null && raw !== '' ? parseInt(raw, 10) : 400;
    return Number.isFinite(n) && n >= 0 ? n : 400;
}

function backoff429Ms(): number {
    const raw = process.env.YAHOO_429_BACKOFF_MS;
    const n = raw != null && raw !== '' ? parseInt(raw, 10) : 90_000;
    return Number.isFinite(n) && n >= 0 ? n : 90_000;
}

function circuit429Threshold(): number {
    const raw = process.env.YAHOO_CIRCUIT_429_THRESHOLD;
    const n = raw != null && raw !== '' ? parseInt(raw, 10) : 4;
    return Number.isFinite(n) && n > 0 ? n : 4;
}

function circuit429WindowMs(): number {
    const raw = process.env.YAHOO_CIRCUIT_429_WINDOW_MS;
    const n = raw != null && raw !== '' ? parseInt(raw, 10) : 5 * 60_000;
    return Number.isFinite(n) && n > 0 ? n : 5 * 60_000;
}

function circuitOpenMs(): number {
    const raw = process.env.YAHOO_CIRCUIT_OPEN_MS;
    const n = raw != null && raw !== '' ? parseInt(raw, 10) : 30 * 60_000;
    return Number.isFinite(n) && n > 0 ? n : 30 * 60_000;
}

function priorityRank(p: YahooRequestPriority): number {
    return p === 'stock' ? 0 : 1;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/** Active priority for nested yahoo-finance2 `fetch` calls (defaults to aux when unset). */
export function getYahooRequestPriority(): YahooRequestPriority {
    return priorityContext.getStore() ?? 'aux';
}

/** Call when Yahoo returns HTTP 429 so later requests back off (aux waits longer). */
export function noteYahooHttp429(): void {
    const now = Date.now();
    backoffUntilMs = Math.max(backoffUntilMs, now + backoff429Ms());

    const windowMs = circuit429WindowMs();
    recent429AtMs.push(now);
    while (recent429AtMs.length && now - recent429AtMs[0] > windowMs) {
        recent429AtMs.shift();
    }
    if (recent429AtMs.length >= circuit429Threshold()) {
        circuitOpenUntilMs = Math.max(circuitOpenUntilMs, now + circuitOpenMs());
        recent429AtMs.length = 0;
    }
}

function circuitRemainingMs(): number {
    return Math.max(0, circuitOpenUntilMs - Date.now());
}

function createCircuitOpenError(): Error {
    const seconds = Math.ceil(circuitRemainingMs() / 1000);
    const e = new Error(`Yahoo circuit breaker open for ${seconds}s`);
    e.name = 'YahooCircuitOpenError';
    return e;
}

export function isYahooCircuitOpen(): boolean {
    return circuitRemainingMs() > 0;
}

function waitBackoff(priority: YahooRequestPriority): Promise<void> {
    const remaining = backoffUntilMs - Date.now();
    if (remaining <= 0) return Promise.resolve();
    const factor = priority === 'stock' ? 0.2 : 1;
    return sleep(Math.ceil(remaining * factor));
}

/** Milliseconds until the current 429 backoff clears for the given priority (0 when clear). */
export function yahooBackoffRemainingMs(priority: YahooRequestPriority): number {
    const remaining = backoffUntilMs - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining * (priority === 'stock' ? 0.2 : 1));
}

function dequeueNext(): QueueJob<unknown> | undefined {
    if (pending.length === 0) return undefined;
    let bestIdx = 0;
    let bestRank = priorityRank(pending[0].priority);
    for (let i = 1; i < pending.length; i++) {
        const r = priorityRank(pending[i].priority);
        if (r < bestRank) {
            bestRank = r;
            bestIdx = i;
        }
    }
    return pending.splice(bestIdx, 1)[0];
}

async function pump(): Promise<void> {
    if (pumpRunning) return;
    pumpRunning = true;
    try {
        while (pending.length > 0) {
            const job = dequeueNext();
            if (!job) break;
            if (isYahooCircuitOpen()) {
                job.reject(createCircuitOpenError());
                continue;
            }

            await waitBackoff(job.priority);

            const gap = minGapMs();
            const sinceLast = Date.now() - lastStartedAt;
            if (sinceLast < gap) {
                await sleep(gap - sinceLast);
            }
            lastStartedAt = Date.now();

            insideQueuedJob = true;
            try {
                const result = await priorityContext.run(job.priority, job.run);
                job.resolve(result);
            } catch (e) {
                job.reject(e);
            } finally {
                insideQueuedJob = false;
            }
        }
    } finally {
        pumpRunning = false;
        if (pending.length > 0) {
            void pump();
        }
    }
}

/**
 * Serializes Yahoo HTTP with stock-first ordering and spacing between calls.
 * Use {@link runWithYahooPriority} so yahoo-finance2 `fetch` inherits the same priority.
 */
export function enqueueYahooWork<T>(priority: YahooRequestPriority, fn: () => Promise<T>): Promise<T> {
    if (isYahooCircuitOpen()) {
        return Promise.reject(createCircuitOpenError());
    }
    if (insideQueuedJob) {
        return priorityContext.run(priority, fn);
    }
    return new Promise<T>((resolve, reject) => {
        pending.push({
            priority,
            run: fn,
            resolve: resolve as (v: unknown) => void,
            reject,
        });
        void pump();
    });
}

export function runWithYahooPriority<T>(priority: YahooRequestPriority, fn: () => Promise<T>): Promise<T> {
    return enqueueYahooWork(priority, fn);
}

/** FX / index pairs (e.g. `ILS=X`) — lower priority than equity tickers. */
export function yahooPriorityForSymbol(symbol: string): YahooRequestPriority {
    const s = symbol.trim().toUpperCase();
    if (!s) return 'aux';
    if (s.endsWith('=X')) return 'aux';
    return 'stock';
}
