# Rentalium

A leasing site — a public listings page with an interactive map, plus a private
staff dashboard for managing units, photos, showings, and your team.
Node + Express + SQLite, no build step.

## Run it

```bash
npm install
npm start
```

Then open:

- **Public site:** http://localhost:3030/
- **Available units (with map):** http://localhost:3030/units.html
- **Staff login:** http://localhost:3030/login
- **Admin dashboard:** http://localhost:3030/admin

The database is created and seeded with a few demo units on first run.

## Logging in

On first run a **Master** account is created. Set its credentials with env vars
(do this before sharing the site):

```bash
MASTER_EMAIL=you@yourcompany.com MASTER_PASS=a-strong-password npm start
```

Defaults if you don't set them: `admin@rentalium.local` / `rentalium`.

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

## Notes

- `rentalium.db` and `uploads/` are git-ignored; the database is recreated and
  seeded locally on first run.
- Geocoding uses the free OpenStreetMap Nominatim service (~1 request/second),
  so bulk imports fill in their map pins gradually in the background.
