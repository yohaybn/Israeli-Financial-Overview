import { useQuery } from '@tanstack/react-query';
import { ProviderDefinition } from '@app/shared';
import { api } from '../lib/api';

/** Same display rule as ScraperForm provider dropdown (API definitions). */
export function getProviderDisplayName(
    companyId: string | undefined | null,
    providers: ProviderDefinition[] | undefined,
    language: string
): string {
    if (companyId == null || companyId === '') return '—';
    const p = providers?.find((x) => x.id === companyId);
    if (!p) return companyId;
    return language === 'he' ? (p.nameHe || p.name) : p.name;
}

export function useProviders() {
    return useQuery({
        queryKey: ['providers'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: ProviderDefinition[] }>('/definitions');
            return data.data;
        },
    });
}
