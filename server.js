const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const { parse: parseCsv } = require('csv-parse/sync');
const { marked } = require('marked');

const config = require('./config');
const repo = require('./lib/repo');
const createStorage = require('./lib/storage');
const storage = createStorage(config.storage);

// ───────────────────────────────────────────────────────────────
// Small async-error wrapper so handlers can just throw / await.
// ───────────────────────────────────────────────────────────────
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
async function currentUser(req) {
  const token = parseCookies(req)[config.session.cookie];
  if (!token) return null;
  const row = await repo.getSession(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) { await repo.deleteSession(token); return null; }
  if (!row.active) return null;
  return row;
}

// Capability helpers (mirrored on the client in admin.js)
const can = {
  editUnits:   (r) => r === 'master' || r === 'agent',
  deleteUnits: (r) => r === 'master',
  manageUsers: (r) => r === 'master',
  calendar:    (r) => r === 'master' || r === 'agent',
  importCsv:   (r) => r === 'master' || r === 'agent',
  blog:        (r) => r === 'master' || r === 'agent',
};
const requireAuth = wrap(async (req, res, next) => {
  const u = await currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not authenticated' });
  req.user = u; next();
});
const requireCap = (capFn) => wrap(async (req, res, next) => {
  const u = req.user || await currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not authenticated' });
  req.user = u;
  if (!capFn(u.role)) return res.status(403).json({ error: 'You do not have permission for this action.' });
  next();
});

// ───────────────────────────────────────────────────────────────
// Seed the master account on first run.
// ───────────────────────────────────────────────────────────────
async function seedMaster() {
  if (await repo.countUsers() > 0) return;
  const { salt, hash } = hashPassword(config.master.pass);
  await repo.createUser({ email: config.master.email, name: 'Master', role: 'master', salt, hash });
  console.log(`\n  Seeded master account: ${config.master.email} / ${config.master.pass}  (change this!)\n`);
}

// ───────────────────────────────────────────────────────────────
// Geocoding (free OpenStreetMap Nominatim) + background queue
// ───────────────────────────────────────────────────────────────
async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const r = await fetch(url, { headers: { 'User-Agent': config.geocode.userAgent } });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j[0]) {
      const lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch { /* offline — try again later */ }
  return null;
}
let geocoding = false;
async function processGeocodeQueue() {
  if (geocoding) return;
  geocoding = true;
  try {
    while (true) {
      const u = await repo.nextUnitNeedingGeocode();
      if (!u) break;
      const g = await geocode(u.address);
      if (g) await repo.setCoords(u.id, g.lat, g.lng);
      else await repo.markGeocodeAttempted(u.id);
      await sleep(1100); // Nominatim asks for ≤1 request/second
    }
  } finally { geocoding = false; }
}
const kickGeocode = () => { processGeocodeQueue().catch(() => {}); };

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ───────────────────────────────────────────────────────────────
// Presentation: turn stored photo keys into URLs via the storage driver.
// ───────────────────────────────────────────────────────────────
function present(unit) {
  if (!unit) return null;
  const photos = (unit.photos || []).map((p) => ({
    id: p.id, url: storage.publicUrl(p.key), filename: p.key, sortOrder: p.sort_order,
  }));
  return { ...unit, photos };
}

// ───────────────────────────────────────────────────────────────
// App + middleware
// ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Block direct access to sensitive files / source before static serving.
app.use((req, res, next) => {
  const blocked = /(^\/server\.js$|^\/config\.js$|^\/lib\/|^\/admin-app\/|^\/package(-lock)?\.json$|\.sql$|\.db($|-)|^\/node_modules\/|^\/private\/|^\/\.)/i;
  if (blocked.test(req.path)) return res.status(404).send('Not found');
  next();
});

// Admin SPA (Vite + React + shadcn build) served under /admin.
// The app handles login itself (shows the sign-in screen when /api/me is 401),
// so the HTML is open while every /api write stays protected server-side.
const ADMIN_DIST = path.join(__dirname, 'admin-dist');
const ADMIN_INDEX = path.join(ADMIN_DIST, 'index.html');
app.use('/admin', express.static(ADMIN_DIST));
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  if (!fs.existsSync(ADMIN_INDEX)) {
    return res.status(503).type('html').send(
      '<h1>Admin app not built</h1><p>Run <code>npm run build:admin</code>, then reload.</p>');
  }
  res.sendFile(ADMIN_INDEX);
});

// Static: public site files. Local photo uploads are served from disk;
// with the Supabase driver, photo URLs point at the bucket instead.
app.use(express.static(__dirname, { extensions: ['html'] }));
if (storage.driver === 'local') {
  app.use(config.storage.publicPath, express.static(config.storage.uploadDir, { maxAge: '1d' }));
}

