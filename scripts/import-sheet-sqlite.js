#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────
// Replace the unit list with the leasing Google Sheet (SQLite / VPS).
//
//   • Units in the sheet: matched to existing units by address (same rules as
//     sync-from-sheet.js) and UPDATED, or INSERTED if new.
//   • Units no longer in the sheet: marked `rented` (hidden from the public
//     site, kept in admin; re-listing them in the sheet brings them back).
//   • Buildings: units are grouped per civic address; each group gets one
//     building whose pin comes from the geocode file (see
//     scratch geocode_sheet.py output). Every unit takes its building's pin.
//
// Usage (run on the server, from the app folder):
//   SHEET_CSV=sheet.csv GEO_JSON=geo.json node scripts/import-sheet-sqlite.js          # dry run
//   SHEET_CSV=sheet.csv GEO_JSON=geo.json APPLY=1 node scripts/import-sheet-sqlite.js  # write
// ───────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { parse: parseCsv } = require('csv-parse/sync');
const Database = require('better-sqlite3');

const APPLY = process.env.APPLY === '1';
const CSV_PATH = process.env.SHEET_CSV;
const GEO_PATH = process.env.GEO_JSON;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'rentalium.db');
if (!CSV_PATH || !GEO_PATH) { console.error('Set SHEET_CSV and GEO_JSON'); process.exit(1); }

