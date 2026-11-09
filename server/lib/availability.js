import {
  addDaysToDateStr,
  diffDays,
  minutesToTimeStr,
  toIso,
  utcToZoned,
  zonedDateTimeToUtc,
} from './time.js';

export const ACTIVE_STATUSES = ['requested', 'confirmed', 'arrived', 'completed'];

/**
 * Calcule les créneaux réellement libres pour une date locale.
 * Le serveur est la seule autorité : cette fonction est appelée à la fois pour
 * l'affichage et pour la validation finale d'une réservation.
 *
 * @param {object} opts
 * @param {object} opts.practice       ligne practices
 * @param {Map<number,object>} opts.hours  horaires par weekday
 * @param {Array<object>} opts.exceptions  exceptions chevauchant la journée
 * @param {Array<object>} opts.appointments rendez-vous actifs de la journée
 * @param {string} opts.dateStr        "YYYY-MM-DD" local
 * @param {Date}   opts.now
 * @param {object} [opts.options]      { ignoreLeadTime, withStaffRules }
 * @returns {{ date: string, isOpen: boolean, slots: Array<{start:string,end:string,time:string}> }}
 */
export function computeDaySlots({
  practice,
  hours,
  exceptions,
  appointments,
  dateStr,
  now = new Date(),
  options = {},
}) {
  const tz = practice.timezone || 'Africa/Algiers';
  const duration = practice.slot_duration_min || 30;
  const empty = { date: dateStr, isOpen: false, slots: [], blockReason: null };

  const weekday = utcToZoned(zonedDateTimeToUtc(dateStr, 720, tz), tz).weekday;
  const day = hours.get ? hours.get(weekday) : hours[weekday];
  if (!day || !day.is_open) return { ...empty, blockReason: 'closed_weekday' };

  // Horizon et délai minimal de réservation (règles patient).
  const todayStr = utcToZoned(now, tz).dateStr;
  const daysAhead = diffDays(dateStr, todayStr);
  if (!options.ignoreTimingRules) {
    if (daysAhead < 0) return { ...empty, blockReason: 'past' };
    if (daysAhead > (practice.horizon_days ?? 60)) return { ...empty, blockReason: 'beyond_horizon' };
  }

  const leadCutoff = options.ignoreTimingRules
    ? now.getTime()
    : now.getTime() + (practice.min_lead_hours ?? 0) * 3_600_000;

  // Un jour entièrement couvert par une exception est fermé.
  const dayStart = zonedDateTimeToUtc(dateStr, 0, tz).getTime();
  const dayEnd = zonedDateTimeToUtc(addDaysToDateStr(dateStr, 1), 0, tz).getTime();
  const dayExceptions = exceptions.filter((e) => {
    const s = Date.parse(e.starts_at);
    const eEnd = Date.parse(e.ends_at);
    return s < dayEnd && eEnd > dayStart;
  });

  const busy = [
    ...dayExceptions.map((e) => ({
      start: Date.parse(e.starts_at),
      end: Date.parse(e.ends_at),
      type: e.kind,
    })),
    ...appointments
      .filter((a) => ACTIVE_STATUSES.includes(a.status))
      .map((a) => ({ start: Date.parse(a.starts_at), end: Date.parse(a.ends_at), type: 'appointment' })),
  ];

  const slots = [];
  const step = duration;
  for (let m = day.open_minute; m + duration <= day.close_minute; m += step) {
    const start = zonedDateTimeToUtc(dateStr, m, tz);
    const end = new Date(start.getTime() + duration * 60_000);
    if (start.getTime() < leadCutoff) continue;
    if (day.break_start != null && day.break_end != null) {
      const bs = zonedDateTimeToUtc(dateStr, day.break_start, tz).getTime();
      const be = zonedDateTimeToUtc(dateStr, day.break_end, tz).getTime();
      if (start.getTime() < be && end.getTime() > bs) continue;
    }
    const overlap = busy.some((b) => start.getTime() < b.end && end.getTime() > b.start);
    if (overlap) continue;
    slots.push({ start: toIso(start), end: toIso(end), time: minutesToTimeStr(m) });
  }

  return { date: dateStr, isOpen: slots.length > 0, slots, blockReason: slots.length ? null : 'full' };
}

/** Grille de disponibilités sur N jours à partir d'une date locale. */
export function computeRange({
  practice,
  hours,
  exceptions,
  appointments,
  fromDate,
  days,
  now = new Date(),
  options = {},
}) {
  const results = [];
  for (let i = 0; i < days; i += 1) {
    const dateStr = addDaysToDateStr(fromDate, i);
    results.push(
      computeDaySlots({ practice, hours, exceptions, appointments, dateStr, now, options }),
    );
  }
  return results;
}

/**
 * Vérifie qu'un instant correspond à un créneau réservable.
 * @returns {{ ok: true, end: string } | { ok: false, code: string }}
 */
export function assertSlotBookable(opts) {
  const { practice, hours, exceptions, appointments, startIso, now = new Date(), options = {} } = opts;
  const tz = practice.timezone || 'Africa/Algiers';
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return { ok: false, code: 'INVALID_SLOT' };
  const dateStr = utcToZoned(start, tz).dateStr;
  const day = computeDaySlots({ practice, hours, exceptions, appointments, dateStr, now, options });
  const match = day.slots.find((s) => s.start === toIso(start));
  if (!match) {
    if (day.blockReason === 'closed_weekday') return { ok: false, code: 'DAY_CLOSED' };
    if (day.blockReason === 'beyond_horizon') return { ok: false, code: 'BEYOND_HORIZON' };
    if (day.blockReason === 'past') return { ok: false, code: 'SLOT_IN_PAST' };
    return { ok: false, code: 'SLOT_UNAVAILABLE' };
  }
  // Le délai minimal, l'horizon et les règles cabinet sont revérifiés ici.
  if (!options.ignoreTimingRules) {
    const maxStart = now.getTime() + (practice.horizon_days ?? 60) * 86_400_000;
    if (start.getTime() > maxStart) return { ok: false, code: 'BEYOND_HORIZON' };
  }
  return { ok: true, end: match.end };
}

/** Première disponibilité à partir de maintenant (page publique). */
export function findNextAvailability({ practice, hours, exceptions, appointments, now = new Date(), maxDays = 60 }) {
  const tz = practice.timezone || 'Africa/Algiers';
  const from = utcToZoned(now, tz).dateStr;
  const days = Math.min(maxDays, practice.horizon_days ?? 60);
  for (let i = 0; i < days; i += 1) {
    const dateStr = addDaysToDateStr(from, i);
    const day = computeDaySlots({ practice, hours, exceptions, appointments, dateStr, now });
    if (day.slots.length) return { date: dateStr, slot: day.slots[0], count: day.slots.length };
  }
  return null;
}
