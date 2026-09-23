/**
 * AI service facade.
 *
 * The implementation is split by domain under services/ai/:
 * - core.ts: Gemini client, settings lifecycle and shared prompt/format helpers
 * - categorization.ts: transaction categorization
 * - analystChat.ts: plain/structured/super-privacy analyst chats
 * - reports.ts: financial report narratives
 * - documents.ts: document parsing
 * - persona.ts: persona extraction
 * - insightRules.ts: insight rule drafts
 * - charts.ts: user charts and SQL analytic cards
 *
 * This module keeps the original public API so existing importers are unchanged.
 */
import { AiServiceCore } from './ai/core.js';
import { AiCategorization } from './ai/categorization.js';
import { AiAnalystChat } from './ai/analystChat.js';
import { AiReports } from './ai/reports.js';
import { AiDocuments } from './ai/documents.js';
import { AiPersona } from './ai/persona.js';
import { AiInsightRules } from './ai/insightRules.js';
import { AiCharts } from './ai/charts.js';

export * from './ai/types.js';
export type { AnalystPrivacyMode } from './analystPrivacyMode.js';

export class AiService {
    private core: AiServiceCore;
    private categorization: AiCategorization;
    private analystChat: AiAnalystChat;
    private reports: AiReports;
    private documents: AiDocuments;
    private persona: AiPersona;
    private insightRules: AiInsightRules;
    private charts: AiCharts;

    constructor() {
        this.core = new AiServiceCore();
        this.categorization = new AiCategorization(this.core);
        this.analystChat = new AiAnalystChat(this.core);
        this.reports = new AiReports(this.core);
        this.documents = new AiDocuments(this.core);
        this.persona = new AiPersona(this.core);
        this.insightRules = new AiInsightRules(this.core);
        this.charts = new AiCharts(this.core);
    }

    hasApiKey(): boolean {
        return this.core.hasApiKey();
    }

    async getSettings(...args: Parameters<AiServiceCore['getSettings']>) {
        return this.core.getSettings(...args);
    }

    async updateSettings(...args: Parameters<AiServiceCore['updateSettings']>) {
        return this.core.updateSettings(...args);
    }

    async getAvailableModels(...args: Parameters<AiServiceCore['getAvailableModels']>) {
        return this.core.getAvailableModels(...args);
    }

    async categorizeTransactions(...args: Parameters<AiCategorization['categorizeTransactions']>) {
        return this.categorization.categorizeTransactions(...args);
    }

    async analyzeData(...args: Parameters<AiAnalystChat['analyzeData']>) {
        return this.analystChat.analyzeData(...args);
    }

    async analyzeDataStructured(...args: Parameters<AiAnalystChat['analyzeDataStructured']>) {
        return this.analystChat.analyzeDataStructured(...args);
    }

    async analyzeDataSuperPrivacy(...args: Parameters<AiAnalystChat['analyzeDataSuperPrivacy']>) {
        return this.analystChat.analyzeDataSuperPrivacy(...args);
    }

    async generateFinancialReportNarrative(...args: Parameters<AiReports['generateFinancialReportNarrative']>) {
        return this.reports.generateFinancialReportNarrative(...args);
    }

    async generateFinancialMonthComparisonNarrative(...args: Parameters<AiReports['generateFinancialMonthComparisonNarrative']>) {
        return this.reports.generateFinancialMonthComparisonNarrative(...args);
    }

    async parseDocument(...args: Parameters<AiDocuments['parseDocument']>) {
        return this.documents.parseDocument(...args);
    }

    async updateCategoryInCache(...args: Parameters<AiCategorization['updateCategoryInCache']>) {
        return this.categorization.updateCategoryInCache(...args);
    }

    async extractPersonaFromNarrative(...args: Parameters<AiPersona['extractPersonaFromNarrative']>) {
        return this.persona.extractPersonaFromNarrative(...args);
    }

    async suggestInsightRuleDraft(...args: Parameters<AiInsightRules['suggestInsightRuleDraft']>) {
        return this.insightRules.suggestInsightRuleDraft(...args);
    }

    async generateUserChart(...args: Parameters<AiCharts['generateUserChart']>) {
        return this.charts.generateUserChart(...args);
    }

    async generateSqlAnalyticCard(...args: Parameters<AiCharts['generateSqlAnalyticCard']>) {
        return this.charts.generateSqlAnalyticCard(...args);
    }
}
