import { useState, useEffect, useLayoutEffect, useRef, useCallback, createContext, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerConfig, useUpdateSchedulerConfig } from '../../hooks/useScraper';
import { useProfiles } from '../../hooks/useProfiles';
import { useProviders, getProviderDisplayName } from '../../hooks/useProviders';
import type { ScheduleEditorValue } from '../ScheduleEditor';
import type { Profile } from '@app/shared';

const SCHEDULER_SAVE_DEBOUNCE_MS = 400;

function todayLocalISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const emptySchedule = (): ScheduleEditorValue => ({
    scheduleType: 'daily',
    runTime: '08:00',
    weekdays: [1],
    monthDays: [1],
    intervalDays: 3,
    intervalAnchorDate: todayLocalISO(),
    customCron: '0 8 * * *',
});

export interface SchedulerSettingsModel {
    isLoading: boolean;
    isUpdating: boolean;
    successMessage: boolean;
    config: ReturnType<typeof useSchedulerConfig>['data'];
    enabled: boolean;
    setEnabled: (v: boolean) => void;
    scrapeOnceOnUnlockOrStartup: boolean;
    setScrapeOnceOnUnlockOrStartup: (v: boolean) => void;
    scrapeSchedule: ScheduleEditorValue;
    patchScrape: (patch: Partial<ScheduleEditorValue>) => void;
    backupEnabled: boolean;
    setBackupEnabled: (v: boolean) => void;
    backupDestination: 'local' | 'google-drive';
    setBackupDestination: (v: 'local' | 'google-drive') => void;
    backupSchedule: ScheduleEditorValue;
    patchBackup: (patch: Partial<ScheduleEditorValue>) => void;
    selectedProfiles: string[];
    toggleProfile: (id: string) => void;
    insightRulesTimerEnabled: boolean;
    setInsightRulesTimerEnabled: (v: boolean) => void;
    insightRulesTimerSchedule: ScheduleEditorValue;
    patchInsightRulesTimer: (patch: Partial<ScheduleEditorValue>) => void;
    getProviderName: (companyId: string) => string;
    profiles: Profile[] | undefined;
}

const SchedulerSettingsContext = createContext<SchedulerSettingsModel | null>(null);

export function useSchedulerSettings(): SchedulerSettingsModel {
    const ctx = useContext(SchedulerSettingsContext);
    if (!ctx) {
        throw new Error('useSchedulerSettings must be used within SchedulerSettingsProvider');
    }
    return ctx;
}

