// Corrective pass: re-geocode the 30 messy addresses with a parser that does
// NOT split house numbers, and only accepts candidates that are a proper
// "Ne Avenue/Rue" or contain a real street keyword. Clears each first so a
// failed lookup leaves NO pin (never a wrong one).
const repo = require('../lib/repo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (lat, lng) => lat >= 45.0 && lat <= 46.2 && lng >= -76.3 && lng <= -73.0;
const STREET = /\b(rue|av|ave|avenue|boul|bd|boulevard|chemin|ch|place|mont[ée]e|c[ôo]te|croissant|terrasse|all[ée]e|impasse|row|street|st)\b/i;

const CODES = ['U-34','U-22','CD-B64','U-8-2','U-1-2','BC-RC4','ER-5','AA-av','SC-1','RR-106','RR-202',
  'U-1-4','RD-13','CP-5','SA-A2','SA-A3','SA-A3-2','SB-B3','SM-M2','SK-K3','CP-2','CP-2-2','U-av',
  'BP-park','EA-ave','U-75','U-75-2','U-4-4','BR-5','SF-F1'];

function strip(a) {
  return String(a || '').split(/\s*(?:#|\bapt\.?|\bunit\b|\bbsmt\b|\bbasement\b|\bsuite\b|\bste\.?)/i)[0].trim();
}
function candidates(address) {
  const s0 = strip(address);
  const list = [];
  const add = (q, city = 'Montréal') => { if (q && q.trim()) list.push({ q: q.replace(/\s+/g, ' ').trim(), city }); };

  // numbered avenue: house number, a space, optional letter prefix, THEN the avenue number as its own token
  const m = s0.match(/^(\d+)\s+([A-Za-z.]*\s*)?(\d{1,3})\b/);
  if (m) {
    add(`${m[1]} ${m[3]}e Avenue`);
    add(`${m[1]} ${m[3]}e Rue`);
  } else {
    const base = s0.replace(/\s+(?:[A-Za-z]?\d{1,4}|[A-Za-z]\d*|[A-Za-z])$/, '').trim();
    const fixed = base
      .replace(/\bcote des neiges?\b/gi, 'Chemin de la Côte-des-Neiges')
      .replace(/\bbd\b\.?/gi, 'Boulevard')
      .replace(/\bst\s+catherine\b/gi, 'Rue Sainte-Catherine')
      .replace(/\bbessborough\b/gi, 'Avenue Bessborough')
      .replace(/\bsavanne\b/gi, 'Rue de la Savane')
      .replace(/\bpark\b/gi, 'Avenue du Parc')
      .replace(/\bE\b/g, 'Est').replace(/\bO\b/g, 'Ouest');
    if (STREET.test(fixed)) add(fixed);
    if (fixed !== base && STREET.test(base)) add(base);
    if (/\bpink\b/i.test(s0)) add(base, 'Gatineau');
  }
  return list;
}
async function geo(q, city) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q='
      + encodeURIComponent(`${q}, ${city}, QC, Canada`), { headers: { 'User-Agent': 'Rentalium/1.0 fixpins3' } });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j[0]) { const lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon); if (isFinite(lat) && isFinite(lng)) return { lat, lng }; }
  } catch {}
  return null;
}
(async () => {
  if (repo.ready) await repo.ready;
  const units = await repo.listUnits({ all: true });
  const targets = units.filter((u) => CODES.includes(u.unit_code));
  let placed = 0; const fail = [];
  for (const u of targets) {
    await repo.resetGeocode(u.id); await repo.markGeocodeAttempted(u.id); // clear any prior (possibly wrong) pin
    let done = false;
    for (const c of candidates(u.address)) {
      const g = await geo(c.q, c.city); await sleep(1100);
      if (g && ok(g.lat, g.lng)) { await repo.setCoords(u.id, g.lat, g.lng); placed++; console.log('  ✓', u.unit_code, '“' + u.address + '” ->', c.q + ', ' + c.city); done = true; break; }
    }
    if (!done) fail.push(u);
  }
  const final = await repo.listUnits({ all: true });
  console.log('\nplaced this pass:', placed);
  console.log('TOTAL located:', final.filter((u) => u.lat != null).length, '/', final.length);
  console.log('left for manual placement:', fail.length);
  for (const f of fail) console.log('   [' + f.unit_code + ']', JSON.stringify(f.address));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
