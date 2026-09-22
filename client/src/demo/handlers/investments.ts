import { http, HttpResponse } from 'msw';
import {
    demoInvestments,
    getDemoInvestmentAppSettings,
    getDemoInvestmentPriceHistory,
    getDemoPortfolioSummary,
    getDemoPortfolioValueHistory,
    getDemoSnapshotSettings,
    getDemoSymbolSearchHits,
} from '../investmentDemoData';
import { apiPath } from './shared';

export const investmentDemoHandlers = [
    http.get(apiPath('/investments/app-settings'), () =>
        HttpResponse.json({ success: true, data: getDemoInvestmentAppSettings() })
    ),

    http.patch(apiPath('/investments/app-settings'), () =>
        HttpResponse.json({ success: true, data: getDemoInvestmentAppSettings() })
    ),

    http.get(apiPath('/investments'), () =>
        HttpResponse.json({ success: true, data: demoInvestments })
    ),

    http.get(apiPath('/investments/summary'), () =>
        HttpResponse.json({ success: true, data: getDemoPortfolioSummary() })
    ),

    http.get(apiPath('/investments/snapshot-settings'), () =>
        HttpResponse.json({ success: true, data: getDemoSnapshotSettings() })
    ),

    http.patch(apiPath('/investments/snapshot-settings'), () =>
        HttpResponse.json({ success: true, data: getDemoSnapshotSettings() })
    ),

    http.get(apiPath('/investments/symbol-search'), ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? '';
        return HttpResponse.json({
            success: true,
            data: { query: q, hits: getDemoSymbolSearchHits(q) },
        });
    }),

    http.get(({ request }) => {
        const p = new URL(request.url).pathname;
        return p.endsWith('/api/investments/value-history');
    }, ({ request }) => {
        const url = new URL(request.url);
        const from = url.searchParams.get('from') ?? undefined;
        const to = url.searchParams.get('to') ?? undefined;
        return HttpResponse.json({
            success: true,
            data: getDemoPortfolioValueHistory(from, to),
        });
    }),

    http.get(({ request }) => {
        const p = new URL(request.url).pathname;
        const marker = '/api/investments/';
        const idx = p.lastIndexOf(marker);
        if (idx === -1) return false;
        const rest = p.slice(idx + marker.length);
        if (!rest.endsWith('/price-history')) return false;
        const id = rest.slice(0, -'/price-history'.length);
        return id.length > 0 && !id.includes('/');
    }, ({ request }) => {
        const p = new URL(request.url).pathname;
        const marker = '/api/investments/';
        const rest = p.slice(p.lastIndexOf(marker) + marker.length);
        const id = rest.replace(/\/price-history$/, '');
        const data = getDemoInvestmentPriceHistory(id);
        if (!data) {
            return HttpResponse.json({ success: false, error: 'not_found' }, { status: 404 });
        }
        return HttpResponse.json({ success: true, data });
    }),

    http.post(apiPath('/investments'), async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const symbol = String(body.symbol ?? 'DEMO').toUpperCase();
        const id = `demo-inv-${Date.now()}`;
        const created = {
            id,
            userId: 'default',
            symbol,
            quantity: Number(body.quantity) || 1,
            purchasePricePerUnit: Number(body.purchase_price_per_unit ?? body.purchasePricePerUnit) || 100,
            currency: String(body.currency ?? 'USD').toUpperCase(),
            trackFromDate: String(body.track_from_date ?? body.trackFromDate ?? new Date().toISOString().slice(0, 10)),
            useTelAvivListing: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        demoInvestments.push(created);
        return HttpResponse.json({ success: true, data: created });
    }),

    http.delete(({ request }) => {
        const p = new URL(request.url).pathname;
        const marker = '/api/investments/';
        const idx = p.lastIndexOf(marker);
        if (idx === -1) return false;
        const id = p.slice(idx + marker.length);
        const reserved = new Set([
            'app-settings',
            'summary',
            'snapshot-settings',
            'symbol-search',
            'value-history',
            'history',
            'snapshot',
        ]);
        return id.length > 0 && !id.includes('/') && !reserved.has(id);
    }, ({ request }) => {
        const p = new URL(request.url).pathname;
        const id = p.slice(p.lastIndexOf('/api/investments/') + '/api/investments/'.length);
        const idx = demoInvestments.findIndex((x) => x.id === id);
        if (idx === -1) {
            return HttpResponse.json({ success: false, error: 'not_found' }, { status: 404 });
        }
        demoInvestments.splice(idx, 1);
        return HttpResponse.json({ success: true });
    }),

];
