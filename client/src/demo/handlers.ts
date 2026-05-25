import { http, HttpResponse } from 'msw';
import {
    type DashboardConfig,
    Profile,
    PROVIDERS,
    mergeDashboardSectionsVisibility,
    mergeProfileCredentialsOnUpdate,
    sanitizeProfileForClient,
    transactionsToCsv,
    transactionsToJson,
} from '@app/shared';
import {
    demoMemoryAlerts,
    demoMemoryFacts,
    demoMemoryInsights,
    demoChatReply,
} from './chatDemoData';
import {
    demoInvestments,
    getDemoInvestmentAppSettings,
    getDemoInvestmentPriceHistory,
    getDemoPortfolioSummary,
    getDemoPortfolioValueHistory,
    getDemoSnapshotSettings,
    getDemoSymbolSearchHits,
} from './investmentDemoData';
import {
    DEMO_SAMPLE_FILENAME,
    demoAiSettings,
    demoDashboardConfig,
    demoGlobalScrapeConfig,
    demoProfiles,
    demoScrapeResultFile,
    demoTopInsights,
    getDemoScrapeResultList,
    getDemoTransactions,
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
            transactions: getDemoTransactions(),
        })
    ),

    http.get(apiPath('/results/export'), ({ request }) => {
        const url = new URL(request.url);
        const format = url.searchParams.get('format') || 'json';
        const month = url.searchParams.get('month');
        if (month && !/^\d{4}-\d{2}$/.test(month)) {
            return HttpResponse.json({ success: false, error: 'Invalid month. Use YYYY-MM.' }, { status: 400 });
        }
        let txns = getDemoTransactions();
        if (month) {
            txns = txns.filter((t) => t.date.startsWith(month));
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
            data: getDemoScrapeResultList(),
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
        const body = (await request.json().catch(() => ({}))) as Partial<DashboardConfig>;
        const next: DashboardConfig = { ...demoDashboardConfig, ...body };
        if (body.sectionsVisibility != null && typeof body.sectionsVisibility === 'object') {
            next.sectionsVisibility = mergeDashboardSectionsVisibility({
                ...mergeDashboardSectionsVisibility(demoDashboardConfig.sectionsVisibility),
                ...body.sectionsVisibility,
            });
        }
        return HttpResponse.json({ success: true, data: next });
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

    http.post(apiPath('/scrape'), async () =>
        HttpResponse.json({
            success: true,
            data: demoScrapeResultFile(),
            filename: DEMO_SAMPLE_FILENAME,
        })
    ),

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
