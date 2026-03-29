import { useCallback, useMemo, useState } from 'react';
import { isDemoMode } from '../demo/isDemo';

const STORAGE_KEY = 'bank-scraper-onboarding-v1';

/** Semantic wizard steps (persona and drive are optional in the computed flow). */
export type OnboardingStepId =
    | 'welcome'
    | 'lock'
    | 'telegram'
    | 'gemini'
    | 'persona_about'
    | 'persona'
    | 'google'
    | 'drive'
    | 'done';

const WIZARD_LAYOUT_VERSION = 4;

/** Order for resume banner “step N” (1-based). */
const RESUME_STEP_ORDER: OnboardingStepId[] = [
    'welcome',
    'lock',
    'telegram',
    'gemini',
    'persona_about',
    'persona',
    'google',
    'drive',
    'done'
];

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
    return (
        s === 'welcome' ||
        s === 'lock' ||
        s === 'telegram' ||
        s === 'gemini' ||
        s === 'persona_about' ||
        s === 'persona' ||
        s === 'google' ||
        s === 'drive' ||
        s === 'done'
    );
}

/** v2: welcome, lock, telegram, gemini, google, drive, done — no persona step. */
function legacyNumericToStepId(n: number): OnboardingStepId {
    const map: OnboardingStepId[] = ['welcome', 'lock', 'telegram', 'gemini', 'google', 'drive', 'done'];
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
        if (parsed.stepId && isValidStepId(parsed.stepId)) {
            stepId = parsed.stepId;
        } else if (typeof parsed.step === 'number') {
            let n = parsed.step;
            const layout = parsed.wizardLayoutVersion ?? 1;
            if (layout < 2 && n >= 2) {
                n = Math.min(n + 1, 6);
            }
            stepId = legacyNumericToStepId(n);
        }
        let migratedStepId = stepId;
        if ((parsed.wizardLayoutVersion ?? 1) < 4 && stepId === 'persona') {
            migratedStepId = 'persona_about';
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
