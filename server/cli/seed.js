#!/usr/bin/env node
import 'dotenv/config';
import crypto from 'node:crypto';
import { openDatabase } from '../db/index.js';
import { hashPassword, publicId, publicRef, randomToken, sha256 } from '../lib/security.js';
import { addDaysToDateStr, nowIso, toIso, utcToZoned } from '../lib/time.js';
import { findWilaya } from '../data/wilayas.js';
import { defaultHours } from '../services/scheduling.js';

/**
 * Données de démonstration 100 % fictives.
 * - Aucune donnée réelle de patient.
 * - Aucun secret : le mot de passe de démo est public et affiché au lancement.
 */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo2026!dent';
const TZ = 'Africa/Algiers';

const force = process.argv.includes('--force');
const db = openDatabase(process.env.DATABASE_FILE || 'data/mawid.db');

const existing = db.prepare('SELECT COUNT(*) AS c FROM practices').get().c;
if (existing > 0 && !force) {
  console.log('Données déjà présentes — rien à faire. Utilisez « npm run db:reset » pour réinitialiser.');
  db.close();
  process.exit(0);
}

if (force) {
  const tables = ['invoices', 'payments', 'activation_codes', 'admin_sessions', 'data_requests', 'audit_log', 'rate_events', 'notifications', 'appointments', 'calendar_exceptions', 'working_hours', 'sessions', 'users', 'practices'];
  db.pragma('foreign_keys = OFF');
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  db.pragma('foreign_keys = ON');
}

