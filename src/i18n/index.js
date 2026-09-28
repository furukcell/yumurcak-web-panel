import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷', antd: 'tr_TR', dir: 'ltr' },
  { code: 'en', label: 'English', flag: '🇬🇧', antd: 'en_US', dir: 'ltr' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺', antd: 'ru_RU', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', antd: 'de_DE', dir: 'ltr' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', antd: 'fr_FR', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', antd: 'ar_EG', dir: 'rtl' },
];

const savedLanguage = localStorage.getItem('yumurcak_language');
const browserLanguage = (navigator.language || 'tr').split('-')[0];
const initialLanguage = SUPPORTED_LANGUAGES.some((x) => x.code === savedLanguage)
  ? savedLanguage
  : SUPPORTED_LANGUAGES.some((x) => x.code === browserLanguage)
    ? browserLanguage
    : 'tr';

i18n
  .use(initReactI18next)
  .init({
    resources: { tr: { translation: tr }, en: { translation: en }, ru: { translation: ru }, de: { translation: de }, fr: { translation: fr }, ar: { translation: ar } },
    lng: initialLanguage,
    fallbackLng: 'tr',
    interpolation: { escapeValue: false },
  });

export function setLanguage(language) {
  if (!SUPPORTED_LANGUAGES.some((x) => x.code === language)) return;
  localStorage.setItem('yumurcak_language', language);
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  i18n.changeLanguage(language);
}

setLanguage(initialLanguage);

export default i18n;