function useSchedulerSettingsModel(): SchedulerSettingsModel {
    const { i18n } = useTranslation();
    const { data: config, isLoading } = useSchedulerConfig();
    const { mutateAsync: persistSchedulerConfig, isPending: isUpdating } = useUpdateSchedulerConfig();
    const { data: profiles } = useProfiles();
    const { data: providers } = useProviders();

    const getProviderName = useCallback(
        (companyId: string) => getProviderDisplayName(companyId, providers, i18n.language),
        [providers, i18n.language]
    );

    const [enabled, setEnabled] = useState(false);
    const [scrapeOnceOnUnlockOrStartup, setScrapeOnceOnUnlockOrStartup] = useState(false);
    const [scrapeSchedule, setScrapeSchedule] = useState<ScheduleEditorValue>(() => emptySchedule());

    const [backupEnabled, setBackupEnabled] = useState(false);
    const [backupDestination, setBackupDestination] = useState<'local' | 'google-drive'>('local');
    const [backupSchedule, setBackupSchedule] = useState<ScheduleEditorValue>(() => ({
        ...emptySchedule(),
        runTime: '09:00',
        customCron: '0 9 * * *',
    }));

    const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);

    const [insightRulesTimerEnabled, setInsightRulesTimerEnabled] = useState(false);
    const [insightRulesTimerSchedule, setInsightRulesTimerSchedule] = useState<ScheduleEditorValue>(() => ({
        ...emptySchedule(),
        runTime: '10:00',
        customCron: '0 10 * * *',
    }));

    const [successMessage, setSuccessMessage] = useState(false);
    const lastSerializedRef = useRef<string | null>(null);
    const saveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const configRef = useRef(config);
    configRef.current = config;
    const persistSchedulerRef = useRef(persistSchedulerConfig);
    persistSchedulerRef.current = persistSchedulerConfig;

    const patchScrape = (patch: Partial<ScheduleEditorValue>) => {
        setScrapeSchedule((prev: ScheduleEditorValue) => ({ ...prev, ...patch }));
    };

    const patchBackup = (patch: Partial<ScheduleEditorValue>) => {
        setBackupSchedule((prev: ScheduleEditorValue) => ({ ...prev, ...patch }));
    };

    const patchInsightRulesTimer = (patch: Partial<ScheduleEditorValue>) => {
        setInsightRulesTimerSchedule((prev: ScheduleEditorValue) => ({ ...prev, ...patch }));
    };

    useLayoutEffect(() => {
        if (!config) return;

        setEnabled(config.enabled ?? false);
        setScrapeOnceOnUnlockOrStartup(Boolean(config.scrapeOnceOnUnlockOrStartup));
        const parts = config.cronExpression?.split(' ') || [];
        const scrapeRunTime =
            config.runTime ??
            (parts.length >= 2 ? `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}` : '08:00');
        setScrapeSchedule({
            scheduleType: config.scheduleType ?? 'daily',
            runTime: scrapeRunTime,
            weekdays: config.weekdays?.length ? [...config.weekdays].sort((a, b) => a - b) : [1],
            monthDays: config.monthDays?.length ? [...config.monthDays].sort((a, b) => a - b) : [1],
            intervalDays: config.intervalDays ?? 3,
            intervalAnchorDate: config.intervalAnchorDate ?? todayLocalISO(),
            customCron: config.cronExpression ?? '0 8 * * *',
        });

        const b = config.backupSchedule;
        setBackupEnabled(b?.enabled ?? false);
        setBackupDestination(b?.destination === 'google-drive' ? 'google-drive' : 'local');
        const bp = b?.cronExpression?.split(' ') || [];
        const backupRunTime =
            b?.runTime ?? (bp.length >= 2 ? `${bp[1].padStart(2, '0')}:${bp[0].padStart(2, '0')}` : '09:00');
        setBackupSchedule({
            scheduleType: b?.scheduleType ?? 'daily',
            runTime: backupRunTime,
            weekdays: b?.weekdays?.length ? [...b.weekdays].sort((a, b) => a - b) : [1],
            monthDays: b?.monthDays?.length ? [...b.monthDays].sort((a, b) => a - b) : [1],
            intervalDays: b?.intervalDays ?? 3,
            intervalAnchorDate: b?.intervalAnchorDate ?? todayLocalISO(),
            customCron: b?.cronExpression ?? '0 9 * * *',
        });

        setSelectedProfiles(config.selectedProfiles || []);

        const ir = config.insightRulesSchedule;
        setInsightRulesTimerEnabled(ir?.enabled ?? false);
        const irParts = ir?.cronExpression?.split(' ') || [];
        const irRunTime =
            ir?.runTime ??
            (irParts.length >= 2 ? `${irParts[1].padStart(2, '0')}:${irParts[0].padStart(2, '0')}` : '10:00');
        setInsightRulesTimerSchedule({
            scheduleType: ir?.scheduleType ?? 'daily',
            runTime: irRunTime,
            weekdays: ir?.weekdays?.length ? [...ir.weekdays].sort((a, b) => a - b) : [1],
            monthDays: ir?.monthDays?.length ? [...ir.monthDays].sort((a, b) => a - b) : [1],
            intervalDays: ir?.intervalDays ?? 3,
            intervalAnchorDate: ir?.intervalAnchorDate ?? todayLocalISO(),
            customCron: ir?.cronExpression ?? '0 10 * * *',
        });

        lastSerializedRef.current = null;
    }, [config]);

    const buildPayload = useCallback(() => {
        const sw = scrapeSchedule.weekdays.length ? scrapeSchedule.weekdays : [1];
        const sm = scrapeSchedule.monthDays.length ? scrapeSchedule.monthDays : [1];
        const iw = insightRulesTimerSchedule.weekdays.length ? insightRulesTimerSchedule.weekdays : [1];
        const im = insightRulesTimerSchedule.monthDays.length ? insightRulesTimerSchedule.monthDays : [1];
        const bw = backupSchedule.weekdays.length ? backupSchedule.weekdays : [1];
        const bm = backupSchedule.monthDays.length ? backupSchedule.monthDays : [1];
        return {
            enabled,
            scrapeOnceOnUnlockOrStartup,
            scheduleType: scrapeSchedule.scheduleType,
            runTime: scrapeSchedule.runTime,
            selectedProfiles,
            ...(scrapeSchedule.scheduleType === 'weekly' ? { weekdays: sw } : {}),
            ...(scrapeSchedule.scheduleType === 'monthly' ? { monthDays: sm } : {}),
            ...(scrapeSchedule.scheduleType === 'interval_days'
                ? {
                      intervalDays: Math.max(1, scrapeSchedule.intervalDays),
                      intervalAnchorDate: scrapeSchedule.intervalAnchorDate,
                  }
                : {}),
            ...(scrapeSchedule.scheduleType === 'custom' ? { cronExpression: scrapeSchedule.customCron.trim() } : {}),
            insightRulesSchedule: {
                enabled: insightRulesTimerEnabled,
                scheduleType: insightRulesTimerSchedule.scheduleType,
                runTime: insightRulesTimerSchedule.runTime,
                ...(insightRulesTimerSchedule.scheduleType === 'weekly' ? { weekdays: iw } : {}),
                ...(insightRulesTimerSchedule.scheduleType === 'monthly' ? { monthDays: im } : {}),
                ...(insightRulesTimerSchedule.scheduleType === 'interval_days'
                    ? {
                          intervalDays: Math.max(1, insightRulesTimerSchedule.intervalDays),
                          intervalAnchorDate: insightRulesTimerSchedule.intervalAnchorDate,
                      }
                    : {}),
                ...(insightRulesTimerSchedule.scheduleType === 'custom'
                    ? { cronExpression: insightRulesTimerSchedule.customCron.trim() }
                    : {}),
            },
            backupSchedule: {
                enabled: backupEnabled,
                destination: backupDestination,
                scheduleType: backupSchedule.scheduleType,
                runTime: backupSchedule.runTime,
                ...(backupSchedule.scheduleType === 'weekly' ? { weekdays: bw } : {}),
                ...(backupSchedule.scheduleType === 'monthly' ? { monthDays: bm } : {}),
                ...(backupSchedule.scheduleType === 'interval_days'
                    ? {
                          intervalDays: Math.max(1, backupSchedule.intervalDays),
                          intervalAnchorDate: backupSchedule.intervalAnchorDate,
                      }
                    : {}),
                ...(backupSchedule.scheduleType === 'custom' ? { cronExpression: backupSchedule.customCron.trim() } : {}),
            },
        };
    }, [
        enabled,
        scrapeOnceOnUnlockOrStartup,
        scrapeSchedule,
        backupEnabled,
        backupDestination,
        backupSchedule,
        selectedProfiles,
        insightRulesTimerEnabled,
        insightRulesTimerSchedule,
    ]);

    const buildPayloadFnRef = useRef(buildPayload);
    buildPayloadFnRef.current = buildPayload;

    const flushSchedulerIfDirty = useCallback(() => {
        if (!configRef.current) return;
        if (saveDebounceTimerRef.current != null) {
            clearTimeout(saveDebounceTimerRef.current);
            saveDebounceTimerRef.current = null;
        }
        const payload = buildPayloadFnRef.current();
        const nextJson = JSON.stringify(payload);
        if (lastSerializedRef.current === nextJson) return;
        void persistSchedulerRef.current(payload).then(
            () => {
                lastSerializedRef.current = nextJson;
            },
            () => {
                /* leave dirty; user can retry */
            }
        );
    }, []);

    useLayoutEffect(() => {
        return () => {
            flushSchedulerIfDirty();
        };
    }, [flushSchedulerIfDirty]);

    useEffect(() => {
        window.addEventListener('pagehide', flushSchedulerIfDirty);
        window.addEventListener('beforeunload', flushSchedulerIfDirty);
        return () => {
            window.removeEventListener('pagehide', flushSchedulerIfDirty);
            window.removeEventListener('beforeunload', flushSchedulerIfDirty);
        };
    }, [flushSchedulerIfDirty]);

    useEffect(() => {
        if (!config) return;
        const json = JSON.stringify(buildPayload());
        if (lastSerializedRef.current === null) {
            lastSerializedRef.current = json;
            return;
        }
        if (lastSerializedRef.current === json) return;
        if (saveDebounceTimerRef.current != null) {
            clearTimeout(saveDebounceTimerRef.current);
        }
        saveDebounceTimerRef.current = setTimeout(() => {
            saveDebounceTimerRef.current = null;
            const payload = buildPayload();
            const nextJson = JSON.stringify(payload);
            if (lastSerializedRef.current === nextJson) return;
            void persistSchedulerConfig(payload).then(
                () => {
                    lastSerializedRef.current = nextJson;
                    setSuccessMessage(true);
                    setTimeout(() => setSuccessMessage(false), 3000);
                },
                () => {
                    /* mutation error */
                }
            );
        }, SCHEDULER_SAVE_DEBOUNCE_MS);
        return () => {
            if (saveDebounceTimerRef.current != null) {
                clearTimeout(saveDebounceTimerRef.current);
                saveDebounceTimerRef.current = null;
            }
        };
    }, [config, buildPayload, persistSchedulerConfig]);

    const toggleProfile = (id: string) => {
        setSelectedProfiles((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    };

    return {
        isLoading,
        isUpdating,
        successMessage,
        config,
        enabled,
        setEnabled,
        scrapeOnceOnUnlockOrStartup,
        setScrapeOnceOnUnlockOrStartup,
        scrapeSchedule,
        patchScrape,
        backupEnabled,
        setBackupEnabled,
        backupDestination,
        setBackupDestination,
        backupSchedule,
        patchBackup,
        selectedProfiles,
        toggleProfile,
        insightRulesTimerEnabled,
        setInsightRulesTimerEnabled,
        insightRulesTimerSchedule,
        patchInsightRulesTimer,
        getProviderName,
        profiles,
    };
}

export function SchedulerSettingsProvider({ children }: { children: ReactNode }) {
    const model = useSchedulerSettingsModel();
    return <SchedulerSettingsContext.Provider value={model}>{children}</SchedulerSettingsContext.Provider>;
}