/** Date locale -> instant UTC ("HH:MM" local, jour offset). */
function at(dayOffset, hhmm) {
  const today = utcToZoned(new Date(), TZ).dateStr;
  const dateStr = addDaysToDateStr(today, dayOffset);
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

const practices = [
  {
    id: 'practice-yasmine',
    slug: 'cabinet-el-yasmine',
    public_id: publicId(),
    name_fr: 'Cabinet dentaire El Yasmine',
    name_ar: 'عيادة الياسمين لطب الأسنان',
    specialty_fr: 'Chirurgien-dentiste — omnipratique',
    specialty_ar: 'طبيب أسنان عام',
    address_fr: '12 rue des Frères Bouadou, Hydra',
    address_ar: '12 شارع الإخوة بوعدو، حيدرة',
    city_fr: 'Hydra, Alger',
    city_ar: 'حيدرة، الجزائر',
    wilaya_code: 16,
    latitude: 36.7428, longitude: 3.0300,
    phone: '+213551234567',
    languages: 'fr,ar',
    slot_duration_min: 30,
    min_lead_hours: 2,
    horizon_days: 60,
    auto_confirm: 1,
    is_listed: 1,
    reminder_enabled: 1,
    reminder_hours_before: 24,
    notify_channel: 'email',
  },
  {
    id: 'practice-nour',
    slug: 'cabinet-dr-nour',
    public_id: publicId(),
    name_fr: 'Cabinet du Dr Nour',
    name_ar: 'عيادة الدكتور نور',
    specialty_fr: 'Orthodontie',
    specialty_ar: 'تقويم الأسنان',
    address_fr: '5 boulevard de la Soummam',
    address_ar: '5 شارع الصومام',
    city_fr: 'Oran',
    city_ar: 'وهران',
    wilaya_code: 31,
    latitude: 35.6969, longitude: -0.6331,
    phone: '+213661998877',
    languages: 'fr,ar',
    slot_duration_min: 30,
    min_lead_hours: 4,
    horizon_days: 45,
    auto_confirm: 0,
    is_listed: 1,
    reminder_enabled: 1,
    reminder_hours_before: 24,
    notify_channel: 'sms',
  },
  {
    id: 'practice-constantine',
    slug: 'cabinet-sourire-constantine',
    public_id: publicId(),
    name_fr: 'Cabinet Le Sourire — Constantine',
    name_ar: 'عيادة الابتسامة — قسنطينة',
    specialty_fr: 'Chirurgien-dentiste',
    specialty_ar: 'طبيب أسنان',
    address_fr: '22 rue Larbi Ben M’hidi',
    address_ar: '22 شارع العربي بن مهيدي',
    city_fr: 'Constantine',
    city_ar: 'قسنطينة',
    wilaya_code: 25,
    latitude: 36.3650, longitude: 6.6147,
    phone: '+213770112233',
    languages: 'ar,fr',
    slot_duration_min: 20,
    min_lead_hours: 1,
    horizon_days: 30,
    auto_confirm: 1,
    is_listed: 1,
    reminder_enabled: 0,
    reminder_hours_before: 24,
    notify_channel: 'email',
  },
];

const ts = nowIso();
const insertPractice = db.prepare(
  `INSERT INTO practices (id, slug, public_id, name_fr, name_ar, specialty_fr, specialty_ar, address_fr, address_ar, city_fr, city_ar,
     wilaya_code, wilaya_fr, wilaya_ar, latitude, longitude, phone, languages, timezone, slot_duration_min, min_lead_hours, horizon_days, auto_confirm,
     is_listed, reminder_enabled, reminder_hours_before, notify_channel, retention_days, created_at, updated_at)
   VALUES (@id, @slug, @public_id, @name_fr, @name_ar, @specialty_fr, @specialty_ar, @address_fr, @address_ar, @city_fr, @city_ar,
     @wilaya_code, @wilaya_fr, @wilaya_ar, @latitude, @longitude, @phone, @languages, @timezone, @slot_duration_min, @min_lead_hours, @horizon_days, @auto_confirm,
     @is_listed, @reminder_enabled, @reminder_hours_before, @notify_channel, 365, @created_at, @updated_at)`,
);

for (const p of practices) {
  const w = findWilaya(p.wilaya_code);
  insertPractice.run({ ...p, timezone: TZ, wilaya_fr: w.fr, wilaya_ar: w.ar, created_at: ts, updated_at: ts });
}

const hours = defaultHours();
for (const p of practices) {
  for (const h of hours) {
    // Le cabinet de Constantine travaille le vendredi et ferme le samedi.
    let row = h;
    if (p.id === 'practice-constantine') {
      if (h.weekday === 5) row = { ...h, is_open: 1, open_minute: 9 * 60, close_minute: 14 * 60, break_start: null, break_end: null };
      if (h.weekday === 6) row = { ...h, is_open: 0 };
    }
    db.prepare(
      `INSERT INTO working_hours (id, practice_id, weekday, is_open, open_minute, close_minute, break_start, break_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), p.id, row.weekday, row.is_open, row.open_minute, row.close_minute, row.break_start, row.break_end);
  }
}

const users = [
  ['user-dentist', 'practice-yasmine', 'dentiste@demo.dz', 'Dr Amina Belkacem', 'owner'],
  ['user-secretary', 'practice-yasmine', 'secretaire@demo.dz', 'Samira Haddad', 'secretary'],
  ['user-nour', 'practice-nour', 'dentiste.nour@demo.dz', 'Dr Yacine Nour', 'owner'],
  ['user-constantine', 'practice-constantine', 'dentiste.constantine@demo.dz', 'Dr Leïla Kaci', 'owner'],
];

const hash = await hashPassword(DEMO_PASSWORD);
for (const [id, practiceId, email, name, role] of users) {
  db.prepare('INSERT INTO users (id, practice_id, email, password_hash, full_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, practiceId, email, hash, name, role, ts,
  );
}

/* ------------------------------------------------------------- rendez-vous */
const insertAppt = db.prepare(
  `INSERT INTO appointments (id, practice_id, public_ref, manage_token_hash, patient_first_name, patient_last_name, patient_phone,
     patient_email, reason_code, free_text, free_text_lang, patient_language, starts_at, ends_at, status, source, notify_consent,
     privacy_consent_at, created_at, updated_at, cancelled_at, cancelled_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const demoPatients = [
  ['Yasmine', 'Cherif', '+213555112233', 'yasmine.cherif@example.dz'],
  ['Mohamed', 'Amrani', '+213661223344', null],
  ['Sarah', 'Benmoussa', '+213770334455', 'sarah.b@example.dz'],
  ['Karim', 'Zerrouki', '+213551445566', null],
  ['Nadia', 'Saidi', '+213660556677', 'nadia.saidi@example.dz'],
  ['Bilal', 'Hadj', '+213771667788', null],
  ['Imane', 'Taleb', '+213552778899', 'imane.taleb@example.dz'],
  ['Rachid', 'Mokrani', '+213663889900', null],
];

// Les rendez-vous du jour sont placés relativement à l'heure courante afin que
// la démonstration reste cohérente quelle que soit l'heure de lancement.
const nowMin = utcToZoned(new Date(), TZ).minutesOfDay;
// Alignement sur la grille de 30 minutes et maintien dans les horaires
// d'ouverture (09:00 – 17:00) pour que la démo reste crédible à toute heure.
const past = Math.min(Math.max(9 * 60, Math.floor((nowMin - 90) / 30) * 30), 13 * 60);
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const todayTimes = [
  hm(past),
  hm(past + 30),
  hm(past + 60),
  hm(Math.min(past + 120, 16 * 60)),
  hm(Math.min(past + 150, 16 * 60 + 60)),
  hm(Math.min(past + 180, 16 * 60 + 60)),
];

const demoAppointments = [
  // Jour J
  { d: 0, t: todayTimes[0], status: 'completed', reason: 'checkup', p: 0 },
  { d: 0, t: todayTimes[1], status: 'completed', reason: 'cleaning', p: 1 },
  { d: 0, t: todayTimes[2], status: 'confirmed', reason: 'pain', p: 2, free: 'قالت إن الألم يزيد ليلاً', lang: 'ar' },
  { d: 0, t: todayTimes[3], status: 'requested', reason: 'consultation', p: 3 },
  { d: 0, t: todayTimes[4], status: 'confirmed', reason: 'checkup', p: 4 },
  { d: 0, t: todayTimes[5], status: 'cancelled', reason: 'checkup', p: 6 },
  // Demain
  { d: 1, t: '09:00', status: 'confirmed', reason: 'checkup', p: 7 },
  { d: 1, t: '10:00', status: 'requested', reason: 'cleaning', p: 0 },
  { d: 1, t: '11:00', status: 'confirmed', reason: 'consultation', p: 1 },
  { d: 1, t: '14:30', status: 'confirmed', reason: 'pain', p: 2 },
  // Semaine
  { d: 2, t: '09:30', status: 'confirmed', reason: 'checkup', p: 3 },
  { d: 2, t: '15:30', status: 'requested', reason: 'cleaning', p: 4 },
  { d: 3, t: '10:00', status: 'confirmed', reason: 'consultation', p: 5 },
  { d: 4, t: '11:00', status: 'confirmed', reason: 'checkup', p: 6 },
  { d: 7, t: '09:00', status: 'confirmed', reason: 'cleaning', p: 7 },
  { d: 8, t: '10:30', status: 'requested', reason: 'checkup', p: 0 },
  { d: 9, t: '14:00', status: 'confirmed', reason: 'consultation', p: 1 },
];

const createdIds = [];
for (const [i, a] of demoAppointments.entries()) {
  const patient = demoPatients[a.p];
  const start = at(a.d, a.t);
  const end = toIso(new Date(Date.parse(start) + 30 * 60_000));
  const id = crypto.randomUUID();
  createdIds.push(id);
  const token = randomToken(24);
  insertAppt.run(
    id,
    'practice-yasmine',
    publicRef(),
    sha256(token),
    patient[0],
    patient[1],
    patient[2],
    patient[3],
    a.reason,
    a.free || null,
    a.free ? a.lang || 'fr' : null,
    a.lang || 'fr',
    start,
    end,
    a.status,
    i % 3 === 0 ? 'staff' : 'online',
    a.status === 'requested' || a.status === 'confirmed' ? 1 : 0,
    ts,
    ts,
    ts,
    a.status === 'cancelled' ? ts : null,
    a.status === 'cancelled' ? 'patient' : null,
  );
}
// Une réservation de démonstration gérée par le patient (lien affiché dans le README).
const demoManageToken = 'demo-manage-token-000000000000';
db.prepare(
  `INSERT INTO appointments (id, practice_id, public_ref, manage_token_hash, patient_first_name, patient_last_name, patient_phone,
     patient_email, reason_code, free_text, patient_language, starts_at, ends_at, status, source, notify_consent, privacy_consent_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(
  crypto.randomUUID(), 'practice-yasmine', 'MW-DEMO01', sha256(demoManageToken), 'Yacine', 'Boudiaf', '+213555998877', 'yacine.boudiaf@example.dz',
  'checkup', null, 'fr', at(5, '10:00'), toIso(new Date(Date.parse(at(5, '10:00')) + 30 * 60_000)), 'confirmed', 'online', 1, ts, ts, ts,
);
console.log(`Lien de gestion patient de démo : /r/MW-DEMO01?t=${demoManageToken}`);

// Autres cabinets : quelques rendez-vous pour tester l'isolation multi-tenant.
for (const [idx, pid] of ['practice-nour', 'practice-constantine'].entries()) {
  for (let k = 0; k < 3; k += 1) {
    const start = at(k + 1, `${9 + k}:00`);
    const end = toIso(new Date(Date.parse(start) + 30 * 60_000));
    db.prepare(
      `INSERT INTO appointments (id, practice_id, public_ref, manage_token_hash, patient_first_name, patient_last_name, patient_phone,
         patient_email, reason_code, patient_language, starts_at, ends_at, status, source, notify_consent, privacy_consent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(), pid, publicRef(), sha256(randomToken(16)), `Patient${idx}${k}`, 'Fictif', '+213555000111', null,
      ['checkup', 'cleaning', 'consultation'][k], k === 0 ? 'ar' : 'fr', start, end, 'confirmed', 'staff', 0, ts, ts, ts,
    );
  }
}

/* ---------------------------------------------------- absences / blocages */
const exceptions = [
  {
    id: crypto.randomUUID(),
    practice: 'practice-yasmine',
    kind: 'emergency',
    start: at(0, '14:00'),
    end: at(0, '14:30'),
    note: 'Urgence : intervention imprévue',
  },
  {
    id: crypto.randomUUID(),
    practice: 'practice-yasmine',
    kind: 'absence',
    start: at(10, '09:00'),
    end: at(11, '17:00'),
    note: 'Congé (à confirmer)',
  },
  {
    id: crypto.randomUUID(),
    practice: 'practice-yasmine',
    kind: 'closure',
    start: at(21, '08:00'),
    end: at(21, '18:00'),
    note: 'Fermeture technique du cabinet',
  },
];
for (const e of exceptions) {
  db.prepare(
    'INSERT INTO calendar_exceptions (id, practice_id, kind, starts_at, ends_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(e.id, e.practice, e.kind, e.start, e.end, e.note, 'user-dentist', ts);
}

/* ------------------------------------------------------- notifications */
const notifRows = [
  ['practice-yasmine', 'booking_confirmation', 'email', 'simulated', 'yasmine.cherif@example.dz', 'Mode démonstration : aucun envoi réel.'],
  ['practice-yasmine', 'reminder', 'email', 'simulated', 'sarah.b@example.dz', 'Mode démonstration : aucun envoi réel.'],
  ['practice-yasmine', 'cancellation', 'email', 'simulated', 'imane.taleb@example.dz', 'Mode démonstration : aucun envoi réel.'],
];
for (const [pid, template, channel, status, recipient, detail] of notifRows) {
  db.prepare(
    'INSERT INTO notifications (id, practice_id, appointment_id, channel, template, recipient, status, provider, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(crypto.randomUUID(), pid, null, channel, template, recipient, status, 'demo', detail, ts);
}

/* --------------------------------------------------------------- audit */
const auditRows = [
  ['practice-yasmine', 'user-secretary', 'Samira Haddad (secretary)', 'appointment.status', 'appointment', createdIds[3], { from: 'requested', to: 'confirmed' }],
  ['practice-yasmine', 'user-dentist', 'Dr Amina Belkacem (owner)', 'exception.create', 'calendar_exception', exceptions[0].id, { kind: 'emergency' }],
  ['practice-yasmine', 'user-dentist', 'Dr Amina Belkacem (owner)', 'hours.update', 'working_hours', null, null],
];
for (const [pid, uid, label, action, etype, eid, meta] of auditRows) {
  db.prepare(
    'INSERT INTO audit_log (id, practice_id, actor_user_id, actor_label, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(crypto.randomUUID(), pid, uid, label, action, etype, eid, meta ? JSON.stringify(meta) : null, ts);
}

db.close();

console.log('\n✅ Données de démonstration créées.');
console.log('   Cabinets : cabinet-el-yasmine (Alger), cabinet-dr-nour (Oran), cabinet-sourire-constantine (Constantine)');
console.log('   Comptes (mot de passe identique, fictif) :');
console.log(`     • dentiste@demo.dz        — propriétaire (El Yasmine)`);
console.log(`     • secretaire@demo.dz      — secrétaire (El Yasmine)`);
console.log(`     • dentiste.nour@demo.dz   — propriétaire (cabinet Dr Nour, autre tenant)`);
console.log(`     Mot de passe : ${DEMO_PASSWORD}`);
