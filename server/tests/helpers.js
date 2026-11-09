import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import supertest from 'supertest';
import { openDatabase } from '../db/index.js';
import { createApp } from '../app.js';
import { hashPassword, publicId, randomToken, sha256 } from '../lib/security.js';
import { addDaysToDateStr, toIso, utcToZoned } from '../lib/time.js';
import { defaultHours } from '../services/scheduling.js';

export const TZ = 'Africa/Algiers';
export const DEMO_PASSWORD = 'TestPass2026!';

export function tempDbFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mawid-test-'));
  return path.join(dir, 'test.db');
}

/** "HH:MM" local -> ISO UTC pour un décalage en jours. */
export function at(dayOffset, hhmm) {
  const today = utcToZoned(new Date(), TZ).dateStr;
  const dateStr = addDaysToDateStr(today, dayOffset);
  return localIso(dateStr, hhmm);
}

export function localIso(dateStr, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, m);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(naive))
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  const delta = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  return toIso(new Date(naive - delta));
}

export function localDate(dayOffset) {
  const today = utcToZoned(new Date(), TZ).dateStr;
  return addDaysToDateStr(today, dayOffset);
}

export function seedPractice(db, { id = 'p1', slug = 'cabinet-test', name = 'Cabinet Test', autoConfirm = 1 } = {}) {
  const ts = toIso(new Date());
  db.prepare(
    `INSERT INTO practices (id, slug, public_id, name_fr, name_ar, specialty_fr, specialty_ar, address_fr, city_fr,
       wilaya_code, wilaya_fr, wilaya_ar, phone, languages, timezone, slot_duration_min, min_lead_hours, horizon_days,
       auto_confirm, is_listed, reminder_enabled, reminder_hours_before, notify_channel, retention_days, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, slug, publicId(), name, 'عيادة تجريبية', 'Chirurgien-dentiste', 'طبيب أسنان', '1 rue du Test', 'Alger',
    16, 'Alger', 'الجزائر', '+213551000000', 'fr,ar', TZ, 30, 0, 60, autoConfirm, 1, 1, 24, 'email', 365, ts, ts,
  );
  for (const h of defaultHours()) {
    // Ouvert tous les jours dans les tests pour éviter les effets de bord du vendredi.
    db.prepare(
      'INSERT INTO working_hours (id, practice_id, weekday, is_open, open_minute, close_minute, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(crypto.randomUUID(), id, h.weekday, 1, 9 * 60, 17 * 60, null, null);
  }
  return db.prepare('SELECT * FROM practices WHERE id = ?').get(id);
}

export async function seedUser(db, practiceId, { email = 'owner@test.dz', role = 'owner', id = null } = {}) {
  const uid = id || crypto.randomUUID();
  db.prepare('INSERT INTO users (id, practice_id, email, password_hash, full_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    uid, practiceId, email, await hashPassword(DEMO_PASSWORD), role === 'owner' ? 'Dr Test' : 'Secrétaire Test', role, toIso(new Date()),
  );
  return uid;
}

export function makeApp(file) {
  const db = openDatabase(file);
  const app = createApp(db);
  const agent = supertest.agent(app);
  return { db, app, agent };
}

export async function login(agent, email, password = DEMO_PASSWORD) {
  const res = await agent.post('/api/auth/login').send({ email, password });
  return res;
}

/** Crée un rendez-vous via l'API publique et renvoie le corps JSON. */
export async function book(agent, slug, payload) {
  return agent.post(`/api/public/practices/${slug}/appointments`).send(payload);
}

export const baseBooking = (startsAt, overrides = {}) => ({
  starts_at: startsAt,
  first_name: 'Yacine',
  last_name: 'Test',
  phone: '0551112233',
  reason_code: 'checkup',
  patient_language: 'fr',
  notify_consent: false,
  privacy_consent: true,
  ...overrides,
});

export function manageToken(a) {
  return a;
}
