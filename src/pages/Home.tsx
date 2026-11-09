import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { Card, Field, Select, TextInput } from '../components/ui';
import { IconCalendar, IconClock, IconPin, IconQr, IconSearch, IconSparkle, IconStethoscope, IconUser } from '../components/icons';
import { QrScanner } from '../components/QrScanner';
import { InstallApp } from '../components/InstallApp';
import { Form, SubmitButton } from '../components/form';

type Wilaya = { code: number; fr: string; ar: string };

export function Home() {
  const { t, lang, bil } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [wilaya, setWilaya] = useState('');
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    api<{ wilayas: Wilaya[] }>('/api/public/wilayas')
      .then((d) => setWilayas(d.wilayas))
      .catch(() => setWilayas([]));
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (wilaya) params.set('wilaya', wilaya);
    navigate(`/recherche?${params.toString()}`);
  };

  const handleScan = (text: string) => {
    setScanError(null);
    // Le QR contient uniquement l'URL publique du cabinet (ou son identifiant).
    try {
      const url = new URL(text, window.location.origin);
      const match = /\/d\/([\w-]+)/.exec(url.pathname);
      if (match) {
        navigate(`/d/${match[1]}`);
        return;
      }
      if (url.origin === window.location.origin) {
        navigate(url.pathname);
        return;
      }
    } catch {
      /* pas une URL */
    }
    if (/^[\w-]{4,64}$/.test(text.trim())) {
      navigate(`/d/${text.trim()}`);
      return;
    }
    setScanError(t('practiceNotFound'));
  };

  return (
    <div className="space-y-6">
      {/* Choix à l'ouverture : patient ou médecin */}
      <div className="grid gap-3 sm:grid-cols-2">
        <a href="#recherche" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card hover:border-brand-300">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><IconUser size={22} /></span>
          <span>
            <span className="block text-base font-semibold text-ink-900">{t('iAmPatient')}</span>
            <span className="block text-xs text-ink-500">{t('iAmPatientHint')}</span>
          </span>
        </a>
        <Link to="/staff/inscription" className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-card hover:border-brand-400">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"><IconStethoscope size={22} /></span>
          <span>
            <span className="block text-base font-semibold text-ink-900">{t('iAmDoctor')}</span>
            <span className="block text-xs text-brand-800">{t('iAmDoctorHint')}</span>
          </span>
        </Link>
      </div>

      <InstallApp />

      {/* Héros */}
      <section id="recherche" className="scroll-mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 px-5 py-7 text-white shadow-card sm:px-8 sm:py-10">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">
            <IconSparkle size={14} /> {t('appTagline')}
          </span>
          <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">{t('heroTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/85">{t('heroSubtitle')}</p>
        </div>

        <Form onSubmit={submit} className="mt-5 rounded-2xl bg-white p-3 shadow-lg sm:p-4" aria-label={t('searchTitle')}>
          <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
            <div>
              <label className="label" htmlFor="home-q">
                {t('searchTitle')}
              </label>
              <div className="relative">
                <IconSearch size={17} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-500" />
                <TextInput
                  id="home-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="ps-9"
                  autoComplete="off"
                  maxLength={60}
                />
              </div>
            </div>
            <Field label={t('searchByCity')} htmlFor="home-wilaya">
              <Select id="home-wilaya" value={wilaya} onChange={(e) => setWilaya(e.target.value)}>
                <option value="">{t('allWilayas')}</option>
                {wilayas.map((w) => (
                  <option key={w.code} value={w.code}>
                    {String(w.code).padStart(2, '0')} — {lang === 'ar' ? w.ar : w.fr}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <SubmitButton className="btn-primary w-full sm:w-auto" onClick={submit}>
                <IconSearch size={17} /> {t('searchButton')}
              </SubmitButton>
            </div>
          </div>
          <button type="button" className="btn-secondary mt-3 w-full" onClick={() => navigate('/recherche?near=1')}>
            <IconPin size={17} /> {t('nearMe')}
          </button>
        </Form>
      </section>

      {/* Scan QR */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <IconQr size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink-900">{t('qrTitle')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">{t('qrExplain')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={scanOpen ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} onClick={() => setScanOpen((v) => !v)} aria-expanded={scanOpen}>
                <IconQr size={16} /> {t('scanQr')}
              </button>
            </div>
            {scanOpen ? (
              <div className="mt-3">
                <QrScanner onDetected={handleScan} />
                {scanError ? <p className="mt-2 text-xs font-medium text-red-700">{scanError}</p> : null}
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <label className="label" htmlFor="manual-code">
                    {t('manualCode')}
                  </label>
                  <div className="flex gap-2">
                    <TextInput id="manual-code" placeholder="cabinet-el-yasmine" onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value) handleScan(value);
                      }
                    }} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Comment ça marche */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-900">{t('howItWorks')}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            { Icon: IconStethoscope, title: t('step1Title'), text: t('step1Text') },
            { Icon: IconCalendar, title: t('step2Title'), text: t('step2Text') },
            { Icon: IconClock, title: t('step3Title'), text: t('step3Text') },
          ].map(({ Icon, title, text }, i) => (
            <li key={title} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon size={17} />
                </span>
                <span className="text-xs font-bold text-brand-600">{i + 1}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-ink-900">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <Card className="flex flex-col gap-3 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-900">{t('navStaff')}</p>
          <p className="text-xs text-ink-500">{t('loginSubtitle')}</p>
        </div>
        <Link to="/staff" className="btn-secondary btn-sm shrink-0">
          {t('login')}
        </Link>
      </Card>

      <p className="text-center text-[11px] text-ink-500">
        <Link to="/confidentialite" className="link">{t('navPrivacy')}</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/aide" className="link">{t('navHelp')}</Link>
      </p>
    </div>
  );
}
