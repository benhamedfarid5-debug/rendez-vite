import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { asyncHandler, clientIp, sendError, validate } from '../lib/http.js';
import { rateLimit } from '../lib/security.js';
import { nowIso } from '../lib/time.js';
import { audit } from '../services/scheduling.js';
import { requireOwner } from './auth.js';
import {
  PAYMENT_METHODS,
  PAY_PHONE,
  PLANS,
  normalizeCode,
  TRIAL_DAYS,
  chargilyConfigured,
  createChargilyCheckout,
  markPaid,
  subscriptionStatus,
  verifyChargilySignature,
} from '../lib/billing.js';
import { invoicePdf } from '../lib/invoices.js';

const checkoutSchema = z.object({
  plan: z.enum(['month', 'semester', 'year']),
  method: z.enum(PAYMENT_METHODS),
  lang: z.enum(['fr', 'ar']).optional(),
});

const baseUrl = (req) => process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`;
const demo = () => process.env.DEMO_MODE !== '0';

/** Espace cabinet : abonnement et paiements. */
export function billingRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const p = db.prepare('SELECT * FROM practices WHERE id = ?').get(req.practice.id);
    const payments = db
      .prepare(
        `SELECT pa.id, pa.plan, pa.amount_da, pa.method, pa.status, pa.created_at, pa.paid_at, i.id AS invoice_id, i.number AS invoice_number
         FROM payments pa LEFT JOIN invoices i ON i.payment_id = pa.id
         WHERE pa.practice_id = ? ORDER BY pa.created_at DESC LIMIT 20`,
      )
      .all(p.id);
    res.json({
      subscription: subscriptionStatus(p),
      plans: Object.values(PLANS),
      trial_days: TRIAL_DAYS,
      methods: PAYMENT_METHODS,
      test_mode: !chargilyConfigured(),
      pay_phone: PAY_PHONE(),
      payments,
    });
  });

  router.post(
    '/checkout',
    requireOwner,
    asyncHandler(async (req, res) => {
      const input = validate(checkoutSchema, req.body || {});
      const plan = PLANS[input.plan];
      const payment = {
        id: crypto.randomUUID(),
        practice_id: req.practice.id,
        plan: plan.id,
        amount_da: plan.amount,
        method: input.method,
      };
      db.prepare(
        "INSERT INTO payments (id, practice_id, plan, amount_da, method, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
      ).run(payment.id, payment.practice_id, payment.plan, payment.amount_da, payment.method, nowIso());
      audit(db, {
        practiceId: req.practice.id,
        actorUserId: req.auth.id,
        actorLabel: `${req.auth.full_name} (owner)`,
        action: 'billing.checkout',
        entityType: 'payment',
        entityId: payment.id,
        metadata: { plan: plan.id, amount_da: plan.amount, method: input.method },
      });

      if (chargilyConfigured()) {
        try {
          const { checkoutUrl, providerRef } = await createChargilyCheckout({ payment, method: input.method, baseUrl: baseUrl(req), lang: input.lang });
          db.prepare('UPDATE payments SET provider_ref = ? WHERE id = ?').run(providerRef, payment.id);
          return res.json({ checkout_url: checkoutUrl, payment_id: payment.id });
        } catch {
          db.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(payment.id);
          return sendError(res, 502, 'PAYMENT_PROVIDER', 'Le service de paiement ne répond pas. Merci de réessayer.');
        }
      }
      if (!demo()) return sendError(res, 503, 'PAYMENT_NOT_CONFIGURED', 'Le paiement en ligne n’est pas encore activé.');
      // Démonstration : page de paiement simulée dans l'application.
      return res.json({ checkout_url: `/staff/abonnement/test?p=${payment.id}`, payment_id: payment.id, test_mode: true });
    }),
  );

  /** Télécharger une facture du cabinet (PDF). */
  router.get(
    '/invoices/:id.pdf',
    requireOwner,
    asyncHandler(async (req, res) => {
      const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND practice_id = ?').get(req.params.id, req.practice.id);
      if (!inv) return sendError(res, 404, 'NOT_FOUND', 'Facture introuvable.');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Facture-${inv.number}.pdf"`);
      res.send(await invoicePdf(inv));
    }),
  );

  /** Paiement par téléphone : le médecin saisit le code reçu. */
  router.post('/redeem', requireOwner, (req, res) => {
    const rl = rateLimit(db, { bucket: 'redeem', key: `${req.practice.id}:${clientIp(req)}`, limit: 10, windowMinutes: 30 });
    if (!rl.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Trop d’essais. Merci de patienter.', { retryAfter: rl.retryAfter });
    const raw = normalizeCode(req.body?.code);
    if (raw.length !== 8) return sendError(res, 400, 'CODE_INVALID', 'Code invalide.', { fields: { code: 'Code invalide.' } });
    const code = `RV-${raw.slice(0, 4)}-${raw.slice(4)}`;
    const row = db.prepare('SELECT * FROM activation_codes WHERE code = ?').get(code);
    if (!row) return sendError(res, 404, 'CODE_INVALID', 'Code invalide.', { fields: { code: 'Code invalide.' } });
    if (row.used_at) return sendError(res, 409, 'CODE_USED', 'Ce code a déjà été utilisé.', { fields: { code: 'Ce code a déjà été utilisé.' } });
    const plan = PLANS[row.plan];
    const paymentId = crypto.randomUUID();
    const ts = nowIso();
    // Le code ne sert qu'une fois, même en cas de double clic.
    const claimed = db.prepare('UPDATE activation_codes SET used_at = ?, practice_id = ? WHERE code = ? AND used_at IS NULL').run(ts, req.practice.id, code);
    if (!claimed.changes) return sendError(res, 409, 'CODE_USED', 'Ce code a déjà été utilisé.', { fields: { code: 'Ce code a déjà été utilisé.' } });
    db.prepare(
      "INSERT INTO payments (id, practice_id, plan, amount_da, method, status, provider_ref, created_at) VALUES (?, ?, ?, ?, 'phone', 'pending', ?, ?)",
    ).run(paymentId, req.practice.id, plan.id, plan.amount, code, ts);
    markPaid(db, paymentId, code);
    audit(db, {
      practiceId: req.practice.id,
      actorUserId: req.auth.id,
      actorLabel: `${req.auth.full_name} (owner)`,
      action: 'billing.redeem_code',
      entityType: 'payment',
      entityId: paymentId,
      metadata: { plan: plan.id },
    });
    res.json({ ok: true, plan: plan.id });
  });

  /** Démonstration uniquement : simule le résultat du paiement. */
  router.post('/test/:id/:result', requireOwner, (req, res) => {
    if (chargilyConfigured() || !demo()) return sendError(res, 404, 'NOT_FOUND', 'Indisponible.');
    const pay = db.prepare('SELECT * FROM payments WHERE id = ? AND practice_id = ?').get(req.params.id, req.practice.id);
    if (!pay) return sendError(res, 404, 'NOT_FOUND', 'Paiement introuvable.');
    if (pay.status !== 'pending') return res.json({ ok: true, status: pay.status });
    if (req.params.result === 'paid') {
      markPaid(db, pay.id, 'test');
      return res.json({ ok: true, status: 'paid' });
    }
    db.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(pay.id);
    return res.json({ ok: true, status: 'failed' });
  });

  return router;
}

/** Webhook Chargily (corps brut, signature HMAC). */
export function chargilyWebhook(db) {
  return (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyChargilySignature(raw, req.headers.signature)) return res.status(403).end();
    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).end();
    }
    const paymentId = event?.data?.metadata?.payment_id;
    const pay = paymentId ? db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) : null;
    if (pay) {
      if (event.type === 'checkout.paid') {
        // Le montant payé doit correspondre à la formule.
        if (Number(event.data.amount) >= pay.amount_da) markPaid(db, pay.id, event.data.id || null);
      } else if (event.type === 'checkout.failed' || event.type === 'checkout.canceled') {
        db.prepare("UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'pending'").run(pay.id);
      }
    }
    res.status(200).end();
  };
}