// Multer — photos kept in memory so the storage driver decides where they land.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed.'));
  },
});
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ───────────────────────────────────────────────────────────────
// Unit body parsing
// ───────────────────────────────────────────────────────────────
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
app.post('/api/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await repo.getActiveUserByEmail(email);
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const { token, expires } = await repo.createSession(user.id, config.session.days);
  res.setHeader('Set-Cookie',
    `${config.session.cookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expires).toUTCString()}`);
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}));

app.post('/api/logout', wrap(async (req, res) => {
  const token = parseCookies(req)[config.session.cookie];
  if (token) await repo.deleteSession(token);
  res.setHeader('Set-Cookie', `${config.session.cookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
}));

app.get('/api/me', requireAuth, (req, res) => {
  const { id, email, name, role } = req.user;
  res.json({ id, email, name, role });
});

app.put('/api/me/password', requireAuth, wrap(async (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.password || '');
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const user = await repo.getUserById(req.user.id);
  if (!verifyPassword(current, user.salt, user.hash)) {
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }
  const { salt, hash } = hashPassword(next);
  await repo.setUserPassword(user.id, salt, hash);
  res.json({ ok: true });
}));

// ───────────────────────────────────────────────────────────────
// User management API (master only)
// ───────────────────────────────────────────────────────────────
const VALID_ROLES = ['master', 'agent', 'viewer'];

app.get('/api/users', requireCap(can.manageUsers), wrap(async (req, res) => {
  res.json(await repo.listUsers());
}));

app.post('/api/users', requireCap(can.manageUsers), wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = (String(req.body.name || '').trim()) || null;
  const role = VALID_ROLES.includes(req.body.role) ? req.body.role : 'agent';
  const password = String(req.body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (await repo.getUserByEmail(email)) return res.status(409).json({ error: 'A user with that email already exists.' });
  const { salt, hash } = hashPassword(password);
  res.status(201).json(await repo.createUser({ email, name, role, salt, hash }));
}));

app.put('/api/users/:id', requireCap(can.manageUsers), wrap(async (req, res) => {
  const target = await repo.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const name = req.body.name !== undefined ? (String(req.body.name).trim() || null) : target.name;
  const role = VALID_ROLES.includes(req.body.role) ? req.body.role : target.role;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : target.active;

  if (target.role === 'master' && (role !== 'master' || active === 0)) {
    if (await repo.countActiveMasters() <= 1) {
      return res.status(400).json({ error: 'You cannot demote or disable the last master account.' });
    }
  }
  const updated = await repo.updateUser(target.id, { name, role, active });
  if (req.body.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const { salt, hash } = hashPassword(String(req.body.password));
    await repo.setUserPassword(target.id, salt, hash);
  }
  res.json(updated);
}));

app.delete('/api/users/:id', requireCap(can.manageUsers), wrap(async (req, res) => {
  const target = await repo.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  if (target.role === 'master' && await repo.countActiveMasters() <= 1) {
    return res.status(400).json({ error: 'You cannot delete the last master account.' });
  }
  await repo.deleteUser(target.id);
  res.json({ ok: true });
}));

// ───────────────────────────────────────────────────────────────
// Public unit API
// ───────────────────────────────────────────────────────────────
app.get('/api/units', wrap(async (req, res) => {
  const wantAll = req.query.all === '1';
  if (wantAll && !(await currentUser(req))) return res.status(401).json({ error: 'Not authenticated' });
  res.json((await repo.listUnits({ all: wantAll })).map(present));
}));

app.get('/api/units/:id', wrap(async (req, res) => {
  const unit = await repo.getUnit(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Not found' });
  res.json(present(unit));
}));

app.get('/api/units/:id/nearby', requireAuth, wrap(async (req, res) => {
  const origin = await repo.getUnit(req.params.id);
  if (!origin) return res.status(404).json({ error: 'Not found' });
  if (origin.lat == null || origin.lng == null) {
    return res.json({ origin: { id: origin.id, lat: null, lng: null }, nearby: [], reason: 'no-coords' });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  const others = await repo.locatedUnitsExcept(origin.id);
  const nearby = others
    .map((u) => ({ unit: u, km: haversineKm(origin.lat, origin.lng, u.lat, u.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
    .map(({ unit, km }) => ({ ...present(unit), distance_km: Math.round(km * 10) / 10 }));
  res.json({ origin: { id: origin.id, lat: origin.lat, lng: origin.lng }, nearby });
}));

// ───────────────────────────────────────────────────────────────
// Unit write API
// ───────────────────────────────────────────────────────────────
app.post('/api/units', requireCap(can.editUnits), wrap(async (req, res) => {
  const u = parseUnitBody(req.body);
  if (!u.title || !u.address) return res.status(400).json({ error: 'title and address are required' });
  const geocode_attempted = (u.lat != null && u.lng != null) ? 1 : 0;
  const unit = await repo.createUnit({ ...u, geocode_attempted });
  kickGeocode();
  res.status(201).json(present(unit));
}));

app.put('/api/units/:id', requireCap(can.editUnits), wrap(async (req, res) => {
  const existing = await repo.getUnit(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const u = parseUnitBody(req.body);
  if (!u.title || !u.address) return res.status(400).json({ error: 'title and address are required' });

  // Coordinate strategy:
  //  - explicit lat & lng → manual override
  //  - address changed and no manual coords → clear so the queue re-geocodes
  //  - otherwise keep existing
  let lat = existing.lat, lng = existing.lng, geocode_attempted = existing.geocode_attempted;
  if (u.lat != null && u.lng != null) { lat = u.lat; lng = u.lng; geocode_attempted = 1; }
  else if (u.address !== existing.address) { lat = null; lng = null; geocode_attempted = 0; }

  const unit = await repo.updateUnit(existing.id, { ...u, lat, lng, geocode_attempted });
  kickGeocode();
  res.json(present(unit));
}));

app.delete('/api/units/:id', requireCap(can.deleteUnits), wrap(async (req, res) => {
  const keys = await repo.deleteUnit(req.params.id);
  for (const key of keys) await storage.remove(key);
  res.json({ ok: true });
}));

app.post('/api/units/:id/geocode', requireCap(can.editUnits), wrap(async (req, res) => {
  const unit = await repo.getUnit(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Not found' });
  await repo.resetGeocode(unit.id);
  kickGeocode();
  res.json({ ok: true, queued: true });
}));

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
  const lower = {};
  for (const k of Object.keys(row)) lower[k.trim().toLowerCase()] = row[k];
  const out = {};
  for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
    for (const a of aliases) {
      if (lower[a] !== undefined && String(lower[a]).trim() !== '') { out[field] = String(lower[a]).trim(); break; }
    }
  }
  const truthy = (v) => /^(y|yes|true|1|available)$/i.test(String(v || '').trim());
  if (out.parking_available !== undefined) out.parking_available = truthy(out.parking_available) ? 'yes' : 'no';
  if (out.locker_available !== undefined) out.locker_available = truthy(out.locker_available) ? 'yes' : 'no';
  if (out.dogs_policy !== undefined) {
    const d = String(out.dogs_policy).toLowerCase();
    out.dogs_policy = /contact/.test(d) ? 'contact' : (truthy(d) ? 'yes' : 'no');
  }
  return out;
}

app.post('/api/units/import', requireCap(can.importCsv), csvUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });
  let records;
  try {
    records = parseCsv(req.file.buffer.toString('utf8'), {
      columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true,
    });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
  }
  const valid = [];
  const errors = [];
  records.forEach((raw, i) => {
    const u = parseUnitBody(mapCsvRow(raw));
    if (!u.title || !u.address) { errors.push({ row: i + 2, error: 'Missing title or address' }); return; }
    valid.push({ ...u, geocode_attempted: (u.lat != null && u.lng != null) ? 1 : 0 });
  });
  const imported = await repo.createUnitsBulk(valid);
  kickGeocode();
  res.json({ imported, skipped: errors.length, total: records.length, errors: errors.slice(0, 25) });
}));

// ───────────────────────────────────────────────────────────────
// Photos
// ───────────────────────────────────────────────────────────────
app.post('/api/units/:id/photos', requireCap(can.editUnits), upload.array('photos', 20), wrap(async (req, res) => {
  const unit = await repo.getUnit(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  const keys = [];
  for (const f of req.files || []) {
    keys.push(await storage.save({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype }));
  }
  const added = await repo.addPhotos(unit.id, keys);
  res.status(201).json({ photos: added.map((p) => ({ id: p.id, url: storage.publicUrl(p.key), filename: p.key })) });
}));

app.delete('/api/photos/:id', requireCap(can.editUnits), wrap(async (req, res) => {
  const key = await repo.deletePhoto(req.params.id);
  if (!key) return res.status(404).json({ error: 'Not found' });
  await storage.remove(key);
  res.json({ ok: true });
}));

app.get('/api/photos/:id/download', requireAuth, wrap(async (req, res) => {
  const photo = await repo.getPhoto(req.params.id);
  if (!photo) return res.status(404).send('Not found');
  const ext = path.extname(photo.key) || '.jpg';
  const base = (photo.unit_code || photo.title || 'photo').replace(/[^a-z0-9._-]+/gi, '-');
  const buffer = await storage.getBuffer(photo.key);
  res.setHeader('Content-Disposition', `attachment; filename="${base}-${photo.id}${ext}"`);
  res.type(ext).send(buffer);
}));

app.get('/api/units/:id/photos.zip', requireAuth, wrap(async (req, res) => {
  const unit = await repo.getUnit(req.params.id);
  if (!unit) return res.status(404).send('Not found');
  const photos = await repo.listPhotos(unit.id);
  if (photos.length === 0) return res.status(404).send('This unit has no photos.');

  const base = (unit.unit_code || unit.title || `unit-${unit.id}`).replace(/[^a-z0-9._-]+/gi, '-');
  // Fetch all bytes up front (works for both local disk and Supabase).
  const files = [];
  for (let i = 0; i < photos.length; i++) {
    try {
      const buffer = await storage.getBuffer(photos[i].key);
      const ext = path.extname(photos[i].key) || '.jpg';
      files.push({ name: `${base}-${String(i + 1).padStart(2, '0')}${ext}`, buffer });
    } catch (e) { /* skip a missing object */ }
  }
  if (files.length === 0) return res.status(404).send('Photos could not be read.');

  res.attachment(`${base}-photos.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { console.error(err); try { res.status(500).end(); } catch {} });
  archive.pipe(res);
  for (const f of files) archive.append(f.buffer, { name: f.name });
  archive.finalize();
}));

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
    status: ['requested', 'scheduled', 'done', 'canceled'].includes(b.status) ? b.status : 'scheduled',
  };
}

