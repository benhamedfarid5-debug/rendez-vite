PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Cabinets dentaires (un cabinet = un tenant). Un praticien principal par
-- cabinet dans le MVP (voir README "Limites connues").
-- Aucune donnée patient ici : uniquement le profil public du cabinet.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS practices (
  id                    TEXT PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,        -- URL publique /d/:slug
  public_id             TEXT NOT NULL UNIQUE,        -- identifiant non devinable (QR)
  name_fr               TEXT NOT NULL,
  name_ar               TEXT,
  specialty_fr          TEXT NOT NULL DEFAULT 'Chirurgien-dentiste',
  specialty_ar          TEXT DEFAULT 'طبيب أسنان',
  address_fr            TEXT,
  address_ar            TEXT,
  city_fr               TEXT,
  city_ar               TEXT,
  wilaya_code           INTEGER,
  wilaya_fr             TEXT,
  wilaya_ar             TEXT,
  latitude              REAL,                        -- position GPS du cabinet (carte)
  longitude             REAL,
  online_booking        INTEGER NOT NULL DEFAULT 1,  -- 0 = annuaire (pas encore inscrit)
  osm_id                TEXT,                        -- origine OpenStreetMap (annuaire)
  subscription_plan     TEXT,                        -- trial | month | semester | year
  subscription_until    TEXT,                        -- fin de l'abonnement (NULL = sans limite)
  phone                 TEXT,
  languages             TEXT NOT NULL DEFAULT 'fr,ar', -- CSV: fr,ar
  timezone              TEXT NOT NULL DEFAULT 'Africa/Algiers',
  slot_duration_min     INTEGER NOT NULL DEFAULT 30,
  min_lead_hours        INTEGER NOT NULL DEFAULT 2,
  horizon_days          INTEGER NOT NULL DEFAULT 60,
  auto_confirm          INTEGER NOT NULL DEFAULT 1,   -- 1 = confirmé, 0 = en attente
  is_listed             INTEGER NOT NULL DEFAULT 1,
  reminder_enabled      INTEGER NOT NULL DEFAULT 1,
  reminder_hours_before INTEGER NOT NULL DEFAULT 24,
  notify_channel        TEXT NOT NULL DEFAULT 'email'
                          CHECK (notify_channel IN ('email','sms','whatsapp')),
  retention_days        INTEGER NOT NULL DEFAULT 365,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_practices_listed ON practices (is_listed, wilaya_code);

-- ---------------------------------------------------------------------------
-- Comptes de l'équipe (dentiste propriétaire, secrétaire). Séparés des
-- données patients : un compte n'a aucune donnée personnelle de patient.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  practice_id     TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,   -- toujours en minuscules
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('owner','secretary')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  honor_declared_at TEXT,                -- déclaration sur l'honneur (inscription)
  honor_text      TEXT,                   -- texte exact accepté
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_users_practice ON users (practice_id);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,   -- sha256 du cookie, jamais le token brut
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  last_seen_at TEXT,
  ip_hash     TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions (user_id, expires_at);

-- ---------------------------------------------------------------------------
-- Horaires récurrents (weekday 0 = dimanche .. 6 = samedi, heures locales)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS working_hours (
  id            TEXT PRIMARY KEY,
  practice_id   TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  weekday       INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open       INTEGER NOT NULL DEFAULT 1,
  open_minute   INTEGER NOT NULL,   -- minutes depuis minuit, local
  close_minute  INTEGER NOT NULL,
  break_start   INTEGER,            -- pause déjeuner
  break_end     INTEGER,
  UNIQUE (practice_id, weekday)
);

-- ---------------------------------------------------------------------------
-- Exceptions de calendrier : absence, congé, fermeture, blocage urgence/retard
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_exceptions (
  id          TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('absence','closure','emergency','lateness')),
  starts_at   TEXT NOT NULL,   -- UTC ISO
  ends_at     TEXT NOT NULL,
  note        TEXT,            -- motif administratif uniquement
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_exceptions_practice ON calendar_exceptions (practice_id, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Rendez-vous. Séparé des comptes praticiens. Aucun identifiant national,
-- aucune donnée clinique.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id                TEXT PRIMARY KEY,
  practice_id       TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  public_ref        TEXT NOT NULL UNIQUE,        -- code de confirmation (ex: MW-7K2QF9)
  manage_token_hash TEXT NOT NULL,               -- lien sécurisé de gestion
  patient_first_name TEXT NOT NULL,
  patient_last_name  TEXT NOT NULL,
  patient_phone      TEXT NOT NULL,
  patient_email      TEXT,
  reason_code        TEXT NOT NULL CHECK (reason_code IN ('checkup','pain','cleaning','consultation','other')),
  free_text          TEXT,                       -- facultatif, conservé tel quel
  free_text_lang     TEXT CHECK (free_text_lang IN ('fr','ar')),
  patient_language   TEXT NOT NULL DEFAULT 'fr' CHECK (patient_language IN ('fr','ar')),
  starts_at          TEXT NOT NULL,              -- UTC ISO
  ends_at            TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('requested','confirmed','arrived','completed','cancelled','no_show')),
  source             TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online','staff')),
  notify_consent     INTEGER NOT NULL DEFAULT 0,
  privacy_consent_at TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  cancelled_at       TEXT,
  cancelled_by       TEXT CHECK (cancelled_by IN ('patient','staff','system'))
);
-- Anti double réservation : un seul rendez-vous actif par créneau.
CREATE UNIQUE INDEX IF NOT EXISTS ux_appt_active_slot
  ON appointments (practice_id, starts_at)
  WHERE status IN ('requested','confirmed','arrived','completed');
