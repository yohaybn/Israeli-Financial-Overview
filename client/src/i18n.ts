import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

type TranslationModule = {
    default?: Record<string, unknown>;
};

const mergeLocaleParts = (modules: Record<string, TranslationModule>) =>
    Object.values(modules).reduce<Record<string, unknown>>((acc, module) => {
        const payload = module.default ?? module;
        return { ...acc, ...payload };
    }, {});

const enParts = import.meta.glob<TranslationModule>('./locales/en/*.json', { eager: true });
const heParts = import.meta.glob<TranslationModule>('./locales/he/*.json', { eager: true });

const translationEn = { ...mergeLocaleParts(enParts) };
const translationHe = { ...mergeLocaleParts(heParts) };

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: translationEn },
            he: { translation: translationHe }
        },
        fallbackLng: 'he',
        lng: 'he', // Default language is Hebrew
        interpolation: {
            escapeValue: false
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage']
        }
    });

// Handle RTL
i18n.on('languageChanged', (lng) => {
    document.dir = lng === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
});

// Initial set
document.dir = i18n.language === 'he' ? 'rtl' : 'ltr';
document.documentElement.lang = i18n.language;

export default i18n;