const stripAccents = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
function normAddr(s) {
  let x = stripAccents(String(s || '')).toLowerCase();
  x = x.split(/montreal|laval|, ?qc|canada|h\d[a-z] ?\d[a-z]\d/)[0];
  x = x.replace(/\b(apt|appartement|app|unit|unite|basement|rc|av|ave|avenue|rue|boul|bd|st|street)\b/g, ' ');
  return x.replace(/[^a-z0-9]/g, '');
}
const priceToInt = (s) => { const n = Number(String(s || '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
const bedsFromSize = (size) => { const f = parseFloat(String(size || '').replace(',', '.')); return Number.isFinite(f) ? Math.max(0, Math.floor(f) - 1) : 1; };
const bathsFromSize = (size) => { const f = parseFloat(String(size || '').replace(',', '.')); return Number.isFinite(f) && f >= 5.5 ? 2 : 1; };
function aptToken(address) {
  const m = String(address || '').match(/(?:#|apt\.?|app\.?|unit|-)\s*([\w-]+)\s*$/i);
  return m ? m[1] : null;
}
function streetOf(address) {
  let s = String(address || '').trim();
  s = s.split(/,? *(?:montreal|laval|qc|canada|greenfield park|longueuil)\b/i)[0];
  s = s.replace(/\s*(?:#|apt\.?|appartement|app\.?|unit|-)\s*[\w-]+\s*$/i, '');
  return s.trim().replace(/\s{2,}/g, ' ');
}
const titleCase = (s) => String(s || '').replace(/\S+/g, (w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)));
const titleFor = (beds, address) => `${beds <= 0 ? 'Studio' : `${beds}BR`} at ${titleCase(streetOf(address) || address)}`;
function unitCodeFor(address) {
  const apt = aptToken(address);
  if (apt) return `U-${apt}`.slice(0, 32);
  return stripAccents(String(address || '')).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || null;
}
function publicDescription(appliances, notes) {
  const parts = [];
  const a = String(appliances || '').trim().replace(/[,\s]+$/, '');
  const n = String(notes || '').trim();
  if (a) parts.push(`Appliances: ${a}`);
  if (n) parts.push(n);
  return parts.join('. ').replace(/\.\.+/g, '.').trim() || null;
}
function statusFromAvailability(label) {
  switch (String(label || '').trim().toLowerCase()) {
    case 'on hold': return 'on_hold';
    case 'in reno': return 'in_reno';
    case 'not available': return 'unavailable';
    case 'rented': return 'rented';
    default: return 'available';
  }
}
const clean = (v) => { const s = String(v == null ? '' : v).trim(); return s || null; };
const looksUrl = (v) => /^https?:\/\//i.test(String(v || '').trim());
const cleanArea = (a) => titleCase(String(a || '').replace(/^[\s,\-]+|[\s,\-]+$/g, '').toLowerCase()) || null;

// ── Sheet ──
const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, ''), { relax_column_count: true, skip_empty_lines: false });
const headerIdx = rows.findIndex((r) => r.some((c) => /address/i.test(c)));
const header = rows[headerIdx].map((c) => stripAccents(c).toLowerCase().trim());
const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
const ix = {
  address: col('address'), area: col('area'), price: col('price'), size: col('size'), appliances: col('appliances'),
  entrance: col('entrance'), janitor: col('janitor'), notes: col('notes'), pictures: col('pictures'),
  availability: col('availability'), availableOn: col('available on'), dateUpdated: col('date uptaded', 'date updated'),
  firstAmountDate: col('first amount date'),
  firstAmount: header.findIndex((h) => h === 'first amount' || (h.includes('first amount') && !h.includes('date'))),
  updatedAmountOn: col('updated amount on'),
};
const g = (r, i) => (i >= 0 && i < r.length ? r[i] : '');

// raw sheet address → building record from the geocode file
const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));
const buildingOfAddr = new Map();
for (const [key, b] of Object.entries(geo)) for (const a of b.units) buildingOfAddr.set(a, { key, ...b });

// Known typos in the sheet → the real address (kept until the sheet is fixed).
const ADDRESS_FIXES = [[/\blaundry saint eustache\b/i, 'Rue Landry, Saint-Eustache']];
const records = [];
const skipped = [];
for (const r of rows.slice(headerIdx + 1)) {
  let address = clean(g(r, ix.address));
  if (!address) continue;
  for (const [re, to] of ADDRESS_FIXES) address = address.replace(re, to);
  // Skip rows whose "address" isn't one (e.g. an entrance code pasted there).
  if (!/^\s*\d/.test(address.replace(/^#\d+\s+/, ''))) { skipped.push(address); continue; }
  const size = clean(g(r, ix.size));
  const beds = bedsFromSize(size);
  const b = buildingOfAddr.get(g(r, ix.address)) || buildingOfAddr.get(address);
  records.push({
    address,
    building: b || null,
    neighborhood: cleanArea(g(r, ix.area)) || (b && b.city !== 'Montréal' ? b.city : null),
    price: priceToInt(g(r, ix.price)),
    size, beds, baths: bathsFromSize(size),
    appliances: clean(g(r, ix.appliances)),
    entrance_code: clean(g(r, ix.entrance)),
    janitor_number: clean(g(r, ix.janitor)),
    notes: clean(g(r, ix.notes)),
    pictures_url: looksUrl(g(r, ix.pictures)) ? clean(g(r, ix.pictures)) : null,
    availability: clean(g(r, ix.availability)) || 'Available',
    available_on: clean(g(r, ix.availableOn)),
    date_updated: clean(g(r, ix.dateUpdated)),
    first_amount_date: clean(g(r, ix.firstAmountDate)),
    first_amount: clean(g(r, ix.firstAmount)),
    updated_amount_on: clean(g(r, ix.updatedAmountOn)),
    status: statusFromAvailability(g(r, ix.availability)),
    description: publicDescription(g(r, ix.appliances), g(r, ix.notes)),
  });
}
// Dedupe by normalized address (last row wins)
const byKey = new Map();
for (const rec of records) byKey.set(normAddr(rec.address), rec);

// ── Plan against the DB ──
const db = new Database(DB_PATH);
const existing = db.prepare('SELECT id, address, status, building_id FROM units').all();
const dbByKey = new Map();
for (const u of existing) { const k = normAddr(u.address); if (!dbByKey.has(k)) dbByKey.set(k, []); dbByKey.get(k).push(u); }
const toUpdate = [], toInsert = [], matched = new Set();
for (const [k, rec] of byKey) {
  const m = dbByKey.get(k);
  if (m && m.length) {
    // Old data sometimes has the same apartment twice: keep the first, the
    // rest fall through to "not in the sheet" and are hidden.
    const keep = m.slice().sort((a, b) => a.id - b.id)[0];
    toUpdate.push({ u: keep, rec }); matched.add(keep.id);
  }
  else toInsert.push(rec);
}
const toRent = existing.filter((u) => !matched.has(u.id) && u.status !== 'rented');

// Buildings: one per sheet building key; reuse the old building most of its
// matched units belonged to, else create one.
const groups = new Map();
for (const rec of byKey.values()) {
  const key = rec.building ? rec.building.key : '?' + rec.address;
  if (!groups.has(key)) groups.set(key, { b: rec.building, recs: [], oldIds: [] });
  groups.get(key).recs.push(rec);
}
for (const { u, rec } of toUpdate) {
  const key = rec.building ? rec.building.key : '?' + rec.address;
  if (u.building_id) groups.get(key).oldIds.push(u.building_id);
}
const prec = {};
for (const { b } of groups.values()) prec[(b && b.precision) || 'none'] = (prec[(b && b.precision) || 'none'] || 0) + 1;

const statusCounts = {};
for (const rec of byKey.values()) statusCounts[rec.status] = (statusCounts[rec.status] || 0) + 1;
console.log(`Sheet: ${records.length} rows → ${byKey.size} distinct units in ${groups.size} buildings`);
console.log(`DB:    ${existing.length} units`);
console.log(`Plan:  UPDATE ${toUpdate.length} · INSERT ${toInsert.length} · MARK RENTED ${toRent.length}`);
console.log('Status in sheet:', statusCounts);
console.log('Pin precision per building:', prec);
if (skipped.length) console.log('Skipped rows (no usable address):', skipped);
if (!APPLY) { console.log('DRY RUN — nothing written.'); process.exit(0); }

const UPDATE_COLS = ['neighborhood', 'price', 'size', 'beds', 'baths', 'appliances', 'description', 'status',
  'entrance_code', 'janitor_number', 'notes', 'pictures_url', 'availability', 'available_on',
  'date_updated', 'first_amount_date', 'first_amount', 'updated_amount_on'];
const mode = (arr) => { const c = {}; let best = null; for (const x of arr) { c[x] = (c[x] || 0) + 1; if (best == null || c[x] > c[best]) best = x; } return best; };

const run = db.transaction(() => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  db.exec(`CREATE TABLE IF NOT EXISTS units_backup_${stamp} AS SELECT * FROM units`);
  db.exec(`CREATE TABLE IF NOT EXISTS buildings_backup_${stamp} AS SELECT * FROM buildings`);
  const upd = db.prepare(`UPDATE units SET ${UPDATE_COLS.map((c) => `${c}=@${c}`).join(', ')}, title=@title, address=@address, building_id=@building_id, lat=@lat, lng=@lng, geocode_attempted=1 WHERE id=@id`);
  const ins = db.prepare(`INSERT INTO units (unit_code, title, address, ${UPDATE_COLS.join(', ')}, building_id, lat, lng, geocode_attempted)
    VALUES (@unit_code, @title, @address, ${UPDATE_COLS.map((c) => '@' + c).join(', ')}, @building_id, @lat, @lng, 1)`);
  const updB = db.prepare('UPDATE buildings SET name=@name, address=@address, neighborhood=@neighborhood, lat=@lat, lng=@lng, geocode_attempted=1 WHERE id=@id');
  const insB = db.prepare('INSERT INTO buildings (name, address, neighborhood, lat, lng, geocode_attempted) VALUES (@name, @address, @neighborhood, @lat, @lng, 1)');
  const usedB = new Set();
  const bOf = new Map();
  for (const [key, grp] of groups) {
    const b = grp.b;
    const name = b && b.civic ? `${b.civic} ${titleCase(b.street)}` : streetOf(grp.recs[0].address);
    const addr = b && b.civic ? `${b.civic} ${titleCase(b.street)}, ${b.city}` : grp.recs[0].address;
    const hood = grp.recs.map((r) => r.neighborhood).find(Boolean) || (b ? b.city : null);
    let lat = b && b.lat != null ? b.lat : null, lng = b && b.lng != null ? b.lng : null;
    let id = mode(grp.oldIds.filter((x) => !usedB.has(x)));
    if (id != null) {
      if (lat == null) { const old = db.prepare('SELECT lat, lng FROM buildings WHERE id=?').get(id); if (old) { lat = old.lat; lng = old.lng; } }
      updB.run({ id, name, address: addr, neighborhood: hood, lat, lng });
    } else {
      id = insB.run({ name, address: addr, neighborhood: hood, lat, lng }).lastInsertRowid;
    }
    usedB.add(id);
    bOf.set(key, { id, lat, lng, name });
  }
  const pick = (rec) => bOf.get(rec.building ? rec.building.key : '?' + rec.address);
  const titleOf = (rec, B) => `${rec.beds <= 0 ? 'Studio' : `${rec.beds}BR`} at ${B.name || titleCase(streetOf(rec.address))}`;
  for (const { u, rec } of toUpdate) { const B = pick(rec); upd.run({ ...rec, title: titleOf(rec, B), id: u.id, building_id: B.id, lat: B.lat, lng: B.lng }); }
  for (const rec of toInsert) {
    const B = pick(rec);
    ins.run({ ...rec, unit_code: unitCodeFor(rec.address), title: titleOf(rec, B), building_id: B.id, lat: B.lat, lng: B.lng });
  }
  if (toRent.length) {
    const r = db.prepare("UPDATE units SET status='rented', availability='Rented' WHERE id=?");
    for (const u of toRent) r.run(u.id);
  }
  return stamp;
});
const stamp = run();
console.log(`✓ Applied. Backups: units_backup_${stamp}, buildings_backup_${stamp}`);
