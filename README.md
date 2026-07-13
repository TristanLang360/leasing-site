# Rentalium

A leasing site — a public listings page with an interactive map, plus a private
staff dashboard for managing units, photos, showings, and your team.

- **Backend:** Node + Express + SQLite JSON API (no build step).
- **Public site:** plain HTML/CSS/JS served by Express.
- **Admin dashboard:** a React + Vite + Tailwind + **shadcn/ui** single-page app
  (in `admin-app/`) that consumes the same API. The built output ships in
  `admin-dist/` so the server runs it without a build step.

## Run it

```bash
npm install
npm start
```

Then open:

- **Public site:** http://localhost:3030/
- **Available units (with map):** http://localhost:3030/units.html
- **Admin dashboard:** http://localhost:3030/admin  (sign in here)

The database is created and seeded with a few demo units on first run.

## Admin app (shadcn/ui)

The dashboard lives in `admin-app/` and is pre-built into `admin-dist/`, so
`npm start` serves it as-is. You only need the steps below if you change the
admin UI.

```bash
# rebuild after editing admin-app/ (regenerates admin-dist/)
npm run build:admin

# hot-reload dev server (proxies the API to :3030 — run `npm start` too)
npm run dev:admin     # http://localhost:5173/admin
```

Add more shadcn components from inside `admin-app/`:

```bash
cd admin-app && npx shadcn@latest add <component>
```

## Logging in

On first run a **Master** account is created. Set its credentials with env vars
(do this before sharing the site):

```bash
MASTER_EMAIL=you@yourcompany.com MASTER_PASS=a-strong-password npm start
```

Defaults if you don't set them: `admin@rentalium.local` / `rentalium`.
The admin app shows a sign-in screen at `/admin` when you're not logged in.

### Roles & access levels

You (Master) manage the team from the **Agents** tab. Each member gets a role:

| Role | Can do |
|------|--------|
| **Master** | Everything — manage units, photos, calendar, **and the team**; delete units |
| **Agent** | Add/edit units, upload & download photos, manage the calendar. **Cannot** delete units or manage users |
| **Viewer** | Read-only. Browse units and **download photos**; no editing |

Members change their own password under the **My account** tab.

## Features

- **Map with pins** — the public units page plots every located unit on a map
  (Leaflet + OpenStreetMap, no API key). Click a pin to jump to its listing.
- **Auto-location** — addresses are geocoded automatically in the background.
  In the editor you can also drop/drag the pin or type coordinates by hand,
  and re-locate from the address on demand.
- **Nearby units** — opening a unit in admin lists the closest other units and
  how far they are, in km.
- **Directions** — a 🧭 Directions button opens Google/Apple Maps with an
  itinerary to the unit.
- **Photo downloads** — agents can download a single photo, or grab **all** of a
  unit's photos as a `.zip` for building listings.
- **CSV import** — upload a CSV of units; the columns are read, mapped, and added
  to the site (then auto-located). A sample CSV is downloadable from the import
  dialog. Required columns: `title`, `address`.
- **Calendar** — schedule showings against a unit and assign them to an agent.
  Month view + an upcoming list.

## Unit fields

Address, neighborhood, price, size (sq ft), beds/baths, appliances, parking
(availability + monthly cost), locker (availability + monthly cost), a dog policy,
map coordinates, and photos.

## Storage & database (local now, Supabase-ready)

The app runs fully locally by default (photos on disk, data in SQLite), but
storage and the database are behind a config-flag **adapter layer** so you can
point them at Supabase later **without touching any route code**. Copy
`.env.example` to `.env` to configure.

### Photo storage — `STORAGE_DRIVER`

| Value | Where photos go |
|-------|-----------------|
| `local` *(default)* | `./uploads` on disk, served at `/uploads` |
| `supabase` | a Supabase Storage bucket |

To switch photos to Supabase:

```bash
npm install @supabase/supabase-js
# in .env:
STORAGE_DRIVER=supabase
SUPABASE_URL=https://YOURPROJECT.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_BUCKET=unit-photos     # create this bucket (public) in Supabase first
```

Uploads, the per-photo download, and the "download all (.zip)" all keep working —
they just read/write the bucket instead of disk. The implementation lives in
`lib/storage.js`.

### Database — `DB_DRIVER`

| Value | Backing store |
|-------|---------------|
| `sqlite` *(default)* | `./rentalium.db` (fully working) |
| `postgres` | Supabase/Postgres — **fully wired** (`lib/repo.postgres.js`) |

Every data call goes through `lib/repo.js`, and every method is `async` and
`await`ed by the handlers. Both drivers are implemented, so switching is just a
config flip. To run on Supabase/Postgres:

1. `npm install pg`
2. Apply `schema.postgres.sql` to your Supabase database
3. Run with `DB_DRIVER=postgres DATABASE_URL=postgres://… npm start`

Both `lib/repo.sqlite.js` and `lib/repo.postgres.js` share the same method
signatures, so route code never changes between drivers.

## Notes

- `rentalium.db`, `uploads/`, and `.env` are git-ignored; the database is
  recreated and seeded locally on first run.
- Geocoding uses the free OpenStreetMap Nominatim service (~1 request/second),
  so bulk imports fill in their map pins gradually in the background.
