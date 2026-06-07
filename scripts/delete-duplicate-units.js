// Remove exact-duplicate units created by a double import. Groups units by
// unit_code; within a group it keeps one copy (the one with the most photos,
// else lowest id) and deletes the rest — but ONLY when every member is truly
// identical in content, as a safety guard.
const repo = require('../lib/repo');
const config = require('../config');
const storage = require('../lib/storage')(config.storage);

const sig = (u) => [(u.title || '').trim().toLowerCase(), (u.address || '').trim().toLowerCase(), u.beds, u.baths, u.price].join('|');

(async () => {
  if (repo.ready) await repo.ready;
  const units = await repo.listUnits({ all: true });

  const byCode = new Map();
  for (const u of units) {
    const c = (u.unit_code || '').trim();
    if (!c) continue;
    if (!byCode.has(c)) byCode.set(c, []);
    byCode.get(c).push(u);
  }

  let deleted = 0, skipped = 0, photosRemoved = 0;
  for (const [code, v] of byCode) {
    if (v.length < 2) continue;
    if (new Set(v.map(sig)).size > 1) { skipped++; console.log('SKIP (content differs):', code); continue; }
    const sorted = [...v].sort((a, b) => b.photos.length - a.photos.length || a.id - b.id);
    for (const u of sorted.slice(1)) {
      const keys = await repo.deleteUnit(u.id);
      for (const k of keys || []) { await storage.remove(k).catch(() => {}); photosRemoved++; }
      deleted++;
    }
  }

  const after = await repo.listUnits({ all: true });
  console.log(`\nDeleted duplicate units: ${deleted}`);
  console.log(`Groups skipped (content differed): ${skipped}`);
  console.log(`Photos removed from storage: ${photosRemoved}`);
  console.log(`Units: ${units.length} → ${after.length}`);
  process.exit(0);
})().catch((e) => { console.error('Dedup failed:', e.message); process.exit(1); });
