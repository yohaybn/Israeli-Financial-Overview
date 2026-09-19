import type { ConfigTabId } from '../../utils/appUrlState';

export const ADVANCED_MODE_KEY = 'config-advanced-mode-v1';

export const BASIC_ONBOARDING_TABS: ConfigTabId[] = [
  'ai',
  'scrape',
  'categories',
  'financial-report',
];

export const ADVANCED_CONFIG_TABS: ConfigTabId[] = [
  'insight-rules',
  'scheduler',
  'sheets',
  'budget-exports',
  'investments',
  'telegram',
  'mqtt',
  'maintenance',
];

export function visibleConfigTabs(
  allTabs: ConfigTabId[],
  advancedMode: boolean,
): ConfigTabId[] {
  return allTabs.filter(
    (tab) => advancedMode || !ADVANCED_CONFIG_TABS.includes(tab),
  );
}

export function requiresAdvancedMode(tab: ConfigTabId): boolean {
  return ADVANCED_CONFIG_TABS.includes(tab);
}
