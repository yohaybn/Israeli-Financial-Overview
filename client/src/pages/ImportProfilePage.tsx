import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { ImportProfileBuilder } from '../components/ImportProfileBuilder';
import { api } from '../lib/api';
import { PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY } from '../utils/pendingTabularImportProfile';

interface ImportProfilePageProps {
    onBack: () => void;
    /** Called after format JSON is stored for the import modal (navigate + open import). */
    onSaved: () => void;
}

export function ImportProfilePage({ onBack, onSaved }: ImportProfilePageProps) {
    const queryClient = useQueryClient();
    return (
        <ImportProfileBuilder
            variant="page"
            isOpen
            onClose={onBack}
            onSave={async (json) => {
                try {
                    await api.post('/import-profiles', { profileJson: json });
                    queryClient.invalidateQueries({ queryKey: ['importProfiles'] });
                } catch (e) {
                    if (axios.isAxiosError(e)) {
                        const msg =
                            typeof (e.response?.data as { error?: string } | undefined)?.error === 'string'
                                ? (e.response!.data as { error: string }).error
                                : e.message;
                        throw new Error(msg);
                    }
                    throw e instanceof Error ? e : new Error(String(e));
                }
                try {
                    sessionStorage.setItem(PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY, json);
                } catch {
                    // ignore quota / private mode
                }
                onSaved();
            }}
        />
    );
}
