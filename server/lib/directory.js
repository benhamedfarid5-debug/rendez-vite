import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nowIso } from './time.js';
import { defaultHours } from '../services/scheduling.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'annuaire-bejaia.json');

/**
 * Annuaire : dentistes publics (OpenStreetMap, licence ODbL) qui ne sont PAS
 * encore inscrits sur Mawid. Ils apparaissent sur la carte (appel / itinéraire)
 * mais on ne peut pas réserver chez eux (online_booking = 0).
 * Idempotent : un dentiste déjà importé (même osm_id) n'est pas recréé.
 */
export function importDirectory(db) {
  if (!fs.existsSync(FILE)) return 0;
  const { dentists, wilaya_code } = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const exists = db.prepare('SELECT 1 FROM practices WHERE osm_id = ?');
  const insert = db.prepare(
    `INSERT INTO practices (id, slug, public_id, name_fr, name_ar, address_fr, address_ar, city_fr, city_ar,
       wilaya_code, wilaya_fr, wilaya_ar, latitude, longitude, phone, online_booking, osm_id, is_listed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Béjaïa', 'بجاية', ?, ?, ?, 0, ?, 1, ?, ?)`,
  );
  let n = 0;
  const ts = nowIso();
  for (const d of dentists) {
    if (exists.get(d.osm_id)) continue;
    insert.run(
      crypto.randomUUID(), d.slug, crypto.randomBytes(9).toString('base64url'), d.name_fr, d.name_ar || null,
      d.address_fr || null, d.address_ar || null, d.city_fr || null, d.city_ar || null, wilaya_code,
      d.latitude, d.longitude, d.phone || null, d.osm_id, ts, ts,
    );
    n++;
  }
  // Horaires par défaut (dim–jeu + sam 9h–17h) pour les dentistes de l'annuaire sans horaires.
  const noHours = db.prepare(
    'SELECT id FROM practices WHERE osm_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM working_hours w WHERE w.practice_id = practices.id)',
  ).all();
  const addHour = db.prepare(
    'INSERT INTO working_hours (id, practice_id, weekday, is_open, open_minute, close_minute, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const { id } of noHours) {
    for (const h of defaultHours()) addHour.run(crypto.randomUUID(), id, h.weekday, h.is_open, h.open_minute, h.close_minute, h.break_start, h.break_end);
  }
  return n;
}
