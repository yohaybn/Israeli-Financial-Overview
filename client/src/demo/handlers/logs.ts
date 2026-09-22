import { http, HttpResponse } from 'msw';
import { apiPath, emptyOk } from './shared';

export const logDemoHandlers = [
    http.get(apiPath('/logs'), () =>
        HttpResponse.json({
            type: 'server',
            lines: '[demo] Sample log line\n',
            totalLines: 1,
        })
    ),

    http.get(apiPath('/logs/level'), () =>
        HttpResponse.json({ level: 'info' })
    ),

    http.post(apiPath('/logs/level'), () => emptyOk()),
    http.post(apiPath('/logs/clear'), () => HttpResponse.json({ success: true, type: 'server' })),

    http.get(apiPath('/scrape-logs/logs'), () =>
        HttpResponse.json({
            success: true,
            data: { logs: [], total: 0, offset: 0, limit: 50 },
        })
    ),
    http.get(({ request }) => {
        const url = new URL(request.url);
        return /\/api\/scrape-logs\/logs\/by-file\/[^/]+$/.test(url.pathname);
    }, ({ request }) => {
        const filename = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '');
        return HttpResponse.json({
            success: true,
            data: {
                id: 'scrape-demo-log',
                timestamp: new Date().toISOString(),
                pipelineId: 'demo-pipeline',
                kind: 'single',
                transactionCount: 0,
                scrapeSuccess: true,
                savedFilename: filename,
                actions: [],
                overallPostScrape: 'ok',
            },
        });
    }),
    http.get(({ request }) => {
        const url = new URL(request.url);
        return /\/api\/scrape-logs\/logs\/entry\/[^/]+$/.test(url.pathname);
    }, ({ request }) => {
        const id = new URL(request.url).pathname.split('/').pop() || 'demo';
        return HttpResponse.json({
            success: true,
            data: {
                id,
                timestamp: new Date().toISOString(),
                pipelineId: 'demo-pipeline',
                kind: 'single',
                transactionCount: 0,
                scrapeSuccess: true,
                actions: [],
                overallPostScrape: 'ok',
            },
        });
    }),
    http.get(({ request }) => {
        const url = new URL(request.url);
        return /\/api\/ai-logs\/logs\/entry\/[^/]+$/.test(url.pathname);
    }, () =>
        HttpResponse.json({ success: false, error: 'not found' }, { status: 404 })
    ),
    http.post(apiPath('/scrape-logs/logs/clear-old'), () => emptyOk()),
    http.post(apiPath('/scrape-logs/logs/clear'), () => emptyOk()),

];
