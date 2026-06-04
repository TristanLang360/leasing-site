# Rentalium

A small leasing site — a public listings page plus a private admin panel for managing rental units and photos. Node + Express + SQLite, no build step.

## Run it

```bash
npm install
npm start
```

Then open:

- **Public site:** http://localhost:3030/
- **Admin panel:** http://localhost:3030/admin

The database is created and seeded with a few demo units on first run.

## Admin login

Default credentials (change before sharing publicly):

- User: `admin`
- Pass: `rentalium`

Override with environment variables:

```bash
ADMIN_USER=you ADMIN_PASS=a-strong-password npm start
```

## Unit fields

Each unit captures: address, area/neighborhood, price, size (sq ft), beds/baths,
appliances, parking (availability + monthly cost), locker (availability + monthly
cost), and a dog policy (welcome / no dogs / contact us to see if your dog is
accepted). Manage everything from the admin panel — changes are live immediately.

## Notes

- `rentalium.db` and `uploads/` are git-ignored; the database is recreated locally on first run.
