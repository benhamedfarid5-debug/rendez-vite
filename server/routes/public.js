import crypto from 'node:crypto';
import express from 'express';
import QRCode from 'qrcode';
import { asyncHandler, HttpError, sendError, validate, clientIp } from '../lib/http.js';
import { hashIp, rateLimit, safeEqual, sha256 } from '../lib/security.js';
import { bookingSchema, contactUpdateSchema, manageTokenSchema } from '../lib/validation.js';
import { channelStatus } from '../lib/notifications.js';
import { nowIso } from '../lib/time.js';
import { subscriptionActive } from '../lib/billing.js';

/** Durée de validité du lien de gestion après la date du rendez-vous. */
const MANAGE_LINK_GRACE_DAYS = Number(process.env.MANAGE_LINK_GRACE_DAYS || 30);

/**
 * Vérifie la validité du jeton de gestion : bon jeton + lien non expiré.
 * Le jeton n'est jamais stocké en clair (seul son sha256 est en base).
 */
function checkManageToken(appointment, token) {
  if (!appointment || !token) return { ok: false, code: 'NOT_FOUND' };
  if (!safeEqual(sha256(token), appointment.manage_token_hash)) return { ok: false, code: 'NOT_FOUND' };
  const expiry = Date.parse(appointment.ends_at) + MANAGE_LINK_GRACE_DAYS * 86_400_000;
  if (Date.now() > expiry) return { ok: false, code: 'LINK_EXPIRED' };
  return { ok: true };
}
import { WILAYAS } from '../data/wilayas.js';
import {
  bookAppointment,
  cancelAppointment,
  getAvailability,
  getNextAvailability,
  rescheduleAppointment,
  serializeAppointment,
  audit,
} from '../services/scheduling.js';

/**
 * MODE TEST (application pas encore publiée) : on peut réserver chez TOUS les
 * dentistes, même ceux de l'annuaire, pour tester. Activé par défaut en mode
 * démonstration. Mettre TEST_ALL_BOOKABLE=0 dans .env avant la mise en ligne.
 */
const TEST_ALL_BOOKABLE = process.env.TEST_ALL_BOOKABLE
  ? process.env.TEST_ALL_BOOKABLE === '1'
  : process.env.DEMO_MODE !== '0';
const bookable = (p) => subscriptionActive(p) && (p.online_booking !== 0 || TEST_ALL_BOOKABLE);

