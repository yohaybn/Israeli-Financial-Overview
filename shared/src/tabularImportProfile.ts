/**
 * Versioned JSON profile for mapping spreadsheet columns to transactions.
 * Safe to share (no account data) — describes layout only.
 */

export const TABULAR_IMPORT_PROFILE_FORMAT = 'tabular-import-profile' as const;
export const TABULAR_IMPORT_PROFILE_VERSION = 1 as const;

/** Default first-column markers for Hebrew card statement exports (footer / future section). */
export const DEFAULT_LEDGER_FOOTER_STOP_MARKERS = [
    'עסקאות בחיוב עתידי',
    'סה"כ לחיוב החודש',
    'סה״כ לחיוב החודש',
] as const;

/** @deprecated use DEFAULT_LEDGER_FOOTER_STOP_MARKERS */
export const DEFAULT_ISRACARD_LEDGER_STOP_MARKERS = DEFAULT_LEDGER_FOOTER_STOP_MARKERS;

/** Reference a column by 0-based index or by header substring match on the header row. */
export type ColumnRef =
    | { kind: 'index'; index: number }
    | { kind: 'header'; match: string; exact?: boolean };

export type TabularDateFormat =
    | 'dmy_slash'
    | 'dmy_dot'
    | 'mdy_slash'
    | 'ymd_dash'
    | 'excel_serial'
    | 'iso';

/** How to interpret amount when using separate credit/debit columns. */
export type TabularAmountMode = 'single' | 'credit_debit';

/** After parsing a row, optionally restrict which signed amounts are imported (uses primary `amount` sign). */
export type TabularAmountPolarityFilter = 'all' | 'expense_only' | 'income_only';

/**
 * Optional spreadsheet columns → Transaction fields (everything not covered by required column mapping).
 * Used by `optionalFieldMappings`. Legacy `extraDetails` + `extraDetailsTargetField` uses the same field names.
 */
export const TABULAR_MAPPABLE_TXN_FIELDS = [
    'memo',
    'externalId',
    'voucherNumber',
    'category',
    'type',
    'txnType',
    'processedDate',
    'status',
] as const;

export type TabularMappableTxnField = (typeof TABULAR_MAPPABLE_TXN_FIELDS)[number];

export interface TabularFieldMapping {
    field: TabularMappableTxnField;
    column: ColumnRef;
}

export interface TabularImportProfileV1 {
    format: typeof TABULAR_IMPORT_PROFILE_FORMAT;
    version: typeof TABULAR_IMPORT_PROFILE_VERSION;
    /** Optional stable id for sharing / debugging */
    id?: string;
    /** Human-readable name */
    name?: string;
    /**
     * If set, only these sheet names are parsed. If omitted or empty, all sheets use this profile.
     */
    sheetNames?: string[];
    /** 0-based index of the header row */
    headerRowIndex: number;
    /**
     * Column mapping. Two styles:
     * - **Simple:** `amount` (single) or `credit`+`debit`, plus `date`, `description`.
     * - **Ledger:** `chargedAmount` and `originalAmount` required; `chargedCurrency` and `originalCurrency`
     *   optional (see {@link TabularImportProfileV1.currency} for defaults). Legacy `extraDetails` optional.
     *   Map any other column via `optionalFieldMappings`.
     */
    columns: {
        date: ColumnRef;
        description: ColumnRef;
        /** Simple: one signed or absolute amount column */
        amount?: ColumnRef;
        credit?: ColumnRef;
        debit?: ColumnRef;
        /** Ledger: transaction amount in original currency */
        originalAmount?: ColumnRef;
        /** Ledger: original currency symbol/code */
        originalCurrency?: ColumnRef;
        /** Ledger: charged amount in ILS (canonical ledger) */
        chargedAmount?: ColumnRef;
        /** Ledger: charge currency column (optional; default {@link TabularImportProfileV1.currency} or ILS) */
        chargedCurrency?: ColumnRef;
        /** @deprecated Prefer `optionalFieldMappings`. Legacy optional column (see `extraDetailsTargetField`). */
        extraDetails?: ColumnRef;
        category?: ColumnRef;
    };
    /**
     * When `columns.extraDetails` is set, which Transaction field receives that cell (same names as `optionalFieldMappings`).
     * If omitted with `extraDetails` present, legacy behavior writes the cell to `memo`.
     */
    extraDetailsTargetField?: TabularMappableTxnField;
    dateFormat?: TabularDateFormat;
    amountMode?: TabularAmountMode;
    /** Map additional columns to transaction fields (see `TABULAR_MAPPABLE_TXN_FIELDS`). */
    optionalFieldMappings?: TabularFieldMapping[];
    /**
     * When true, merge `DEFAULT_LEDGER_FOOTER_STOP_MARKERS` (unless `stopWhenFirstColumnIncludes` is set).
     */
    defaultLedgerFooterStops?: boolean;
    /**
     * Stop importing when the first cell of a row contains any of these substrings (e.g. footer / future section).
     */
    stopWhenFirstColumnIncludes?: string[];
    /** Provider id stored on each transaction (default: imported) */
    provider?: string;
    /**
     * Default ISO currency when a currency cell is empty, or when the ledger `chargedCurrency` column
     * is omitted from the profile (default: ILS).
     */
    currency?: string;
    /** Skip this many data rows immediately after the header row */
    skipDataRows?: number;
    /**
     * When `true`, multiply parsed `amount`, `chargedAmount`, and `originalAmount` by -1. When omitted or `false`,
     * amounts are unchanged after parsing (no `abs`, no other sign rules). Ledger and simple mode behave the same.
     */
    negateParsedAmounts?: boolean;
    /**
     * Drop rows after sign normalization (including {@link negateParsedAmounts}).
     * `expense_only` keeps negative amounts; `income_only` keeps positive amounts.
     */
    tabularAmountPolarityFilter?: TabularAmountPolarityFilter;
}

