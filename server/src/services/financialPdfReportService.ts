import {
    type Transaction,
    type FinancialReportSections,
    type FinancialReportLocaleMode,
    type ExpenseMetaCategory,
    computeUnifiedAnalytics,
    filterTransactionsByCalendarMonth,
    mergeCategoryMeta,
    defaultExpenseMetaForCategory,
    expenseCategoryKey,
    isTransactionIgnored,
    isInternalTransfer,
    isLoanExpenseCategory,
} from '@app/shared';
import type { FinancialReportNarrative } from './aiService.js';
import { AiService } from './aiService.js';
import { StorageService } from './storageService.js';
import { ConfigService } from './configService.js';
import { htmlToPdfBuffer } from '../utils/puppeteerPdf.js';

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
    monthYm: string,
    analytics: ReturnType<typeof computeUnifiedAnalytics>,
    metaRows: { key: string; amount: number }[] | null
): string {
    const lines: string[] = [];
    lines.push(`Month: ${monthYm}`);
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

export interface GenerateFinancialPdfParams {
    monthYm: string;
    localeMode: FinancialReportLocaleMode;
    sections: FinancialReportSections;
}

export async function generateFinancialPdfBuffer(
    storageService: StorageService,
    configService: ConfigService,
    aiService: AiService,
    params: GenerateFinancialPdfParams
): Promise<Buffer> {
    const dashboard = await configService.getDashboardConfig();
    const customCCKeywords = dashboard.customCCKeywords ?? [];
    const all = await storageService.getAllTransactions(true);
    const monthTx = filterTransactionsByCalendarMonth(all, params.monthYm);
    const analytics = computeUnifiedAnalytics(monthTx, customCCKeywords);

    const aiSettings = await aiService.getSettings();
    const metaRows =
        params.sections.metaSpend
            ? computeMetaSpendRows(monthTx, aiSettings.categories || [], aiSettings.categoryMeta, customCCKeywords)
            : null;

    const aggregatesSummary = buildAggregatesSummary(params.monthYm, analytics, metaRows);

    let narrative: FinancialReportNarrative | null = null;
    if (params.sections.executiveSummary || params.sections.insights) {
        if (aiService.hasApiKey()) {
            narrative = await aiService.generateFinancialReportNarrative({
                monthYm: params.monthYm,
                localeMode: params.localeMode,
                aggregatesSummary,
                transactions: monthTx,
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
                  income: 'Total income',
                  expenses: 'Total expenses',
                  net: 'Net',
                  merchant: 'Merchant',
                  txns: 'Transactions',
                  total: 'Total',
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
                  income: 'סה״כ הכנסות',
                  expenses: 'סה״כ הוצאות',
                  net: 'נטו',
                  merchant: 'בית עסק',
                  txns: 'מס׳ תנועות',
                  total: 'סכום',
              };

    const maxCat = Math.max(...analytics.byCategory.map((c) => c.value), 1);

    let bodyInner = '';
    bodyInner += `<header><h1>${escapeHtml(params.localeMode === 'en' ? titleEn : titleHe)}</h1>`;
    if (params.localeMode === 'bilingual') {
        bodyInner += `<p class="subtitle" dir="ltr" lang="en">${escapeHtml(titleEn)}</p>`;
    }
    bodyInner += `<p class="meta">${escapeHtml(labels.month)}: <strong>${escapeHtml(params.monthYm)}</strong></p></header>`;

    if (params.sections.kpis) {
        bodyInner += `<section><h2>${escapeHtml(labels.kpis)}</h2><div class="kpis">`;
        bodyInner += `<div class="kpi"><span>${escapeHtml(labels.income)}</span><strong>${escapeHtml(formatIls(analytics.totalIncome, localeTag))}</strong></div>`;
        bodyInner += `<div class="kpi"><span>${escapeHtml(labels.expenses)}</span><strong>${escapeHtml(formatIls(analytics.totalExpenses, localeTag))}</strong></div>`;
        bodyInner += `<div class="kpi"><span>${escapeHtml(labels.net)}</span><strong>${escapeHtml(formatIls(analytics.netBalance, localeTag))}</strong></div>`;
        bodyInner += `</div></section>`;
    }

    if (params.sections.categoryBreakdown) {
        bodyInner += `<section><h2>${escapeHtml(labels.categories)}</h2>${categoryBarsHtml(analytics.byCategory, maxCat, localeTag)}</section>`;
    }

    if (params.sections.metaSpend && metaRows) {
        const maxM = Math.max(...metaRows.map((r) => r.amount), 1);
        bodyInner += `<section><h2>${escapeHtml(labels.meta)}</h2>${categoryBarsHtml(
            metaRows.map((r) => ({ name: r.key, value: r.amount, color: r.color })),
            maxM,
            localeTag
        )}</section>`;
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

    if (params.sections.executiveSummary || params.sections.insights) {
        bodyInner += `<section>${narrativeSectionHtml(narrative, params.localeMode, params.sections, labels)}</section>`;
    }

    const html = `<!DOCTYPE html>
<html dir="${docDir}" lang="${docLang}">
<head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+Hebrew:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans', 'Noto Sans Hebrew', system-ui, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 18pt; margin: 0 0 6px; }
  h2 { font-size: 13pt; margin: 18px 0 8px; color: #0f766e; }
  .subtitle { margin: 0 0 12px; color: #64748b; font-size: 10pt; }
  .meta { color: #475569; font-size: 10pt; }
  .kpis { display: flex; gap: 12px; flex-wrap: wrap; }
  .kpi { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 10px 14px; min-width: 140px; }
  .kpi span { display: block; font-size: 9pt; color: #64748b; }
  .kpi strong { font-size: 13pt; }
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
</style>
</head>
<body>
${bodyInner}
</body>
</html>`;

    return htmlToPdfBuffer(html);
}