/** Distance à vol d'oiseau (formule de haversine), en km. */
function distanceKm(lat1, lng1, lat2, lng2) {
  const r = (x) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Sérialisation publique : aucune donnée privée, aucun rendez-vous d'autrui. */
function publicPractice(p) {
  const wilaya = WILAYAS.find((w) => w.code === p.wilaya_code) || null;
  return {
    slug: p.slug,
    public_id: p.public_id,
    name_fr: p.name_fr,
    name_ar: p.name_ar,
    specialty_fr: p.specialty_fr,
    specialty_ar: p.specialty_ar,
    address_fr: p.address_fr,
    address_ar: p.address_ar,
    city_fr: p.city_fr,
    city_ar: p.city_ar,
    wilaya_code: p.wilaya_code,
    wilaya: wilaya ? { fr: wilaya.fr, ar: wilaya.ar } : null,
    phone: p.phone,
    online_booking: bookable(p),
    test_booking: p.online_booking === 0 && bookable(p),
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    languages: String(p.languages || 'fr,ar').split(',').filter(Boolean),
    timezone: p.timezone,
    slot_duration_min: p.slot_duration_min,
    min_lead_hours: p.min_lead_hours,
    horizon_days: p.horizon_days,
    auto_confirm: !!p.auto_confirm,
  };
}

export function publicRouter(db) {
  const router = express.Router();

  router.get('/practices', (req, res) => {
    const q = String(req.query.q || '').trim();
    const wilaya = req.query.wilaya ? Number(req.query.wilaya) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const rl = rateLimit(db, { bucket: 'search', key: clientIp(req), limit: 120, windowMinutes: 5 });
    if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de recherches. Merci de patienter.', { retryAfter: rl.retryAfter });

    const params = [nowIso()];
    // Un cabinet dont l'abonnement est terminé n'apparaît plus dans la recherche.
    let sql = 'SELECT * FROM practices WHERE is_listed = 1 AND (subscription_until IS NULL OR subscription_until >= ?)';
    if (wilaya) {
      sql += ' AND wilaya_code = ?';
      params.push(wilaya);
    }
    // Recherche sans accents ni majuscules : « bejaia » trouve « Béjaïa ».
    const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const nq = norm(q);
    const matches = (p) =>
      !nq || [p.name_fr, p.name_ar, p.city_fr, p.city_ar, p.wilaya_fr, p.wilaya_ar, p.specialty_fr, p.slug].some((f) => norm(f).includes(nq));
    // Recherche « près de moi » : lat/lng du patient → tri par distance.
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const near = req.query.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    let rows;
    if (near) {
      sql += ' AND latitude IS NOT NULL AND longitude IS NOT NULL';
      rows = db.prepare(sql).all(...params)
        .filter(matches)
        .map((p) => ({ p, d: distanceKm(lat, lng, p.latitude, p.longitude) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, limit);
    } else {
      // Les cabinets inscrits (réservation en ligne) d'abord.
      sql += ' ORDER BY online_booking DESC, name_fr COLLATE NOCASE ASC';
      rows = db.prepare(sql).all(...params).filter(matches).slice(0, limit).map((p) => ({ p, d: null }));
    }
    const results = rows.map(({ p, d }) => {
      const next = !bookable(p) ? null : getNextAvailability(db, p);
      return {
        ...publicPractice(p),
        distance_km: d === null ? null : Math.round(d * 10) / 10,
        next_availability: next ? { date: next.date, time: next.slot.time } : null,
      };
    });
    res.json({ results, total: results.length });
  });

  router.get('/wilayas', (req, res) => res.json({ wilayas: WILAYAS }));

  router.get('/meta', (req, res) => {
    res.json({
      timezone: 'Africa/Algiers',
      channels: channelStatus(),
      server_time: nowIso(),
    });
  });

  function findPractice(key) {
    const p = db.prepare('SELECT * FROM practices WHERE slug = ? OR public_id = ?').get(key, key);
    if (!p || !p.is_listed) return null;
    return p;
  }

  router.get(
    '/practices/:key',
    asyncHandler(async (req, res) => {
      const p = findPractice(req.params.key);
      if (!p) return sendError(res, 404, 'NOT_FOUND', 'Cabinet introuvable.');
      const hours = db.prepare('SELECT * FROM working_hours WHERE practice_id = ? ORDER BY weekday').all(p.id);
      const next = !bookable(p) ? null : getNextAvailability(db, p);
      res.json({
        practice: { ...publicPractice(p), hours },
        next_availability: next ? { date: next.date, time: next.slot.time, count: next.count } : null,
      });
    }),
  );

  router.get(
    '/practices/:key/availability',
    asyncHandler(async (req, res) => {
      const p = findPractice(req.params.key);
      if (!p) return sendError(res, 404, 'NOT_FOUND', 'Cabinet introuvable.');
      const rl = rateLimit(db, { bucket: 'availability', key: clientIp(req), limit: 200, windowMinutes: 5 });
      if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de requêtes.', { retryAfter: rl.retryAfter });
      const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 60);
      const from = req.query.from ? String(req.query.from) : undefined;
      if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return sendError(res, 400, 'BAD_DATE', 'Date invalide.');
      const daysOut = !bookable(p) ? [] : getAvailability(db, p, { fromDate: from, days });
      res.json({
        practice: publicPractice(p),
        days: daysOut,
        server_time: nowIso(),
      });
    }),
  );

  router.get(
    '/practices/:key/qr.png',
    asyncHandler(async (req, res) => {
      const p = db.prepare('SELECT * FROM practices WHERE slug = ? OR public_id = ?').get(req.params.key, req.params.key);
      if (!p) return sendError(res, 404, 'NOT_FOUND', 'Cabinet introuvable.');
      const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`;
      // Le QR ne contient QUE l'URL publique : aucune donnée patient, aucun motif.
      const url = `${base}/d/${p.slug}?src=qr`;
      const buf = await QRCode.toBuffer(url, { width: 512, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#12384a', light: '#ffffff' } });
      res.type('png').set('Cache-Control', 'public, max-age=3600').send(buf);
    }),
  );

  router.get('/practices/:key/qr.svg', asyncHandler(async (req, res) => {
    const p = db.prepare('SELECT * FROM practices WHERE slug = ? OR public_id = ?').get(req.params.key, req.params.key);
    if (!p) return sendError(res, 404, 'NOT_FOUND', 'Cabinet introuvable.');
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`;
    const svg = await QRCode.toString(`${base}/d/${p.slug}?src=qr`, { type: 'svg', width: 512, margin: 2, color: { dark: '#12384a', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  }));

  /* ------------------------------------------------------------- réservation */

  router.post(
    '/practices/:key/appointments',
    asyncHandler(async (req, res) => {
      const p = findPractice(req.params.key);
      if (!p) return sendError(res, 404, 'NOT_FOUND', 'Cabinet introuvable.');
      if (!bookable(p)) return sendError(res, 409, 'NOT_BOOKABLE', 'Ce dentiste ne prend pas encore de rendez-vous en ligne.');
      const ip = clientIp(req);
      const rlIp = rateLimit(db, { bucket: 'book-ip', key: ip, limit: 10, windowMinutes: 60 });
      if (!rlIp.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de demandes depuis cet appareil. Merci de réessayer plus tard.', { retryAfter: rlIp.retryAfter });
      const input = validate(bookingSchema, req.body || {});
      if (input.website) return sendError(res, 400, 'SPAM', 'Requête refusée.');
      const rlPhone = rateLimit(db, { bucket: 'book-phone', key: input.phone, limit: 5, windowMinutes: 60 });
      if (!rlPhone.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de demandes pour ce numéro. Merci de réessayer plus tard.', { retryAfter: rlPhone.retryAfter });

      const result = bookAppointment(db, { practice: p, input, source: 'online', ipHash: hashIp(ip) });
      const created = db.prepare('SELECT * FROM appointments WHERE id = ?').get(result.id);
      res.status(201).json({
        appointment: serializeAppointment(created, p, { includePrivate: true }),
        manage_token: result.manageToken,
        manage_url: `/r/${created.public_ref}?t=${result.manageToken}`,
        practice: publicPractice(p),
      });
    }),
  );

  /** Consultation d'une réservation via référence + jeton du lien sécurisé. */
  router.get(
    '/appointments/:ref',
    asyncHandler(async (req, res) => {
      const ip = clientIp(req);
      const rl = rateLimit(db, { bucket: 'lookup', key: ip, limit: 30, windowMinutes: 15 });
      if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de tentatives. Merci de patienter.', { retryAfter: rl.retryAfter });
      const ref = String(req.params.ref || '').toUpperCase();
      const a = db.prepare('SELECT * FROM appointments WHERE public_ref = ?').get(ref);
      const token = String(req.query.t || '');
      const check = checkManageToken(a, token);
      if (!check.ok) {
        return check.code === 'LINK_EXPIRED'
          ? sendError(res, 410, 'LINK_EXPIRED', 'Ce lien de gestion a expiré. Merci de contacter le cabinet.')
          : sendError(res, 404, 'NOT_FOUND', 'Réservation introuvable ou lien invalide.');
      }
      const p = db.prepare('SELECT * FROM practices WHERE id = ?').get(a.practice_id);
      res.json({ appointment: serializeAppointment(a, p, { includePrivate: true }), practice: publicPractice(p) });
    }),
  );

  router.post(
    '/appointments/:ref/contact',
    asyncHandler(async (req, res) => {
      const ip = clientIp(req);
      const rl = rateLimit(db, { bucket: 'manage', key: ip, limit: 20, windowMinutes: 15 });
      if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de tentatives.', { retryAfter: rl.retryAfter });
      const ref = String(req.params.ref || '').toUpperCase();
      const input = validate(contactUpdateSchema, req.body || {});
      const a = db.prepare('SELECT * FROM appointments WHERE public_ref = ?').get(ref);
      const check = checkManageToken(a, input.token);
      if (!check.ok) {
        return check.code === 'LINK_EXPIRED'
          ? sendError(res, 410, 'LINK_EXPIRED', 'Ce lien de gestion a expiré. Merci de contacter le cabinet.')
          : sendError(res, 404, 'NOT_FOUND', 'Réservation introuvable ou lien invalide.');
      }
      if (['cancelled', 'completed', 'no_show'].includes(a.status)) {
        return sendError(res, 409, 'NOT_EDITABLE', 'Ce rendez-vous ne peut plus être modifié.');
      }
      db.prepare(
        'UPDATE appointments SET patient_first_name = ?, patient_last_name = ?, patient_phone = ?, patient_email = ?, updated_at = ? WHERE id = ?',
      ).run(input.first_name, input.last_name, input.phone, input.email, nowIso(), a.id);
      audit(db, {
        practiceId: a.practice_id,
        actorLabel: 'patient (lien de gestion)',
        action: 'appointment.contact_update',
        entityType: 'appointment',
        entityId: a.id,
        ipHash: hashIp(ip),
      });
      res.json({ ok: true });
    }),
  );

  router.post(
    '/appointments/:ref/cancel',
    asyncHandler(async (req, res) => {
      const ip = clientIp(req);
      const rl = rateLimit(db, { bucket: 'manage', key: ip, limit: 20, windowMinutes: 15 });
      if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de tentatives.', { retryAfter: rl.retryAfter });
      const ref = String(req.params.ref || '').toUpperCase();
      const { token } = validate(manageTokenSchema, req.body || {});
      const a = db.prepare('SELECT * FROM appointments WHERE public_ref = ?').get(ref);
      const check = checkManageToken(a, token);
      if (!check.ok) {
        return check.code === 'LINK_EXPIRED'
          ? sendError(res, 410, 'LINK_EXPIRED', 'Ce lien de gestion a expiré. Merci de contacter le cabinet.')
          : sendError(res, 404, 'NOT_FOUND', 'Réservation introuvable ou lien invalide.');
      }
      const p = db.prepare('SELECT * FROM practices WHERE id = ?').get(a.practice_id);
      if (['cancelled', 'completed', 'no_show'].includes(a.status)) {
        return sendError(res, 409, 'NOT_CANCELLABLE', 'Ce rendez-vous ne peut plus être annulé.');
      }
      if (Date.parse(a.starts_at) < Date.now() - 3_600_000) {
        return sendError(res, 409, 'TOO_LATE', 'Ce rendez-vous est déjà passé. Merci de contacter le cabinet.');
      }
      await cancelAppointment(db, {
        practice: p,
        appointment: a,
        by: 'patient',
        ipHash: hashIp(ip),
      });
      res.json({ ok: true });
    }),
  );

  router.post(
    '/appointments/:ref/reschedule',
    asyncHandler(async (req, res) => {
      const ip = clientIp(req);
      const rl = rateLimit(db, { bucket: 'manage', key: ip, limit: 20, windowMinutes: 15 });
      if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de tentatives.', { retryAfter: rl.retryAfter });
      const ref = String(req.params.ref || '').toUpperCase();
      const token = String(req.body?.token || '');
      const startsAt = req.body?.starts_at;
      if (!startsAt || Number.isNaN(Date.parse(startsAt))) return sendError(res, 422, 'VALIDATION', 'Créneau invalide.');
      const a = db.prepare('SELECT * FROM appointments WHERE public_ref = ?').get(ref);
      const check = checkManageToken(a, token);
      if (!check.ok) {
        return check.code === 'LINK_EXPIRED'
          ? sendError(res, 410, 'LINK_EXPIRED', 'Ce lien de gestion a expiré. Merci de contacter le cabinet.')
          : sendError(res, 404, 'NOT_FOUND', 'Réservation introuvable ou lien invalide.');
      }
      const p = db.prepare('SELECT * FROM practices WHERE id = ?').get(a.practice_id);
      if (['cancelled', 'completed', 'no_show'].includes(a.status)) {
        return sendError(res, 409, 'NOT_RESCHEDULABLE', 'Ce rendez-vous ne peut plus être déplacé.');
      }
      rescheduleAppointment(db, { practice: p, appointment: a, newStartIso: new Date(startsAt).toISOString(), source: 'patient', ipHash: hashIp(ip) });
      const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(a.id);
      res.json({ appointment: serializeAppointment(updated, p, { includePrivate: true }) });
    }),
  );

  /* ---------------------------------------- export / suppression (RGPD-like) */

  router.post(
    '/appointments/:ref/data-request',
    asyncHandler(async (req, res) => {
      const ref = String(req.params.ref || '').toUpperCase();
      const kind = req.body?.kind;
      const token = String(req.body?.token || '');
      if (!['export', 'deletion'].includes(kind)) return sendError(res, 422, 'VALIDATION', 'Type de demande invalide.');
      const a = db.prepare('SELECT * FROM appointments WHERE public_ref = ?').get(ref);
      const check = checkManageToken(a, token);
      if (!check.ok) {
        return check.code === 'LINK_EXPIRED'
          ? sendError(res, 410, 'LINK_EXPIRED', 'Ce lien de gestion a expiré. Merci de contacter le cabinet.')
          : sendError(res, 404, 'NOT_FOUND', 'Réservation introuvable ou lien invalide.');
      }
      const p = db.prepare('SELECT * FROM practices WHERE id = ?').get(a.practice_id);
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO data_requests (id, practice_id, appointment_id, kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, a.practice_id, a.id, kind, 'pending', nowIso(),
      );
      audit(db, {
        practiceId: a.practice_id,
        actorLabel: 'patient (lien de gestion)',
        action: `data.${kind}_requested`,
        entityType: 'appointment',
        entityId: a.id,
      });
      if (kind === 'export') {
        // Export immédiat des seules données détenues sur ce rendez-vous.
        return res.json({
          ok: true,
          export: {
            reference: a.public_ref,
            practice: { name: p.name_fr, phone: p.phone, address: p.address_fr },
            patient: {
              first_name: a.patient_first_name,
              last_name: a.patient_last_name,
              phone: a.patient_phone,
              email: a.patient_email,
            },
            appointment: {
              starts_at: a.starts_at,
              ends_at: a.ends_at,
              status: a.status,
              reason_code: a.reason_code,
              free_text: a.free_text,
              created_at: a.created_at,
            },
            note: 'Export des données liées à cette réservation uniquement.',
          },
        });
      }
      // Suppression : anonymisation immédiate des données patient du RDV.
      db.prepare(
        `UPDATE appointments SET patient_first_name = 'Supprimé', patient_last_name = 'Supprimé',
           patient_phone = 'supprimé', patient_email = NULL, free_text = NULL, updated_at = ?
         WHERE id = ?`,
      ).run(nowIso(), a.id);
      db.prepare('UPDATE data_requests SET status = ?, done_at = ? WHERE id = ?').run('done', nowIso(), id);
      res.json({ ok: true, message: 'Les données personnelles de ce rendez-vous ont été anonymisées.' });
    }),
  );

  return router;
}