app.get('/api/appointments', requireAuth, wrap(async (req, res) => {
  res.json(await repo.listAppointments({ from: req.query.from, to: req.query.to, unitId: req.query.unit_id }));
}));

app.post('/api/appointments', requireCap(can.calendar), wrap(async (req, res) => {
  const a = parseApptBody(req.body);
  if (!a.start_at) return res.status(400).json({ error: 'A start date/time is required.' });
  res.status(201).json(await repo.createAppointment({ ...a, created_by: req.user.id }));
}));

app.put('/api/appointments/:id', requireCap(can.calendar), wrap(async (req, res) => {
  const existing = await repo.getAppointment(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const a = parseApptBody(req.body);
  if (!a.start_at) return res.status(400).json({ error: 'A start date/time is required.' });
  res.json(await repo.updateAppointment(existing.id, a));
}));

app.delete('/api/appointments/:id', requireCap(can.calendar), wrap(async (req, res) => {
  await repo.deleteAppointment(req.params.id);
  res.json({ ok: true });
}));

// Public "Book a showing" form — creates a pending (requested) appointment
// that staff see in the admin calendar. No auth (it's a public lead form).
app.post('/api/showing-requests', wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.client_name || '').trim();
  const email = String(b.client_email || '').trim();
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  const unitId = Number(b.unit_id) || null;
  let title = 'Showing request';
  if (unitId) {
    const unit = await repo.getUnit(unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found.' });
    title = `Showing request — ${unit.title}`;
  }
  const start_at = b.preferred ? new Date(b.preferred).toISOString() : new Date(Date.now() + 864e5).toISOString();
  await repo.createAppointment({
    unit_id: unitId, title, start_at, end_at: null,
    client_name: name, client_phone: String(b.client_phone || '').trim() || null, client_email: email,
    notes: String(b.message || '').trim() || null, agent_id: null, status: 'requested', created_by: null,
  });
  res.status(201).json({ ok: true });
}));