export type TabularImportProfile = TabularImportProfileV1;

export function isTabularImportProfile(data: unknown): data is TabularImportProfileV1 {
    if (!data || typeof data !== 'object') return false;
    const o = data as Record<string, unknown>;
    if (o.format !== TABULAR_IMPORT_PROFILE_FORMAT) return false;
    if (o.version !== TABULAR_IMPORT_PROFILE_VERSION) return false;
    if (typeof o.headerRowIndex !== 'number' || o.headerRowIndex < 0) return false;
    if (!o.columns || typeof o.columns !== 'object') return false;
    const cols = o.columns as Record<string, unknown>;
    if (!isColumnRef(cols.date) || !isColumnRef(cols.description)) return false;
    return true;
}

function isColumnRef(v: unknown): v is ColumnRef {
    if (!v || typeof v !== 'object') return false;
    const c = v as Record<string, unknown>;
    if (c.kind === 'index') return typeof c.index === 'number' && c.index >= 0;
    if (c.kind === 'header') return typeof c.match === 'string' && c.match.length > 0;
    return false;
}

/** True when profile uses ledger columns (charged + original amounts). */
export function isLedgerStyleColumns(columns: TabularImportProfileV1['columns']): boolean {
    return columns.chargedAmount != null;
}

function isTabularMappableTxnField(value: unknown): value is TabularMappableTxnField {
    return typeof value === 'string' && (TABULAR_MAPPABLE_TXN_FIELDS as readonly string[]).includes(value);
}

function validateOptionalFieldMappings(mappings: unknown): void {
    if (mappings === undefined) return;
    if (!Array.isArray(mappings)) {
        throw new Error('optionalFieldMappings must be an array');
    }
    for (const m of mappings) {
        if (!m || typeof m !== 'object') throw new Error('optionalFieldMappings: invalid entry');
        const o = m as Record<string, unknown>;
        if (!isTabularMappableTxnField(o.field)) throw new Error(`optionalFieldMappings: unknown field "${o.field}"`);
        if (!isColumnRef(o.column)) throw new Error('optionalFieldMappings: invalid column ref');
    }
}

function validateExtraDetailsTargetField(parsed: TabularImportProfileV1): void {
    const f = parsed.extraDetailsTargetField;
    if (f === undefined) return;
    if (!isTabularMappableTxnField(f)) {
        throw new Error(`extraDetailsTargetField: invalid value "${String(f)}"`);
    }
}

/** Parse and validate JSON text; throws with a short message on failure. */
const TABULAR_POLARITY_VALUES: TabularAmountPolarityFilter[] = ['all', 'expense_only', 'income_only'];

export function parseTabularImportProfileJson(jsonText: string): TabularImportProfileV1 {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error('Invalid JSON');
    }
    if (!isTabularImportProfile(parsed)) {
        throw new Error('Not a valid tabular import format (format/version/columns)');
    }
    const { columns } = parsed;
    if (isLedgerStyleColumns(columns)) {
        if (!columns.originalAmount || !columns.chargedAmount) {
            throw new Error('Ledger profile requires columns.originalAmount and chargedAmount');
        }
        validateOptionalFieldMappings(parsed.optionalFieldMappings);
        validateExtraDetailsTargetField(parsed);
        normalizeTabularProfileRuntimeFields(parsed);
        return parsed;
    }
    const mode = parsed.amountMode ?? 'single';
    if (mode === 'single' && !columns.amount) {
        throw new Error('Profile must include columns.amount when amountMode is single');
    }
    if (mode === 'credit_debit' && (!columns.credit || !columns.debit)) {
        throw new Error('Profile must include columns.credit and columns.debit when amountMode is credit_debit');
    }
    validateOptionalFieldMappings(parsed.optionalFieldMappings);
    validateExtraDetailsTargetField(parsed);
    normalizeTabularProfileRuntimeFields(parsed);
    return parsed;
}

/** Coerce fields that may arrive as strings from HTTP form bodies. */
function normalizeTabularProfileRuntimeFields(profile: TabularImportProfileV1): void {
    const n = profile as unknown as Record<string, unknown>;
    const neg = n.negateParsedAmounts;
    if (neg === true || neg === 'true') {
        profile.negateParsedAmounts = true;
    } else if (neg === false || neg === 'false') {
        profile.negateParsedAmounts = false;
    } else {
        delete (profile as { negateParsedAmounts?: boolean }).negateParsedAmounts;
    }

    const pol = n.tabularAmountPolarityFilter;
    if (typeof pol === 'string' && (TABULAR_POLARITY_VALUES as readonly string[]).includes(pol)) {
        profile.tabularAmountPolarityFilter = pol as TabularAmountPolarityFilter;
    } else if (pol !== undefined && pol !== null) {
        profile.tabularAmountPolarityFilter = 'all';
    }
}
