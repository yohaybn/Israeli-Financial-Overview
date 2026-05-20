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
    backoffUntilMs = Math.max(backoffUntilMs, Date.now() + backoff429Ms());
}

async function waitBackoff(priority: YahooRequestPriority): Promise<void> {
    const remaining = backoffUntilMs - Date.now();
    if (remaining <= 0) return;
    const factor = priority === 'stock' ? 0.2 : 1;
    await sleep(Math.ceil(remaining * factor));
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
