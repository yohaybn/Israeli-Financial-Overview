import { DbService } from '../services/dbService.js';
import { DEFAULT_INVESTMENT_USER_ID } from './investments.js';

export type MarketDataProviderMode = 'yahoo' | 'eodhd_then_yahoo';

const CACHE_MS = 30_000;

type StringCache = { value: string | null; at: number };
type BoolCache = { value: boolean; at: number };

let eodTokenCache: StringCache | null = null;
let featureEnabledCache: BoolCache | null = null;

/** Call after updating `investment_app_settings` so env/DB-backed reads refresh. */
export function invalidateInvestmentMarketSettingsCache(): void {
    eodTokenCache = null;
    featureEnabledCache = null;
}

/**
 * Portfolio, snapshots, symbol search, and transaction-linked investments respect this flag.
 * Default is enabled (including when the settings row is missing).
 */
export function isInvestmentsFeatureEnabled(): boolean {
    const t = Date.now();
    if (featureEnabledCache && t - featureEnabledCache.at < CACHE_MS) {
        return featureEnabledCache.value;
    }
    try {
        const db = new DbService();
        const v = db.getInvestmentAppSettings(DEFAULT_INVESTMENT_USER_ID).featureEnabled;
        featureEnabledCache = { value: v, at: t };
        return v;
    } catch {
        return true;
    }
}

/**
 * `MARKET_DATA_PROVIDER`: `yahoo` | `eodhd_then_yahoo` (default when an EODHD token exists from env or DB).
 */
export function getMarketDataProviderMode(): MarketDataProviderMode {
    const raw = String(process.env.MARKET_DATA_PROVIDER || '').trim().toLowerCase();
    if (raw === 'yahoo') return 'yahoo';
    if (raw === 'eodhd_then_yahoo') return 'eodhd_then_yahoo';
    return getEodhdApiToken() ? 'eodhd_then_yahoo' : 'yahoo';
}

/**
 * Server `EODHD_API_TOKEN` overrides the value stored in the database.
 */
export function getEodhdApiToken(): string | null {
    const env = String(process.env.EODHD_API_TOKEN || '').trim();
    if (env) return env;
    const t = Date.now();
    if (eodTokenCache && t - eodTokenCache.at < CACHE_MS) {
        return eodTokenCache.value;
    }
    try {
        const db = new DbService();
        const v = db.getInvestmentAppSettings(DEFAULT_INVESTMENT_USER_ID).eodhdApiToken?.trim() || null;
        eodTokenCache = { value: v, at: t };
        return v;
    } catch {
        return null;
    }
}

export function useEodhdPrimaryQuotes(): boolean {
    return getMarketDataProviderMode() === 'eodhd_then_yahoo' && getEodhdApiToken() != null;
}
