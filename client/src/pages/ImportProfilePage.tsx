import { ImportProfileBuilder } from '../components/ImportProfileBuilder';
import { PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY } from '../utils/pendingTabularImportProfile';

interface ImportProfilePageProps {
    onBack: () => void;
    /** Called after profile JSON is stored for the import modal (navigate + open import). */
    onSaved: () => void;
}

export function ImportProfilePage({ onBack, onSaved }: ImportProfilePageProps) {
    return (
        <ImportProfileBuilder
            variant="page"
            isOpen
            onClose={onBack}
            onSave={(json) => {
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