CREATE INDEX IF NOT EXISTS ix_appt_practice_start ON appointments (practice_id, starts_at);
CREATE INDEX IF NOT EXISTS ix_appt_status ON appointments (practice_id, status, starts_at);
CREATE INDEX IF NOT EXISTS ix_appt_phone ON appointments (practice_id, patient_phone);

-- ---------------------------------------------------------------------------
-- Notifications (adaptateurs e-mail / SMS / WhatsApp). En démo : "simulated".
-- Aucun motif de visite ni texte libre n'est stocké dans le payload.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id             TEXT PRIMARY KEY,
  practice_id    TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  template       TEXT NOT NULL,        -- booking_confirmation, reminder, cancellation, reschedule
  recipient      TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('simulated','queued','sent','failed','skipped')),
  provider       TEXT,                 -- 'demo' | 'smtp' | 'twilio' | ...
  detail         TEXT,                 -- message lisible de la simulation / erreur
  scheduled_for  TEXT,
  created_at     TEXT NOT NULL,
  sent_at        TEXT
);
CREATE INDEX IF NOT EXISTS ix_notif_practice ON notifications (practice_id, created_at);
CREATE INDEX IF NOT EXISTS ix_notif_due ON notifications (status, scheduled_for);

-- ---------------------------------------------------------------------------
-- Journal d'audit minimal (pas de données sensibles dans metadata)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  practice_id   TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  actor_label   TEXT NOT NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  metadata      TEXT,
  ip_hash       TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_practice ON audit_log (practice_id, created_at);

-- ---------------------------------------------------------------------------
-- Limitation de débit persistante (login / réservation / recherche)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket     TEXT NOT NULL,
  key_hash   TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_rate ON rate_events (bucket, key_hash, created_at);

-- ---------------------------------------------------------------------------
-- Consentements / demandes de suppression (traçabilité minimale)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_requests (
  id             TEXT PRIMARY KEY,
  practice_id    TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('export','deletion')),
  status         TEXT NOT NULL CHECK (status IN ('pending','done')),
  created_at     TEXT NOT NULL,
  done_at        TEXT
);

-- ---------------------------------------------------------------------------
-- Garanties anti-chevauchement au niveau base de données (en plus de l'index
-- unique sur le créneau exact). Toute insertion/mise à jour conflictuelle est
-- rejetée par SQLite, même en cas de concurrence.
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_appt_no_overlap_ins
BEFORE INSERT ON appointments
WHEN NEW.status IN ('requested','confirmed','arrived','completed')
BEGIN
  SELECT RAISE(ABORT, 'SLOT_OVERLAP') WHERE EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.practice_id = NEW.practice_id
      AND a.status IN ('requested','confirmed','arrived','completed')
      AND NEW.starts_at < a.ends_at
      AND NEW.ends_at > a.starts_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_appt_no_overlap_upd
BEFORE UPDATE OF starts_at, ends_at, status ON appointments
WHEN NEW.status IN ('requested','confirmed','arrived','completed')
BEGIN
  SELECT RAISE(ABORT, 'SLOT_OVERLAP') WHERE EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.practice_id = NEW.practice_id
      AND a.id <> NEW.id
      AND a.status IN ('requested','confirmed','arrived','completed')
      AND NEW.starts_at < a.ends_at
      AND NEW.ends_at > a.starts_at
  );
END;

-- Paiements des abonnements (Edahabia / CIB via Chargily Pay)
CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  practice_id   TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL,
  amount_da     INTEGER NOT NULL,
  method        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | failed
  provider_ref  TEXT,
  created_at    TEXT NOT NULL,
  paid_at       TEXT
);
CREATE INDEX IF NOT EXISTS ix_payments_practice ON payments (practice_id);

-- Codes d'activation (paiement par téléphone, remis par l'administrateur)
CREATE TABLE IF NOT EXISTS activation_codes (
  code          TEXT PRIMARY KEY,      -- RV-XXXX-XXXX
  plan          TEXT NOT NULL,         -- month | semester | year
  note          TEXT,                  -- ex. nom du médecin
  created_at    TEXT NOT NULL,
  used_at       TEXT,
  practice_id   TEXT REFERENCES practices(id) ON DELETE SET NULL
);

-- Sessions de l'administrateur (propriétaire de Rendez-Vite)
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash    TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);

-- Factures des abonnements (une par paiement validé)
CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,     -- RV-AAAA-NNNN
  payment_id     TEXT NOT NULL UNIQUE REFERENCES payments(id),
  practice_id    TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  issued_at      TEXT NOT NULL,
  plan           TEXT NOT NULL,
  method         TEXT NOT NULL,
  amount_da      INTEGER NOT NULL,
  period_start   TEXT NOT NULL,
  period_end     TEXT NOT NULL,
  buyer_name     TEXT,
  buyer_practice TEXT,
  buyer_address  TEXT,
  buyer_email    TEXT,
  email_status   TEXT,                     -- sent | simulated | failed
  emailed_at     TEXT
);
CREATE INDEX IF NOT EXISTS ix_invoices_practice ON invoices (practice_id);
