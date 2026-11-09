import React from 'react';
import { LogoMark } from './LogoMark';
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { IconUser } from './icons';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Logo({ light = false }: { light?: boolean }) {
  const { t } = useI18n();
  return (
    <Link to="/" className="flex items-center gap-2 rounded-lg py-1" aria-label={`${t('appName')} — ${t('navHome')}`}>
      <LogoMark size={36} />
      <span className="leading-tight">
        <span className={`block text-[17px] font-bold tracking-tight ${light ? 'text-white' : 'text-ink-900'}`}>{t('appName')}</span>
        <span className={`block text-[11px] ${light ? 'text-white/70' : 'text-ink-500'}`}>{t('appTagline')}</span>
      </span>
    </Link>
  );
}

export function DemoBanner() {
  const { t } = useI18n();
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-[11px] font-medium text-amber-900">
      {t('demoBanner')}
    </div>
  );
}

export function PatientLayout({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  const location = useLocation();
  return (
    <div className="flex min-h-dvh flex-col bg-sand-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        {t('skipToContent')}
      </a>
      <DemoBanner />
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <Link to="/staff" className="btn-ghost btn-sm hidden sm:inline-flex" aria-label={t('navStaff')}>
              <IconUser size={16} /> {t('navStaff')}
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className={`mx-auto w-full flex-1 px-4 py-5 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        {children}
      </main>

      <footer className="mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-5 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs">© {new Date().getFullYear()} {t('appName')} — {t('appTagline')}</p>
          <nav className="flex flex-wrap items-center gap-4 text-xs" aria-label="Liens utiles">
            <Link className="link" to="/confidentialite">{t('navPrivacy')}</Link>
            <Link className="link" to="/aide">{t('navHelp')}</Link>
            {location.pathname !== '/staff' ? (
              <Link className="link" to="/staff">{t('navStaff')}</Link>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  );
}
