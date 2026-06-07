// Merge buildings that are the same physical building split apart by address
// quirks (apt suffixes, accents, appended city/postal). For each group:
//   - pick a primary (most units; tie → cleanest/shortest address)
//   - move every other building's units into the primary
//   - give the primary a pin/cover if it lacks one and a sibling has it
//   - tidy the primary's name/address, then delete the extra records
const repo = require('../lib/repo');
const config = require('../config');
const storage = require('../lib/storage')(config.storage);

function key(addr) {
  let s = (addr || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.split(',')[0];
  s = s.replace(/#\s*[0-9a-z]+/g, ' ');
  s = s.replace(/\b(apt|app|unit|suite|ste|bsmt|basement|bureau)\.?\s*[0-9a-z]*/g, ' ');
  s = s.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const toks = s.split(' ').filter(Boolean);
  if (!toks.length) return s;
  const civic = toks[0], rest = toks.slice(1), street = [];
  for (const t of rest) {
    const shortAlnum = t.length <= 3 && /\d/.test(t);
    if (shortAlnum && street.length > 0) continue;
    if (/[a-z]/.test(t)) street.push(t.replace(/^(st|ste|saint|sainte)$/, 'st').replace(/^(ave|av|avenue)$/, 'av').replace(/^(rue|boul|boulevard|blvd|chemin|chem|ch)$/, ''));
  }
  return `${civic} ${street.filter(Boolean).join(' ')}`.trim();
}
function tidy(addr) {
  let s = (addr || '').split(',')[0];
  s = s.replace(/#\s*[0-9a-z]+/gi, ' ');
  s = s.replace(/\b(apt|app|unit|suite|ste|bsmt|basement|bureau)\.?\s*[0-9a-z]*/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const toks = s.split(' ');
  if (toks.length > 2) { const last = toks[toks.length - 1]; if (last.length <= 3 && /\d/.test(last)) toks.pop(); }
  return toks.join(' ').replace(/\s+/g, ' ').trim();
}
const n = (v) => Number(v || 0);

(async () => {
  if (repo.ready) await repo.ready;
  const buildings = await repo.listBuildings();
  const groups = new Map();
  for (const b of buildings) { const k = key(b.address); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
  const dupes = [...groups.values()].filter((v) => v.length > 1);

  let mergedGroups = 0, movedUnits = 0, deleted = 0;
  for (const group of dupes) {
    // primary: most units, then no '#', then shortest address
    const sorted = [...group].sort((a, b) =>
      n(b.unit_count) - n(a.unit_count) ||
      (a.address.includes('#') ? 1 : 0) - (b.address.includes('#') ? 1 : 0) ||
      a.address.length - b.address.length);
    const primary = sorted[0];
    const others = sorted.slice(1);

    // backfill pin / cover from a sibling if the primary is missing them
    let lat = primary.lat, lng = primary.lng, cover = primary.cover_image;
    if (lat == null) { const withPin = others.find((o) => o.lat != null); if (withPin) { lat = withPin.lat; lng = withPin.lng; } }
    if (!cover) { const withCover = others.find((o) => o.cover_image); if (withCover) cover = withCover.cover_image; }

    // tidy the kept building + apply backfilled pin/cover
    const newName = tidy(primary.address) || primary.name;
    await repo.updateBuilding(primary.id, {
      name: newName, address: newName, neighborhood: primary.neighborhood,
      lat, lng, geocode_attempted: lat != null ? 1 : 0,
    });
    if (cover && cover !== primary.cover_image) await repo.setBuildingCover(primary.id, cover);

    // move units, then delete the extra records
    for (const o of others) {
      const units = await repo.unitsForBuilding(o.id);
      for (const u of units) { await repo.setUnitBuilding(u.id, primary.id); movedUnits++; }
      if (o.cover_image && o.cover_image !== cover) await storage.remove(o.cover_image).catch(() => {});
      await repo.deleteBuilding(o.id);
      deleted++;
    }
    mergedGroups++;
    console.log(`merged ${group.length} → "#${primary.id} ${newName}"  (+${others.reduce((s,o)=>s+n(o.unit_count),0)} units)`);
  }

  const after = await repo.listBuildings();
  console.log(`\nGroups merged: ${mergedGroups} | units moved: ${movedUnits} | buildings deleted: ${deleted}`);
  console.log(`Buildings: ${buildings.length} → ${after.length}`);
  process.exit(0);
})().catch((e) => { console.error('Merge failed:', e.message); process.exit(1); });
