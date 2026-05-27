import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { enUS, he } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { MAX_USER_CHARTS, type SqlAnalyticCardDefinition, type UserChartDefinition } from '@app/shared';
import { useDashboardConfig } from './useDashboardConfig';

export type UnifiedChartModalState =
    | { source: 'transactions'; initial: UserChartDefinition | null }
    | { source: 'sql'; initial: SqlAnalyticCardDefinition | null }
    | null;

export function useUnifiedDashboardCharts() {
    const { i18n } = useTranslation();
    const { config, updateConfig } = useDashboardConfig();
    const transactionCharts = config.customCharts ?? [];
    const sqlCards = config.sqlAnalyticCards ?? [];
    const [modal, setModal] = useState<UnifiedChartModalState>(null);

    const totalCount = transactionCharts.length + sqlCards.length;
    const atLimit = totalCount >= MAX_USER_CHARTS;

    const weekdayLabels = useMemo(() => {
        const locale = i18n.language === 'he' ? he : enUS;
        return Array.from({ length: 7 }, (_, i) => format(new Date(2024, 0, 7 + i), 'EEE', { locale }));
    }, [i18n.language]);

    const openAddChart = useCallback(() => {
        setModal({ source: 'transactions', initial: null });
    }, []);

    const openEditTransactionChart = useCallback((initial: UserChartDefinition) => {
        setModal({ source: 'transactions', initial });
    }, []);

    const openEditSqlChart = useCallback((initial: SqlAnalyticCardDefinition) => {
        setModal({ source: 'sql', initial });
    }, []);

    const handleSaveTransactionChart = useCallback(
        (def: UserChartDefinition) => {
            const isEdit = transactionCharts.some((c) => c.id === def.id);
            if (isEdit) {
                updateConfig({ customCharts: transactionCharts.map((c) => (c.id === def.id ? def : c)) });
            } else {
                if (totalCount >= MAX_USER_CHARTS) return;
                updateConfig({ customCharts: [...transactionCharts, def] });
            }
        },
        [transactionCharts, totalCount, updateConfig]
    );

    const handleSaveSqlChart = useCallback(
        (def: SqlAnalyticCardDefinition) => {
            const isEdit = sqlCards.some((c) => c.id === def.id);
            if (isEdit) {
                updateConfig({ sqlAnalyticCards: sqlCards.map((c) => (c.id === def.id ? def : c)) });
            } else {
                if (totalCount >= MAX_USER_CHARTS) return;
                updateConfig({ sqlAnalyticCards: [...sqlCards, def] });
            }
        },
        [sqlCards, totalCount, updateConfig]
    );

    const handleRemoveTransactionChart = useCallback(
        (id: string) => {
            updateConfig({ customCharts: transactionCharts.filter((c) => c.id !== id) });
        },
        [transactionCharts, updateConfig]
    );

    const handleRemoveSqlChart = useCallback(
        (id: string) => {
            updateConfig({ sqlAnalyticCards: sqlCards.filter((c) => c.id !== id) });
        },
        [sqlCards, updateConfig]
    );

    return {
        transactionCharts,
        sqlCards,
        weekdayLabels,
        atLimit,
        totalCount,
        modal,
        setModal,
        openAddChart,
        openEditTransactionChart,
        openEditSqlChart,
        handleSaveTransactionChart,
        handleSaveSqlChart,
        handleRemoveTransactionChart,
        handleRemoveSqlChart,
    };
}
