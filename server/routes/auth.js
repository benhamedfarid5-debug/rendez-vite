import crypto from 'node:crypto';
import express from 'express';
import { asyncHandler, clientIp, clearCookie, sendError, setCookie, validate } from '../lib/http.js';
import { SESSION_COOKIE, SESSION_TTL_HOURS, hashIp, hashPassword, publicId, rateLimit, sha256, verifyPassword } from '../lib/security.js';
import { loginSchema, registerSchema } from '../lib/validation.js';
import { findWilaya } from '../data/wilayas.js';
import { defaultHours } from '../services/scheduling.js';
import { startTrial } from '../lib/billing.js';
import { nowIso } from '../lib/time.js';
import { audit } from '../services/scheduling.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

/** Texte exact de la déclaration sur l'honneur (conservé avec le compte, comme preuve). */
export const HONOR_TEXT_FR =
  "Je déclare sur l'honneur être médecin ou chirurgien-dentiste diplômé, légalement autorisé à exercer en Algérie et assermenté. Je suis seul responsable de mon activité médicale, des soins et des informations publiées pour mon cabinet.";

export function authRouter(db) {
  const router = express.Router();

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const ip = clientIp(req);
      const rlIp = rateLimit(db, { bucket: 'login-ip', key: ip, limit: 10, windowMinutes: 15 });
      if (!rlIp.allowed) {
        return sendError(res, 429, 'RATE_LIMIT', 'Trop de tentatives de connexion. Merci de patienter.', { retryAfter: rlIp.retryAfter });
      }
      const { email, password } = validate(loginSchema, req.body || {});
      const rlEmail = rateLimit(db, { bucket: 'login-email', key: email, limit: 10, windowMinutes: 15 });
      if (!rlEmail.allowed) {
        return sendError(res, 429, 'RATE_LIMIT', 'Trop de tentatives. Merci de patienter.', { retryAfter: rlEmail.retryAfter });
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      // Message identique quel que soit le motif : pas d'énumération de comptes.
      const genericFailure = () => sendError(res, 401, 'BAD_CREDENTIALS', 'Identifiants incorrects.');
      if (!user || !user.is_active) {
        // Coût de calcul constant pour limiter les attaques par timing.
        await verifyPassword(password, '$2a$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxyz012345');
        return genericFailure();
      }
      if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
        return sendError(res, 423, 'ACCOUNT_LOCKED', 'Compte temporairement verrouillé. Merci de réessayer plus tard.', {
          retryAfter: Math.ceil((Date.parse(user.locked_until) - Date.now()) / 1000),
        });
      }
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        const attempts = user.failed_attempts + 1;
        const lockUntil = attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
        db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockUntil, user.id);
        return genericFailure();
      }

      db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(nowIso(), user.id);

      // Limite de sessions actives par utilisateur (évite l'accumulation).
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').run(user.id, nowIso());
      const active = db.prepare('SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
      for (const s of active.slice(9)) db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id);

      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      db.prepare(
        'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(crypto.randomUUID(), user.id, sha256(token), nowIso(), expiresAt, nowIso(), hashIp(ip), String(req.headers['user-agent'] || '').slice(0, 150));

      setCookie(res, SESSION_COOKIE, token, {
        maxAge: SESSION_TTL_HOURS * 3600,
        secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1',
      });

      const practice = db.prepare('SELECT * FROM practices WHERE id = ?').get(user.practice_id);
      audit(db, {
        practiceId: user.practice_id,
        actorUserId: user.id,
        actorLabel: `${user.full_name} (${user.role})`,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        ipHash: hashIp(ip),
      });

      res.json({
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
        practice: { id: practice.id, slug: practice.slug, name_fr: practice.name_fr, name_ar: practice.name_ar },
        expires_at: expiresAt,
        // Jeton de repli, à conserver EN MÉMOIRE uniquement : utilisé quand les
        // cookies sont indisponibles (aperçu en iframe sandboxée, cookies tiers
        // bloqués). Le cookie HttpOnly reste le mécanisme principal.
        session_token: token,
      });
    }),
  );

  /* ------------------------------------------------------ inscription cabinet */

  /** Dentistes de l'annuaire pas encore inscrits (pour « Je suis déjà sur la carte »). */
  router.get('/directory', (req, res) => {
    const rows = db
      .prepare(
        `SELECT slug, name_fr, name_ar, city_fr, city_ar FROM practices p
         WHERE osm_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.practice_id = p.id)
         ORDER BY city_fr COLLATE NOCASE, name_fr COLLATE NOCASE`,
      )
      .all();
    res.json({ dentists: rows });
  });

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const ip = clientIp(req);
      const rl = rateLimit(db, { bucket: 'register-ip', key: ip, limit: 5, windowMinutes: 60 });
      if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de tentatives. Merci de patienter.', { retryAfter: rl.retryAfter });
      const input = validate(registerSchema, req.body || {});
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(input.email)) {
        return sendError(res, 409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet e-mail.', { fields: { email: 'Un compte existe déjà avec cet e-mail.' } });
      }
      const ts = nowIso();
      const hash = await hashPassword(input.password);
      let practiceId;
      if (input.claim_slug) {
        const p = db.prepare('SELECT * FROM practices WHERE slug = ? AND osm_id IS NOT NULL').get(input.claim_slug);
        if (!p) return sendError(res, 404, 'NOT_FOUND', 'Cabinet introuvable.');
        if (db.prepare('SELECT 1 FROM users WHERE practice_id = ?').get(p.id)) {
          return sendError(res, 409, 'ALREADY_CLAIMED', 'Ce cabinet a déjà un compte.');
        }
        practiceId = p.id;
        db.prepare('UPDATE practices SET online_booking = 1, phone = COALESCE(?, phone), updated_at = ? WHERE id = ?').run(input.phone || null, ts, p.id);
      } else {
        practiceId = crypto.randomUUID();
        const w = findWilaya(input.wilaya_code ?? null);
        const base = input.practice_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cabinet';
        let slug = base;
        for (let i = 2; db.prepare('SELECT 1 FROM practices WHERE slug = ?').get(slug); i++) slug = `${base}-${i}`;
        db.prepare(
          `INSERT INTO practices (id, slug, public_id, name_fr, address_fr, city_fr, wilaya_code, wilaya_fr, wilaya_ar, phone, online_booking, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(practiceId, slug, publicId(), input.practice_name, input.address || null, input.city || null, w?.code ?? null, w?.fr ?? null, w?.ar ?? null, input.phone || null, ts, ts);
      }
      if (!db.prepare('SELECT 1 FROM working_hours WHERE practice_id = ?').get(practiceId)) {
        const add = db.prepare('INSERT INTO working_hours (id, practice_id, weekday, is_open, open_minute, close_minute, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const h of defaultHours()) add.run(crypto.randomUUID(), practiceId, h.weekday, h.is_open, h.open_minute, h.close_minute, h.break_start, h.break_end);
      }
      startTrial(db, practiceId); // 1er mois gratuit
      const userId = crypto.randomUUID();
      db.prepare(
        'INSERT INTO users (id, practice_id, email, password_hash, full_name, role, honor_declared_at, honor_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(userId, practiceId, input.email, hash, input.full_name, 'owner', ts, HONOR_TEXT_FR, ts);
      audit(db, { practiceId, actorUserId: userId, actorLabel: `${input.full_name} (owner)`, action: 'auth.register_honor_declaration', entityType: 'user', entityId: userId, ipHash: hashIp(ip) });
      res.status(201).json({ ok: true });
    }),
  );

  router.post('/logout', (req, res) => {
    const token = sessionTokenFrom(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    clearCookie(res, SESSION_COOKIE);
    res.json({ ok: true });
  });

  /**
   * Sonde de session : renvoie 200 avec user = null lorsqu'il n'y a pas de
   * session. Évite les erreurs 401 dans la console du navigateur au chargement.
   */
  router.get('/session', (req, res) => {
    if (!req.auth) return res.json({ user: null, practice: null, permissions: null });
    const p = req.practice;
    return res.json({
      user: { id: req.auth.id, email: req.auth.email, full_name: req.auth.full_name, role: req.auth.role },
      practice: { id: p.id, slug: p.slug, name_fr: p.name_fr, name_ar: p.name_ar, timezone: p.timezone },
      permissions: permissionsFor(req.auth.role),
    });
  });

  router.get('/me', (req, res) => {
    if (!req.auth) return sendError(res, 401, 'UNAUTHENTICATED', 'Session expirée.');
    const p = req.practice;
    res.json({
      user: { id: req.auth.id, email: req.auth.email, full_name: req.auth.full_name, role: req.auth.role },
      practice: { id: p.id, slug: p.slug, name_fr: p.name_fr, name_ar: p.name_ar, timezone: p.timezone },
      permissions: permissionsFor(req.auth.role),
    });
  });

  return router;
}

export function permissionsFor(role) {
  const owner = role === 'owner';
  return {
    manageAppointments: true,
    manageSchedule: owner,
    manageProfile: owner,
    manageTeam: owner,
    manageNotifications: owner,
    viewAudit: true,
    manageDataRequests: owner,
  };
}

/** Résout la session si elle existe (sans bloquer). */
/** Extrait le jeton de session : cookie HttpOnly en priorité, sinon Bearer. */
export function sessionTokenFrom(req) {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const header = req.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

export function resolveSession(db) {
  return (req, _res, next) => {
    const token = sessionTokenFrom(req);
    if (!token) return next();
    const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token));
    if (!session) return next();
    if (Date.parse(session.expires_at) < Date.now()) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
      return next();
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
    if (!user || !user.is_active) return next();
    const practice = db.prepare('SELECT * FROM practices WHERE id = ?').get(user.practice_id);
    if (!practice) return next();
    req.auth = user;
    req.practice = practice;
    req.session = session;
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), session.id);
    return next();
  };
}

/** Middleware d'authentification : session valide + cabinet résolu. */
export function requireAuth(db) {
  const resolve = resolveSession(db);
  return (req, res, next) => {
    if (!sessionTokenFrom(req)) return sendError(res, 401, 'UNAUTHENTICATED', 'Connexion requise.');
    resolve(req, res, () => {
      if (!req.auth) return sendError(res, 401, 'UNAUTHENTICATED', 'Session invalide ou expirée.');
      next();
    });
  };
}

export function requireOwner(req, res, next) {
  if (!req.auth || req.auth.role !== 'owner') {
    return sendError(res, 403, 'FORBIDDEN', 'Action réservée au propriétaire du compte.');
  }
  next();
}
