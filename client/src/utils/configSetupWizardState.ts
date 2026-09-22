const STORAGE_KEY = 'config-setup-wizard-dismissed-v1';

export function shouldShowConfigSetupWizard(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
        return false;
    }
}

export function dismissConfigSetupWizard(): void {
    try {
        localStorage.setItem(STORAGE_KEY, '1');
    } catch {
        // Storage may be unavailable in private or restricted browser contexts.
    }
}
