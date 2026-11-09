#!/usr/bin/env node
import 'dotenv/config';
import { openDatabase } from '../db/index.js';

/**
 * Applique le schéma (idempotent) sur la base configurée.
 * Les migrations sont additives : server/db/schema.sql contient des
 * CREATE ... IF NOT EXISTS exécutés à chaque ouverture de la base.
 */
const file = process.env.DATABASE_FILE || 'data/mawid.db';
const db = openDatabase(file);
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);
console.log(`Base : ${file}`);
console.log(`Schéma à jour. Tables : ${tables.join(', ')}`);
db.close();
