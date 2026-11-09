import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { nowIso } from './time.js';

export const SESSION_COOKIE = 'mawid_session';
export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT || 'demo-salt-change-me';
  return sha256(`${salt}:${ip || 'unknown'}`).slice(0, 32);
}

/** Code de confirmation lisible : MW-XXXXXX (sans caractères ambigus). */
export function publicRef() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `MW-${out}`;
}

export function publicId() {
  return crypto.randomBytes(9).toString('base64url');
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/** Comparaison à temps constant (évite les fuites par timing). */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Multiplicateur appliqué aux limites de débit. En démonstration, plusieurs
 * visiteurs peuvent partager la même IP (proxy) : on tolère davantage de
 * requêtes. En production (DEMO_MODE=0), le multiplicateur vaut 1.
 */
export const RATE_LIMIT_FACTOR = process.env.DEMO_MODE === '0' ? 1 : Number(process.env.RATE_LIMIT_FACTOR || 3);

/**
 * Limitation de débit persistante : fenêtre glissante stockée en base.
 * Fonctionne aussi après un redémarrage (contrairement à un compteur mémoire).
 */
export function rateLimit(db, { bucket, key, limit, windowMinutes, now = new Date() }) {
  limit = Math.max(1, Math.round(limit * RATE_LIMIT_FACTOR));
  const keyHash = sha256(key);
  const since = new Date(now.getTime() - windowMinutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  db.prepare('DELETE FROM rate_events WHERE created_at < ?').run(
    new Date(now.getTime() - 7 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  );
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM rate_events WHERE bucket = ? AND key_hash = ? AND created_at >= ?')
    .get(bucket, keyHash, since);
  if (row.c >= limit) {
    const oldest = db
      .prepare('SELECT created_at FROM rate_events WHERE bucket = ? AND key_hash = ? AND created_at >= ? ORDER BY created_at ASC LIMIT 1')
      .get(bucket, keyHash, since);
    const retryAfter = oldest
      ? Math.max(1, Math.ceil((Date.parse(oldest.created_at) + windowMinutes * 60_000 - now.getTime()) / 1000))
      : windowMinutes * 60;
    return { allowed: false, retryAfter };
  }
  db.prepare('INSERT INTO rate_events (bucket, key_hash, created_at) VALUES (?, ?, ?)').run(bucket, keyHash, nowIso());
  return { allowed: true };
}

export function clearRateEvents(db, bucket, key) {
  db.prepare('DELETE FROM rate_events WHERE bucket = ? AND key_hash = ?').run(bucket, sha256(key));
}
