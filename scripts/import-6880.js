// One-off: import the 6880 25 E photos into Supabase Storage + DB.
// Uploads each image once per unit (separate object per photo row so a
// later per-unit delete won't orphan the other unit's image), inserts
// photo rows for both units, and sets the building cover image.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const createStorage = require('../lib/storage');
const repo = require('../lib/repo');

const SRC = '/Users/tristanlanglais/Downloads/6880 25 E';
const BUILDING_ID = 274;
const UNIT_IDS = [63]; // U-1-2 (6880 25 E #1)

async function main() {
  const storage = createStorage(config.storage);
  const files = fs.readdirSync(SRC)
    .filter(f => /\.(jpe?g|png|webp|mp4|mov)$/i.test(f))
    .sort();
  console.log(`Found ${files.length} files`);

  let firstKey = null;
  for (const unitId of UNIT_IDS) {
    const items = [];
    for (const f of files) {
      const buffer = fs.readFileSync(path.join(SRC, f));
      const ext = path.extname(f).toLowerCase();
      const isVideo = /\.(mp4|mov)$/i.test(f);
      const mimetype = isVideo ? 'video/mp4'
        : ext === '.png' ? 'image/png'
        : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const key = await storage.save({ buffer, originalname: f, mimetype });
      items.push({ key, kind: isVideo ? 'video' : 'image' });
      if (!firstKey) firstKey = key;
      console.log(`unit ${unitId} <- ${f} (${key})`);
    }
    await repo.addPhotos(unitId, items);
  }

  if (firstKey) {
    await repo.setBuildingCover(BUILDING_ID, firstKey);
    console.log(`building ${BUILDING_ID} cover_image = ${firstKey}`);
  }
  console.log('Done.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
