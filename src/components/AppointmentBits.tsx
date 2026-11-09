import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api, ApiError, type Appointment, type DayAvailability, type Slot } from '../lib/api';
import { addDays, isoToLocalInput, localToIso, todayStr } from '../lib/dates';
import { Alert, Modal, ReasonLabel, StatusBadge, SkeletonRows } from './ui';
import { IconAlert, IconCheck, IconClock, IconRefresh, IconTrash, IconUser } from './icons';
import { STATUSES } from '../../shared/constants';

/** Carte compacte d'un rendez-vous (tableau de bord, listes). */
export function AppointmentCard({
  appointment,
  onOpen,
  showDate = false,
}: {
  appointment: Appointment;
  onOpen: (a: Appointment) => void;
  showDate?: boolean;
}) {
  const { formatDate, t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onOpen(appointment)}
      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-start transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <div className="w-14 shrink-0 text-center">
        <p className="tnum text-sm font-bold text-ink-900" dir="ltr">{appointment.start}</p>
        <p className="tnum text-[10px] text-ink-500" dir="ltr">{appointment.end}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-900">
          {appointment.patient_first_name} {appointment.patient_last_name}
        </p>
        <p className="truncate text-xs text-ink-500">
          <ReasonLabel code={appointment.reason_code} /> · <span dir="ltr">{appointment.patient_phone}</span>
          {showDate ? ` · ${formatDate(appointment.date, { day: 'numeric', month: 'short' })}` : ''}
        </p>
      </div>
      <StatusBadge status={appointment.status} />
    </button>
  );
}

type HistoryEntry = { id: string; action: string; actor_label: string; created_at: string; metadata: any };

const ALLOWED: Record<string, string[]> = {
  requested: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['arrived', 'completed', 'cancelled', 'no_show'],
  arrived: ['completed', 'cancelled', 'no_show'],
  completed: ['cancelled'],
  cancelled: [],
  no_show: ['confirmed', 'cancelled'],
};

