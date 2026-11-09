#!/usr/bin/env node
import 'dotenv/config';
import { openDatabase } from '../db/index.js';
import { nowIso, toIso } from '../lib/time.js';

/**
 * Purge manuelle de conservation des données.
 * Anonymise les rendez-vous terminés ou annulés plus anciens que la durée de
 * conservation configurée par cabinet (practices.retention_days).
 * Les lignes restent (statistiques) mais les données personnelles disparaissent.
 *
 * À planifier (cron) uniquement après validation de la politique de conservation.
 */
const db = openDatabase(process.env.DATABASE_FILE || 'data/mawid.db');
const practices = db.prepare('SELECT id, retention_days FROM practices').all();
let total = 0;

for (const p of practices) {
  const cutoff = toIso(new Date(Date.now() - p.retention_days * 86_400_000));
  const rows = db
    .prepare(
      `SELECT id FROM appointments
       WHERE practice_id = ? AND starts_at < ? AND status IN ('completed','cancelled','no_show')
         AND patient_phone != 'supprimé'`,
    )
    .all(p.id, cutoff);
  const tx = db.transaction(() => {
    for (const r of rows) {
      db.prepare(
        `UPDATE appointments SET patient_first_name = 'Supprimé', patient_last_name = 'Supprimé',
           patient_phone = 'supprimé', patient_email = NULL, free_text = NULL, notify_consent = 0, updated_at = ?
         WHERE id = ?`,
      ).run(nowIso(), r.id);
    }
  });
  tx();
  total += rows.length;
  if (rows.length) console.log(`Cabinet ${p.id} : ${rows.length} rendez-vous anonymisé(s).`);
}

if (!total) console.log('Aucune donnée à purger selon les durées de conservation configurées.');
db.close();
