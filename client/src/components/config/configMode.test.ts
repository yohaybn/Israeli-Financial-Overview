import { describe, expect, it } from 'vitest';
import type { ConfigTabId } from '../../utils/appUrlState';
import { requiresAdvancedMode, visibleConfigTabs } from './configMode';

const allTabs: ConfigTabId[] = [
  'ai',
  'insight-rules',
  'categories',
  'scheduler',
  'financial-report',
  'scrape',
  'sheets',
  'budget-exports',
  'investments',
  'telegram',
  'mqtt',
  'maintenance',
];

describe('configuration mode', () => {
  it('shows only onboarding tabs in basic mode', () => {
    expect(visibleConfigTabs(allTabs, false)).toEqual([
      'ai',
      'categories',
      'financial-report',
      'scrape',
    ]);
  });

  it('shows every settings section in advanced mode', () => {
    expect(visibleConfigTabs(allTabs, true)).toEqual(allTabs);
  });

  it('promotes deep links to advanced sections', () => {
    expect(requiresAdvancedMode('telegram')).toBe(true);
    expect(requiresAdvancedMode('ai')).toBe(false);
  });
});
