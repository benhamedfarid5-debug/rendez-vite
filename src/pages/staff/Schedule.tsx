import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { api, ApiError, type Appointment, type CalendarBlock, type WorkingHour } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { addDays, isoToLocalInput, localToIso, minutesToTime, todayStr, timeToMinutes } from '../../lib/dates';
import { Alert, Card, EmptyState, ErrorState, Field, SectionTitle, Select, SkeletonRows, Switch, TextInput, TextArea } from '../../components/ui';
import { TimeInput } from '../../components/inputs';
import { AppointmentModal } from '../../components/AppointmentBits';
import { IconAlert, IconCheck, IconClock, IconPlus, IconTrash } from '../../components/icons';
import { EXCEPTION_KINDS, WEEKDAYS } from '../../../shared/constants';

export function Schedule() {
  const { t, lang, apiError, formatDate, weekdayLong } = useI18n();
  const { permissions } = useAuth();
  const owner = !!permissions?.manageSchedule;

  const [hours, setHours] = useState<WorkingHour[] | null>(null);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Formulaire d'absence / blocage
  const [kind, setKind] = useState<'absence' | 'closure' | 'emergency' | 'lateness'>('absence');
  const [startAt, setStartAt] = useState(`${todayStr()}T09:00`);
  const [endAt, setEndAt] = useState(`${todayStr()}T17:00`);
  const [note, setNote] = useState('');
  const [affected, setAffected] = useState<Appointment[] | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [quickMinutes, setQuickMinutes] = useState(30);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<{ hours: WorkingHour[] }>('/api/staff/hours'),
      api<{ exceptions: CalendarBlock[] }>(`/api/staff/exceptions?from=${todayStr()}&days=60`),
    ])
      .then(([h, b]) => {
        setHours(h.hours.map((x) => ({ ...x, is_open: Number(x.is_open) })));
        setBlocks(b.exceptions);
      })
      .catch((err: ApiError) => setError(apiError(err.code)))
      .finally(() => setLoading(false));
  }, [apiError]);

  useEffect(load, [load]);

  const updateHour = (weekday: number, patch: Partial<WorkingHour>) => {
    setHours((prev) => prev?.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)) || null);
  };

  const saveHours = async () => {
    if (!hours) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/staff/hours', {
        method: 'PUT',
        body: {
          hours: hours.map((h) => ({
            weekday: h.weekday,
            is_open: !!Number(h.is_open),
            open_minute: timeToMinutes(minutesToTime(h.open_minute)),
            close_minute: timeToMinutes(minutesToTime(h.close_minute)),
            break_start: h.break_start != null ? timeToMinutes(minutesToTime(h.break_start)) : null,
            break_end: h.break_end != null ? timeToMinutes(minutesToTime(h.break_end)) : null,
          })),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const e = err as ApiError;
      setError(apiError(e.code, e.message));
    } finally {
      setBusy(false);
    }
  };

  const previewImpact = async () => {
    try {
      const res = await api<{ affected: Appointment[] }>(
        `/api/staff/exceptions/impact?starts_at=${encodeURIComponent(localToIso(startAt.slice(0, 10), startAt.slice(11, 16)))}&ends_at=${encodeURIComponent(localToIso(endAt.slice(0, 10), endAt.slice(11, 16)))}`,
      );
      setAffected(res.affected);
    } catch {
      setAffected(null);
    }
  };

  const createBlock = async (payloadOverride?: { kind: string; starts_at: string; ends_at: string; note?: string }) => {
    setBusy(true);
    setFormError(null);
    try {
      const payload = payloadOverride || {
        kind,
        starts_at: localToIso(startAt.slice(0, 10), startAt.slice(11, 16)),
        ends_at: localToIso(endAt.slice(0, 10), endAt.slice(11, 16)),
        note: note || undefined,
      };
      const res = await api<{ exception: CalendarBlock; affected: Appointment[] }>('/api/staff/exceptions', { method: 'POST', body: payload });
      setAffected(res.affected);
      setCreatedIds(res.affected.map((a) => a.id));
      setNote('');
      load();
    } catch (err) {
      setFormError(apiError((err as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  const quickBlock = async () => {
    const startIso = new Date().toISOString();
    const endIso = new Date(Date.now() + quickMinutes * 60_000).toISOString();
    await createBlock({
      kind: 'emergency',
      starts_at: startIso.replace(/\.\d{3}Z$/, 'Z'),
      ends_at: endIso.replace(/\.\d{3}Z$/, 'Z'),
      note: t('quickBlock'),
    });
  };

  const removeBlock = async (id: string) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await api(`/api/staff/exceptions/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(apiError((err as ApiError).code));
    }
  };

  if (loading) return <SkeletonRows rows={7} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">{t('scheduleTitle')}</h1>
        <p className="text-xs text-ink-500">{t('exceptionsHint')}</p>
      </header>

      {!owner ? <Alert tone="info">{t('onlyOwner')}</Alert> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {saved ? <Alert tone="success">{t('hoursSaved')}</Alert> : null}

      {/* Horaires */}
      <Card className="p-4">
        <SectionTitle hint={`${t('time')} : Africa/Algiers`}>{t('weeklyHours')}</SectionTitle>
        <div className="space-y-2">
          {(hours || []).map((h) => (
            <div key={h.weekday} className="rounded-xl border border-slate-200 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-900">{weekdayLong(h.weekday)}</p>
                <Switch
                  checked={!!Number(h.is_open)}
                  onChange={(v) => updateHour(h.weekday, { is_open: v ? 1 : 0 })}
                  disabled={!owner}
                  label={Number(h.is_open) ? t('openLabel') : t('closedLabel')}
                />
              </div>
              {Number(h.is_open) ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label={t('openAt')} htmlFor={`open-${h.weekday}`}>
                    <TimeInput
                      id={`open-${h.weekday}`}
                      value={minutesToTime(h.open_minute)}
                      onChange={(v) => updateHour(h.weekday, { open_minute: timeToMinutes(v) })}
                      disabled={!owner}
                      ariaLabel={`${weekdayLong(h.weekday)} — ${t('openAt')}`}
                    />
                  </Field>
                  <Field label={t('closeAt')} htmlFor={`close-${h.weekday}`}>
                    <TimeInput
                      id={`close-${h.weekday}`}
                      value={minutesToTime(h.close_minute)}
                      onChange={(v) => updateHour(h.weekday, { close_minute: timeToMinutes(v) })}
                      disabled={!owner}
                      ariaLabel={`${weekdayLong(h.weekday)} — ${t('closeAt')}`}
                    />
                  </Field>
                  <Field label={t('breakStart')} htmlFor={`bs-${h.weekday}`}>
                    <TimeInput
                      id={`bs-${h.weekday}`}
                      value={h.break_start != null ? minutesToTime(h.break_start) : ''}
                      onChange={(v) => updateHour(h.weekday, { break_start: v ? timeToMinutes(v) : null })}
                      disabled={!owner}
                      ariaLabel={`${weekdayLong(h.weekday)} — ${t('breakStart')}`}
                    />
                  </Field>
                  <Field label={t('breakEnd')} htmlFor={`be-${h.weekday}`}>
                    <TimeInput
                      id={`be-${h.weekday}`}
                      value={h.break_end != null ? minutesToTime(h.break_end) : ''}
                      onChange={(v) => updateHour(h.weekday, { break_end: v ? timeToMinutes(v) : null })}
                      disabled={!owner}
                      ariaLabel={`${weekdayLong(h.weekday)} — ${t('breakEnd')}`}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {owner ? (
          <div className="mt-3 flex justify-end">
            <button type="button" className="btn-primary btn-sm" onClick={saveHours} disabled={busy}>
              <IconCheck size={15} /> {busy ? t('saving') : t('save')}
            </button>
          </div>
        ) : null}
      </Card>

      {/* Blocage rapide */}
      {owner ? (
        <Card className="p-4">
          <SectionTitle hint={t('quickBlockHint')}>{t('quickBlock')}</SectionTitle>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('durationMinutes')} htmlFor="quick-duration">
              <Select id="quick-duration" value={quickMinutes} onChange={(e) => setQuickMinutes(Number(e.target.value))} className="w-32">
                {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
            <button type="button" className="btn-secondary" onClick={quickBlock} disabled={busy}>
              <IconClock size={16} /> {t('blockNow')}
            </button>
          </div>
        </Card>
      ) : null}

      {/* Absence / blocage programmé */}
      {owner ? (
        <Card className="p-4">
          <SectionTitle hint={t('exceptionsHint')}>{t('addException')}</SectionTitle>
          {formError ? <div className="mb-2"><Alert tone="error">{formError}</Alert></div> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('exceptionKind')} htmlFor="ex-kind">
              <Select
                id="ex-kind"
                value={kind}
                onChange={(e) => {
                  const v = e.target.value as any;
                  setKind(v);
                  if (v === 'emergency' || v === 'lateness') {
                    setStartAt(`${todayStr()}T09:00`);
                    setEndAt(`${todayStr()}T10:00`);
                  }
                }}
              >
                {EXCEPTION_KINDS.map((k) => (
                  <option key={k.code} value={k.code}>{lang === 'ar' ? k.ar : k.fr}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('exceptionNote')} htmlFor="ex-note" hint={t('exceptionNotePh')}>
              <TextInput id="ex-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t('exceptionNotePh')} />
            </Field>
            <Field label={`${t('start')} — ${t('date')}`} htmlFor="ex-start-date">
              <div className="flex gap-2">
                <TextInput
                  id="ex-start-date"
                  type="date"
                  lang="fr-DZ"
                  value={startAt.slice(0, 10)}
                  onChange={(e) => { setStartAt(`${e.target.value}T${startAt.slice(11, 16)}`); setAffected(null); }}
                />
                <TimeInput
                  value={startAt.slice(11, 16)}
                  onChange={(v) => { setStartAt(`${startAt.slice(0, 10)}T${v}`); setAffected(null); }}
                  ariaLabel={`${t('start')} — ${t('time')}`}
                />
              </div>
            </Field>
            <Field label={`${t('end')} — ${t('date')}`} htmlFor="ex-end-date">
              <div className="flex gap-2">
                <TextInput
                  id="ex-end-date"
                  type="date"
                  lang="fr-DZ"
                  value={endAt.slice(0, 10)}
                  onChange={(e) => { setEndAt(`${e.target.value}T${endAt.slice(11, 16)}`); setAffected(null); }}
                />
                <TimeInput
                  value={endAt.slice(11, 16)}
                  onChange={(v) => { setEndAt(`${endAt.slice(0, 10)}T${v}`); setAffected(null); }}
                  ariaLabel={`${t('end')} — ${t('time')}`}
                />
              </div>
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={previewImpact}>{t('affectedAppointments')}</button>
            <button type="button" className="btn-primary btn-sm" onClick={() => createBlock()} disabled={busy}>
              <IconPlus size={15} /> {busy ? t('saving') : t('add')}
            </button>
          </div>

          {affected ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                {affected.length === 0 ? t('noAffected') : `${t('affectedAppointments')} (${affected.length})`}
              </p>
              <ul className="mt-2 space-y-1.5">
                {affected.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-900">{a.patient_first_name} {a.patient_last_name}</span>
                      <span className="tnum block text-ink-500" dir="ltr">{a.date} · {a.start}</span>
                    </span>
                    <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setSelected(a)}>
                      {t('moveAppointment')} / {t('cancel')}
                    </button>
                  </li>
                ))}
              </ul>
              {createdIds.length ? <p className="mt-2 text-[11px] text-amber-800">{t('exceptionCreated')}</p> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Liste des blocages */}
      <Card className="p-4">
        <SectionTitle hint={t('exceptionsHint')}>{t('upcomingBlocks')}</SectionTitle>
        {blocks.length === 0 ? (
          <EmptyState icon={<IconAlert size={22} />} title={t('noExceptions')} />
        ) : (
          <ul className="space-y-2">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">
                    {EXCEPTION_KINDS.find((k) => k.code === b.kind)?.[lang === 'ar' ? 'ar' : 'fr']}
                  </p>
                  <p className="tnum text-xs text-ink-500" dir="ltr">
                    {formatDate(b.date_start, { weekday: 'short', day: 'numeric', month: 'short' })} {b.time_start} →{' '}
                    {formatDate(b.date_end, { weekday: 'short', day: 'numeric', month: 'short' })} {b.time_end}
                  </p>
                  {b.note ? <p className="text-xs text-ink-500">{b.note}</p> : null}
                  {b.created_by_name ? <p className="text-[11px] text-ink-500">— {b.created_by_name}</p> : null}
                </div>
                {owner ? (
                  <button type="button" className="btn-danger btn-sm shrink-0" onClick={() => removeBlock(b.id)} aria-label={t('deleteException')}>
                    <IconTrash size={14} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AppointmentModal appointment={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); load(); }} />
    </div>
  );
}
