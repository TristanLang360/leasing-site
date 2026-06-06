const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');
const { parse: parseCsv } = require('csv-parse/sync');

// ───────────────────────────────────────────────────────────────
// Config — set MASTER_EMAIL / MASTER_PASS before sharing the site.
// ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3030;
const DB_PATH = path.join(__dirname, 'rentalium.db');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MASTER_EMAIL = (process.env.MASTER_EMAIL || 'admin@rentalium.local').toLowerCase();
const MASTER_PASS = process.env.MASTER_PASS || 'rentalium';
const SESSION_COOKIE = 'rentalium_sess';
const SESSION_DAYS = 14;
const GEOCODE_USER_AGENT = 'Rentalium/1.0 (leasing site; contact admin)';

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ───────────────────────────────────────────────────────────────
// Database
// ───────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
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
`);

// Migration: add columns to pre-existing databases (idempotent).
const existingCols = new Set(db.prepare('PRAGMA table_info(units)').all().map((c) => c.name));
const addColumn = (name, ddl) => {
  if (!existingCols.has(name)) db.exec(`ALTER TABLE units ADD COLUMN ${ddl}`);
};
addColumn('appliances', 'appliances TEXT');
addColumn('parking_available', "parking_available TEXT NOT NULL DEFAULT 'no'");
addColumn('parking_cost', 'parking_cost INTEGER');
addColumn('locker_available', "locker_available TEXT NOT NULL DEFAULT 'no'");
addColumn('locker_cost', 'locker_cost INTEGER');
addColumn('dogs_policy', "dogs_policy TEXT NOT NULL DEFAULT 'no'");
addColumn('lat', 'lat REAL');
addColumn('lng', 'lng REAL');
addColumn('geocode_attempted', 'geocode_attempted INTEGER NOT NULL DEFAULT 0');

// Seed demo units on first run so the site isn't empty.
const unitCount = db.prepare('SELECT COUNT(*) AS n FROM units').get().n;
if (unitCount === 0) {
  const seed = db.prepare(`
    INSERT INTO units (unit_code, title, address, neighborhood, beds, baths, sqft, price, available_date, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seedRows = [
    ['A-304',    'Suite 304 — Loft',         '1420 Saint-Laurent, Montréal',   'Plateau',      1, 1, 720,  1850, '2026-06-15', 'Bright loft with exposed brick and tall windows.'],
    ['A-1102',   'Suite 1102 — City View',   '88 Rue Sherbrooke, Montréal',    'Downtown',     2, 2, 1050, 2400, '2026-07-01', 'Two-bedroom with downtown skyline views.'],
    ['A-Garden', 'Garden Studio',            '3025 Avenue Papineau, Montréal', 'Plateau',      0, 1, 540,  1650, '2026-06-20', 'Quiet ground-floor studio with private garden access.'],
    ['B-201',    'Suite 201 — Sun-filled',   '742 Rue Wellington, Montréal',   'Griffintown',  1, 1, 680,  1950, '2026-06-10', 'Corner unit, southern exposure.'],
  ];
  const insertMany = db.transaction((rows) => { for (const r of rows) seed.run(...r); });
  insertMany(seedRows);
}

// ───────────────────────────────────────────────────────────────
// Auth helpers (scrypt password hashing + DB-backed sessions)
// ───────────────────────────────────────────────────────────────
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Seed the master account on first run.
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const { salt, hash } = hashPassword(MASTER_PASS);
  db.prepare('INSERT INTO users (email, name, role, salt, hash) VALUES (?, ?, ?, ?, ?)')
    .run(MASTER_EMAIL, 'Master', 'master', salt, hash);
  console.log(`\n  Seeded master account: ${MASTER_EMAIL} / ${MASTER_PASS}  (change this!)\n`);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return { token, expires };
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.email, u.name, u.role, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  if (!row.active) return null;
  return row;
}

// Capability helpers
const can = {
  editUnits:   (r) => r === 'master' || r === 'agent',
  deleteUnits: (r) => r === 'master',
  manageUsers: (r) => r === 'master',
  calendar:    (r) => r === 'master' || r === 'agent',
  importCsv:   (r) => r === 'master' || r === 'agent',
};

