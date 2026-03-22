export interface PostScrapeConfig {
    runCategorization: boolean;
    fraudDetection: {
        enabled: boolean;
        notifyOnIssue: boolean;
        /**
         * Which detector(s) to run:
         * - local: deterministic server-side scoring
         * - ai: existing Gemini-based analysis
         * - both: run local then AI (if configured)
         */
        mode?: 'local' | 'ai' | 'both';
        scope?: 'current' | 'all';
        /**
         * Local fraud detection configuration (used when mode is local/both).
         */
        local?: FraudDetectionLocalConfig;
    };
    customAI: {
        enabled: boolean;
        query: string;
        notifyOnResult: boolean;
        scope?: 'current' | 'all';
    };
    notificationChannels: string[];
    /**
     * When true (default), Telegram messages from a scrape run (scrape summary, post-scrape steps, spending digest)
     * are combined into one notification per run. Controlled from Scrape Settings → Post-Scrape Actions.
     * Per-request options still override when set by the Telegram bot or API.
     */
    aggregateTelegramNotifications?: boolean;
}

export type FraudSeverity = 'low' | 'medium' | 'high';
export type FraudDetectorType = 'local' | 'ai';

export interface FraudReason {
    code: string;           // Stable identifier for programmatic grouping
    message: string;        // Human-readable explanation
    points: number;         // Points contributed to the final score
    meta?: Record<string, unknown>;
}

export interface FraudFinding {
    id: string;             // Deterministic id (e.g. hash of txnId+detector+version)
    transactionId: string;
    detector: FraudDetectorType;
    score: number;          // 0..100
    severity: FraudSeverity;
    reasons: FraudReason[];
    createdAt: string;      // ISO timestamp
}

export interface FraudDetectionSummary {
    detector: FraudDetectorType;
    analyzedCount: number;
    flaggedCount: number;
    maxScore: number;
    topReasons: { code: string; count: number }[];
}

export interface FraudDetectionLocalRulesConfig {
    enableOutlierAmount?: boolean;
    enableNewMerchant?: boolean;
    enableRapidRepeats?: boolean;
    enableForeignCurrency?: boolean;
}

export interface FraudDetectionLocalThresholdsConfig {
    minAmountForNewMerchantIls?: number;     // Only flag "new" merchants above this amount
    foreignCurrencyMinOriginalAmount?: number;
    rapidRepeatWindowMinutes?: number;
    rapidRepeatCountThreshold?: number;      // # of repeats within window to flag
    outlierMinHistoryCount?: number;         // Need at least N historical points for outlier calc
    outlierZScore?: number;                  // Z-score threshold
    severityLowMinScore?: number;
    severityMediumMinScore?: number;
    severityHighMinScore?: number;
    notifyMinSeverity?: FraudSeverity;       // When notifyOnIssue is true
    persistOnlyFlagged?: boolean;
}

export interface FraudDetectionLocalConfig {
    rules?: FraudDetectionLocalRulesConfig;
    thresholds?: FraudDetectionLocalThresholdsConfig;
    /**
     * Version string for deterministic finding IDs; bump when scoring logic changes materially.
     */
    version?: string;
}

export type SubscriptionInterval = 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'annually';

export interface Subscription {
    description: string;
    amount: number;
    interval: SubscriptionInterval;
    nextExpectedDate: string;
    category?: string;
    isManual?: boolean;
    confidence: number;
    history?: Transaction[];
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
    type?: string; // e.g., 'normal', 'installment', 'installments' (scrapers vary)
    /** Present on CC installment rows (e.g. Isracard) */
    installments?: { number: number; total: number };
    category?: string; // AI assigned category
    provider: string; // e.g., 'hapoalim', 'isracard'
    accountNumber: string;
    txnType?: 'expense' | 'income' | 'internal_transfer' | 'normal'; // Classification for anti-double-counting
    isIgnored?: boolean; // Flag to exclude from calculations
    isInternalTransfer?: boolean; // Single source of truth for internal transfers
    isSubscription?: boolean;
    subscriptionInterval?: SubscriptionInterval;
    excludeFromSubscriptions?: boolean;
}

