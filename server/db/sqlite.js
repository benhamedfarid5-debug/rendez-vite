// Petite couche de compatibilité : SQLite intégré à Node (node:sqlite),
// avec la même interface que better-sqlite3 (pragma, transaction().immediate()).
// Aucune compilation native nécessaire → fonctionne sur toutes les versions récentes de Node.
import { DatabaseSync } from 'node:sqlite';

export default class Database {
  constructor(filename) {
    this._db = new DatabaseSync(filename);
    this._depth = 0;
  }
  prepare(sql) { return this._db.prepare(sql); }
  exec(sql) { this._db.exec(sql); return this; }
  close() { this._db.close(); }
  pragma(str) {
    const rows = this._db.prepare(`PRAGMA ${str}`).all();
    return rows;
  }
  transaction(fn) {
    const run = (mode, args) => {
      if (this._depth > 0) {
        const sp = `sp_${this._depth}`;
        this._db.exec(`SAVEPOINT ${sp}`);
        this._depth++;
        try { const r = fn(...args); this._db.exec(`RELEASE ${sp}`); return r; }
        catch (e) { this._db.exec(`ROLLBACK TO ${sp}`); this._db.exec(`RELEASE ${sp}`); throw e; }
        finally { this._depth--; }
      }
      this._db.exec(`BEGIN ${mode}`);
      this._depth++;
      try { const r = fn(...args); this._db.exec('COMMIT'); return r; }
      catch (e) { try { this._db.exec('ROLLBACK'); } catch {} throw e; }
      finally { this._depth--; }
    };
    const wrapped = (...a) => run('DEFERRED', a);
    wrapped.deferred = (...a) => run('DEFERRED', a);
    wrapped.immediate = (...a) => run('IMMEDIATE', a);
    wrapped.exclusive = (...a) => run('EXCLUSIVE', a);
    return wrapped;
  }
}