function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not authenticated' });
  req.user = u;
  next();
}
function requireCap(capFn) {
  return (req, res, next) => {
    const u = req.user || currentUser(req);
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    req.user = u;
    if (!capFn(u.role)) return res.status(403).json({ error: 'You do not have permission for this action.' });
    next();
  };
}

// ───────────────────────────────────────────────────────────────
// Geocoding (free — OpenStreetMap Nominatim) + background queue
// ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const r = await fetch(url, { headers: { 'User-Agent': GEOCODE_USER_AGENT } });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j[0]) {
      const lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch (e) { /* network/offline — try again later */ }
  return null;
}

let geocoding = false;
async function processGeocodeQueue() {
  if (geocoding) return;
  geocoding = true;
  try {
    while (true) {
      const u = db.prepare(`
        SELECT id, address FROM units
        WHERE lat IS NULL AND geocode_attempted = 0 AND address IS NOT NULL AND address != ''
        ORDER BY id LIMIT 1
      `).get();
      if (!u) break;
      const g = await geocode(u.address);
      if (g) {
        db.prepare('UPDATE units SET lat=?, lng=?, geocode_attempted=1 WHERE id=?').run(g.lat, g.lng, u.id);
      } else {
        db.prepare('UPDATE units SET geocode_attempted=1 WHERE id=?').run(u.id);
      }
      await sleep(1100); // Nominatim asks for ≤1 request/second
    }
  } finally {
    geocoding = false;
  }
}
const kickGeocode = () => { processGeocodeQueue().catch(() => {}); };

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ───────────────────────────────────────────────────────────────
// App + middleware
// ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Block direct access to sensitive files before static serving.
app.use((req, res, next) => {
  const blocked = /(^\/server\.js$|^\/package(-lock)?\.json$|\.db($|-)|^\/node_modules\/|^\/private\/|^\/\.)/i;
  if (blocked.test(req.path)) return res.status(404).send('Not found');
  next();
});

// Static: public site files + uploaded photos
app.use(express.static(__dirname, { extensions: ['html'] }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1d' }));

// ───────────────────────────────────────────────────────────────
// Multer: photo uploads + CSV import
// ───────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safe = crypto.randomBytes(8).toString('hex') + ext;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed.'));
  },
});
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
function hydrateUnit(row) {
  if (!row) return null;
  const photos = db
    .prepare('SELECT id, filename, sort_order FROM photos WHERE unit_id = ? ORDER BY sort_order, id')
    .all(row.id)
    .map((p) => ({ id: p.id, url: `/uploads/${p.filename}`, filename: p.filename, sortOrder: p.sort_order }));
  return { ...row, photos };
}

