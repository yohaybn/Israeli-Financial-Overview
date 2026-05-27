import type {
    DashboardConfig,
    GlobalScrapeConfig,
    PostScrapeConfig,
    Profile,
    ScrapeResult,
    Transaction,
} from '@app/shared';
import { DEFAULT_DASHBOARD_CONFIG } from '@app/shared';

export const DEMO_SAMPLE_FILENAME = 'demo-sample.json';

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function txn(partial: Omit<Transaction, 'processedDate'> & { processedDate?: string }): Transaction {
    return {
        ...partial,
        processedDate: partial.processedDate ?? partial.date,
    };
}

/** Deterministic PRNG for stable demo data across reloads. */
function mulberry32(seed: number) {
    return function rand() {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Inclusive bounds for transaction count per month (1 salary + expenses). */
const MIN_TXNS_PER_MONTH = 40;
const MAX_TXNS_PER_MONTH = 65;

const EXPENSE_DESCRIPTIONS: { description: string; category: string; min: number; max: number }[] = [
    { description: 'רמי לוי', category: 'מזון', min: 45, max: 890 },
    { description: 'שופרסל', category: 'מזון', min: 80, max: 620 },
    { description: 'יינות ביתן', category: 'מזון', min: 35, max: 410 },
    { description: 'קפה גרג', category: 'מזון', min: 12, max: 48 },
    { description: 'חשמל — חברת חשמל', category: 'שירותים', min: 180, max: 520 },
    { description: 'מים והביוב', category: 'שירותים', min: 90, max: 220 },
    { description: 'ארנונה', category: 'שירותים', min: 400, max: 1200 },
    { description: 'נטפליקס', category: 'בידור', min: 49.9, max: 49.9 },
    { description: 'סלקום', category: 'שירותים', min: 79, max: 159 },
    { description: 'ספוטיפיי', category: 'בידור', min: 35, max: 35 },
    { description: 'דלק פז', category: 'רכב', min: 180, max: 420 },
    { description: 'דלק דור אלון', category: 'רכב', min: 170, max: 400 },
    { description: 'ביטוח רכב', category: 'ביטוחים', min: 650, max: 980 },
    { description: 'ביטוח דירה', category: 'ביטוחים', min: 120, max: 180 },
    { description: 'רופא / קופת חולים', category: 'בריאות', min: 50, max: 350 },
    { description: 'תרופות', category: 'בריאות', min: 25, max: 280 },
    { description: 'גן ילדים', category: 'חינוך', min: 1800, max: 2200 },
    { description: 'קניות אונליין', category: 'אחר', min: 29, max: 650 },
    { description: 'מסעדה', category: 'מזון', min: 65, max: 420 },
    { description: 'תחבורה ציבורית', category: 'רכב', min: 5.5, max: 22 },
];

/** Subscriptions in demo data — only these rows get `isSubscription: true`. */
const SUBSCRIPTION_DESCRIPTIONS = new Set(['נטפליקס', 'סלקום', 'ספוטיפיי', 'ביטוח דירה']);

const PROVIDER_ROWS: { provider: string; accountNumber: string }[] = [
    { provider: 'hapoalim', accountNumber: '131' },
    { provider: 'isracard', accountNumber: '5326' },
    { provider: 'visaCal', accountNumber: '4580' },
];

const INVESTMENT_BROKER_TXNS: { description: string; amount: number; day: number }[] = [
    { description: 'קניית מניות — AAPL (דמו)', amount: -4200, day: 5 },
    { description: 'קניית מניות — MSFT (דמו)', amount: -3100, day: 12 },
    { description: 'דמי ניהול תיק — בנק (דמו)', amount: -35, day: 1 },
];

type MonthBuildOpts = {
    maxDay?: number;
    expenseScale?: number;
    idPrefix: string;
    includeInvestmentTxns?: boolean;
};

function buildMonthTransactions(
    y: number,
    m: number,
    rand: () => number,
    opts: MonthBuildOpts
): Transaction[] {
    const lastDay = new Date(y, m + 1, 0).getDate();
    const effectiveLastDay = opts.maxDay != null ? Math.min(opts.maxDay, lastDay) : lastDay;
    const scale = opts.expenseScale ?? 1;
    const out: Transaction[] = [];
    let idCounter = 0;
    const nextId = () => `${opts.idPrefix}${idCounter++}`;

    const monthTotal =
        MIN_TXNS_PER_MONTH + Math.floor(rand() * (MAX_TXNS_PER_MONTH - MIN_TXNS_PER_MONTH + 1));
    const expenseCount = Math.max(1, Math.round((monthTotal - 3) * scale));

    const salaryDay = 1 + Math.floor(rand() * Math.min(7, effectiveLastDay));
    const salaryAmount = 11800 + Math.round(rand() * 2000);
    out.push(
        txn({
            id: nextId(),
            date: ymd(new Date(y, m, salaryDay)),
            description: 'שכר — Demo Employer',
            amount: salaryAmount,
            originalAmount: salaryAmount,
            originalCurrency: 'ILS',
            chargedAmount: salaryAmount,
            status: 'completed',
            category: 'הכנסות',
            provider: 'hapoalim',
            accountNumber: '131',
            txnType: 'income',
        })
    );

    const bituachDay = Math.min(effectiveLastDay, 8 + Math.floor(rand() * 12));
    const bituachAmount = 900 + Math.round(rand() * 2100);
    out.push(
        txn({
            id: nextId(),
            date: ymd(new Date(y, m, bituachDay)),
            description: 'ביטוח לאומי — גמלאות ילדים',
            amount: bituachAmount,
            originalAmount: bituachAmount,
            originalCurrency: 'ILS',
            chargedAmount: bituachAmount,
            status: 'completed',
            category: 'הכנסות',
            provider: 'hapoalim',
            accountNumber: '131',
            txnType: 'income',
        })
    );

    const sideJobDay = Math.min(effectiveLastDay, 12 + Math.floor(rand() * 14));
    const sideJobAmount = 2400 + Math.round(rand() * 3800);
    out.push(
        txn({
            id: nextId(),
            date: ymd(new Date(y, m, sideJobDay)),
            description: 'שכר — מעסיק נוסף (דמו)',
            amount: sideJobAmount,
            originalAmount: sideJobAmount,
            originalCurrency: 'ILS',
            chargedAmount: sideJobAmount,
            status: 'completed',
            category: 'הכנסות',
            provider: 'hapoalim',
            accountNumber: '131',
            txnType: 'income',
        })
    );

    if (opts.includeInvestmentTxns) {
        for (const inv of INVESTMENT_BROKER_TXNS) {
            if (inv.day <= effectiveLastDay) {
                out.push(
                    txn({
                        id: nextId(),
                        date: ymd(new Date(y, m, inv.day)),
                        description: inv.description,
                        amount: inv.amount,
                        originalAmount: inv.amount,
                        originalCurrency: 'ILS',
                        chargedAmount: inv.amount,
                        status: 'completed',
                        category: 'Investments',
                        provider: 'hapoalim',
                        accountNumber: '131',
                        txnType: 'expense',
                        isInvestment: true,
                    })
                );
            }
        }
    }

    for (let k = 0; k < expenseCount; k++) {
        const day = 1 + Math.floor(rand() * effectiveLastDay);
        const pick = EXPENSE_DESCRIPTIONS[Math.floor(rand() * EXPENSE_DESCRIPTIONS.length)];
        const raw = pick.min + rand() * (pick.max - pick.min);
        const amt = -Math.round(raw * 100) / 100;
        const row = PROVIDER_ROWS[Math.floor(rand() * PROVIDER_ROWS.length)];
        const isSub = SUBSCRIPTION_DESCRIPTIONS.has(pick.description);

        const isInternal = rand() < 0.012;
        if (isInternal) {
            const tfer = -(500 + Math.round(rand() * 4500));
            out.push(
                txn({
                    id: nextId(),
                    date: ymd(new Date(y, m, day)),
                    description: 'העברה בין חשבונות',
                    amount: tfer,
                    originalAmount: tfer,
                    originalCurrency: 'ILS',
                    chargedAmount: tfer,
                    status: 'completed',
                    category: 'העברות',
                    provider: 'hapoalim',
                    accountNumber: '131',
                    txnType: 'internal_transfer',
                    isInternalTransfer: true,
                })
            );
            continue;
        }

        out.push(
            txn({
                id: nextId(),
                date: ymd(new Date(y, m, day)),
                description: pick.description,
                amount: amt,
                originalAmount: amt,
                originalCurrency: 'ILS',
                chargedAmount: amt,
                status: 'completed',
                category: pick.category,
                provider: row.provider,
                accountNumber: row.accountNumber,
                txnType: 'expense',
                isSubscription: isSub,
            })
        );
    }

    return out;
}

let cachedPastMonths: Transaction[] | null = null;

function buildPastMonthsTransactions(): Transaction[] {
    const rand = mulberry32(0x64_65_6d_6f); // "demo"
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth();
    const out: Transaction[] = [];

    for (let mi = 0; mi < 5; mi++) {
        const monthDate = new Date(endYear, endMonth - 5 + mi, 1);
        out.push(
            ...buildMonthTransactions(monthDate.getFullYear(), monthDate.getMonth(), rand, {
                idPrefix: `demo-txn-p${mi}-`,
            })
        );
    }

    return out;
}

/** Current calendar month — regenerated on each call (dates through today). */
export function getDemoCurrentMonthTransactions(): Transaction[] {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const today = now.getDate();
    const scale = Math.max(0.25, today / lastDay);
    const seed = y * 100 + (m + 1) + today;
    const rand = mulberry32(seed ^ 0x64_65_6d_6f);

    return buildMonthTransactions(y, m, rand, {
        maxDay: today,
        expenseScale: scale,
        idPrefix: 'demo-txn-cur-',
        includeInvestmentTxns: true,
    });
}

/** Result file name for the latest demo scrape run (one per calendar month). */
export function getDemoCurrentMonthScrapeFilename(): string {
    const now = new Date();
    return `demo-scrape-${now.getFullYear()}-${pad(now.getMonth() + 1)}.json`;
}

let demoLastScrapeAt: string | null = null;

/** Fresh mock scrape payload: current month only (through today). */
export function demoScrapeResultCurrentMonth(): ScrapeResult {
    const transactions = getDemoCurrentMonthTransactions();
    demoLastScrapeAt = new Date().toISOString();
    return {
        success: true,
        accounts: [
            { accountNumber: '131', provider: 'hapoalim', balance: 12400, currency: 'ILS' },
            { accountNumber: '5326', provider: 'isracard', currency: 'ILS' },
        ],
        transactions,
        executionTimeMs: 900 + Math.floor(transactions.length * 12),
    };
}

export function getDemoLastScrapeAt(): string | null {
    return demoLastScrapeAt;
}

/** All demo transactions: five past months (cached) + current month (on the fly). */
export function getDemoTransactions(): Transaction[] {
    if (!cachedPastMonths) {
        cachedPastMonths = buildPastMonthsTransactions();
    }
    const all = [...cachedPastMonths, ...getDemoCurrentMonthTransactions()];
    all.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return all;
}

/** @deprecated Use {@link getDemoTransactions} — kept for imports that expect a static array. */
export const demoTransactions: Transaction[] = getDemoTransactions();

const postScrape: PostScrapeConfig = {
    runCategorization: true,
    runInsightRules: true,
    spendingDigestEnabled: false,
    fraudDetection: {
        enabled: true,
        notifyOnIssue: false,
        mode: 'local',
        scope: 'current',
    },
    customAI: {
        enabled: false,
        query: '',
        notifyOnResult: false,
    },
    notificationChannels: ['console'],
    budgetExports: {},
};

export const demoGlobalScrapeConfig: GlobalScrapeConfig = {
    scraperOptions: {},
    postScrapeConfig: postScrape,
    useSmartStartDate: true,
};

export const demoDashboardConfig: DashboardConfig = {
    ...DEFAULT_DASHBOARD_CONFIG,
    forecastMonths: 6,
};

export const demoAiSettings = {
    categories: ['מזון', 'הכנסות', 'שירותים', 'בידור', 'העברות', 'רכב', 'ביטוחים', 'בריאות', 'חינוך', 'אחר', 'Investments'],
    model: 'gemini-2.0-flash',
    chatModel: 'gemini-2.0-flash',
    enabled: true,
    superPrivacyMode: false,
    superPrivacySharePersona: false,
    superPrivacyShareFacts: false,
    superPrivacyShareInsights: false,
    superPrivacyShareAlerts: false,
    superPrivacyShareDashboardContext: false,
    superPrivacyShareChatHistory: false,
    personaInjectionEnabled: true,
    userContext: {
        profile: { narrativeNotes: 'משפחה עם שני ילדים בגן' },
        financialGoals: { topPriorities: ['investing', 'building_emergency_fund'] },
    },
};

export function getDemoScrapeResultList() {
    const txns = getDemoTransactions();
    const monthTxns = getDemoCurrentMonthTransactions();
    const monthFilename = getDemoCurrentMonthScrapeFilename();
    const now = new Date().toISOString();
    return [
        {
            filename: monthFilename,
            transactionCount: monthTxns.length,
            accountCount: 2,
            createdAt: demoLastScrapeAt ?? now,
        },
        {
            filename: DEMO_SAMPLE_FILENAME,
            transactionCount: txns.length,
            accountCount: 2,
            createdAt: now,
        },
    ];
}

export function demoScrapeResultFile(): ScrapeResult {
    const transactions = getDemoTransactions();
    return {
        success: true,
        accounts: [
            { accountNumber: '131', provider: 'hapoalim', balance: 12400, currency: 'ILS' },
            { accountNumber: '5326', provider: 'isracard', currency: 'ILS' },
        ],
        transactions,
        executionTimeMs: 1200,
    };
}

export const demoProfiles: Profile[] = [
    {
        id: 'demo-profile-1',
        name: 'Demo — Hapoalim',
        companyId: 'hapoalim',
        credentials: { userCode: '****', password: '****' },
        options: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

export const demoTopInsights = [
    {
        id: 'insight-1',
        text: 'הוצאות המזון יציבות ביחס לחודש הקודם — אין קפיצה חריגה.',
        score: 82,
        createdAt: new Date().toISOString(),
        source: 'ai' as const,
    },
    {
        id: 'insight-2',
        text: 'לא זוהו חיובים חריגים או חשודים בתקופה הנבחרת.',
        score: 71,
        createdAt: new Date().toISOString(),
        source: 'ai' as const,
    },
    {
        id: 'insight-3',
        text: 'תיק ההשקעות בדמו מציג רווח כולל — ראה לוח השקעות.',
        score: 68,
        createdAt: new Date().toISOString(),
        source: 'ai' as const,
    },
];
