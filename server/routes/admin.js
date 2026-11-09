import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { asyncHandler, clearCookie, clientIp, sendError, setCookie, validate } from '../lib/http.js';
import { rateLimit, safeEqual, sha256 } from '../lib/security.js';
import { nowIso } from '../lib/time.js';
import { PLANS, newActivationCode, subscriptionStatus } from '../lib/billing.js';
import { invoicePdf } from '../lib/invoices.js';

/**
 * Espace administrateur de Rendez-Vite (le propriétaire de l'application).
 * Identifiants dans .env : ADMIN_EMAIL et ADMIN_PASSWORD.
 * En démonstration seulement, des identifiants par défaut sont proposés.
 */
const ADMIN_COOKIE = 'rv_admin';
const TTL_HOURS = 12;
const DEMO_ADMIN = { email: 'admin@rendez-vite.dz', password: 'Admin2026!rv' };

function credentials() {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    return { email: process.env.ADMIN_EMAIL.toLowerCase(), password: process.env.ADMIN_PASSWORD };
  }
  return process.env.DEMO_MODE !== '0' ? DEMO_ADMIN : null;
}

const loginSchema = z.object({ email: z.string().trim().toLowerCase().max(120), password: z.string().max(200) });
const codeSchema = z.object({ plan: z.enum(['month', 'semester', 'year']), note: z.string().trim().max(120).optional().or(z.literal('')) });

export function adminRouter(db) {
  const router = express.Router();

  const isAdmin = (req) => {
    const token = req.cookies?.[ADMIN_COOKIE];
    if (!token) return false;
    const row = db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').get(sha256(token));
    return Boolean(row && row.expires_at > nowIso());
  };
  const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : sendError(res, 401, 'UNAUTHENTICATED', 'Connexion administrateur requise.'));

  router.get('/me', (req, res) => res.json({ admin: isAdmin(req), demo: process.env.DEMO_MODE !== '0' && !process.env.ADMIN_PASSWORD ? DEMO_ADMIN.email : null }));

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const rl = rateLimit(db, { bucket: 'admin-login', key: clientIp(req), limit: 5, windowMinutes: 15 });
      if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop de tentatives. Merci de patienter.', { retryAfter: rl.retryAfter });
      const creds = credentials();
      if (!creds) return sendError(res, 503, 'ADMIN_DISABLED', 'Espace administrateur non configuré.');
      const input = validate(loginSchema, req.body || {});
      if (!(safeEqual(input.email, creds.email) && safeEqual(input.password, creds.password))) {
        return sendError(res, 401, 'BAD_CREDENTIALS', 'E-mail ou mot de passe incorrect.');
      }
      const token = crypto.randomBytes(32).toString('base64url');
      const expires = new Date(Date.now() + TTL_HOURS * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(nowIso());
      db.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)').run(sha256(token), nowIso(), expires);
      setCookie(res, ADMIN_COOKIE, token, {
        maxAge: TTL_HOURS * 3600,
        secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1',
      });
      res.json({ ok: true });
    }),
  );

  router.post('/logout', (req, res) => {
    const token = req.cookies?.[ADMIN_COOKIE];
    if (token) db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token));
    clearCookie(res, ADMIN_COOKIE);
    res.json({ ok: true });
  });

  /** Vue d'ensemble : cabinets inscrits et leur abonnement. */
  router.get('/overview', requireAdmin, (req, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, u.full_name AS owner_name, u.email AS owner_email
         FROM practices p JOIN users u ON u.practice_id = p.id AND u.role = 'owner'
         GROUP BY p.id ORDER BY p.created_at DESC`,
      )
      .all();
    const practices = rows.map((p) => ({
      id: p.id,
      name: p.name_fr,
      city: p.city_fr,
      phone: p.phone,
      owner_name: p.owner_name,
      owner_email: p.owner_email,
      created_at: p.created_at,
      subscription: subscriptionStatus(p),
    }));
    const revenue = db.prepare("SELECT COALESCE(SUM(amount_da), 0) AS total FROM payments WHERE status = 'paid'").get().total;
    res.json({ practices, revenue_da: revenue, plans: Object.values(PLANS) });
  });

  router.get('/invoices', requireAdmin, (req, res) => {
    const invoices = db
      .prepare('SELECT id, number, issued_at, plan, method, amount_da, buyer_name, buyer_practice, buyer_email, email_status FROM invoices ORDER BY issued_at DESC LIMIT 300')
      .all();
    res.json({ invoices });
  });

  router.get(
    '/invoices/:id.pdf',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
      if (!inv) return sendError(res, 404, 'NOT_FOUND', 'Facture introuvable.');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Facture-${inv.number}.pdf"`);
      res.send(await invoicePdf(inv));
    }),
  );

  router.get('/codes', requireAdmin, (req, res) => {
    const codes = db
      .prepare(
        `SELECT c.*, p.name_fr AS practice_name FROM activation_codes c
         LEFT JOIN practices p ON p.id = c.practice_id ORDER BY c.created_at DESC LIMIT 200`,
      )
      .all();
    res.json({ codes });
  });

  /** Crée un code d'activation à donner au médecin après son paiement par téléphone. */
  router.post('/codes', requireAdmin, (req, res) => {
    const input = validate(codeSchema, req.body || {});
    let code;
    for (let i = 0; i < 5; i++) {
      code = newActivationCode();
      if (!db.prepare('SELECT 1 FROM activation_codes WHERE code = ?').get(code)) break;
    }
    db.prepare('INSERT INTO activation_codes (code, plan, note, created_at) VALUES (?, ?, ?, ?)').run(code, input.plan, input.note || null, nowIso());
    res.status(201).json({ code, plan: input.plan });
  });

  return router;
}
