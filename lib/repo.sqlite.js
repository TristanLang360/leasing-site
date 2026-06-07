// ───────────────────────────────────────────────────────────────
// SQLite repository (the default driver). Owns the schema, migrations
// and seed, and exposes async methods used by the rest of the app.
// better-sqlite3 is synchronous, so the methods simply resolve right
// away — but their async signatures match what a Supabase/Postgres
// driver would need (see lib/repo.postgres.js).
// ───────────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const crypto = require('crypto');
const config = require('../config');

const db = new Database(config.db.sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_code TEXT,
    title TEXT NOT NULL,
    address TEXT NOT NULL,
    neighborhood TEXT,
    beds INTEGER NOT NULL DEFAULT 1,
    baths INTEGER NOT NULL DEFAULT 1,
    sqft INTEGER,
    price INTEGER NOT NULL DEFAULT 0,
    available_date TEXT,
    description TEXT,
    appliances TEXT,
    parking_available TEXT NOT NULL DEFAULT 'no',
    parking_cost INTEGER,
    locker_available TEXT NOT NULL DEFAULT 'no',
    locker_cost INTEGER,
    dogs_policy TEXT NOT NULL DEFAULT 'no',
    status TEXT NOT NULL DEFAULT 'available',
    lat REAL,
    lng REAL,
    geocode_attempted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_photos_unit ON photos(unit_id);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'agent',
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER,
    title TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT,
    client_name TEXT,
    client_phone TEXT,
    client_email TEXT,
    notes TEXT,
    agent_id INTEGER,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
    FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_appts_start ON appointments(start_at);

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    body TEXT,
    cover_image TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    author_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at);

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    unit_id INTEGER,
    agent_id INTEGER NOT NULL,
    due_at TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
    FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id, due_at);

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);

  CREATE TABLE IF NOT EXISTS posting_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    cycle INTEGER NOT NULL DEFAULT 1,
    task_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (unit_id, cycle),
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pa_cycle ON posting_assignments(cycle);
  CREATE INDEX IF NOT EXISTS idx_pa_task ON posting_assignments(task_id);

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
    agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
    stage TEXT NOT NULL DEFAULT 'new',
    source TEXT NOT NULL DEFAULT 'website',
    budget INTEGER,
    move_in TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
`);

// Idempotent migrations for pre-existing databases.
const unitCols = new Set(db.prepare('PRAGMA table_info(units)').all().map((c) => c.name));
const addColumn = (name, ddl) => { if (!unitCols.has(name)) db.exec(`ALTER TABLE units ADD COLUMN ${ddl}`); };
addColumn('appliances', 'appliances TEXT');
addColumn('parking_available', "parking_available TEXT NOT NULL DEFAULT 'no'");
addColumn('parking_cost', 'parking_cost INTEGER');
addColumn('locker_available', "locker_available TEXT NOT NULL DEFAULT 'no'");
addColumn('locker_cost', 'locker_cost INTEGER');
addColumn('dogs_policy', "dogs_policy TEXT NOT NULL DEFAULT 'no'");
addColumn('lat', 'lat REAL');
addColumn('lng', 'lng REAL');
addColumn('geocode_attempted', 'geocode_attempted INTEGER NOT NULL DEFAULT 0');

// Agent onboarding flag (idempotent migration for pre-existing databases).
const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!userCols.has('onboarded')) db.exec("ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0");

// Seed demo units on first run so the site isn't empty.
if (db.prepare('SELECT COUNT(*) AS n FROM units').get().n === 0) {
  const seed = db.prepare(`
    INSERT INTO units (unit_code, title, address, neighborhood, beds, baths, sqft, price, available_date, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rows = [
    ['A-304',    'Suite 304 — Loft',       '1420 Saint-Laurent, Montréal',   'Plateau',     1, 1, 720,  1850, '2026-06-15', 'Bright loft with exposed brick and tall windows.'],
    ['A-1102',   'Suite 1102 — City View', '88 Rue Sherbrooke, Montréal',    'Downtown',    2, 2, 1050, 2400, '2026-07-01', 'Two-bedroom with downtown skyline views.'],
    ['A-Garden', 'Garden Studio',          '3025 Avenue Papineau, Montréal', 'Plateau',     0, 1, 540,  1650, '2026-06-20', 'Quiet ground-floor studio with private garden access.'],
    ['B-201',    'Suite 201 — Sun-filled', '742 Rue Wellington, Montréal',   'Griffintown', 1, 1, 680,  1950, '2026-06-10', 'Corner unit, southern exposure.'],
  ];
  db.transaction((rs) => { for (const r of rs) seed.run(...r); })(rows);
}

