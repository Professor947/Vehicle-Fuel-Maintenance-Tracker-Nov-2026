import i18n, { changeLanguage, use as registerPlugin } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import { getLocales } from 'expo-localization';

import en from './en.json';
import ur from './ur.json';
import type { AppLanguage } from './format';

export function detectLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === 'ur' ? 'ur' : 'en';
}

export function initI18n(lang: AppLanguage) {
  if (!i18n.isInitialized) {
    void registerPlugin(initReactI18next).init({
      resources: { en: { translation: en }, ur: { translation: ur } },
      lng: lang,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  } else {
    void changeLanguage(lang);
  }
}

/** Returns true when the layout direction changed and an app restart is needed. */
export function applyDirection(lang: AppLanguage): boolean {
  const rtl = lang === 'ur';
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export { i18n };
export type { AppLanguage };
