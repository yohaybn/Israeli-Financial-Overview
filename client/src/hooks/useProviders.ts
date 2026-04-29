import { useQuery } from '@tanstack/react-query';
import { ProviderDefinition, PROVIDERS, getProviderDisplayName as getProviderDisplayNameShared } from '@app/shared';
import { api } from '../lib/api';

/** Same display rule as ScraperForm provider dropdown (API definitions). */
export function getProviderDisplayName(
    companyId: string | undefined | null,
    providers: ProviderDefinition[] | undefined,
    language: string
): string {
    return getProviderDisplayNameShared(companyId, providers ?? PROVIDERS, language);
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
