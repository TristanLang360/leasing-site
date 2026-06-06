// Seed a small SEO topic cluster on the Rentalium blog (idempotent by slug).
// Inserts straight through the repo so it works regardless of the admin password.
const config = require('../config');
const repo = require('../lib/repo');

const POSTS = [
  {
    slug: 'leasing-agency-cost-montreal',
    title: 'How Much Does a Leasing Agency Cost in Montréal? (2026 Guide)',
    excerpt: "What a leasing agency costs in Montréal in 2026 — typical landlord placement fees, what they include, and whether hiring one is worth it.",
    body: `Hiring a leasing agency in Montréal can save you weeks of vacancy and a stack of paperwork — but what does it actually cost? Here's a clear breakdown for 2026.

## Who pays — landlords or renters?

In Québec, a leasing agency is almost always paid by the **landlord**, not the renter. As a tenant, browsing listings and applying through an agency like [Rentalium](/) is free. Landlords pay a **placement fee** only when the agency successfully signs a qualified tenant.

## Typical leasing-agency fees in Montréal

Most Montréal agencies charge a landlord either:

- **A flat placement fee**, often equal to **half a month to one month's rent**, or
- **A percentage of the annual lease** (commonly 4–8%) for full-service management.

For a $1,800/month apartment, a one-month placement fee is **$1,800** — charged once, and only when the unit is leased.

## What the fee covers

A good placement fee isn't just "posting an ad." It usually includes:

- Professional photos and a marketed listing across rental channels
- Tenant pre-screening, credit and reference checks
- Coordinating and hosting showings
- Preparing the Québec lease (**bail**) and required notices
- Following TAL (Tribunal administratif du logement) rules

## Is it worth it?

Run the numbers against your **vacancy cost**. An empty $1,800 unit costs about $60 a day. If an agency fills it two to three weeks faster than you could alone, the placement fee often pays for itself — before you count the time saved on screening and showings.

## Renters: what to expect

You shouldn't pay an agency to *find* you an apartment in Québec, and a landlord can't charge you more than the first month's rent up front. If you're searching, [browse Rentalium's available units](/units.html) — every listing is vetted and move-in ready.

---

**Thinking of listing your unit?** [Tell us about your apartment](/#contact) and we'll give you a realistic timeline and fee up front.`,
  },
  {
    slug: 'best-neighbourhoods-rent-montreal',
    title: 'Best Neighbourhoods to Rent in Montréal (2026)',
    excerpt: 'A 2026 guide to the best Montréal neighbourhoods to rent in — from the Plateau and Mile End to Griffintown, Verdun and NDG — and who each one suits.',
    body: `Montréal is a city of neighbourhoods, each with its own rent levels, vibe and trade-offs. Here's how the most popular areas stack up for renters in 2026.

## Plateau-Mont-Royal

The classic Montréal experience: leafy streets, triplexes with spiral staircases, cafés and parks. Central and very walkable, but among the pricier and most competitive areas. **Best for:** young professionals who want to be in the middle of everything.

## Mile End

The Plateau's artsy neighbour — bagels, music venues and indie shops. A little quieter, still central, still in demand. **Best for:** creatives and foodies.

## Griffintown & Downtown (Ville-Marie)

Modern condos, high-rises and quick access to the office and the Lachine Canal. Turnkey and amenity-rich. **Best for:** professionals who want new construction and a short commute.

## Le Sud-Ouest (Saint-Henri, Verdun)

Riverside, fast-growing and with a strong food scene — often better value than the Plateau. Verdun in particular has become a favourite. **Best for:** renters who want character and a bit more space for the money.

## NDG & Côte-des-Neiges

West-end, green and family-friendly, close to universities and hospitals. Generally more affordable and spacious. **Best for:** families, students and grad students.

## Rosemont–La Petite-Patrie

Calm, residential and increasingly trendy, with the Jean-Talon Market nearby. **Best for:** people who want a real neighbourhood feel without leaving the city.

## How to choose

Weigh three things: your **commute** (Montréal's metro is your friend), your **budget**, and whether you want **character or convenience**. Then [browse available units](/units.html) to see what's actually on the market right now.

---

Not sure where to start? A [Rentalium](/) agent can match you to neighbourhoods that fit your budget and lifestyle.`,
  },
  {
    slug: 'quebec-lease-bail-renters-guide',
    title: 'The Québec Lease (Bail) Explained: A Renter’s Guide for 2026',
    excerpt: 'Everything renters need to know about the Québec lease (bail) in 2026 — TAL rules, automatic renewals, rent increases, and transferring your lease.',
    body: `Renting in Québec works a little differently than the rest of Canada. Here's a plain-language guide to the **lease (bail)** and your rights as a tenant.

## The standard lease (bail)

Most Québec rentals use the official lease form from the **Tribunal administratif du logement (TAL)**. It sets out the rent, the term, who pays for what, and the building rules. Read it carefully before you sign — once signed, it's binding.

## Leases renew automatically

A Québec lease **renews automatically** at the end of its term unless proper notice is given. For a typical 12-month lease, you generally must tell your landlord **three to six months before** the end date if you don't intend to renew.

## Rent increases

At renewal, a landlord can propose a rent increase. You have the right to **refuse it and stay** — the matter can then go to the TAL, which weighs factors like taxes, insurance and major repairs. You don't simply have to accept any increase.

## Transferring or "breaking" your lease

Québec doesn't really have "lease-breaking." Instead, you can:

- **Cede the lease (cession de bail)** — transfer it to someone else for the rest of the term, or
- **Sublet** — keep the lease but let someone occupy the unit temporarily.

You must notify the landlord, who can only refuse a proposed candidate for a **serious reason**.

## Moving day

July 1 is Québec's traditional moving day, so leases and movers book up fast around that date. If you can move outside peak season, you'll find more choice and less competition.

## Before you sign

Have your **ID, proof of income, references and consent for a credit check** ready — good units go quickly. When you're set, [browse Rentalium's vetted listings](/units.html) or [talk to an agent](/#contact) about the lease process.

---

*This guide is general information, not legal advice. For the official rules, consult the TAL.*`,
  },
  {
    slug: 'rent-out-apartment-fast-montreal',
    title: 'How to Rent Out Your Apartment Fast in Montréal (Landlord Guide)',
    excerpt: 'A landlord’s playbook for renting out a Montréal apartment fast in 2026 — pricing, photos, listings, screening, and cutting your vacancy.',
    body: `Every week your Montréal apartment sits empty costs you money. Here's how to lease it quickly — without cutting corners on tenant quality.

## 1. Price it right from day one

Overpricing is the number-one cause of long vacancies. Check what comparable units in your neighbourhood actually rent for, not what you hope to get. A unit priced correctly in week one beats a unit you discount in week four.

## 2. Make it show well

- Fix the small stuff (paint, that leaky faucet, the squeaky door).
- Clean deeply and declutter.
- Take **bright, horizontal photos in daylight** — listings with good photos get far more inquiries.

## 3. Write a listing that answers questions

State the rent, the availability date, the size, what's included (heating, appliances, parking, locker) and the pet policy. The fewer unknowns, the more qualified your leads.

## 4. Screen properly

Collect applications, verify income and references, and run a credit check with consent. Follow **TAL rules** and never discriminate. Solid screening prevents far costlier problems later.

## 5. Prepare the lease (bail) correctly

Use the official Québec lease, include the right clauses, and give the required notices. Mistakes here can come back to bite you at renewal.

## The fast track: use a leasing agency

A leasing agency handles pricing, photos, marketing, showings, screening and the lease — and usually fills units faster because it does this every day. You only pay when a qualified tenant signs. (See [how much a leasing agency costs in Montréal](/blog/leasing-agency-cost-montreal).)

---

**Want it leased without the legwork?** [List your unit with Rentalium](/#contact) — we'll market it, screen tenants and handle the bail. Check our [current available units](/units.html) to gauge the market.`,
  },
];

(async () => {
  if (repo.ready) await repo.ready;
  const masters = (await repo.listUsers()).filter((u) => u.role === 'master' && u.active);
  const authorId = masters[0] ? masters[0].id : null;

  for (const post of POSTS) {
    if (await repo.slugExists(post.slug)) { console.log('skip (exists):', post.slug); continue; }
    await repo.createPost({
      slug: post.slug, title: post.title, excerpt: post.excerpt, body: post.body,
      cover_image: null, status: 'published', author_id: authorId,
      published_at: new Date().toISOString(),
    });
    console.log('published:', post.slug);
  }
  console.log(`\nDone. View at http://localhost:${config.port}/blog`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
