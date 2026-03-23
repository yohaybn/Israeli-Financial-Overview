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

function buildTransactions(): Transaction[] {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = (day: number) => ymd(new Date(y, m, day));
    const prev = (day: number) => ymd(new Date(y, m - 1, day));

    return [
        txn({
            id: 'demo-txn-salary',
            date: d(3),
            description: 'שכר — Demo Employer',
            amount: 12800,
            originalAmount: 12800,
            originalCurrency: 'ILS',
            chargedAmount: 12800,
            status: 'completed',
            category: 'הכנסות',
            provider: 'hapoalim',
            accountNumber: '131',
            txnType: 'income',
        }),
        txn({
            id: 'demo-txn-grocery',
            date: d(5),
            description: 'רמי לוי',
            amount: -420.5,
            originalAmount: -420.5,
            originalCurrency: 'ILS',
            chargedAmount: -420.5,
            status: 'completed',
            category: 'מזון',
            provider: 'isracard',
            accountNumber: '5326',
            txnType: 'expense',
        }),
        txn({
            id: 'demo-txn-electric',
            date: d(8),
            description: 'חשמל — דמו',
            amount: -310,
            originalAmount: -310,
            originalCurrency: 'ILS',
            chargedAmount: -310,
            status: 'completed',
            category: 'שירותים',
            provider: 'hapoalim',
            accountNumber: '131',
            txnType: 'expense',
        }),
        txn({
            id: 'demo-txn-netflix',
            date: d(12),
            description: 'נטפליקס',
            amount: -49.9,
            originalAmount: -49.9,
            originalCurrency: 'ILS',
            chargedAmount: -49.9,
            status: 'completed',
            category: 'בידור',
            provider: 'visaCal',
            accountNumber: '4580',
            txnType: 'expense',
            isSubscription: true,
        }),
        txn({
            id: 'demo-txn-transfer',
            date: d(14),
            description: 'העברה בין חשבונות',
            amount: -2000,
            originalAmount: -2000,
            originalCurrency: 'ILS',
            chargedAmount: -2000,
            status: 'completed',
            category: 'העברות',
            provider: 'hapoalim',
            accountNumber: '131',
            txnType: 'internal_transfer',
            isInternalTransfer: true,
        }),
        txn({
            id: 'demo-txn-gas-prev',
            date: prev(20),
            description: 'דלק פז',
            amount: -280,
            originalAmount: -280,
            originalCurrency: 'ILS',
            chargedAmount: -280,
            status: 'completed',
            category: 'רכב',
            provider: 'hapoalim',
            accountNumber: '131',
            txnType: 'expense',
        }),
        txn({
            id: 'demo-txn-insurance-prev',
            date: prev(25),
            description: 'ביטוח רכב',
            amount: -890,
            originalAmount: -890,
            originalCurrency: 'ILS',
            chargedAmount: -890,
            status: 'completed',
            category: 'ביטוחים',
            provider: 'hapoalim',
            accountNumber: '131',
            txnType: 'expense',
        }),
    ];
}

export const demoTransactions: Transaction[] = buildTransactions();

const postScrape: PostScrapeConfig = {
    runCategorization: true,
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
    categories: ['מזון', 'הכנסות', 'שירותים', 'בידור', 'העברות', 'רכב', 'ביטוחים', 'אחר'],
    model: 'gemini-2.0-flash',
    enabled: true,
};

export const demoScrapeResultList = [
    {
        filename: DEMO_SAMPLE_FILENAME,
        transactionCount: demoTransactions.length,
        accountCount: 2,
        createdAt: new Date().toISOString(),
    },
];

export function demoScrapeResultFile(): ScrapeResult {
    return {
        success: true,
        accounts: [
            { accountNumber: '131', provider: 'hapoalim', balance: 12400, currency: 'ILS' },
            { accountNumber: '5326', provider: 'isracard', currency: 'ILS' },
        ],
        transactions: demoTransactions,
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
        text: 'Demo: grocery spend is steady vs last month.',
        score: 0.82,
        createdAt: new Date().toISOString(),
    },
    {
        id: 'insight-2',
        text: 'Demo: no unusual large charges detected.',
        score: 0.71,
        createdAt: new Date().toISOString(),
    },
];
