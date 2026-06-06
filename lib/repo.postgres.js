// ───────────────────────────────────────────────────────────────
// Postgres / Supabase database driver — SEAM, not yet wired.
//
// The app is structured so that turning this on is a self-contained
// job: implement the same async methods as lib/repo.sqlite.js using
// `pg` (node-postgres) or the Supabase client, pointed at DATABASE_URL.
//
// To finish the migration:
//   1. npm install pg
//   2. Apply schema.postgres.sql to your Supabase database
//      (SQL editor, or: psql "$DATABASE_URL" -f schema.postgres.sql)
//   3. Implement each method below with the same signatures/return
//      shapes as lib/repo.sqlite.js (they're already async, and every
//      caller already awaits them, so no route handlers change).
//   4. Run with: DB_DRIVER=postgres DATABASE_URL=postgres://... npm start
//
// Until then, selecting DB_DRIVER=postgres fails fast with this note so
// nobody thinks data is being written to Postgres when it isn't.
// ───────────────────────────────────────────────────────────────
const config = require('../config');

const HINT = [
  'DB_DRIVER=postgres is selected but the Postgres driver is not implemented yet.',
  'See lib/repo.postgres.js and schema.postgres.sql for the migration steps,',
  'or run with the default SQLite driver (omit DB_DRIVER / set DB_DRIVER=sqlite).',
].join(' ');

if (config.db.driver === 'postgres') {
  // Fail loudly at boot rather than silently doing nothing.
  throw new Error(HINT);
}

module.exports = new Proxy({ driver: 'postgres' }, {
  get() { throw new Error(HINT); },
});
