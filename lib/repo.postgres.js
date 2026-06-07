// ───────────────────────────────────────────────────────────────
// Postgres / Supabase database driver.
//
// Implements the same async interface as lib/repo.sqlite.js using
// `pg` (node-postgres) against DATABASE_URL. Because every method here
// matches the SQLite driver's signatures and return shapes, swapping
// to Postgres is a config flip — no route handler changes.
//
// Setup:
//   1. npm install pg                         (done)
//   2. Apply schema.postgres.sql to the DB    (done via migration)
//   3. DB_DRIVER=postgres DATABASE_URL=postgres://... npm start
//
// Supabase connection strings live in: Project Settings → Database.
// Use the connection pooler (port 6543) URL for serverless/edge, or
// the direct (port 5432) URL for a long-lived Node process.
// ───────────────────────────────────────────────────────────────
const crypto = require('crypto');
const config = require('../config');

if (!config.db.url) {
  throw new Error('DB_DRIVER=postgres is selected but DATABASE_URL is not set.');
}

let Pool;
try { ({ Pool } = require('pg')); }
catch {
  throw new Error("DB_DRIVER=postgres but 'pg' is not installed. Run: npm install pg");
}

const pool = new Pool({
  connectionString: config.db.url,
  // Supabase requires TLS; allow the managed cert chain without a local CA bundle.
  ssl: { rejectUnauthorized: false },
  // Keep the pool tiny on serverless (Vercel) so each concurrent function
  // instance holds at most one pooled connection to the Supabase pooler.
  max: Number(process.env.PG_POOL_MAX) || (process.env.VERCEL ? 1 : 10),
});

const q = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;