function parseUnitBody(b) {
  const num = (v, fallback = null) => {
    if (v === '' || v === undefined || v === null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const yesNo = (v) => (v === 'yes' ? 'yes' : 'no');
  const parking_available = yesNo(b.parking_available);
  const locker_available = yesNo(b.locker_available);
  return {
    unit_code: (b.unit_code || '').trim() || null,
    title: (b.title || '').trim(),
    address: (b.address || '').trim(),
    neighborhood: (b.neighborhood || '').trim() || null,
    beds: num(b.beds, 0),
    baths: num(b.baths, 1),
    sqft: num(b.sqft, null),
    price: num(b.price, 0),
    available_date: (b.available_date || '').trim() || null,
    description: (b.description || '').trim() || null,
    appliances: (b.appliances || '').trim() || null,
    parking_available,
    parking_cost: parking_available === 'yes' ? num(b.parking_cost, null) : null,
    locker_available,
    locker_cost: locker_available === 'yes' ? num(b.locker_cost, null) : null,
    dogs_policy: ['yes', 'no', 'contact'].includes(b.dogs_policy) ? b.dogs_policy : 'no',
    status: ['available', 'hidden'].includes(b.status) ? b.status : 'available',
    lat: num(b.lat, null),
    lng: num(b.lng, null),
  };
}

// ───────────────────────────────────────────────────────────────
// Auth API
// ───────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const { token, expires } = createSession(user.id);
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expires).toUTCString()}`);
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const { id, email, name, role } = req.user;
  res.json({ id, email, name, role });
});

app.put('/api/me/password', requireAuth, (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.password || '');
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, user.salt, user.hash)) {
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }
  const { salt, hash } = hashPassword(next);
  db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash, user.id);
  res.json({ ok: true });
});

// ───────────────────────────────────────────────────────────────
// User management API (master only)
// ───────────────────────────────────────────────────────────────
const VALID_ROLES = ['master', 'agent', 'viewer'];

app.get('/api/users', requireCap(can.manageUsers), (req, res) => {
  const rows = db.prepare('SELECT id, email, name, role, active, created_at FROM users ORDER BY created_at').all();
  res.json(rows);
});

app.post('/api/users', requireCap(can.manageUsers), (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = (String(req.body.name || '').trim()) || null;
  const role = VALID_ROLES.includes(req.body.role) ? req.body.role : 'agent';
  const password = String(req.body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }
  const { salt, hash } = hashPassword(password);
  const info = db.prepare('INSERT INTO users (email, name, role, salt, hash) VALUES (?, ?, ?, ?, ?)')
    .run(email, name, role, salt, hash);
  const u = db.prepare('SELECT id, email, name, role, active, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(u);
});

app.put('/api/users/:id', requireCap(can.manageUsers), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const name = req.body.name !== undefined ? (String(req.body.name).trim() || null) : target.name;
  const role = VALID_ROLES.includes(req.body.role) ? req.body.role : target.role;
  let active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : target.active;

  // Guard: never strip the last active master of their role or access.
  if (target.role === 'master' && (role !== 'master' || active === 0)) {
    const masters = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='master' AND active=1").get().n;
    if (masters <= 1) return res.status(400).json({ error: 'You cannot demote or disable the last master account.' });
  }
  db.prepare('UPDATE users SET name=?, role=?, active=? WHERE id=?').run(name, role, active, target.id);
  if (req.body.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const { salt, hash } = hashPassword(String(req.body.password));
    db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash, target.id);
  }
  const u = db.prepare('SELECT id, email, name, role, active, created_at FROM users WHERE id = ?').get(target.id);
  res.json(u);
});

app.delete('/api/users/:id', requireCap(can.manageUsers), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  if (target.role === 'master') {
    const masters = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='master' AND active=1").get().n;
    if (masters <= 1) return res.status(400).json({ error: 'You cannot delete the last master account.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true });
});

// ───────────────────────────────────────────────────────────────
// Public unit API
// ───────────────────────────────────────────────────────────────
app.get('/api/units', (req, res) => {
  const wantAll = req.query.all === '1';
  if (wantAll && !currentUser(req)) return res.status(401).json({ error: 'Not authenticated' });
  const sql = wantAll
    ? 'SELECT * FROM units ORDER BY created_at DESC'
    : "SELECT * FROM units WHERE status = 'available' ORDER BY price ASC";
  res.json(db.prepare(sql).all().map(hydrateUnit));
});

app.get('/api/units/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(hydrateUnit(row));
});

// Nearby units (by straight-line distance in km). Auth required.
app.get('/api/units/:id/nearby', requireAuth, (req, res) => {
  const origin = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!origin) return res.status(404).json({ error: 'Not found' });
  if (origin.lat == null || origin.lng == null) {
    return res.json({ origin: { id: origin.id, lat: null, lng: null }, nearby: [], reason: 'no-coords' });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  const others = db.prepare('SELECT * FROM units WHERE id != ? AND lat IS NOT NULL AND lng IS NOT NULL').all(origin.id);
  const nearby = others
    .map((u) => ({ unit: hydrateUnit(u), km: haversineKm(origin.lat, origin.lng, u.lat, u.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
    .map(({ unit, km }) => ({ ...unit, distance_km: Math.round(km * 10) / 10 }));
  res.json({ origin: { id: origin.id, lat: origin.lat, lng: origin.lng }, nearby });
});

// ───────────────────────────────────────────────────────────────
// Admin page (any authenticated staff) + login page
// ───────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  if (!currentUser(req)) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});
app.get('/admin.js', (req, res) => {
  if (!currentUser(req)) return res.status(401).send('Not authenticated');
  res.type('application/javascript').sendFile(path.join(__dirname, 'private', 'admin.js'));
});

// ───────────────────────────────────────────────────────────────
// Unit write API
// ───────────────────────────────────────────────────────────────
app.post('/api/units', requireCap(can.editUnits), (req, res) => {
  const u = parseUnitBody(req.body);
  if (!u.title || !u.address) return res.status(400).json({ error: 'title and address are required' });
  const attempted = (u.lat != null && u.lng != null) ? 1 : 0;
  const info = db.prepare(`
    INSERT INTO units (unit_code, title, address, neighborhood, beds, baths, sqft, price, available_date, description,
      appliances, parking_available, parking_cost, locker_available, locker_cost, dogs_policy, status, lat, lng, geocode_attempted)
    VALUES (@unit_code, @title, @address, @neighborhood, @beds, @baths, @sqft, @price, @available_date, @description,
      @appliances, @parking_available, @parking_cost, @locker_available, @locker_cost, @dogs_policy, @status, @lat, @lng, @attempted)
  `).run({ ...u, attempted });
  kickGeocode();
  res.status(201).json(hydrateUnit(db.prepare('SELECT * FROM units WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/units/:id', requireCap(can.editUnits), (req, res) => {
  const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const u = parseUnitBody(req.body);
  if (!u.title || !u.address) return res.status(400).json({ error: 'title and address are required' });

  // Coordinate strategy:
  //  - explicit lat & lng in the request → use them (manual override)
  //  - address changed and no manual coords → clear coords so the queue re-geocodes
  //  - otherwise keep what we have
  let lat = existing.lat, lng = existing.lng, attempted = existing.geocode_attempted;
  if (u.lat != null && u.lng != null) {
    lat = u.lat; lng = u.lng; attempted = 1;
  } else if (u.address !== existing.address) {
    lat = null; lng = null; attempted = 0;
  }

  db.prepare(`
    UPDATE units SET unit_code=@unit_code, title=@title, address=@address, neighborhood=@neighborhood,
      beds=@beds, baths=@baths, sqft=@sqft, price=@price, available_date=@available_date,
      description=@description, appliances=@appliances, parking_available=@parking_available,
      parking_cost=@parking_cost, locker_available=@locker_available, locker_cost=@locker_cost,
      dogs_policy=@dogs_policy, status=@status, lat=@lat, lng=@lng, geocode_attempted=@attempted
    WHERE id=@id
  `).run({ ...u, lat, lng, attempted, id: existing.id });
  kickGeocode();
  res.json(hydrateUnit(db.prepare('SELECT * FROM units WHERE id = ?').get(existing.id)));
});

app.delete('/api/units/:id', requireCap(can.deleteUnits), (req, res) => {
  const photos = db.prepare('SELECT filename FROM photos WHERE unit_id = ?').all(req.params.id);
  db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id);
  for (const p of photos) {
    fs.promises.unlink(path.join(UPLOAD_DIR, p.filename)).catch(() => {});
  }
  res.json({ ok: true });
});

// Re-geocode a single unit on demand.
app.post('/api/units/:id/geocode', requireCap(can.editUnits), (req, res) => {
  const u = db.prepare('SELECT id FROM units WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE units SET lat=NULL, lng=NULL, geocode_attempted=0 WHERE id=?').run(u.id);
  kickGeocode();
  res.json({ ok: true, queued: true });
});

// ───────────────────────────────────────────────────────────────
// CSV import
// ───────────────────────────────────────────────────────────────
const CSV_FIELD_ALIASES = {
  unit_code: ['unit_code', 'code', 'unit', 'unit code'],
  title: ['title', 'name', 'listing'],
  address: ['address', 'addr', 'street'],
  neighborhood: ['neighborhood', 'neighbourhood', 'area', 'district'],
  beds: ['beds', 'bedrooms', 'bed', 'br'],
  baths: ['baths', 'bathrooms', 'bath', 'ba'],
  sqft: ['sqft', 'sq ft', 'square feet', 'size', 'area_sqft'],
  price: ['price', 'rent', 'monthly rent', 'rent_month'],
  available_date: ['available_date', 'available', 'avail', 'date available', 'move in'],
  description: ['description', 'desc', 'notes'],
  appliances: ['appliances'],
  parking_available: ['parking_available', 'parking'],
  parking_cost: ['parking_cost', 'parking price'],
  locker_available: ['locker_available', 'locker'],
  locker_cost: ['locker_cost', 'locker price'],
  dogs_policy: ['dogs_policy', 'dogs', 'pets', 'pet policy'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'lon', 'long', 'longitude'],
};

function mapCsvRow(row) {
  // Build a lowercase-keyed lookup of the row.
  const lower = {};
  for (const k of Object.keys(row)) lower[k.trim().toLowerCase()] = row[k];
  const out = {};
  for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
    for (const a of aliases) {
      if (lower[a] !== undefined && String(lower[a]).trim() !== '') { out[field] = String(lower[a]).trim(); break; }
    }
  }
  // Normalize yes/no-ish columns.
  const truthy = (v) => /^(y|yes|true|1|available)$/i.test(String(v || '').trim());
  if (out.parking_available !== undefined) out.parking_available = truthy(out.parking_available) ? 'yes' : 'no';
  if (out.locker_available !== undefined) out.locker_available = truthy(out.locker_available) ? 'yes' : 'no';
  if (out.dogs_policy !== undefined) {
    const d = String(out.dogs_policy).toLowerCase();
    out.dogs_policy = /contact/.test(d) ? 'contact' : (truthy(d) ? 'yes' : 'no');
  }
  return out;
}

app.post('/api/units/import', requireCap(can.importCsv), csvUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });
  let records;
  try {
    records = parseCsv(req.file.buffer.toString('utf8'), {
      columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true,
    });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
  }
  const insert = db.prepare(`
    INSERT INTO units (unit_code, title, address, neighborhood, beds, baths, sqft, price, available_date, description,
      appliances, parking_available, parking_cost, locker_available, locker_cost, dogs_policy, status, lat, lng, geocode_attempted)
    VALUES (@unit_code, @title, @address, @neighborhood, @beds, @baths, @sqft, @price, @available_date, @description,
      @appliances, @parking_available, @parking_cost, @locker_available, @locker_cost, @dogs_policy, @status, @lat, @lng, @attempted)
  `);
  let imported = 0;
  const errors = [];
  const run = db.transaction((rows) => {
    rows.forEach((raw, i) => {
      const mapped = mapCsvRow(raw);
      const u = parseUnitBody(mapped);
      if (!u.title || !u.address) {
        errors.push({ row: i + 2, error: 'Missing title or address' });
        return;
      }
      const attempted = (u.lat != null && u.lng != null) ? 1 : 0;
      insert.run({ ...u, attempted });
      imported++;
    });
  });
  run(records);
  kickGeocode();
  res.json({ imported, skipped: errors.length, total: records.length, errors: errors.slice(0, 25) });
});

// ───────────────────────────────────────────────────────────────
// Photos
// ───────────────────────────────────────────────────────────────
app.post('/api/units/:id/photos', requireCap(can.editUnits), upload.array('photos', 20), (req, res) => {
  const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM photos WHERE unit_id = ?').get(unit.id).m;
  const insert = db.prepare('INSERT INTO photos (unit_id, filename, sort_order) VALUES (?, ?, ?)');
  const inserted = [];
  let order = maxOrder + 1;
  for (const f of req.files || []) {
    const info = insert.run(unit.id, f.filename, order++);
    inserted.push({ id: info.lastInsertRowid, url: `/uploads/${f.filename}`, filename: f.filename });
  }
  res.status(201).json({ photos: inserted });
});

app.delete('/api/photos/:id', requireCap(can.editUnits), (req, res) => {
  const photo = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  fs.promises.unlink(path.join(UPLOAD_DIR, photo.filename)).catch(() => {});
  res.json({ ok: true });
});

// Download a single photo (forces "Save as", keeps a friendly filename).
app.get('/api/photos/:id/download', requireAuth, (req, res) => {
  const photo = db.prepare('SELECT p.filename, u.unit_code, u.title FROM photos p JOIN units u ON u.id = p.unit_id WHERE p.id = ?').get(req.params.id);
  if (!photo) return res.status(404).send('Not found');
  const ext = path.extname(photo.filename) || '.jpg';
  const base = (photo.unit_code || photo.title || 'photo').replace(/[^a-z0-9._-]+/gi, '-');
  res.download(path.join(UPLOAD_DIR, photo.filename), `${base}-${req.params.id}${ext}`);
});

// Download ALL of a unit's photos as a single zip (for agents building listings).
app.get('/api/units/:id/photos.zip', requireAuth, (req, res) => {
  const unit = db.prepare('SELECT id, unit_code, title FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).send('Not found');
  const photos = db.prepare('SELECT filename, sort_order FROM photos WHERE unit_id = ? ORDER BY sort_order, id').all(unit.id);
  if (photos.length === 0) return res.status(404).send('This unit has no photos.');

  const base = (unit.unit_code || unit.title || `unit-${unit.id}`).replace(/[^a-z0-9._-]+/gi, '-');
  res.attachment(`${base}-photos.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { console.error(err); try { res.status(500).end(); } catch {} });
  archive.pipe(res);
  photos.forEach((p, i) => {
    const ext = path.extname(p.filename) || '.jpg';
    const filePath = path.join(UPLOAD_DIR, p.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: `${base}-${String(i + 1).padStart(2, '0')}${ext}` });
    }
  });
  archive.finalize();
});

