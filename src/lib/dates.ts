/** Helpers de dates côté client (fuseau cabinet : Africa/Algiers). */

export const TZ = 'Africa/Algiers';

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Aujourd'hui (fuseau Algiers) au format YYYY-MM-DD. */
export function todayStr(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA donne YYYY-MM-DD
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function dateToWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Lundi comme premier jour de semaine (usage courant en Algérie : dimanche). */
export function startOfWeek(dateStr: string, firstDay = 0): string {
  const wd = dateToWeekday(dateStr);
  const delta = (wd - firstDay + 7) % 7;
  return addDays(dateStr, -delta);
}

export function weekDates(dateStr: string, firstDay = 0): string[] {
  const start = startOfWeek(dateStr, firstDay);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Grille du mois (6 semaines) pour l'agenda mensuel. */
export function monthGrid(year: number, month: number, firstDay = 0): string[] {
  const first = `${year}-${pad(month + 1)}-01`;
  const start = startOfWeek(first, firstDay);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function minutesToTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Instant UTC -> "HH:MM" dans le fuseau du cabinet. */
export function isoToTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function isoToDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** "YYYY-MM-DD" + "HH:MM" locaux -> ISO UTC. */
export function localToIso(dateStr: string, time: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(naive))
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  const delta = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  return new Date(naive - delta).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Valeur pour <input type="datetime-local"> à partir d'un ISO UTC. */
export function isoToLocalInput(iso: string): string {
  return `${isoToDate(iso)}T${isoToTime(iso)}`;
}

export function relativeDayLabel(dateStr: string, lang: 'fr' | 'ar', t: (k: any) => string): string | null {
  const delta = diffDays(dateStr, todayStr());
  if (delta === 0) return t('today');
  if (delta === 1) return t('tomorrow');
  if (delta === -1) return t('yesterday');
  return null;
}
