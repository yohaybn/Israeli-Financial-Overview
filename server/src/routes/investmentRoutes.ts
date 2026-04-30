import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DbService } from '../services/dbService.js';
import {
    computeLivePortfolioForUser,
    recordPortfolioSnapshotNow,
} from '../services/investmentPortfolioService.js';
import { searchInvestmentSymbols } from '../services/investmentSymbolSearch.js';
import { reloadPortfolioSnapshotSchedule } from '../services/portfolioSnapshotScheduler.js';
import {
    ALLOWED_INVESTMENT_CURRENCIES,
    DEFAULT_INVESTMENT_USER_ID,
} from '../constants/investments.js';
import {
    getMarketDataProviderMode,
    invalidateInvestmentMarketSettingsCache,
    isInvestmentsFeatureEnabled,
} from '../constants/marketData.js';
import { parseEodhdQuoteMode } from '../constants/eodhdQuote.js';
import { buildInvestmentPriceHistory } from '../services/investmentPriceHistoryService.js';
import { buildPortfolioEodValueHistory } from '../services/portfolioEodValueHistoryService.js';

const router = Router();
const db = new DbService();

router.use((req, res, next) => {
    if (req.path === '/app-settings' && (req.method === 'GET' || req.method === 'PATCH')) {
        return next();
    }
    if (!isInvestmentsFeatureEnabled()) {
        return res.status(403).json({ success: false, error: 'investments_disabled' });
    }
    next();
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SYMBOL_RE = /^[A-Za-z0-9.\-]{1,24}$/;
const NICKNAME_MAX = 120;

function nicknameFromBody(body: Record<string, unknown>): string | null | undefined | 'invalid_nickname' {
    if (!Object.prototype.hasOwnProperty.call(body, 'nickname')) return undefined;
    const raw = body.nickname;
    if (raw === null) return null;
    const s = String(raw ?? '').trim();
    if (!s) return null;
    if (s.length > NICKNAME_MAX) return 'invalid_nickname';
    return s;
}

function todayInTimezone(timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function normalizeCurrency(c: string): string | null {
    const u = String(c || '')
        .trim()
        .toUpperCase();
    return (ALLOWED_INVESTMENT_CURRENCIES as readonly string[]).includes(u) ? u : null;
}

function investmentAppSettingsPayload() {
    const settings = db.getInvestmentAppSettings(DEFAULT_INVESTMENT_USER_ID);
    const eodhdApiTokenFromEnv = Boolean(String(process.env.EODHD_API_TOKEN || '').trim());
    return {
        featureEnabled: settings.featureEnabled,
        eodhdApiTokenConfigured: Boolean(settings.eodhdApiToken?.trim()),
        eodhdApiTokenFromEnv,
        marketDataProvider: getMarketDataProviderMode(),
        eodhdQuoteMode: parseEodhdQuoteMode(settings.eodhdQuoteMode),
        portfolioHistoricUsdIls: settings.portfolioHistoricUsdIls,
    };
}

router.get('/app-settings', (_req, res) => {
    try {
        res.json({ success: true, data: investmentAppSettingsPayload() });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.patch('/app-settings', (req, res) => {
    try {
        const cur = db.getInvestmentAppSettings(DEFAULT_INVESTMENT_USER_ID);
        const body = req.body ?? {};
        let featureEnabled = cur.featureEnabled;
        if (body.feature_enabled !== undefined) featureEnabled = Boolean(body.feature_enabled);
        if (body.featureEnabled !== undefined) featureEnabled = Boolean(body.featureEnabled);

        let nextToken: string | null = cur.eodhdApiToken;
        if (body.clear_eodhd_api_token === true || body.clearEodhdApiToken === true) {
            nextToken = null;
        } else if (typeof body.eodhd_api_token === 'string' && body.eodhd_api_token.trim() !== '') {
            nextToken = body.eodhd_api_token.trim();
        } else if (typeof body.eodhdApiToken === 'string' && body.eodhdApiToken.trim() !== '') {
            nextToken = body.eodhdApiToken.trim();
        }

        let eodhdQuoteMode = parseEodhdQuoteMode(cur.eodhdQuoteMode);
        if (typeof body.eodhd_quote_mode === 'string') eodhdQuoteMode = parseEodhdQuoteMode(body.eodhd_quote_mode);
        if (typeof body.eodhdQuoteMode === 'string') eodhdQuoteMode = parseEodhdQuoteMode(body.eodhdQuoteMode);

        let portfolioHistoricUsdIls = cur.portfolioHistoricUsdIls;
        if (body.portfolio_historic_usd_ils !== undefined) {
            portfolioHistoricUsdIls = Boolean(body.portfolio_historic_usd_ils);
        }
        if (body.portfolioHistoricUsdIls !== undefined) {
            portfolioHistoricUsdIls = Boolean(body.portfolioHistoricUsdIls);
        }

        db.upsertInvestmentAppSettings({
            userId: DEFAULT_INVESTMENT_USER_ID,
            featureEnabled,
            eodhdApiToken: nextToken,
            eodhdQuoteMode,
            portfolioHistoricUsdIls,
        });
        invalidateInvestmentMarketSettingsCache();
        reloadPortfolioSnapshotSchedule();
        res.json({ success: true, data: investmentAppSettingsPayload() });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.get('/', (_req, res) => {
    try {
        const data = db.listInvestments(DEFAULT_INVESTMENT_USER_ID);
        res.json({ success: true, data });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

/** Symbol lookup for picking tickers (EODHD first when configured, then Yahoo). */
router.get('/symbol-search', async (req, res) => {
    try {
        const raw = String(req.query.q ?? '').trim();
        if (raw.length < 1 || raw.length > 64) {
            return res.status(400).json({ success: false, error: 'invalid_query' });
        }
        const hits = await searchInvestmentSymbols(raw);
        res.json({ success: true, data: { query: raw, hits } });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post('/', (req, res) => {
    try {
        const body = req.body ?? {};
        const symbol = String(body.symbol ?? '')
            .trim()
            .toUpperCase();
        const quantity = Number(body.quantity);
        const purchasePricePerUnit = Number(body.purchase_price_per_unit ?? body.purchasePricePerUnit);
        const currency = normalizeCurrency(String(body.currency ?? ''));
        const trackFromDate = String(body.track_from_date ?? body.trackFromDate ?? '').trim();
        const useTelAvivBody =
            body.use_tel_aviv_listing !== undefined
                ? Boolean(body.use_tel_aviv_listing)
                : body.useTelAvivListing !== undefined
                  ? Boolean(body.useTelAvivListing)
                  : undefined;
        const valueInAgorotBody = body.value_in_agorot ?? body.valueInAgorot;
        const valueInAgorotWants = valueInAgorotBody !== undefined ? Boolean(valueInAgorotBody) : false;

        if (!SYMBOL_RE.test(symbol)) {
            return res.status(400).json({ success: false, error: 'invalid_symbol' });
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ success: false, error: 'invalid_quantity' });
        }
        if (!Number.isFinite(purchasePricePerUnit) || purchasePricePerUnit < 0) {
            return res.status(400).json({ success: false, error: 'invalid_purchase_price_per_unit' });
        }
        if (!currency) {
            return res.status(400).json({ success: false, error: 'invalid_currency', allowed: ALLOWED_INVESTMENT_CURRENCIES });
        }
        if (!ISO_DATE.test(trackFromDate)) {
            return res.status(400).json({ success: false, error: 'invalid_track_from_date' });
        }
        if (valueInAgorotWants && currency !== 'ILS') {
            return res.status(400).json({ success: false, error: 'value_in_agorot_requires_ils' });
        }

        const nickParsed = nicknameFromBody(body as Record<string, unknown>);
        if (nickParsed === 'invalid_nickname') {
            return res.status(400).json({ success: false, error: 'invalid_nickname', max: NICKNAME_MAX });
        }

        const id = uuidv4();
        db.insertInvestment({
            id,
            userId: DEFAULT_INVESTMENT_USER_ID,
            symbol,
            quantity,
            purchasePricePerUnit,
            currency,
            trackFromDate,
            useTelAvivListing: useTelAvivBody !== undefined ? useTelAvivBody : currency === 'ILS',
            valueInAgorot: valueInAgorotBody !== undefined ? valueInAgorotWants && currency === 'ILS' : false,
            ...(nickParsed !== undefined ? { nickname: nickParsed } : {}),
        });
        const created = db.getInvestment(id);
        res.json({ success: true, data: created });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.patch('/:id', (req, res) => {
    try {
        const id = req.params.id;
        const existing = db.getInvestment(id);
        if (!existing || existing.userId !== DEFAULT_INVESTMENT_USER_ID) {
            return res.status(404).json({ success: false, error: 'not_found' });
        }
        const body = req.body ?? {};
        const patch: {
            symbol?: string;
            nickname?: string | null;
            quantity?: number;
            purchasePricePerUnit?: number;
            currency?: string;
            trackFromDate?: string;
            useTelAvivListing?: boolean;
            valueInAgorot?: boolean;
        } = {};
        const nickParsed = nicknameFromBody(body as Record<string, unknown>);
        if (nickParsed === 'invalid_nickname') {
            return res.status(400).json({ success: false, error: 'invalid_nickname', max: NICKNAME_MAX });
        }
        if (nickParsed !== undefined) {
            patch.nickname = nickParsed;
        }
        if (body.symbol !== undefined) {
            const symbol = String(body.symbol).trim().toUpperCase();
            if (!SYMBOL_RE.test(symbol)) {
                return res.status(400).json({ success: false, error: 'invalid_symbol' });
            }
            patch.symbol = symbol;
        }
        if (body.quantity !== undefined) {
            const quantity = Number(body.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0) {
                return res.status(400).json({ success: false, error: 'invalid_quantity' });
            }
            patch.quantity = quantity;
        }
        if (body.purchase_price_per_unit !== undefined || body.purchasePricePerUnit !== undefined) {
            const p = Number(body.purchase_price_per_unit ?? body.purchasePricePerUnit);
            if (!Number.isFinite(p) || p < 0) {
                return res.status(400).json({ success: false, error: 'invalid_purchase_price_per_unit' });
            }
            patch.purchasePricePerUnit = p;
        }
        if (body.currency !== undefined) {
            const currency = normalizeCurrency(String(body.currency));
            if (!currency) {
                return res.status(400).json({ success: false, error: 'invalid_currency' });
            }
            patch.currency = currency;
        }
        if (body.track_from_date !== undefined || body.trackFromDate !== undefined) {
            const trackFromDate = String(body.track_from_date ?? body.trackFromDate).trim();
            if (!ISO_DATE.test(trackFromDate)) {
                return res.status(400).json({ success: false, error: 'invalid_track_from_date' });
            }
            patch.trackFromDate = trackFromDate;
        }
        if (body.use_tel_aviv_listing !== undefined || body.useTelAvivListing !== undefined) {
            patch.useTelAvivListing = Boolean(body.use_tel_aviv_listing ?? body.useTelAvivListing);
        } else if (patch.currency !== undefined) {
            patch.useTelAvivListing = patch.currency === 'ILS';
        }

        let nextCurrency = existing.currency.toUpperCase();
        if (patch.currency !== undefined) nextCurrency = patch.currency;
        if (body.value_in_agorot !== undefined || body.valueInAgorot !== undefined) {
            const want = Boolean(body.value_in_agorot ?? body.valueInAgorot);
            if (want && nextCurrency !== 'ILS') {
                return res.status(400).json({ success: false, error: 'value_in_agorot_requires_ils' });
            }
            patch.valueInAgorot = want && nextCurrency === 'ILS';
        }
        if (patch.currency !== undefined && patch.currency !== 'ILS') {
            patch.valueInAgorot = false;
        }

        const updated = db.updateInvestment(id, patch);
        if (!updated) {
            return res.status(400).json({ success: false, error: 'nothing_to_update' });
        }
        res.json({ success: true, data: db.getInvestment(id) });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const existing = db.getInvestment(req.params.id);
        if (!existing || existing.userId !== DEFAULT_INVESTMENT_USER_ID) {
            return res.status(404).json({ success: false, error: 'not_found' });
        }
        db.deleteInvestment(req.params.id);
        res.json({ success: true });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.get('/summary', async (_req, res) => {
    try {
        const data = await computeLivePortfolioForUser(db, DEFAULT_INVESTMENT_USER_ID);
        res.json({ success: true, data });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.get('/history', (req, res) => {
    try {
        const fromDate = req.query.from ? String(req.query.from) : undefined;
        const toDate = req.query.to ? String(req.query.to) : undefined;
        if (fromDate && !ISO_DATE.test(fromDate)) {
            return res.status(400).json({ success: false, error: 'invalid_from' });
        }
        if (toDate && !ISO_DATE.test(toDate)) {
            return res.status(400).json({ success: false, error: 'invalid_to' });
        }
        const data = db.listPortfolioHistory(DEFAULT_INVESTMENT_USER_ID, { fromDate, toDate });
        res.json({ success: true, data });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.delete('/history', (_req, res) => {
    try {
        const deleted = db.deleteAllPortfolioHistory(DEFAULT_INVESTMENT_USER_ID);
        res.json({ success: true, data: { deleted } });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.get('/value-history', async (req, res) => {
    try {
        const fromDate = req.query.from ? String(req.query.from) : undefined;
        const toDate = req.query.to ? String(req.query.to) : undefined;
        if (fromDate && !ISO_DATE.test(fromDate)) {
            return res.status(400).json({ success: false, error: 'invalid_from' });
        }
        if (toDate && !ISO_DATE.test(toDate)) {
            return res.status(400).json({ success: false, error: 'invalid_to' });
        }
        const historic = db.getInvestmentAppSettings(DEFAULT_INVESTMENT_USER_ID).portfolioHistoricUsdIls;
        const result = await buildPortfolioEodValueHistory(db, DEFAULT_INVESTMENT_USER_ID, {
            fromDate,
            toDate,
            historicUsdIls: historic,
        });
        if (!result.ok) {
            if (result.error === 'no_positions') {
                return res.json({
                    success: true,
                    data: { points: [], partial: false, fxMode: historic ? 'historic' : 'spot' },
                });
            }
            return res.status(503).json({ success: false, error: result.error });
        }
        res.json({
            success: true,
            data: {
                points: result.points,
                partial: result.partial,
                fxMode: result.fxMode,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.get('/:id/price-history', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await buildInvestmentPriceHistory(db, DEFAULT_INVESTMENT_USER_ID, id);
        if (!result.ok) {
            const status =
                result.error === 'not_found'
                    ? 404
                    : result.error === 'eodhd_token_required'
                      ? 503
                      : result.error === 'invalid_buy_date'
                        ? 400
                        : 502;
            return res.status(status).json({
                success: false,
                error: result.error,
                ...(result.detail ? { detail: result.detail } : {}),
            });
        }
        res.json({
            success: true,
            data: {
                points: result.points,
                resolvedSymbol: result.resolvedSymbol,
                currency: result.currency,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.get('/snapshot-settings', (_req, res) => {
    try {
        const data = db.getPortfolioSnapshotSettings(DEFAULT_INVESTMENT_USER_ID);
        res.json({ success: true, data });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.patch('/snapshot-settings', (req, res) => {
    try {
        const body = req.body ?? {};
        const current = db.getPortfolioSnapshotSettings(DEFAULT_INVESTMENT_USER_ID);
        const runTime = body.run_time != null ? String(body.run_time).trim() : current.runTime;
        const timezone = body.timezone != null ? String(body.timezone).trim() : current.timezone;
        const enabled = body.enabled !== undefined ? Boolean(body.enabled) : current.enabled;

        if (!/^(\d{1,2}):(\d{2})$/.test(runTime)) {
            return res.status(400).json({ success: false, error: 'invalid_run_time' });
        }
        if (timezone.length < 3 || timezone.length > 60) {
            return res.status(400).json({ success: false, error: 'invalid_timezone' });
        }

        db.upsertPortfolioSnapshotSettings({
            userId: DEFAULT_INVESTMENT_USER_ID,
            runTime,
            timezone,
            enabled,
        });
        reloadPortfolioSnapshotSchedule();
        res.json({ success: true, data: db.getPortfolioSnapshotSettings(DEFAULT_INVESTMENT_USER_ID) });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post('/snapshot', async (req, res) => {
    try {
        const body = req.body ?? {};
        const st = db.getPortfolioSnapshotSettings(DEFAULT_INVESTMENT_USER_ID);
        const snapshotDate =
            body.snapshot_date && ISO_DATE.test(String(body.snapshot_date))
                ? String(body.snapshot_date)
                : todayInTimezone(st.timezone);
        const result = await recordPortfolioSnapshotNow(db, DEFAULT_INVESTMENT_USER_ID, snapshotDate);
        if (!result.ok) {
            return res.status(409).json({ success: false, error: result.reason ?? 'snapshot_failed' });
        }
        res.json({ success: true, data: { snapshotDate } });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

export const investmentRoutes = router;
