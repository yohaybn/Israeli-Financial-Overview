import { http, HttpResponse } from 'msw';

export const fallbackDemoHandlers = [
    http.all('*/api/*', async ({ request }) => {
        const method = request.method;
        if (method === 'GET') {
            return HttpResponse.json({ success: true, data: [] });
        }
        if (method === 'DELETE') {
            return HttpResponse.json({ success: true });
        }
        return HttpResponse.json({ success: true });
    }),
];