// ───────────────────────────────────────────────────────────────
// Blog
// ───────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
async function uniqueSlug(base, exceptId = null) {
  const root = slugify(base) || 'post';
  let slug = root, i = 2;
  while (await repo.slugExists(slug, exceptId)) slug = `${root}-${i++}`;
  return slug;
}
function parsePostBody(b) {
  return {
    title: (b.title || '').trim(),
    slug: (b.slug || '').trim(),
    excerpt: (b.excerpt || '').trim() || null,
    body: (b.body || '').trim() || null,
    status: ['draft', 'published'].includes(b.status) ? b.status : 'draft',
  };
}
function presentPost(p) {
  if (!p) return null;
  return { ...p, cover_url: p.cover_image ? storage.publicUrl(p.cover_image) : null };
}
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPostDate = (p) => {
  const d = new Date(p.published_at || p.created_at);
  return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
};

// ── Blog JSON API ──────────────────────────────────────────────
app.get('/api/posts', wrap(async (req, res) => {
  const wantAll = req.query.all === '1';
  if (wantAll) {
    if (!(await currentUser(req))) return res.status(401).json({ error: 'Not authenticated' });
    return res.json((await repo.listPosts({})).map(presentPost));
  }
  res.json((await repo.listPosts({ publishedOnly: true })).map(presentPost));
}));

