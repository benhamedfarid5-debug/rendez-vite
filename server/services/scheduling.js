import crypto from 'node:crypto';
import { HttpError } from '../lib/http.js';
import { computeDaySlots, computeRange, assertSlotBookable, findNextAvailability } from '../lib/availability.js';
import { notifyPatient } from '../lib/notifications.js';
import { publicRef, randomToken, sha256 } from '../lib/security.js';
import { addDaysToDateStr, formatZonedRange, nowIso, toIso, utcToZoned } from '../lib/time.js';

export const ACTIVE_STATUSES = ['requested', 'confirmed', 'arrived', 'completed'];
const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ lecture */

export function loadHoursMap(db, practiceId) {
  const rows = db.prepare('SELECT * FROM working_hours WHERE practice_id = ?').all(practiceId);
  const map = new Map();
  for (const r of rows) map.set(r.weekday, r);
  return map;
}

export function loadExceptions(db, practiceId, fromIso, toIsoStr) {
  return db
    .prepare(
      `SELECT * FROM calendar_exceptions
       WHERE practice_id = ? AND ends_at > ? AND starts_at < ?
       ORDER BY starts_at ASC`,
    )
    .all(practiceId, fromIso, toIsoStr);
}

export function loadAppointments(db, practiceId, fromIso, toIsoStr, statuses = ACTIVE_STATUSES) {
  const placeholders = statuses.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT * FROM appointments
       WHERE practice_id = ? AND ends_at > ? AND starts_at < ? AND status IN (${placeholders})
       ORDER BY starts_at ASC`,
    )
    .all(practiceId, fromIso, toIsoStr, ...statuses);
}

/** Disponibilités sur N jours à partir d'une date locale. */
export function getAvailability(db, practice, { fromDate, days = 14, now = new Date(), options = {} }) {
  const tz = practice.timezone || 'Africa/Algiers';
  const from = fromDate || utcToZoned(now, tz).dateStr;
  // La fenêtre chargée couvre exactement la plage demandée (+/- 1 jour de marge).
  const startIso = toIso(zonedDayStart(addDaysToDateStr(from, -1), tz));
  const endIso = toIso(zonedDayStart(addDaysToDateStr(from, days + 1), tz));
  const hours = loadHoursMap(db, practice.id);
  const exceptions = loadExceptions(db, practice.id, startIso, endIso);
  const appointments = loadAppointments(db, practice.id, startIso, endIso);
  return computeRange({ practice, hours, exceptions, appointments, fromDate: from, days, now, options });
}

/** 00:00 local d'une date "YYYY-MM-DD" -> Date UTC. */
export function zonedDayStart(dateStr, tz = 'Africa/Algiers') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(naive))
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  const delta = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  return new Date(naive - delta);
}

export function getNextAvailability(db, practice, now = new Date()) {
  const tz = practice.timezone || 'Africa/Algiers';
  const startIso = toIso(new Date(now.getTime() - DAY_MS));
  const endIso = toIso(zonedDayStart(addDaysToDateStr(utcToZoned(now, tz).dateStr, 95), tz));
  return findNextAvailability({
    practice,
    hours: loadHoursMap(db, practice.id),
    exceptions: loadExceptions(db, practice.id, startIso, endIso),
    appointments: loadAppointments(db, practice.id, startIso, endIso),
    now,
    maxDays: practice.horizon_days || 60,
  });
}

/* ------------------------------------------------------------------- écriture */

export function audit(db, { practiceId, actorUserId = null, actorLabel, action, entityType, entityId = null, metadata = null, ipHash = null }) {
  db.prepare(
    `INSERT INTO audit_log (id, practice_id, actor_user_id, actor_label, action, entity_type, entity_id, metadata, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    practiceId,
    actorUserId,
    actorLabel,
    action,
    entityType,
    entityId,
    metadata ? JSON.stringify(metadata) : null,
    ipHash,
    nowIso(),
  );
}

