// ───────────────────────────────────────────────────────────────
// Storage adapter. One interface, two drivers (local disk / Supabase
// Storage), chosen by config.storage.driver.
//
// Interface:
//   async save({ buffer, originalname, mimetype }) -> key (string)
//   publicUrl(key)        -> string            (sync, no network)
//   async getBuffer(key)  -> Buffer            (for zip downloads)
//   async remove(key)     -> void
//
// `key` is what we persist in the photos table (column `filename`).
// For local it's a disk filename; for Supabase it's the object path.
// ───────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function newKey(originalname) {
  const ext = (path.extname(originalname || '') || '.jpg').toLowerCase();
  return crypto.randomBytes(8).toString('hex') + ext;
}

// ── Local disk ─────────────────────────────────────────────────
function localDriver(cfg) {
  if (!fs.existsSync(cfg.uploadDir)) fs.mkdirSync(cfg.uploadDir, { recursive: true });
  return {
    driver: 'local',
    async save({ buffer, originalname }) {
      const key = newKey(originalname);
      await fs.promises.writeFile(path.join(cfg.uploadDir, key), buffer);
      return key;
    },
    publicUrl(key) {
      return `${cfg.publicPath}/${key}`;
    },
    // Whether the file is actually on disk (photo rows restored from a DB
    // backup can point at files that were never copied over).
    exists(key) {
      return fs.existsSync(path.join(cfg.uploadDir, key));
    },
    async getBuffer(key) {
      return fs.promises.readFile(path.join(cfg.uploadDir, key));
    },
    async remove(key) {
      await fs.promises.unlink(path.join(cfg.uploadDir, key)).catch(() => {});
    },
  };
}

// ── Supabase Storage ───────────────────────────────────────────
function supabaseDriver(cfg) {
  const sb = cfg.supabase;
  let client = null;
  function getClient() {
    if (client) return client;
    if (!sb.url || !sb.serviceKey) {
      throw new Error('STORAGE_DRIVER=supabase but SUPABASE_URL / SUPABASE_SERVICE_KEY are not set.');
    }
    let createClient;
    try { ({ createClient } = require('@supabase/supabase-js')); }
    catch {
      throw new Error("STORAGE_DRIVER=supabase but '@supabase/supabase-js' is not installed. Run: npm install @supabase/supabase-js");
    }
    client = createClient(sb.url, sb.serviceKey, { auth: { persistSession: false } });
    return client;
  }
  return {
    driver: 'supabase',
    async save({ buffer, originalname, mimetype }) {
      const key = newKey(originalname);
      const { error } = await getClient().storage.from(sb.bucket)
        .upload(key, buffer, { contentType: mimetype || 'image/jpeg', upsert: false });
      if (error) throw new Error('Supabase upload failed: ' + error.message);
      return key;
    },
    exists() {
      return true; // no cheap check against the bucket; assume present
    },
    publicUrl(key) {
      // Public-bucket URL — pure string build, no network call.
      return `${sb.url.replace(/\/$/, '')}/storage/v1/object/public/${sb.bucket}/${key}`;
    },
    // Signed URL the browser can PUT a file to directly (bypasses any
    // serverless request-body limit — needed for large videos on Vercel).
    async createUploadUrl({ originalname }) {
      const key = newKey(originalname);
      const { data, error } = await getClient().storage.from(sb.bucket).createSignedUploadUrl(key);
      if (error) throw new Error('Supabase signed upload failed: ' + error.message);
      return { key, url: data.signedUrl, token: data.token };
    },
    async getBuffer(key) {
      const { data, error } = await getClient().storage.from(sb.bucket).download(key);
      if (error) throw new Error('Supabase download failed: ' + error.message);
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(key) {
      const { error } = await getClient().storage.from(sb.bucket).remove([key]);
      if (error) console.error('Supabase remove failed:', error.message);
    },
  };
}

module.exports = function createStorage(cfg) {
  return cfg.driver === 'supabase' ? supabaseDriver(cfg) : localDriver(cfg);
};
