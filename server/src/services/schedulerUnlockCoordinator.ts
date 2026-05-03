import type { SchedulerService } from './schedulerService.js';

let schedulerRef: SchedulerService | null = null;

export function registerSchedulerForUnlockScrape(scheduler: SchedulerService): void {
    schedulerRef = scheduler;
}

/** Runs configured “scrape once on unlock/start” scrape when automation allows it (see SchedulerService). */
export function notifySchedulerScrapeAfterUnlockOrStartup(): void {
    schedulerRef?.maybeTriggerScrapeOnUnlockOrStartup();
}
