import { http, HttpResponse } from 'msw';
import {
    Profile,
    PROVIDERS,
    mergeProfileCredentialsOnUpdate,
    sanitizeProfileForClient,
    transactionsToCsv,
    transactionsToJson,
} from '@app/shared';
import {
    DEMO_SAMPLE_FILENAME,
    demoAiSettings,
    demoDashboardConfig,
    demoGlobalScrapeConfig,
    demoProfiles,
    demoScrapeResultFile,
    demoScrapeResultList,
    demoTopInsights,
    demoTransactions,
} from './sampleData';

function apiPath(path: string) {
    return ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        return url.pathname.endsWith(`/api${path}`);
    };
}

const emptyOk = () => HttpResponse.json({ success: true });

/** In-memory app lock for demo: any non-empty password unlocks. */
let demoAppLockConfigured = false;
let demoAppLockUnlocked = true;

function demoAppLockStatusResponse() {
    return HttpResponse.json({
        success: true,
        data: {
            lockConfigured: demoAppLockConfigured,
            unlocked: demoAppLockUnlocked,
            restricted: demoAppLockConfigured && !demoAppLockUnlocked,
        },
    });
}

/** Single scrape file: pathname is /<base>/api/results/<filename> (e.g. GitHub Pages base). */
function isSingleScrapeResultFilePath(pathname: string): boolean {
    const marker = '/api/results/';
    const idx = pathname.lastIndexOf(marker);
    if (idx === -1) return false;
    const filename = pathname.slice(idx + marker.length);
    if (!filename || filename.includes('/')) return false;
    if (filename === 'all') return false;
    return true;
}