// ── Helpers ────────────────────────────────────────────────────
function photosFor(unitId) {
  return db.prepare('SELECT id, filename AS key, sort_order FROM photos WHERE unit_id = ? ORDER BY sort_order, id').all(unitId);
}
function hydrate(row) {
  if (!row) return null;
  return { ...row, photos: photosFor(row.id) };
}

const UNIT_COLS = `unit_code, title, address, neighborhood, beds, baths, sqft, price, available_date,
  description, appliances, parking_available, parking_cost, locker_available, locker_cost,
  dogs_policy, status, lat, lng, geocode_attempted`;
const UNIT_VALUES = `@unit_code, @title, @address, @neighborhood, @beds, @baths, @sqft, @price, @available_date,
  @description, @appliances, @parking_available, @parking_cost, @locker_available, @locker_cost,
  @dogs_policy, @status, @lat, @lng, @geocode_attempted`;

module.exports = {
  driver: 'sqlite',

  // ── Units ────────────────────────────────────────────────────
  async listUnits({ all = false } = {}) {
    const sql = all
      ? 'SELECT * FROM units ORDER BY created_at DESC'
      : "SELECT * FROM units WHERE status = 'available' ORDER BY price ASC";
    return db.prepare(sql).all().map(hydrate);
  },
  async getUnit(id) {
    return hydrate(db.prepare('SELECT * FROM units WHERE id = ?').get(id));
  },
  async createUnit(u) {
    const info = db.prepare(`INSERT INTO units (${UNIT_COLS}) VALUES (${UNIT_VALUES})`).run(u);
    return hydrate(db.prepare('SELECT * FROM units WHERE id = ?').get(info.lastInsertRowid));
  },
  async createUnitsBulk(list) {
    const insert = db.prepare(`INSERT INTO units (${UNIT_COLS}) VALUES (${UNIT_VALUES})`);
    let imported = 0;
    db.transaction((rows) => { for (const r of rows) { insert.run(r); imported++; } })(list);
    return imported;
  },
  async updateUnit(id, u) {
    db.prepare(`
      UPDATE units SET unit_code=@unit_code, title=@title, address=@address, neighborhood=@neighborhood,
        beds=@beds, baths=@baths, sqft=@sqft, price=@price, available_date=@available_date,
        description=@description, appliances=@appliances, parking_available=@parking_available,
        parking_cost=@parking_cost, locker_available=@locker_available, locker_cost=@locker_cost,
        dogs_policy=@dogs_policy, status=@status, lat=@lat, lng=@lng, geocode_attempted=@geocode_attempted
      WHERE id=@id
    `).run({ ...u, id });
    return hydrate(db.prepare('SELECT * FROM units WHERE id = ?').get(id));
  },
  // Returns the storage keys of the deleted unit's photos so the caller can remove the files.
  async deleteUnit(id) {
    const keys = db.prepare('SELECT filename AS key FROM photos WHERE unit_id = ?').all(id).map((r) => r.key);
    db.prepare('DELETE FROM units WHERE id = ?').run(id);
    return keys;
  },
  async locatedUnitsExcept(id) {
    return db.prepare('SELECT * FROM units WHERE id != ? AND lat IS NOT NULL AND lng IS NOT NULL').all(id).map(hydrate);
  },

  // ── Geocoding support ────────────────────────────────────────
  async nextUnitNeedingGeocode() {
    return db.prepare(`
      SELECT id, address FROM units
      WHERE lat IS NULL AND geocode_attempted = 0 AND address IS NOT NULL AND address != ''
      ORDER BY id LIMIT 1
    `).get() || null;
  },
  async setCoords(id, lat, lng) {
    db.prepare('UPDATE units SET lat=?, lng=?, geocode_attempted=1 WHERE id=?').run(lat, lng, id);
  },
  async markGeocodeAttempted(id) {
    db.prepare('UPDATE units SET geocode_attempted=1 WHERE id=?').run(id);
  },
  async resetGeocode(id) {
    db.prepare('UPDATE units SET lat=NULL, lng=NULL, geocode_attempted=0 WHERE id=?').run(id);
  },

  // ── Photos ───────────────────────────────────────────────────
  async addPhotos(unitId, keys) {
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM photos WHERE unit_id = ?').get(unitId).m;
    const insert = db.prepare('INSERT INTO photos (unit_id, filename, sort_order) VALUES (?, ?, ?)');
    let order = maxOrder + 1;
    const out = [];
    for (const key of keys) {
      const info = insert.run(unitId, key, order++);
      out.push({ id: info.lastInsertRowid, key });
    }
    return out;
  },
  async getPhoto(id) {
    return db.prepare(`
      SELECT p.id, p.filename AS key, u.unit_code, u.title
      FROM photos p JOIN units u ON u.id = p.unit_id WHERE p.id = ?
    `).get(id) || null;
  },
  async listPhotos(unitId) {
    return photosFor(unitId);
  },
  async deletePhoto(id) {
    const photo = db.prepare('SELECT filename AS key FROM photos WHERE id = ?').get(id);
    if (!photo) return null;
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    return photo.key;
  },

  // ── Users ────────────────────────────────────────────────────
  async countUsers() {
    return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  },
  async countActiveMasters() {
    return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='master' AND active=1").get().n;
  },
  async getUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
  },
  async getActiveUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email) || null;
  },
  async getUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
  },
  async listUsers() {
    return db.prepare('SELECT id, email, name, role, active, created_at FROM users ORDER BY created_at').all();
  },
  async createUser({ email, name, role, salt, hash }) {
    const info = db.prepare('INSERT INTO users (email, name, role, salt, hash) VALUES (?, ?, ?, ?, ?)')
      .run(email, name, role, salt, hash);
    return db.prepare('SELECT id, email, name, role, active, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  },
  async updateUser(id, { name, role, active }) {
    db.prepare('UPDATE users SET name=?, role=?, active=? WHERE id=?').run(name, role, active ? 1 : 0, id);
    return db.prepare('SELECT id, email, name, role, active, created_at FROM users WHERE id = ?').get(id);
  },
  async setUserPassword(id, salt, hash) {
    db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash, id);
  },
  async setUserEmail(id, email) {
    db.prepare('UPDATE users SET email=? WHERE id=?').run(email, id);
  },
  async setUserOnboarded(id, v) {
    db.prepare('UPDATE users SET onboarded=? WHERE id=?').run(v ? 1 : 0, id);
  },
  async deleteUser(id) {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  // ── Sessions ─────────────────────────────────────────────────
  async createSession(userId, days) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + days * 864e5).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
    return { token, expires };
  },
  async getSession(token) {
    return db.prepare(`
      SELECT s.token, s.expires_at, u.id, u.email, u.name, u.role, u.active, u.onboarded
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
    `).get(token) || null;
  },
  async deleteSession(token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },

  // ── Appointments ─────────────────────────────────────────────
  async listAppointments({ from, to, unitId } = {}) {
    const clauses = [], params = {};
    if (from)   { clauses.push('start_at >= @from'); params.from = from; }
    if (to)     { clauses.push('start_at <= @to');   params.to = to; }
    if (unitId) { clauses.push('unit_id = @unitId'); params.unitId = unitId; }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.prepare(`SELECT * FROM appointments ${where} ORDER BY start_at`).all(params).map(hydrateAppt);
  },
  async getAppointment(id) {
    return hydrateAppt(db.prepare('SELECT * FROM appointments WHERE id = ?').get(id));
  },
  async createAppointment(a) {
    const info = db.prepare(`
      INSERT INTO appointments (unit_id, title, start_at, end_at, client_name, client_phone, client_email, notes, agent_id, status, created_by)
      VALUES (@unit_id, @title, @start_at, @end_at, @client_name, @client_phone, @client_email, @notes, @agent_id, @status, @created_by)
    `).run(a);
    return hydrateAppt(db.prepare('SELECT * FROM appointments WHERE id = ?').get(info.lastInsertRowid));
  },
  async updateAppointment(id, a) {
    db.prepare(`
      UPDATE appointments SET unit_id=@unit_id, title=@title, start_at=@start_at, end_at=@end_at,
        client_name=@client_name, client_phone=@client_phone, client_email=@client_email,
        notes=@notes, agent_id=@agent_id, status=@status WHERE id=@id
    `).run({ ...a, id });
    return hydrateAppt(db.prepare('SELECT * FROM appointments WHERE id = ?').get(id));
  },
  async deleteAppointment(id) {
    db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  },

  // ── Leads (CRM) ──────────────────────────────────────────────
  async listLeads() {
    return db.prepare('SELECT * FROM leads ORDER BY updated_at DESC, id DESC').all().map(hydrateLead);
  },
  async getLead(id) {
    return hydrateLead(db.prepare('SELECT * FROM leads WHERE id = ?').get(id));
  },
  async createLead(l) {
    const info = db.prepare(`
      INSERT INTO leads (name, email, phone, unit_id, agent_id, appointment_id, stage, source, budget, move_in, notes)
      VALUES (@name, @email, @phone, @unit_id, @agent_id, @appointment_id, @stage, @source, @budget, @move_in, @notes)
    `).run({ appointment_id: null, source: 'manual', budget: null, move_in: null, notes: null, ...l });
    return hydrateLead(db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid));
  },
  async updateLead(id, l) {
    db.prepare(`
      UPDATE leads SET name=@name, email=@email, phone=@phone, unit_id=@unit_id, agent_id=@agent_id,
        stage=@stage, budget=@budget, move_in=@move_in, notes=@notes, updated_at=CURRENT_TIMESTAMP WHERE id=@id
    `).run({ ...l, id });
    return hydrateLead(db.prepare('SELECT * FROM leads WHERE id = ?').get(id));
  },
  async setLeadStage(id, stage) {
    db.prepare('UPDATE leads SET stage=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(stage, id);
    return hydrateLead(db.prepare('SELECT * FROM leads WHERE id = ?').get(id));
  },
  async deleteLead(id) {
    db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  },

  // ── Blog posts ───────────────────────────────────────────────
  async listPosts({ publishedOnly = false } = {}) {
    const sql = publishedOnly
      ? "SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC, created_at DESC"
      : 'SELECT * FROM posts ORDER BY created_at DESC';
    return db.prepare(sql).all().map(hydratePost);
  },
  async getPostBySlug(slug, { publishedOnly = false } = {}) {
    const row = db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug);
    if (!row) return null;
    if (publishedOnly && row.status !== 'published') return null;
    return hydratePost(row);
  },
  async getPostById(id) {
    return hydratePost(db.prepare('SELECT * FROM posts WHERE id = ?').get(id));
  },
  async slugExists(slug, exceptId = null) {
    const row = exceptId
      ? db.prepare('SELECT id FROM posts WHERE slug = ? AND id != ?').get(slug, exceptId)
      : db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
    return !!row;
  },
  async createPost(p) {
    const info = db.prepare(`
      INSERT INTO posts (slug, title, excerpt, body, cover_image, status, author_id, published_at)
      VALUES (@slug, @title, @excerpt, @body, @cover_image, @status, @author_id, @published_at)
    `).run(p);
    return hydratePost(db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid));
  },
  async updatePost(id, p) {
    db.prepare(`
      UPDATE posts SET slug=@slug, title=@title, excerpt=@excerpt, body=@body,
        cover_image=@cover_image, status=@status, published_at=@published_at,
        updated_at=CURRENT_TIMESTAMP WHERE id=@id
    `).run({ ...p, id });
    return hydratePost(db.prepare('SELECT * FROM posts WHERE id = ?').get(id));
  },
  async deletePost(id) {
    const row = db.prepare('SELECT cover_image FROM posts WHERE id = ?').get(id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    return row ? row.cover_image : null;
  },

  // ── Tasks (master assigns; agents see only their own) ────────
  async listTasks({ agentId, from, to } = {}) {
    const clauses = [], params = {};
    if (agentId)  { clauses.push('agent_id = @agentId'); params.agentId = agentId; }
    if (from)     { clauses.push('(due_at IS NULL OR due_at >= @from)'); params.from = from; }
    if (to)       { clauses.push('(due_at IS NULL OR due_at <= @to)'); params.to = to; }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.prepare(`SELECT * FROM tasks ${where} ORDER BY due_at IS NULL, due_at, created_at`).all(params).map(hydrateTask);
  },
  async getTask(id) {
    return hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  },
  async createTask(t) {
    const info = db.prepare(`
      INSERT INTO tasks (title, description, unit_id, agent_id, due_at, status, created_by)
      VALUES (@title, @description, @unit_id, @agent_id, @due_at, @status, @created_by)
    `).run(t);
    return hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
  },
  async updateTask(id, t) {
    db.prepare(`
      UPDATE tasks SET title=@title, description=@description, unit_id=@unit_id, agent_id=@agent_id,
        due_at=@due_at, status=@status, updated_at=CURRENT_TIMESTAMP WHERE id=@id
    `).run({ ...t, id });
    return hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  },
  async setTaskStatus(id, status) {
    db.prepare('UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, id);
    return hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  },
  async deleteTask(id) {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  },

  // ── Notifications ────────────────────────────────────────────
  async createNotification(userId, message, link) {
    const info = db.prepare('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)').run(userId, message, link || null);
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid);
  },
  async listNotifications(userId, limit = 30) {
    return db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(userId, limit);
  },
  async countUnreadNotifications(userId) {
    return db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(userId).n;
  },
  async markNotificationRead(id, userId) {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  },
  async markAllNotificationsRead(userId) {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId);
  },

  // ── Posting rotation (distribute units across agents, no overlap) ──
  async getPostingCycle() {
    return db.prepare('SELECT COALESCE(MAX(cycle), 1) AS c FROM posting_assignments').get().c || 1;
  },
  async countAvailableUnits() {
    return db.prepare("SELECT COUNT(*) AS n FROM units WHERE status = 'available'").get().n;
  },
  async countAssignedInCycle(cycle) {
    return db.prepare('SELECT COUNT(*) AS n FROM posting_assignments WHERE cycle = ?').get(cycle).n;
  },
  // Next available units not yet claimed in this cycle, ordered for a stable rotation.
  async availableUnitsNotInCycle(cycle, limit) {
    return db.prepare(`
      SELECT * FROM units WHERE status = 'available'
        AND id NOT IN (SELECT unit_id FROM posting_assignments WHERE cycle = ?)
      ORDER BY id LIMIT ?
    `).all(cycle, limit).map(hydrate);
  },
  async assignUnitPosting(unitId, agentId, cycle, taskId) {
    db.prepare('INSERT OR IGNORE INTO posting_assignments (unit_id, agent_id, cycle, task_id) VALUES (?, ?, ?, ?)')
      .run(unitId, agentId, cycle, taskId || null);
  },
  async unitsForTasks(taskIds) {
    const map = {};
    if (!taskIds || !taskIds.length) return map;
    const ph = taskIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT pa.task_id AS _task_id, u.* FROM posting_assignments pa
      JOIN units u ON u.id = pa.unit_id
      WHERE pa.task_id IN (${ph}) ORDER BY pa.task_id, u.id
    `).all(...taskIds);
    for (const row of rows) {
      const taskId = row._task_id; delete row._task_id;
      (map[taskId] ||= []).push(hydrate(row));
    }
    return map;
  },
};

function hydratePost(row) {
  if (!row) return null;
  const author = row.author_id ? db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.author_id) : null;
  return { ...row, author };
}

function hydrateAppt(row) {
  if (!row) return null;
  const unit = row.unit_id ? db.prepare('SELECT id, title, unit_code, address FROM units WHERE id = ?').get(row.unit_id) : null;
  const agent = row.agent_id ? db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.agent_id) : null;
  return { ...row, unit, agent };
}

function hydrateTask(row) {
  if (!row) return null;
  const unit = row.unit_id ? db.prepare('SELECT id, title, unit_code, address FROM units WHERE id = ?').get(row.unit_id) : null;
  const agent = row.agent_id ? db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.agent_id) : null;
  return { ...row, unit, agent };
}

function hydrateLead(row) {
  if (!row) return null;
  const unit = row.unit_id ? db.prepare('SELECT id, title, unit_code, address FROM units WHERE id = ?').get(row.unit_id) : null;
  const agent = row.agent_id ? db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.agent_id) : null;
  return { ...row, unit, agent };
}
