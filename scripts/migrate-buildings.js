// One-time migration: group existing units into buildings by street address
// (stripping apt/unit suffixes), then assign each unit to its building.
// Idempotent: skips units that already have a building_id; reuses buildings
// created on a prior run by matching the normalized street key.
const repo = require('../lib/repo');

function buildingKey(addr) {
  let s = (addr || '').trim();
  s = s.replace(/\s*(?:#|apt\.?|unit|suite|ste\.?|-)\s*[0-9a-z]+\s*$/i, '');
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}
// A readable building name from the raw address (title-ish, suffix stripped).
function buildingName(addr) {
  let s = (addr || '').trim().replace(/\s*(?:#|apt\.?|unit|suite|ste\.?|-)\s*[0-9a-z]+\s*$/i, '');
  return s.replace(/\s+/g, ' ').trim() || addr;
}

(async () => {
  if (repo.ready) await repo.ready;
  const units = await repo.listUnits({ all: true });
  console.log(`Units: ${units.length}`);

  // Index any buildings that already exist by their normalized key.
  const existing = await repo.listBuildings();
  const byKey = new Map();
  for (const b of existing) byKey.set(buildingKey(b.address), b);

  // Group units by building key.
  const groups = new Map();
  for (const u of units) {
    const k = buildingKey(u.address);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(u);
  }
  console.log(`Distinct buildings: ${groups.size}`);

  let created = 0, assigned = 0;
  for (const [key, members] of groups) {
    let building = byKey.get(key);
    if (!building) {
      // Pick a representative: first member with coords, else first member.
      const located = members.find((m) => m.lat != null && m.lng != null) || members[0];
      const neighborhood = (members.find((m) => m.neighborhood)?.neighborhood) || null;
      building = await repo.createBuilding({
        name: buildingName(located.address),
        address: buildingName(located.address),
        neighborhood,
        lat: located.lat ?? null,
        lng: located.lng ?? null,
        geocode_attempted: located.lat != null ? 1 : 0,
      });
      byKey.set(key, building);
      created++;
    }
    for (const u of members) {
      if (u.building_id === building.id) continue;
      if (u.building_id != null) continue; // already grouped elsewhere — leave it
      await repo.setUnitBuilding(u.id, building.id);
      assigned++;
    }
  }
  console.log(`Buildings created: ${created}`);
  console.log(`Units assigned: ${assigned}`);

  // Report buildings still missing a pin.
  const after = await repo.listBuildings();
  const noPin = after.filter((b) => b.lat == null).length;
  console.log(`Buildings: ${after.length} (no pin yet: ${noPin})`);
  process.exit(0);
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
