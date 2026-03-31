import { useTranslation } from 'react-i18next';

type Props = {
    scopeIds: string[];
    /** Selected scope ids; when null, scopes are still loading */
    selected: string[] | null;
    onChange: (next: string[]) => void;
    labelKey: string;
};

export function BackupScopePicker({ scopeIds, selected, onChange, labelKey }: Props) {
    const { t } = useTranslation();

    if (scopeIds.length === 0) {
        return null;
    }

    const toggle = (id: string) => {
        const cur = selected ?? [...scopeIds];
        if (cur.includes(id)) {
            onChange(cur.filter((x) => x !== id));
        } else {
            onChange([...cur, id]);
        }
    };

    const sel = selected ?? scopeIds;
    const allOn = sel.length === scopeIds.length;

    return (
        <div className="mb-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-blue-900">{t(labelKey)}</p>
                <div className="flex gap-2 text-xs">
                    <button
                        type="button"
                        className="text-blue-600 hover:underline font-medium"
                        onClick={() => onChange([...scopeIds])}
                    >
                        {t('maintenance.backup_scope_select_all')}
                    </button>
                    <span className="text-blue-300">|</span>
                    <button
                        type="button"
                        className="text-blue-600 hover:underline font-medium"
                        onClick={() => onChange([])}
                    >
                        {t('maintenance.backup_scope_select_none')}
                    </button>
                </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
                {scopeIds.map((id) => (
                    <label
                        key={id}
                        className="flex items-start gap-2 text-xs text-blue-900 cursor-pointer rounded-lg border border-blue-100 bg-white/80 px-2 py-1.5 hover:bg-blue-50/80"
                    >
                        <input
                            type="checkbox"
                            className="mt-0.5 rounded border-blue-300"
                            checked={sel.includes(id)}
                            onChange={() => toggle(id)}
                        />
                        <span>{t(`maintenance.backup_scope_${id}`)}</span>
                    </label>
                ))}
            </div>
            {sel.length === 0 ? (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                    {t('maintenance.backup_scope_none_error')}
                </p>
            ) : !allOn ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                    {t('maintenance.backup_scope_partial_hint')}
                </p>
            ) : null}
        </div>
    );
}
