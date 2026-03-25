import { useCallback, useMemo, useState } from 'react';
import { isDemoMode } from '../demo/isDemo';

const STORAGE_KEY = 'bank-scraper-onboarding-v1';

export const ONBOARDING_STEP_COUNT = 6;

type OnboardingSnapshot = {
    v: 1;
    completed: boolean;
    step: number;
    minimized: boolean;
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
        return {
            ...defaultSnapshot(),
            ...parsed,
            v: 1
        };
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
            const next: OnboardingSnapshot = { ...prev, ...patch, v: 1 };
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
            const next: OnboardingSnapshot = { ...prev, step: nextStep, v: 1 };
            writeSnapshot(next);
            return next;
        });
    }, []);

    const prevStep = useCallback(() => {
        setSnapshot((prev) => {
            const nextStep = Math.max(prev.step - 1, 0);
            const next: OnboardingSnapshot = { ...prev, step: nextStep, v: 1 };
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
