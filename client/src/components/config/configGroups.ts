import type { ConfigTabId } from '../../utils/appUrlState';

export type ConfigGroupId = 'ai_categorization' | 'automation_reports' | 'connections' | 'data_maintenance';

export interface ConfigGroup {
    id: ConfigGroupId;
    tabs: ConfigTabId[];
}

export const CONFIG_GROUPS: ConfigGroup[] = [
    { id: 'ai_categorization', tabs: ['ai', 'categories', 'insight-rules'] },
    { id: 'automation_reports', tabs: ['scrape', 'scheduler', 'financial-report'] },
    { id: 'connections', tabs: ['sheets', 'budget-exports', 'telegram', 'mqtt'] },
    { id: 'data_maintenance', tabs: ['investments', 'maintenance'] },
];

export function visibleConfigGroups(visibleTabs: ConfigTabId[]): ConfigGroup[] {
    return CONFIG_GROUPS
        .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => visibleTabs.includes(tab)) }))
        .filter((group) => group.tabs.length > 0);
}