export const demoHandlers = [
    http.get(apiPath('/app-lock/status'), () => demoAppLockStatusResponse()),

    http.post(apiPath('/app-lock/unlock'), async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { password?: string };
        const password = typeof body.password === 'string' ? body.password : '';
        if (!password) {
            return HttpResponse.json({ success: false, error: 'password is required' }, { status: 400 });
        }
        demoAppLockUnlocked = true;
        return HttpResponse.json({
            success: true,
            migratedProfiles: 0,
            migrationSkipped: true,
        });
    }),

    http.post(apiPath('/app-lock/lock'), () => {
        demoAppLockUnlocked = false;
        return HttpResponse.json({ success: true });
    }),

    http.post(apiPath('/app-lock/setup'), async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { password?: string };
        const password = typeof body.password === 'string' ? body.password : '';
        if (!password) {
            return HttpResponse.json({ success: false, error: 'password is required' }, { status: 400 });
        }
        if (demoAppLockConfigured) {
            return HttpResponse.json(
                { success: false, error: 'App lock is already configured' },
                { status: 400 }
            );
        }
        if (password.length < 8) {
            return HttpResponse.json(
                { success: false, error: 'Password must be at least 8 characters' },
                { status: 400 }
            );
        }
        demoAppLockConfigured = true;
        demoAppLockUnlocked = true;
        return HttpResponse.json({
            success: true,
            migratedProfiles: 0,
            migrationSkipped: true,
        });
    }),

    http.get(apiPath('/results/all'), () =>
        HttpResponse.json({
            success: true,
            transactions: demoTransactions,
        })
    ),

    http.get(apiPath('/results/export'), ({ request }) => {
        const url = new URL(request.url);
        const format = url.searchParams.get('format') || 'json';
        const month = url.searchParams.get('month');
        if (month && !/^\d{4}-\d{2}$/.test(month)) {
            return HttpResponse.json({ success: false, error: 'Invalid month. Use YYYY-MM.' }, { status: 400 });
        }
        let txns = demoTransactions;
        if (month) {
            txns = demoTransactions.filter((t) => t.date.startsWith(month));
        }
        const stamp = new Date().toISOString().slice(0, 10);
        const fileBase = month ? `transactions-${month}` : `transactions-${stamp}`;
        if (format === 'csv') {
            return new HttpResponse(transactionsToCsv(txns), {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${fileBase}.csv"`,
                },
            });
        }
        if (format === 'json') {
            return new HttpResponse(transactionsToJson(txns), {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${fileBase}.json"`,
                },
            });
        }
        return HttpResponse.json({ success: false, error: 'Invalid format. Use csv or json.' }, { status: 400 });
    }),

    http.get(apiPath('/results'), () =>
        HttpResponse.json({
            success: true,
            data: demoScrapeResultList,
        })
    ),

    http.get(({ request }) => {
        const p = new URL(request.url).pathname;
        return isSingleScrapeResultFilePath(p);
    }, () =>
        HttpResponse.json({
            success: true,
            data: demoScrapeResultFile(),
        })
    ),

    http.get(apiPath('/ai/settings'), () =>
        HttpResponse.json({ success: true, data: demoAiSettings })
    ),

    http.post(apiPath('/ai/settings'), async () =>
        HttpResponse.json({ success: true, data: demoAiSettings })
    ),

    http.get(apiPath('/config/dashboard'), () =>
        HttpResponse.json({ success: true, data: demoDashboardConfig })
    ),

    http.post(apiPath('/config/dashboard'), async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as object;
        return HttpResponse.json({ success: true, data: { ...demoDashboardConfig, ...body } });
    }),

    http.get(apiPath('/definitions'), () =>
        HttpResponse.json({ success: true, data: PROVIDERS })
    ),

    http.get(apiPath('/profiles'), () =>
        HttpResponse.json({ success: true, data: demoProfiles.map(sanitizeProfileForClient) })
    ),

    http.get(({ request }) => {
        const p = new URL(request.url).pathname;
        return /^\/api\/profiles\/[^/]+$/.test(p);
    }, ({ request }) => {
        const id = new URL(request.url).pathname.split('/').pop()!;
        const profile = demoProfiles.find((x) => x.id === id);
        if (!profile) {
            return HttpResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
        }
        return HttpResponse.json({ success: true, data: sanitizeProfileForClient(profile) });
    }),

    http.put(
        ({ request }) => {
            const p = new URL(request.url).pathname;
            return /^\/api\/profiles\/[^/]+$/.test(p);
        },
        async ({ request }) => {
            const id = new URL(request.url).pathname.split('/').pop()!;
            const profile = demoProfiles.find((x) => x.id === id);
            if (!profile) {
                return HttpResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
            }
            const body = (await request.json().catch(() => ({}))) as Partial<Profile>;
            if (body.name !== undefined) profile.name = body.name;
            if (body.options !== undefined) {
                profile.options = { ...profile.options, ...body.options };
            }
            if (body.credentials !== undefined) {
                profile.credentials = mergeProfileCredentialsOnUpdate(
                    profile.credentials,
                    body.credentials,
                    profile.companyId
                );
            }
            profile.updatedAt = new Date().toISOString();
            return HttpResponse.json({ success: true, data: sanitizeProfileForClient(profile) });
        }
    ),

    http.get(apiPath('/post-scrape/review-alert'), () =>
        HttpResponse.json({ success: true, data: null })
    ),

    http.delete(apiPath('/post-scrape/review-alert'), () => emptyOk()),

    http.get(apiPath('/ai/memory/insights/top'), () =>
        HttpResponse.json({ success: true, data: demoTopInsights })
    ),

    http.get(apiPath('/insight-rules'), () => HttpResponse.json({ success: true, data: [] })),

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

    http.get(apiPath('/config'), () =>
        HttpResponse.json({ success: true, data: demoGlobalScrapeConfig })
    ),

    http.put(apiPath('/config'), async () =>
        HttpResponse.json({ success: true, data: demoGlobalScrapeConfig })
    ),

    http.get(apiPath('/filters'), () => HttpResponse.json({ success: true, data: [] })),

    http.get(apiPath('/ai/models'), () =>
        HttpResponse.json({ success: true, data: ['gemini-2.0-flash'] })
    ),

    http.get(apiPath('/auth/google/status'), () =>
        HttpResponse.json({ success: true, data: { authenticated: false } })
    ),

    http.get(apiPath('/auth/google/config-status'), () =>
        HttpResponse.json({ success: true, data: { configured: false } })
    ),

    http.get(apiPath('/auth/google/settings'), () =>
        HttpResponse.json({ success: true, data: {} })
    ),

    http.get(apiPath('/auth/google/url'), () =>
        HttpResponse.json({ success: true, data: 'https://example.com/oauth' })
    ),

    http.get(apiPath('/scheduler/config'), () =>
        HttpResponse.json({ success: true, data: { enabled: false } })
    ),

    http.get(apiPath('/config/env'), () =>
        HttpResponse.json({
            success: true,
            data: {
                GEMINI_API_KEY: '',
                GOOGLE_CLIENT_ID: '',
                GOOGLE_CLIENT_SECRET: '',
                GOOGLE_REDIRECT_URI: '',
                DRIVE_FOLDER_ID: '',
                PORT: '3001',
                DATA_DIR: '',
            },
        })
    ),

    http.post(apiPath('/config/env'), () => emptyOk()),
    http.post(apiPath('/config/restart'), () => emptyOk()),

    http.get(apiPath('/notifications/channels'), () =>
        HttpResponse.json({ success: true, data: ['console'] })
    ),

    http.get(apiPath('/telegram/status'), () =>
        HttpResponse.json({
            success: true,
            data: { isActive: false, hasToken: true, usersConfigured: false },
        })
    ),

    http.get(apiPath('/telegram/bot-info'), () =>
        HttpResponse.json({
            success: true,
            data: { id: 0, firstName: 'Demo Bot', username: 'demo_bot', openTelegramUrl: 'https://t.me/demo_bot', hasAvatar: false },
        })
    ),

    http.get(apiPath('/telegram/bot-avatar'), () => new HttpResponse(null, { status: 404 })),

    http.get(apiPath('/post-scrape/config'), () =>
        HttpResponse.json({
            success: true,
            data: demoGlobalScrapeConfig.postScrapeConfig,
        })
    ),

    http.put(apiPath('/post-scrape/config'), async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        return HttpResponse.json({
            success: true,
            data: body,
        });
    }),

    http.get(apiPath('/telegram/config'), () =>
        HttpResponse.json({
            success: true,
            data: {
                botToken: '***demo12345',
                chatId: '',
                allowedUsers: [],
            },
        })
    ),

    http.post(apiPath('/telegram/config'), () =>
        HttpResponse.json({ success: true, message: 'Configuration updated' })
    ),

    http.get(apiPath('/sheets/folder-config'), () =>
        HttpResponse.json({ success: true, data: { folderId: '', folderName: '' } })
    ),

    http.get(apiPath('/sheets/drive-folders'), () =>
        HttpResponse.json({
            success: true,
            data: [
                {
                    id: 'demo-drive-root',
                    name: 'Demo Bank Exports',
                    mimeType: 'application/vnd.google-apps.folder',
                },
            ],
        })
    ),

    http.get(({ request }) => {
        const p = new URL(request.url).pathname;
        const marker = '/api/sheets/drive-folder-contents/';
        const idx = p.lastIndexOf(marker);
        if (idx === -1) return false;
        const folderId = p.slice(idx + marker.length);
        return folderId.length > 0 && !folderId.includes('/');
    }, () =>
        HttpResponse.json({
            success: true,
            data: {
                folders: [
                    {
                        id: 'demo-drive-nested',
                        name: 'Demo Subfolder',
                        mimeType: 'application/vnd.google-apps.folder',
                    },
                ],
                files: [],
                allItems: [
                    {
                        id: 'demo-drive-nested',
                        name: 'Demo Subfolder',
                        mimeType: 'application/vnd.google-apps.folder',
                    },
                ],
            },
        })
    ),

    http.get(apiPath('/sheets/list'), () => HttpResponse.json({ success: true, data: [] })),

    http.post(apiPath('/scrape'), async () =>
        HttpResponse.json({
            success: true,
            data: demoScrapeResultFile(),
            filename: DEMO_SAMPLE_FILENAME,
        })
    ),

    http.post(apiPath('/ai/chat/unified'), async () =>
        HttpResponse.json({
            success: true,
            data: {
                response:
                    'זוהי **תשובת הדגמה**. כדי להשתמש בצ׳אט AI על הנתונים האמיתיים שלך, הפעל את האפליקציה המלאה מול שרת.',
                factsAdded: 0,
                insightsAdded: 0,
                alertsAdded: 0,
            },
        })
    ),

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