// ── Schema bootstrap + seed (idempotent) ───────────────────────
// Mirrors lib/repo.sqlite.js so a fresh Postgres database is usable
// even if schema.postgres.sql wasn't applied out of band.
const ready = (async () => {
  await q(`
    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY, unit_code TEXT, title TEXT NOT NULL, address TEXT NOT NULL,
      neighborhood TEXT, beds INTEGER NOT NULL DEFAULT 1, baths INTEGER NOT NULL DEFAULT 1,
      sqft INTEGER, price INTEGER NOT NULL DEFAULT 0, available_date TEXT, description TEXT,
      appliances TEXT, parking_available TEXT NOT NULL DEFAULT 'no', parking_cost INTEGER,
      locker_available TEXT NOT NULL DEFAULT 'no', locker_cost INTEGER,
      dogs_policy TEXT NOT NULL DEFAULT 'no', status TEXT NOT NULL DEFAULT 'available',
      lat DOUBLE PRECISION, lng DOUBLE PRECISION, geocode_attempted INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_photos_unit ON photos(unit_id);
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT,
      role TEXT NOT NULL DEFAULT 'agent', salt TEXT NOT NULL, hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY, unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
      title TEXT NOT NULL, start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ,
      client_name TEXT, client_phone TEXT, client_email TEXT, notes TEXT,
      agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'scheduled', created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_appts_start ON appointments(start_at);
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
      excerpt TEXT, body TEXT, cover_image TEXT, status TEXT NOT NULL DEFAULT 'draft',
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at);
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT,
      unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
      agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      due_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'todo', created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id, due_at);
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL, link TEXT, read INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
    CREATE TABLE IF NOT EXISTS posting_assignments (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cycle INTEGER NOT NULL DEFAULT 1,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (unit_id, cycle)
    );
    CREATE INDEX IF NOT EXISTS idx_pa_cycle ON posting_assignments(cycle);
    CREATE INDEX IF NOT EXISTS idx_pa_task ON posting_assignments(task_id);
  `);

  // Idempotent migration for pre-existing databases: agent onboarding flag.
  await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded INTEGER NOT NULL DEFAULT 0");

  // Seed demo units on first run so the site isn't empty.
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM units');
  if (rows[0].n === 0) {
    const seed = [
      ['A-304',    'Suite 304 — Loft',       '1420 Saint-Laurent, Montréal',   'Plateau',     1, 1, 720,  1850, '2026-06-15', 'Bright loft with exposed brick and tall windows.'],
      ['A-1102',   'Suite 1102 — City View', '88 Rue Sherbrooke, Montréal',    'Downtown',    2, 2, 1050, 2400, '2026-07-01', 'Two-bedroom with downtown skyline views.'],
      ['A-Garden', 'Garden Studio',          '3025 Avenue Papineau, Montréal', 'Plateau',     0, 1, 540,  1650, '2026-06-20', 'Quiet ground-floor studio with private garden access.'],
      ['B-201',    'Suite 201 — Sun-filled', '742 Rue Wellington, Montréal',   'Griffintown', 1, 1, 680,  1950, '2026-06-10', 'Corner unit, southern exposure.'],
    ];
    for (const r of seed) {
      await q(
        `INSERT INTO units (unit_code, title, address, neighborhood, beds, baths, sqft, price, available_date, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        r,
      );
    }
  }
})().catch((err) => {
  console.error('Postgres bootstrap failed:', err.message);
  throw err;
});

// ── Helpers ────────────────────────────────────────────────────
async function photosFor(unitId) {
  const { rows } = await q(
    'SELECT id, filename AS key, sort_order FROM photos WHERE unit_id = $1 ORDER BY sort_order, id',
    [unitId],
  );
  return rows;
}
async function hydrate(row) {
  if (!row) return null;
  return { ...row, photos: await photosFor(row.id) };
}
// Batch-load photos for many units in a single query (avoids N+1 / pool
// exhaustion when listing hundreds of units).
async function hydrateAll(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { rows: photos } = await q(
    'SELECT id, unit_id, filename AS key, sort_order FROM photos WHERE unit_id = ANY($1) ORDER BY sort_order, id',
    [ids],
  );
  const byUnit = new Map();
  for (const p of photos) {
    if (!byUnit.has(p.unit_id)) byUnit.set(p.unit_id, []);
    byUnit.get(p.unit_id).push({ id: p.id, key: p.key, sort_order: p.sort_order });
  }
  return rows.map((r) => ({ ...r, photos: byUnit.get(r.id) || [] }));
}

// Ordered column list shared by insert/update so values map positionally.
const UNIT_FIELDS = [
  'unit_code', 'title', 'address', 'neighborhood', 'beds', 'baths', 'sqft', 'price',
  'available_date', 'description', 'appliances', 'parking_available', 'parking_cost',
  'locker_available', 'locker_cost', 'dogs_policy', 'status', 'lat', 'lng', 'geocode_attempted',
];
const unitValues = (u) => UNIT_FIELDS.map((f) => (u[f] === undefined ? null : u[f]));

async function hydrateAppt(row) {
  if (!row) return null;
  const unit = row.unit_id
    ? await one('SELECT id, title, unit_code, address FROM units WHERE id = $1', [row.unit_id])
    : null;
  const agent = row.agent_id
    ? await one('SELECT id, name, email FROM users WHERE id = $1', [row.agent_id])
    : null;
  return { ...row, unit, agent };
}

async function hydrateTask(row) {
  if (!row) return null;
  const unit = row.unit_id
    ? await one('SELECT id, title, unit_code, address FROM units WHERE id = $1', [row.unit_id])
    : null;
  const agent = row.agent_id
    ? await one('SELECT id, name, email FROM users WHERE id = $1', [row.agent_id])
    : null;
  return { ...row, unit, agent };
}

async function hydratePost(row) {
  if (!row) return null;
  const author = row.author_id
    ? await one('SELECT id, name, email FROM users WHERE id = $1', [row.author_id])
    : null;
  return { ...row, author };
}

module.exports = {
  driver: 'postgres',
  ready, // awaitable so server startup can ensure schema/seed before serving

  // ── Units ────────────────────────────────────────────────────
  async listUnits({ all = false } = {}) {
    const sql = all
      ? 'SELECT * FROM units ORDER BY created_at DESC'
      : "SELECT * FROM units WHERE status = 'available' ORDER BY price ASC";
    return hydrateAll((await q(sql)).rows);
  },
  async getUnit(id) {
    return hydrate(await one('SELECT * FROM units WHERE id = $1', [id]));
  },
  async createUnit(u) {
    const cols = UNIT_FIELDS.join(', ');
    const ph = UNIT_FIELDS.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(`INSERT INTO units (${cols}) VALUES (${ph}) RETURNING *`, unitValues(u));
    return hydrate(row);
  },
  async createUnitsBulk(list) {
    const cols = UNIT_FIELDS.join(', ');
    const ph = UNIT_FIELDS.map((_, i) => `$${i + 1}`).join(', ');
    const client = await pool.connect();
    let imported = 0;
    try {
      await client.query('BEGIN');
      for (const r of list) {
        await client.query(`INSERT INTO units (${cols}) VALUES (${ph})`, unitValues(r));
        imported++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return imported;
  },
  async updateUnit(id, u) {
    const set = UNIT_FIELDS.map((f, i) => `${f}=$${i + 1}`).join(', ');
    const row = await one(
      `UPDATE units SET ${set} WHERE id=$${UNIT_FIELDS.length + 1} RETURNING *`,
      [...unitValues(u), id],
    );
    return hydrate(row);
  },
  // Returns the storage keys of the deleted unit's photos so the caller can remove the files.
  async deleteUnit(id) {
    const { rows } = await q('SELECT filename AS key FROM photos WHERE unit_id = $1', [id]);
    await q('DELETE FROM units WHERE id = $1', [id]);
    return rows.map((r) => r.key);
  },
  async locatedUnitsExcept(id) {
    const { rows } = await q(
      'SELECT * FROM units WHERE id != $1 AND lat IS NOT NULL AND lng IS NOT NULL',
      [id],
    );
    return hydrateAll(rows);
  },

  // ── Geocoding support ────────────────────────────────────────
  async nextUnitNeedingGeocode() {
    return one(`
      SELECT id, address FROM units
      WHERE lat IS NULL AND geocode_attempted = 0 AND address IS NOT NULL AND address != ''
      ORDER BY id LIMIT 1
    `);
  },
  async setCoords(id, lat, lng) {
    await q('UPDATE units SET lat=$1, lng=$2, geocode_attempted=1 WHERE id=$3', [lat, lng, id]);
  },
  async markGeocodeAttempted(id) {
    await q('UPDATE units SET geocode_attempted=1 WHERE id=$1', [id]);
  },
  async resetGeocode(id) {
    await q('UPDATE units SET lat=NULL, lng=NULL, geocode_attempted=0 WHERE id=$1', [id]);
  },

  // ── Photos ───────────────────────────────────────────────────
  async addPhotos(unitId, keys) {
    const { rows } = await q(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM photos WHERE unit_id = $1',
      [unitId],
    );
    let order = rows[0].m + 1;
    const out = [];
    for (const key of keys) {
      const row = await one(
        'INSERT INTO photos (unit_id, filename, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [unitId, key, order++],
      );
      out.push({ id: row.id, key });
    }
    return out;
  },
  async getPhoto(id) {
    return one(`
      SELECT p.id, p.filename AS key, u.unit_code, u.title
      FROM photos p JOIN units u ON u.id = p.unit_id WHERE p.id = $1
    `, [id]);
  },
  async listPhotos(unitId) {
    return photosFor(unitId);
  },
  async deletePhoto(id) {
    const photo = await one('SELECT filename AS key FROM photos WHERE id = $1', [id]);
    if (!photo) return null;
    await q('DELETE FROM photos WHERE id = $1', [id]);
    return photo.key;
  },

  // ── Users ────────────────────────────────────────────────────
  async countUsers() {
    return (await one('SELECT COUNT(*)::int AS n FROM users')).n;
  },
  async countActiveMasters() {
    return (await one("SELECT COUNT(*)::int AS n FROM users WHERE role='master' AND active=1")).n;
  },
  async getUserByEmail(email) {
    return one('SELECT * FROM users WHERE email = $1', [email]);
  },
  async getActiveUserByEmail(email) {
    return one('SELECT * FROM users WHERE email = $1 AND active = 1', [email]);
  },
  async getUserById(id) {
    return one('SELECT * FROM users WHERE id = $1', [id]);
  },
  async listUsers() {
    return (await q('SELECT id, email, name, role, active, created_at FROM users ORDER BY created_at')).rows;
  },
  async createUser({ email, name, role, salt, hash }) {
    return one(
      `INSERT INTO users (email, name, role, salt, hash) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, active, created_at`,
      [email, name, role, salt, hash],
    );
  },
  async updateUser(id, { name, role, active }) {
    return one(
      `UPDATE users SET name=$1, role=$2, active=$3 WHERE id=$4
       RETURNING id, email, name, role, active, created_at`,
      [name, role, active ? 1 : 0, id],
    );
  },
  async setUserPassword(id, salt, hash) {
    await q('UPDATE users SET salt=$1, hash=$2 WHERE id=$3', [salt, hash, id]);
  },
  async setUserEmail(id, email) {
    await q('UPDATE users SET email=$1 WHERE id=$2', [email, id]);
  },
  async setUserOnboarded(id, v) {
    await q('UPDATE users SET onboarded=$1 WHERE id=$2', [v ? 1 : 0, id]);
  },
  async deleteUser(id) {
    await q('DELETE FROM users WHERE id = $1', [id]);
  },

  // ── Sessions ─────────────────────────────────────────────────
  async createSession(userId, days) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + days * 864e5).toISOString();
    await q('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expires]);
    return { token, expires };
  },
  async getSession(token) {
    return one(`
      SELECT s.token, s.expires_at, u.id, u.email, u.name, u.role, u.active, u.onboarded
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1
    `, [token]);
  },
  async deleteSession(token) {
    await q('DELETE FROM sessions WHERE token = $1', [token]);
  },

  // ── Appointments ─────────────────────────────────────────────
  async listAppointments({ from, to, unitId } = {}) {
    const clauses = [], params = [];
    if (from)   { params.push(from);   clauses.push(`start_at >= $${params.length}`); }
    if (to)     { params.push(to);     clauses.push(`start_at <= $${params.length}`); }
    if (unitId) { params.push(unitId); clauses.push(`unit_id = $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await q(`SELECT * FROM appointments ${where} ORDER BY start_at`, params);
    return Promise.all(rows.map(hydrateAppt));
  },
  async getAppointment(id) {
    return hydrateAppt(await one('SELECT * FROM appointments WHERE id = $1', [id]));
  },
  async createAppointment(a) {
    const f = ['unit_id', 'title', 'start_at', 'end_at', 'client_name', 'client_phone', 'client_email', 'notes', 'agent_id', 'status', 'created_by'];
    const ph = f.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(
      `INSERT INTO appointments (${f.join(', ')}) VALUES (${ph}) RETURNING *`,
      f.map((k) => (a[k] === undefined ? null : a[k])),
    );
    return hydrateAppt(row);
  },
  async updateAppointment(id, a) {
    const f = ['unit_id', 'title', 'start_at', 'end_at', 'client_name', 'client_phone', 'client_email', 'notes', 'agent_id', 'status'];
    const set = f.map((k, i) => `${k}=$${i + 1}`).join(', ');
    const row = await one(
      `UPDATE appointments SET ${set} WHERE id=$${f.length + 1} RETURNING *`,
      [...f.map((k) => (a[k] === undefined ? null : a[k])), id],
    );
    return hydrateAppt(row);
  },
  async deleteAppointment(id) {
    await q('DELETE FROM appointments WHERE id = $1', [id]);
  },

  // ── Blog posts ───────────────────────────────────────────────
  async listPosts({ publishedOnly = false } = {}) {
    const sql = publishedOnly
      ? "SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC NULLS LAST, created_at DESC"
      : 'SELECT * FROM posts ORDER BY created_at DESC';
    return Promise.all((await q(sql)).rows.map(hydratePost));
  },
  async getPostBySlug(slug, { publishedOnly = false } = {}) {
    const row = await one('SELECT * FROM posts WHERE slug = $1', [slug]);
    if (!row) return null;
    if (publishedOnly && row.status !== 'published') return null;
    return hydratePost(row);
  },
  async getPostById(id) {
    return hydratePost(await one('SELECT * FROM posts WHERE id = $1', [id]));
  },
  async slugExists(slug, exceptId = null) {
    const row = exceptId
      ? await one('SELECT id FROM posts WHERE slug = $1 AND id != $2', [slug, exceptId])
      : await one('SELECT id FROM posts WHERE slug = $1', [slug]);
    return !!row;
  },
  async createPost(p) {
    const f = ['slug', 'title', 'excerpt', 'body', 'cover_image', 'status', 'author_id', 'published_at'];
    const ph = f.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(
      `INSERT INTO posts (${f.join(', ')}) VALUES (${ph}) RETURNING *`,
      f.map((k) => (p[k] === undefined ? null : p[k])),
    );
    return hydratePost(row);
  },
  async updatePost(id, p) {
    const f = ['slug', 'title', 'excerpt', 'body', 'cover_image', 'status', 'published_at'];
    const set = f.map((k, i) => `${k}=$${i + 1}`).join(', ');
    const row = await one(
      `UPDATE posts SET ${set}, updated_at=now() WHERE id=$${f.length + 1} RETURNING *`,
      [...f.map((k) => (p[k] === undefined ? null : p[k])), id],
    );
    return hydratePost(row);
  },
  async deletePost(id) {
    const row = await one('SELECT cover_image FROM posts WHERE id = $1', [id]);
    await q('DELETE FROM posts WHERE id = $1', [id]);
    return row ? row.cover_image : null;
  },

  // ── Tasks ────────────────────────────────────────────────────
  async listTasks({ agentId, from, to } = {}) {
    const clauses = [], params = [];
    if (agentId) { params.push(agentId); clauses.push(`agent_id = $${params.length}`); }
    if (from)    { params.push(from);    clauses.push(`(due_at IS NULL OR due_at >= $${params.length})`); }
    if (to)      { params.push(to);      clauses.push(`(due_at IS NULL OR due_at <= $${params.length})`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await q(`SELECT * FROM tasks ${where} ORDER BY due_at IS NULL, due_at, created_at`, params);
    return Promise.all(rows.map(hydrateTask));
  },
  async getTask(id) {
    return hydrateTask(await one('SELECT * FROM tasks WHERE id = $1', [id]));
  },
  async createTask(t) {
    const f = ['title', 'description', 'unit_id', 'agent_id', 'due_at', 'status', 'created_by'];
    const ph = f.map((_, i) => `$${i + 1}`).join(', ');
    const row = await one(`INSERT INTO tasks (${f.join(', ')}) VALUES (${ph}) RETURNING *`,
      f.map((k) => (t[k] === undefined ? null : t[k])));
    return hydrateTask(row);
  },
  async updateTask(id, t) {
    const f = ['title', 'description', 'unit_id', 'agent_id', 'due_at', 'status'];
    const set = f.map((k, i) => `${k}=$${i + 1}`).join(', ');
    const row = await one(`UPDATE tasks SET ${set}, updated_at=now() WHERE id=$${f.length + 1} RETURNING *`,
      [...f.map((k) => (t[k] === undefined ? null : t[k])), id]);
    return hydrateTask(row);
  },
  async setTaskStatus(id, status) {
    return hydrateTask(await one('UPDATE tasks SET status=$1, updated_at=now() WHERE id=$2 RETURNING *', [status, id]));
  },
  async deleteTask(id) {
    await q('DELETE FROM tasks WHERE id = $1', [id]);
  },

  // ── Notifications ────────────────────────────────────────────
  async createNotification(userId, message, link) {
    return one('INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3) RETURNING *', [userId, message, link || null]);
  },
  async listNotifications(userId, limit = 30) {
    const { rows } = await q('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2', [userId, limit]);
    return rows;
  },
  async countUnreadNotifications(userId) {
    return (await one('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read = 0', [userId])).n;
  },
  async markNotificationRead(id, userId) {
    await q('UPDATE notifications SET read = 1 WHERE id = $1 AND user_id = $2', [id, userId]);
  },
  async markAllNotificationsRead(userId) {
    await q('UPDATE notifications SET read = 1 WHERE user_id = $1 AND read = 0', [userId]);
  },

  // ── Posting rotation ─────────────────────────────────────────
  async getPostingCycle() {
    return (await one('SELECT COALESCE(MAX(cycle), 1) AS c FROM posting_assignments')).c || 1;
  },
  async countAvailableUnits() {
    return (await one("SELECT COUNT(*)::int AS n FROM units WHERE status = 'available'")).n;
  },
  async countAssignedInCycle(cycle) {
    return (await one('SELECT COUNT(*)::int AS n FROM posting_assignments WHERE cycle = $1', [cycle])).n;
  },
  async availableUnitsNotInCycle(cycle, limit) {
    const { rows } = await q(`
      SELECT * FROM units WHERE status = 'available'
        AND id NOT IN (SELECT unit_id FROM posting_assignments WHERE cycle = $1)
      ORDER BY id LIMIT $2
    `, [cycle, limit]);
    return hydrateAll(rows);
  },
  async assignUnitPosting(unitId, agentId, cycle, taskId) {
    await q(
      'INSERT INTO posting_assignments (unit_id, agent_id, cycle, task_id) VALUES ($1, $2, $3, $4) ON CONFLICT (unit_id, cycle) DO NOTHING',
      [unitId, agentId, cycle, taskId || null],
    );
  },
  async unitsForTasks(taskIds) {
    const map = {};
    if (!taskIds || !taskIds.length) return map;
    const { rows } = await q(`
      SELECT pa.task_id AS _task_id, u.* FROM posting_assignments pa
      JOIN units u ON u.id = pa.unit_id
      WHERE pa.task_id = ANY($1) ORDER BY pa.task_id, u.id
    `, [taskIds]);
    const units = rows.map(({ _task_id, ...u }) => u);
    const hydrated = await hydrateAll(units);
    rows.forEach((row, i) => { (map[row._task_id] ||= []).push(hydrated[i]); });
    return map;
  },
};
