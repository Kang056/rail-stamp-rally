'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import zhTW, { type Translations } from './locales/zh-TW';
import en from './locales/en';

export type LocaleCode = 'zh-TW' | 'en';

const LOCALES: Record<LocaleCode, Translations> = {
  'zh-TW': zhTW,
  en,
};

const STORAGE_KEY = 'rail-stamp-rally-locale';

interface I18nContextValue {
  locale: LocaleCode;
  t: Translations;
  setLocale: (locale: LocaleCode) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'zh-TW',
  t: zhTW,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>('zh-TW');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as LocaleCode | null;
    if (saved && saved in LOCALES) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((newLocale: LocaleCode) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    // Update html lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
    }
  }, []);

  return (
    <I18nContext.Provider value={{ locale, t: LOCALES[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
