// Full DB contract test against whatever DB_DRIVER is configured.
// Exercises every method in lib/repo.*.js with assertions + cleanup.
const repo = require('../lib/repo');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.error('  ✗ FAIL:', msg); } };
const section = (s) => console.log('\n' + s);

(async () => {
  if (repo.ready) await repo.ready;
  console.log('Driver:', repo.driver);

  // ── Units ──────────────────────────────────────────────
  section('Units');
  const baseUnit = {
    unit_code: 'TEST-1', title: 'Test Unit', address: '1 Test St, Montréal', neighborhood: 'Testville',
    beds: 2, baths: 1, sqft: 800, price: 2100, available_date: '2026-08-01', description: 'A test unit.',
    appliances: 'fridge,stove', parking_available: 'yes', parking_cost: 75, locker_available: 'no',
    locker_cost: null, dogs_policy: 'yes', status: 'available', lat: null, lng: null, geocode_attempted: 0,
  };
  const created = await repo.createUnit(baseUnit);
  ok(created && created.id, 'createUnit returns row with id');
  ok(created.title === 'Test Unit' && created.beds === 2, 'createUnit persists fields');
  ok(Array.isArray(created.photos) && created.photos.length === 0, 'createUnit hydrates empty photos[]');

  const fetched = await repo.getUnit(created.id);
  ok(fetched && fetched.id === created.id, 'getUnit returns the row');

  const updated = await repo.updateUnit(created.id, { ...baseUnit, price: 2250, status: 'available' });
  ok(updated.price === 2250, 'updateUnit persists change');

  const listAll = await repo.listUnits({ all: true });
  ok(listAll.some((u) => u.id === created.id), 'listUnits({all:true}) includes new unit');
  const listPublic = await repo.listUnits();
  ok(listPublic.every((u) => u.status === 'available'), 'listUnits() returns only available');

  const bulkCount = await repo.createUnitsBulk([
    { ...baseUnit, unit_code: 'BULK-1', title: 'Bulk 1' },
    { ...baseUnit, unit_code: 'BULK-2', title: 'Bulk 2' },
  ]);
  ok(bulkCount === 2, 'createUnitsBulk returns inserted count (2)');

  // ── Geocoding ──────────────────────────────────────────
  section('Geocoding');
  const needs = await repo.nextUnitNeedingGeocode();
  ok(needs && needs.address, 'nextUnitNeedingGeocode returns a candidate');
  await repo.setCoords(created.id, 45.5017, -73.5673);
  const geocoded = await repo.getUnit(created.id);
  ok(geocoded.lat === 45.5017 && geocoded.geocode_attempted === 1, 'setCoords sets lat/lng + attempted');
  const located = await repo.locatedUnitsExcept(-1);
  ok(located.some((u) => u.id === created.id), 'locatedUnitsExcept returns geocoded units');
  await repo.resetGeocode(created.id);
  const reset = await repo.getUnit(created.id);
  ok(reset.lat === null && reset.geocode_attempted === 0, 'resetGeocode clears coords');
  await repo.markGeocodeAttempted(created.id);
  ok((await repo.getUnit(created.id)).geocode_attempted === 1, 'markGeocodeAttempted sets flag');

  // ── Photos ─────────────────────────────────────────────
  section('Photos');
  const added = await repo.addPhotos(created.id, ['photoA.jpg', 'photoB.jpg']);
  ok(added.length === 2 && added[0].id, 'addPhotos returns rows with ids');
  const photos = await repo.listPhotos(created.id);
  ok(photos.length === 2 && photos[0].sort_order === 0 && photos[1].sort_order === 1, 'listPhotos ordered by sort_order');
  const onePhoto = await repo.getPhoto(added[0].id);
  ok(onePhoto && onePhoto.key === 'photoA.jpg' && onePhoto.unit_code === 'TEST-1', 'getPhoto joins unit info');
  const delKey = await repo.deletePhoto(added[0].id);
  ok(delKey === 'photoA.jpg', 'deletePhoto returns removed key');
  ok((await repo.listPhotos(created.id)).length === 1, 'deletePhoto removed exactly one');

  // ── Users ──────────────────────────────────────────────
  section('Users');
  const before = await repo.countUsers();
  const u = await repo.createUser({ email: 'agent-test@example.com', name: 'Agent Test', role: 'agent', salt: 's', hash: 'h' });
  ok(u && u.id && u.email === 'agent-test@example.com', 'createUser returns safe row (no hash)');
  ok(u.hash === undefined, 'createUser does not leak hash');
  ok((await repo.countUsers()) === before + 1, 'countUsers increments');
  ok((await repo.getUserByEmail('agent-test@example.com')).id === u.id, 'getUserByEmail');
  ok((await repo.getActiveUserByEmail('agent-test@example.com')).id === u.id, 'getActiveUserByEmail');
  ok((await repo.getUserById(u.id)).id === u.id, 'getUserById');
  const upUser = await repo.updateUser(u.id, { name: 'Renamed', role: 'master', active: 1 });
  ok(upUser.name === 'Renamed' && upUser.role === 'master', 'updateUser persists');
  ok((await repo.countActiveMasters()) >= 1, 'countActiveMasters >= 1');
  await repo.setUserPassword(u.id, 'newsalt', 'newhash');
  ok((await repo.getUserByEmail('agent-test@example.com')).hash === 'newhash', 'setUserPassword updates hash');
  await repo.updateUser(u.id, { name: 'Renamed', role: 'agent', active: 0 });
  ok((await repo.getActiveUserByEmail('agent-test@example.com')) === null, 'inactive user excluded from getActiveUserByEmail');
  ok((await repo.listUsers()).some((x) => x.id === u.id), 'listUsers includes user');

  // ── Sessions ───────────────────────────────────────────
  section('Sessions');
  const sess = await repo.createSession(u.id, 14);
  ok(sess.token && sess.expires, 'createSession returns token + expires');
  const gotSess = await repo.getSession(sess.token);
  ok(gotSess && gotSess.email === 'agent-test@example.com', 'getSession joins user');
  await repo.deleteSession(sess.token);
  ok((await repo.getSession(sess.token)) === null, 'deleteSession removes it');

  // ── Appointments ───────────────────────────────────────
  section('Appointments');
  const appt = await repo.createAppointment({
    unit_id: created.id, title: 'Showing', start_at: '2026-08-10T15:00:00Z', end_at: '2026-08-10T15:30:00Z',
    client_name: 'Jane', client_phone: '555', client_email: 'jane@example.com', notes: 'n', agent_id: u.id,
    status: 'scheduled', created_by: u.id,
  });
  ok(appt && appt.id, 'createAppointment returns row');
  ok(appt.unit && appt.unit.id === created.id, 'createAppointment hydrates unit');
  ok(appt.agent && appt.agent.id === u.id, 'createAppointment hydrates agent');
  const gotAppt = await repo.getAppointment(appt.id);
  ok(gotAppt.title === 'Showing', 'getAppointment');
  const upAppt = await repo.updateAppointment(appt.id, { ...appt, title: 'Rescheduled', status: 'confirmed' });
  ok(upAppt.title === 'Rescheduled' && upAppt.status === 'confirmed', 'updateAppointment persists');
  const apptList = await repo.listAppointments({ from: '2026-08-01T00:00:00Z', to: '2026-08-31T00:00:00Z', unitId: created.id });
  ok(apptList.some((a) => a.id === appt.id), 'listAppointments filters by range + unit');
  await repo.deleteAppointment(appt.id);
  ok((await repo.getAppointment(appt.id)) === null, 'deleteAppointment removes it');

  // ── Blog posts ─────────────────────────────────────────
  section('Blog posts');
  const postsBefore = (await repo.listPosts({})).length;
  const pslug = 'smoke-post-' + Date.now();
  const post = await repo.createPost({
    slug: pslug, title: 'Smoke Post', excerpt: 'x', body: '## hi',
    cover_image: null, status: 'published', author_id: u.id,
    published_at: new Date().toISOString(),
  });
  ok(post.id != null, 'createPost returns row');
  ok(post.author && post.author.id === u.id, 'createPost hydrates author');
  ok(await repo.slugExists(pslug), 'slugExists true for existing slug');
  ok(!(await repo.slugExists(pslug, post.id)), 'slugExists excludes self');
  ok((await repo.getPostBySlug(pslug)).title === 'Smoke Post', 'getPostBySlug');
  ok((await repo.getPostBySlug(pslug, { publishedOnly: true })) !== null, 'getPostBySlug published');
  const draft = await repo.updatePost(post.id, {
    slug: pslug, title: 'Smoke Post', excerpt: 'x', body: '## hi',
    cover_image: null, status: 'draft', published_at: post.published_at,
  });
  ok(draft.status === 'draft', 'updatePost persists');
  ok((await repo.getPostBySlug(pslug, { publishedOnly: true })) === null, 'draft hidden from publishedOnly');
  ok((await repo.listPosts({ publishedOnly: true })).every((p) => p.slug !== pslug), 'draft excluded from published list');
  await repo.deletePost(post.id);
  ok((await repo.listPosts({})).length === postsBefore, 'deletePost cleaned up');

  // ── Cascade + cleanup ──────────────────────────────────
  section('Delete + cascade cleanup');
  const remainingKeys = await repo.deleteUnit(created.id);
  ok(remainingKeys.includes('photoB.jpg'), 'deleteUnit returns remaining photo keys');
  ok((await repo.getUnit(created.id)) === null, 'deleteUnit removed the unit');
  ok((await repo.listPhotos(created.id)).length === 0, 'photos cascade-deleted with unit');

  // Remove the bulk + test user we created so the DB is left clean.
  for (const code of ['BULK-1', 'BULK-2']) {
    const found = (await repo.listUnits({ all: true })).filter((x) => x.unit_code === code);
    for (const f of found) await repo.deleteUnit(f.id);
  }
  await repo.deleteUser(u.id);
  ok((await repo.getUserById(u.id)) === null, 'test user deleted (cleanup)');

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
