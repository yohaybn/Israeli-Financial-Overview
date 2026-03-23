import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CategoryIcon } from '../utils/categoryIcons';
import { useAISettings, useUpdateAISettings, useAIModels, useRecategorizeAll } from '../hooks/useScraper';

interface AISettingsProps {
    isOpen?: boolean;
    onClose?: () => void;
    isInline?: boolean;
}

export function AISettings({ isOpen, onClose, isInline }: AISettingsProps) {
    const { t } = useTranslation();
    const { data: settings } = useAISettings();
    const { data: models } = useAIModels();
    const { mutate: updateSettings, isPending } = useUpdateAISettings();
    const { mutate: recategorizeAll, isPending: isRecategorizing } = useRecategorizeAll();

    const [localSettings, setLocalSettings] = useState<any>(null);
    const [newCategory, setNewCategory] = useState('');
    const [forceRecat, setForceRecat] = useState(false);

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
        }
    }, [settings]);

    if (!isInline && (!isOpen || !localSettings)) return null;
    if (isInline && !localSettings) return <div className="p-8 text-center text-gray-500">{t('ai_settings.loading')}</div>;

    const persistSettings = (next: any) => {
        setLocalSettings(next);
        updateSettings(next, {
            onError: (err: Error) => {
                alert(t('common.save_failed_with_error', { error: err?.message || t('common.unknown_error') }));
            }
        });
    };

    const addCategory = () => {
        if (!newCategory.trim()) return;
        if (localSettings.categories.includes(newCategory.trim())) return;
        const next = {
            ...localSettings,
            categories: [...localSettings.categories, newCategory.trim()]
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
            defaultCategory: nextDefault
        });
    };

    const handleRecategorizeAll = () => {
        if (window.confirm(t('ai_settings.recategorize_all_desc'))) {
            recategorizeAll(forceRecat, {
                onSuccess: (data) => {
                    if (data.error) {
                        alert(t('ai_settings.recategorize_ai_failed', { error: data.error, count: data.count }));
                    } else {
                        alert(t('ai_settings.recategorize_success', { count: data.count }));
                    }
                },
                onError: (err: any) => {
                    alert(t('common.error_with_message', { error: err.message || t('common.unknown_error') }));
                }
            });
        }
    };

    const content = (
        <div className={`${isInline ? 'space-y-6' : 'bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200'}`}>
            {!isInline && (
                <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold">{t('ai_settings.title')}</h3>
                        <p className="text-indigo-100 text-sm">{t('ai_settings.description')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            <div className={`space-y-6 ${isInline ? '' : 'p-6 overflow-y-auto'}`}>
                {isPending && (
                    <div className="flex justify-end">
                        <span className="text-xs text-indigo-600 flex items-center gap-1.5 font-medium">
                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" aria-hidden>
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            {t('ai_settings.saving')}
                        </span>
                    </div>
                )}
                {/* Model Selection */}
                <section className={`${isInline ? 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100' : 'bg-gray-50 rounded-2xl p-5 border border-gray-100'} grid grid-cols-2 gap-4`}>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('ai_settings.categorization_model')}</label>
                        <select
                            value={localSettings.categorizationModel}
                            onChange={(e) => persistSettings({ ...localSettings, categorizationModel: e.target.value })}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {models?.map(m => (
                                <option key={m} value={m}>{m}</option>
                            )) || (
                                    <>
                                        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                    </>
                                )}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('ai_settings.analyst_model')}</label>
                        <select
                            value={localSettings.chatModel}
                            onChange={(e) => persistSettings({ ...localSettings, chatModel: e.target.value })}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {models?.map(m => (
                                <option key={m} value={m}>{m}</option>
                            )) || (
                                    <>
                                        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                    </>
                                )}
                        </select>
                    </div>
                </section>

                {/* Default Category */}
                <section className={`${isInline ? 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100' : 'bg-gray-50 rounded-2xl p-5 border border-gray-100'} space-y-2`}>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('ai_settings.default_category')}</label>
                    <select
                        value={localSettings.defaultCategory}
                        onChange={(e) => persistSettings({ ...localSettings, defaultCategory: e.target.value })}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {localSettings.categories.map((cat: string) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </section>

                {/* Category List */}
                <section className={`${isInline ? 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100' : 'bg-gray-50 rounded-2xl p-5 border border-gray-100'} space-y-3`}>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('ai_settings.allowed_categories')}</label>
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
                            onClick={addCategory}
                            className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                        >
                            {t('ai_settings.add_button')}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 min-h-[100px]">
                        {localSettings.categories.map((cat: string) => (
                            <div key={cat} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 shadow-sm animate-in scale-in-90 duration-150">
                                <CategoryIcon category={cat} className="w-4 h-4 text-gray-500 shrink-0" />
                                <span>{cat}</span>
                                <button
                                    onClick={() => removeCategory(cat)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Bulk Recategorization */}
                <section className={`${isInline ? 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100' : 'bg-gray-50 rounded-2xl p-5 border border-gray-100'} space-y-4`}>
                    <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                        <h4 className="font-bold text-indigo-900 mb-1 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.477 2.387a2 2 0 00.547 1.022l1.428 1.428a2 2 0 001.022.547l2.387.477a2 2 0 001.96-1.414l.477-2.387a2 2 0 00-.547-1.022l-1.428-1.428z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {t('ai_settings.recategorize_all')}
                        </h4>
                        <p className="text-indigo-800 text-xs opacity-80 mb-4">
                            {t('ai_settings.recategorize_all_desc')}
                        </p>
                        
                        <div className="space-y-4">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={forceRecat}
                                        onChange={(e) => setForceRecat(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={`w-10 h-6 rounded-full transition-colors ${forceRecat ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${forceRecat ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                </div>
                                <span className="text-sm font-medium text-indigo-900">{t('ai_settings.force_recategorize')}</span>
                            </label>

                            <button
                                onClick={handleRecategorizeAll}
                                disabled={isRecategorizing}
                                className="w-full py-3 bg-white text-indigo-600 border-2 border-indigo-200 hover:border-indigo-600 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isRecategorizing ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('explorer.categorizing')}
                                    </>
                                ) : (
                                    <>
                                        {t('ai_settings.recategorize_button')}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );

    if (isInline) return content;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            {content}
        </div>
    );
}
