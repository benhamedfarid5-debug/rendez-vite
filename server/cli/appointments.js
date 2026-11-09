#!/usr/bin/env node
/**
 * Affiche la table des rendez-vous (lecture seule).
 *
 * Exemples :
 *   npm run db:appointments
 *   npm run db:appointments -- --all
 *   npm run db:appointments -- --date 2026-11-01
 *   npm run db:appointments -- --status requested
 *   npm run db:appointments -- --practice cabinet-el-yasmine
 *   npm run db:appointments -- --patient Yasmine
 */
import 'dotenv/config';
import { openDatabase } from '../db/index.js';
import { addDaysToDateStr, utcToZoned } from '../lib/time.js';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(`--${name}`);

const TZ = 'Africa/Algiers';
const db = openDatabase(process.env.DATABASE_FILE || 'data/mawid.db');

const today = utcToZoned(new Date(), TZ).dateStr;
const dateFilter = getArg('date');
const statusFilter = getArg('status');
const practiceFilter = getArg('practice');
const patientFilter = getArg('patient');
const showAll = has('all');

let sql = `SELECT a.*, p.slug AS practice_slug, p.name_fr AS practice_name
           FROM appointments a JOIN practices p ON p.id = a.practice_id WHERE 1 = 1`;
const params = [];

if (practiceFilter) {
  sql += ' AND p.slug = ?';
  params.push(practiceFilter);
}
if (statusFilter) {
  sql += ' AND a.status = ?';
  params.push(statusFilter);
}
if (patientFilter) {
  sql += ' AND (a.patient_first_name LIKE ? OR a.patient_last_name LIKE ?)';
  params.push(`%${patientFilter}%`, `%${patientFilter}%`);
}
if (!showAll) {
  const from = dateFilter || today;
  const to = dateFilter ? dateFilter : addDaysToDateStr(today, 30);
  // Bornes calculées en heure locale du cabinet, puis comparées en UTC
  const startIso = localToIso(from, '00:00');
  const endIso = localToIso(addDaysToDateStr(to, 1), '00:00');
  sql += ' AND a.starts_at >= ? AND a.starts_at < ?';
  params.push(startIso, endIso);
}
sql += ' ORDER BY a.starts_at ASC';

const rows = db.prepare(sql).all(...params);

const pad = (v, n) => String(v ?? '').padEnd(n).slice(0, n);
const padS = (v, n) => String(v ?? '').padStart(n).slice(-n);

function localToIso(dateStr, time) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(naive))
    .find((p) => p.type === 'offset' || p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  const delta = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  return new Date(naive - delta).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const period = showAll
  ? 'tous les rendez-vous'
  : `${dateFilter || today} → ${dateFilter || addDaysToDateStr(today, 30)}`;
console.log(`\n🗓  Table « appointments » — ${rows.length} ligne(s) · période : ${period} · fuseau : ${TZ}\n`);

if (!rows.length) {
  console.log('   (aucun rendez-vous pour ce filtre)\n');
  db.close();
  process.exit(0);
}

const header =
  pad('#', 3) +
  ' ' +
  pad('DATE', 12) +
  pad('HEURE', 13) +
  pad('PATIENT', 24) +
  pad('TÉLÉPHONE', 16) +
  pad('MOTIF', 16) +
  pad('STATUT', 12) +
  pad('SRC', 8) +
  pad('RÉFÉRENCE', 11) +
  'CABINET';
console.log(header);
console.log('-'.repeat(header.length + 12));

rows.forEach((r, i) => {
  const s = utcToZoned(r.starts_at, TZ);
  const e = utcToZoned(r.ends_at, TZ);
  console.log(
    padS(i + 1, 3) +
      ' ' +
      pad(s.dateStr, 12) +
      pad(`${s.timeStr}-${e.timeStr}`, 13) +
      pad(`${r.patient_first_name} ${r.patient_last_name}`, 24) +
      pad(r.patient_phone, 16) +
      pad(r.reason_code, 16) +
      pad(r.status, 12) +
      pad(r.source, 8) +
      pad(r.public_ref, 11) +
      r.practice_slug,
  );
});

const counts = rows.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] || 0) + 1;
  return acc;
}, {});
console.log('-'.repeat(header.length + 12));
console.log('Statuts :', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
console.log(`Total : ${rows.length} rendez-vous\n`);
console.log('ℹ️  Colonnes complètes d’une ligne :');
const sample = rows[0];
console.log(
  JSON.stringify(
    {
      id: sample.id,
      practice_id: sample.practice_id,
      public_ref: sample.public_ref,
      patient: `${sample.patient_first_name} ${sample.patient_last_name}`,
      patient_phone: sample.patient_phone,
      patient_email: sample.patient_email,
      reason_code: sample.reason_code,
      free_text: sample.free_text,
      free_text_lang: sample.free_text_lang,
      patient_language: sample.patient_language,
      starts_at_utc: sample.starts_at,
      ends_at_utc: sample.ends_at,
      status: sample.status,
      source: sample.source,
      notify_consent: sample.notify_consent,
      created_at: sample.created_at,
      updated_at: sample.updated_at,
      manage_token_hash: `${String(sample.manage_token_hash).slice(0, 12)}… (haché, jamais le jeton)`,
    },
    null,
    2,
  ),
);
console.log();
db.close();
