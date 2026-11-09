import 'dotenv/config';
import { createApp } from './app.js';
import { getDb } from './db/index.js';
import { importDirectory } from './lib/directory.js';
import { sweepReminders } from './lib/notifications.js';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

const db = getDb();
const added = importDirectory(db);
if (added) console.log(`Annuaire : ${added} dentiste(s) de Béjaïa ajouté(s).`);
const app = createApp(db);

const server = app.listen(PORT, HOST, () => {
  const demo = process.env.DEMO_MODE !== '0';
  console.log(`Rendez-Vite — serveur prêt sur http://localhost:${PORT}`);
  if (demo) console.log('Mode démonstration : notifications simulées, aucune clé externe requise.');
});

// Balayage des rappels toutes les 5 minutes (simulation en local).
const reminderTimer = setInterval(() => {
  sweepReminders(db).catch((err) => console.error('[reminders]', err.message));
}, 5 * 60_000);
reminderTimer.unref?.();

function shutdown(signal) {
  console.log(`\n[${signal}] arrêt en cours…`);
  clearInterval(reminderTimer);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* déjà fermé */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
