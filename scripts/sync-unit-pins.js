// One-time: make every unit's pin equal its building's pin.
const repo = require('../lib/repo');
(async () => {
  if (repo.ready) await repo.ready;
  const blds = await repo.listBuildings();
  let buildings = 0, withPin = 0;
  for (const b of blds) {
    buildings++;
    if (b.lat == null) continue;
    await repo.setUnitsCoordsForBuilding(b.id, b.lat, b.lng);
    withPin++;
  }
  // verify
  const units = await repo.listUnits({ all: true });
  let matched = 0, mism = 0;
  const bmap = new Map(blds.map((b) => [b.id, b]));
  for (const u of units) {
    const b = u.building_id != null ? bmap.get(u.building_id) : null;
    if (b && b.lat != null) { if (u.lat === b.lat && u.lng === b.lng) matched++; else mism++; }
  }
  console.log(`Buildings: ${buildings} (with pin: ${withPin})`);
  console.log(`Units now matching their building pin: ${matched} | mismatched: ${mism}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
