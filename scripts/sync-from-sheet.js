#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────
// Sync units from the leasing Google Sheet → the units table.
//
// The Google Sheet (its Address column) is the source of truth for which
// units exist. This script:
//   • UPDATEs units already in the DB (matched by normalized address) with the
//     sheet's price, size, appliances, statuses and the internal fields
//     (entrance code, janitor #, notes, pictures, available-on, amount tracking).
//     It rewrites the PUBLIC description to a clean blurb so leaked private data
//     (janitor numbers, "Status: …") no longer ships to the public site.
//   • INSERTs units that are new in the sheet.
//   • Marks units that are in the DB but NO LONGER in the sheet as `rented`
//     (kept in the DB, hidden from the public site). Reversible: re-listing in
//     the sheet flips them back to available on the next sync.
//
// It never touches lat/lng, building_id or photos on existing units, so
// geocoded pins and building groupings are preserved.
//
// Usage:
//   node scripts/sync-from-sheet.js              # DRY RUN — prints a plan, writes nothing
//   APPLY=1 node scripts/sync-from-sheet.js      # apply changes
//   SHEET_CSV=/path/to/export.csv APPLY=1 node scripts/sync-from-sheet.js
//
// Refreshing the snapshot: in the Google Sheet do File → Download → CSV and
// replace data/listings.csv, then re-run. (Or pass SHEET_CSV=…)
// ───────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { parse: parseCsv } = require('csv-parse/sync');
const { Pool } = require('pg');
const config = require('../config');

const APPLY = process.env.APPLY === '1';
const CSV_PATH = process.env.SHEET_CSV || path.join(__dirname, '..', 'data', 'listings.csv');

