import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Card, ErrorState, Field, SectionTitle, SkeletonRows, TextInput } from '../../components/ui';
import { IconCard, IconCheck, IconDownload, IconPhone } from '../../components/icons';

export type BillingInfo = {
  subscription: { state: 'trial' | 'active' | 'expired' | 'unlimited'; until: string | null; days_left: number | null; plan: string | null };
  plans: { id: 'month' | 'semester' | 'year'; months: number; amount: number }[];
  methods: ('edahabia' | 'cib')[];
  test_mode: boolean;
  pay_phone: string;
  payments: { id: string; plan: string; amount_da: number; method: string; status: string; created_at: string; paid_at: string | null; invoice_id: string | null; invoice_number: string | null }[];
};

const fmtDA = (n: number, lang: string) => `${new Intl.NumberFormat(lang === 'ar' ? 'ar-DZ' : 'fr-FR').format(n)} DA`;

/** Abonnement du cabinet : statut, formules, paiement Edahabia / CIB. */
export function Billing() {
  const { t, lang, apiError, formatDateTime } = useI18n();
  const { permissions } = useAuth();
  const owner = !!permissions?.manageProfile;
  const [params] = useSearchParams();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<'month' | 'semester' | 'year'>('year');
  const [method, setMethod] = useState<'edahabia' | 'cib'>('edahabia');
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  // Option discrète : paiement par téléphone + code d'activation.
  const [altOpen, setAltOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeOk, setCodeOk] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await api<BillingInfo>('/api/staff/billing'));
      setError(null);
    } catch (e) {
      setError(apiError((e as ApiError).code, (e as ApiError).message));
    }
  }, [apiError]);
  useEffect(() => {
    void load();
  }, [load]);

  const pay = async () => {
    setBusy(true);
    setPayError(null);
    try {
      const r = await api<{ checkout_url: string }>('/api/staff/billing/checkout', { method: 'POST', body: { plan, method, lang } });
      window.location.assign(r.checkout_url);
    } catch (e) {
      setPayError(apiError((e as ApiError).code, (e as ApiError).message));
      setBusy(false);
    }
  };

  const redeem = async () => {
    setBusy(true);
    setCodeError(null);
    setCodeOk(false);
    try {
      await api('/api/staff/billing/redeem', { method: 'POST', body: { code } });
      setCodeOk(true);
      setCode('');
      await load();
    } catch (e) {
      const err = e as ApiError;
      setCodeError(err.fields?.code || apiError(err.code, err.message));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!info) return <SkeletonRows rows={4} />;

  const s = info.subscription;
  const methodLabel = (m: string) => (m === 'cib' ? 'CIB' : m === 'phone' ? t('methodPhone') : 'Edahabia');
  const planLabel = (id: string) => (id === 'month' ? t('planMonth') : id === 'semester' ? t('planSemester') : id === 'year' ? t('planYear') : t('billingTrial'));
  const stateLabel = { trial: t('billingTrial'), active: t('billingActive'), expired: t('billingExpired'), unlimited: t('billingUnlimited') }[s.state];
  const stateTone = s.state === 'expired' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-brand-50 text-brand-800 ring-brand-200';

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink-900">{t('billingTitle')}</h1>

      {params.get('paiement') === 'ok' ? <Alert tone="success">{t('payOk')}</Alert> : null}
      {params.get('paiement') === 'echec' ? <Alert tone="error">{t('payFailed')}</Alert> : null}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ring-1 ${stateTone}`}>{stateLabel}</span>
          {s.until ? (
            <p className="mt-2 text-sm text-ink-700">
              {t('billingUntil')}{' '}
              <b>{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-DZ' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s.until))}</b>
              {s.state !== 'expired' ? ` · ${s.days_left} ${t('billingDaysLeft')}` : ''}
            </p>
          ) : null}
          {s.state === 'expired' ? <p className="mt-1 text-sm text-red-700">{t('billingExpiredHint')}</p> : null}
        </div>
      </Card>

      {owner ? (
        <section>
          <SectionTitle hint={t('paySecure')}>{t('billingChoose')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('billingChoose')}>
            {info.plans.map((p) => {
              const selected = plan === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPlan(p.id)}
                  className={`relative flex flex-col items-start gap-1 rounded-2xl border bg-white p-4 text-start transition ${
                    selected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {p.id === 'year' ? (
                    <span className="absolute -top-2.5 end-3 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950">{t('bestDeal')}</span>
                  ) : null}
                  <span className="text-sm font-semibold text-ink-700">{planLabel(p.id)}</span>
                  <span className="text-2xl font-bold text-ink-900">{fmtDA(p.amount, lang)}</span>
                  <span className="text-xs text-ink-500">
                    {fmtDA(Math.round(p.amount / p.months), lang)} {t('perMonth')}
                  </span>
                  {selected ? <IconCheck size={18} className="absolute bottom-3 end-3 text-brand-600" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink-700">{t('payWith')} :</span>
            {info.methods.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={`btn-sm rounded-xl border px-3 font-semibold ${method === m ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-ink-700'}`}
              >
                {m === 'edahabia' ? 'Edahabia' : 'CIB'}
              </button>
            ))}
          </div>

          {payError ? <div className="mt-3"><Alert tone="error">{payError}</Alert></div> : null}

          <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled={busy} onClick={pay}>
            <IconCard size={18} /> {t('payButton')} {fmtDA(info.plans.find((p) => p.id === plan)!.amount, lang)}
          </button>

          <div className="mt-5">
            <button type="button" className="text-xs font-medium text-ink-500 underline" aria-expanded={altOpen} onClick={() => setAltOpen((v) => !v)}>
              {t('altPayLink')}
            </button>
            {altOpen ? (
              <Card className="mt-2 space-y-3 p-4">
                <p className="flex items-start gap-2 text-sm text-ink-700">
                  <IconPhone size={16} className="mt-0.5 shrink-0 text-brand-600" />
                  <span>
                    {t('altPayCall')}{' '}
                    <a className="font-semibold text-brand-800" href={`tel:${info.pay_phone.replace(/\s/g, '')}`} dir="ltr">
                      {info.pay_phone}
                    </a>
                    . {t('altPayHint')}
                  </span>
                </p>
                {codeOk ? <Alert tone="success">{t('codeOk')}</Alert> : null}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[220px] flex-1">
                    <Field label={t('codeLabel')} htmlFor="b-code" error={codeError || undefined}>
                      <TextInput id="b-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="RV-XXXX-XXXX" dir="ltr" autoComplete="off" maxLength={20} />
                    </Field>
                  </div>
                  <button type="button" className="btn-secondary" disabled={busy || code.trim().length < 8} onClick={redeem}>
                    {t('codeActivate')}
                  </button>
                </div>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      {info.payments.length ? (
        <section>
          <SectionTitle>{t('payHistory')}</SectionTitle>
          <Card className="divide-y divide-slate-100">
            {info.payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  {planLabel(p.plan)} · {fmtDA(p.amount_da, lang)} · {methodLabel(p.method)}
                </span>
                <span className="text-xs text-ink-500">{formatDateTime(p.paid_at || p.created_at)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.status === 'paid' ? 'bg-emerald-50 text-emerald-800' : p.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-ink-700'
                  }`}
                >
                  {p.status === 'paid' ? t('payStatusPaid') : p.status === 'failed' ? t('payStatusFailed') : t('payStatusPending')}
                </span>
                {p.invoice_id && owner ? (
                  <a className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 underline" href={`/api/staff/billing/invoices/${p.invoice_id}.pdf`}>
                    <IconDownload size={14} /> {t('invoice')} {p.invoice_number}
                  </a>
                ) : null}
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}

/** Mode démonstration : page de paiement simulée (aucun argent prélevé). */
export function BillingTest() {
  const { t, apiError } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get('p') || '';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const finish = async (result: 'paid' | 'failed') => {
    setBusy(true);
    try {
      await api(`/api/staff/billing/test/${encodeURIComponent(id)}/${result}`, { method: 'POST', body: {} });
      navigate(`/staff/abonnement?paiement=${result === 'paid' ? 'ok' : 'echec'}`, { replace: true });
    } catch (e) {
      setErr(apiError((e as ApiError).code, (e as ApiError).message));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="space-y-3 p-5">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
          <IconCard size={20} className="text-brand-600" /> {t('testPayTitle')}
        </h1>
        <p className="text-sm text-ink-500">{t('testPayHint')}</p>
        {err ? <Alert tone="error">{err}</Alert> : null}
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => finish('paid')}>
          {t('testPayOk')}
        </button>
        <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => finish('failed')}>
          {t('testPayKo')}
        </button>
      </Card>
    </div>
  );
}
