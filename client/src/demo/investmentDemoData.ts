type InvestmentRow = {
    id: string;
    userId: string;
    symbol: string;
    nickname?: string | null;
    quantity: number;
    purchasePricePerUnit: number;
    currency: string;
    trackFromDate: string;
    sourceTransactionId?: string | null;
    useTelAvivListing: boolean;
    valueInAgorot?: boolean;
    createdAt: string;
    updatedAt: string;
};

type LivePositionRow = {
    investmentId: string;
    symbol: string;
    nickname?: string | null;
    quantity: number;
    purchasePricePerUnit: number;
    valueInAgorot?: boolean;
    currency: string;
    trackFromDate: string;
    currentPrice: number | null;
    costBasisNative: number;
    marketValueNative: number | null;
    pnlNative: number | null;
    costBasisIls: number | null;
    marketValueIls: number | null;
    pnlIls: number | null;
    pnlPctOfCost?: number | null;
    quoteError?: string;
};

type PortfolioSummary = {
    displayCurrency: string;
    usdIlsRate: number | null;
    positions: LivePositionRow[];
    totalCostBasisIls: number | null;
    totalMarketValueIls: number | null;
    totalPnlIls: number | null;
    totalPnlPctOfCost?: number | null;
    partialQuotes: boolean;
};

type InvestmentAppSettingsDto = {
    featureEnabled: boolean;
    eodhdApiTokenConfigured: boolean;
    eodhdApiTokenFromEnv: boolean;
    marketDataProvider: 'yahoo' | 'eodhd_then_yahoo';
    eodhdQuoteMode: 'realtime' | 'eod' | 'realtime_then_eod' | 'eod_then_realtime';
    portfolioHistoricUsdIls: boolean;
};

type SnapshotSettings = {
    userId: string;
    runTime: string;
    timezone: string;
    enabled: boolean;
    updatedAt: string;
};

type PortfolioValueHistoryDto = {
    points: { date: string; totalValueIls: number; changePct: number | null }[];
    partial: boolean;
    fxMode: 'historic' | 'spot';
};

