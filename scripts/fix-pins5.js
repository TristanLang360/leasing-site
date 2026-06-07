// Targeted fix for the 60 addresses that fix-pins4 couldn't resolve.
// Each entry has multiple candidate queries to try.
const repo = require('../lib/repo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (lat, lng) => lat >= 44.8 && lat <= 46.5 && lng >= -76.5 && lng <= -72.5;

async function geo(q, city) {
  try {
    const query = city ? `${q}, ${city}, QC, Canada` : q;
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=' + encodeURIComponent(query);
    const r = await fetch(url, { headers: { 'User-Agent': 'Rentalium/1.0 fixpins5' } });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j[0]) {
      const lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng, display: j[0].display_name };
    }
  } catch {}
  return null;
}

// Groups: each entry covers all IDs that share the same building address.
// Candidates are tried in order; first one that lands in the bounding box wins.
const GROUPS = [
  // 2150 Saint-Joseph Est, Rosemont
  { ids: [262,263,471,472], candidates: [
    ['2150 Rue Saint-Joseph Est', 'Montréal'],
    ['2150 Saint-Joseph', 'Montréal'],
    ['2150 Avenue Saint-Joseph Est', 'Montréal'],
  ]},
  // 2785 Rue Jeanne-D'Arc, Hochelaga (missing space in address "2785Jeanne D'Arc")
  { ids: [386,387,388,389,390,391,392,393,394,595,596,597,598,599,600,601,602,603], candidates: [
    ['2785 Rue Jeanne-D\'Arc', 'Montréal'],
    ['2785 Avenue Jeanne-D\'Arc', 'Montréal'],
  ]},
  // 3849 Sherbrooke Est, Hochelaga
  { ids: [396,605], candidates: [
    ['3849 Rue Sherbrooke Est', 'Montréal'],
    ['3849 Sherbrooke Est', 'Montréal'],
  ]},
  // 5770 Rue Charles-Thibault, St-Michel
  { ids: [590,591], candidates: [
    ['5770 Rue Charles-Thibault', 'Montréal'],
    ['5770 Charles-Thibault', 'Montréal'],
    ['5770 Rue Charles Thibault', 'Montréal'],
  ]},
  // 8369 Rue De Lépée, Parc-Extension
  { ids: [368,577], candidates: [
    ['8369 Rue De Lépée', 'Montréal'],
    ['8369 De Lépée', 'Montréal'],
    ['8369 Rue De Lepee', 'Montréal'],
    ['8369 De Lepee', 'Montréal'],
    ['8369 Avenue De Lépée', 'Montréal'],
  ]},
  // 7305 Rue Sherbrooke Ouest H4B 1R9 (full address embedded)
  { ids: [345,554], candidates: [
    ['7305 Rue Sherbrooke Ouest', 'Montréal'],
    ['7305 Sherbrooke Ouest', 'Montréal'],
  ]},
  // 253 Montée Sancha, Boisbriand
  { ids: [341,342,550,551], candidates: [
    ['253 Montée Sancha', 'Boisbriand'],
    ['253 Montee Sancha', 'Boisbriand'],
    ['253 Montée Sansha', 'Boisbriand'],
    ['253 Montée Sancha', 'QC'],
  ]},
  // 38 de la Grande-Allée, Montréal-Est
  { ids: [304,334,513,543], candidates: [
    ['38 Rue de la Grande-Allée', 'Montréal-Est'],
    ['38 Grande-Allée', 'Montréal-Est'],
    ['38 Rue de la Grande Allée', 'Montréal'],
    ['38 Grande Allée', 'Montréal-Est'],
  ]},
  // 9198A 14e Avenue, Saint-Michel
  { ids: [302,511], candidates: [
    ['9198 14e Avenue', 'Montréal'],
    ['9200 14e Avenue', 'Montréal'],
    ['9196 14e Avenue', 'Montréal'],
  ]},
  // 195 Rue de la Savane, Gatineau
  { ids: [326,327,535,536], candidates: [
    ['195 Rue de la Savane', 'Gatineau'],
    ['195 Savane', 'Gatineau'],
    ['195 Savanne', 'Gatineau'],
    ['195 Boulevard de la Savane', 'Gatineau'],
  ]},
  // 242 Rue de l'Église Sud (unknown city — try a few)
  { ids: [328,537], candidates: [
    ['242 Rue de l\'Église Sud', 'Saint-Jean-sur-Richelieu'],
    ['242 Rue de l\'Église Sud', 'Longueuil'],
    ['242 Rue de l\'Église-Sud', 'Montréal'],
    ['242 Rue de l\'Église', 'Laval'],
  ]},
  // 712 31st Avenue (no neighborhood — likely Saint-Michel Montreal)
  { ids: [355,564], candidates: [
    ['712 31e Avenue', 'Montréal'],
    ['712 31e Rue', 'Montréal'],
    ['712 31st Avenue', 'Montréal'],
  ]},
  // 153 Laundry/Landry, Saint-Eustache
  { ids: [361,570], candidates: [
    ['153 Rue Landry', 'Saint-Eustache'],
    ['153 Rue Laundry', 'Saint-Eustache'],
    ['153 Rue Landry', 'Mirabel'],
    ['153 Rue Launay', 'Saint-Eustache'],
  ]},
  // 4995 Chemin de la Côte-Saint-Catherine
  { ids: [466,467,468,469,675,676,677,678], candidates: [
    ['4995 Chemin de la Côte-Saint-Catherine', 'Montréal'],
    ['4995 Côte-Saint-Catherine', 'Montréal'],
    ['4995 Chemin Côte-Saint-Catherine', 'Montréal'],
    ['4995 Cote-Saint-Catherine', 'Montréal'],
    ['4995 Côte Saint-Catherine', 'Montréal'],
  ]},
  // 6025A Avenue du Parc, Outremont
  { ids: [625], candidates: [
    ['6025 Avenue du Parc', 'Montréal'],
    ['6025A Avenue du Parc', 'Montréal'],
    ['6025 Rue du Parc', 'Outremont'],
  ]},
  // 5367 Rue Waverley, Rosemont
  { ids: [624], candidates: [
    ['5367 Rue Waverley', 'Montréal'],
    ['5367 Waverley', 'Montréal'],
    ['5367 Rue Waverly', 'Montréal'],
  ]},
];

