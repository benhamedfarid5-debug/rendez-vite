import React, { useEffect, useState } from 'react';
import { LogoMark } from './LogoMark';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { IconBell, IconCalendar, IconCard, IconHome, IconList, IconLogout, IconSettings, IconUser } from './icons';
import { api } from '../lib/api';
import { LanguageSwitcher } from './LanguageSwitcher';
import { DemoBanner } from './PatientLayout';

type NavItem = { to: string; label: string; Icon: (p: any) => JSX.Element; ownerOnly?: boolean };

export function StaffLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = useI18n();
  const { user, practice, logout, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [navigate]);

  // Rappel d'abonnement : essai, fin proche (7 jours ou moins) ou terminé.
  const [sub, setSub] = useState<{ state: string; days_left: number | null } | null>(null);
  useEffect(() => {
    api<{ subscription: { state: string; days_left: number | null } }>('/api/staff/billing')
      .then((r) => setSub(r.subscription))
      .catch(() => {});
  }, [practice?.id, location.pathname, location.search]);
  const banner =
    !sub || sub.state === 'unlimited'
      ? null
      : sub.state === 'expired'
        ? { tone: 'bg-red-50 text-red-900 border-red-200', text: t('bannerExpired') }
        : sub.state === 'trial'
          ? { tone: 'bg-amber-50 text-amber-900 border-amber-200', text: t('bannerTrial').replace('{n}', String(sub.days_left)) }
          : (sub.days_left ?? 99) <= 7
            ? { tone: 'bg-amber-50 text-amber-900 border-amber-200', text: t('bannerSoon').replace('{n}', String(sub.days_left)) }
            : null;

  const items: NavItem[] = [
    { to: '/staff', label: t('navDashboard'), Icon: IconHome },
    { to: '/staff/agenda', label: t('navAgenda'), Icon: IconCalendar },
    { to: '/staff/rendez-vous', label: t('navAppointments'), Icon: IconList },
    { to: '/staff/profil', label: t('navProfile'), Icon: IconUser, ownerOnly: true },
    { to: '/staff/abonnement', label: t('navBilling'), Icon: IconCard, ownerOnly: true },
    { to: '/staff/reglages', label: t('navSettings'), Icon: IconSettings, ownerOnly: true },
  ].filter((i) => !i.ownerOnly || permissions?.manageProfile);

  const nav = (
    <nav className="flex flex-col gap-1" aria-label={t('navStaff')}>
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/staff'}
          className={({ isActive }) =>
            `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200' : 'text-ink-700 hover:bg-slate-100'
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
      <Link to="/staff/horaires" className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-700 hover:bg-slate-100">
        <IconBell size={18} />
        {t('navSchedule')}
      </Link>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-sand-50">
      <DemoBanner />
      <div className="flex">
        {/* Barre latérale (desktop) */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-slate-200 bg-white px-3 py-4 md:flex">
          <Link to="/staff" className="mb-5 flex items-center gap-2 px-1" aria-label={t('appName')}>
            <LogoMark size={36} />
            <span className="leading-tight">
              <span className="block text-base font-bold">{t('appName')}</span>
              <span className="block truncate text-[11px] text-ink-500">{lang === 'ar' ? practice?.name_ar || practice?.name_fr : practice?.name_fr}</span>
            </span>
          </Link>
          {nav}
          <div className="mt-auto space-y-2 border-t border-slate-200 pt-3">
            <div className="px-2 text-xs text-ink-500">
              <p className="font-medium text-ink-700">{user?.full_name}</p>
              <p>{user?.role === 'owner' ? t('owner') : t('secretary')}</p>
            </div>
            <LanguageSwitcher />
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/staff');
              }}
              className="btn-secondary btn-sm w-full"
            >
              <IconLogout size={16} /> {t('logout')}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* En-tête mobile */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur md:hidden">
            <Link to="/staff" className="flex items-center gap-2">
              <LogoMark size={32} />
              <span className="text-sm font-bold">{t('appName')}</span>
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSwitcher compact />
              <button type="button" onClick={() => setMenuOpen((v) => !v)} className="btn-secondary btn-sm" aria-expanded={menuOpen}>
                {menuOpen ? t('close') : t('menu')}
              </button>
            </div>
          </header>
          {menuOpen ? (
            <div className="border-b border-slate-200 bg-white px-3 py-3 md:hidden">
              {nav}
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/staff');
                }}
                className="btn-secondary btn-sm mt-2 w-full"
              >
                <IconLogout size={16} /> {t('logout')}
              </button>
            </div>
          ) : null}

          {banner ? (
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${banner.tone}`} role="status">
              <span>{banner.text}</span>
              {permissions?.manageProfile ? (
                <Link to="/staff/abonnement" className="font-semibold underline">
                  {t('bannerAction')}
                </Link>
              ) : null}
            </div>
          ) : null}
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 md:pb-8">{children}</main>
        </div>
      </div>

      {/* Barre d'onglets mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label={t('navStaff')}>
        <ul className="flex">
          {items.map(({ to, label, Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/staff'}
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                    isActive ? 'text-brand-700' : 'text-ink-500'
                  }`
                }
              >
                <Icon size={20} />
                <span className="leading-tight">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
