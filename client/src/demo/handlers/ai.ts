import { http, HttpResponse } from 'msw';
import { demoMemoryAlerts, demoMemoryFacts, demoMemoryInsights } from '../chatDemoData';
import { demoTopInsights } from '../sampleData';
import { apiPath, emptyOk } from './shared';

export const aiDemoHandlers = [
    http.get(apiPath('/post-scrape/review-alert'), () =>
        HttpResponse.json({ success: true, data: null })
    ),

    http.delete(apiPath('/post-scrape/review-alert'), () => emptyOk()),

    http.get(apiPath('/ai/memory/insights/top'), () => {
        const merged = [...demoTopInsights, ...demoMemoryInsights]
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        return HttpResponse.json({ success: true, data: merged });
    }),

    http.get(apiPath('/ai/memory/facts'), () =>
        HttpResponse.json({ success: true, data: demoMemoryFacts })
    ),

    http.post(apiPath('/ai/memory/facts'), async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { text?: string };
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) {
            return HttpResponse.json({ success: false, error: 'text required' }, { status: 400 });
        }
        const id = `demo-fact-${Date.now()}`;
        const stamp = new Date().toISOString();
        demoMemoryFacts.push({ id, text, createdAt: stamp, updatedAt: stamp });
        return HttpResponse.json({ success: true, data: { id, text } });
    }),

    http.delete(apiPath('/ai/memory/facts'), () => {
        demoMemoryFacts.length = 0;
        return HttpResponse.json({ success: true, data: { removed: 0 } });
    }),

    http.delete(({ request }) => {
        const p = new URL(request.url).pathname;
        return /\/api\/ai\/memory\/facts\/[^/]+$/.test(p);
    }, ({ request }) => {
        const id = new URL(request.url).pathname.split('/').pop()!;
        const idx = demoMemoryFacts.findIndex((f) => f.id === id);
        if (idx === -1) {
            return HttpResponse.json({ success: false, error: 'Fact not found' }, { status: 404 });
        }
        demoMemoryFacts.splice(idx, 1);
        return HttpResponse.json({ success: true });
    }),

    http.get(apiPath('/ai/memory/insights'), () =>
        HttpResponse.json({ success: true, data: demoMemoryInsights })
    ),

    http.delete(apiPath('/ai/memory/insights'), () => {
        demoMemoryInsights.length = 0;
        return HttpResponse.json({ success: true, data: { removed: 0 } });
    }),

    http.delete(({ request }) => {
        const p = new URL(request.url).pathname;
        return /\/api\/ai\/memory\/insights\/[^/]+$/.test(p);
    }, ({ request }) => {
        const id = new URL(request.url).pathname.split('/').pop()!;
        const idx = demoMemoryInsights.findIndex((f) => f.id === id);
        if (idx === -1) {
            return HttpResponse.json({ success: false, error: 'Insight not found' }, { status: 404 });
        }
        demoMemoryInsights.splice(idx, 1);
        return HttpResponse.json({ success: true });
    }),

    http.get(apiPath('/ai/memory/alerts'), () =>
        HttpResponse.json({ success: true, data: demoMemoryAlerts })
    ),

    http.delete(apiPath('/ai/memory/alerts'), () => {
        demoMemoryAlerts.length = 0;
        return HttpResponse.json({ success: true, data: { removed: 0 } });
    }),

    http.delete(({ request }) => {
        const p = new URL(request.url).pathname;
        return /\/api\/ai\/memory\/alerts\/[^/]+$/.test(p);
    }, ({ request }) => {
        const id = new URL(request.url).pathname.split('/').pop()!;
        const idx = demoMemoryAlerts.findIndex((f) => f.id === id);
        if (idx === -1) {
            return HttpResponse.json({ success: false, error: 'Alert not found' }, { status: 404 });
        }
        demoMemoryAlerts.splice(idx, 1);
        return HttpResponse.json({ success: true });
    }),

    http.get(apiPath('/insight-rules'), () => HttpResponse.json({ success: true, data: [] })),

    http.get(apiPath('/insight-rules/export'), () =>
        HttpResponse.json({
            format: 'financial-overview-insight-rules',
            version: 1,
            exportedAt: new Date().toISOString(),
            rules: [],
        })
    ),

    http.post(apiPath('/insight-rules/refresh'), () => emptyOk()),

    http.post(apiPath('/insight-rules/import'), () => emptyOk()),

    http.post(apiPath('/insight-rules/ai-draft'), () =>
        HttpResponse.json({
            success: true,
            data: {
                name: 'Demo rule',
                source: 'ai',
                definition: JSON.parse(
                    '{"version":1,"scope":"current_month","condition":{"op":"txnCountGte","min":1},"output":{"kind":"insight","score":50,"message":{"en":"Demo","he":"דמו"}}}'
                ),
            },
        })
    ),

    http.post(apiPath('/ai/custom-charts/generate'), async () =>
        HttpResponse.json({
            success: true,
            data: {
                chart: {
                    id: 'demo-txn-chart-1',
                    title: 'Demo: expenses by category',
                    chartKind: 'bar',
                    groupBy: 'category',
                    measure: 'sum_expense',
                    dataScope: 'follow_analytics',
                },
            },
        })
    ),

    http.post(apiPath('/ai/sql-analytic-cards/generate'), async () => {
        const card = {
            id: 'demo-sql-card-1',
            title: 'Demo: spend by category',
            description: 'Sample AI SQL chart (demo mode)',
            chartKind: 'bar' as const,
            dataQueryKey: 'main',
            labelColumn: 'label',
            valueColumns: ['total'],
            queries: [
                {
                    key: 'main',
                    sql: "SELECT 'Food' AS label, 1200 AS total UNION SELECT 'Transport', 450",
                },
            ],
            createdAt: new Date().toISOString(),
        };
        const chartRows = [
            { label: 'Food', total: 1200 },
            { label: 'Transport', total: 450 },
        ];
        return HttpResponse.json({
            success: true,
            data: { card, chartRows, queryResults: { main: { rows: chartRows, columns: ['label', 'total'] } } },
        });
    }),

    http.post(apiPath('/ai/sql-analytic-cards/run'), async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
            card?: { valueColumns?: string[] };
        };
        const valueKey = body.card?.valueColumns?.[0] ?? 'total';
        const chartRows = [
            { label: 'Food', [valueKey]: 1200 },
            { label: 'Transport', [valueKey]: 450 },
        ];
        return HttpResponse.json({
            success: true,
            data: {
                chartRows,
                queryResults: { main: { rows: chartRows, columns: ['label', valueKey] } },
            },
        });
    }),

];
