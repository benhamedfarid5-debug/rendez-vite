import crypto from 'node:crypto';
import express from 'express';
import { asyncHandler, clientIp, HttpError, sendError, validate } from '../lib/http.js';
import { hashIp, rateLimit } from '../lib/security.js';
import { channelStatus, sweepReminders } from '../lib/notifications.js';
import {
  appointmentUpdateSchema,
  exceptionSchema,
  hoursSchema,
  notifySettingsSchema,
  profileSchema,
  staffAppointmentSchema,
} from '../lib/validation.js';
import { addDaysToDateStr, formatZonedRange, nowIso, toIso, utcToZoned } from '../lib/time.js';
import { computeDaySlots, ACTIVE_STATUSES } from '../lib/availability.js';
import { findWilaya } from '../data/wilayas.js';
import {
  affectedAppointments,
  audit,
  bookAppointment,
  cancelAppointment,
  changeStatus,
  defaultHours,
  getAppointment,
  getAvailability,
  listExceptionsForRange,
  loadAppointments,
  loadExceptions,
  loadHoursMap,
  rescheduleAppointment,
  serializeAppointment,
} from '../services/scheduling.js';
import { requireOwner } from './auth.js';

const DAY_MS = 86_400_000;

function rangeFromQuery(req, tz) {
  const today = utcToZoned(new Date(), tz).dateStr;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : addDaysToDateStr(from, 0);
  if (to < from) throw new HttpError(422, 'BAD_RANGE', 'Plage de dates invalide.');
  if (Math.abs(Date.parse(to) - Date.parse(from)) / DAY_MS > 400) {
    throw new HttpError(422, 'BAD_RANGE', 'Plage trop large (400 jours maximum).');
  }
  return { from, to };
}

