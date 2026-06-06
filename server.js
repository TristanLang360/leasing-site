const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const { parse: parseCsv } = require('csv-parse/sync');

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

// Block direct access to sensitive files before static serving.
app.use((req, res, next) => {
  const blocked = /(^\/server\.js$|^\/config\.js$|^\/lib\/|^\/package(-lock)?\.json$|\.sql$|\.db($|-)|^\/node_modules\/|^\/private\/|^\/\.)/i;
  if (blocked.test(req.path)) return res.status(404).send('Not found');
  next();
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
// Admin page (any authenticated staff) + login page
// ───────────────────────────────────────────────────────────────
app.get('/admin', wrap(async (req, res) => {
  if (!(await currentUser(req))) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'private', 'admin.html'));
}));
app.get('/admin.js', wrap(async (req, res) => {
  if (!(await currentUser(req))) return res.status(401).send('Not authenticated');
  res.type('application/javascript').sendFile(path.join(__dirname, 'private', 'admin.js'));
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
    status: ['scheduled', 'done', 'canceled'].includes(b.status) ? b.status : 'scheduled',
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

// ───────────────────────────────────────────────────────────────
// Error handler + boot
// ───────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Request failed' });
});

(async () => {
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