function serializeAppointment(a, practice, { includePrivate = true } = {}) {
  const when = formatZonedRange(a.starts_at, a.ends_at, practice.timezone);
  const base = {
    id: a.id,
    reference: a.public_ref,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    date: when.date,
    start: when.start,
    end: when.end,
    status: a.status,
    patient_first_name: a.patient_first_name,
    patient_last_name: a.patient_last_name,
    patient_phone: a.patient_phone,
    patient_email: a.patient_email,
    patient_language: a.patient_language,
    notify_consent: !!a.notify_consent,
    source: a.source,
    created_at: a.created_at,
    updated_at: a.updated_at,
    cancelled_by: a.cancelled_by,
  };
  if (includePrivate) {
    base.reason_code = a.reason_code;
    base.free_text = a.free_text;
    base.free_text_lang = a.free_text_lang;
  }
  return base;
}

export { serializeAppointment };

function ensureNoOverlapError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('SLOT_OVERLAP') || err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || msg.includes('UNIQUE constraint failed')) {
    throw new HttpError(409, 'SLOT_TAKEN', 'Ce créneau vient d’être réservé. Merci d’en choisir un autre.', {
      recovered: true,
    });
  }
  throw err;
}

/**
 * Création d'un rendez-vous (patient en ligne ou équipe au comptoir).
 * Transaction IMMEDIATE : le verrou d'écriture SQLite est pris avant la
 * vérification, ce qui sérialise deux réservations concurrentes. Les triggers
 * de la base constituent la seconde barrière.
 */