// ───────────────────────────────────────────────────────────────
// Calendar / appointments
// ───────────────────────────────────────────────────────────────
function parseApptBody(b) {
  const num = (v) => {
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    unit_id: num(b.unit_id),
    title: (b.title || '').trim() || 'Showing',
    start_at: (b.start_at || '').trim(),
    end_at: (b.end_at || '').trim() || null,
    client_name: (b.client_name || '').trim() || null,
    client_phone: (b.client_phone || '').trim() || null,
    client_email: (b.client_email || '').trim() || null,
    notes: (b.notes || '').trim() || null,
    agent_id: num(b.agent_id),
    status: ['scheduled', 'done', 'canceled'].includes(b.status) ? b.status : 'scheduled',
  };
}
function hydrateAppt(row) {
  if (!row) return null;
  const unit = row.unit_id ? db.prepare('SELECT id, title, unit_code, address FROM units WHERE id = ?').get(row.unit_id) : null;
  const agent = row.agent_id ? db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.agent_id) : null;
  return { ...row, unit, agent };
}

app.get('/api/appointments', requireAuth, (req, res) => {
  const clauses = [];
  const params = {};
  if (req.query.from) { clauses.push('start_at >= @from'); params.from = req.query.from; }
  if (req.query.to)   { clauses.push('start_at <= @to');   params.to = req.query.to; }
  if (req.query.unit_id) { clauses.push('unit_id = @unit_id'); params.unit_id = req.query.unit_id; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM appointments ${where} ORDER BY start_at`).all(params);
  res.json(rows.map(hydrateAppt));
});

app.post('/api/appointments', requireCap(can.calendar), (req, res) => {
  const a = parseApptBody(req.body);
  if (!a.start_at) return res.status(400).json({ error: 'A start date/time is required.' });
  const info = db.prepare(`
    INSERT INTO appointments (unit_id, title, start_at, end_at, client_name, client_phone, client_email, notes, agent_id, status, created_by)
    VALUES (@unit_id, @title, @start_at, @end_at, @client_name, @client_phone, @client_email, @notes, @agent_id, @status, @created_by)
  `).run({ ...a, created_by: req.user.id });
  res.status(201).json(hydrateAppt(db.prepare('SELECT * FROM appointments WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/appointments/:id', requireCap(can.calendar), (req, res) => {
  const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const a = parseApptBody(req.body);
  if (!a.start_at) return res.status(400).json({ error: 'A start date/time is required.' });
  db.prepare(`
    UPDATE appointments SET unit_id=@unit_id, title=@title, start_at=@start_at, end_at=@end_at,
      client_name=@client_name, client_phone=@client_phone, client_email=@client_email,
      notes=@notes, agent_id=@agent_id, status=@status WHERE id=@id
  `).run({ ...a, id: existing.id });
  res.json(hydrateAppt(db.prepare('SELECT * FROM appointments WHERE id = ?').get(existing.id)));
});

app.delete('/api/appointments/:id', requireCap(can.calendar), (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ───────────────────────────────────────────────────────────────
// Error handler + boot
// ───────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Request failed' });
});

app.listen(PORT, () => {
  console.log(`\nRentalium running.`);
  console.log(`  Public site:  http://localhost:${PORT}/`);
  console.log(`  Staff login:  http://localhost:${PORT}/login`);
  console.log(`  Admin panel:  http://localhost:${PORT}/admin\n`);
  kickGeocode(); // backfill coordinates for any units missing them
});
