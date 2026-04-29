import {
    type Transaction,
    type FinancialReportSections,
    type FinancialReportLocaleMode,
    type ExpenseMetaCategory,
    type UserChartKind,
    computeUnifiedAnalytics,
    computeMonthlyNetFlowProjection,
    filterTransactionsByCalendarMonth,
    mergeCategoryMeta,
    defaultExpenseMetaForCategory,
    expenseCategoryKey,
    isTransactionIgnored,
    isInternalTransfer,
    isLoanExpenseCategory,
    buildCustomChartSeries,
    uniqueAccountsFromTransactions,
    consolidateAccountRowsForDisplay,
    PROVIDERS,
    getProviderDisplayName,
} from '@app/shared';
import type { FinancialReportNarrative } from './aiService.js';
import { AiService } from './aiService.js';
import { StorageService } from './storageService.js';
import { ConfigService } from './configService.js';
import { htmlToPdfBuffer } from '../utils/puppeteerPdf.js';
import { getFinancialPdfEmbeddedFontsCss } from '../utils/financialPdfFonts.js';
import {
    svgCategoryTreemapByParent,
    svgMetaSpendPie,
    svgMonthlyIncomeExpenseBars,
    svgUserChartLine,
    svgUserChartPie,
    svgVerticalBars,
} from '../utils/financialPdfCharts.js';
import { DbService } from './dbService.js';
import { getInsightRuleFiresForFinancialPdf } from './insightRulesService.js';
import { computeLivePortfolioForUser } from './investmentPortfolioService.js';
import { DEFAULT_INVESTMENT_USER_ID } from '../constants/investments.js';
import { isInvestmentsFeatureEnabled } from '../constants/marketData.js';