/** Modale de détail : statut, déplacement, annulation, historique. */
export function AppointmentModal({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: Appointment | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, lang, formatDateTime, formatDate, apiError } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'move'>('view');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    setMode('view');
    setSlot(null);
    setError(null);
    if (!appointment) return;
    setDate(appointment.date);
    api<{ history: HistoryEntry[] }>(`/api/staff/appointments/${appointment.id}/history`)
      .then((d) => setHistory(d.history))
      .catch(() => setHistory([]));
  }, [appointment]);

  const loadSlots = useCallback(
    async (d: string) => {
      setSlotsLoading(true);
      try {
        const res = await api<{ days: DayAvailability[] }>(`/api/staff/availability?from=${d}&days=1`);
        setSlots(res.days[0]?.slots || []);
      } catch (err) {
        setError(apiError((err as ApiError).code));
      } finally {
        setSlotsLoading(false);
      }
    },
    [apiError],
  );

  useEffect(() => {
    if (mode === 'move' && appointment) loadSlots(date);
  }, [mode, date, loadSlots, appointment]);

  if (!appointment) return null;

  const patch = async (body: any, successMessage?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/staff/appointments/${appointment.id}`, { method: 'PATCH', body });
      onChanged();
      if (successMessage) {
        // Retour discret : la liste se rafraîchit, la modale reste ouverte.
        setHistory((h) => h);
      }
      if (body.starts_at) {
        setMode('view');
        setSlot(null);
      }
    } catch (err) {
      setError(apiError((err as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  const actions = ALLOWED[appointment.status] || [];

  return (
    <Modal open={!!appointment} onClose={onClose} title={t('appointmentDetail')} wide>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-ink-900">
              {appointment.patient_first_name} {appointment.patient_last_name}
            </p>
            <p className="text-sm text-ink-500">
              <span className="tnum" dir="ltr">{appointment.start} – {appointment.end}</span>{' '}
              · {formatDate(appointment.date, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <dl className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-500">{t('phone')}</dt>
            <dd className="tnum" dir="ltr">{appointment.patient_phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">{t('email')}</dt>
            <dd className="truncate" dir="ltr">{appointment.patient_email || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">{t('reason')}</dt>
            <dd><ReasonLabel code={appointment.reason_code} /></dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">{t('reference')}</dt>
            <dd className="tnum" dir="ltr">{appointment.reference}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">{t('source')}</dt>
            <dd>{appointment.source === 'online' ? t('sourceOnline') : t('sourceStaff')}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">{t('patientLanguage')}</dt>
            <dd>{appointment.patient_language === 'ar' ? 'العربية' : 'Français'}</dd>
          </div>
          {appointment.free_text ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-500">{t('freeTextLabel')}</dt>
              <dd className="whitespace-pre-wrap rounded-lg bg-white p-2 text-ink-900 ring-1 ring-slate-200" dir={appointment.free_text_lang === 'ar' ? 'rtl' : 'ltr'}>
                {appointment.free_text}
              </dd>
              <p className="mt-1 text-[11px] text-ink-500">
                {appointment.free_text_lang && appointment.free_text_lang !== lang ? 'Texte conservé tel que saisi par le patient.' : ''}
              </p>
            </div>
          ) : null}
        </dl>

        {mode === 'move' ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
            <p className="mb-2 text-sm font-medium text-ink-900">{t('rescheduleTo')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="input max-w-[190px]"
                value={date}
                min={todayStr()}
                max={addDays(todayStr(), 90)}
                onChange={(e) => { setDate(e.target.value); setSlot(null); }}
                aria-label={t('date')}
              />
              {slotsLoading ? <SkeletonRows rows={1} /> : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  dir="ltr"
                  onClick={() => setSlot(s)}
                  aria-pressed={slot?.start === s.start}
                  className={`tnum min-h-[40px] rounded-lg border text-sm ${slot?.start === s.start ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'}`}
                >
                  {s.time}
                </button>
              ))}
            </div>
            {!slotsLoading && slots.length === 0 ? <p className="mt-2 text-xs text-ink-500">{t('noSlotsTitle')}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setMode('view'); setSlot(null); }}>{t('cancel')}</button>
              <button type="button" className="btn-primary btn-sm" disabled={!slot || busy} onClick={() => patch({ starts_at: slot!.start })}>
                <IconCheck size={15} /> {t('confirm')}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {actions.includes('confirmed') ? (
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => patch({ status: 'confirmed' })}>
              <IconCheck size={15} /> {t('confirmRequest')}
            </button>
          ) : null}
          {actions.includes('arrived') ? (
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => patch({ status: 'arrived' })}>
              <IconUser size={15} /> {t('arrived')}
            </button>
          ) : null}
          {actions.includes('completed') ? (
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => patch({ status: 'completed' })}>
              <IconCheck size={15} /> {t('completed')}
            </button>
          ) : null}
          {actions.includes('no_show') ? (
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => patch({ status: 'no_show' })}>
              <IconAlert size={15} /> {t('markNoShow')}
            </button>
          ) : null}
          {!['cancelled', 'completed'].includes(appointment.status) ? (
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setMode('move')}>
              <IconRefresh size={15} /> {t('moveAppointment')}
            </button>
          ) : null}
          {appointment.status !== 'cancelled' ? (
            <button type="button" className="btn-danger btn-sm" disabled={busy} onClick={() => patch({ status: 'cancelled' })}>
              <IconTrash size={15} /> {t('cancelAppointment')}
            </button>
          ) : null}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{t('history')}</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {history.length === 0 ? <li className="text-ink-500">{t('noData')}</li> : null}
            {history.map((h) => (
              <li key={h.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                <IconClock size={13} className="mt-0.5 shrink-0 text-ink-500" />
                <span className="flex-1">
                  <span className="font-medium text-ink-700">{h.action}</span>
                  {h.metadata?.from ? ` (${h.metadata.from} → ${h.metadata.to})` : ''}
                  <span className="block text-[11px] text-ink-500">
                    {h.actor_label} · {formatDateTime(h.created_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
