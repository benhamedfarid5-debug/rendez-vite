import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiError, type Appointment } from '../../lib/api';
import { addDays, todayStr } from '../../lib/dates';
import { Card, EmptyState, ErrorState, Field, Select, SkeletonRows, StatusBadge, TextInput, ReasonLabel } from '../../components/ui';
import { AppointmentModal } from '../../components/AppointmentBits';
import { IconDownload, IconList, IconSearch } from '../../components/icons';
import { STATUSES } from '../../../shared/constants';

export function AppointmentsList() {
  const { t, lang, apiError, formatDate } = useI18n();
  const [params, setParams] = useSearchParams();
  const [from, setFrom] = useState(params.get('from') || addDays(todayStr(), -7));
  const [to, setTo] = useState(params.get('to') || addDays(todayStr(), 30));
  const [status, setStatus] = useState(params.get('status') || '');
  const [q, setQ] = useState(params.get('q') || '');
  const [rows, setRows] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      if (status) qs.set('status', status);
      if (q.trim()) qs.set('q', q.trim());
      const res = await api<{ appointments: Appointment[] }>(`/api/staff/appointments?${qs.toString()}`);
      setRows(res.appointments);
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('from', from);
        next.set('to', to);
        if (status) next.set('status', status); else next.delete('status');
        return next;
      }, { replace: true });
    } catch (err) {
      setError(apiError((err as ApiError).code));
    } finally {
      setLoading(false);
    }
  }, [from, to, status, q, apiError, setParams]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const exportCsv = () => {
    // Export local : uniquement les colonnes utiles au planning, jamais de texte médical.
    const header = ['reference', 'date', 'debut', 'fin', 'statut', 'nom', 'prenom', 'telephone', 'motif', 'source'];
    const lines = rows.map((a) =>
      [
        a.reference,
        a.date,
        a.start,
        a.end,
        a.status,
        a.patient_last_name,
        a.patient_first_name,
        a.patient_phone,
        a.reason_code || '',
        a.source,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rendez-vous-${from}_${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{t('appointmentsTitle')}</h1>
          <p className="text-xs text-ink-500">{rows.length} {t('appointmentsCount')}</p>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={exportCsv} disabled={!rows.length}>
          <IconDownload size={15} /> {t('exportCsv')}
        </button>
      </header>

      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('periodFrom')} htmlFor="f-from">
            <TextInput id="f-from" type="date" lang="fr-DZ" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('periodTo')} htmlFor="f-to">
            <TextInput id="f-to" type="date" lang="fr-DZ" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={t('status')} htmlFor="f-status">
            <Select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('all')}</option>
              {STATUSES.map((s) => (
                <option key={s.code} value={s.code}>{lang === 'ar' ? s.ar : s.fr}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('search')} htmlFor="f-q">
            <div className="relative">
              <IconSearch size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <TextInput id="f-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPatient')} className="ps-9" />
            </div>
          </Field>
        </div>
      </Card>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading ? <SkeletonRows rows={6} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState icon={<IconList size={26} />} title={t('noMatchingAppointments')} />
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          {/* Tableau (desktop) */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('appointmentsTitle')}</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start">{t('date')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('time')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('patient')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('reason')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('status')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(a.date, { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2" dir="ltr">{a.start} – {a.end}</td>
                    <td className="px-3 py-2">
                      <span className="block font-medium text-ink-900">{a.patient_first_name} {a.patient_last_name}</span>
                      <span className="tnum block text-xs text-ink-500" dir="ltr">{a.patient_phone}</span>
                    </td>
                    <td className="px-3 py-2"><ReasonLabel code={a.reason_code} /></td>
                    <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                    <td className="px-3 py-2">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setSelected(a)}>{t('details')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cartes (mobile) */}
          <ul className="space-y-2 md:hidden">
            {rows.map((a) => (
              <li key={a.id}>
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{a.patient_first_name} {a.patient_last_name}</p>
                      <p className="tnum text-xs text-ink-500" dir="ltr">
                        {formatDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {a.start}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500"><ReasonLabel code={a.reason_code} /></p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <button type="button" className="btn-secondary btn-sm mt-2 w-full" onClick={() => setSelected(a)}>{t('details')}</button>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <AppointmentModal appointment={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
