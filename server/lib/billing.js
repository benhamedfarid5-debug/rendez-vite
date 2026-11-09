import crypto from 'node:crypto';
import { nowIso } from './time.js';
import { createInvoice, sendInvoiceEmail } from './invoices.js';

/**
 * Abonnements des cabinets.
 * - 1er mois gratuit à l'inscription (essai).
 * - Formules payantes (DA) : 1 mois, 6 mois, 1 an (la meilleure affaire).
 * - Paiement Edahabia / CIB via Chargily Pay. Sans clé Chargily (démo), un
 *   paiement de test est simulé dans l'application.
 * Un cabinet inscrit dont l'abonnement est terminé n'apparaît plus aux patients.
 */
export const TRIAL_DAYS = 30;

export const PLANS = {
  month: { id: 'month', months: 1, amount: 2000 },
  semester: { id: 'semester', months: 6, amount: 6000 },
  year: { id: 'year', months: 12, amount: 10000 },
};

export const PAYMENT_METHODS = ['edahabia', 'cib'];

/** Numéro à appeler pour payer autrement (option discrète) : un code d'activation est remis après paiement. */
export const PAY_PHONE = () => process.env.PAY_PHONE || '0561 70 55 12';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I/L

/** Code d'activation lisible au téléphone : RV-XXXX-XXXX. */
export function newActivationCode() {
  const bytes = crypto.randomBytes(8);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `RV-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^RV/, '');

const CHARGILY_BASE = () => process.env.CHARGILY_API_BASE || 'https://pay.chargily.net/test/api/v2';
export const chargilyConfigured = () => Boolean(process.env.CHARGILY_SECRET_KEY);

/** Date ISO + n jours. */
export function addDays(iso, days) {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Date ISO + n mois (même jour du mois, borné). */
export function addMonths(iso, months) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Abonnement actif ? (null = sans limite : comptes de démonstration, annuaire). */
export function subscriptionActive(p, now = nowIso()) {
  return !p.subscription_until || p.subscription_until >= now;
}

export function subscriptionStatus(p, now = nowIso()) {
  if (!p.subscription_until) return { state: 'unlimited', until: null, days_left: null, plan: p.subscription_plan || null };
  const daysLeft = Math.ceil((new Date(p.subscription_until).getTime() - new Date(now).getTime()) / 86400000);
  const state = daysLeft < 0 ? 'expired' : p.subscription_plan === 'trial' ? 'trial' : 'active';
  return { state, until: p.subscription_until, days_left: Math.max(daysLeft, 0), plan: p.subscription_plan || null };
}

/** Démarre l'essai gratuit d'un cabinet qui vient de s'inscrire. */
export function startTrial(db, practiceId) {
  const ts = nowIso();
  db.prepare("UPDATE practices SET subscription_plan = 'trial', subscription_until = ?, updated_at = ? WHERE id = ?").run(
    addDays(ts, TRIAL_DAYS),
    ts,
    practiceId,
  );
}

/** Paiement confirmé : prolonge l'abonnement (à partir de la fin actuelle si elle est future). Idempotent. */
export function markPaid(db, paymentId, providerRef = null) {
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!pay || pay.status === 'paid') return pay;
  const plan = PLANS[pay.plan];
  const p = db.prepare('SELECT * FROM practices WHERE id = ?').get(pay.practice_id);
  const ts = nowIso();
  const start = p.subscription_until && p.subscription_until > ts ? p.subscription_until : ts;
  const until = addMonths(start, plan.months);
  db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'paid', paid_at = ?, provider_ref = COALESCE(?, provider_ref) WHERE id = ?").run(ts, providerRef, pay.id);
    db.prepare('UPDATE practices SET subscription_plan = ?, subscription_until = ?, online_booking = 1, updated_at = ? WHERE id = ?').run(
      pay.plan,
      until,
      ts,
      pay.practice_id,
    );
  }).immediate();
  // Facture automatique, envoyée par e-mail au médecin (jamais bloquant).
  const inv = createInvoice(db, { paymentId: pay.id, periodStart: start, periodEnd: until });
  sendInvoiceEmail(db, inv).catch(() => {});
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(pay.id);
}

/** Crée un paiement Chargily (Edahabia / CIB). Retourne l'adresse de la page de paiement. */
export async function createChargilyCheckout({ payment, method, baseUrl, lang }) {
  const res = await fetch(`${CHARGILY_BASE()}/checkouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CHARGILY_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: payment.amount_da,
      currency: 'dzd',
      payment_method: method,
      success_url: `${baseUrl}/staff/abonnement?paiement=ok`,
      failure_url: `${baseUrl}/staff/abonnement?paiement=echec`,
      webhook_endpoint: `${baseUrl}/api/billing/webhook`,
      description: `Rendez-Vite — abonnement ${payment.plan}`,
      locale: lang === 'ar' ? 'ar' : 'fr',
      metadata: { payment_id: payment.id },
    }),
  });
  if (!res.ok) throw new Error(`CHARGILY_HTTP_${res.status}`);
  const data = await res.json();
  return { checkoutUrl: data.checkout_url, providerRef: data.id };
}

/** Signature Chargily : HMAC-SHA256 du corps brut avec la clé secrète. */
export function verifyChargilySignature(rawBody, signature) {
  const secret = process.env.CHARGILY_SECRET_KEY;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
