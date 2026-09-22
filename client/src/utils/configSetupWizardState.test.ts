import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissConfigSetupWizard, shouldShowConfigSetupWizard } from './configSetupWizardState';

const storageKey = 'config-setup-wizard-dismissed-v1';

describe('config setup wizard state', () => {
    beforeEach(() => localStorage.clear());

    it('shows the wizard until it is dismissed', () => {
        expect(shouldShowConfigSetupWizard()).toBe(true);
        dismissConfigSetupWizard();
        expect(localStorage.getItem(storageKey)).toBe('1');
        expect(shouldShowConfigSetupWizard()).toBe(false);
    });

    it('does not interrupt startup when storage reads are blocked', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(shouldShowConfigSetupWizard()).toBe(false);
        vi.restoreAllMocks();
    });
});
