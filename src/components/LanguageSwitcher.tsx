import { useI18n } from '../i18n';
import { IconGlobe } from './icons';

/** Sélecteur de langue visible sur toutes les pages (FR / العربية). */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/80 p-0.5 ring-1 ring-slate-200"
      role="group"
      aria-label={t('switchLanguage')}
    >
      <IconGlobe size={14} className="ms-1.5 text-ink-500" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setLang('fr')}
        aria-pressed={lang === 'fr'}
        className={`min-h-[32px] min-w-[42px] rounded-full px-2.5 text-sm font-medium leading-none transition-colors ${
          lang === 'fr' ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-slate-100'
        }`}
        lang="fr"
      >
        {compact ? 'FR' : 'Français'}
      </button>
      <button
        type="button"
        onClick={() => setLang('ar')}
        aria-pressed={lang === 'ar'}
        className={`min-h-[32px] min-w-[42px] rounded-full px-2.5 text-sm font-medium leading-none transition-colors ${
          lang === 'ar' ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-slate-100'
        }`}
        lang="ar"
      >
        {compact ? 'ع' : 'العربية'}
      </button>
    </div>
  );
}