export function bookAppointment(db, { practice, input, actor = null, source = 'online', now = new Date(), ipHash = null }) {
  const hours = loadHoursMap(db, practice.id);
  const start = new Date(input.starts_at);
  const tz = practice.timezone || 'Africa/Algiers';
  const dateStr = utcToZoned(start, tz).dateStr;
  const fromIso = toIso(new Date(start.getTime() - DAY_MS));
  const toIsoStr = toIso(new Date(start.getTime() + 2 * DAY_MS));
  const exceptions = loadExceptions(db, practice.id, fromIso, toIsoStr);
  const duration = input.duration_min || practice.slot_duration_min || 30;
  const options = source === 'staff' ? { ignoreTimingRules: false } : {};

  const createTx = db.transaction(() => {
    const appointments = loadAppointments(db, practice.id, fromIso, toIsoStr);
    if (source === 'online') {
      const check = assertSlotBookable({ practice, hours, exceptions, appointments, startIso: input.starts_at, now, options });
      if (!check.ok) {
        const map = {
          SLOT_UNAVAILABLE: [409, 'SLOT_UNAVAILABLE', 'Ce créneau n’est plus disponible.'],
          DAY_CLOSED: [409, 'DAY_CLOSED', 'Le cabinet est fermé ce jour-là.'],
          BEYOND_HORIZON: [409, 'BEYOND_HORIZON', 'Cette date dépasse l’horizon de réservation.'],
          SLOT_IN_PAST: [409, 'SLOT_IN_PAST', 'Ce créneau est déjà passé.'],
          INVALID_SLOT: [400, 'INVALID_SLOT', 'Créneau invalide.'],
        };
        const [status, code, message] = map[check.code] || [409, 'SLOT_UNAVAILABLE', 'Créneau indisponible.'];
        throw new HttpError(status, code, message);
      }
    } else {
      // Équipe : on contrôle tout de même fermeture / pause / conflit de plage.
      const day = computeDaySlots({
        practice,
        hours,
        exceptions,
        appointments,
        dateStr,
        now: new Date(0),
        options: { ignoreTimingRules: true },
      });
      const inHours = day.slots.some((s) => s.start === toIso(start));
      const isOpenDay = day.slots.length > 0 || day.blockReason === 'full';
      if (!isOpenDay) throw new HttpError(409, 'DAY_CLOSED', 'Le cabinet est fermé ce jour-là.');
      if (!inHours) {
        const blocked = exceptions.some(
          (e) => start.getTime() < Date.parse(e.ends_at) && start.getTime() + duration * 60_000 > Date.parse(e.starts_at),
        );
        if (blocked) throw new HttpError(409, 'BLOCKED_RANGE', 'Cette plage est bloquée (absence, fermeture ou urgence).');
        if (!day.slots.length) throw new HttpError(409, 'SLOT_UNAVAILABLE', 'Hors horaires ou créneau déjà occupé.');
        throw new HttpError(409, 'SLOT_UNAVAILABLE', 'Hors horaires d’ouverture ou pause.');
      }
    }

    const end = new Date(start.getTime() + duration * 60_000);
    const status = source === 'staff' ? input.status || 'confirmed' : practice.auto_confirm ? 'confirmed' : 'requested';
    const manageToken = randomToken(24);
    const id = crypto.randomUUID();
    const ts = nowIso();
    const ref = publicRef();

    try {
      db.prepare(
        `INSERT INTO appointments (
           id, practice_id, public_ref, manage_token_hash,
           patient_first_name, patient_last_name, patient_phone, patient_email,
           reason_code, free_text, free_text_lang, patient_language,
           starts_at, ends_at, status, source, notify_consent, privacy_consent_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        practice.id,
        ref,
        sha256(manageToken),
        input.first_name.trim(),
        input.last_name.trim(),
        input.phone.trim(),
        input.email?.trim() || null,
        input.reason_code,
        input.free_text?.trim() || null,
        input.free_text?.trim() ? input.patient_language || 'fr' : null,
        input.patient_language || 'fr',
        toIso(start),
        toIso(end),
        status,
        source,
        input.notify_consent ? 1 : 0,
        ts,
        ts,
        ts,
      );
    } catch (err) {
      ensureNoOverlapError(err);
    }

    audit(db, {
      practiceId: practice.id,
      actorUserId: actor?.id || null,
      actorLabel: actor ? `${actor.full_name} (${actor.role})` : 'patient (en ligne)',
      action: source === 'staff' ? 'appointment.create_staff' : 'appointment.create_online',
      entityType: 'appointment',
      entityId: id,
      metadata: { starts_at: toIso(start), status },
      ipHash,
    });

    return { id, ref, manageToken, status, starts_at: toIso(start), ends_at: toIso(end) };
  });

  const result = createTx.immediate();

  // Notification : jamais bloquante, jamais avec le motif de visite.
  const when = formatZonedRange(result.starts_at, result.ends_at, practice.timezone);
  const base = process.env.PUBLIC_BASE_URL;
  notifyPatient(db, {
    practice,
    appointmentId: result.id,
    contact: { email: input.email, phone: input.phone },
    consent: input.notify_consent,
    template: 'booking_confirmation',
    lang: input.patient_language || 'fr',
    data: {
      firstName: input.first_name,
      practiceName: practice.name_fr,
      date: when.date,
      time: when.start,
      ref: result.ref,
      confirmed: result.status === 'confirmed',
      link: base ? `${base}/r/${result.ref}?t=${result.manageToken}` : null,
    },
  });

  return result;
}

/** Reprogrammation (patient via lien, ou équipe). Libère l'ancien créneau. */
export function rescheduleAppointment(db, { practice, appointment, newStartIso, durationMin = null, actor = null, source = 'staff', now = new Date(), ipHash = null }) {
  const tz = practice.timezone || 'Africa/Algiers';
  const duration = durationMin || Math.round((Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60_000);
  const newStart = new Date(newStartIso);
  const dateStr = utcToZoned(newStart, tz).dateStr;
  const hours = loadHoursMap(db, practice.id);
  const fromIso = toIso(new Date(newStart.getTime() - DAY_MS));
  const toIsoStr = toIso(new Date(newStart.getTime() + 2 * DAY_MS));
  const exceptions = loadExceptions(db, practice.id, fromIso, toIsoStr);

  const tx = db.transaction(() => {
    const others = loadAppointments(db, practice.id, fromIso, toIsoStr).filter((a) => a.id !== appointment.id);
    const day = computeDaySlots({ practice, hours, exceptions, appointments: others, dateStr, now, options: source === 'patient' ? {} : {} });
    const match = day.slots.find((s) => s.start === toIso(newStart));
    if (!match) {
      const blocked = exceptions.some(
        (e) => newStart.getTime() < Date.parse(e.ends_at) && newStart.getTime() + duration * 60_000 > Date.parse(e.starts_at),
      );
      if (blocked) throw new HttpError(409, 'BLOCKED_RANGE', 'Cette plage est bloquée (absence, fermeture ou urgence).');
      throw new HttpError(409, 'SLOT_UNAVAILABLE', 'Ce créneau n’est pas disponible.');
    }
    const end = new Date(newStart.getTime() + duration * 60_000);
    try {
      db.prepare('UPDATE appointments SET starts_at = ?, ends_at = ?, status = ?, updated_at = ? WHERE id = ? AND practice_id = ?').run(
        toIso(newStart),
        toIso(end),
        appointment.status === 'requested' && source === 'patient' ? 'requested' : appointment.status,
        nowIso(),
        appointment.id,
        practice.id,
      );
    } catch (err) {
      ensureNoOverlapError(err);
    }
    audit(db, {
      practiceId: practice.id,
      actorUserId: actor?.id || null,
      actorLabel: actor ? `${actor.full_name} (${actor.role})` : 'patient (lien de gestion)',
      action: 'appointment.reschedule',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: { from: appointment.starts_at, to: toIso(newStart) },
      ipHash,
    });
    return { starts_at: toIso(newStart), ends_at: toIso(end) };
  });

  const result = tx.immediate();

  const when = formatZonedRange(result.starts_at, result.ends_at, practice.timezone);
  notifyPatient(db, {
    practice,
    appointmentId: appointment.id,
    contact: { email: appointment.patient_email, phone: appointment.patient_phone },
    consent: appointment.notify_consent,
    template: 'reschedule',
    lang: appointment.patient_language,
    data: { firstName: appointment.patient_first_name, practiceName: practice.name_fr, date: when.date, time: when.start, ref: appointment.public_ref },
  });
  return result;
}

/** Annulation : le statut « cancelled » libère immédiatement le créneau. */
export function cancelAppointment(db, { practice, appointment, by = 'staff', actor = null, now = new Date(), ipHash = null }) {
  if (['cancelled'].includes(appointment.status)) {
    return { alreadyCancelled: true };
  }
  const ts = nowIso();
  const tx = db.transaction(() => {
    db.prepare('UPDATE appointments SET status = ?, cancelled_at = ?, cancelled_by = ?, updated_at = ? WHERE id = ? AND practice_id = ?').run(
      'cancelled',
      ts,
      by,
      ts,
      appointment.id,
      practice.id,
    );
    audit(db, {
      practiceId: practice.id,
      actorUserId: actor?.id || null,
      actorLabel: actor ? `${actor.full_name} (${actor.role})` : by === 'patient' ? 'patient (lien de gestion)' : 'système',
      action: 'appointment.cancel',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: { by, starts_at: appointment.starts_at },
      ipHash,
    });
  });
  tx.immediate();

  const when = formatZonedRange(appointment.starts_at, appointment.ends_at, practice.timezone);
  notifyPatient(db, {
    practice,
    appointmentId: appointment.id,
    contact: { email: appointment.patient_email, phone: appointment.patient_phone },
    consent: appointment.notify_consent,
    template: 'cancellation',
    lang: appointment.patient_language,
    data: { firstName: appointment.patient_first_name, practiceName: practice.name_fr, date: when.date, time: when.start, ref: appointment.public_ref },
  });
  return { alreadyCancelled: false };
}

const ALLOWED_TRANSITIONS = {
  requested: ['confirmed', 'cancelled', 'no_show', 'arrived'],
  confirmed: ['arrived', 'completed', 'cancelled', 'no_show', 'requested'],
  arrived: ['completed', 'cancelled', 'no_show'],
  completed: ['cancelled'],
  cancelled: [],
  no_show: ['confirmed', 'cancelled'],
};

export function changeStatus(db, { practice, appointment, status, actor, now = new Date(), ipHash = null }) {
  const allowed = ALLOWED_TRANSITIONS[appointment.status] || [];
  if (!allowed.includes(status)) {
    throw new HttpError(409, 'INVALID_TRANSITION', 'Ce changement de statut n’est pas autorisé.');
  }
  const ts = nowIso();
  const tx = db.transaction(() => {
    db.prepare('UPDATE appointments SET status = ?, updated_at = ?, cancelled_at = ?, cancelled_by = ? WHERE id = ? AND practice_id = ?').run(
      status,
      ts,
      status === 'cancelled' ? ts : appointment.cancelled_at,
      status === 'cancelled' ? 'staff' : appointment.cancelled_by,
      appointment.id,
      practice.id,
    );
    audit(db, {
      practiceId: practice.id,
      actorUserId: actor.id,
      actorLabel: `${actor.full_name} (${actor.role})`,
      action: 'appointment.status',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: { from: appointment.status, to: status },
      ipHash,
    });
  });
  tx.immediate();
  return getAppointment(db, practice.id, appointment.id);
}

export function getAppointment(db, practiceId, id) {
  return db.prepare('SELECT * FROM appointments WHERE id = ? AND practice_id = ?').get(id, practiceId);
}

export function getAppointmentByRef(db, practiceId, ref) {
  return db.prepare('SELECT * FROM appointments WHERE practice_id = ? AND public_ref = ?').get(practiceId, ref?.toUpperCase());
}

/* ------------------------------------------------------- exceptions / horaires */

export function listExceptionsForRange(db, practiceId, fromIso, toIsoStr) {
  return db
    .prepare(
      `SELECT e.*, u.full_name AS created_by_name FROM calendar_exceptions e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.practice_id = ? AND e.ends_at > ? AND e.starts_at < ?
       ORDER BY e.starts_at ASC`,
    )
    .all(practiceId, fromIso, toIsoStr)
    .map((e) => ({
      ...e,
      date_start: utcToZoned(e.starts_at).dateStr,
      time_start: utcToZoned(e.starts_at).timeStr,
      date_end: utcToZoned(e.ends_at).dateStr,
      time_end: utcToZoned(e.ends_at).timeStr,
    }));
}

export function affectedAppointments(db, practiceId, startsAt, endsAt) {
  return db
    .prepare(
      `SELECT * FROM appointments
       WHERE practice_id = ? AND starts_at < ? AND ends_at > ?
         AND status IN ('requested','confirmed','arrived')
       ORDER BY starts_at ASC`,
    )
    .all(practiceId, endsAt, startsAt);
}

export function defaultHours() {
  // Dim..Sam — vendredi fermé par défaut (week-end algérien classique).
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    is_open: weekday === 5 ? 0 : 1,
    open_minute: 9 * 60,
    close_minute: 17 * 60,
    break_start: 12 * 60,
    break_end: 13 * 60,
  }));
}

export function dateRangeIso(fromDate, toDate, tz) {
  return {
    fromIso: toIso(utcToZonedStart(fromDate, tz)),
    toIsoStr: toIso(utcToZonedStart(addDaysToDateStr(toDate, 1), tz)),
  };
}

function utcToZonedStart(dateStr, tz) {
  // 00:00 local -> UTC
  const [y, m, d] = dateStr.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d);
  const probe = new Date(naive);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset);
  const delta = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  return new Date(naive - delta);
}
