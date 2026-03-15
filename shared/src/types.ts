export interface PostScrapeConfig {
    runCategorization: boolean;
    fraudDetection: {
        enabled: boolean;
        notifyOnIssue: boolean;
        scope?: 'current' | 'all';
    };
    customAI: {
        enabled: boolean;
        query: string;
        notifyOnResult: boolean;
        scope?: 'current' | 'all';
    };
    notificationChannels: string[];
}

export interface GlobalScrapeConfig {
    scraperOptions: Partial<ScraperOptions>;
    postScrapeConfig: PostScrapeConfig;
    useSmartStartDate: boolean;
}

export interface Transaction {
    id: string; // Unique identifier (hash or bank provided)
    date: string; // ISO Date string
    processedDate: string; // ISO Date string
    description: string;
    memo?: string;
    amount: number; // Charged amount in ILS
    originalAmount: number; // Amount in original currency
    originalCurrency: string; // Currency code
    chargedAmount: number; // Amount charged (usually same as amount)
    chargedCurrency?: string; // Currency of the charge
    status: 'completed' | 'pending' | 'ignored';
    type?: string; // e.g., 'normal', 'installment'
    category?: string; // AI assigned category
    provider: string; // e.g., 'hapoalim', 'isracard'
    accountNumber: string;
    txnType?: 'expense' | 'income' | 'internal_transfer' | 'normal'; // Classification for anti-double-counting
    isIgnored?: boolean; // Flag to exclude from calculations
}

// Financial dashboard projection types
export interface FinancialSummary {
    month: string; // YYYY-MM
    expenses: {
        alreadySpent: number;        // Cleared bank txns + unbilled CC txns
        remainingPlanned: number;     // Upcoming fixed bills + remaining budgets
        totalProjected: number;
        variableForecast?: number;   // Statistical projection for remaining days
        byCategory: CategoryBudgetItem[];
        alreadySpentTxns?: Transaction[]; // The underlying transactions
        remainingPlannedTxns?: Transaction[]; // The underlying transactions (partially virtual)
    };
    income: {
        alreadyReceived: number;
        expectedInflow: number;
        totalProjected: number;
        alreadyReceivedTxns?: Transaction[]; // The underlying transactions
        expectedInflowTxns?: Transaction[]; // The underlying transactions (mostly virtual)
    };
    upcomingFixed: UpcomingItem[];
    recurringRealized: { income: number; bills: number };
    internalTransfers: { count: number; total: number; transactions: Transaction[] };
    safeToSpend?: number; // Current month: income received - expenses spent + expected income
    // New: Dynamic projection fields
    historicalBaseline?: HistoricalBaseline;
    budgetHealth?: BudgetHealth;
    anomalies?: AnomalyAlert[];
    remainingDays?: number;      // Days left in the month for forecasting
}

export interface UpcomingItem {
    description: string;
    amount: number;
    expectedDate: string;    // ISO date of expected occurrence
    type: 'bill' | 'income';
    category?: string;       // Assigned category
    isRecurring: boolean;
    confidence: number;      // 0-1 detection confidence
    history?: Transaction[]; // List of previous occurrences
}

// Category budget item with historical comparison
export interface CategoryBudgetItem {
    name: string;
    spent: number;
    projected: number;        // Forecasted total for this category this month
    historicalAvg?: number;   // Average monthly spend from last 6 months
    historicalStdDev?: number; // Standard deviation of monthly spend
    transactions?: Transaction[]; // The underlying transactions for the current month
    upcomingBillsAmount?: number;
    variableForecastAmount?: number;
    forecastRate?: number;       // Daily rate used for forecast
    forecastMethod?: 'historical_avg' | 'extrapolation';
}

// Historical baseline per category over the last N months
export interface CategoryBaseline {
    category: string;
    avgMonthly: number;       // Average monthly spend
    stdDev: number;           // Standard deviation
    avgDaily: number;         // Average daily spend (for variable forecasting)
    monthCount: number;       // Number of months with data
    isFixed: boolean;         // Low variance = fixed, high variance = variable
}

