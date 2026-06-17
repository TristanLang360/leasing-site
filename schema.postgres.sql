-- ───────────────────────────────────────────────────────────────
-- Postgres / Supabase schema for Rentalium.
-- Apply in the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f schema.postgres.sql
-- Mirrors lib/repo.sqlite.js so the Postgres driver can be a drop-in.
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS buildings (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  address           TEXT NOT NULL,
  neighborhood      TEXT,
  cover_image       TEXT,                    -- storage key (Supabase object path)
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  geocode_attempted INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
  id                SERIAL PRIMARY KEY,
  building_id       INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
  unit_code         TEXT,
  title             TEXT NOT NULL,
  address           TEXT NOT NULL,
  neighborhood      TEXT,
  beds              INTEGER NOT NULL DEFAULT 1,
  baths             INTEGER NOT NULL DEFAULT 1,
  sqft              INTEGER,
  price             INTEGER NOT NULL DEFAULT 0,
  available_date    TEXT,
  description       TEXT,
  appliances        TEXT,
  parking_available TEXT NOT NULL DEFAULT 'no',
  parking_cost      INTEGER,
  locker_available  TEXT NOT NULL DEFAULT 'no',
  locker_cost       INTEGER,
  dogs_policy       TEXT NOT NULL DEFAULT 'no',
  status            TEXT NOT NULL DEFAULT 'available',
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  geocode_attempted INTEGER NOT NULL DEFAULT 0,
  -- Spreadsheet-mirroring fields (source of truth = the leasing Google Sheet).
  -- entrance_code, janitor_number, notes, pictures_url, available_on and the
  -- amount/date tracking columns are INTERNAL: server present() strips them for
  -- unauthenticated (public) callers.
  size              TEXT,                    -- Quebec room count, e.g. "3.5"
  entrance_code     TEXT,                    -- private
  janitor_number    TEXT,                    -- private
  notes             TEXT,                    -- private (internal notes)
  pictures_url      TEXT,                    -- private (Drive folder link)
  availability      TEXT,                    -- raw sheet label: Available/On Hold/In Reno/Not Available/Rented
  available_on      TEXT,                    -- private
  date_updated      TEXT,                    -- private
  first_amount_date TEXT,                    -- private
  first_amount      TEXT,                    -- private
  updated_amount_on TEXT,                    -- private
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_building ON units(building_id);

CREATE TABLE IF NOT EXISTS photos (
  id         SERIAL PRIMARY KEY,
  unit_id    INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,              -- storage key (Supabase object path)
  kind       TEXT NOT NULL DEFAULT 'image',  -- image | video
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photos_unit ON photos(unit_id);

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  role       TEXT NOT NULL DEFAULT 'agent',
  salt       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  onboarded  INTEGER NOT NULL DEFAULT 0,   -- agent has seen the welcome tour
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id           SERIAL PRIMARY KEY,
  unit_id      INTEGER REFERENCES units(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  start_at     TIMESTAMPTZ NOT NULL,
  end_at       TIMESTAMPTZ,
  client_name  TEXT,
  client_phone TEXT,
  client_email TEXT,
  notes        TEXT,
  agent_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled',
  created_by   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appts_start ON appointments(start_at);

CREATE TABLE IF NOT EXISTS posts (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  title        TEXT NOT NULL,
  excerpt      TEXT,
  body         TEXT,
  cover_image  TEXT,                       -- storage key (Supabase object path)
  status       TEXT NOT NULL DEFAULT 'draft',
  author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at);

CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  unit_id     INTEGER REFERENCES units(id) ON DELETE SET NULL,
  agent_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- assigned agent
  due_at      TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'todo',
  created_by  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id, due_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS posting_assignments (
  id         SERIAL PRIMARY KEY,
  unit_id    INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  agent_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle      INTEGER NOT NULL DEFAULT 1,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, cycle)   -- a unit is claimed by at most one agent per cycle
);
CREATE INDEX IF NOT EXISTS idx_pa_cycle ON posting_assignments(cycle);
CREATE INDEX IF NOT EXISTS idx_pa_task ON posting_assignments(task_id);

CREATE TABLE IF NOT EXISTS leads (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  unit_id        INTEGER REFERENCES units(id) ON DELETE SET NULL,         -- unit of interest
  agent_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,         -- assigned agent
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,  -- linked showing
  stage          TEXT NOT NULL DEFAULT 'new',   -- new|visited|credit_sent|application_sent|rented|lost
  source         TEXT NOT NULL DEFAULT 'website',
  budget         INTEGER,                        -- monthly budget
  move_in        TEXT,                           -- desired move-in date
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
