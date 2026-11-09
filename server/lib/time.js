/**
 * Utilitaires de temps. Tout est stocké en UTC ISO en base ; l'affichage et la
 * saisie se font dans le fuseau du cabinet (Africa/Algiers par défaut).
 * Implémentation générique basée sur Intl (aucune dépendance externe).
 */

export const DEFAULT_TZ = 'Africa/Algiers';

const partsFormatterCache = new Map();
function partsFormatter(tz) {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

function zonedParts(date, tz) {
  const parts = partsFormatter(tz).formatToParts(date);
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

/** Décalage (ms) du fuseau par rapport à UTC à l'instant donné. */
export function tzOffsetMs(date, tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-11-02" + 540 minutes -> Date UTC correspondant à 09:00 locale. */
export function zonedDateTimeToUtc(dateStr, minutesOfDay, tz = DEFAULT_TZ) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0, 0) + minutesOfDay * 60_000;
  let offset = tzOffsetMs(new Date(naive), tz);
  let utc = naive - offset;
  const offset2 = tzOffsetMs(new Date(utc), tz);
  if (offset2 !== offset) utc = naive - offset2;
  return new Date(utc);
}

export function utcToZoned(dateLike, tz = DEFAULT_TZ) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const p = zonedParts(date, tz);
  return {
    ...p,
    minutesOfDay: p.hour * 60 + p.minute,
    dateStr: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    timeStr: `${pad(p.hour)}:${pad(p.minute)}`,
    weekday: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(),
  };
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

/** Date locale "YYYY-MM-DD" d'un instant. */
export function localDateStr(dateLike, tz = DEFAULT_TZ) {
  return utcToZoned(dateLike, tz).dateStr;
}

/** Ajoute n jours à une date "YYYY-MM-DD" (sans effet de fuseau). */
export function addDaysToDateStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Écart en jours calendaires entre deux dates "YYYY-MM-DD". */
export function diffDays(dateA, dateB) {
  const a = Date.parse(`${dateA}T00:00:00Z`);
  const b = Date.parse(`${dateB}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

/** "HH:MM" -> minutes */
export function timeStrToMinutes(str) {
  const [h, m] = String(str).split(':').map(Number);
  return h * 60 + m;
}

/** minutes -> "HH:MM" */
export function minutesToTimeStr(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** ISO UTC sans millisecondes, format de stockage. */
export function toIso(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function nowIso() {
  return toIso(new Date());
}

/** Jours fériés algériens (indicatifs, non bloquants par défaut). */
export const PUBLIC_HOLIDAYS = [
  { month: 1, day: 1, fr: 'Jour de l’an', ar: 'رأس السنة الميلادية' },
  { month: 5, day: 1, fr: 'Fête du travail', ar: 'عيد العمال' },
  { month: 7, day: 5, fr: 'Fête de l’indépendance', ar: 'عيد الاستقلال' },
  { month: 11, day: 1, fr: 'Fête de la révolution', ar: 'عيد الثورة' },
];

/** Formate une plage horaire lisible dans le fuseau du cabinet. */
export function formatZonedRange(startIso, endIso, tz = DEFAULT_TZ) {
  const s = utcToZoned(startIso, tz);
  const e = utcToZoned(endIso, tz);
  return { date: s.dateStr, start: s.timeStr, end: e.timeStr };
}
