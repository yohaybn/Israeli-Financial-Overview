import { useCallback, useMemo, useState } from 'react';
import { isDemoMode } from '../demo/isDemo';

const STORAGE_KEY = 'bank-scraper-onboarding-v1';

export type OnboardingStepId = 'welcome' | 'lock' | 'telegram' | 'gemini' | 'done';

const WIZARD_LAYOUT_VERSION = 6;

/** Order for resume banner “step N” (1-based). */
const RESUME_STEP_ORDER: OnboardingStepId[] = ['welcome', 'lock', 'gemini', 'telegram', 'done'];

type OnboardingSnapshot = {
    v: 1;
    completed: boolean;
    stepId: OnboardingStepId;
    minimized: boolean;
    wizardLayoutVersion?: number;
    /** @deprecated v1/v2 numeric step */
    step?: number;
};

const defaultSnapshot = (): OnboardingSnapshot => ({
    v: 1,
    completed: false,
    stepId: 'welcome',
    minimized: false
});

function isValidStepId(s: string): s is OnboardingStepId {
    return s === 'welcome' || s === 'lock' || s === 'telegram' || s === 'gemini' || s === 'done';
}

/** Legacy step ids before v6 (Google OAuth + persona lived in main wizard). */
function migrateLegacyStepId(raw: string | undefined): OnboardingStepId | null {
    if (!raw) return null;
    if (raw === 'drive') return 'done';
    if (raw === 'google') return 'done';
    if (raw === 'persona' || raw === 'persona_about') return 'telegram';
    return null;
}

/** Legacy numeric step indices (pre–layout v5). */
function legacyNumericToStepId(n: number): OnboardingStepId {
    const map: OnboardingStepId[] = ['welcome', 'lock', 'telegram', 'gemini', 'done', 'done', 'done'];
    if (n < 0) return 'welcome';
    if (n >= map.length) return 'done';
    return map[n];
}

function readSnapshot(): OnboardingSnapshot {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultSnapshot();
        const parsed = JSON.parse(raw) as Partial<OnboardingSnapshot> & { step?: number };
        let stepId: OnboardingStepId = 'welcome';
        const rawStep = parsed.stepId as string | undefined;
        const legacy = migrateLegacyStepId(rawStep);
        if (legacy !== null) {
            stepId = legacy;
        } else if (rawStep && isValidStepId(rawStep)) {
            stepId = rawStep;
        } else if (typeof parsed.step === 'number') {
            let n = parsed.step;
            const layout = parsed.wizardLayoutVersion ?? 1;
            if (layout < 2 && n >= 2) {
                n = Math.min(n + 1, 6);
            }
            stepId = legacyNumericToStepId(n);
        }
        let migratedStepId = stepId;
        if ((parsed.wizardLayoutVersion ?? 1) < WIZARD_LAYOUT_VERSION) {
            const again = migrateLegacyStepId(migratedStepId as string);
            if (again !== null) migratedStepId = again;
        }
        const result: OnboardingSnapshot = {
            ...defaultSnapshot(),
            ...parsed,
            v: 1,
            stepId: migratedStepId,
            wizardLayoutVersion: WIZARD_LAYOUT_VERSION
        };
        if ((parsed.wizardLayoutVersion ?? 1) < WIZARD_LAYOUT_VERSION) {
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

    const setStepId = useCallback(
        (stepId: OnboardingStepId) => {
            persist({ stepId });
        },
        [persist]
    );

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
        persist({ completed: false, stepId: 'welcome', minimized: false });
    }, [persist]);

    const showModal = useMemo(
        () => !isDemoMode() && !snapshot.completed && !snapshot.minimized,
        [snapshot.completed, snapshot.minimized]
    );

    const showResumeBanner = useMemo(
        () => !isDemoMode() && !snapshot.completed && snapshot.minimized,
        [snapshot.completed, snapshot.minimized]
    );

    const resumeStepNumber = useMemo(
        () => Math.max(1, RESUME_STEP_ORDER.indexOf(snapshot.stepId) + 1),
        [snapshot.stepId]
    );

    return {
        stepId: snapshot.stepId,
        setStepId,
        completed: snapshot.completed,
        minimized: snapshot.minimized,
        showModal,
        showResumeBanner,
        resumeStepNumber,
        complete,
        continueLater,
        resume,
        restartWizard
    };
}
