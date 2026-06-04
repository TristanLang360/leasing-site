const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ───────────────────────────────────────────────────────────────
// Config — change ADMIN_PASS before sharing the site with anyone.
// ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3030;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'rentalium';
const DB_PATH = path.join(__dirname, 'rentalium.db');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

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

// Seed a handful of demo units on first run so the site isn't empty.
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
// App + middleware
// ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Static: site files + uploaded photos
app.use(express.static(__dirname, { extensions: ['html'] }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1d' }));

// Basic auth for anything under /admin (HTML page + write APIs)
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    const user = decoded.slice(0, i);
    const pass = decoded.slice(i + 1);
    if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Rentalium admin", charset="UTF-8"');
  res.status(401).send('Authentication required.');
}

// ───────────────────────────────────────────────────────────────
// Multer: photo uploads
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

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
function hydrateUnit(row) {
  if (!row) return null;
  const photos = db
    .prepare('SELECT id, filename, sort_order FROM photos WHERE unit_id = ? ORDER BY sort_order, id')
    .all(row.id)
    .map((p) => ({ id: p.id, url: `/uploads/${p.filename}`, sortOrder: p.sort_order }));
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
    // Only keep a cost when parking is actually offered.
    parking_cost: parking_available === 'yes' ? num(b.parking_cost, null) : null,
    locker_available,
    locker_cost: locker_available === 'yes' ? num(b.locker_cost, null) : null,
    dogs_policy: ['yes', 'no', 'contact'].includes(b.dogs_policy) ? b.dogs_policy : 'no',
    status: ['available', 'hidden'].includes(b.status) ? b.status : 'available',
  };
}

// ───────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────
app.get('/api/units', (req, res) => {
  const onlyAvailable = req.query.all !== '1';
  const sql = onlyAvailable
    ? "SELECT * FROM units WHERE status = 'available' ORDER BY price ASC"
    : 'SELECT * FROM units ORDER BY created_at DESC';
  res.json(db.prepare(sql).all().map(hydrateUnit));
});

app.get('/api/units/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(hydrateUnit(row));
});

// ───────────────────────────────────────────────────────────────
// Admin page + write APIs (all behind basic auth)
// ───────────────────────────────────────────────────────────────
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});
app.get('/admin.js', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'admin.js'));
});

app.post('/api/units', requireAdmin, (req, res) => {
  const u = parseUnitBody(req.body);
  if (!u.title || !u.address) return res.status(400).json({ error: 'title and address are required' });
  const info = db.prepare(`
    INSERT INTO units (unit_code, title, address, neighborhood, beds, baths, sqft, price, available_date, description,
      appliances, parking_available, parking_cost, locker_available, locker_cost, dogs_policy, status)
    VALUES (@unit_code, @title, @address, @neighborhood, @beds, @baths, @sqft, @price, @available_date, @description,
      @appliances, @parking_available, @parking_cost, @locker_available, @locker_cost, @dogs_policy, @status)
  `).run(u);
  res.status(201).json(hydrateUnit(db.prepare('SELECT * FROM units WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/units/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const u = parseUnitBody(req.body);
  db.prepare(`
    UPDATE units SET unit_code=@unit_code, title=@title, address=@address, neighborhood=@neighborhood,
      beds=@beds, baths=@baths, sqft=@sqft, price=@price, available_date=@available_date,
      description=@description, status=@status
    WHERE id=@id
  `).run({ ...u, id: existing.id });
  res.json(hydrateUnit(db.prepare('SELECT * FROM units WHERE id = ?').get(existing.id)));
});

app.delete('/api/units/:id', requireAdmin, (req, res) => {
  const photos = db.prepare('SELECT filename FROM photos WHERE unit_id = ?').all(req.params.id);
  db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id);
  for (const p of photos) {
    fs.promises.unlink(path.join(UPLOAD_DIR, p.filename)).catch(() => {});
  }
  res.json({ ok: true });
});

app.post('/api/units/:id/photos', requireAdmin, upload.array('photos', 20), (req, res) => {
  const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM photos WHERE unit_id = ?').get(unit.id).m;
  const insert = db.prepare('INSERT INTO photos (unit_id, filename, sort_order) VALUES (?, ?, ?)');
  const inserted = [];
  let order = maxOrder + 1;
  for (const f of req.files || []) {
    const info = insert.run(unit.id, f.filename, order++);
    inserted.push({ id: info.lastInsertRowid, url: `/uploads/${f.filename}` });
  }
  res.status(201).json({ photos: inserted });
});

app.delete('/api/photos/:id', requireAdmin, (req, res) => {
  const photo = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  fs.promises.unlink(path.join(UPLOAD_DIR, photo.filename)).catch(() => {});
  res.json({ ok: true });
});

// Error handler for multer / others
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Request failed' });
});

app.listen(PORT, () => {
  console.log(`\nRentalium running.`);
  console.log(`  Public site:  http://localhost:${PORT}/`);
  console.log(`  Admin panel:  http://localhost:${PORT}/admin   (user: ${ADMIN_USER} / pass: ${ADMIN_PASS})\n`);
});
