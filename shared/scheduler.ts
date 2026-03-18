export interface SchedulerConfig {
    enabled: boolean;
    cronExpression: string; // e.g., '0 8 * * *' for daily at 8am
    selectedProfiles: string[]; // List of profile IDs to run
    backupSchedule?: {
        enabled: boolean;
        destination: 'local' | 'google-drive';
    };
    lastRun?: string; // ISO timestamp
    nextRun?: string; // ISO timestamp
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
    enabled: false,
    cronExpression: '0 8 * * *', // Default: Daily at 8:00 AM
    selectedProfiles: [],
    backupSchedule: {
        enabled: false,
        destination: 'local'
    }
};