app.get('/api/posts/:slug', wrap(async (req, res) => {
  const post = await repo.getPostBySlug(req.params.slug, { publishedOnly: !(await currentUser(req)) });
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(presentPost(post));
}));

app.post('/api/posts', requireCap(can.blog), wrap(async (req, res) => {
  const p = parsePostBody(req.body);
  if (!p.title) return res.status(400).json({ error: 'Title is required' });
  const slug = await uniqueSlug(p.slug || p.title);
  const published_at = p.status === 'published' ? new Date().toISOString() : null;
  const created = await repo.createPost({ ...p, slug, cover_image: null, author_id: req.user.id, published_at });
  res.status(201).json(presentPost(created));
}));

app.put('/api/posts/:id', requireCap(can.blog), wrap(async (req, res) => {
  const existing = await repo.getPostById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const p = parsePostBody(req.body);
  if (!p.title) return res.status(400).json({ error: 'Title is required' });
  const slug = p.slug ? await uniqueSlug(p.slug, existing.id) : existing.slug;
  // First time it goes live, stamp published_at; keep the original date afterwards.
  const published_at = (p.status === 'published' && !existing.published_at)
    ? new Date().toISOString() : existing.published_at;
  const updated = await repo.updatePost(existing.id, { ...p, slug, cover_image: existing.cover_image, published_at });
  res.json(presentPost(updated));
}));

app.delete('/api/posts/:id', requireCap(can.blog), wrap(async (req, res) => {
  const key = await repo.deletePost(req.params.id);
  if (key) await storage.remove(key);
  res.json({ ok: true });
}));

app.post('/api/posts/:id/cover', requireCap(can.blog), upload.single('cover'), wrap(async (req, res) => {
  const post = await repo.getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const key = await storage.save({ buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype });
  if (post.cover_image) await storage.remove(post.cover_image);
  const updated = await repo.updatePost(post.id, {
    slug: post.slug, title: post.title, excerpt: post.excerpt, body: post.body,
    status: post.status, published_at: post.published_at, cover_image: key,
  });
  res.json({ cover_url: storage.publicUrl(key), post: presentPost(updated) });
}));

app.delete('/api/posts/:id/cover', requireCap(can.blog), wrap(async (req, res) => {
  const post = await repo.getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.cover_image) await storage.remove(post.cover_image);
  await repo.updatePost(post.id, {
    slug: post.slug, title: post.title, excerpt: post.excerpt, body: post.body,
    status: post.status, published_at: post.published_at, cover_image: null,
  });
  res.json({ ok: true });
}));

// ── Server-rendered public blog (SEO-friendly) ─────────────────
function renderShell({ title, description, canonical, head = '', body, active = '' }) {
  const navActive = (k) => (active === k ? ' class="active"' : '');
  return `<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}" />
${canonical ? `<link rel="canonical" href="${escHtml(canonical)}" />` : ''}
<meta name="geo.region" content="CA-QC" /><meta name="geo.placename" content="Montréal" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css" />
${head}
</head>
<body>
<header class="nav"><div class="container nav-inner">
  <a href="/index.html" class="brand"><span class="brand-mark"></span> Rentalium</a>
  <nav class="nav-links">
    <a href="/index.html#services">Services</a>
    <a href="/index.html#neighbourhoods">Neighbourhoods</a>
    <a href="/units.html"${navActive('units')}>Available units</a>
    <a href="/blog"${navActive('blog')}>Blog</a>
    <a href="/units.html" class="btn btn-primary btn-sm">Browse rentals</a>
  </nav>
</div></header>
${body}
<footer><div class="container footer-grid">
  <div class="brand"><span class="brand-mark"></span> Rentalium</div>
  <small>Rentalium &middot; Leasing agency in Montréal, QC &middot;
  <a href="mailto:hello@rentalium.ca" style="color:inherit;">hello@rentalium.ca</a><br/>
  &copy; 2026 Rentalium. All rights reserved. · <a href="/admin" style="color:inherit;">Staff</a></small>
</div></footer>
</body>
</html>`;
}

