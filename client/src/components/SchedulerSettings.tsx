import { AuxiliarySchedulerSections, ScrapeSchedulerSection } from './scheduler/schedulerSections';

export { SchedulerSettingsProvider, useSchedulerSettings } from './scheduler/schedulerSettingsModel';
export { ScrapeSchedulerSection, AuxiliarySchedulerSections } from './scheduler/schedulerSections';

/** @deprecated Use ScrapeSchedulerSection + AuxiliarySchedulerSections instead. */
export function SchedulerSettings({ isInline = false }: { isInline?: boolean }) {
    return (
        <div className="space-y-8">
            <ScrapeSchedulerSection />
            <AuxiliarySchedulerSections isInline={isInline} />
        </div>
    );
}
