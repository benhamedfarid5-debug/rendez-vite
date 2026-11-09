#!/usr/bin/env node
/**
 * Exécute une requête SQL **en lecture seule** sur la base locale.
 *
 *   npm run db:sql -- "SELECT status, COUNT(*) n FROM appointments GROUP BY status"
 *   npm run db:sql -- "SELECT public_ref, starts_at, status FROM appointments LIMIT 5"
 *
 * Seules les requêtes SELECT / WITH / PRAGMA / EXPLAIN sont acceptées :
 * aucune écriture n'est possible depuis cette commande.
 */
import 'dotenv/config';
import { openDatabase } from '../db/index.js';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Usage : npm run db:sql -- "SELECT …"');
  process.exit(1);
}
if (!/^(select|with|pragma|explain)\b/i.test(query)) {
  console.error('Refusé : seules les requêtes en lecture (SELECT / WITH / PRAGMA / EXPLAIN) sont autorisées.');
  process.exit(1);
}

const db = openDatabase(process.env.DATABASE_FILE || 'data/mawid.db');
try {
  const rows = db.prepare(query).all();
  if (!rows.length) {
    console.log('(aucune ligne)');
  } else {
    console.table(rows);
  }
  console.log(`\n${rows.length} ligne(s).`);
} catch (err) {
  console.error('Erreur SQL :', err.message);
  process.exitCode = 1;
} finally {
  db.close();
}
