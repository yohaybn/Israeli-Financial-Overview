import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CategoryIcon } from '../utils/categoryIcons';
import { CategoryMetaBoard } from './CategoryMetaBoard';
import { CollapsibleCard } from './CollapsibleCard';
import { useAISettings, useUpdateAISettings, useRecategorizeAll } from '../hooks/useScraper';

export function CategorySettings() {
    const { t } = useTranslation();
    const { data: settings } = useAISettings();
    const { mutate: updateSettings, isPending } = useUpdateAISettings();
    const { mutate: recategorizeAll, isPending: isRecategorizing } = useRecategorizeAll();

    const [localSettings, setLocalSettings] = useState<any>(null);
    const [newCategory, setNewCategory] = useState('');
    const [forceRecat, setForceRecat] = useState(false);

    useEffect(() => {
        if (settings) setLocalSettings(settings);
    }, [settings]);

    if (!localSettings) {
        return <div className="p-8 text-center text-gray-500">{t('ai_settings.loading')}</div>;
    }

    const persistSettings = (next: any) => {
        setLocalSettings(next);
        updateSettings(next, {
            onError: (err: Error) => {
                alert(t('common.save_failed_with_error', { error: err?.message || t('common.unknown_error') }));
            },
        });
    };

    const addCategory = () => {
        if (!newCategory.trim()) return;
        if (localSettings.categories.includes(newCategory.trim())) return;
        const next = {
            ...localSettings,
            categories: [...localSettings.categories, newCategory.trim()],
        };
        setNewCategory('');
        persistSettings(next);
    };

    const removeCategory = (cat: string) => {
        const nextCats = localSettings.categories.filter((c: string) => c !== cat);
        let nextDefault = localSettings.defaultCategory;
        if (cat === nextDefault && nextCats.length > 0) {
            nextDefault = nextCats[0];
        }
        persistSettings({
            ...localSettings,
            categories: nextCats,
            defaultCategory: nextDefault,
        });
    };

    const handleRecategorizeAll = () => {
        if (window.confirm(t('ai_settings.recategorize_all_desc'))) {
            recategorizeAll(forceRecat, {
                onSuccess: (data) => {
                    if (data.error) {
                        if (
                            forceRecat &&
                            (data.error.includes('GEMINI_API_KEY') || data.error.includes('not configured'))
                        ) {
                            alert(t('ai_settings.recategorize_force_requires_ai'));
                        } else {
                            alert(t('ai_settings.recategorize_ai_failed', { error: data.error, count: data.count }));
                        }
                    } else {
                        alert(t('ai_settings.recategorize_success', { count: data.count }));
                    }
                },
                onError: (err: any) => {
                    alert(t('common.error_with_message', { error: err.message || t('common.unknown_error') }));
                },
            });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-gray-900">{t('config_tabs.categories')}</h2>
                <p className="text-gray-500 text-sm mt-1">{t('category_settings.page_description')}</p>
            </div>

            {isPending && (
                <div className="flex justify-end">
                    <span className="text-xs text-indigo-600 flex items-center gap-1.5 font-medium">
                        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" aria-hidden>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                        </svg>
                        {t('ai_settings.saving')}
                    </span>
                </div>
            )}

            <CollapsibleCard
                title={t('ai_settings.default_category')}
                defaultOpen
                bodyClassName="px-6 pb-6 pt-0"
            >
                <select
                    value={localSettings.defaultCategory}
                    onChange={(e) => persistSettings({ ...localSettings, defaultCategory: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    {localSettings.categories.map((cat: string) => (
                        <option key={cat} value={cat}>
                            {cat}
                        </option>
                    ))}
                </select>
            </CollapsibleCard>

            <CollapsibleCard
                title={t('ai_settings.allowed_categories')}
                subtitle={t('category_settings.allowed_subtitle')}
                defaultOpen
                bodyClassName="px-6 pb-6 pt-0 space-y-3"
            >
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                        placeholder={t('ai_settings.add_category')}
                        className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                        type="button"
                        onClick={addCategory}
                        className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                        {t('ai_settings.add_button')}
                    </button>
                </div>
                <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 min-h-[100px]">
                    {localSettings.categories.map((cat: string) => (
                        <div
                            key={cat}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 shadow-sm"
                        >
                            <CategoryIcon category={cat} className="w-4 h-4 text-gray-500 shrink-0" />
                            <span>{cat}</span>
                            <button
                                type="button"
                                onClick={() => removeCategory(cat)}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            </CollapsibleCard>

            <CollapsibleCard
                title={t('ai_settings.meta_title')}
                subtitle={t('ai_settings.meta_description')}
                defaultOpen
                bodyClassName="px-6 pb-6 pt-0"
            >
                <CategoryMetaBoard
                    categories={localSettings.categories}
                    categoryMeta={localSettings.categoryMeta}
                    onChange={(next) => persistSettings({ ...localSettings, categoryMeta: next })}
                />
            </CollapsibleCard>

            <CollapsibleCard
                title={t('ai_settings.recategorize_all')}
                subtitle={t('ai_settings.recategorize_all_desc')}
                defaultOpen
                bodyClassName="px-6 pb-6 pt-0"
            >
                <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                            <input
                                type="checkbox"
                                checked={forceRecat}
                                onChange={(e) => setForceRecat(e.target.checked)}
                                className="sr-only"
                            />
                            <div
                                className={`w-10 h-6 rounded-full transition-colors ${forceRecat ? 'bg-indigo-600' : 'bg-gray-300'}`}
                            />
                            <div
                                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${forceRecat ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                        </div>
                        <span className="text-sm font-medium text-indigo-900">{t('ai_settings.force_recategorize')}</span>
                    </label>

                    <button
                        type="button"
                        onClick={handleRecategorizeAll}
                        disabled={isRecategorizing}
                        className="w-full py-3 bg-white text-indigo-600 border-2 border-indigo-200 hover:border-indigo-600 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isRecategorizing ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                {t('explorer.categorizing')}
                            </>
                        ) : (
                            t('ai_settings.recategorize_button')
                        )}
                    </button>
                </div>
            </CollapsibleCard>
        </div>
    );
}
