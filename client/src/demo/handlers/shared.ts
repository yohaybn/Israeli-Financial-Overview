import { HttpResponse } from 'msw';
import { demoScrapeResultCurrentMonth } from '../sampleData';

export function apiPath(path: string) {
    return ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        return url.pathname.endsWith(`/api${path}`);
    };
}

export const emptyOk = () => HttpResponse.json({ success: true });

let lastScrapeResult = demoScrapeResultCurrentMonth();

export function getLastScrapeResult() {
    return lastScrapeResult;
}

export function resetLastScrapeResult() {
    lastScrapeResult = demoScrapeResultCurrentMonth();
    return lastScrapeResult;
}