// ── Field mapping helpers ──────────────────────────────────────
function stripAccents(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

// Normalized address key used to match sheet rows ↔ DB units. Keeps the civic
// number, street name and apartment number; drops accents, street-type words,
// trailing city/postal noise and punctuation so cosmetic differences collapse.
function normAddr(s) {
  let x = stripAccents(String(s || '')).toLowerCase();
  x = x.split(/montreal|laval|, ?qc|canada|h\d[a-z] ?\d[a-z]\d/)[0];
  x = x.replace(/\b(apt|appartement|app|unit|unite|basement|rc|av|ave|avenue|rue|boul|bd|st|street)\b/g, ' ');
  x = x.replace(/[^a-z0-9]/g, '');
  return x;
}

function priceToInt(s) {
  const n = Number(String(s || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Quebec room count ("3.5") → bedrooms, mirroring the existing data convention
// (2.5→1BR, 3.5→2BR, 4.5→3BR, 5.5→4BR …; 1.5/studio → 0).
function bedsFromSize(size) {
  const f = parseFloat(String(size || '').replace(',', '.'));
  if (!Number.isFinite(f)) return 1;
  return Math.max(0, Math.floor(f) - 1);
}
function bathsFromSize(size) {
  const f = parseFloat(String(size || '').replace(',', '.'));
  return Number.isFinite(f) && f >= 5.5 ? 2 : 1;
}

// Street part of an address = the address minus the apartment token and any
// trailing city/postal noise. Used to build a tidy listing title.
function streetOf(address) {
  let s = String(address || '').trim();
  s = s.split(/,? *(?:montreal|laval|qc|canada|greenfield park|longueuil)\b/i)[0];
  s = s.replace(/\s*(?:#|apt\.?|appartement|app\.?|unit|-)\s*[\w-]+\s*$/i, '');
  return s.trim().replace(/\s{2,}/g, ' ');
}

function aptToken(address) {
  const m = String(address || '').match(/(?:#|apt\.?|app\.?|unit|-)\s*([\w-]+)\s*$/i);
  return m ? m[1] : null;
}

// Secondary match signature: civic number + apartment token (letters kept, so
// A2 ≠ H2). Used as a fallback when normAddr misses due to suburb names,
// spelling variants ("Savane"/"Savanne") or a missing street in the DB record.
function aptSig(address) {
  const civic = (String(address || '').match(/\d+/) || [''])[0];
  const apt = stripAccents(String(aptToken(address) || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${civic}|${apt}`;
}
// Letters-only street name (no civic, no apt) for a loose compatibility check.
function streetKey(address) {
  return stripAccents(streetOf(address) || '')
    .toLowerCase()
    .replace(/\b(apt|appartement|app|unit|rue|av|ave|avenue|boul|bd|st|street|de|des|du|la|le)\b/g, ' ')
    .replace(/[^a-z]/g, '');
}
function streetCompatible(a, b) {
  const x = streetKey(a), y = streetKey(b);
  if (!x || !y) return true;                 // one side has no street name → accept
  if (x === y || x.includes(y) || y.includes(x)) return true;
  return x.slice(0, 4) === y.slice(0, 4);    // tolerate spelling drift (Savane/Savanne)
}

function titleFor(beds, address) {
  const street = streetOf(address) || String(address || '').trim();
  const label = beds <= 0 ? 'Studio' : `${beds}BR`;
  return `${label} at ${street}`;
}

function unitCodeFor(address) {
  const apt = aptToken(address);
  if (apt) return `U-${apt}`.slice(0, 32);
  const slug = stripAccents(String(address || '')).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug.slice(0, 32) || null;
}

// PUBLIC-safe description: appliances + notes only. Never janitor / entrance /
// status — those live in their own (private) columns.
function publicDescription(appliances, notes) {
  const parts = [];
  const a = String(appliances || '').trim().replace(/[,\s]+$/, '');
  const n = String(notes || '').trim();
  if (a) parts.push(`Appliances: ${a}`);
  if (n) parts.push(n);
  const out = parts.join('. ').replace(/\.\.+/g, '.').trim();
  return out || null;
}

function statusFromAvailability(label) {
  switch (String(label || '').trim().toLowerCase()) {
    case 'on hold': return 'on_hold';
    case 'in reno': return 'in_reno';
    case 'not available': return 'unavailable';
    case 'rented': return 'rented';
    case '':
    case 'available':
    default: return 'available';
  }
}

const clean = (v) => {
  const s = String(v == null ? '' : v).trim();
  return s || null;
};
const looksUrl = (v) => /^https?:\/\//i.test(String(v || '').trim());

// ── Parse the sheet ────────────────────────────────────────────
function loadSheet() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(raw, { relax_column_count: true, skip_empty_lines: false });
  const headerIdx = rows.findIndex((r) => r.some((c) => /address/i.test(c)));
  if (headerIdx < 0) throw new Error('Could not find a header row containing "Address"');
  const header = rows[headerIdx].map((c) => stripAccents(c).toLowerCase().trim());
  const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const ix = {
    address: col('address'),
    area: col('area'),
    price: col('price'),
    size: col('size'),
    appliances: col('appliances'),
    entrance: col('entrance'),
    janitor: col('janitor'),
    notes: col('notes'),
    pictures: col('pictures'),
    availability: col('availability'),
    availableOn: col('available on'),
    dateUpdated: col('date uptaded', 'date updated'),
    firstAmountDate: col('first amount date'),
    firstAmount: header.findIndex((h) => h === 'first amount' || (h.includes('first amount') && !h.includes('date'))),
    updatedAmountOn: col('updated amount on'),
  };
  const g = (r, i) => (i >= 0 && i < r.length ? r[i] : '');
  const records = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const address = clean(g(r, ix.address));
    if (!address) continue;
    const size = clean(g(r, ix.size));
    const beds = bedsFromSize(size);
    records.push({
      address,
      neighborhood: clean(g(r, ix.area)),
      price: priceToInt(g(r, ix.price)),
      size,
      beds,
      baths: bathsFromSize(size),
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
  return records;
}

// Columns updated on a matched unit (NOT title/unit_code/lat/lng/building_id).
const UPDATE_COLS = [
  'neighborhood', 'price', 'size', 'beds', 'baths', 'appliances', 'description', 'status',
  'entrance_code', 'janitor_number', 'notes', 'pictures_url', 'availability', 'available_on',
  'date_updated', 'first_amount_date', 'first_amount', 'updated_amount_on',
];
const INSERT_COLS = ['unit_code', 'title', 'address', ...UPDATE_COLS, 'geocode_attempted'];

async function main() {
  if (config.db.driver !== 'postgres' || !config.db.url) {
    throw new Error('This sync targets Postgres. Set DB_DRIVER=postgres and DATABASE_URL.');
  }
  const records = loadSheet();
  // Dedupe sheet rows by normalized address (last row wins).
  const byKey = new Map();
  for (const rec of records) byKey.set(normAddr(rec.address), rec);
  const sheetKeys = new Set(byKey.keys());

  const pool = new Pool({ connectionString: config.db.url, max: 4 });
  const { rows: existing } = await pool.query('SELECT id, address, status FROM units');
  const dbByKey = new Map();
  for (const u of existing) {
    const k = normAddr(u.address);
    if (!dbByKey.has(k)) dbByKey.set(k, []);
    dbByKey.get(k).push(u);
  }

  const toUpdate = [];        // { id, rec }
  let toInsert = [];          // rec (unmatched sheet rows)
  const matchedIds = new Set();
  for (const [key, rec] of byKey) {
    const matches = dbByKey.get(key);
    if (matches && matches.length) {
      for (const m of matches) { toUpdate.push({ id: m.id, rec }); matchedIds.add(m.id); }
    } else toInsert.push(rec);
  }

  // Secondary pass: rescue sheet rows that normAddr missed (suburb names,
  // spelling drift, missing street) so they UPDATE the existing unit instead of
  // creating a duplicate + wrongly renting the old row.
  const unmatchedDb = existing.filter((u) => !matchedIds.has(u.id) && !sheetKeys.has(normAddr(u.address)));
  const dbBySig = new Map();
  for (const u of unmatchedDb) {
    if (!dbBySig.has(aptSig(u.address))) dbBySig.set(aptSig(u.address), []);
    dbBySig.get(aptSig(u.address)).push(u);
  }
  const stillInsert = [];
  let rescued = 0;
  for (const rec of toInsert) {
    const cands = (dbBySig.get(aptSig(rec.address)) || []).filter((u) => !matchedIds.has(u.id) && streetCompatible(u.address, rec.address));
    if (cands.length) {
      for (const m of cands) { toUpdate.push({ id: m.id, rec }); matchedIds.add(m.id); }
      rescued++;
    } else stillInsert.push(rec);
  }
  toInsert = stillInsert;

  // DB units still absent from the sheet (by either match) → rented.
  const toRent = existing.filter((u) => !matchedIds.has(u.id) && !sheetKeys.has(normAddr(u.address)) && u.status !== 'rented');
  if (rescued) console.log(`Secondary match rescued ${rescued} sheet row(s) from becoming duplicates.`);

  // ── Report ──
  const statusCounts = {};
  for (const rec of byKey.values()) statusCounts[rec.status] = (statusCounts[rec.status] || 0) + 1;
  console.log(`\nSheet: ${records.length} rows (${byKey.size} distinct addresses)`);
  console.log(`DB:    ${existing.length} units`);
  console.log(`Plan:  UPDATE ${toUpdate.length} · INSERT ${toInsert.length} · MARK RENTED ${toRent.length}`);
  console.log('Sheet status distribution:', statusCounts);
  console.log('\nSample new inserts:', toInsert.slice(0, 8).map((r) => r.address));
  console.log('Sample → rented:   ', toRent.slice(0, 8).map((u) => u.address));

  if (!APPLY) {
    console.log('\nDRY RUN — no changes written. Re-run with APPLY=1 to apply.\n');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let updated = 0, inserted = 0, rented = 0;
  try {
    await client.query('BEGIN');
    // Safety backup of the pre-sync state (idempotent name per day).
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await client.query(`CREATE TABLE IF NOT EXISTS units_backup_${stamp} AS TABLE units`);

    for (const { id, rec } of toUpdate) {
      const set = UPDATE_COLS.map((c, i) => `${c}=$${i + 1}`).join(', ');
      const vals = UPDATE_COLS.map((c) => rec[c]);
      await client.query(`UPDATE units SET ${set} WHERE id=$${UPDATE_COLS.length + 1}`, [...vals, id]);
      updated++;
    }
    for (const rec of toInsert) {
      const row = { ...rec, unit_code: unitCodeFor(rec.address), title: titleFor(rec.beds, rec.address), geocode_attempted: 0 };
      const ph = INSERT_COLS.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(`INSERT INTO units (${INSERT_COLS.join(', ')}) VALUES (${ph})`, INSERT_COLS.map((c) => row[c]));
      inserted++;
    }
    if (toRent.length) {
      const ids = toRent.map((u) => u.id);
      await client.query(`UPDATE units SET status='rented', availability='Rented' WHERE id = ANY($1)`, [ids]);
      rented = toRent.length;
    }
    await client.query('COMMIT');
    console.log(`\n✓ Applied: ${updated} updated, ${inserted} inserted, ${rented} marked rented. Backup: units_backup_${stamp}\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error('Sync failed:', err); process.exit(1); });
