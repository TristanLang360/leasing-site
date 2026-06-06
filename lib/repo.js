// ───────────────────────────────────────────────────────────────
// Data-access adapter. All database access in the app goes through
// the repository returned here, so swapping the backing store means
// changing ONE file — not every route handler.
//
//   DB_DRIVER=sqlite    (default) -> lib/repo.sqlite.js   [fully working]
//   DB_DRIVER=postgres            -> lib/repo.postgres.js [Supabase seam]
//
// Every method is async so a network-backed driver (Supabase/Postgres)
// is a drop-in; the SQLite driver just resolves immediately.
// ───────────────────────────────────────────────────────────────
const config = require('../config');

module.exports = config.db.driver === 'postgres'
  ? require('./repo.postgres')
  : require('./repo.sqlite');
