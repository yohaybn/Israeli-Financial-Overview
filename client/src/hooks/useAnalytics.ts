import { useMemo } from 'react';
import type { Transaction } from '@app/shared';
import { computeUnifiedAnalytics, type UnifiedAnalyticsData } from '@app/shared';

export type {
    CategoryTreemapAggregatedPart,
    CategoryTreemapGroup,
    CategoryTreemapLeaf,
    UnifiedAnalyticsData,
} from '@app/shared';

export { TREEMAP_SMALL_MERGED_ID } from '@app/shared';

export function useAnalytics(transactions: Transaction[], customCCKeywords: string[] = []): UnifiedAnalyticsData {
    return useMemo(
        () => computeUnifiedAnalytics(transactions, customCCKeywords),
        [transactions, customCCKeywords]
    );
}
