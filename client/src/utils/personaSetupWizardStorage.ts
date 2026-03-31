const PENDING_KEY = 'bank-scraper-persona-setup-pending-restart-v1';
const COMPLETED_KEY = 'bank-scraper-persona-setup-completed-v1';
/** Legacy: PersonaPromptModal dismiss */
const LEGACY_DISMISS_KEY = 'bank-scraper-persona-prompt-dismissed-v1';

const CHANGED = 'persona-setup-wizard-storage-changed';

function dispatchChanged() {
    try {
        window.dispatchEvent(new CustomEvent(CHANGED));
    } catch {
        /* ignore */
    }
}

export function isPersonaSetupWizardCompleted(): boolean {
    try {
        if (localStorage.getItem(COMPLETED_KEY) === '1') return true;
        if (localStorage.getItem(LEGACY_DISMISS_KEY) === '1') return true;
        return false;
    } catch {
        return false;
    }
}

export function isPersonaSetupPendingAfterRestart(): boolean {
    try {
        return localStorage.getItem(PENDING_KEY) === '1';
    } catch {
        return false;
    }
}

/** Call after server restart so the persona wizard can show once the API key is active (no-op if setup was already finished or dismissed). */
export function markPersonaSetupPendingAfterRestart(): void {
    try {
        if (isPersonaSetupWizardCompleted()) return;
        localStorage.setItem(PENDING_KEY, '1');
    } catch {
        /* ignore */
    }
    dispatchChanged();
}

export function markPersonaSetupWizardFinished(): void {
    try {
        localStorage.setItem(COMPLETED_KEY, '1');
        localStorage.removeItem(PENDING_KEY);
    } catch {
        /* ignore */
    }
    dispatchChanged();
}

export function subscribePersonaSetupWizardStorage(cb: () => void): () => void {
    const handler = () => cb();
    window.addEventListener(CHANGED, handler);
    return () => window.removeEventListener(CHANGED, handler);
}
