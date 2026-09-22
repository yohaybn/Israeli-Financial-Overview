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
    DEMO_SAMPLE_FILENAME,
    demoAiSettings,
    demoDashboardConfig,
    demoProfiles,
    demoScrapeResultFile,
    getDemoCurrentMonthScrapeFilename,
    getDemoScrapeResultList,
    getDemoTransactions,
} from '../sampleData';
import { apiPath, getLastScrapeResult } from './shared';

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

function resolveDemoScrapeResultFile(filename: string) {
    if (filename === DEMO_SAMPLE_FILENAME) return demoScrapeResultFile();
    if (filename === getDemoCurrentMonthScrapeFilename() || filename.startsWith('demo-scrape-')) {
        return getLastScrapeResult();
    }
    return demoScrapeResultFile();
}

/** Single scrape file: pathname is /<base>/api/results/<filename>. */
function isSingleScrapeResultFilePath(pathname: string): boolean {
    const marker = '/api/results/';
    const idx = pathname.lastIndexOf(marker);
    if (idx === -1) return false;
    const filename = pathname.slice(idx + marker.length);
    return Boolean(filename && !filename.includes('/') && filename !== 'all');
}

export const coreDemoHandlers = [
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
    }, ({ request }) => {
        const pathname = new URL(request.url).pathname;
        const marker = '/api/results/';
        const idx = pathname.lastIndexOf(marker);
        const filename = decodeURIComponent(pathname.slice(idx + marker.length));
        return HttpResponse.json({
            success: true,
            data: resolveDemoScrapeResultFile(filename),
        });
    }),

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

];
