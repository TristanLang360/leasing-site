// ───────────────────────────────────────────────────────────────
// Central configuration. Everything reads from here so the app can
// be pointed at local files OR Supabase by flipping env flags —
// no code changes required.
//
// Local (default, no setup):
//   npm start
//
// Supabase Storage for photos (keep local DB):
//   STORAGE_DRIVER=supabase \
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_KEY=... \
//   SUPABASE_BUCKET=unit-photos \
//   npm start
//
// Supabase/Postgres database (when the Postgres driver is wired):
//   DB_DRIVER=postgres DATABASE_URL=postgres://... npm start
// ───────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');

// Load .env (git-ignored) into process.env if present, using Node's built-in
// loader — no dependency. Real environment variables always win over the file.
const envFile = path.join(__dirname, '.env');
if (typeof process.loadEnvFile === 'function' && fs.existsSync(envFile)) {
  try { process.loadEnvFile(envFile); } catch { /* malformed .env — ignore, fall back to process.env */ }
}

module.exports = {
  port: process.env.PORT || 3030,

  master: {
    email: (process.env.MASTER_EMAIL || 'admin@rentalium.local').toLowerCase(),
    pass: process.env.MASTER_PASS || 'rentalium',
  },

  session: {
    cookie: 'rentalium_sess',
    days: 14,
  },

  geocode: {
    userAgent: process.env.GEOCODE_USER_AGENT || 'Rentalium/1.0 (leasing site; contact admin)',
  },

  storage: {
    // 'local' = disk under ./uploads ; 'supabase' = a Supabase Storage bucket
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    uploadDir: path.join(__dirname, 'uploads'),
    publicPath: '/uploads',
    supabase: {
      url: process.env.SUPABASE_URL || '',
      serviceKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '',
      bucket: process.env.SUPABASE_BUCKET || 'unit-photos',
    },
  },

  db: {
    // 'sqlite' = local file ; 'postgres' = Supabase/Postgres (driver seam, see lib/repo.postgres.js)
    driver: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
    sqlitePath: path.join(__dirname, 'rentalium.db'),
    url: process.env.DATABASE_URL || '',
  },
};
