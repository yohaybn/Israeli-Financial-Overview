import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Transaction } from '@app/shared';

interface UnifiedDataResponse {
    success: boolean;
    transactions: Transaction[];
}

export function useUnifiedData() {
    return useQuery({
        queryKey: ['unified-data'],
        queryFn: async () => {
            const { data } = await api.get<UnifiedDataResponse>('/results/all');
            return data.transactions;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false
    });
}