app.get('/blog', wrap(async (req, res) => {
  const posts = await repo.listPosts({ publishedOnly: true });
  const cards = posts.length ? posts.map((p) => `
    <article class="post-card">
      ${p.cover_image ? `<a href="/blog/${escHtml(p.slug)}" class="post-cover" style="background-image:url('${escHtml(storage.publicUrl(p.cover_image))}')"></a>` : ''}
      <div class="post-card-body">
        <div class="post-meta">${escHtml(fmtPostDate(p))}${p.author ? ' · ' + escHtml(p.author.name || 'Rentalium') : ''}</div>
        <h2><a href="/blog/${escHtml(p.slug)}">${escHtml(p.title)}</a></h2>
        ${p.excerpt ? `<p>${escHtml(p.excerpt)}</p>` : ''}
        <a class="post-readmore" href="/blog/${escHtml(p.slug)}">Read more &rarr;</a>
      </div>
    </article>`).join('') : `<p class="muted">No posts yet — check back soon.</p>`;
  const body = `
  <section class="page-header"><div class="container">
    <div class="eyebrow">Blog</div>
    <h1>Montréal renting &amp; leasing insights.</h1>
    <p>Guides and updates from Rentalium's Montréal leasing team — for landlords and renters alike.</p>
  </div></section>
  <section style="padding-top:0;"><div class="container"><div class="post-grid">${cards}</div></div></section>`;
  res.type('html').send(renderShell({
    title: 'Blog | Rentalium — Montréal Leasing Agency',
    description: "Renting and leasing guides for Montréal landlords and renters, from Rentalium's leasing team.",
    canonical: 'https://rentalium.ca/blog',
    active: 'blog',
    body,
  }));
}));

