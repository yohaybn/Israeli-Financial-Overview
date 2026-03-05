import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Profile } from '@app/shared';

// List all profiles
export function useProfiles() {
    return useQuery({
        queryKey: ['profiles'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: Profile[] }>('/profiles');
            return data.data;
        },
    });
}

// Get a single profile
export function useProfile(id: string | null) {
    return useQuery({
        queryKey: ['profile', id],
        queryFn: async () => {
            if (!id) return null;
            const { data } = await api.get<{ success: boolean; data: Profile }>(`/profiles/${id}`);
            return data.data;
        },
        enabled: !!id,
    });
}

// Create a new profile
export function useCreateProfile() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (profile: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>) => {
            const { data } = await api.post<{ success: boolean; data: Profile }>('/profiles', profile);
            return data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] });
        },
    });
}

// Update an existing profile
export function useUpdateProfile() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Profile> & { id: string }) => {
            const { data } = await api.put<{ success: boolean; data: Profile }>(`/profiles/${id}`, updates);
            return data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] });
        },
    });
}

// Delete a profile
export function useDeleteProfile() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/profiles/${id}`);
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] });
        },
    });
}
