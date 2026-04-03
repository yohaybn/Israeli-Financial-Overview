export type AppView = 'dashboard' | 'scrape' | 'logs' | 'configuration' | 'importProfile';

export const CONFIG_TAB_IDS = [
    'ai',
    'insight-rules',
    'categories',
    'scheduler',
    'scrape',
    'sheets',
    'telegram',
    'maintenance',
] as const;
export type ConfigTabId = (typeof CONFIG_TAB_IDS)[number];

export const LOG_TAB_IDS = ['server', 'error_log', 'ai', 'scrape'] as const;
export type LogTabId = (typeof LOG_TAB_IDS)[number];

export interface AppUrlState {
    view: AppView;
    configTab: ConfigTabId;
    logType: LogTabId;
    logEntryId: string | null;
}

function isConfigTab(s: string): s is ConfigTabId {
    return (CONFIG_TAB_IDS as readonly string[]).includes(s);
}

function isLogTab(s: string): s is LogTabId {
    return (LOG_TAB_IDS as readonly string[]).includes(s);
}

function parseView(raw: string | null): AppView {
    if (raw === 'scrape' || raw === 'logs' || raw === 'configuration' || raw === 'importProfile') return raw;
    return 'dashboard';
}

function inferLogTypeForEntry(entry: string): LogTabId {
    return entry.startsWith('scrape-') ? 'scrape' : 'ai';
}

/**
 * Parse deep-link query params. Optional session tab override (from legacy sessionStorage) when opening configuration.
 */
export function parseAppUrlState(search: string, sessionConfigTabOverride: string | null): AppUrlState {
    const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const view = parseView(p.get('view'));

    let configTab: ConfigTabId = 'ai';
    const tabParam = p.get('tab');
    // Legacy: memory tab merged into AI; fraud merged into Scrape
    if (tabParam === 'memory') configTab = 'ai';
    else if (tabParam === 'fraud') configTab = 'scrape';
    else if (tabParam === 'environment') configTab = 'maintenance';
    else if (tabParam && isConfigTab(tabParam)) configTab = tabParam;
    else if (sessionConfigTabOverride === 'fraud') configTab = 'scrape';
    else if (sessionConfigTabOverride === 'environment') configTab = 'maintenance';
    else if (sessionConfigTabOverride && isConfigTab(sessionConfigTabOverride)) configTab = sessionConfigTabOverride;

    const entryRaw = p.get('entry')?.trim() || null;

    let logType: LogTabId = 'server';
    const logParam = p.get('log');
    // Legacy: ?log=client / client_errors → error log tab
    if (logParam === 'client' || logParam === 'client_errors') logType = 'error_log';
    else if (logParam && isLogTab(logParam)) logType = logParam;
    else if (view === 'logs' && entryRaw) logType = inferLogTypeForEntry(entryRaw);

    let logEntryId = entryRaw;
    if (view === 'logs' && logType !== 'ai' && logType !== 'scrape') logEntryId = null;

    return {
        view,
        configTab,
        logType,
        logEntryId,
    };
}

export function buildAppUrlSearch(state: AppUrlState): string {
    const p = new URLSearchParams();
    if (state.view !== 'dashboard') p.set('view', state.view);
    if (state.view === 'importProfile') {
        return p.toString();
    }
    if (state.view === 'configuration') p.set('tab', state.configTab);
    if (state.view === 'logs') {
        if (state.logType !== 'server') p.set('log', state.logType);
        if (state.logEntryId) p.set('entry', state.logEntryId);
    }
    return p.toString();
}

function currentPathWithSearch(search: string): string {
    return `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
}

export function replaceAppUrlState(state: AppUrlState): void {
    window.history.replaceState(null, '', currentPathWithSearch(buildAppUrlSearch(state)));
}

export function pushAppUrlState(state: AppUrlState): void {
    window.history.pushState(null, '', currentPathWithSearch(buildAppUrlSearch(state)));
}
