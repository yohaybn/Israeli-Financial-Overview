import { useCallback, useMemo, useState } from 'react';
import { isDemoMode } from '../demo/isDemo';

const STORAGE_KEY = 'bank-scraper-getting-started-v1';

/** Steps: intro, profile, first scrape, import files, dashboard, logs, configuration, investments (optional) */
export const GETTING_STARTED_STEP_COUNT = 8;

type GettingStartedSnapshot = {
    /** Tour content version: 2 = 8 steps (import step at index 3). */
    v: 1 | 2;
    completed: boolean;
    step: number;
    minimized: boolean;
};

const defaultSnapshot = (): GettingStartedSnapshot => ({
    v: 2,
    completed: false,
    step: 0,
    minimized: false
});

function readSnapshot(): GettingStartedSnapshot {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultSnapshot();
        const parsed = JSON.parse(raw) as Partial<GettingStartedSnapshot>;
        const completed = Boolean(parsed.completed);
        let step = typeof parsed.step === 'number' ? parsed.step : 0;
        step = Math.max(0, Math.min(step, GETTING_STARTED_STEP_COUNT - 1));
        const tourSchema = typeof parsed.v === 'number' ? parsed.v : 1;
        /** v1 had 7 steps; v2 inserted "import files" at step 3 — shift saved progress at dashboard+ */
        const needsTourMigrate =
            tourSchema < 2 && !completed && step >= 3 && step <= 6;
        if (needsTourMigrate) {
            step = Math.min(step + 1, GETTING_STARTED_STEP_COUNT - 1);
        }
        const next: GettingStartedSnapshot = {
            ...defaultSnapshot(),
            ...parsed,
            v: 2,
            completed,
            step,
            minimized: Boolean(parsed.minimized)
        };
        if (needsTourMigrate) {
            writeSnapshot(next);
        }
        return next;
    } catch {
        return defaultSnapshot();
    }
}

function writeSnapshot(s: GettingStartedSnapshot) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function useGettingStartedState() {
    const [snapshot, setSnapshot] = useState<GettingStartedSnapshot>(() => readSnapshot());

    const persist = useCallback((patch: Partial<GettingStartedSnapshot>) => {
        setSnapshot((prev) => {
            const next: GettingStartedSnapshot = { ...prev, ...patch, v: 2 };
            writeSnapshot(next);
            return next;
        });
    }, []);

    const setStep = useCallback(
        (step: number) => {
            persist({ step: Math.max(0, Math.min(step, GETTING_STARTED_STEP_COUNT - 1)) });
        },
        [persist]
    );

    const nextStep = useCallback(() => {
        setSnapshot((prev) => {
            const nextStep = Math.min(prev.step + 1, GETTING_STARTED_STEP_COUNT - 1);
            const next: GettingStartedSnapshot = { ...prev, step: nextStep, v: 2 };
            writeSnapshot(next);
            return next;
        });
    }, []);

    const prevStep = useCallback(() => {
        setSnapshot((prev) => {
            const nextStep = Math.max(prev.step - 1, 0);
            const next: GettingStartedSnapshot = { ...prev, step: nextStep, v: 2 };
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

    const restartTour = useCallback(() => {
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
        restartTour
    };
}