type InvestmentPriceHistoryDto = {
    points: { date: string; price: number; source: 'purchase' | 'eod' | 'realtime' }[];
    resolvedSymbol: string;
    currency: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthsAgo(n: number): string {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    return ymd(d);
}

const USD_ILS = 3.65;

/** Static demo holdings (quotes are mocked — no market API in demo). */
export const demoInvestments: InvestmentRow[] = [
    {
        id: 'demo-inv-aapl',
        userId: 'default',
        symbol: 'AAPL',
        nickname: 'Apple',
        quantity: 12,
        purchasePricePerUnit: 178.5,
        currency: 'USD',
        trackFromDate: monthsAgo(14),
        useTelAvivListing: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'demo-inv-msft',
        userId: 'default',
        symbol: 'MSFT',
        nickname: 'Microsoft',
        quantity: 6,
        purchasePricePerUnit: 385,
        currency: 'USD',
        trackFromDate: monthsAgo(10),
        useTelAvivListing: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'demo-inv-nvda',
        userId: 'default',
        symbol: 'NVDA',
        nickname: 'NVIDIA',
        quantity: 4,
        purchasePricePerUnit: 462,
        currency: 'USD',
        trackFromDate: monthsAgo(6),
        useTelAvivListing: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'demo-inv-teva',
        userId: 'default',
        symbol: 'TEVA',
        nickname: 'טבע',
        quantity: 80,
        purchasePricePerUnit: 5200,
        currency: 'ILS',
        trackFromDate: monthsAgo(8),
        useTelAvivListing: true,
        valueInAgorot: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const MOCK_QUOTES: Record<string, number> = {
    AAPL: 198.2,
    MSFT: 412.4,
    NVDA: 892.5,
    TEVA: 6120, // agorot
};

function ilsFromNative(amount: number, currency: string): number {
    if (currency === 'ILS') return amount;
    return amount * USD_ILS;
}

function unitToIls(price: number, currency: string, valueInAgorot?: boolean): number {
    if (currency === 'ILS' && valueInAgorot) return price / 100;
    return ilsFromNative(price, currency);
}

function buildLivePosition(inv: InvestmentRow): LivePositionRow {
    const current = MOCK_QUOTES[inv.symbol] ?? null;
    const costBasisNative = inv.quantity * inv.purchasePricePerUnit;
    const marketValueNative = current != null ? inv.quantity * current : null;
    const pnlNative = marketValueNative != null ? marketValueNative - costBasisNative : null;
    const costBasisIls = inv.quantity * unitToIls(inv.purchasePricePerUnit, inv.currency, inv.valueInAgorot);
    const marketValueIls =
        current != null ? inv.quantity * unitToIls(current, inv.currency, inv.valueInAgorot) : null;
    const pnlIls = marketValueIls != null ? marketValueIls - costBasisIls : null;
    const pnlPctOfCost =
        pnlIls != null && costBasisIls > 0 ? Math.round((pnlIls / costBasisIls) * 10000) / 100 : null;

    return {
        investmentId: inv.id,
        symbol: inv.symbol,
        nickname: inv.nickname,
        quantity: inv.quantity,
        purchasePricePerUnit: inv.purchasePricePerUnit,
        valueInAgorot: inv.valueInAgorot,
        currency: inv.currency,
        trackFromDate: inv.trackFromDate,
        currentPrice: current,
        costBasisNative,
        marketValueNative,
        pnlNative,
        costBasisIls,
        marketValueIls,
        pnlIls,
        pnlPctOfCost,
    };
}

export function getDemoPortfolioSummary(): PortfolioSummary {
    const positions = demoInvestments.map(buildLivePosition);
    const totalCostBasisIls = positions.reduce((s, p) => s + (p.costBasisIls ?? 0), 0);
    const totalMarketValueIls = positions.reduce((s, p) => s + (p.marketValueIls ?? 0), 0);
    const totalPnlIls = totalMarketValueIls - totalCostBasisIls;
    const totalPnlPctOfCost =
        totalCostBasisIls > 0 ? Math.round((totalPnlIls / totalCostBasisIls) * 10000) / 100 : null;

    return {
        displayCurrency: 'ILS',
        usdIlsRate: USD_ILS,
        positions,
        totalCostBasisIls,
        totalMarketValueIls,
        totalPnlIls,
        totalPnlPctOfCost,
        partialQuotes: false,
    };
}

export function getDemoInvestmentAppSettings(): InvestmentAppSettingsDto {
    return {
        featureEnabled: true,
        eodhdApiTokenConfigured: false,
        eodhdApiTokenFromEnv: false,
        marketDataProvider: 'yahoo',
        eodhdQuoteMode: 'eod',
        portfolioHistoricUsdIls: false,
    };
}

export function getDemoSnapshotSettings(): SnapshotSettings {
    return {
        userId: 'default',
        runTime: '22:00',
        timezone: 'Asia/Jerusalem',
        enabled: false,
        updatedAt: new Date().toISOString(),
    };
}

export function getDemoPortfolioValueHistory(from?: string, to?: string): PortfolioValueHistoryDto {
    const summary = getDemoPortfolioSummary();
    const end = to ? new Date(`${to}T12:00:00`) : new Date();
    const start = from ? new Date(`${from}T12:00:00`) : new Date(end);
    if (!from) start.setMonth(start.getMonth() - 5);

    const base = summary.totalMarketValueIls ?? 120_000;
    const points: PortfolioValueHistoryDto['points'] = [];
    const cursor = new Date(start);
    let prev = base * 0.88;

    while (cursor <= end) {
        const drift = 1 + (Math.sin(cursor.getDate() / 3) * 0.004);
        const totalValueIls = Math.round(prev * drift);
        const changePct = points.length === 0 ? null : Math.round(((totalValueIls - prev) / prev) * 10000) / 100;
        points.push({
            date: ymd(cursor),
            totalValueIls,
            changePct: points.length === 0 ? null : changePct,
        });
        prev = totalValueIls;
        cursor.setDate(cursor.getDate() + 3);
    }

    return { points, partial: false, fxMode: 'spot' };
}

export function getDemoInvestmentPriceHistory(investmentId: string): InvestmentPriceHistoryDto | null {
    const inv = demoInvestments.find((x) => x.id === investmentId);
    if (!inv) return null;

    const current = MOCK_QUOTES[inv.symbol];
    const buy = inv.purchasePricePerUnit;
    const start = new Date(`${inv.trackFromDate}T12:00:00`);
    const end = new Date();
    const points: InvestmentPriceHistoryDto['points'] = [
        { date: inv.trackFromDate, price: buy, source: 'purchase' },
    ];

    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 7);
    while (cursor <= end && current != null) {
        const t =
            (cursor.getTime() - start.getTime()) / Math.max(1, end.getTime() - start.getTime());
        const price = Math.round((buy + (current - buy) * t) * 100) / 100;
        points.push({ date: ymd(cursor), price, source: 'eod' });
        cursor.setDate(cursor.getDate() + 14);
    }
    if (current != null) {
        points.push({ date: ymd(end), price: current, source: 'eod' });
    }

    return {
        points,
        resolvedSymbol: inv.symbol,
        currency: inv.currency,
    };
}

export function getDemoSymbolSearchHits(query: string) {
    const q = query.trim().toUpperCase();
    const catalog = [
        { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', quoteType: 'EQUITY' },
        { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', quoteType: 'EQUITY' },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', quoteType: 'EQUITY' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', quoteType: 'EQUITY' },
        { symbol: 'TEVA', name: 'Teva Pharmaceutical', exchange: 'TLV', quoteType: 'EQUITY' },
        { symbol: 'NICE', name: 'NICE Ltd.', exchange: 'TLV', quoteType: 'EQUITY' },
    ];
    return catalog.filter(
        (h) => h.symbol.includes(q) || h.name.toUpperCase().includes(q)
    );
}