// Financial dashboard projection types
export interface FinancialSummary {
    month: string; // YYYY-MM
    expenses: {
        alreadySpent: number;        // Cleared bank txns + unbilled CC txns
        remainingPlanned: number;     // Upcoming fixed bills + remaining budgets
        totalProjected: number;
        variableForecast?: number;   // Statistical projection for remaining days
        /** Expense transactions counted this month (already spent) */
        expenseTxnCount?: number;
        /** Sum of per-category average monthly txn counts from baseline (≈ typical txns/month) */
        historicalAvgMonthlyTxnCount?: number;
        /** Pro-rated expected txns by today from historical monthly average */
        expectedTxnCountToDate?: number;
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
    subscriptions: Subscription[];
    recurringRealized: { income: number; bills: number };
    internalTransfers: { count: number; total: number; transactions: Transaction[] };
    safeToSpend?: number; // Current month: income received - expenses spent + expected income
    // New: Dynamic projection fields
    historicalBaseline?: HistoricalBaseline;
    budgetHealth?: BudgetHealth;
    anomalies?: AnomalyAlert[];
    remainingDays?: number;      // Days left in the month for forecasting
    /** Selected month is the calendar month containing "today" (affects forecasting copy) */
    isCurrentMonth?: boolean;
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
    forecastMethod?: 'historical_avg' | 'extrapolation' | 'transaction_count';
    /** For transaction_count method: expected txns/month from history */
    expectedMonthlyTxnCount?: number;
    /** For transaction_count method: expense txns in this category this month */
    currentMonthTxnCount?: number;
    /** For transaction_count method: average debit amount per txn from history */
    avgTxnValue?: number;
    /** For transaction_count method: effective txn count after time-of-month cap */
    forecastEffectiveTxnCount?: number;
}

// Historical baseline per category over the last N months
export interface CategoryBaseline {
    category: string;
    avgMonthly: number;       // Average monthly spend
    stdDev: number;           // Standard deviation
    avgDaily: number;         // Average daily spend (for variable forecasting)
    monthCount: number;       // Number of months with data
    isFixed: boolean;         // Low variance = fixed, high variance = variable
    expectedMonthlyTxnCount?: number; // Expected transaction count based on history
    /** Raw average monthly expense transaction count (preferred for pace vs rounded expectedMonthlyTxnCount) */
    avgMonthlyTxnCount?: number;
    avgTxnValue?: number;     // Average value of a single transaction
}

export interface HistoricalBaseline {
    categories: CategoryBaseline[];
    totalAvgMonthly: number;  // Sum of all category averages
    monthsAnalyzed: number;   // How many months of data were used
    /** Sum of per-category average monthly txn counts (≈ total expense txns per month) */
    totalAvgMonthlyTxnCount?: number;
}

export type BudgetHealthMessageKey =
    | 'pace_good'
    | 'pace_slightly_fast'
    | 'pace_much_faster'
    | 'projected_deficit';

export interface BudgetHealth {
    score: 'on_track' | 'caution' | 'at_risk';
    projectedSurplus: number; // Positive = surplus, negative = deficit
    velocityRatio: number;    // actual_pace / expected_pace (1.0 = on track)
    message: string;          // Human-readable status (English fallback)
    /** Stable key for UI / digest translation */
    messageKey?: BudgetHealthMessageKey;
}

/** Extra fields for translating anomaly alerts (dashboard + Telegram digest). */
export interface AnomalyAlertMeta {
    itemType?: 'bill' | 'income';
    recurringDescription?: string;
    /** ISO date string for expected recurring charge */
    expectedDateIso?: string;
}

export interface AnomalyAlert {
    id: string;
    type: 'velocity' | 'outlier' | 'missing_expected' | 'whale';
    category?: string;
    description: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    currentValue?: number;
    expectedValue?: number;
    meta?: AnomalyAlertMeta;
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
    suppressTelegramNotifications?: boolean;
    aggregateTelegramNotifications?: boolean;
    runSource?: 'telegram_bot' | 'scheduler' | 'manual';
    initiatedBy?: string;
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

/** How often the scheduler triggers (server uses cron + interval-day filter when needed). */
export type SchedulerScheduleType =
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'interval_days'
    | 'custom';

/** Shared schedule fields used by scrape and standalone backup jobs. */
export interface CronScheduleFields {
    scheduleType?: SchedulerScheduleType;
    /** 24h "HH:mm" in server local time; used when scheduleType is not custom */
    runTime?: string;
    /** 0=Sun … 6=Sat (matches Date.getDay); used when scheduleType === 'weekly' */
    weekdays?: number[];
    /** 1–31; used when scheduleType === 'monthly' */
    monthDays?: number[];
    /** Run every N calendar days from intervalAnchorDate; used when scheduleType === 'interval_days' */
    intervalDays?: number;
    /** YYYY-MM-DD; first day counted for interval_days */
    intervalAnchorDate?: string;
    /** Effective cron passed to node-cron (daily tick for interval_days) */
    cronExpression: string;
}

export interface SchedulerConfig extends CronScheduleFields {
    enabled: boolean;
    selectedProfiles: string[]; // List of profile IDs to run
    /** Independent of scrape schedule; uses the same frequency mechanism. */
    backupSchedule?: BackupScheduleConfig;
    lastRun?: string; // ISO timestamp (last scrape)
    nextRun?: string; // ISO timestamp
}

/** Backup job: same schedule knobs as scrape; runs only backup (no scrapes). */
export interface BackupScheduleConfig extends CronScheduleFields {
    enabled: boolean;
    destination: 'local' | 'google-drive';
    lastRun?: string; // ISO timestamp (last backup)
}

export const DEFAULT_BACKUP_SCHEDULE: BackupScheduleConfig = {
    enabled: false,
    destination: 'local',
    scheduleType: 'daily',
    runTime: '09:00',
    cronExpression: '0 9 * * *'
};

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
    enabled: false,
    scheduleType: 'daily',
    runTime: '08:00',
    cronExpression: '0 8 * * *', // Default: Daily at 8:00 AM
    selectedProfiles: [],
    backupSchedule: { ...DEFAULT_BACKUP_SCHEDULE }
};