export interface HistoricalBaseline {
    categories: CategoryBaseline[];
    totalAvgMonthly: number;  // Sum of all category averages
    monthsAnalyzed: number;   // How many months of data were used
}

export interface BudgetHealth {
    score: 'on_track' | 'caution' | 'at_risk';
    projectedSurplus: number; // Positive = surplus, negative = deficit
    velocityRatio: number;    // actual_pace / expected_pace (1.0 = on track)
    message: string;          // Human-readable status
}

export interface AnomalyAlert {
    id: string;
    type: 'velocity' | 'outlier' | 'missing_expected';
    category?: string;
    description: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    currentValue?: number;
    expectedValue?: number;
}

export interface DashboardConfig {
    ccPaymentDate: number; // Day of month (1-31) when CC bill is debited
    forecastMonths: number; // How many months of history to use for forecasting (3, 6, or 12)
    customCCKeywords: string[]; // User-defined CC payment description keywords
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
    ccPaymentDate: 2, // Default: 2nd of the month
    forecastMonths: 6,
    customCCKeywords: [],
};

export interface Account {
    accountNumber: string;
    provider: string;
    balance?: number;
    currency?: string;
}

export interface ScrapeResult {
    success: boolean;
    accounts?: Account[];
    transactions?: Transaction[];
    error?: string;
    logs?: string[];
    executionTimeMs?: number;
    lastSync?: {
        timestamp: string;
        spreadsheetId: string;
        spreadsheetName?: string;
        status: 'success' | 'failed';
        error?: string;
    };
}

export interface ScraperConfig {
    startDate: string; // ISO Date string
    showBrowser?: boolean; // For debugging
    importers: ImporterConfig[];
    timeoutMs?: number;
}

export interface ImporterConfig {
    id: string; // Internal ID for this config entry
    companyId: string; // 'hapoalim', 'leumi', etc.
    credentials: Record<string, string>; // userCode, password, etc. (Encrypted in storage?)
}

// API Response Wrappers
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface CategoryRule {
    id: string;
    pattern: string; // Regex or text match
    category: string;
}

// Full scraper options exposed to the UI
export interface ScraperOptions {
    startDate?: string; // ISO Date string (Optional, library default will be used)
    showBrowser?: boolean;
    verbose?: boolean;
    timeout?: number; // in milliseconds
    combineInstallments?: boolean;
    futureMonthsToScrape?: number;
    autoCategorize?: boolean;
    ignorePendingTransactions?: boolean;
    args?: string[]; // Additional browser args
    additionalTransactionInformation?: boolean;
    includeRawTransaction?: boolean;
    navigationRetryCount?: number;
    optInFeatures?: string[];
}

// Provider-specific credential field definitions
export interface CredentialField {
    name: string;
    label: string;
    labelHe?: string;
    type: 'text' | 'password' | 'number';
    required: boolean;
    placeholder?: string;
    placeholderHe?: string;
}

export interface ProviderDefinition {
    id: string;
    name: string;
    nameHe?: string;
    credentialFields: CredentialField[];
}

// Saved profile for quick re-use
export interface Profile {
    id: string;
    name: string;
    companyId: string;
    credentials: Record<string, string>;
    options: Partial<ScraperOptions>;
    createdAt: string;
    updatedAt: string;
}

// Scrape request payload
export interface ScrapeRequest {
    companyId: string;
    credentials: Record<string, string>;
    options: ScraperOptions;
    profileId?: string;   // Profile ID that triggered this scrape
    profileName?: string; // Human-readable profile name for display in notifications
}

export interface SchedulerConfig {
    enabled: boolean;
    cronExpression: string; // e.g., '0 8 * * *' for daily at 8am
    selectedProfiles: string[]; // List of profile IDs to run
    lastRun?: string; // ISO timestamp
    nextRun?: string; // ISO timestamp
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
    enabled: false,
    cronExpression: '0 8 * * *', // Default: Daily at 8:00 AM
    selectedProfiles: []
};
