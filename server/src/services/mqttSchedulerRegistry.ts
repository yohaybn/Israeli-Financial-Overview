import type { SchedulerService } from './schedulerService.js';

let registeredScheduler: SchedulerService | null = null;

export function registerMqttScheduler(scheduler: SchedulerService): void {
  registeredScheduler = scheduler;
}

export function getMqttScheduler(): SchedulerService | null {
  return registeredScheduler;
}
