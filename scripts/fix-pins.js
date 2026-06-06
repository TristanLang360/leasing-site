// One-off: re-geocode every pin that landed outside Greater Montréal,
// validate against the bounding box, and clear the ones that can't be
// resolved (no pin beats a wrong pin in Europe).
const repo = require('../lib/repo');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inMtl = (lat, lng) => lat >= 45.0 && lat <= 46.0 && lng >= -74.6 && lng <= -73.0;

function streetKey(a) {
  return String(a || '').toLowerCase()
    .split(/\s*(?:#|\bapt\.?|\bunit\b|\bbsmt\b|\bbasement\b|\bsuite\b|\bste\.?)/i)[0]
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function enhance(address) {
  let s = String(address || '').split(/\s*(?:#|\bapt\.?|\bunit\b|\bbsmt\b|\bbasement\b|\bsuite\b|\bste\.?)/i)[0]
    .replace(/[,\s]+$/, '').trim();
  s = s.replace(/(\d)([A-Za-z])/g, '$1 $2');
  const repl = [
    [/\bmnt\b\.?/gi, 'Montée'], [/\bchem\b\.?/gi, 'Chemin'], [/\bboul\b\.?/gi, 'Boulevard'],
    [/\bav\b\.?/gi, 'Avenue'], [/descarrieres/gi, 'Des Carrières'], [/cote[- ]?veru/gi, 'Côte-Vertu'],
    [/cote[- ]?sainte[- ]?cather\w*/gi, 'Côte-Sainte-Catherine'], [/saint garmain/gi, 'Saint-Germain'],
    [/\bst\b\.?\s+/gi, 'Saint-'], [/\bcote\b/gi, 'Côte'],
  ];
  for (const [re, to] of repl) s = s.replace(re, to);
  s = s.replace(/\bE\b/g, 'Est').replace(/\bO\b/g, 'Ouest');
  const city = /laval/i.test(s) ? 'Laval' : 'Montréal';
  s = s.replace(/\blaval\b/gi, '').replace(/[,\s]+$/, '').trim();
  return `${s}, ${city}, QC, Canada`;
}
async function geo(q) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=' + encodeURIComponent(q),
      { headers: { 'User-Agent': 'Rentalium/1.0 fixpins' } });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j[0]) { const lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon); if (isFinite(lat) && isFinite(lng)) return { lat, lng }; }
  } catch {}
  return null;
}

(async () => {
  if (repo.ready) await repo.ready;
  const units = await repo.listUnits({ all: true });
  const bad = units.filter((u) => u.lat != null && !inMtl(u.lat, u.lng));
  console.log('pins outside Montréal:', bad.length);

  let fixed = 0; const cleared = [];
  for (const u of bad) {
    const g = await geo(enhance(u.address));
    if (g && inMtl(g.lat, g.lng)) { await repo.setCoords(u.id, g.lat, g.lng); fixed++; }
    else { await repo.resetGeocode(u.id); await repo.markGeocodeAttempted(u.id); cleared.push(u); } // null + attempted (no retry)
    await sleep(1100);
  }

  // Sibling-copy: fill cleared/missing units from a correctly-located unit at the same building.
  const all2 = await repo.listUnits({ all: true });
  const byKey = {};
  for (const u of all2) if (u.lat != null && inMtl(u.lat, u.lng)) { const k = streetKey(u.address); if (!byKey[k]) byKey[k] = { lat: u.lat, lng: u.lng }; }
  let copied = 0;
  for (const u of all2) if (u.lat == null) { const m = byKey[streetKey(u.address)]; if (m) { await repo.setCoords(u.id, m.lat, m.lng); copied++; } }

  const final = await repo.listUnits({ all: true });
  const stillMissing = final.filter((u) => u.lat == null);
  const stillBad = final.filter((u) => u.lat != null && !inMtl(u.lat, u.lng));
  console.log('re-geocoded to Montréal:', fixed, '| sibling-copied:', copied);
  console.log('FINAL — located in Montréal:', final.length - stillMissing.length - stillBad.length, '/', final.length);
  console.log('no pin (manual needed):', stillMissing.length, '| still outside box:', stillBad.length);
  for (const u of stillMissing) console.log('   no-pin [' + u.unit_code + ']', JSON.stringify(u.address));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
