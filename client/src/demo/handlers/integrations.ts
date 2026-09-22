import { http, HttpResponse } from 'msw';
import { demoChatReply } from '../chatDemoData';
import { demoGlobalScrapeConfig, getDemoCurrentMonthScrapeFilename } from '../sampleData';
import { apiPath, emptyOk, resetLastScrapeResult } from './shared';

export const integrationDemoHandlers = [
    http.get(apiPath('/community/insight-rules/config'), () =>
        HttpResponse.json({ success: true, data: { submitViaProxy: true } })
    ),

    http.post(apiPath('/community/insight-rules/submit'), () =>
        HttpResponse.json({ success: true, data: { ok: true, data: { rulePath: 'demo' } } })
    ),

    http.get(apiPath('/config'), () =>
        HttpResponse.json({ success: true, data: demoGlobalScrapeConfig })
    ),

    http.put(apiPath('/config'), async () =>
        HttpResponse.json({ success: true, data: demoGlobalScrapeConfig })
    ),

    http.get(apiPath('/budget-export/status'), () =>
        HttpResponse.json({
            success: true,
            data: {
                firefly: false,
                lunchMoney: false,
                ynab: { configured: false, oauthReady: false },
                actual: false,
            },
        })
    ),

    http.get(apiPath('/budget-export/public-config'), () =>
        HttpResponse.json({ success: true, data: demoGlobalScrapeConfig.postScrapeConfig.budgetExports || {} })
    ),

    http.put(apiPath('/budget-export/public-config'), async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        return HttpResponse.json({ success: true, data: body });
    }),

    http.post(apiPath('/budget-export/secrets'), () => HttpResponse.json({ success: true })),

    http.get(apiPath('/budget-export/ynab/authorize-url'), () =>
        HttpResponse.json({ success: true, data: { url: 'https://app.ynab.com/oauth/authorize?demo=1' } })
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
        HttpResponse.json({
            success: true,
            data: {
                enabled: false,
                scrapeOnceOnUnlockOrStartup: false,
                insightRulesSchedule: {
                    enabled: false,
                    scheduleType: 'daily',
                    runTime: '10:00',
                    cronExpression: '0 10 * * *'
                }
            }
        })
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
                PORT: '3000',
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

    http.get(apiPath('/mqtt/config'), () =>
        HttpResponse.json({
            success: true,
            data: { enabled: false, brokerUrl: '', topic: '', password: '' },
        })
    ),
    http.post(apiPath('/mqtt/config'), () =>
        HttpResponse.json({ success: true, message: 'OK', data: { enabled: false } })
    ),
    http.get(apiPath('/mqtt/status'), () =>
        HttpResponse.json({
            success: true,
            data: { connected: false, lastError: null, brokerHost: null },
        })
    ),
    http.post(apiPath('/mqtt/test'), () => HttpResponse.json({ success: true, message: 'ok' })),

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

    http.post(apiPath('/scrape'), async () => {
        await new Promise((r) => setTimeout(r, 1100));
        const data = resetLastScrapeResult();
        const filename = getDemoCurrentMonthScrapeFilename();
        return HttpResponse.json({
            success: true,
            data,
            filename,
        });
    }),

    http.post(apiPath('/scrape/onezero/otp/trigger'), async () =>
        HttpResponse.json({
            success: true,
            sessionId: 'demo-onezero-otp-session',
        })
    ),

    http.post(apiPath('/scrape/onezero/otp/complete'), async ({ request }) => {
        const body = (await request.json()) as { profileId?: string };
        if (body.profileId) {
            return HttpResponse.json({ success: true, savedToProfile: true });
        }
        return HttpResponse.json({
            success: true,
            otpLongTermToken: 'demo-onezero-long-term-token',
        });
    }),

    http.post(apiPath('/ai/chat/unified'), async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
            query?: string;
            historyNote?: string;
        };
        const query = typeof body.query === 'string' ? body.query : '';
        const historyNote = typeof body.historyNote === 'string' ? body.historyNote : undefined;
        const { response, factsAdded, insightsAdded, alertsAdded } = demoChatReply(query, historyNote);
        return HttpResponse.json({
            success: true,
            data: { response, factsAdded, factsReplaced: 0, insightsAdded, alertsAdded },
        });
    }),

];
