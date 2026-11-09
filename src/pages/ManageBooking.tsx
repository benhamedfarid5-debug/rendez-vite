import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, ApiError, type Appointment, type DayAvailability, type Practice, type Slot } from '../lib/api';
import { addDays, todayStr } from '../lib/dates';
import { Alert, Card, CopyButton, EmptyState, ErrorState, Field, Modal, SkeletonRows, StatusBadge, TextInput } from '../components/ui';
import { IconCalendar, IconCheck, IconChevronLeft, IconClock, IconDownload, IconHome, IconPin, IconRefresh, IconTrash, IconAlert } from '../components/icons';
import { REASONS } from '../../shared/constants';

type Response = { appointment: Appointment; practice: Practice };

export function ManageBooking() {
  const { ref = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const isNew = params.get('new') === '1';
  const { t, lang, bil, formatDate, formatDateTime, apiError } = useI18n();

  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dataRequest, setDataRequest] = useState<'export' | 'deletion' | null>(null);
  const [exported, setExported] = useState<any>(null);
  // Correction des coordonnées (erreur de frappe).
  const [editOpen, setEditOpen] = useState(false);
  const [contact, setContact] = useState({ first_name: '', last_name: '', phone: '', email: '' });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<Response>(`/api/public/appointments/${encodeURIComponent(ref)}?t=${encodeURIComponent(token)}`);
      setData(res);
    } catch (err) {
      const e = err as ApiError;
      setError({ code: e.code, message: apiError(e.code, e.message) });
    } finally {
      setLoading(false);
    }
  }, [ref, token, apiError]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError({ code: 'NOT_FOUND', message: t('bookingNotFoundText') });
      return;
    }
    load();
  }, [load, token, t]);

  const a = data?.appointment;
  const practice = data?.practice;
  const practiceName = practice ? bil(practice.name_fr, practice.name_ar) : '';
  const manageUrl = useMemo(() => `${window.location.origin}/r/${ref}?t=${encodeURIComponent(token)}`, [ref, token]);

  const loadAvailability = async () => {
    if (!practice) return;
    setDaysLoading(true);
    try {
      const res = await api<{ days: DayAvailability[] }>(`/api/public/practices/${practice.slug}/availability?from=${todayStr()}&days=14`);
      setDays(res.days);
      const first = res.days.find((d) => d.slots.length);
      setSelectedDate(first?.date || null);
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError((err as ApiError).code) });
    } finally {
      setDaysLoading(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/api/public/appointments/${encodeURIComponent(ref)}/cancel`, { method: 'POST', body: { token } });
      setConfirmCancel(false);
      setFeedback({ tone: 'success', text: t('cancelDone') });
      await load();
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError((err as ApiError).code) });
    } finally {
      setBusy(false);
    }
  };

  const doReschedule = async () => {
    if (!selectedSlot) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/api/public/appointments/${encodeURIComponent(ref)}/reschedule`, {
        method: 'POST',
        body: { token, starts_at: selectedSlot.start },
      });
      setRescheduleOpen(false);
      setSelectedSlot(null);
      setFeedback({ tone: 'success', text: t('rescheduleDone') });
      await load();
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError((err as ApiError).code) });
    } finally {
      setBusy(false);
    }
  };

  const doDataRequest = async (kind: 'export' | 'deletion') => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<any>(`/api/public/appointments/${encodeURIComponent(ref)}/data-request`, { method: 'POST', body: { kind, token } });
      if (kind === 'export') {
        setExported(res.export);
        const blob = new Blob([JSON.stringify(res.export, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mawid-export-${ref}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        await load();
      }
      setFeedback({ tone: 'success', text: t('dataRequestDone') });
      setDataRequest(null);
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError((err as ApiError).code) });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <SkeletonRows rows={4} />;

  if (error || !a || !practice) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<IconAlert size={26} />}
          title={t('bookingNotFound')}
          description={t('bookingNotFoundText')}
          action={<Link to="/" className="btn-primary btn-sm">{t('navHome')}</Link>}
        />
      </div>
    );
  }

  const actionable = !['cancelled', 'completed', 'no_show'].includes(a.status);
  const when = `${formatDate(a.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${a.start}`;
  const reason = REASONS.find((r) => r.code === a.reason_code);
  // Message de confirmation que le patient s'envoie à lui-même (WhatsApp / SMS / e-mail).
  const shareText = `${a.status === 'confirmed' ? t('confirmationMsgIntro') : t('requestMsgIntro')} ${practiceName} — ${when}. ${t('yourReference')} : ${a.reference}. ${manageUrl}`;
  const waNumber = String(a.patient_phone || '').replace(/\D/g, '').replace(/^0/, '213');

  const openEdit = () => {
    setContact({ first_name: a.patient_first_name || '', last_name: a.patient_last_name || '', phone: a.patient_phone || '', email: a.patient_email || '' });
    setContactErrors({});
    setEditOpen(true);
  };
  const saveContact = async () => {
    setBusy(true);
    setContactErrors({});
    try {
      await api(`/api/public/appointments/${encodeURIComponent(ref)}/contact`, { method: 'POST', body: { token, ...contact } });
      setEditOpen(false);
      setFeedback({ tone: 'success', text: t('contactUpdated') });
      await load();
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.fields) setContactErrors(e2.fields);
      else setFeedback({ tone: 'error', text: apiError(e2.code, e2.message) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/d/${practice.slug}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
          <IconChevronLeft size={14} className="flip-x" /> {t('backToPractice')}
        </Link>
        <Link to="/" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
          <IconHome size={14} /> {t('navHome')}
        </Link>
      </div>

      {isNew ? (
        <Alert tone={a.status === 'confirmed' ? 'success' : 'warning'} title={a.status === 'confirmed' ? t('bookingSuccessConfirmed') : t('bookingSuccessPending')}>
          {a.status === 'confirmed' ? t('keepReference') : t('bookingPendingExplain')}
        </Alert>
      ) : null}

      {feedback ? <Alert tone={feedback.tone === 'success' ? 'success' : 'error'} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert> : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 bg-brand-50/60 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-brand-700">{t('yourReference')}</p>
              <p className="tnum text-2xl font-bold tracking-wider text-ink-900" dir="ltr">{a.reference}</p>
            </div>
            <StatusBadge status={a.status} />
          </div>
          <p className="mt-2 text-sm text-ink-700">{t('manageBookingTitle')}</p>
        </div>

        <dl className="divide-y divide-slate-100 text-sm">
          <div className="flex items-start gap-3 px-4 py-3">
            <IconCalendar size={18} className="mt-0.5 shrink-0 text-brand-600" />
            <div>
              <dt className="text-xs text-ink-500">{t('date')} & {t('time')}</dt>
              <dd className="font-medium text-ink-900">{when}</dd>
              <dd className="text-xs text-ink-500">{t('duration')} : {Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000)} {t('minutes')}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3">
            <IconPin size={18} className="mt-0.5 shrink-0 text-brand-600" />
            <div>
              <dt className="text-xs text-ink-500">{practiceName}</dt>
              <dd className="text-ink-900">
                {[bil(practice.address_fr, practice.address_ar), bil(practice.city_fr, practice.city_ar)].filter(Boolean).join(', ')}
              </dd>
              {practice.phone ? (
                <dd className="mt-1">
                  <a href={`tel:${practice.phone}`} className="link" dir="ltr">{practice.phone}</a>
                </dd>
              ) : null}
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3">
            <IconClock size={18} className="mt-0.5 shrink-0 text-brand-600" />
            <div>
              <dt className="text-xs text-ink-500">{t('patient')}</dt>
              <dd className="flex items-center gap-2 text-ink-900">
                {a.patient_first_name} {a.patient_last_name}
                {actionable ? (
                  <button type="button" className="text-xs font-medium text-brand-700 underline" onClick={openEdit}>
                    {t('editMyDetails')}
                  </button>
                ) : null}
              </dd>
              {a.patient_email ? <dd className="text-xs text-ink-500" dir="ltr">{a.patient_email}</dd> : null}
              <dd className="text-xs text-ink-500" dir="ltr">{a.patient_phone}</dd>
              {reason ? <dd className="mt-1 text-xs text-ink-500">{t('reason')} : {lang === 'ar' ? reason.ar : reason.fr}</dd> : null}
            </div>
          </div>
        </dl>

        {actionable ? (
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="text-xs font-medium text-ink-700">{t('sendConfirmation')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                className="btn-sm inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3 font-semibold text-white"
                href={`https://wa.me/${waNumber}?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
              <a className="btn-secondary btn-sm" href={`sms:${a.patient_phone}?&body=${encodeURIComponent(shareText)}`}>
                SMS
              </a>
              <a className="btn-secondary btn-sm" href={`mailto:?subject=${encodeURIComponent(t('appName') + ' — ' + a.reference)}&body=${encodeURIComponent(shareText)}`}>
                E-mail
              </a>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-500">{t('sendConfirmationHint')}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <CopyButton value={manageUrl} label={t('copyManageLink')} />
          {actionable ? (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setRescheduleOpen(true); loadAvailability(); }}>
                <IconRefresh size={15} /> {t('rescheduleBooking')}
              </button>
              <button type="button" className="btn-danger btn-sm" onClick={() => setConfirmCancel(true)}>
                <IconTrash size={15} /> {t('cancelBooking')}
              </button>
            </>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-2 p-4 text-sm">
        <p className="font-medium text-ink-900">{t('privacyTitle')}</p>
        <p className="text-xs text-ink-500">{t('privacyRightsList')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-secondary btn-sm" onClick={() => doDataRequest('export')} disabled={busy}>
            <IconDownload size={15} /> {t('exportData')}
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setDataRequest('deletion')} disabled={busy}>
            <IconTrash size={15} /> {t('deleteData')}
          </button>
          <Link to="/confidentialite" className="btn-ghost btn-sm">{t('navPrivacy')}</Link>
        </div>
        {exported ? <p className="text-xs text-emerald-700">{t('dataRequestDone')}</p> : null}
      </Card>

      <p className="text-center text-xs text-ink-500">
        <Link to="/aide" className="link">{t('navHelp')}</Link>
      </p>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('editMyDetails')}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditOpen(false)}>{t('cancel')}</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={saveContact}>{busy ? t('saving') : t('save')}</button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('firstName')} htmlFor="c-first" required error={contactErrors.first_name}>
            <TextInput id="c-first" value={contact.first_name} onChange={(e) => setContact({ ...contact, first_name: e.target.value })} maxLength={60} />
          </Field>
          <Field label={t('lastName')} htmlFor="c-last" required error={contactErrors.last_name}>
            <TextInput id="c-last" value={contact.last_name} onChange={(e) => setContact({ ...contact, last_name: e.target.value })} maxLength={60} />
          </Field>
          <Field label={t('phone')} htmlFor="c-phone" required error={contactErrors.phone}>
            <TextInput id="c-phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} dir="ltr" inputMode="tel" maxLength={30} />
          </Field>
          <Field label={t('email')} htmlFor="c-email" error={contactErrors.email}>
            <TextInput id="c-email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} dir="ltr" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={t('cancelBooking')}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmCancel(false)}>{t('back')}</button>
            <button type="button" className="btn-danger" onClick={doCancel} disabled={busy}>{busy ? t('saving') : t('confirm')}</button>
          </div>
        }
      >
        <p className="text-sm text-ink-700">{t('cancelConfirm')}</p>
      </Modal>

      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title={t('rescheduleBooking')}
        wide
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRescheduleOpen(false)}>{t('cancel')}</button>
            <button type="button" className="btn-primary" disabled={!selectedSlot || busy} onClick={doReschedule}>
              {busy ? t('saving') : t('confirm')}
            </button>
          </div>
        }
      >
        {daysLoading ? (
          <SkeletonRows rows={2} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  disabled={!d.slots.length}
                  onClick={() => { setSelectedDate(d.date); setSelectedSlot(null); }}
                  className={`min-h-[56px] rounded-xl border px-1 py-1 text-xs ${
                    selectedDate === d.date ? 'border-brand-600 bg-brand-600 text-white' : d.slots.length ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  <span className="tnum block text-sm font-semibold">{d.date.slice(8, 10)}</span>
                  <span className="block text-[10px]">{d.slots.length ? d.slots.length : '—'}</span>
                </button>
              ))}
            </div>
            {selectedDate ? (
              <SlotPicker days={days} date={selectedDate} selected={selectedSlot} onSelect={setSelectedSlot} />
            ) : null}
            {!days.some((d) => d.slots.length) ? <EmptyState title={t('noSlotsTitle')} description={t('noSlotsText')} /> : null}
          </div>
        )}
      </Modal>

      <Modal
        open={dataRequest === 'deletion'}
        onClose={() => setDataRequest(null)}
        title={t('deleteData')}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDataRequest(null)}>{t('cancel')}</button>
            <button type="button" className="btn-danger" disabled={busy} onClick={() => doDataRequest('deletion')}>{t('confirm')}</button>
          </div>
        }
      >
        <p className="text-sm text-ink-700">{t('deleteDataWarn')}</p>
      </Modal>
    </div>
  );
}

function SlotPicker({
  days,
  date,
  selected,
  onSelect,
}: {
  days: DayAvailability[];
  date: string;
  selected: Slot | null;
  onSelect: (s: Slot) => void;
}) {
  const { t } = useI18n();
  const slots = days.find((d) => d.date === date)?.slots || [];
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-500">{t('chooseTime')}</p>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {slots.map((s) => (
          <button
            key={s.start}
            type="button"
            onClick={() => onSelect(s)}
            aria-pressed={selected?.start === s.start}
            className={`tnum min-h-[44px] rounded-xl border text-sm ${selected?.start === s.start ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'}`}
            dir="ltr"
          >
            {s.time}
          </button>
        ))}
      </div>
    </div>
  );
}
