import { useMemo, useState, useEffect } from 'react';
import { isDemoMode } from '../demo/isDemo';
import { useEnvConfig } from './useConfig';
import { useOnboarding } from '../contexts/OnboardingContext';
import { isGeminiApiKeyConfigured } from '../utils/geminiKeyConfigured';
import {
    isPersonaSetupWizardCompleted,
    isPersonaSetupPendingAfterRestart,
    subscribePersonaSetupWizardStorage
} from '../utils/personaSetupWizardStorage';

/**
 * Full-screen persona setup (narrative + alignment) after restart when a Gemini key is active.
 */
export function usePersonaSetupWizardVisibility() {
    const { data: envConfig } = useEnvConfig();
    const onboarding = useOnboarding();
    const [storageTick, setStorageTick] = useState(0);

    useEffect(() => subscribePersonaSetupWizardStorage(() => setStorageTick((n) => n + 1)), []);

    const showPersonaSetupWizard = useMemo(() => {
        if (isDemoMode()) return false;
        if (!onboarding.completed) return false;
        if (onboarding.showModal) return false;
        if (!isGeminiApiKeyConfigured(envConfig?.GEMINI_API_KEY)) return false;
        if (isPersonaSetupWizardCompleted()) return false;
        if (!isPersonaSetupPendingAfterRestart()) return false;
        return true;
    }, [
        onboarding.completed,
        onboarding.showModal,
        envConfig?.GEMINI_API_KEY,
        storageTick
    ]);

    return { showPersonaSetupWizard };
}
