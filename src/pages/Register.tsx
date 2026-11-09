import React, { useEffect, useState } from 'react';
import { LogoMark } from '../components/LogoMark';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Alert, Card, Checkbox, Field, Select, TextInput } from '../components/ui';
import { IconUser } from '../components/icons';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { DemoBanner } from '../components/PatientLayout';
import { Form, SubmitButton } from '../components/form';

type Wilaya = { code: number; fr: string; ar: string };
type DirEntry = { slug: string; name_fr: string; name_ar: string | null; city_fr: string | null; city_ar: string | null };

/** Inscription d'un dentiste : reprendre sa fiche de la carte, ou créer un nouveau cabinet. */
export function Register() {
  const { t, lang, bil, apiError } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'claim' | 'new'>('claim');
  const [directory, setDirectory] = useState<DirEntry[]>([]);
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', phone: '',
    claim_slug: '', practice_name: '', wilaya_code: '6', city: '', address: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [honor, setHonor] = useState(false);

  useEffect(() => {
    api<{ dentists: DirEntry[] }>('/api/auth/directory').then((d) => setDirectory(d.dentists)).catch(() => {});
    api<{ wilayas: Wilaya[] }>('/api/public/wilayas').then((d) => setWilayas(d.wilayas)).catch(() => {});
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!honor) {
      setFieldErrors({ honor_declaration: t('honorRequired') });
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: {
          full_name: form.full_name,
          email: form.email.trim(),
          password: form.password,
          phone: form.phone,
          honor_declaration: honor,
          ...(mode === 'claim'
            ? { claim_slug: form.claim_slug }
            : {
                practice_name: form.practice_name,
                wilaya_code: form.wilaya_code ? Number(form.wilaya_code) : null,
                city: form.city,
                address: form.address,
              }),
        },
      });
      await login(form.email.trim(), form.password);
      // Étape suivante : le profil, pour placer le cabinet sur la carte.
      navigate('/staff/profil', { replace: true });
    } catch (err) {
      const e2 = err as ApiError;
      setError(apiError(e2.code, e2.message));
      if (e2.fields) setFieldErrors(e2.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-sand-50">
      <DemoBanner />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark size={40} />
            <span>
              <span className="block text-lg font-bold leading-tight">{t('appName')}</span>
              <span className="block text-[11px] text-ink-500">{t('appTagline')}</span>
            </span>
          </Link>
          <LanguageSwitcher compact />
        </div>

        <Card className="p-5">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
            <IconUser size={18} className="text-brand-600" /> {t('registerTitle')}
          </h1>
          <p className="mt-1 text-xs text-ink-500">{t('registerSubtitle')}</p>

          {error ? <div className="mt-3"><Alert tone="error">{error}</Alert></div> : null}

          <Form onSubmit={submit} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(['claim', 'new'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium ${mode === m ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-ink-700'}`}
                >
                  {m === 'claim' ? t('registerClaim') : t('registerNew')}
                </button>
              ))}
            </div>

            {mode === 'claim' ? (
              <Field label={t('registerPickPractice')} htmlFor="r-claim" required error={fieldErrors.claim_slug}>
                <Select id="r-claim" value={form.claim_slug} onChange={set('claim_slug')} required>
                  <option value="">—</option>
                  {directory.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {bil(d.name_fr, d.name_ar)}
                      {d.city_fr && !d.name_fr.includes(d.city_fr) ? ` — ${bil(d.city_fr, d.city_ar)}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <>
                <Field label={t('registerPracticeName')} htmlFor="r-pname" required error={fieldErrors.practice_name}>
                  <TextInput id="r-pname" value={form.practice_name} onChange={set('practice_name')} maxLength={80} required />
                </Field>
                <Field label={t('wilaya')} htmlFor="r-wilaya">
                  <Select id="r-wilaya" value={form.wilaya_code} onChange={set('wilaya_code')}>
                    {wilayas.map((w) => (
                      <option key={w.code} value={w.code}>
                        {String(w.code).padStart(2, '0')} — {lang === 'ar' ? w.ar : w.fr}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('city')} htmlFor="r-city">
                    <TextInput id="r-city" value={form.city} onChange={set('city')} maxLength={80} />
                  </Field>
                  <Field label={t('address')} htmlFor="r-addr">
                    <TextInput id="r-addr" value={form.address} onChange={set('address')} maxLength={160} />
                  </Field>
                </div>
              </>
            )}

            <Field label={t('registerDoctorName')} htmlFor="r-name" required error={fieldErrors.full_name}>
              <TextInput id="r-name" value={form.full_name} onChange={set('full_name')} placeholder="Dr …" maxLength={80} required />
            </Field>
            <Field label={t('phone')} htmlFor="r-phone" required error={fieldErrors.phone} hint="0551 23 45 67">
              <TextInput id="r-phone" value={form.phone} onChange={set('phone')} dir="ltr" inputMode="tel" maxLength={30} required />
            </Field>
            <Field label={t('email')} htmlFor="r-email" required error={fieldErrors.email}>
              <TextInput id="r-email" type="email" value={form.email} onChange={set('email')} dir="ltr" autoComplete="email" required />
            </Field>
            <Field label={t('password')} htmlFor="r-pass" required error={fieldErrors.password} hint={t('registerPasswordHint')}>
              <TextInput id="r-pass" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={8} required />
            </Field>

            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">{t('honorTitle')}</p>
              <Checkbox
                id="r-honor"
                label={t('honorText')}
                checked={honor}
                onChange={(e) => setHonor(e.target.checked)}
                error={fieldErrors.honor_declaration}
                required
              />
            </div>

            <SubmitButton className="btn-primary w-full" disabled={busy} onClick={submit}>
              {busy ? t('saving') : t('registerButton')}
            </SubmitButton>
          </Form>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-500">
          {t('registerHaveAccount')}{' '}
          <Link to="/staff" className="link">{t('loginButton')}</Link>
        </p>
      </div>
    </div>
  );
}
