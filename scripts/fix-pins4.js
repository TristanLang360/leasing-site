// Batch geocode ALL units with NULL lat/lng.
// Uses neighborhood field as city hint, prints a counter + matched display_name for verification.
const repo = require('../lib/repo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Broad acceptance box: Montréal + Laval + South Shore + Gatineau + surrounding
const ok = (lat, lng) => lat >= 44.8 && lat <= 46.5 && lng >= -76.5 && lng <= -72.5;

// ── City detection (neighborhood > address > title fallback) ──────────────────
function detectCity(address, title, neighborhood) {
  const src = `${neighborhood || ''} ${address || ''} ${title || ''}`.toLowerCase();
  if (/laval/i.test(src)) return 'Laval';
  if (/gatineau/i.test(src)) return 'Gatineau';
  if (/boisbriand/i.test(src)) return 'Boisbriand';
  if (/saint.eustache|st\.?\s*eustache/i.test(src)) return 'Saint-Eustache';
  if (/repentigny/i.test(src)) return 'Repentigny';
  if (/longueuil|greenfield.park/i.test(src)) return 'Longueuil';
  if (/cowansville/i.test(src)) return 'Cowansville';
  if (/deux.montagnes/i.test(src)) return 'Deux-Montagnes';
  if (/dorval/i.test(src)) return 'Dorval';
  if (/sainte?.anne.de.bellevue|anne.de.bellevue/i.test(src)) return 'Sainte-Anne-de-Bellevue';
  if (/trois.rivi[eè]res|trois-rivi/i.test(src)) return 'Trois-Rivières';
  if (/saint.jean.sur.richelieu/i.test(src)) return 'Saint-Jean-sur-Richelieu';
  if (/anjou/i.test(src)) return 'Anjou';
  if (/cote.saint.luc|côte.saint.luc/i.test(src)) return 'Côte-Saint-Luc';
  if (/dollard.des.ormeaux/i.test(src)) return 'Dollard-des-Ormeaux';
  if (/montreal.ouest|montreal-ouest|montréal.ouest/i.test(src)) return 'Montréal-Ouest';
  if (/montreal.est|montréal-est/i.test(src)) return 'Montréal-Est';
  if (/montreal.nord|montréal-nord|montreal.north/i.test(src)) return 'Montréal-Nord';
  if (/lachine/i.test(src)) return 'Lachine';
  if (/outremont/i.test(src)) return 'Outremont';
  return 'Montréal';
}

// ── Address normalization ─────────────────────────────────────────────────────
function stripApt(s) {
  return String(s || '')
    .split(/\s*(?:#|\bapt\.?\s*|\bunit\b|\bsuite\b|\bste\.?|\bbasement\b|\bbsmt\b)/i)[0]
    .replace(/\s+[-–]\s*[A-Za-z]?\d+[A-Za-z]?\s*$/, '')   // " - H2"
    .replace(/\s+(?:[A-Za-z]{0,2}\d{1,4}[A-Za-z]?|[A-Za-z]\d*)$/, '') // trailing apt token
    .replace(/[,\s]+$/, '')
    .trim();
}

function normalizeStreet(s) {
  return s
    .replace(/\bmtee\b/gi, 'Montée')
    .replace(/\bchem\.?\b/gi, 'Chemin')
    .replace(/\bbd\b\.?/gi, 'Boulevard')
    .replace(/\bboul\.?\b/gi, 'Boulevard')
    .replace(/\bav\.?\b(?!\s+perrin|\s+van|\s+papineau|\s+barclay|\s+dollard|\s+laurier)/gi, 'Avenue')
    .replace(/\bst\.?\s+catherine\b/gi, 'Rue Sainte-Catherine')
    .replace(/\bst\.?\s+andr[eé]\b/gi, 'Rue Saint-André')
    .replace(/\bcote\s+veru\b/gi, 'Côte Vertu')
    .replace(/\bcote\s+vertu\b/gi, 'Côte Vertu')
    .replace(/\bcote\s+st\s+catherine\b/gi, 'Chemin de la Côte-Saint-Catherine')
    .replace(/\bcote\s+des\s+neiges?\b/gi, 'Chemin de la Côte-des-Neiges')
    .replace(/\besplanade\b/gi, "Avenue de l'Esplanade")
    .replace(/\bprefontaine\b/gi, 'Rue Préfontaine')
    .replace(/\bsavanne\b/gi, 'Rue de la Savane')
    .replace(/\bsavane\b/gi, 'Rue de la Savane')
    .replace(/\bparc\b(?!\s+ex)/gi, 'Avenue du Parc')
    .replace(/\bcharles\s+thibault\b/gi, 'Rue Charles-Thibault')
    .replace(/\bbasile\s+pat[ae]n[ae]u[de]?\b/gi, 'Rue Basile-Patenaude')
    .replace(/\bde\s+lorimier\b/gi, 'Avenue De Lorimier')
    .replace(/\bde\s+lormier\b/gi, 'Avenue De Lorimier')
    .replace(/\bde\s+lep[eé]e\b/gi, 'Rue De Lépée')
    .replace(/\bmontee\s+sanch[ae]\b/gi, 'Montée Sancha')
    .replace(/\bmontee\s+champagne\b/gi, 'Montée Champagne')
    .replace(/\bpainter\s+circle\b/gi, 'Rue Painter')
    .replace(/\bontario\s+e\b/gi, 'Rue Ontario Est')
    .replace(/\bsherbrook[e]?\s+e\b/gi, 'Rue Sherbrooke Est')
    .replace(/\bsherbrook[e]?\s+o\b/gi, 'Rue Sherbrooke Ouest')
    .replace(/\blaundry\b/gi, 'Rue Laundry')
    .replace(/\bvilleray\b/gi, 'Rue Villeray')
    .replace(/\bcremazier?\b/gi, 'Boulevard Crémazie')
    .replace(/\bwaverly\b/gi, 'Rue Waverley')
    .replace(/\borgane\b/gi, 'Rue des Ormeaux')
    .replace(/\bE\b/g, 'Est').replace(/\bO\b/g, 'Ouest')
    .replace(/\s+/g, ' ').trim();
}

function candidates(address, title, neighborhood) {
  const city = detectCity(address, title, neighborhood);

  // Already has QC/province → strip apt and use as-is
  if (/,\s*(QC|Quebec|Québec)/i.test(address)) {
    const clean = address.replace(/\s*#\S+/, '').replace(/\s+\d+\s*$/, '').trim();
    return [{ q: clean, city: '' }];
  }

  const s0 = stripApt(address);
  const list = [];
  const add = (q, c) => { const t = (q || '').replace(/\s+/g, ' ').trim(); if (t) list.push({ q: t, city: c || city }); };

  // Handle "6910 #1 Saint Michel" → strip embedded unit
  const embeddedUnit = s0.replace(/^(\d+[A-Za-z]?)\s+#\d+[A-Za-z]?\s+/, '$1 ');
  const normalized = normalizeStreet(embeddedUnit || s0);
  const base = normalizeStreet(s0);

  // Numbered avenue pattern: "9198A 14e ave" or "7132 1e" or "655 20E AV"
  const numAvMatch = s0.match(/^(\d+[A-Za-z]?)\s+(?:[A-Za-z]*\s*)?(\d{1,3})[eèrE]?\s*(?:av|ave|avenue|rue)?\s*$/i);
  if (numAvMatch) {
    const num = parseInt(numAvMatch[2]);
    const suf = num === 1 ? 're' : 'e';
    add(`${numAvMatch[1]} ${num}${suf} Avenue`, city);
    add(`${numAvMatch[1]} ${num}${suf} Rue`, city);
  }

  add(normalized, city);
  if (normalized !== base) add(base, city);

  // Try without trailing token
  const shorter = s0.replace(/\s+[-–]\s*\S+$/, '').replace(/\s+\d{1,4}$/, '').trim();
  const shorterNorm = normalizeStreet(shorter);
  if (shorterNorm !== normalized && shorterNorm !== base) add(shorterNorm, city);

  return list;
}

// ── Geocode via Nominatim ─────────────────────────────────────────────────────
async function geo(q, city) {
  try {
    const query = city ? `${q}, ${city}, QC, Canada` : q;
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=' + encodeURIComponent(query);
    const r = await fetch(url, { headers: { 'User-Agent': 'Rentalium/1.0 fixpins4' } });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j[0]) {
      const lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng, display: j[0].display_name };
    }
  } catch {}
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (repo.ready) await repo.ready;

  const all = await repo.listUnits({ all: true });
  const missing = all.filter((u) => u.lat == null);
  const total = missing.length;
  console.log(`Units without a pin: ${total}\n`);

  let placed = 0;
  const fail = [];

  for (let i = 0; i < missing.length; i++) {
    const u = missing[i];
    const counter = `[${i + 1}/${total}]`;

    let done = false;
    for (const c of candidates(u.address, u.title, u.neighborhood)) {
      const g = await geo(c.q, c.city);
      await sleep(1100);
      if (g && ok(g.lat, g.lng)) {
        await repo.setCoords(u.id, g.lat, g.lng);
        placed++;
        console.log(`${counter} ✓ id=${u.id} | "${u.address}" (${u.neighborhood || '?'})`);
        console.log(`         → ${c.q}${c.city ? ', ' + c.city : ''} → ${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`);
        console.log(`         ✔ ${g.display}`);
        done = true;
        break;
      }
    }

    if (!done) {
      await repo.markGeocodeAttempted(u.id);
      fail.push(u);
      console.log(`${counter} ✗ id=${u.id} | "${u.address}" (${u.neighborhood || '?'}) — no match`);
    }
  }

  const final = await repo.listUnits({ all: true });
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Newly placed : ${placed}`);
  console.log(`Located now  : ${final.filter((u) => u.lat != null).length} / ${final.length}`);
  console.log(`Still no pin : ${fail.length}`);
  if (fail.length) {
    console.log('\nNeed manual pins:');
    for (const f of fail) console.log(`  id=${f.id} | "${f.address}" | neighborhood="${f.neighborhood}" | ${f.title}`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
