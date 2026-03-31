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

/** Optional transaction fields that can be mapped from a column (ledger and simple). */
export const TABULAR_MAPPABLE_TXN_FIELDS = [
    'memo',
    'category',
    'type',
    'txnType',
    'processedDate',
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
     * - **Ledger:** `chargedAmount`, `originalAmount`, `chargedCurrency` required; `originalCurrency`
     *   and `extraDetails` (→ memo) optional. `optionalFieldMappings` adds more txn fields from columns.
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
        /** Ledger: charge currency */
        chargedCurrency?: ColumnRef;
        /** Ledger: optional extra line → merged into memo (installment text, etc.) */
        extraDetails?: ColumnRef;
        category?: ColumnRef;
    };
    dateFormat?: TabularDateFormat;
    amountMode?: TabularAmountMode;
    /**
     * Map extra columns to transaction fields (memo, category, type, txnType, processedDate).
     */
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
    /** Default ISO currency when a currency cell is empty (default: ILS) */
    currency?: string;
    /** Skip this many data rows immediately after the header row */
    skipDataRows?: number;
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

/** Parse and validate JSON text; throws with a short message on failure. */
export function parseTabularImportProfileJson(jsonText: string): TabularImportProfileV1 {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error('Invalid JSON');
    }
    if (!isTabularImportProfile(parsed)) {
        throw new Error('Not a valid tabular import profile (format/version/columns)');
    }
    const { columns } = parsed;
    if (isLedgerStyleColumns(columns)) {
        if (!columns.originalAmount || !columns.chargedAmount || !columns.chargedCurrency) {
            throw new Error(
                'Ledger profile requires columns.originalAmount, chargedAmount, and chargedCurrency'
            );
        }
        validateOptionalFieldMappings(parsed.optionalFieldMappings);
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
    return parsed;
}
