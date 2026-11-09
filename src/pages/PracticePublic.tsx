import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, ApiError, type DayAvailability, type Practice, type Slot } from '../lib/api';
import { addDays, todayStr, diffDays } from '../lib/dates';
import {
  Alert,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  SkeletonRows,
  Stepper,
  TextArea,
  TextInput,
} from '../components/ui';
import { IconCalendar, IconCheck, IconClock, IconPhone, IconPin, IconQr, IconChevronLeft, IconChevronRight, IconUser, IconAlert } from '../components/icons';
import { REASONS, WEEKDAYS } from '../../shared/constants';
import { minutesToTime } from '../lib/dates';
import { Form, SubmitButton } from '../components/form';

type ProfileResponse = { practice: Practice & { hours: any[] }; next_availability: { date: string; time: string; count: number } | null };

export function PracticePublic() {
  const { slug = '' } = useParams();
  const { t, lang, bil, formatDate, weekdayShort, apiError } = useI18n();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState(0);
  const [reason, setReason] = useState('');
  const [freeText, setFreeText] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [daysLoading, setDaysLoading] = useState(true);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(todayStr());

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notifyConsent, setNotifyConsent] = useState(true);
  const [privacy, setPrivacy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadProfile = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api<ProfileResponse>(`/api/public/practices/${slug}`)
      .then(setProfile)
      .catch((err: ApiError) => setLoadError(apiError(err.code)))
      .finally(() => setLoading(false));
  }, [slug, t]);

  useEffect(loadProfile, [loadProfile]);

  const loadDays = useCallback(
    (from: string) => {
      setDaysLoading(true);
      setDaysError(null);
      api<{ days: DayAvailability[] }>(`/api/public/practices/${slug}/availability?from=${from}&days=14`)
        .then((d) => setDays(d.days))
        .catch((err: ApiError) => setDaysError(apiError(err.code)))
        .finally(() => setDaysLoading(false));
    },
    [slug, t],
  );

  useEffect(() => {
    if (profile) loadDays(windowStart);
  }, [profile, windowStart, loadDays]);

  const practice = profile?.practice;
  const pname = practice ? bil(practice.name_fr, practice.name_ar) : '';

  const slotsForDay = useMemo(() => {
    if (!selectedDate) return [];
    return days.find((d) => d.date === selectedDate)?.slots || [];
  }, [days, selectedDate]);

  const morning = slotsForDay.filter((s) => Number(s.time.slice(0, 2)) < 13);
  const afternoon = slotsForDay.filter((s) => Number(s.time.slice(0, 2)) >= 13);

  const canGoDetails = !!selectedSlot && !!reason;
  const canSubmit = privacy && firstName.trim().length >= 2 && lastName.trim().length >= 2 && phone.trim().length >= 8;

  const submit = async () => {
    if (!selectedSlot || !practice) return;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const res = await api<{ appointment: any; manage_token: string }>(`/api/public/practices/${slug}/appointments`, {
        method: 'POST',
        body: {
          starts_at: selectedSlot.start,
          first_name: firstName,
          last_name: lastName,
          phone,
          email: email || undefined,
          reason_code: reason,
          free_text: freeText || undefined,
          patient_language: lang,
          notify_consent: notifyConsent,
          privacy_consent: privacy,
        },
      });
      navigate(`/r/${res.appointment.reference}?t=${encodeURIComponent(res.manage_token)}&new=1`);
    } catch (err) {
      const e = err as ApiError;
      setSubmitError(apiError(e.code, e.message));
      if (e.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.fields)) mapped[k] = v;
        setFieldErrors(mapped);
      }
      if (e.code === 'SLOT_TAKEN' || e.code === 'SLOT_UNAVAILABLE') {
        setSelectedSlot(null);
        setStep(1);
        loadDays(windowStart);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-40 w-full rounded-2xl" />
        <SkeletonRows rows={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <ErrorState message={loadError} onRetry={loadProfile} />
        <Link to="/" className="btn-secondary">{t('backToSearch')}</Link>
      </div>
    );
  }

  if (!practice) return null;

  // Dentiste de l'annuaire, pas encore inscrit : infos + appel / itinéraire, sans réservation.
  if (practice.online_booking === false) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link to="/recherche?near=1" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
          <IconChevronLeft size={14} className="flip-x" /> {t('backToSearch')}
        </Link>
        <Card className="p-5">
          <h1 className="text-xl font-bold text-ink-900">{pname}</h1>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-ink-700">{t('notOnMawid')}</span>
          <p className="mt-3 flex items-start gap-2 text-sm text-ink-700">
            <IconPin size={16} className="mt-0.5 shrink-0 text-brand-600" />
            <span>
              {[bil(practice.address_fr, practice.address_ar), bil(practice.city_fr, practice.city_ar)].filter(Boolean).join(', ')}
              {practice.wilaya ? ` — ${lang === 'ar' ? practice.wilaya.ar : practice.wilaya.fr}` : null}
            </span>
          </p>
          <p className="mt-3 text-sm text-ink-500">{t('notOnMawidHint')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {practice.phone ? (
              <a className="btn-primary" href={`tel:${practice.phone}`}><IconPhone size={16} /> {t('call')}</a>
            ) : null}
            {practice.latitude != null && practice.longitude != null ? (
              <a className="btn-secondary" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${practice.latitude},${practice.longitude}`}>
                <IconPin size={16} /> {t('directions')}
              </a>
            ) : null}
          </div>
          <p className="mt-4 text-[11px] text-ink-500">{t('osmCredit')}</p>
        </Card>
      </div>
    );
  }

  const steps = [t('stepReason'), t('stepDate'), t('stepDetails'), t('stepConfirm')];

  return (
    <div className="space-y-4">
      <Link to="/recherche" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
        <IconChevronLeft size={14} className="flip-x" /> {t('backToSearch')}
      </Link>

      {/* En-tête cabinet */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand-800 to-brand-600 px-4 py-5 text-white sm:px-6">
          <h1 className="text-xl font-bold leading-tight">{pname}</h1>
          <p className="mt-0.5 text-sm text-white/85">{bil(practice.specialty_fr, practice.specialty_ar)}</p>
          {profile?.next_availability ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              <IconClock size={14} />
              {t('nextAvailability')} : {formatDate(profile.next_availability.date, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
              {profile.next_availability.time}
            </p>
          ) : (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs">
              <IconAlert size={14} /> {t('noAvailabilitySoon')}
            </p>
          )}
        </div>
        <div className="space-y-2 px-4 py-4 text-sm sm:px-6">
          <p className="flex items-start gap-2 text-ink-700">
            <IconPin size={16} className="mt-0.5 shrink-0 text-brand-600" />
            <span>
              {bil(practice.address_fr, practice.address_ar)}
              {practice.city_fr || practice.city_ar ? <>, {bil(practice.city_fr, practice.city_ar)}</> : null}
              {practice.wilaya ? ` — ${lang === 'ar' ? practice.wilaya.ar : practice.wilaya.fr}` : null}
            </span>
          </p>
          {practice.phone ? (
            <p className="flex items-center gap-2 text-ink-700">
              <IconPhone size={16} className="shrink-0 text-brand-600" />
              <a href={`tel:${practice.phone}`} className="link" dir="ltr">{practice.phone}</a>
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>{t('languages')} : </span>
            {practice.languages.map((l) => (
              <span key={l} className="chip bg-slate-100 text-ink-700">{l === 'ar' ? 'العربية' : 'Français'}</span>
            ))}
            <span className="chip bg-slate-100 text-ink-700">{practice.slot_duration_min} {t('minutes')}</span>
          </p>
        </div>

        {/* Horaires */}
        <details className="border-t border-slate-100 px-4 py-3 sm:px-6">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">{t('openingHours')}</summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-700">
            {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
              const h = (practice.hours || []).find((x: any) => x.weekday === wd);
              const open = h && h.is_open;
              return (
                <li key={wd} className="flex items-center justify-between gap-3 border-b border-dashed border-slate-100 py-1">
                  <span>{lang === 'ar' ? WEEKDAYS[wd].ar : WEEKDAYS[wd].fr}</span>
                  <span className="tnum" dir="ltr">
                    {open
                      ? `${minutesToTime(h.open_minute)} – ${minutesToTime(h.close_minute)}${
                          h.break_start != null && h.break_end != null ? ` (${minutesToTime(h.break_start)}–${minutesToTime(h.break_end)})` : ''
                        }`
                      : t('closedLabel')}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      </Card>

      {/* Réservation */}
      <Card className="p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="mb-2 text-base font-semibold text-ink-900">{t('bookingTitle')}</h2>
          <Stepper steps={steps} current={step} />
        </div>

        {step === 0 ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-ink-900">{t('chooseReason')}</p>
              <p className="text-xs text-ink-500">{t('reasonHint')}</p>
            </div>
            <div role="radiogroup" aria-label={t('chooseReason')} className="grid gap-2 sm:grid-cols-2">
              {REASONS.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.code}
                  onClick={() => setReason(r.code)}
                  className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start text-sm transition-colors ${
                    reason === r.code ? 'border-brand-500 bg-brand-50 font-semibold text-brand-900' : 'border-slate-300 bg-white text-ink-700 hover:bg-slate-50'
                  }`}
                >
                  {lang === 'ar' ? r.ar : r.fr}
                  {reason === r.code ? <IconCheck size={16} className="text-brand-600" /> : null}
                </button>
              ))}
            </div>

            <Field
              label={`${t('freeTextLabel')} (${t('optional')})`}
              htmlFor="free-text"
              hint={t('freeTextWarning')}
              error={fieldErrors.free_text}
            >
              <TextArea
                id="free-text"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder={t('freeTextPlaceholder')}
                maxLength={300}
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
              />
            </Field>

            {practice.auto_confirm ? (
              <Alert tone="info">{t('autoConfirmYes')}</Alert>
            ) : (
              <Alert tone="warning">{t('autoConfirmNo')}</Alert>
            )}

            <div className="flex justify-end">
              <button type="button" className="btn-primary" disabled={!reason} onClick={() => setStep(1)}>
                {t('next')} <IconChevronRight size={16} className="flip-x" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink-900">{t('chooseDate')}</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-secondary btn-sm px-2"
                    aria-label={t('previous')}
                    disabled={diffDays(windowStart, todayStr()) <= 0}
                    onClick={() => setWindowStart((d) => addDays(d, -7))}
                  >
                    <IconChevronLeft size={15} className="flip-x" />
                  </button>
                  <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('following')} onClick={() => setWindowStart((d) => addDays(d, 7))}>
                    <IconChevronRight size={15} className="flip-x" />
                  </button>
                </div>
              </div>

              {daysError ? <ErrorState message={daysError} onRetry={() => loadDays(windowStart)} /> : null}
              {daysLoading ? <SkeletonRows rows={1} /> : null}

              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7" role="listbox" aria-label={t('chooseDate')}>
                {days.map((d) => {
                  const active = selectedDate === d.date;
                  const hasSlots = d.slots.length > 0;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={`${formatDate(d.date)} ${hasSlots ? `— ${d.slots.length} ${t('slotsLeft')}` : `— ${t('noSlotsTitle')}`}`}
                      disabled={!hasSlots}
                      onClick={() => {
                        setSelectedDate(d.date);
                        setSelectedSlot(null);
                      }}
                      className={`flex min-h-[62px] flex-col items-center justify-center rounded-xl border px-1 py-2 text-xs transition-colors ${
                        active
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : hasSlots
                          ? 'border-slate-300 bg-white text-ink-700 hover:border-brand-400'
                          : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <span className="text-[10px] uppercase opacity-80">{weekdayShort(new Date(`${d.date}T12:00:00`).getDay())}</span>
                      <span className="tnum text-base font-semibold leading-tight">{d.date.slice(8, 10)}</span>
                      <span className="text-[10px] opacity-80">{hasSlots ? `${d.slots.length}` : '—'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedDate ? (
              <div>
                <p className="mb-2 text-sm font-medium text-ink-900">
                  {t('chooseTime')} — {formatDate(selectedDate)}
                </p>
                {slotsForDay.length === 0 ? (
                  <EmptyState icon={<IconClock size={24} />} title={t('noSlotsTitle')} description={t('noSlotsText')} />
                ) : (
                  <div className="space-y-3">
                    {[
                      { label: t('morning'), slots: morning },
                      { label: t('afternoon'), slots: afternoon },
                    ]
                      .filter((g) => g.slots.length > 0)
                      .map((g) => (
                        <div key={g.label}>
                          <p className="mb-1 text-xs font-medium text-ink-500">{g.label}</p>
                          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                            {g.slots.map((s) => (
                              <button
                                key={s.start}
                                type="button"
                                aria-pressed={selectedSlot?.start === s.start}
                                onClick={() => setSelectedSlot(s)}
                                className={`tnum min-h-[44px] rounded-xl border text-sm font-medium transition-colors ${
                                  selectedSlot?.start === s.start
                                    ? 'border-brand-600 bg-brand-600 text-white'
                                    : 'border-slate-300 bg-white text-ink-700 hover:border-brand-400'
                                }`}
                                dir="ltr"
                              >
                                {s.time}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <Alert tone="info">{t('selectSlotFirst')}</Alert>
            )}

            <div className="flex items-center justify-between gap-2">
              <button type="button" className="btn-secondary" onClick={() => setStep(0)}>
                {t('back')}
              </button>
              <button type="button" className="btn-primary" disabled={!selectedSlot} onClick={() => setStep(2)}>
                {t('next')} <IconChevronRight size={16} className="flip-x" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <Form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!privacy) {
                setFieldErrors({ privacy_consent: t('consentRequired') });
                return;
              }
              setFieldErrors({});
              setStep(3);
            }}
          >
            <div>
              <p className="text-sm font-medium text-ink-900">{t('yourDetails')}</p>
              <p className="text-xs text-ink-500">{t('detailsHint')}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('firstName')} htmlFor="p-first" required error={fieldErrors.first_name}>
                <TextInput id="p-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required maxLength={60} invalid={!!fieldErrors.first_name} />
              </Field>
              <Field label={t('lastName')} htmlFor="p-last" required error={fieldErrors.last_name}>
                <TextInput id="p-last" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required maxLength={60} invalid={!!fieldErrors.last_name} />
              </Field>
            </div>
            <Field label={t('phone')} htmlFor="p-phone" required hint="+213 5xx xx xx xx" error={fieldErrors.phone}>
              <TextInput
                id="p-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                dir="ltr"
                placeholder="0551 23 45 67"
                autoComplete="tel"
                required
                invalid={!!fieldErrors.phone}
              />
            </Field>
            <Field label={`${t('emailOptional')} (${t('optional')})`} htmlFor="p-email" hint={t('emailHint')} error={fieldErrors.email}>
              <TextInput id="p-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" dir="ltr" autoComplete="email" maxLength={120} invalid={!!fieldErrors.email} />
            </Field>

            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <Checkbox label={t('notifyConsent')} checked={notifyConsent} onChange={(e) => setNotifyConsent(e.target.checked)} />
              <Checkbox
                label={
                  <span>
                    {t('consentPrivacy')} —{' '}
                    <Link to="/confidentialite" className="link" target="_blank" rel="noreferrer">
                      {t('consentPrivacyLink')}
                    </Link>
                  </span>
                }
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                error={fieldErrors.privacy_consent}
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                {t('back')}
              </button>
              <SubmitButton
                className="btn-primary"
                onClick={(e) => {
                  if (!privacy) {
                    setFieldErrors({ privacy_consent: t('consentRequired') });
                    return;
                  }
                  setFieldErrors({});
                  setStep(3);
                  void e;
                }}
              >
                {t('next')} <IconChevronRight size={16} className="flip-x" />
              </SubmitButton>
            </div>
          </Form>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-ink-900">{t('summary')}</p>
            <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">
              <Row label={t('doctor')} value={pname} />
              <Row label={t('reason')} value={lang === 'ar' ? REASONS.find((r) => r.code === reason)?.ar : REASONS.find((r) => r.code === reason)?.fr} />
              {freeText ? <Row label={t('freeTextLabel')} value={freeText} /> : null}
              <Row label={t('date')} value={selectedDate ? formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''} />
              <Row label={t('time')} value={selectedSlot ? `${selectedSlot.time}` : ''} />
              <Row label={t('patient')} value={`${firstName} ${lastName}`} />
              <Row label={t('phone')} value={<span dir="ltr">{phone}</span>} />
              {email ? <Row label={t('email')} value={<span dir="ltr">{email}</span>} /> : null}
            </dl>

            {submitError ? <Alert tone="error">{submitError}</Alert> : null}
            <p className="text-xs text-ink-500">{practice.auto_confirm ? t('autoConfirmYes') : t('autoConfirmNo')}</p>

            <div className="flex items-center justify-between gap-2">
              <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
                {t('back')}
              </button>
              <button type="button" className="btn-primary" disabled={submitting || !canSubmit} onClick={submit}>
                {submitting ? t('bookingInProgress') : t('confirmBooking')}
              </button>
            </div>
            {!canSubmit && !submitting ? <p className="text-xs text-ink-500">{t('requiredField')}</p> : null}
          </div>
        ) : null}
      </Card>

      <Card className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <IconQr size={18} />
        </span>
        <div className="text-xs text-ink-500">
          <p className="font-medium text-ink-700">{t('shareProfile')}</p>
          <p className="mt-1">{`${window.location.origin}/d/${practice.slug}`}</p>
          <p className="mt-1">
            <Link className="link" to="/confidentialite">{t('navPrivacy')}</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <dt className="shrink-0 text-xs font-medium text-ink-500">{label}</dt>
      <dd className="text-end text-sm text-ink-900">{value || '—'}</dd>
    </div>
  );
}