export function staffRouter(db) {
  const router = express.Router();
  const tz = (req) => req.practice.timezone || 'Africa/Algiers';

  /* ------------------------------------------------------------- tableau de bord */

  router.get(
    '/overview',
    asyncHandler(async (req, res) => {
      const practice = req.practice;
      const timezone = tz(req);
      const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : utcToZoned(new Date(), timezone).dateStr;
      const dayStart = toIso(utcToZonedToDate(today, timezone));
      const dayEnd = toIso(utcToZonedToDate(addDaysToDateStr(today, 1), timezone));

      const todays = db
        .prepare('SELECT * FROM appointments WHERE practice_id = ? AND starts_at >= ? AND starts_at < ? ORDER BY starts_at')
        .all(practice.id, dayStart, dayEnd)
        .map((a) => serializeAppointment(a, practice));

      const pending = db
        .prepare("SELECT * FROM appointments WHERE practice_id = ? AND status = 'requested' AND starts_at >= ? ORDER BY starts_at LIMIT 50")
        .all(practice.id, dayStart)
        .map((a) => serializeAppointment(a, practice));

      const upcoming = db
        .prepare(
          `SELECT * FROM appointments WHERE practice_id = ? AND status IN ('requested','confirmed')
             AND starts_at >= ? AND starts_at < ? ORDER BY starts_at LIMIT 8`,
        )
        .all(practice.id, dayEnd, toIso(new Date(Date.now() + 14 * DAY_MS)))
        .map((a) => serializeAppointment(a, practice));

      const cancelledToday = db
        .prepare("SELECT * FROM appointments WHERE practice_id = ? AND status = 'cancelled' AND cancelled_at >= ? AND cancelled_at < ? ORDER BY cancelled_at DESC")
        .all(practice.id, dayStart, dayEnd)
        .map((a) => serializeAppointment(a, practice));

      const blocks = listExceptionsForRange(db, practice.id, dayStart, dayEnd);

      // Occupation estimée : minutes réservées / minutes ouvrables du jour.
      const hours = loadHoursMap(db, practice.id);
      const weekday = utcToZoned(new Date(dayStart), timezone).weekday;
      const day = hours.get(weekday);
      let openMinutes = day && day.is_open ? Math.max(0, day.close_minute - day.open_minute - (day.break_start != null && day.break_end != null ? day.break_end - day.break_start : 0)) : 0;
      // Pour aujourd'hui, l'occupation ne porte que sur les heures encore à venir
      // (sinon le taux reste artificiellement bas en fin de journée).
      const nowMinutes = utcToZoned(new Date(), timezone).minutesOfDay;
      if (day && day.is_open && today === utcToZoned(new Date(), timezone).dateStr) {
        openMinutes = Math.max(0, day.close_minute - Math.max(day.open_minute, nowMinutes));
      }
      const bookedMinutes = todays
        .filter((a) => ACTIVE_STATUSES.includes(a.status))
        .reduce((sum, a) => sum + (Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000, 0);
      const occupancy = openMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / openMinutes) * 100)) : 0;

      const availability = getAvailability(db, practice, { fromDate: today, days: 1, options: { ignoreTimingRules: false } });
      const freeSlots = availability[0]?.slots?.length || 0;

      res.json({
        date: today,
        appointments: todays,
        pending,
        upcoming,
        cancelled: cancelledToday,
        blocks,
        stats: {
          total: todays.filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
          confirmed: todays.filter((a) => a.status === 'confirmed').length,
          arrived: todays.filter((a) => a.status === 'arrived').length,
          completed: todays.filter((a) => a.status === 'completed').length,
          cancelled: cancelledToday.length,
          no_show: todays.filter((a) => a.status === 'no_show').length,
          occupancy,
          freeSlots,
          pendingCount: pending.length,
        },
        server_time: nowIso(),
      });
    }),
  );

  router.get(
    '/stats',
    asyncHandler(async (req, res) => {
      const practice = req.practice;
      const timezone = tz(req);
      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
      const today = utcToZoned(new Date(), timezone).dateStr;
      const from = addDaysToDateStr(today, -(days - 1));
      const startIso = toIso(utcToZonedToDate(from, timezone));
      const endIso = toIso(utcToZonedToDate(addDaysToDateStr(today, 1), timezone));
      const rows = db
        .prepare('SELECT * FROM appointments WHERE practice_id = ? AND starts_at >= ? AND starts_at < ?')
        .all(practice.id, startIso, endIso);

      const hours = loadHoursMap(db, practice.id);
      const exceptions = loadExceptions(db, practice.id, startIso, endIso);
      const byDay = [];
      for (let i = 0; i < days; i += 1) {
        const dateStr = addDaysToDateStr(from, i);
        const dayRows = rows.filter((a) => utcToZoned(a.starts_at, timezone).dateStr === dateStr);
        const dayHours = hours.get(utcToZoned(utcToZonedToDate(dateStr, timezone), timezone).weekday);
        const openMinutes = dayHours && dayHours.is_open
          ? Math.max(0, dayHours.close_minute - dayHours.open_minute - (dayHours.break_start != null && dayHours.break_end != null ? dayHours.break_end - dayHours.break_start : 0))
          : 0;
        const booked = dayRows
          .filter((a) => ACTIVE_STATUSES.includes(a.status))
          .reduce((s, a) => s + (Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000, 0);
        byDay.push({
          date: dateStr,
          total: dayRows.filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
          confirmed: dayRows.filter((a) => a.status === 'confirmed').length,
          cancelled: dayRows.filter((a) => a.status === 'cancelled').length,
          no_show: dayRows.filter((a) => a.status === 'no_show').length,
          occupancy: openMinutes > 0 ? Math.min(100, Math.round((booked / openMinutes) * 100)) : 0,
        });
      }
      const blockCount = exceptions.filter((e) => ['absence', 'closure'].includes(e.kind)).length;
      res.json({
        days: byDay,
        totals: {
          appointments: byDay.reduce((s, d) => s + d.total, 0),
          confirmed: byDay.reduce((s, d) => s + d.confirmed, 0),
          cancelled: byDay.reduce((s, d) => s + d.cancelled, 0),
          noShow: byDay.reduce((s, d) => s + d.no_show, 0),
          blocks: blockCount,
          occupancy: byDay.length ? Math.round(byDay.reduce((s, d) => s + d.occupancy, 0) / byDay.length) : 0,
        },
      });
    }),
  );

  /* --------------------------------------------------------------- rendez-vous */

  router.get(
    '/appointments',
    asyncHandler(async (req, res) => {
      const { from, to } = rangeFromQuery(req, tz(req));
      const startIso = toIso(utcToZonedToDate(from, tz(req)));
      const endIso = toIso(utcToZonedToDate(addDaysToDateStr(to, 1), tz(req)));
      const status = req.query.status ? String(req.query.status) : null;
      const q = req.query.q ? String(req.query.q).trim().slice(0, 60) : null;

      let sql = 'SELECT * FROM appointments WHERE practice_id = ? AND starts_at >= ? AND starts_at < ?';
      const params = [req.practice.id, startIso, endIso];
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (q) {
        sql += ' AND (patient_first_name LIKE ? OR patient_last_name LIKE ? OR patient_phone LIKE ? OR public_ref LIKE ?)';
        const like = `%${q}%`;
        params.push(like, like, like, like);
      }
      sql += ' ORDER BY starts_at ASC';
      const rows = db.prepare(sql).all(...params);
      res.json({ appointments: rows.map((a) => serializeAppointment(a, req.practice)), from, to });
    }),
  );

  router.get(
    '/appointments/:id',
    asyncHandler(async (req, res) => {
      const a = getAppointment(db, req.practice.id, req.params.id);
      if (!a) return sendError(res, 404, 'NOT_FOUND', 'Rendez-vous introuvable.');
      res.json({ appointment: serializeAppointment(a, req.practice) });
    }),
  );

  router.get(
    '/appointments/:id/history',
    asyncHandler(async (req, res) => {
      const a = getAppointment(db, req.practice.id, req.params.id);
      if (!a) return sendError(res, 404, 'NOT_FOUND', 'Rendez-vous introuvable.');
      const rows = db
        .prepare("SELECT * FROM audit_log WHERE practice_id = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 30")
        .all(req.practice.id, a.id);
      res.json({ history: rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })) });
    }),
  );

  router.post(
    '/appointments',
    asyncHandler(async (req, res) => {
      const input = validate(staffAppointmentSchema, req.body || {});
      const result = bookAppointment(db, {
        practice: req.practice,
        input: { ...input, patient_language: input.patient_language || 'fr' },
        actor: req.auth,
        source: 'staff',
        ipHash: hashIp(clientIp(req)),
      });
      const created = getAppointment(db, req.practice.id, result.id);
      res.status(201).json({ appointment: serializeAppointment(created, req.practice) });
    }),
  );

  router.patch(
    '/appointments/:id',
    asyncHandler(async (req, res) => {
      const practice = req.practice;
      const a = getAppointment(db, practice.id, req.params.id);
      if (!a) return sendError(res, 404, 'NOT_FOUND', 'Rendez-vous introuvable.');
      const body = validate(appointmentUpdateSchema, req.body || {});
      let updated = a;

      if (body.starts_at) {
        if (['cancelled', 'completed'].includes(a.status)) {
          return sendError(res, 409, 'NOT_RESCHEDULABLE', 'Ce rendez-vous ne peut plus être déplacé.');
        }
        rescheduleAppointment(db, {
          practice,
          appointment: a,
          newStartIso: body.starts_at,
          actor: req.auth,
          source: 'staff',
          ipHash: hashIp(clientIp(req)),
        });
      }
      if (body.status) {
        const fresh = getAppointment(db, practice.id, a.id);
        if (body.status === 'cancelled') {
          cancelAppointment(db, { practice, appointment: fresh, by: 'staff', actor: req.auth, ipHash: hashIp(clientIp(req)) });
        } else {
          changeStatus(db, { practice, appointment: fresh, status: body.status, actor: req.auth, ipHash: hashIp(clientIp(req)) });
        }
      }
      updated = getAppointment(db, practice.id, a.id);
      res.json({ appointment: serializeAppointment(updated, practice) });
    }),
  );

  router.delete(
    '/appointments/:id',
    asyncHandler(async (req, res) => {
      const a = getAppointment(db, req.practice.id, req.params.id);
      if (!a) return sendError(res, 404, 'NOT_FOUND', 'Rendez-vous introuvable.');
      await cancelAppointment(db, { practice: req.practice, appointment: a, by: 'staff', actor: req.auth, ipHash: hashIp(clientIp(req)) });
      res.json({ ok: true });
    }),
  );

  /** Disponibilités vues par l'équipe (heures passées incluses + RDV du jour). */
  router.get(
    '/availability',
    asyncHandler(async (req, res) => {
      const timezone = tz(req);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : utcToZoned(new Date(), timezone).dateStr;
      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 42);
      const result = getAvailability(db, req.practice, { fromDate: from, days });
      const startIso = toIso(utcToZonedToDate(from, timezone));
      const endIso = toIso(utcToZonedToDate(addDaysToDateStr(from, days), timezone));
      const appointments = loadAppointments(db, req.practice.id, startIso, endIso).map((a) => serializeAppointment(a, req.practice));
      const exceptions = listExceptionsForRange(db, req.practice.id, startIso, endIso);
      res.json({ days: result, appointments, exceptions, from });
    }),
  );

  /* ------------------------------------------------------------------ horaires */

  router.get('/hours', (req, res) => {
    const rows = db.prepare('SELECT * FROM working_hours WHERE practice_id = ? ORDER BY weekday').all(req.practice.id);
    res.json({ hours: rows.length ? rows : defaultHours() });
  });

  router.put(
    '/hours',
    requireOwner,
    asyncHandler(async (req, res) => {
      const { hours } = validate(hoursSchema, req.body || {});
      for (const h of hours) {
        if (h.is_open && h.close_minute <= h.open_minute) {
          throw new HttpError(422, 'BAD_HOURS', 'L’heure de fermeture doit être après l’ouverture.', { fields: { weekday: String(h.weekday) } });
        }
        if (h.break_start != null && h.break_end != null && h.break_end <= h.break_start) {
          throw new HttpError(422, 'BAD_BREAK', 'La pause doit se terminer après son début.', { fields: { weekday: String(h.weekday) } });
        }
      }
      const tx = db.transaction(() => {
        for (const h of hours) {
          db.prepare(
            `INSERT INTO working_hours (id, practice_id, weekday, is_open, open_minute, close_minute, break_start, break_end)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (practice_id, weekday) DO UPDATE SET
               is_open = excluded.is_open, open_minute = excluded.open_minute, close_minute = excluded.close_minute,
               break_start = excluded.break_start, break_end = excluded.break_end`,
          ).run(crypto.randomUUID(), req.practice.id, h.weekday, h.is_open ? 1 : 0, h.open_minute, h.close_minute, h.break_start ?? null, h.break_end ?? null);
        }
        db.prepare('UPDATE practices SET updated_at = ? WHERE id = ?').run(nowIso(), req.practice.id);
        audit(db, {
          practiceId: req.practice.id,
          actorUserId: req.auth.id,
          actorLabel: `${req.auth.full_name} (${req.auth.role})`,
          action: 'hours.update',
          entityType: 'working_hours',
          ipHash: hashIp(clientIp(req)),
        });
      });
      tx.immediate();
      const rows = db.prepare('SELECT * FROM working_hours WHERE practice_id = ? ORDER BY weekday').all(req.practice.id);
      res.json({ hours: rows });
    }),
  );

  /* -------------------------------------------------------- absences / blocages */

  router.get(
    '/exceptions',
    asyncHandler(async (req, res) => {
      const timezone = tz(req);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : utcToZoned(new Date(), timezone).dateStr;
      const days = Math.min(Math.max(Number(req.query.days) || 60, 1), 400);
      const startIso = toIso(utcToZonedToDate(addDaysToDateStr(from, -1), timezone));
      const endIso = toIso(utcToZonedToDate(addDaysToDateStr(from, days), timezone));
      res.json({ exceptions: listExceptionsForRange(db, req.practice.id, startIso, endIso) });
    }),
  );

  router.get(
    '/exceptions/impact',
    asyncHandler(async (req, res) => {
      const { starts_at: s, ends_at: e } = req.query;
      if (!s || !e || Number.isNaN(Date.parse(s)) || Number.isNaN(Date.parse(e))) {
        return sendError(res, 422, 'VALIDATION', 'Période invalide.');
      }
      const rows = affectedAppointments(db, req.practice.id, new Date(s).toISOString(), new Date(e).toISOString());
      res.json({ affected: rows.map((a) => serializeAppointment(a, req.practice)) });
    }),
  );

  router.post(
    '/exceptions',
    requireOwner,
    asyncHandler(async (req, res) => {
      const input = validate(exceptionSchema, req.body || {});
      if (Date.parse(input.ends_at) < Date.now() - 86_400_000) {
        return sendError(res, 422, 'VALIDATION', 'La période est entièrement passée.');
      }
      const affected = affectedAppointments(db, req.practice.id, input.starts_at, input.ends_at);
      const id = crypto.randomUUID();
      db.prepare(
        'INSERT INTO calendar_exceptions (id, practice_id, kind, starts_at, ends_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(id, req.practice.id, input.kind, input.starts_at, input.ends_at, input.note || null, req.auth.id, nowIso());
      audit(db, {
        practiceId: req.practice.id,
        actorUserId: req.auth.id,
        actorLabel: `${req.auth.full_name} (${req.auth.role})`,
        action: 'exception.create',
        entityType: 'calendar_exception',
        entityId: id,
        metadata: { kind: input.kind, starts_at: input.starts_at, ends_at: input.ends_at, affected: affected.length },
        ipHash: hashIp(clientIp(req)),
      });
      // Les rendez-vous touchés ne sont jamais supprimés : ils sont listés au cabinet.
      res.status(201).json({
        exception: db.prepare('SELECT * FROM calendar_exceptions WHERE id = ?').get(id),
        affected: affected.map((a) => serializeAppointment(a, req.practice)),
      });
    }),
  );

  router.delete(
    '/exceptions/:id',
    requireOwner,
    asyncHandler(async (req, res) => {
      const row = db.prepare('SELECT * FROM calendar_exceptions WHERE id = ? AND practice_id = ?').get(req.params.id, req.practice.id);
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Blocage introuvable.');
      db.prepare('DELETE FROM calendar_exceptions WHERE id = ?').run(row.id);
      audit(db, {
        practiceId: req.practice.id,
        actorUserId: req.auth.id,
        actorLabel: `${req.auth.full_name} (${req.auth.role})`,
        action: 'exception.delete',
        entityType: 'calendar_exception',
        entityId: row.id,
        ipHash: hashIp(clientIp(req)),
      });
      res.json({ ok: true });
    }),
  );

  /* ------------------------------------------------------------------- profil */

  router.get('/profile', (req, res) => {
    const p = req.practice;
    const wilaya = findWilaya(p.wilaya_code);
    res.json({
      profile: {
        ...p,
        languages: String(p.languages || '').split(',').filter(Boolean),
        wilaya: wilaya ? { fr: wilaya.fr, ar: wilaya.ar } : null,
        public_url: `/d/${p.slug}`,
      },
    });
  });

  router.put(
    '/profile',
    requireOwner,
    asyncHandler(async (req, res) => {
      const input = validate(profileSchema, req.body || {});
      const wilaya = findWilaya(input.wilaya_code);
      db.prepare(
        `UPDATE practices SET name_fr = ?, name_ar = ?, specialty_fr = ?, specialty_ar = ?, address_fr = ?, address_ar = ?,
           city_fr = ?, city_ar = ?, wilaya_code = ?, wilaya_fr = ?, wilaya_ar = ?, latitude = ?, longitude = ?, phone = ?, languages = ?,
           slot_duration_min = ?, min_lead_hours = ?, horizon_days = ?, auto_confirm = ?, is_listed = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.name_fr,
        input.name_ar || null,
        input.specialty_fr,
        input.specialty_ar || null,
        input.address_fr || null,
        input.address_ar || null,
        input.city_fr || null,
        input.city_ar || null,
        input.wilaya_code ?? null,
        wilaya?.fr || null,
        wilaya?.ar || null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.phone || null,
        input.languages.join(','),
        input.slot_duration_min,
        input.min_lead_hours,
        input.horizon_days,
        input.auto_confirm ? 1 : 0,
        input.is_listed ? 1 : 0,
        nowIso(),
        req.practice.id,
      );
      audit(db, {
        practiceId: req.practice.id,
        actorUserId: req.auth.id,
        actorLabel: `${req.auth.full_name} (${req.auth.role})`,
        action: 'profile.update',
        entityType: 'practice',
        entityId: req.practice.id,
        ipHash: hashIp(clientIp(req)),
      });
      res.json({ profile: db.prepare('SELECT * FROM practices WHERE id = ?').get(req.practice.id) });
    }),
  );

  /* ------------------------------------------------------------ notifications */

  router.get('/notifications', (req, res) => {
    const rows = db
      .prepare(
        `SELECT n.*, a.public_ref FROM notifications n
         LEFT JOIN appointments a ON a.id = n.appointment_id
         WHERE n.practice_id = ? ORDER BY n.created_at DESC LIMIT 60`,
      )
      .all(req.practice.id);
    res.json({
      notifications: rows,
      channels: channelStatus(),
      reminder_enabled: !!req.practice.reminder_enabled,
      reminder_hours_before: req.practice.reminder_hours_before,
      notify_channel: req.practice.notify_channel,
      retention_days: req.practice.retention_days,
    });
  });

  router.put(
    '/notifications/settings',
    requireOwner,
    asyncHandler(async (req, res) => {
      const input = validate(notifySettingsSchema, req.body || {});
      db.prepare(
        'UPDATE practices SET reminder_enabled = ?, reminder_hours_before = ?, notify_channel = ?, retention_days = ?, updated_at = ? WHERE id = ?',
      ).run(input.reminder_enabled ? 1 : 0, input.reminder_hours_before, input.notify_channel, input.retention_days, nowIso(), req.practice.id);
      audit(db, {
        practiceId: req.practice.id,
        actorUserId: req.auth.id,
        actorLabel: `${req.auth.full_name} (${req.auth.role})`,
        action: 'notifications.settings',
        entityType: 'practice',
        entityId: req.practice.id,
      });
      res.json({ ok: true });
    }),
  );

  router.post(
    '/notifications/sweep',
    asyncHandler(async (req, res) => {
      const created = await sweepReminders(db);
      res.json({ created, channels: channelStatus() });
    }),
  );

  /* -------------------------------------------------------------------- audit */

  router.get('/audit', (req, res) => {
    const rows = db
      .prepare('SELECT * FROM audit_log WHERE practice_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(req.practice.id);
    res.json({ entries: rows });
  });

  /* ------------------------------------------------- équipe (propriétaire seul) */

  router.get(
    '/team',
    requireOwner,
    asyncHandler(async (req, res) => {
      const rows = db.prepare('SELECT id, email, full_name, role, is_active, last_login_at FROM users WHERE practice_id = ? ORDER BY created_at').all(req.practice.id);
      res.json({ members: rows });
    }),
  );

  router.post(
    '/team',
    requireOwner,
    asyncHandler(async (req, res) => {
      const { hashPassword } = await import('../lib/security.js');
      const { email, full_name, password, role } = req.body || {};
      if (!email || !full_name || !password || !['owner', 'secretary'].includes(role)) {
        return sendError(res, 422, 'VALIDATION', 'Champs requis : e-mail, nom, mot de passe, rôle.');
      }
      if (String(password).length < 10) return sendError(res, 422, 'VALIDATION', 'Mot de passe : 10 caractères minimum.');
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
      if (exists) return sendError(res, 409, 'EMAIL_TAKEN', 'Cet e-mail est déjà utilisé.');
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO users (id, practice_id, email, password_hash, full_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, req.practice.id, String(email).toLowerCase(), await hashPassword(String(password)), String(full_name), role, nowIso(),
      );
      audit(db, {
        practiceId: req.practice.id,
        actorUserId: req.auth.id,
        actorLabel: `${req.auth.full_name} (${req.auth.role})`,
        action: 'team.create',
        entityType: 'user',
        entityId: id,
        metadata: { role },
      });
      res.status(201).json({ member: db.prepare('SELECT id, email, full_name, role, is_active FROM users WHERE id = ?').get(id) });
    }),
  );

  router.patch(
    '/team/:id',
    requireOwner,
    asyncHandler(async (req, res) => {
      const member = db.prepare('SELECT * FROM users WHERE id = ? AND practice_id = ?').get(req.params.id, req.practice.id);
      if (!member) return sendError(res, 404, 'NOT_FOUND', 'Membre introuvable.');
      if (member.id === req.auth.id) return sendError(res, 409, 'SELF_EDIT', 'Vous ne pouvez pas modifier votre propre compte ici.');
      const isActive = req.body?.is_active;
      if (typeof isActive !== 'boolean') return sendError(res, 422, 'VALIDATION', 'Champ is_active requis.');
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, member.id);
      if (!isActive) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(member.id);
      audit(db, {
        practiceId: req.practice.id,
        actorUserId: req.auth.id,
        actorLabel: `${req.auth.full_name} (${req.auth.role})`,
        action: 'team.update',
        entityType: 'user',
        entityId: member.id,
        metadata: { is_active: isActive },
      });
      res.json({ ok: true });
    }),
  );

  /* -------------------------------------------------- demandes de données (owner) */

  router.get(
    '/data-requests',
    requireOwner,
    asyncHandler(async (req, res) => {
      const rows = db.prepare('SELECT * FROM data_requests WHERE practice_id = ? ORDER BY created_at DESC LIMIT 100').all(req.practice.id);
      res.json({ requests: rows, retention_days: req.practice.retention_days });
    }),
  );

  return router;
}

/** 00:00 local d'une date "YYYY-MM-DD" -> Date UTC. */
function utcToZonedToDate(dateStr, timezone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' });
  const name = fmt.formatToParts(new Date(naive)).find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  const delta = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  return new Date(naive - delta);
}

export { utcToZonedToDate };
