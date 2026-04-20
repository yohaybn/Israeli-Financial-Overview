import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
    INSIGHT_RULES_EXPORT_FORMAT,
    maskInsightRuleDefinitionForExport,
    parseInsightRuleDefinition,
    parseInsightRulesExportDocument,
    evaluateInsightRuleDefinition,
    applyMessageTemplates,
    type InsightRuleDefinitionV1,
    type InsightRuleSource,
} from '@app/shared';
import { DbService } from '../services/dbService.js';
import { StorageService } from '../services/storageService.js';
import { refreshInsightRuleFires } from '../services/insightRulesService.js';
import { AiService } from '../services/aiService.js';

const router = Router();
const dbService = new DbService();
const storageService = new StorageService();
const aiService = new AiService();

router.get('/', (_req, res) => {
    try {
        const data = dbService.listInsightRules();
        res.json({ success: true, data });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.get('/export', (req, res) => {
    try {
        const rules = dbService.listInsightRules();
        const maskAmounts = req.query.maskAmounts !== 'false' && req.query.maskAmounts !== '0';
        const doc = {
            format: INSIGHT_RULES_EXPORT_FORMAT,
            version: 1,
            exportedAt: new Date().toISOString(),
            rules: rules.map((r) => ({
                id: r.id,
                name: r.name,
                enabled: r.enabled,
                priority: r.priority,
                source: r.source,
                definition: maskAmounts ? maskInsightRuleDefinitionForExport(r.definition) : r.definition,
            })),
        };
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="insight-rules.json"');
        res.send(JSON.stringify(doc, null, 2));
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post('/import', async (req, res) => {
    try {
        const merge = req.body?.merge !== false;
        const parsed = parseInsightRulesExportDocument(req.body);
        if (!parsed.ok) {
            return res.status(400).json({ success: false, error: parsed.error });
        }
        const { rules } = parsed.value;
        if (!merge) {
            dbService.clearAllInsightRules();
        }
        let imported = 0;
        for (const r of rules) {
            const defParsed = parseInsightRuleDefinition(r.definition);
            if (!defParsed.ok) {
                return res.status(400).json({ success: false, error: `Rule ${r.name}: ${defParsed.error}` });
            }
            const existing = merge ? dbService.getInsightRule(r.id) : undefined;
            if (existing) {
                dbService.updateInsightRule(r.id, {
                    name: r.name,
                    enabled: r.enabled,
                    priority: r.priority,
                    source: r.source,
                    definition: defParsed.value,
                });
            } else {
                dbService.insertInsightRule(r.id, r.name, r.enabled, r.priority, r.source, defParsed.value);
            }
            imported++;
        }
        const txns = await storageService.getAllTransactions(true);
        refreshInsightRuleFires(txns, dbService);
        res.json({ success: true, data: { imported } });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post('/ai-draft', async (req, res) => {
    try {
        const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
        if (!description) {
            return res.status(400).json({ success: false, error: 'description required' });
        }
        const data = await aiService.suggestInsightRuleDraft(description);
        res.json({ success: true, data: { ...data, source: 'ai' as const } });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post('/refresh', async (_req, res) => {
    try {
        const txns = await storageService.getAllTransactions(true);
        const r = refreshInsightRuleFires(txns, dbService);
        res.json({ success: true, data: r });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post('/', (req, res) => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!name) {
            return res.status(400).json({ success: false, error: 'name required' });
        }
        const enabled = req.body?.enabled !== false;
        const priority = typeof req.body?.priority === 'number' ? Math.round(req.body.priority) : 0;
        const source = (req.body?.source === 'ai' ? 'ai' : 'user') as InsightRuleSource;
        const defParsed = parseInsightRuleDefinition(req.body?.definition);
        if (!defParsed.ok) {
            return res.status(400).json({ success: false, error: defParsed.error });
        }
        const id = uuidv4();
        dbService.insertInsightRule(id, name, enabled, priority, source, defParsed.value);
        const row = dbService.getInsightRule(id);
        res.json({ success: true, data: row });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.delete('/fires/:fireId', (req, res) => {
    try {
        const { fireId } = req.params;
        const ok = dbService.deleteInsightRuleFire(fireId);
        if (!ok) {
            return res.status(404).json({ success: false, error: 'Fire not found' });
        }
        res.json({ success: true });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const existing = dbService.getInsightRule(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }
        const updates: {
            name?: string;
            enabled?: boolean;
            priority?: number;
            source?: InsightRuleSource;
            definition?: InsightRuleDefinitionV1;
        } = {};
        if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
        if (typeof req.body?.enabled === 'boolean') updates.enabled = req.body.enabled;
        if (typeof req.body?.priority === 'number') updates.priority = Math.round(req.body.priority);
        if (req.body?.source === 'ai' || req.body?.source === 'user') updates.source = req.body.source;
        if (req.body?.definition !== undefined) {
            const defParsed = parseInsightRuleDefinition(req.body.definition);
            if (!defParsed.ok) {
                return res.status(400).json({ success: false, error: defParsed.error });
            }
            updates.definition = defParsed.value;
        }
        dbService.updateInsightRule(id, updates);
        const row = dbService.getInsightRule(id);
        res.json({ success: true, data: row });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const ok = dbService.deleteInsightRule(id);
        if (!ok) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }
        res.json({ success: true });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post('/:id/evaluate', async (req, res) => {
    try {
        const { id } = req.params;
        const rule = dbService.getInsightRule(id);
        if (!rule) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }
        const txns = await storageService.getAllTransactions(true);
        const ref = new Date();
        const ev = evaluateInsightRuleDefinition(txns, rule.definition, { referenceDate: ref });
        if (!ev.matched) {
            return res.json({
                success: true,
                data: { matched: false, placeholders: {}, messageEn: '', messageHe: '' },
            });
        }
        const { en, he } = applyMessageTemplates(rule.definition.output, ev.placeholders, {
            referenceDate: ref,
            definition: rule.definition,
        });
        res.json({
            success: true,
            data: {
                matched: true,
                placeholders: ev.placeholders,
                messageEn: en,
                messageHe: he,
                kind: rule.definition.output.kind,
                score: rule.definition.output.score,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

export { router as insightRulesRoutes };
