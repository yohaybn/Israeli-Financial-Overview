import { Router } from 'express';
import {
    type FinancialReportScheduleConfig,
    type FinancialReportSections,
    type FinancialReportLocaleMode,
    DEFAULT_FINANCIAL_REPORT_SCHEDULE,
    DEFAULT_FINANCIAL_REPORT_SECTIONS,
    normalizeFinancialReportSchedule,
} from '@app/shared';
import { StorageService } from '../services/storageService.js';
import { ConfigService } from '../services/configService.js';
import { AiService } from '../services/aiService.js';
import { SchedulerService } from '../services/schedulerService.js';
import { generateFinancialPdfBuffer } from '../services/financialPdfReportService.js';
import { serviceLogger as logger } from '../utils/logger.js';

function coerceSections(raw: unknown): FinancialReportSections {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_FINANCIAL_REPORT_SECTIONS };
    const o = raw as Record<string, unknown>;
    return {
        kpis: o.kpis !== false,
        categoryBreakdown: o.categoryBreakdown !== false,
        topMerchants: o.topMerchants !== false,
        executiveSummary: o.executiveSummary !== false,
        insights: o.insights !== false,
        metaSpend: o.metaSpend === true,
    };
}

function coerceLocale(raw: unknown): FinancialReportLocaleMode {
    if (raw === 'he' || raw === 'en' || raw === 'bilingual') return raw;
    return 'bilingual';
}

export function createReportRoutes(schedulerService: SchedulerService) {
    const router = Router();
    const storageService = new StorageService();
    const configService = new ConfigService();

    router.get('/settings', (_req, res) => {
        try {
            const cfg = schedulerService.getConfig();
            const fr = normalizeFinancialReportSchedule(
                cfg.financialReportSchedule ?? { ...DEFAULT_FINANCIAL_REPORT_SCHEDULE }
            );
            res.json({ success: true, data: { financialReportSchedule: fr } });
        } catch (e: any) {
            logger.error('GET /api/reports/settings failed', { error: e });
            res.status(500).json({ success: false, error: e?.message || 'Failed to load report settings' });
        }
    });

    router.patch('/settings', (req, res) => {
        try {
            const body = req.body || {};
            const current = schedulerService.getConfig();
            const prev = normalizeFinancialReportSchedule(
                current.financialReportSchedule ?? { ...DEFAULT_FINANCIAL_REPORT_SCHEDULE }
            );
            const next: FinancialReportScheduleConfig = normalizeFinancialReportSchedule({
                ...prev,
                ...body,
                sections: body.sections ? coerceSections(body.sections) : prev.sections,
                localeMode: body.localeMode !== undefined ? coerceLocale(body.localeMode) : prev.localeMode,
                scheduledMonthRule:
                    body.scheduledMonthRule === 'current_calendar_month'
                        ? 'current_calendar_month'
                        : body.scheduledMonthRule === 'previous_calendar_month'
                          ? 'previous_calendar_month'
                          : prev.scheduledMonthRule,
            });
            schedulerService.updateConfig({ financialReportSchedule: next });
            res.json({
                success: true,
                data: { financialReportSchedule: schedulerService.getConfig().financialReportSchedule },
            });
        } catch (e: any) {
            logger.error('PATCH /api/reports/settings failed', { error: e });
            res.status(500).json({ success: false, error: e?.message || 'Failed to save report settings' });
        }
    });

    router.post('/financial-pdf', async (req, res) => {
        try {
            const body = req.body || {};
            const monthYm = typeof body.month === 'string' && /^\d{4}-\d{2}$/.test(body.month) ? body.month : null;
            if (!monthYm) {
                return res.status(400).json({ success: false, error: 'Invalid or missing month (YYYY-MM)' });
            }
            const cfg = schedulerService.getConfig();
            const saved = normalizeFinancialReportSchedule(
                cfg.financialReportSchedule ?? { ...DEFAULT_FINANCIAL_REPORT_SCHEDULE }
            );
            const localeMode = body.localeMode !== undefined ? coerceLocale(body.localeMode) : saved.localeMode;
            const sections = body.sections ? coerceSections(body.sections) : saved.sections;

            const aiService = new AiService();
            const pdf = await generateFinancialPdfBuffer(storageService, configService, aiService, {
                monthYm,
                localeMode,
                sections,
            });
            const filename = `financial-report-${monthYm}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(pdf);
        } catch (e: any) {
            logger.error('POST /api/reports/financial-pdf failed', { error: e });
            res.status(500).json({ success: false, error: e?.message || 'PDF generation failed' });
        }
    });

    return router;
}