app.get('/blog/:slug', wrap(async (req, res) => {
  const post = await repo.getPostBySlug(req.params.slug, { publishedOnly: true });
  if (!post) {
    return res.status(404).type('html').send(renderShell({
      title: 'Post not found | Rentalium', description: 'This post could not be found.',
      body: `<section class="page-header"><div class="container"><div class="eyebrow">Blog</div><h1>Post not found</h1><p><a href="/blog">&larr; Back to the blog</a></p></div></section>`,
    }));
  }
  const articleHtml = marked.parse(post.body || '');
  const desc = post.excerpt || String(post.body || '').replace(/[#>*_`\[\]\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 155);
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: post.title, datePublished: post.published_at || post.created_at, dateModified: post.updated_at,
    author: { '@type': 'Organization', name: 'Rentalium' },
    publisher: { '@type': 'Organization', name: 'Rentalium' },
    mainEntityOfPage: `https://rentalium.ca/blog/${post.slug}`,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.cover_image ? { image: storage.publicUrl(post.cover_image) } : {}),
  };
  const body = `
  <section class="page-header"><div class="container" style="max-width:760px;">
    <div class="eyebrow"><a href="/blog" style="color:inherit;">Blog</a></div>
    <h1>${escHtml(post.title)}</h1>
    <p class="post-meta">${escHtml(fmtPostDate(post))}${post.author ? ' · ' + escHtml(post.author.name || 'Rentalium') : ''}</p>
  </div></section>
  <section style="padding-top:0;"><div class="container" style="max-width:760px;">
    ${post.cover_image ? `<img class="article-cover" src="${escHtml(storage.publicUrl(post.cover_image))}" alt="${escHtml(post.title)}" />` : ''}
    <div class="article-body">${articleHtml}</div>
    <p style="margin-top:32px;"><a class="btn btn-ghost" href="/blog">&larr; All posts</a></p>
  </div></section>`;
  res.type('html').send(renderShell({
    title: `${post.title} | Rentalium`,
    description: desc,
    canonical: `https://rentalium.ca/blog/${post.slug}`,
    active: 'blog',
    head: `<meta property="og:type" content="article" />\n<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    body,
  }));
}));

// ───────────────────────────────────────────────────────────────
// Server-rendered public unit listing page (SEO-friendly)
// ───────────────────────────────────────────────────────────────
app.get(['/units/:id', '/units/:id/:slug'], wrap(async (req, res) => {
  const raw = await repo.getUnit(req.params.id);
  if (!raw) {
    return res.status(404).type('html').send(renderShell({
      title: 'Listing not found | Rentalium', description: 'This listing could not be found.', active: 'units',
      body: `<section class="page-header"><div class="container"><div class="eyebrow">Available units</div><h1>Listing not found</h1><p><a href="/units.html">&larr; Back to all units</a></p></div></section>`,
    }));
  }
  const u = present(raw);
  const slug = slugify(u.title) || 'listing';
  const money = (n) => '$' + Number(n || 0).toLocaleString('en-US');
  const beds = u.beds === 0 ? 'Studio' : `${u.beds} bed${u.beds > 1 ? 's' : ''}`;
  const avail = u.available_date
    ? new Date(u.available_date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Now';
  const located = u.lat != null && u.lng != null;
  const dest = located ? `${u.lat},${u.lng}` : encodeURIComponent(u.address);

  const gmapsSvg = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>';
  const amapsSvg = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><defs><linearGradient id="am-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46c0f5"/><stop offset="1" stop-color="#1aa657"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#am-grad)"/><path d="M12 6.4l3.6 9.6L12 14l-3.6 2z" fill="#fff"/></svg>';

  const gallery = u.photos.length
    ? `<div class="listing-gallery">${u.photos.map((p, i) =>
        `<a href="${escHtml(p.url)}" target="_blank" rel="noopener" class="listing-shot${i === 0 ? ' lead' : ''}" style="background-image:url('${escHtml(p.url)}')" aria-label="Photo ${i + 1}"></a>`).join('')}</div>`
    : `<div class="listing-noimg">No photos yet — contact us for more details.</div>`;

  const facts = [beds, `${u.baths} bath${u.baths > 1 ? 's' : ''}`]
    .concat(u.sqft ? [`${u.sqft.toLocaleString()} sqft`] : [])
    .concat([`Available ${avail}`]);

  const specs = [
    ...(u.appliances ? [['Appliances', u.appliances]] : []),
    ['Parking', u.parking_available === 'yes' ? `Yes${u.parking_cost ? ` · ${money(u.parking_cost)}/mo` : ''}` : 'No'],
    ['Locker', u.locker_available === 'yes' ? `Yes${u.locker_cost ? ` · ${money(u.locker_cost)}/mo` : ''}` : 'No'],
    ['Dogs', u.dogs_policy === 'yes' ? 'Dogs welcome' : u.dogs_policy === 'contact' ? 'Contact us' : 'No dogs'],
    ...(u.unit_code ? [['Unit code', u.unit_code]] : []),
  ];

  const ld = {
    '@context': 'https://schema.org', '@type': 'Apartment', name: u.title,
    ...(u.description ? { description: u.description } : {}),
    numberOfBedrooms: u.beds, numberOfBathroomsTotal: u.baths,
    ...(u.sqft ? { floorSize: { '@type': 'QuantitativeValue', value: u.sqft, unitCode: 'FTK' } } : {}),
    ...(u.photos.length ? { image: u.photos.map((p) => (p.url.startsWith('http') ? p.url : `https://rentalium.ca${p.url}`)) } : {}),
    address: { '@type': 'PostalAddress', streetAddress: u.address, addressLocality: 'Montréal', addressRegion: 'QC', addressCountry: 'CA' },
    ...(located ? { geo: { '@type': 'GeoCoordinates', latitude: u.lat, longitude: u.lng } } : {}),
  };

  const mapHead = located
    ? `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />`
    : '';
  const mapScript = located
    ? `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>(function(){var m=L.map('listing-map',{scrollWheelZoom:false}).setView([${u.lat},${u.lng}],15);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(m);L.marker([${u.lat},${u.lng}]).addTo(m);})();</script>`
    : '';

  const body = `
  <section class="page-header"><div class="container">
    <div class="eyebrow"><a href="/units.html" style="color:inherit;">Available units</a></div>
    <h1>${escHtml(u.title)}</h1>
    <p class="listing-sub">${escHtml(u.address)}${u.neighborhood ? ' · ' + escHtml(u.neighborhood) : ''}</p>
    <div class="listing-priceline">
      <span class="listing-price">${money(u.price)} / mo</span>
      <span class="listing-facts">${facts.map((f) => `<span>${escHtml(f)}</span>`).join('')}</span>
    </div>
  </div></section>
  <section style="padding-top:0;"><div class="container">
    ${gallery}
    <div class="listing-grid">
      <div class="listing-main">
        ${u.description ? `<h2>About this unit</h2><p>${escHtml(u.description)}</p>` : ''}
        <h2>Details</h2>
        <dl class="listing-specs">${specs.map(([k, v]) => `<div><dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd></div>`).join('')}</dl>
        ${located ? `<h2>Location</h2><div id="listing-map" class="listing-map"></div>` : ''}
      </div>
      <aside class="listing-aside">
        <div class="listing-cta">
          <div class="listing-cta-price">${money(u.price)} <span>/ mo</span></div>
          <button type="button" class="btn btn-primary" id="book-btn">Book a showing</button>
          <a class="btn btn-ghost" href="tel:+15145550100">+1 (514) 555-0100</a>
          <div class="listing-dir">
            <span class="muted small">Directions:</span>
            <a class="btn btn-ghost btn-sm dir-btn" href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noopener" aria-label="Get directions in Google Maps">${gmapsSvg}<span>Google Maps</span></a>
            <a class="btn btn-ghost btn-sm dir-btn" href="https://maps.apple.com/?daddr=${dest}&dirflg=d" target="_blank" rel="noopener" aria-label="Get directions in Apple Maps">${amapsSvg}<span>Apple Maps</span></a>
          </div>
        </div>
      </aside>
    </div>
    <p style="margin-top:32px;"><a class="btn btn-ghost" href="/units.html">&larr; All available units</a></p>
    <p class="listing-disclaimer">Listing information is provided for general informational purposes only and may change without notice. Square footage, availability, pricing, and amenities are approximate and not guaranteed; photos may not reflect the exact unit. Submitting a showing request does not create a lease, reservation, or obligation. Rentalium is an equal-opportunity housing agency.</p>
  </div></section>

  <div class="modal-backdrop" id="book-backdrop"></div>
  <div class="modal" id="book-modal" role="dialog" aria-modal="true" aria-labelledby="book-title">
    <div class="drawer-head">
      <h2 id="book-title">Book a showing</h2>
      <button class="icon-btn" id="book-close" aria-label="Close">×</button>
    </div>
    <form class="modal-body" id="book-form">
      <p class="muted small" style="margin:0;">Request a showing for <strong>${escHtml(u.title)}</strong> — we'll confirm by email.</p>
      <label class="field"><span>Your name *</span><input name="client_name" required /></label>
      <div class="grid-2">
        <label class="field"><span>Email *</span><input name="client_email" type="email" required /></label>
        <label class="field"><span>Phone</span><input name="client_phone" /></label>
      </div>
      <label class="field"><span>Preferred date &amp; time</span><input name="preferred" type="datetime-local" /></label>
      <label class="field"><span>Message</span><textarea name="message" rows="3" placeholder="Anything we should know?"></textarea></label>
      <div class="login-error" id="book-msg" hidden></div>
      <div class="drawer-foot">
        <button type="button" class="btn btn-ghost" id="book-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="book-submit">Send request</button>
      </div>
    </form>
  </div>`;

  const bookingScript = `
<script>(function(){
  var bd=document.getElementById('book-backdrop'),md=document.getElementById('book-modal');
  function open(){bd.classList.add('open');md.classList.add('open');}
  function close(){bd.classList.remove('open');md.classList.remove('open');}
  document.getElementById('book-btn').addEventListener('click',open);
  document.getElementById('book-close').addEventListener('click',close);
  document.getElementById('book-cancel').addEventListener('click',close);
  bd.addEventListener('click',close);
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
  document.getElementById('book-form').addEventListener('submit',function(e){
    e.preventDefault();
    var f=e.target,msg=document.getElementById('book-msg'),btn=document.getElementById('book-submit');
    msg.hidden=true;btn.disabled=true;btn.textContent='Sending…';
    var data={unit_id:${u.id},client_name:f.client_name.value,client_email:f.client_email.value,client_phone:f.client_phone.value,preferred:f.preferred.value,message:f.message.value};
    fetch('/api/showing-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      .then(function(r){if(!r.ok)return r.json().then(function(j){throw new Error(j.error||'Request failed')});return r.json();})
      .then(function(){
        md.querySelector('.modal-body').innerHTML='<p style="padding:18px 0;">&#10003; Thanks! Your showing request was sent. A Rentalium agent will reach out shortly.</p><div class="drawer-foot"><button type="button" class="btn btn-primary" id="book-done">Done</button></div>';
        document.getElementById('book-done').addEventListener('click',close);
      })
      .catch(function(err){msg.textContent=err.message;msg.hidden=false;btn.disabled=false;btn.textContent='Send request';});
  });
})();</script>`;

  res.type('html').send(renderShell({
    title: `${u.title} — ${u.neighborhood || 'Montréal'} | ${money(u.price)}/mo | Rentalium`,
    description: u.description
      || `${beds}, ${u.baths} bath rental at ${u.address}, Montréal — ${money(u.price)}/mo. Available ${avail}. Book a showing with Rentalium.`,
    canonical: `https://rentalium.ca/units/${u.id}/${slug}`,
    active: 'units',
    head: `${mapHead}\n<meta property="og:type" content="website" />\n<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    body: body + bookingScript + mapScript,
  }));
}));

// ───────────────────────────────────────────────────────────────
// Error handler + boot
// ───────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Request failed' });
});

(async () => {
  if (repo.ready) await repo.ready; // ensure schema/seed (e.g. Postgres) is in place
  await seedMaster();
  app.listen(config.port, () => {
    console.log(`\nRentalium running.`);
    console.log(`  Storage driver: ${storage.driver}   ·   DB driver: ${repo.driver}`);
    console.log(`  Public site:  http://localhost:${config.port}/`);
    console.log(`  Staff login:  http://localhost:${config.port}/login`);
    console.log(`  Admin panel:  http://localhost:${config.port}/admin\n`);
    kickGeocode();
  });
})();