(async () => {
  if (repo.ready) await repo.ready;

  const total = GROUPS.length;
  let placed = 0;
  const fail = [];

  for (let gi = 0; gi < GROUPS.length; gi++) {
    const { ids, candidates } = GROUPS[gi];
    const counter = `[${gi + 1}/${total}]`;
    let found = null;

    for (const [q, city] of candidates) {
      const g = await geo(q, city);
      await sleep(1100);
      if (g && ok(g.lat, g.lng)) { found = { g, q, city }; break; }
    }

    if (found) {
      for (const id of ids) {
        await repo.resetGeocode(id);
        await repo.setCoords(id, found.g.lat, found.g.lng);
      }
      placed += ids.length;
      console.log(`${counter} ✓ ids=[${ids.join(',')}]`);
      console.log(`         → "${found.q}", ${found.city} → ${found.g.lat.toFixed(5)}, ${found.g.lng.toFixed(5)}`);
      console.log(`         ✔ ${found.g.display}`);
    } else {
      for (const id of ids) await repo.markGeocodeAttempted(id);
      fail.push({ ids, candidates: candidates.map(c => c.join(', ')) });
      console.log(`${counter} ✗ ids=[${ids.join(',')}] — still no match`);
      for (const [q, city] of candidates) console.log(`         tried: "${q}", ${city}`);
    }
  }

  const final = await repo.listUnits({ all: true });
  const stillMissing = final.filter(u => u.lat == null);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Units placed this pass : ${placed}`);
  console.log(`Located now            : ${final.filter(u => u.lat != null).length} / ${final.length}`);
  console.log(`Still no pin           : ${stillMissing.length}`);
  if (stillMissing.length) {
    console.log('\nRemaining manual work:');
    for (const u of stillMissing) console.log(`  id=${u.id} | "${u.address}" | ${u.neighborhood} | ${u.title}`);
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
