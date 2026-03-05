import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAISettings, useUpdateAISettings, useAIModels } from '../hooks/useScraper';

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

    const [localSettings, setLocalSettings] = useState<any>(null);
    const [newCategory, setNewCategory] = useState('');

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
        }
    }, [settings]);

    if (!isInline && (!isOpen || !localSettings)) return null;
    if (isInline && !localSettings) return <div className="p-8 text-center text-gray-500">Loading AI settings...</div>;

    const handleSave = () => {
        updateSettings(localSettings, {
            onSuccess: () => onClose?.()
        });
    };

    const addCategory = () => {
        if (!newCategory.trim()) return;
        if (localSettings.categories.includes(newCategory.trim())) return;
        setLocalSettings({
            ...localSettings,
            categories: [...localSettings.categories, newCategory.trim()]
        });
        setNewCategory('');
    };

    const removeCategory = (cat: string) => {
        setLocalSettings({
            ...localSettings,
            categories: localSettings.categories.filter((c: string) => c !== cat)
        });
    };

    const content = (
        <div className={`${isInline ? '' : 'bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200'}`}>
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

            <div className="p-6 space-y-6 overflow-y-auto">
                {/* Model Selection */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('ai_settings.categorization_model')}</label>
                        <select
                            value={localSettings.categorizationModel}
                            onChange={(e) => setLocalSettings({ ...localSettings, categorizationModel: e.target.value })}
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
                            onChange={(e) => setLocalSettings({ ...localSettings, chatModel: e.target.value })}
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
                </div>

                {/* Default Category */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('ai_settings.default_category')}</label>
                    <select
                        value={localSettings.defaultCategory}
                        onChange={(e) => setLocalSettings({ ...localSettings, defaultCategory: e.target.value })}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {localSettings.categories.map((cat: string) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                {/* Category List */}
                <div className="space-y-3">
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
                </div>
            </div>

            <div className="p-6 bg-gray-50 flex justify-end gap-3 sticky bottom-0">
                <button
                    onClick={onClose}
                    className="px-6 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
                >
                    {t('common.cancel')}
                </button>
                <button
                    onClick={handleSave}
                    disabled={isPending}
                    className="px-8 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-200 disabled:opacity-50"
                >
                    {isPending ? t('ai_settings.saving') : t('ai_settings.save_button')}
                </button>
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
