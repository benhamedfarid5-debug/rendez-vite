import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from './sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Ouvre la base SQLite et applique le schéma (idempotent).
 * SQLite est utilisé pour la démo locale : fichiers, transactions ACID,
 * verrouillage avec BEGIN IMMEDIATE et index uniques partiels — suffisant pour
 * garantir l'absence de double réservation sans dépendance externe.
 */
export function openDatabase(filename = process.env.DATABASE_FILE || 'data/mawid.db') {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  migrate(db);
  return db;
}

/** Ajoute les colonnes récentes aux bases créées avec une ancienne version. */
function migrate(db) {
  const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!ucols.includes('honor_declared_at')) db.exec('ALTER TABLE users ADD COLUMN honor_declared_at TEXT');
  if (!ucols.includes('honor_text')) db.exec('ALTER TABLE users ADD COLUMN honor_text TEXT');
  const cols = db.prepare('PRAGMA table_info(practices)').all().map((c) => c.name);
  if (!cols.includes('latitude')) db.exec('ALTER TABLE practices ADD COLUMN latitude REAL');
  if (!cols.includes('longitude')) db.exec('ALTER TABLE practices ADD COLUMN longitude REAL');
  if (!cols.includes('online_booking')) db.exec('ALTER TABLE practices ADD COLUMN online_booking INTEGER NOT NULL DEFAULT 1');
  if (!cols.includes('osm_id')) db.exec('ALTER TABLE practices ADD COLUMN osm_id TEXT');
  if (!cols.includes('subscription_plan')) db.exec('ALTER TABLE practices ADD COLUMN subscription_plan TEXT');
  if (!cols.includes('subscription_until')) db.exec('ALTER TABLE practices ADD COLUMN subscription_until TEXT');
  if (!cols.includes('latitude')) {
    // Positions des cabinets de démonstration (bases créées avant la carte).
    const set = db.prepare('UPDATE practices SET latitude = ?, longitude = ? WHERE id = ? AND latitude IS NULL');
    set.run(36.7428, 3.03, 'practice-yasmine');
    set.run(35.6969, -0.6331, 'practice-nour');
    set.run(36.365, 6.6147, 'practice-constantine');
  }
}

let singleton = null;
export function getDb() {
  if (!singleton) singleton = openDatabase();
  return singleton;
}
