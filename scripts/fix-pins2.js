// Second pass for the addresses Nominatim couldn't place: generate several
// Montréal-aware interpretations per address (numbered avenues, trailing-apt
// stripping, common street-name fixes) and accept the first that lands in the
// greater-Montréal / Gatineau box.
const repo = require('../lib/repo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// broad acceptance box: Montréal + Laval + South Shore + Gatineau
const ok = (lat, lng) => lat >= 45.0 && lat <= 46.2 && lng >= -76.3 && lng <= -73.0;

function strip(address) {
  return String(address || '')
    .split(/\s*(?:#|\bapt\.?|\bunit\b|\bbsmt\b|\bbasement\b|\bsuite\b|\bste\.?)/i)[0].trim();
}

function candidates(address) {
  const s0 = strip(address);
  const list = [];
  const add = (q, city = 'Montréal') => { if (q && q.trim()) list.push({ q: q.replace(/\s+/g, ' ').trim(), city }); };

  // drop a trailing bare apartment token (e.g. "Boulevard Rosemont 5", "A2")
  const base = s0.replace(/\s+(?:[A-Za-z]?\d{1,4}|[A-Za-z]\d*|[A-Za-z])$/, '').trim();

  // street-name normalizations
  const fixed = base
    .replace(/\bcote des neiges?\b/gi, 'Chemin de la Côte-des-Neiges')
    .replace(/\bbd\b\.?/gi, 'Boulevard')
    .replace(/\bst\s+catherine\b/gi, 'Rue Sainte-Catherine')
    .replace(/\bbessborough\b/gi, 'Avenue Bessborough')
    .replace(/\bsavanne\b/gi, 'Rue de la Savane')
    .replace(/\bpark\b/gi, 'Avenue du Parc')
    .replace(/\bE\b/g, 'Est').replace(/\bO\b/g, 'Ouest');
  add(fixed);
  if (fixed !== base) add(base);

  // numbered avenue/rue: "<house> <n>(e|av|ave|E)" -> "<house> <n>e Avenue"
  const m = s0.match(/^(\d+)\D*?(\d{1,3})(?:\s*(?:e|er|re|av|ave|avenue|E))?\b/i);
  if (m) { add(`${m[1]} ${m[2]}e Avenue`); add(`${m[1]} ${m[2]}e Rue`); }

  if (/\bpink\b/i.test(s0)) add(strip(address), 'Gatineau');
  return list;
}

async function geo(q, city) {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q='
      + encodeURIComponent(`${q}, ${city}, QC, Canada`);
    const r = await fetch(url, { headers: { 'User-Agent': 'Rentalium/1.0 fixpins2' } });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j[0]) { const lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon); if (isFinite(lat) && isFinite(lng)) return { lat, lng }; }
  } catch {}
  return null;
}

(async () => {
  if (repo.ready) await repo.ready;
  const missing = (await repo.listUnits({ all: true })).filter((u) => u.lat == null);
  console.log('units without a pin:', missing.length);
  let fixed = 0; const fail = [];
  for (const u of missing) {
    let done = false;
    for (const c of candidates(u.address)) {
      const g = await geo(c.q, c.city);
      await sleep(1100);
      if (g && ok(g.lat, g.lng)) { await repo.setCoords(u.id, g.lat, g.lng); fixed++; console.log('  ✓', u.unit_code, '->', c.q + ', ' + c.city); done = true; break; }
    }
    if (!done) fail.push(u);
  }
  const final = (await repo.listUnits({ all: true }));
  console.log('\nnewly placed:', fixed);
  console.log('located now:', final.filter((u) => u.lat != null).length, '/', final.length);
  console.log('STILL no pin:', fail.length);
  for (const f of fail) console.log('   [' + f.unit_code + ']', JSON.stringify(f.address));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
