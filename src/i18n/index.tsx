import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dictionaries, errorMessages, type Dict, type Lang } from './dictionary';

const STORAGE_KEY = 'mawid.lang';

type I18nValue = {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (l: Lang) => void;
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string;
  apiError: (code?: string, fallbackMessage?: string) => string;
  /** Libellé localisé d'un champ bilingue renvoyé par l'API. */
  bil: (fr?: string | null, ar?: string | null) => string;
  formatDate: (dateStr: string, opts?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (iso: string) => string;
  weekdayShort: (weekday: number) => string;
  weekdayLong: (weekday: number) => string;
  monthLabel: (year: number, month: number) => string;
  intlLocale: string;
};

const I18nContext = createContext<I18nValue | null>(null);

function readInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'ar') return stored;
  } catch {
    /* stockage indisponible (mode privé) : on reste sur le français */
  }
  return 'fr';
}

export const intlLocale = (lang: Lang) => (lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-DZ');

export function I18nProvider({ children, initialLang }: { children: React.ReactNode; initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initialLang || readInitialLang());
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = dir;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const value = useMemo<I18nValue>(() => {
    const dict = dictionaries[lang];
    const t: I18nValue['t'] = (key, vars) => {
      let str = dict[key] ?? dictionaries.fr[key] ?? String(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v));
      }
      return str;
    };
    const locale = intlLocale(lang);
    return {
      lang,
      dir,
      setLang,
      t,
      apiError: (code, fallbackMessage) => {
        if (code && errorMessages[lang][code]) return errorMessages[lang][code];
        if (code && errorMessages.fr[code]) return errorMessages[lang][code] || errorMessages.fr[code];
        return fallbackMessage || dictionaries[lang].errorGeneric;
      },
      bil: (frText, arText) => (lang === 'ar' ? arText || frText || '' : frText || arText || ''),
      formatDate: (dateStr, opts) => {
        const d = new Date(`${dateStr}T12:00:00`);
        return new Intl.DateTimeFormat(locale, opts || { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
      },
      formatDateTime: (iso) =>
        new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Africa/Algiers',
        }).format(new Date(iso)),
      weekdayShort: (weekday) => {
        const names = lang === 'ar'
          ? ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
          : ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        return names[weekday] ?? '';
      },
      weekdayLong: (weekday) => {
        const names = lang === 'ar'
          ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
          : ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        return names[weekday] ?? '';
      },
      monthLabel: (year, month) => {
        const d = new Date(Date.UTC(year, month, 1));
        return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
      },
      intlLocale: locale,
    };
  }, [lang, dir, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n doit être utilisé dans I18nProvider');
  return ctx;
}

export type { Lang };
