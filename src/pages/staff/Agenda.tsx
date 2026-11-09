import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiError, type Appointment, type CalendarBlock, type DayAvailability, type WorkingHour } from '../../lib/api';
import { addDays, isoToTime, localToIso, minutesToTime, monthGrid, todayStr, weekDates, dateToWeekday } from '../../lib/dates';
import { Alert, Card, EmptyState, ErrorState, Field, Modal, Select, SkeletonRows, StatusBadge, TextInput } from '../../components/ui';
import { TimeInput } from '../../components/inputs';
import { AppointmentCard, AppointmentModal } from '../../components/AppointmentBits';
import { IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconClock, IconPlus } from '../../components/icons';
import { EXCEPTION_KINDS, REASONS, STATUSES } from '../../../shared/constants';
import { Form, SubmitButton } from '../../components/form';

type View = 'day' | 'week' | 'month';

export function Agenda() {
  const { t, lang, formatDate, weekdayShort, monthLabel, apiError } = useI18n();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>((params.get('view') as View) || 'day');
  const [date, setDate] = useState(params.get('date') || todayStr());
  const [statusFilter, setStatusFilter] = useState('');
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [createAt, setCreateAt] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    api<{ hours: WorkingHour[] }>('/api/staff/hours').then((d) => setHours(d.hours)).catch(() => {});
  }, []);

  const range = useMemo(() => {
    if (view === 'day') return { from: date, to: date };
    if (view === 'week') {
      const w = weekDates(date);
      return { from: w[0], to: w[6] };
    }
    const [y, m] = date.split('-').map(Number);
    const grid = monthGrid(y, m - 1);
    return { from: grid[0], to: grid[grid.length - 1] };
  }, [view, date]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      if (statusFilter) qs.set('status', statusFilter);
      const daysCount = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
      const [appts, exc, avail] = await Promise.all([
        api<{ appointments: Appointment[] }>(`/api/staff/appointments?${qs.toString()}`),
        api<{ exceptions: CalendarBlock[] }>(`/api/staff/exceptions?from=${range.from}&days=${daysCount}`),
        api<{ days: DayAvailability[] }>(`/api/staff/availability?from=${range.from}&days=${daysCount}`),
      ]);
      setAppointments(appts.appointments);
      setBlocks(exc.exceptions);
      setDays(avail.days);
    } catch (err) {
      setError(apiError((err as ApiError).code));
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, statusFilter, apiError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', date);
      next.set('view', view);
      return next;
    }, { replace: true });
  }, [date, view, setParams]);

  const shift = (dir: number) => {
    if (view === 'day') setDate((d) => addDays(d, dir));
    else if (view === 'week') setDate((d) => addDays(d, dir * 7));
    else {
      const [y, m] = date.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1 + dir, 1));
      setDate(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`);
    }
  };

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const list = map.get(a.date) || [];
      list.push(a);
      map.set(a.date, list);
    }
    for (const list of map.values()) list.sort((x, y) => x.start.localeCompare(y.start));
    return map;
  }, [appointments]);

  const blocksByDate = useMemo(() => {
    const map = new Map<string, CalendarBlock[]>();
    for (const b of blocks) {
      const list = map.get(b.date_start) || [];
      list.push(b);
      map.set(b.date_start, list);
    }
    return map;
  }, [blocks]);

  const title =
    view === 'month'
      ? monthLabel(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1)
      : view === 'week'
      ? `${formatDate(range.from, { day: 'numeric', month: 'short' })} – ${formatDate(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{t('agendaTitle')}</h1>
          <p className="text-xs text-ink-500">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn-secondary btn-sm px-2" onClick={() => shift(-1)} aria-label={t('previous')}>
            <IconChevronLeft size={16} className="flip-x" />
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setDate(todayStr())}>
            {t('goToday')}
          </button>
          <button type="button" className="btn-secondary btn-sm px-2" onClick={() => shift(1)} aria-label={t('following')}>
            <IconChevronRight size={16} className="flip-x" />
          </button>
          <div className="inline-flex overflow-hidden rounded-xl ring-1 ring-slate-300" role="group" aria-label={t('agendaTitle')}>
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`min-h-[36px] px-3 text-xs font-medium ${view === v ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 hover:bg-slate-50'}`}
              >
                {v === 'day' ? t('dayView') : v === 'week' ? t('weekView') : t('monthView')}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreateAt({ date, time: '09:00' })}>
            <IconPlus size={15} /> {t('addAppointment')}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-ink-500" htmlFor="status-filter">
          {t('filterStatus')}
        </label>
        <Select id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[220px]">
          <option value="">{t('all')}</option>
          {STATUSES.map((s) => (
            <option key={s.code} value={s.code}>
              {lang === 'ar' ? s.ar : s.fr}
            </option>
          ))}
        </Select>
        <span className="text-xs text-ink-500">
          {appointments.length} {t('appointmentsCount')}
        </span>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading ? <SkeletonRows rows={6} /> : null}

      {!loading && !error ? (
        <>
          {view === 'day' ? (
            <DayView
              date={date}
              hours={hours}
              appointments={byDate.get(date) || []}
              blocks={blocksByDate.get(date) || []}
              availability={days.find((d) => d.date === date)}
              onSelect={setSelected}
              onCreate={(time) => setCreateAt({ date, time })}
            />
          ) : null}

          {view === 'week' ? (
            <WeekView
              dates={weekDates(date)}
              byDate={byDate}
              blocksByDate={blocksByDate}
              onSelect={setSelected}
              onPickDay={(d) => {
                setDate(d);
                setView('day');
              }}
            />
          ) : null}

          {view === 'month' ? (
            <MonthView
              date={date}
              byDate={byDate}
              onPickDay={(d) => {
                setDate(d);
                setView('day');
              }}
            />
          ) : null}

          <Legend />
        </>
      ) : null}

      <AppointmentModal appointment={selected} onClose={() => setSelected(null)} onChanged={load} />
      <NewAppointmentModal
        open={!!createAt}
        initial={createAt}
        onClose={() => setCreateAt(null)}
        onCreated={() => {
          setCreateAt(null);
          load();
        }}
      />
    </div>
  );
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function DayView({
  date,
  hours,
  appointments,
  blocks,
  availability,
  onSelect,
  onCreate,
}: {
  date: string;
  hours: WorkingHour[];
  appointments: Appointment[];
  blocks: CalendarBlock[];
  availability?: DayAvailability;
  onSelect: (a: Appointment) => void;
  onCreate: (time: string) => void;
}) {
  const { t, lang } = useI18n();
  const weekday = dateToWeekday(date);
  const day = hours.find((h) => h.weekday === weekday);

  if (!day || !Number(day.is_open)) {
    // Jour de repos : on affiche malgré tout les rendez-vous existants
    // (créés avant un changement d'horaires) pour ne jamais les masquer.
    return (
      <div className="space-y-2">
        <EmptyState icon={<IconCalendar size={24} />} title={t('closedDay')} description={t('closedDayHint')} />
        {appointments.length ? (
          <Card className="p-3">
            <p className="mb-2 text-xs font-medium text-amber-900">
              {t('todayAppointments')} · {appointments.length}
            </p>
            <ul className="space-y-1.5">
              {appointments.map((a) => (
                <li key={a.id}>
                  <AppointmentCard appointment={a} onOpen={onSelect} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    );
  }

  const step = 30;
  const slots: { time: string; appt?: Appointment; block?: CalendarBlock; free: boolean }[] = [];
  for (let m = day.open_minute; m + step <= day.close_minute; m += step) {
    const inBreak = day.break_start != null && day.break_end != null && m >= day.break_start && m < day.break_end;
    if (inBreak) continue;
    const time = minutesToTime(m);
    const appt = appointments.find((a) => toMinutes(a.start) <= m && toMinutes(a.end) > m);
    const block = blocks.find((b) => toMinutes(b.time_start) <= m && toMinutes(b.time_end) > m && b.date_start === date);
    const free = !appt && !block && !!availability?.slots.some((s) => s.time === time);
    slots.push({ time, appt, block, free });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
        <p className="text-xs font-medium text-ink-700">
          {t('openingHours')} : <span className="tnum" dir="ltr">{minutesToTime(day.open_minute)} – {minutesToTime(day.close_minute)}</span>
        </p>
        <p className="text-[11px] text-ink-500">{t('clickSlotToBook')}</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {slots.map(({ time, appt, block, free }) => (
          <li key={time} className="flex items-stretch gap-2 px-3 py-1.5">
            <span className="tnum w-12 shrink-0 pt-2 text-xs text-ink-500" dir="ltr">{time}</span>
            {appt ? (
              <button type="button" onClick={() => onSelect(appt)} className="flex flex-1 items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-start ring-1 ring-brand-200 hover:bg-brand-100">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">
                    {appt.patient_first_name} {appt.patient_last_name}
                  </span>
                  <span className="tnum block text-[11px] text-ink-500" dir="ltr">
                    {appt.start} – {appt.end} · {appt.patient_phone}
                  </span>
                </span>
                <StatusBadge status={appt.status} />
              </button>
            ) : block ? (
              <div className="flex flex-1 items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                <IconClock size={14} />
                <span className="font-medium">{EXCEPTION_KINDS.find((k) => k.code === block.kind)?.[lang === 'ar' ? 'ar' : 'fr']}</span>
                <span className="tnum" dir="ltr">{block.time_start} – {block.time_end}</span>
                {block.note ? <span className="truncate opacity-70">· {block.note}</span> : null}
              </div>
            ) : free ? (
              <button
                type="button"
                onClick={() => onCreate(time)}
                className="flex-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-start text-xs text-ink-500 hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700"
              >
                <IconPlus size={13} className="me-1 inline" /> {t('freeSlotLabel')}
              </button>
            ) : (
              <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                {t('unavailable')}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WeekView({
  dates,
  byDate,
  blocksByDate,
  onSelect,
  onPickDay,
}: {
  dates: string[];
  byDate: Map<string, Appointment[]>;
  blocksByDate: Map<string, CalendarBlock[]>;
  onSelect: (a: Appointment) => void;
  onPickDay: (d: string) => void;
}) {
  const { t, formatDate, weekdayShort } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {dates.map((d) => {
        const list = byDate.get(d) || [];
        const isToday = d === todayStr();
        return (
          <Card key={d} className={`p-2 ${isToday ? 'ring-2 ring-brand-400' : ''}`}>
            <button type="button" onClick={() => onPickDay(d)} className="mb-1.5 flex w-full items-baseline justify-between gap-1 rounded-md px-1 text-start hover:bg-slate-50">
              <span className="text-[11px] font-medium uppercase text-ink-500">{weekdayShort(dateToWeekday(d))}</span>
              <span className={`tnum text-sm font-semibold ${isToday ? 'text-brand-700' : 'text-ink-900'}`}>{d.slice(8, 10)}</span>
            </button>
            <ul className="space-y-1">
              {list.length === 0 ? <li className="px-1 py-2 text-[11px] text-ink-500">{t('noEvents')}</li> : null}
              {list.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(a)}
                    className="w-full rounded-lg bg-brand-50 px-1.5 py-1 text-start text-[11px] ring-1 ring-brand-200 hover:bg-brand-100"
                  >
                    <span className="tnum block font-semibold text-ink-900" dir="ltr">{a.start}</span>
                    <span className="block truncate text-ink-700">{a.patient_first_name} {a.patient_last_name.slice(0, 1)}.</span>
                    <span className="mt-0.5 block">
                      <StatusBadge status={a.status} className="!px-1.5 !py-0 !text-[9px]" />
                    </span>
                  </button>
                </li>
              ))}
              {(blocksByDate.get(d) || []).map((b) => (
                <li key={b.id} className="rounded-lg bg-amber-50 px-1.5 py-1 text-[10px] text-amber-900 ring-1 ring-amber-200">
                  <IconClock size={11} className="me-1 inline" />
                  <span className="tnum" dir="ltr">{b.time_start}–{b.time_end}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function MonthView({ date, byDate, onPickDay }: { date: string; byDate: Map<string, Appointment[]>; onPickDay: (d: string) => void }) {
  const { t, weekdayShort, lang } = useI18n();
  const [y, m] = date.split('-').map(Number);
  const grid = monthGrid(y, m - 1);
  const month = m - 1;
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
        {[0, 1, 2, 3, 4, 5, 6].map((wd) => (
          <div key={wd} className="px-1 py-2 text-center text-[11px] font-medium text-ink-500">
            {weekdayShort(wd)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((d) => {
          const list = byDate.get(d) || [];
          const otherMonth = Number(d.slice(5, 7)) - 1 !== month;
          const isToday = d === todayStr();
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPickDay(d)}
              className={`min-h-[64px] border-b border-e border-slate-100 p-1 text-start align-top hover:bg-brand-50/50 ${
                otherMonth ? 'bg-slate-50/60 text-slate-400' : 'bg-white'
              }`}
              aria-label={`${d} — ${list.length} ${t('appointmentsCount')}`}
            >
              <span className={`tnum inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${isToday ? 'bg-brand-600 text-white' : ''}`}>
                {d.slice(8, 10)}
              </span>
              <span className="mt-0.5 block space-y-0.5">
                {list.slice(0, 2).map((a) => (
                  <span key={a.id} className="block truncate rounded bg-brand-100 px-1 text-[9px] text-brand-900">
                    <span className="tnum" dir="ltr">{a.start}</span> {a.patient_first_name}
                  </span>
                ))}
                {list.length > 2 ? <span className="block text-[9px] text-ink-500">+{list.length - 2} {t('monthMore')}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Legend() {
  const { t, lang } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
      <span className="font-medium">{t('legend')} :</span>
      {STATUSES.map((s) => (
        <span key={s.code} className="inline-flex items-center gap-1">
          <StatusBadge status={s.code} className="!text-[10px]" />
        </span>
      ))}
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
        <IconClock size={11} /> {t('blockLabel')}
      </span>
    </div>
  );
}

/** Création d'un rendez-vous par l'équipe (comptoir / téléphone). */
export function NewAppointmentModal({
  open,
  initial,
  onClose,
  onCreated,
}: {
  open: boolean;
  initial: { date: string; time: string } | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t, apiError } = useI18n();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('checkup');
  const [date, setDate] = useState(initial?.date || todayStr());
  const [time, setTime] = useState(initial?.time || '09:00');
  const [duration, setDuration] = useState(30);
  const [freeText, setFreeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);

  useEffect(() => {
    if (initial) {
      setDate(initial.date);
      setTime(initial.time);
    }
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    api<{ days: DayAvailability[] }>(`/api/staff/availability?from=${date}&days=1`)
      .then((d) => setSlots(d.days[0]?.slots.map((s) => s.time) || []))
      .catch(() => setSlots([]));
  }, [open, date]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/staff/appointments', {
        method: 'POST',
        body: {
          first_name: first,
          last_name: last,
          phone,
          reason_code: reason,
          free_text: freeText || undefined,
          starts_at: localToIso(date, time),
          duration_min: duration,
          status: 'confirmed',
          patient_language: 'fr',
          notify_consent: false,
        },
      });
      setFirst(''); setLast(''); setPhone(''); setFreeText('');
      onCreated();
    } catch (err) {
      setError(apiError((err as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('addAppointment')} wide>
      <Form onSubmit={submit} className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('firstName')} htmlFor="na-first" required>
            <TextInput id="na-first" value={first} onChange={(e) => setFirst(e.target.value)} required maxLength={60} />
          </Field>
          <Field label={t('lastName')} htmlFor="na-last" required>
            <TextInput id="na-last" value={last} onChange={(e) => setLast(e.target.value)} required maxLength={60} />
          </Field>
        </div>
        <Field label={t('phone')} htmlFor="na-phone" required hint="0551 23 45 67">
          <TextInput id="na-phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" required inputMode="tel" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('date')} htmlFor="na-date" required>
            <TextInput id="na-date" type="date" lang="fr-DZ" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label={t('time')} htmlFor="na-time" required hint={slots.length ? `${t('freeSlotLabel')} : ${slots.slice(0, 4).join(', ')}${slots.length > 4 ? '…' : ''}` : undefined}>
            <TimeInput id="na-time" value={time} onChange={setTime} />
          </Field>
          <Field label={`${t('duration')} (${t('minutes')})`} htmlFor="na-duration">
            <Select id="na-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('reason')} htmlFor="na-reason">
          <Select id="na-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r.code} value={r.code}>{r.fr}</option>
            ))}
          </Select>
        </Field>
        <Field label={`${t('notes')} (${t('optional')})`} htmlFor="na-note" hint={t('freeTextWarning')}>
          <TextInput id="na-note" value={freeText} onChange={(e) => setFreeText(e.target.value)} maxLength={300} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <SubmitButton className="btn-primary" disabled={busy} onClick={submit}>
            <IconCheck size={16} /> {busy ? t('saving') : t('save')}
          </SubmitButton>
        </div>
        <p className="text-[11px] text-ink-500">{t('clickSlotToBook')}</p>
      </Form>
    </Modal>
  );
}