function escapeHtml(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function skipLoanExpense(t: Transaction): boolean {
    const amount = t.chargedAmount || t.amount || 0;
    return amount < 0 && isLoanExpenseCategory(t.category);
}

function formatIls(n: number, localeTag: string): string {
    return new Intl.NumberFormat(localeTag, {
        style: 'currency',
        currency: 'ILS',
        maximumFractionDigits: 0,
    }).format(n);
}

const META_KEYS = ['fixed', 'variable', 'optimization'] as const;

function computeMetaSpendRows(
    transactions: Transaction[],
    categories: string[],
    categoryMeta: Record<string, ExpenseMetaCategory> | undefined,
    customCCKeywords: string[]
): { key: string; amount: number; color: string }[] {
    const merged = mergeCategoryMeta(categories, categoryMeta);
    const sums: Record<ExpenseMetaCategory, number> = {
        fixed: 0,
        variable: 0,
        optimization: 0,
        excluded: 0,
    };
    for (const t of transactions) {
        if (isTransactionIgnored(t)) continue;
        if (isInternalTransfer(t, customCCKeywords)) continue;
        if (skipLoanExpense(t)) continue;
        const amount = t.chargedAmount || t.amount || 0;
        if (amount >= 0) continue;
        const cat = expenseCategoryKey(t.category);
        const bucket = merged[cat] ?? defaultExpenseMetaForCategory(cat);
        sums[bucket] += Math.abs(amount);
    }
    const colors: Record<string, string> = {
        fixed: '#6366f1',
        variable: '#3b82f6',
        optimization: '#f59e0b',
    };
    return META_KEYS.map((key) => ({
        key,
        amount: Math.round(sums[key] * 100) / 100,
        color: colors[key],
    }));
}

function buildAggregatesSummary(
    periodLabel: string,
    analytics: ReturnType<typeof computeUnifiedAnalytics>,
    metaRows: { key: string; amount: number }[] | null
): string {
    const lines: string[] = [];
    lines.push(`Period: ${periodLabel}`);
    lines.push(`Total income: ${analytics.totalIncome}`);
    lines.push(`Total expenses: ${analytics.totalExpenses}`);
    lines.push(`Net: ${analytics.netBalance}`);
    lines.push('Top categories:');
    for (const c of analytics.byCategory.slice(0, 12)) {
        lines.push(`- ${c.name}: ${c.value}`);
    }
    lines.push('Top merchants (by frequency):');
    for (const m of analytics.topMerchants) {
        lines.push(`- ${m.description}: count=${m.count}, total=${m.total}`);
    }
    if (metaRows) {
        lines.push('Meta spend (fixed / variable / optimization):');
        for (const r of metaRows) {
            lines.push(`- ${r.key}: ${r.amount}`);
        }
    }
    return lines.join('\n');
}

function narrativeSectionHtml(
    narrative: FinancialReportNarrative | null,
    localeMode: FinancialReportLocaleMode,
    sections: FinancialReportSections,
    labels: { summary: string; insights: string; unavailable: string }
): string {
    if (!narrative && (sections.executiveSummary || sections.insights)) {
        return `<p class="muted">${escapeHtml(labels.unavailable)}</p>`;
    }
    const showHe = localeMode === 'he' || localeMode === 'bilingual';
    const showEn = localeMode === 'en' || localeMode === 'bilingual';
    let out = '';
    if (sections.executiveSummary) {
        out += `<h2>${escapeHtml(labels.summary)}</h2>`;
        if (!narrative) {
            out += `<p class="muted">${escapeHtml(labels.unavailable)}</p>`;
        } else {
            if (showHe) {
                out += `<p dir="rtl" lang="he" class="rtl-block">${escapeHtml(narrative.executiveSummary.he || '—')}</p>`;
            }
            if (showEn) {
                out += `<p dir="ltr" lang="en">${escapeHtml(narrative.executiveSummary.en || '—')}</p>`;
            }
        }
    }
    if (sections.insights) {
        out += `<h2>${escapeHtml(labels.insights)}</h2>`;
        if (!narrative) {
            out += `<p class="muted">${escapeHtml(labels.unavailable)}</p>`;
        } else {
            out += '<ol class="insights">';
            for (const ins of narrative.insights) {
                out += '<li>';
                if (showHe) {
                    out += `<div dir="rtl" lang="he" class="rtl-block"><strong>${escapeHtml(ins.title.he || '—')}</strong><br/>${escapeHtml(ins.detail.he || '')}<br/><em>${escapeHtml(ins.action.he || '')}</em></div>`;
                }
                if (showEn) {
                    out += `<div dir="ltr" lang="en"><strong>${escapeHtml(ins.title.en || '—')}</strong><br/>${escapeHtml(ins.detail.en || '')}<br/><em>${escapeHtml(ins.action.en || '')}</em></div>`;
                }
                out += '</li>';
            }
            out += '</ol>';
        }
    }
    return out;
}

function insightRulesTopSectionHtml(
    rows: { kind: 'insight' | 'alert'; score: number; messageEn: string; messageHe: string }[],
    localeMode: FinancialReportLocaleMode,
    labels: {
        title: string;
        empty: string;
        kindInsight: string;
        kindAlert: string;
    }
): string {
    const showHe = localeMode === 'he' || localeMode === 'bilingual';
    const showEn = localeMode === 'en' || localeMode === 'bilingual';
    if (!rows.length) {
        return `<h2>${escapeHtml(labels.title)}</h2><p class="muted">${escapeHtml(labels.empty)}</p>`;
    }
    let out = `<h2>${escapeHtml(labels.title)}</h2><ol class="insights">`;
    for (const r of rows) {
        const kindLabel = r.kind === 'alert' ? labels.kindAlert : labels.kindInsight;
        out += `<li class="rule-insight-item"><span class="rule-fire-meta">${escapeHtml(kindLabel)} · ${r.score}</span>`;
        if (showHe) {
            out += `<div dir="rtl" lang="he" class="rtl-block">${escapeHtml(r.messageHe.trim() || '—')}</div>`;
        }
        if (showEn) {
            out += `<div dir="ltr" lang="en">${escapeHtml(r.messageEn.trim() || '—')}</div>`;
        }
        out += '</li>';
    }
    out += '</ol>';
    return out;
}

function categoryBarsHtml(
    rows: { name: string; value: number; color: string }[],
    maxVal: number,
    localeTag: string
): string {
    if (!rows.length) return '<p class="muted">—</p>';
    return rows
        .slice(0, 14)
        .map((r) => {
            const pct = maxVal > 0 ? Math.round((r.value / maxVal) * 100) : 0;
            return `<div class="bar-row"><div class="bar-label">${escapeHtml(r.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${escapeHtml(r.color)}"></div></div><div class="bar-val">${escapeHtml(formatIls(r.value, localeTag))}</div></div>`;
        })
        .join('');
}

function merchantsTableHtml(
    rows: { description: string; count: number; total: number }[],
    hMerchant: string,
    hCount: string,
    hTotal: string,
    localeTag: string
): string {
    if (!rows.length) return '<p class="muted">—</p>';
    const head = `<tr><th>${escapeHtml(hMerchant)}</th><th>${escapeHtml(hCount)}</th><th>${escapeHtml(hTotal)}</th></tr>`;
    const body = rows
        .map(
            (r) =>
                `<tr><td>${escapeHtml(r.description)}</td><td>${r.count}</td><td>${escapeHtml(formatIls(r.total, localeTag))}</td></tr>`
        )
        .join('');
    return `<table class="merch"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function parseTxnDateMs(t: Transaction): number | null {
    const d = t.date;
    if (!d || typeof d !== 'string') return null;
    const iso = /^\d{4}-\d{2}-\d{2}/.exec(d);
    if (iso) return new Date(`${iso[0]}T12:00:00`).getTime();
    const x = new Date(d).getTime();
    return Number.isNaN(x) ? null : x;
}

/** Min–max of transaction dates in scope (for PDF subtitle). */
function formatTransactionDateRangeLine(
    txs: Transaction[],
    localeTag: string,
    labels: { prefix: string; empty: string }
): string {
    const ms = txs.map(parseTxnDateMs).filter((x): x is number => x != null);
    if (!ms.length) return labels.empty;
    const min = new Date(Math.min(...ms));
    const max = new Date(Math.max(...ms));
    const fmt = new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium' });
    return `${labels.prefix} ${fmt.format(min)} – ${fmt.format(max)}`;
}

function accountsInScopeHtml(
    rows: { providerDisplay: string; accountNumber: string }[],
    labels: { colProvider: string; colAccount: string; emptyScope: string }
): string {
    if (rows.length === 0) {
        return `<p class="muted">${escapeHtml(labels.emptyScope)}</p>`;
    }
    const head = `<tr><th>${escapeHtml(labels.colProvider)}</th><th>${escapeHtml(labels.colAccount)}</th></tr>`;
    const body = rows
        .map(
            (r) =>
                `<tr><td>${escapeHtml(r.providerDisplay)}</td><td>${escapeHtml(r.accountNumber ? r.accountNumber : '—')}</td></tr>`
        )
        .join('');
    return `<table class="acct"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function weekdayPdfLabels(localeMode: FinancialReportLocaleMode): string[] {
    const tag = localeMode === 'en' ? 'en-US' : 'he-IL';
    return Array.from({ length: 7 }, (_, dayIndex) => {
        const baseSunday = new Date(Date.UTC(2024, 0, 7 + dayIndex));
        return new Intl.DateTimeFormat(tag, { weekday: 'short' }).format(baseSunday);
    });
}

function fillPdfTemplate(template: string, vars: Record<string, string>): string {
    let s = template;
    for (const [key, val] of Object.entries(vars)) {
        s = s.split(`{{${key}}}`).join(val);
    }
    return s;
}

/** PDF copy for monthly net line + deterministic projection (EN/HE for bilingual). */
const PDF_MONTHLY_NET_COPY = {
    en: {
        chartMonthlyNet: 'Monthly net (income − expenses)',
        netProjectionBody:
            'If the average monthly net of the last {{lookback}} months (about {{avg}}/month) continued for {{horizon}} months, aggregate net flow would be roughly {{cumulative}}. This reflects income minus expenses in the data, not your bank balance.',
        netProjectionDisclaimer: 'Illustrative only—not financial advice.',
        netProjectionNeedHistory: 'Add at least two calendar months of data to see a simple continuation estimate.',
    },
    he: {
        chartMonthlyNet: 'נטו חודשי (הכנסות פחות הוצאות)',
        netProjectionBody:
            'אם ממוצע הנטו החודשי ב-{{lookback}} החודשים האחרונים (בערך {{avg}} לחודש) יימשך עוד {{horizon}} חודשים, סך זרימת הנטו המצטברת יהיה בערך {{cumulative}}. מדובר בהכנסות פחות הוצאות בנתונים — לא יתרה בחשבון בנק.',
        netProjectionDisclaimer: 'להמחשה בלבד — לא ייעוץ פיננסי.',
        netProjectionNeedHistory: 'הוסיפו לפחות שני חודשי לוח שנה בנתונים כדי לקבל הערכת המשך פשוטה.',
    },
} as const;

/** Simplified thousands axis for chart SVG (matches dashboard “ILS Nk” spirit). */
function formatAxisK(n: number, localeTag: string): string {
    const k = Math.round(n / 1000);
    if (localeTag.startsWith('he')) {
        return k === 0 ? '0' : `${k}א׳`;
    }
    return k === 0 ? '0' : `ILS ${k}k`;
}

async function buildInvestmentSectionHtml(
    localeTag: string,
    labels: {
        title: string;
        featureOff: string;
        empty: string;
        partialNote: string;
        symbol: string;
        qty: string;
        value: string;
        pnl: string;
        totalRow: string;
    }
): Promise<string> {
    if (!isInvestmentsFeatureEnabled()) {
        return `<section class="pdf-section"><h2>${escapeHtml(labels.title)}</h2><p class="muted">${escapeHtml(labels.featureOff)}</p></section>`;
    }
    const db = new DbService();
    const summary = await computeLivePortfolioForUser(db, DEFAULT_INVESTMENT_USER_ID);
    if (!summary.positions.length) {
        return `<section class="pdf-section"><h2>${escapeHtml(labels.title)}</h2><p class="muted">${escapeHtml(labels.empty)}</p></section>`;
    }
    const head = `<tr><th>${escapeHtml(labels.symbol)}</th><th>${escapeHtml(labels.qty)}</th><th>${escapeHtml(labels.value)}</th><th>${escapeHtml(labels.pnl)}</th></tr>`;
    const rows = summary.positions.map((p) => {
        const mv = p.marketValueIls != null ? formatIls(p.marketValueIls, localeTag) : '—';
        const pnl = p.pnlIls != null ? formatIls(p.pnlIls, localeTag) : '—';
        const q = Number.isInteger(p.quantity) ? String(p.quantity) : String(p.quantity);
        return `<tr><td>${escapeHtml(p.symbol)}</td><td>${escapeHtml(q)}</td><td>${escapeHtml(mv)}</td><td>${escapeHtml(pnl)}</td></tr>`;
    });
    let foot = '';
    if (summary.totalMarketValueIls != null && summary.totalPnlIls != null) {
        foot = `<tr class="inv-totals"><td colspan="2"><strong>${escapeHtml(labels.totalRow)}</strong></td><td><strong>${escapeHtml(formatIls(summary.totalMarketValueIls, localeTag))}</strong></td><td><strong>${escapeHtml(formatIls(summary.totalPnlIls, localeTag))}</strong></td></tr>`;
    }
    const note = summary.partialQuotes ? `<p class="muted small">${escapeHtml(labels.partialNote)}</p>` : '';
    return `<section class="pdf-section"><h2>${escapeHtml(labels.title)}</h2>${note}<table class="inv">${head}${rows.join('')}${foot}</table></section>`;
}

export type FinancialPdfScope = 'month' | 'all';

export interface GenerateFinancialPdfParams {
    /** YYYY-MM when pdfScope is month; ignored for data when pdfScope is all (still used if ever needed). */
    monthYm: string;
    pdfScope?: FinancialPdfScope;
    localeMode: FinancialReportLocaleMode;
    sections: FinancialReportSections;
}

export async function generateFinancialPdfBuffer(
    storageService: StorageService,
    configService: ConfigService,
    aiService: AiService,
    params: GenerateFinancialPdfParams
): Promise<Buffer> {
    const pdfScope: FinancialPdfScope = params.pdfScope ?? 'month';
    const dashboard = await configService.getDashboardConfig();
    const customCCKeywords = dashboard.customCCKeywords ?? [];
    const all = await storageService.getAllTransactions(true);
    const scopeTx = pdfScope === 'all' ? all : filterTransactionsByCalendarMonth(all, params.monthYm);
    const analytics = computeUnifiedAnalytics(scopeTx, customCCKeywords);
    const analyticsFullTrend = params.sections.chartMonthlyTrend
        ? pdfScope === 'all'
            ? analytics
            : computeUnifiedAnalytics(all, customCCKeywords)
        : null;

    const aiSettings = await aiService.getSettings();
    const metaRows =
        params.sections.metaSpend || params.sections.chartMetaSpendPie
            ? computeMetaSpendRows(scopeTx, aiSettings.categories || [], aiSettings.categoryMeta, customCCKeywords)
            : null;

    const periodLabelForSummary =
        pdfScope === 'all'
            ? 'All time (full loaded transaction history)'
            : params.monthYm;
    const aggregatesSummary = buildAggregatesSummary(periodLabelForSummary, analytics, metaRows);

    let narrative: FinancialReportNarrative | null = null;
    if (params.sections.executiveSummary || params.sections.insights) {
        if (aiService.hasApiKey()) {
            narrative = await aiService.generateFinancialReportNarrative({
                monthYm: params.monthYm,
                reportPeriodDescription:
                    pdfScope === 'all'
                        ? 'Reporting period: All time (full loaded transaction history).'
                        : undefined,
                localeMode: params.localeMode,
                aggregatesSummary,
                transactions: scopeTx,
            });
        }
    }

    const localeTag = params.localeMode === 'en' ? 'en-IL' : 'he-IL';
    const titleHe = 'דוח פיננסי — מבט כלכלי';
    const titleEn = 'Financial report — Israeli Financial Overview';
    const docDir = params.localeMode === 'en' ? 'ltr' : 'rtl';
    const docLang = params.localeMode === 'en' ? 'en' : 'he';

    const labels =
        params.localeMode === 'en'
            ? {
                  summary: 'Executive summary',
                  insights: 'Insights',
                  unavailable: 'AI narrative unavailable (configure Gemini or try again).',
                  kpis: 'Key figures',
                  categories: 'Spending by category',
                  merchants: 'Top merchants',
                  meta: 'Meta spend (fixed / variable / optimization)',
                  month: 'Month',
                  periodAllTime: 'All time',
                  income: 'Total income',
                  expenses: 'Total expenses',
                  net: 'Net',
                  merchant: 'Merchant',
                  txns: 'Transactions',
                  total: 'Total',
                  chartTreemap: 'Spending by category (treemap)',
                  chartMonthly: 'Monthly income & spending trend',
                  chartWeekday: 'Spending by weekday',
                  chartMonthDay: 'Spending by day of month',
                  chartMetaPie: 'Meta spend (pie)',
                  metaFixed: 'Fixed',
                  metaVariable: 'Variable',
                  metaOptimization: 'Optimization',
                  treemapMerged: 'Small categories',
                  investmentsTitle: 'Investments (portfolio)',
                  investmentsFeatureOff: 'Investments are turned off in app settings.',
                  investmentsEmpty: 'No open positions.',
                  investmentsPartial: 'Some quotes or FX rates are missing; totals may be incomplete.',
                  invSymbol: 'Symbol',
                  invQty: 'Qty',
                  invValue: 'Value (ILS)',
                  invPnl: 'P&L (ILS)',
                  invTotal: 'Totals',
                  customChartsNoSaved: 'No custom charts are saved in dashboard settings.',
                  customChartsEmptyData: 'No data for this chart in the selected scope.',
                  accountsInReport: 'Accounts in report scope',
                  accountColProvider: 'Provider',
                  accountColNumber: 'Account no.',
                  accountsEmptyScope: 'No transactions in this scope — no accounts to list.',
                  dateRangePrefix: 'Transaction dates in this report:',
                  dateRangeEmpty: 'No dated transactions in this scope.',
                  insightRulesTitle: 'Top insight rules',
                  insightRulesEmpty:
                      'No matching rule insights for this report (enable rules under Configuration → Insight rules, or refresh fires after new data).',
                  insightRulesKindInsight: 'Insight',
                  insightRulesKindAlert: 'Alert',
              }
            : {
                  summary: 'סיכום מנהלים',
                  insights: 'תובנות',
                  unavailable: 'סעיף AI אינו זמין (הגדירו Gemini או נסו שוב).',
                  kpis: 'מדדים עיקריים',
                  categories: 'הוצאות לפי קטגוריה',
                  merchants: 'בתי עסק מובילים',
                  meta: 'הוצאות לפי מטא־קטגוריות',
                  month: 'חודש',
                  periodAllTime: 'כל התקופה',
                  income: 'סה״כ הכנסות',
                  expenses: 'סה״כ הוצאות',
                  net: 'נטו',
                  merchant: 'בית עסק',
                  txns: 'מס׳ תנועות',
                  total: 'סכום',
                  chartTreemap: 'הוצאות לפי קטגוריה (מפת עץ)',
                  chartMonthly: 'מגמת הכנסות והוצאות לפי חודש',
                  chartWeekday: 'הוצאות לפי יום בשבוע',
                  chartMonthDay: 'הוצאות לפי יום בחודש',
                  chartMetaPie: 'הוצאות מטא (תרשים עוגה)',
                  metaFixed: 'הוצאות קבועות',
                  metaVariable: 'הוצאות משתנות',
                  metaOptimization: 'אופטימיזציה (ניתן לייעל)',
                  treemapMerged: 'קטגוריות קטנות',
                  investmentsTitle: 'השקעות (תיק)',
                  investmentsFeatureOff: 'תכונת ההשקעות כבויה בהגדרות.',
                  investmentsEmpty: 'אין פוזיציות פתוחות.',
                  investmentsPartial: 'חסרים שערים או המרות; הסכומים עשויים להיות חלקיים.',
                  invSymbol: 'ני״ע',
                  invQty: 'כמות',
                  invValue: 'שווי (₪)',
                  invPnl: 'רווח/הפסד (₪)',
                  invTotal: 'סה״כ',
                  customChartsNoSaved: 'אין גרפים מותאמים שמורים בהגדרות הלוח.',
                  customChartsEmptyData: 'אין נתונים לגרף הזה בהיקף הנבחר.',
                  accountsInReport: 'חשבונות בהיקף הדוח',
                  accountColProvider: 'ספק',
                  accountColNumber: 'מספר חשבון',
                  accountsEmptyScope: 'אין תנועות בהיקף — אין חשבונות להצגה.',
                  dateRangePrefix: 'תאריכי תנועות בדוח:',
                  dateRangeEmpty: 'אין תנועות עם תאריך בהיקף זה.',
                  insightRulesTitle: 'כללי תובנות — מובילים',
                  insightRulesEmpty:
                      'אין תובנות מתאימות לדוח זה (הפעילו כללים תחת הגדרות → כללי תובנות, או רעננו לאחר נתונים חדשים).',
                  insightRulesKindInsight: 'תובנה',
                  insightRulesKindAlert: 'התראה',
              };

    const maxCat = Math.max(...analytics.byCategory.map((c) => c.value), 1);

    const reportLang = params.localeMode === 'en' ? 'en' : 'he';
    const mergedAccounts = consolidateAccountRowsForDisplay(uniqueAccountsFromTransactions(scopeTx));
    const reportAccountRows = mergedAccounts.map((r) => ({
        providerDisplay: getProviderDisplayName(r.provider, PROVIDERS, reportLang),
        accountNumber: r.accountNumber || '—',
    }));

    const dateRangeLine = formatTransactionDateRangeLine(scopeTx, localeTag, {
        prefix: labels.dateRangePrefix,
        empty: labels.dateRangeEmpty,
    });

    let bodyInner = '';
    bodyInner += `<header><h1>${escapeHtml(params.localeMode === 'en' ? titleEn : titleHe)}</h1>`;
    if (params.localeMode === 'bilingual') {
        bodyInner += `<p class="subtitle" dir="ltr" lang="en">${escapeHtml(titleEn)}</p>`;
    }
    bodyInner += `<p class="date-range">${escapeHtml(dateRangeLine)}</p>`;
    const periodMeta =
        pdfScope === 'all'
            ? `<p class="meta">${escapeHtml(labels.periodAllTime)}</p>`
            : `<p class="meta">${escapeHtml(labels.month)}: <strong>${escapeHtml(params.monthYm)}</strong></p>`;
    bodyInner += `${periodMeta}</header>`;

    if (params.sections.kpis) {
        bodyInner += `<section><h2>${escapeHtml(labels.kpis)}</h2><div class="kpis">`;
        bodyInner += `<div class="kpi kpi-income"><span>${escapeHtml(labels.income)}</span><strong>${escapeHtml(formatIls(analytics.totalIncome, localeTag))}</strong></div>`;
        bodyInner += `<div class="kpi kpi-expenses"><span>${escapeHtml(labels.expenses)}</span><strong>${escapeHtml(formatIls(analytics.totalExpenses, localeTag))}</strong></div>`;
        bodyInner += `<div class="kpi kpi-net"><span>${escapeHtml(labels.net)}</span><strong>${escapeHtml(formatIls(analytics.netBalance, localeTag))}</strong></div>`;
        bodyInner += `</div></section>`;
    }

    if (params.sections.executiveSummary || params.sections.insights) {
        bodyInner += `<section>${narrativeSectionHtml(narrative, params.localeMode, params.sections, labels)}</section>`;
    }

    if (params.sections.insightRulesTop) {
        const dbRules = new DbService();
        const ruleFireRows = getInsightRuleFiresForFinancialPdf(dbRules, {
            pdfScope,
            monthYm: params.monthYm,
        });
        bodyInner += `<section>${insightRulesTopSectionHtml(ruleFireRows, params.localeMode, {
            title: labels.insightRulesTitle,
            empty: labels.insightRulesEmpty,
            kindInsight: labels.insightRulesKindInsight,
            kindAlert: labels.insightRulesKindAlert,
        })}</section>`;
    }

    if (params.sections.metaSpend && metaRows) {
        const maxM = Math.max(...metaRows.map((r) => r.amount), 1);
        bodyInner += `<section><h2>${escapeHtml(labels.meta)}</h2>${categoryBarsHtml(
            metaRows.map((r) => ({ name: r.key, value: r.amount, color: r.color })),
            maxM,
            localeTag
        )}</section>`;
    }

    if (params.sections.investmentSummary) {
        bodyInner += await buildInvestmentSectionHtml(localeTag, {
            title: labels.investmentsTitle,
            featureOff: labels.investmentsFeatureOff,
            empty: labels.investmentsEmpty,
            partialNote: labels.investmentsPartial,
            symbol: labels.invSymbol,
            qty: labels.invQty,
            value: labels.invValue,
            pnl: labels.invPnl,
            totalRow: labels.invTotal,
        });
    }

    if (params.sections.categoryBreakdown) {
        bodyInner += `<section><h2>${escapeHtml(labels.categories)}</h2>${categoryBarsHtml(analytics.byCategory, maxCat, localeTag)}</section>`;
    }

    if (params.sections.topMerchants) {
        bodyInner += `<section><h2>${escapeHtml(labels.merchants)}</h2>${merchantsTableHtml(
            analytics.topMerchants,
            labels.merchant,
            labels.txns,
            labels.total,
            localeTag
        )}</section>`;
    }

    let chartsHtml = '';
    const chartW = 720;
    const chartH = 280;
    const treemapH = 320;

    if (params.sections.chartCategoryTreemap && analytics.byCategoryTree.length) {
        chartsHtml += `<section class="pdf-section"><h2>${escapeHtml(labels.chartTreemap)}</h2><div class="chart-svg">${svgCategoryTreemapByParent(analytics.byCategoryTree, {
            width: chartW,
            height: treemapH,
            mergedLabel: labels.treemapMerged,
            formatCurrency: (n) => formatIls(n, localeTag),
        })}</div></section>`;
    }

    if (params.sections.chartMonthlyTrend && analyticsFullTrend && analyticsFullTrend.byMonth.length) {
        const trendMonths = analyticsFullTrend.byMonth;
        const netLineRows = trendMonths.map((r) => ({ name: r.month, value: r.net }));
        const netSvg = svgUserChartLine(netLineRows, {
            width: chartW,
            height: chartH,
            formatValue: (n) => formatIls(n, localeTag),
            formatAxis: (n) => formatAxisK(n, localeTag),
            stroke: '#0f172a',
        });
        const proj = computeMonthlyNetFlowProjection(trendMonths, { horizonMonths: 6, lookbackMonths: 6 });
        const showHe = params.localeMode === 'he' || params.localeMode === 'bilingual';
        const showEn = params.localeMode === 'en' || params.localeMode === 'bilingual';

        let projectionBlock = '';
        if (proj.showProjection && proj.averageNet != null && proj.cumulativeIfAverageContinues != null) {
            const vars: Record<string, string> = {
                lookback: String(proj.lookbackUsed),
                horizon: String(proj.horizonMonths),
                avg: formatIls(proj.averageNet, localeTag),
                cumulative: formatIls(proj.cumulativeIfAverageContinues, localeTag),
            };
            if (showHe) {
                const body = fillPdfTemplate(PDF_MONTHLY_NET_COPY.he.netProjectionBody, vars);
                projectionBlock += `<p dir="rtl" lang="he" class="rtl-block projection-note">${escapeHtml(body)}</p>`;
                projectionBlock += `<p dir="rtl" lang="he" class="projection-disclaimer">${escapeHtml(PDF_MONTHLY_NET_COPY.he.netProjectionDisclaimer)}</p>`;
            }
            if (showEn) {
                const body = fillPdfTemplate(PDF_MONTHLY_NET_COPY.en.netProjectionBody, vars);
                projectionBlock += `<p dir="ltr" lang="en" class="projection-note">${escapeHtml(body)}</p>`;
                projectionBlock += `<p dir="ltr" lang="en" class="projection-disclaimer">${escapeHtml(PDF_MONTHLY_NET_COPY.en.netProjectionDisclaimer)}</p>`;
            }
        } else {
            if (showHe) {
                projectionBlock += `<p dir="rtl" lang="he" class="projection-note muted">${escapeHtml(PDF_MONTHLY_NET_COPY.he.netProjectionNeedHistory)}</p>`;
            }
            if (showEn) {
                projectionBlock += `<p dir="ltr" lang="en" class="projection-note muted">${escapeHtml(PDF_MONTHLY_NET_COPY.en.netProjectionNeedHistory)}</p>`;
            }
        }

        let netTitleHtml = '';
        if (params.localeMode === 'en') {
            netTitleHtml = escapeHtml(PDF_MONTHLY_NET_COPY.en.chartMonthlyNet);
        } else if (params.localeMode === 'he') {
            netTitleHtml = escapeHtml(PDF_MONTHLY_NET_COPY.he.chartMonthlyNet);
        } else {
            netTitleHtml = `<span dir="rtl" lang="he">${escapeHtml(PDF_MONTHLY_NET_COPY.he.chartMonthlyNet)}</span> · <span dir="ltr" lang="en">${escapeHtml(PDF_MONTHLY_NET_COPY.en.chartMonthlyNet)}</span>`;
        }

        chartsHtml += `<section class="pdf-section"><h2>${escapeHtml(labels.chartMonthly)}</h2><div class="chart-svg">${svgMonthlyIncomeExpenseBars(trendMonths, {
            width: chartW,
            height: chartH,
            labelIncome: labels.income,
            labelExpenses: labels.expenses,
            formatAxis: (n) => formatAxisK(n, localeTag),
        })}</div><h3 class="chart-subtitle">${netTitleHtml}</h3><div class="chart-svg">${netSvg}</div>${projectionBlock}</section>`;
    }

    if (params.sections.chartSpendingByWeekday) {
        const wdLabels = weekdayPdfLabels(params.localeMode);
        const wdVals = analytics.byWeekday.map((d) => d.value);
        chartsHtml += `<section class="pdf-section"><h2>${escapeHtml(labels.chartWeekday)}</h2><div class="chart-svg">${svgVerticalBars(wdLabels, wdVals, {
            width: chartW,
            height: chartH,
            barColor: '#60a5fa',
            formatAxis: (n) => formatAxisK(n, localeTag),
        })}</div></section>`;
    }

    if (params.sections.chartSpendingByMonthDay) {
        const dayLabels = analytics.byMonthDay.map((x) => String(x.day));
        const dayVals = analytics.byMonthDay.map((x) => x.value);
        chartsHtml += `<section class="pdf-section"><h2>${escapeHtml(labels.chartMonthDay)}</h2><div class="chart-svg">${svgVerticalBars(dayLabels, dayVals, {
            width: chartW,
            height: chartH,
            barColor: '#fb923c',
            formatAxis: (n) => formatAxisK(n, localeTag),
        })}</div></section>`;
    }

    if (params.sections.chartMetaSpendPie && metaRows) {
        const pieSlices = metaRows.map((r) => ({
            ...r,
            label:
                r.key === 'fixed'
                    ? labels.metaFixed
                    : r.key === 'variable'
                      ? labels.metaVariable
                      : labels.metaOptimization,
        }));
        chartsHtml += `<section class="pdf-section"><h2>${escapeHtml(labels.chartMetaPie)}</h2><div class="chart-svg">${svgMetaSpendPie(pieSlices, {
            width: chartW,
            height: 220,
            formatCurrency: (n) => formatIls(n, localeTag),
        })}</div></section>`;
    }

    if (params.sections.customCharts) {
        const defs = dashboard.customCharts ?? [];
        const wdLabs = weekdayPdfLabels(params.localeMode);
        if (defs.length === 0) {
            chartsHtml += `<section class="pdf-section"><p class="muted">${escapeHtml(labels.customChartsNoSaved)}</p></section>`;
        } else {
            for (const spec of defs) {
                const { rows, isEmpty } = buildCustomChartSeries(spec, {
                    followTransactions: scopeTx,
                    fullTransactionPool: all,
                    customCCKeywords,
                    weekdayLabels: wdLabs,
                });
                const heading = escapeHtml(spec.title || (params.localeMode === 'en' ? 'Custom chart' : 'גרף מותאם'));
                let inner: string;
                if (isEmpty) {
                    inner = `<p class="muted">${escapeHtml(labels.customChartsEmptyData)}</p>`;
                } else {
                    const kind: UserChartKind =
                        spec.chartKind === 'pie' && spec.measure === 'net' ? 'bar' : spec.chartKind;
                    const formatVal = (v: number) =>
                        spec.measure === 'count' ? String(Math.round(v)) : formatIls(v, localeTag);
                    const fmtAxis = (n: number) =>
                        spec.measure === 'count' ? String(Math.round(n)) : formatAxisK(n, localeTag);
                    if (kind === 'pie') {
                        inner = svgUserChartPie(rows, {
                            width: chartW,
                            height: 240,
                            formatValue: formatVal,
                        });
                    } else if (kind === 'line') {
                        inner = svgUserChartLine(rows, {
                            width: chartW,
                            height: chartH,
                            formatValue: formatVal,
                            formatAxis: fmtAxis,
                            stroke: '#6366f1',
                        });
                    } else {
                        inner = svgVerticalBars(
                            rows.map((r: { name: string; value: number }) => r.name),
                            rows.map((r: { name: string; value: number }) => r.value),
                            {
                                width: chartW,
                                height: chartH,
                                barColor: '#6366f1',
                                formatAxis: fmtAxis,
                            }
                        );
                    }
                }
                chartsHtml += `<section class="pdf-section"><h2>${heading}</h2><div class="chart-svg">${inner}</div></section>`;
            }
        }
    }

    bodyInner += chartsHtml;

    bodyInner += `<section class="pdf-section report-accounts-section"><h2>${escapeHtml(labels.accountsInReport)}</h2>${accountsInScopeHtml(reportAccountRows, {
        colProvider: labels.accountColProvider,
        colAccount: labels.accountColNumber,
        emptyScope: labels.accountsEmptyScope,
    })}</section>`;

    const html = `<!DOCTYPE html>
<html dir="${docDir}" lang="${docLang}">
<head>
<meta charset="utf-8"/>
<style>
${getFinancialPdfEmbeddedFontsCss()}
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Hebrew', 'Segoe UI', 'Arial Hebrew', Tahoma, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 18pt; margin: 0 0 6px; font-weight: 700; }
  h2 { font-size: 13pt; margin: 18px 0 8px; color: #0f766e; font-weight: 600; }
  .subtitle { margin: 0 0 8px; color: #64748b; font-size: 10pt; }
  .date-range { margin: 0 0 10px; color: #64748b; font-size: 8.5pt; line-height: 1.35; }
  .meta { color: #475569; font-size: 10pt; margin: 0; }
  .kpis { display: flex; gap: 12px; flex-wrap: wrap; }
  .kpi { border-radius: 8px; padding: 10px 14px; min-width: 140px; border: 1px solid; }
  .kpi-income { background: #ecfdf5; border-color: #6ee7b7; }
  .kpi-expenses { background: #fef2f2; border-color: #fca5a5; }
  .kpi-net { background: #eff6ff; border-color: #93c5fd; }
  .kpi span { display: block; font-size: 9pt; color: #475569; }
  .kpi strong { font-size: 13pt; font-weight: 700; color: #0f172a; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
  .bar-label { width: 28%; font-size: 9pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; height: 10px; background: #e2e8f0; border-radius: 6px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 6px; }
  .bar-val { width: 22%; text-align: end; font-size: 9pt; font-variant-numeric: tabular-nums; }
  table.merch { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  table.merch th, table.merch td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: start; }
  table.merch th { background: #f8fafc; }
  .muted { color: #94a3b8; }
  .rtl-block { margin: 6px 0; }
  ol.insights { padding-inline-start: 20px; }
  ol.insights li { margin-bottom: 12px; }
  .rule-fire-meta { font-size: 8.5pt; color: #64748b; display: block; margin-bottom: 4px; }
  .rule-insight-item .rtl-block { margin-bottom: 4px; }
  .pdf-section { page-break-inside: avoid; margin-bottom: 4px; }
  .chart-svg { max-width: 100%; margin: 8px 0; }
  .chart-svg svg { width: 100%; height: auto; display: block; }
  h3.chart-subtitle { font-size: 11pt; margin: 14px 0 6px; color: #334155; font-weight: 600; }
  .projection-note { font-size: 9.5pt; color: #475569; margin: 8px 0 0; padding: 8px 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; line-height: 1.4; }
  .projection-disclaimer { font-size: 8.5pt; color: #64748b; margin: 4px 0 8px; }
  table.inv { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  table.inv th, table.inv td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: start; }
  table.inv th { background: #f8fafc; }
  tr.inv-totals td { background: #f0fdfa; }
  p.small { font-size: 8.5pt; margin-top: 6px; }
  .report-accounts-section { margin-top: 8px; }
  table.acct { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 6px; }
  table.acct th, table.acct td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: start; }
  table.acct th { background: #f8fafc; }
</style>
</head>
<body>
${bodyInner}
</body>
</html>`;

    return htmlToPdfBuffer(html);
}
