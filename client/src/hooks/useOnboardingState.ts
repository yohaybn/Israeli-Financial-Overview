import { useCallback, useMemo, useState } from 'react';
import { isDemoMode } from '../demo/isDemo';

const STORAGE_KEY = 'bank-scraper-onboarding-v1';

/** Max step index (0-based); wizard has welcome, lock, telegram, gemini, google, drive?, done */
export const ONBOARDING_STEP_COUNT = 7;

const WIZARD_LAYOUT_VERSION = 2;

type OnboardingSnapshot = {
    v: 1;
    completed: boolean;
    step: number;
    minimized: boolean;
    /** Bumps when step indices change so saved progress maps to the new flow */
    wizardLayoutVersion?: number;
};

const defaultSnapshot = (): OnboardingSnapshot => ({
    v: 1,
    completed: false,
    step: 0,
    minimized: false
});

function readSnapshot(): OnboardingSnapshot {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultSnapshot();
        const parsed = JSON.parse(raw) as Partial<OnboardingSnapshot>;
        let step = parsed.step ?? 0;
        const layout = parsed.wizardLayoutVersion ?? 1;
        let migrated = false;
        if (layout < WIZARD_LAYOUT_VERSION && step >= 2) {
            step = Math.min(step + 1, ONBOARDING_STEP_COUNT - 1);
            migrated = true;
        }
        const result: OnboardingSnapshot = {
            ...defaultSnapshot(),
            ...parsed,
            v: 1,
            wizardLayoutVersion: WIZARD_LAYOUT_VERSION,
            step
        };
        if (migrated || (parsed.wizardLayoutVersion ?? 1) < WIZARD_LAYOUT_VERSION) {
            writeSnapshot(result);
        }
        return result;
    } catch {
        return defaultSnapshot();
    }
}

function writeSnapshot(s: OnboardingSnapshot) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function useOnboardingState() {
    const [snapshot, setSnapshot] = useState<OnboardingSnapshot>(() => readSnapshot());

    const persist = useCallback((patch: Partial<OnboardingSnapshot>) => {
        setSnapshot((prev) => {
            const next: OnboardingSnapshot = {
                ...prev,
                ...patch,
                v: 1,
                wizardLayoutVersion: WIZARD_LAYOUT_VERSION
            };
            writeSnapshot(next);
            return next;
        });
    }, []);

    const setStep = useCallback(
        (step: number) => {
            persist({ step: Math.max(0, Math.min(step, ONBOARDING_STEP_COUNT - 1)) });
        },
        [persist]
    );

    const nextStep = useCallback(() => {
        setSnapshot((prev) => {
            const nextStep = Math.min(prev.step + 1, ONBOARDING_STEP_COUNT - 1);
            const next: OnboardingSnapshot = {
                ...prev,
                step: nextStep,
                v: 1,
                wizardLayoutVersion: WIZARD_LAYOUT_VERSION
            };
            writeSnapshot(next);
            return next;
        });
    }, []);

    const prevStep = useCallback(() => {
        setSnapshot((prev) => {
            const nextStep = Math.max(prev.step - 1, 0);
            const next: OnboardingSnapshot = {
                ...prev,
                step: nextStep,
                v: 1,
                wizardLayoutVersion: WIZARD_LAYOUT_VERSION
            };
            writeSnapshot(next);
            return next;
        });
    }, []);

    const complete = useCallback(() => {
        persist({ completed: true, minimized: false });
    }, [persist]);

    const continueLater = useCallback(() => {
        persist({ minimized: true });
    }, [persist]);

    const resume = useCallback(() => {
        persist({ minimized: false });
    }, [persist]);

    const restartWizard = useCallback(() => {
        persist({ completed: false, step: 0, minimized: false });
    }, [persist]);

    const showModal = useMemo(
        () => !isDemoMode() && !snapshot.completed && !snapshot.minimized,
        [snapshot.completed, snapshot.minimized]
    );

    const showResumeBanner = useMemo(
        () => !isDemoMode() && !snapshot.completed && snapshot.minimized,
        [snapshot.completed, snapshot.minimized]
    );

    return {
        step: snapshot.step,
        completed: snapshot.completed,
        minimized: snapshot.minimized,
        showModal,
        showResumeBanner,
        setStep,
        nextStep,
        prevStep,
        complete,
        continueLater,
        resume,
        restartWizard
    };
}
