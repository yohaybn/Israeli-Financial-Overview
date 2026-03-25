import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import he from './locales/he.json';
import scrapeEn from './locales/scrape-en.json';
import scrapeHe from './locales/scrape-he.json';

const translationEn = { ...en, ...scrapeEn };
const translationHe = { ...he, ...scrapeHe };

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
