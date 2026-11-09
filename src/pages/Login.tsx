import React, { useState } from 'react';
import { LogoMark } from '../components/LogoMark';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Alert, Card, Field, TextInput } from '../components/ui';
import { IconLock } from '../components/icons';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { DemoBanner } from '../components/PatientLayout';
import { Form, SubmitButton } from '../components/form';

const DEMO_ACCOUNTS = [
  { email: 'dentiste@demo.dz', roleKey: 'owner' as const, practice: 'Cabinet El Yasmine (Alger)' },
  { email: 'secretaire@demo.dz', roleKey: 'secretary' as const, practice: 'Cabinet El Yasmine (Alger)' },
  { email: 'dentiste.nour@demo.dz', roleKey: 'owner' as const, practice: 'Cabinet du Dr Nour (Oran)' },
];
const DEMO_PASSWORD = 'Demo2026!dent';

export function Login() {
  const { t } = useI18n();
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { apiError } = useI18n();

  if (!loading && user) return <Navigate to="/staff" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate('/staff', { replace: true });
    } catch (err) {
      const e2 = err as ApiError;
      setError(apiError(e2.code, e2.message));
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
          <div className="mb-4">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
              <IconLock size={18} className="text-brand-600" /> {t('loginTitle')}
            </h1>
            <p className="mt-1 text-xs text-ink-500">{t('loginSubtitle')}</p>
          </div>

          {error ? <div className="mb-3"><Alert tone="error">{error}</Alert></div> : null}

          <Form onSubmit={submit} className="space-y-3">
            <Field label={t('email')} htmlFor="login-email" required>
              <TextInput
                id="login-email"
                type="email"
                dir="ltr"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="dentiste@demo.dz"
              />
            </Field>
            <Field label={t('password')} htmlFor="login-password" required>
              <div className="relative">
                <TextInput
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pe-20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-1 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                >
                  {showPassword ? t('hidePassword') : t('showPassword')}
                </button>
              </div>
            </Field>
            <SubmitButton className="btn-primary w-full" disabled={busy} onClick={submit}>
              {busy ? t('saving') : t('loginButton')}
            </SubmitButton>
          </Form>
        </Card>

        <Card className="mt-4 flex items-center justify-between gap-3 p-4">
          <p className="text-sm font-medium text-ink-900">{t('noAccount')}</p>
          <Link to="/staff/inscription" className="btn-primary btn-sm shrink-0">{t('createAccount')}</Link>
        </Card>

        <Card className="mt-4 p-4">
          <p className="text-xs font-semibold text-ink-900">{t('demoAccounts')}</p>
          <p className="mt-1 text-[11px] text-ink-500">{t('demoAccountsHint')}</p>
          <ul className="mt-2 space-y-1.5">
            {DEMO_ACCOUNTS.map((acc) => (
              <li key={acc.email} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink-900" dir="ltr">{acc.email}</p>
                  <p className="truncate text-[11px] text-ink-500">
                    {acc.roleKey === 'owner' ? t('owner') : t('secretary')} · {acc.practice}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm shrink-0"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                >
                  {t('fillDemo')}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-500" dir="ltr">
            {t('password')} : <code className="rounded bg-slate-100 px-1 py-0.5">{DEMO_PASSWORD}</code>
          </p>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-500">
          <Link to="/" className="link">{t('navHome')}</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/aide" className="link">{t('navHelp')}</Link>
        </p>
      </div>
    </div>
  );
}
