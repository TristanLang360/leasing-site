// Public-site i18n. French dictionary keyed by the English source text.
// A small DOM walker translates text nodes + key attributes on load; complex
// elements (with inline tags) are swapped wholesale via the HTML map. English
// stays the HTML source (so SEO is unchanged); French is applied client-side.
(function () {
  var KEY = 'rentalium_lang';

  // ── French dictionary (English source → French) ──────────────────
  var FR = {
    // Nav / buttons
    'Services': 'Services',
    'Neighbourhoods': 'Quartiers',
    'Available units': 'Unités disponibles',
    'Blog': 'Blogue',
    'Contact': 'Contact',
    'Browse rentals': 'Voir les locations',
    'Contact agent': 'Contacter un agent',
    'Staff': 'Personnel',

    // Hero
    'Leasing agency · Montréal': 'Agence de location · Montréal',
    'How we work': 'Comment nous travaillons',
    'Available now': 'Disponible maintenant',

    // Stats
    'Occupancy rate': 'Taux d’occupation',
    'Avg. time to lease': 'Délai moyen de location',
    'Montréal units managed': 'unités gérées à Montréal',
    'Landlord rating': 'Note des propriétaires',

    // Why Rentalium
    'Why Rentalium': 'Pourquoi Rentalium',
    'A leasing agency built': 'Une agence de location conçue',
    'for Montréal.': 'pour Montréal.',
    'We’re a Montréal-based leasing team that knows the difference between a Plateau triplex and a\n        Griffintown condo. Our agents handle Québec lease (bail) paperwork, credit and reference checks,\n        and TAL rules — in English and French — so landlords lease faster and renters move in with confidence.':
      'Nous sommes une équipe de location montréalaise qui connaît la différence entre un triplex du Plateau et un condo de Griffintown. Nos agents s’occupent du bail québécois, des vérifications de crédit et de références, et des règles du TAL — en français et en anglais — pour que les propriétaires louent plus vite et que les locataires emménagent en confiance.',

    // Services
    'What we do': 'Ce que nous faisons',
    'Leasing for landlords.': 'Location pour propriétaires.',
    'Apartments for renters.': 'Appartements pour locataires.',
    'Whether you own a unit to fill or you’re hunting for your next apartment in Montréal, you get the same thing: clear data, fast communication, and no surprises.':
      'Que vous ayez une unité à louer ou que vous cherchiez votre prochain appartement à Montréal, vous obtenez la même chose : des données claires, une communication rapide et aucune surprise.',
    '01 / For landlords': '01 / Pour les propriétaires',
    'Fill your Montréal unit, fast.': 'Louez votre unité montréalaise, rapidement.',
    'End-to-end tenant placement for owners and operators — professional listings, screening, showings, lease signing and turnover. Every available unit is tracked in one place.':
      'Placement de locataires de A à Z pour propriétaires et gestionnaires — annonces professionnelles, sélection, visites, signature de bail et roulement. Chaque unité disponible est suivie au même endroit.',
    'Listing & marketing across rental channels': 'Annonce et marketing sur les canaux de location',
    'Tenant pre-screening & credit verification': 'Présélection des locataires et vérification de crédit',
    'Showing scheduling & Québec lease (bail) prep': 'Planification des visites et préparation du bail québécois',
    'Monthly portfolio reporting for owners': 'Rapports de portefeuille mensuels pour propriétaires',
    'List your unit': 'Inscrire mon unité',
    '02 / For renters': '02 / Pour les locataires',
    'Find your next apartment in Montréal.': 'Trouvez votre prochain appartement à Montréal.',
    'Browse vetted, move-in-ready rentals across Montréal’s best neighbourhoods. Tell us what you need and we’ll match you with units that fit — often before they go public.':
      'Parcourez des logements vérifiés et prêts à emménager dans les meilleurs quartiers de Montréal. Dites-nous ce qu’il vous faut et nous vous proposerons des unités qui conviennent — souvent avant qu’elles ne soient publiques.',
    'Curated, currently-available listings': 'Annonces actuelles soigneusement sélectionnées',
    'Neighbourhood & budget matching': 'Jumelage par quartier et budget',
    'Pet-friendly, parking & locker filters': 'Filtres animaux, stationnement et casier',
    'Straightforward lease signing': 'Signature de bail simple',
    'See available units': 'Voir les unités disponibles',
    'Also coming soon: a compliant debt-recovery practice for Québec landlords and small businesses.':
      'Bientôt aussi : un service conforme de recouvrement de créances pour les propriétaires et petites entreprises du Québec.',

    // Neighbourhoods
    'Service area': 'Zone desservie',
    'Neighbourhoods we lease': 'Les quartiers où nous louons',
    'across Montréal.': 'à travers Montréal.',
    'From the Plateau to the West Island, Rentalium places tenants and manages rentals island-wide. A few of the areas we cover:':
      'Du Plateau à l’Ouest-de-l’Île, Rentalium place des locataires et gère des locations sur toute l’île. Quelques-uns des secteurs couverts :',
    'Downtown / Ville-Marie': 'Centre-ville / Ville-Marie',
    'Old Montréal': 'Vieux-Montréal',

    // Process
    'How it works': 'Comment ça marche',
    'Our Montréal leasing': 'Notre processus de location',
    'process, step by step.': 'montréalais, étape par étape.',
    'One transparent workflow for landlords and renters alike.': 'Un processus transparent, autant pour les propriétaires que les locataires.',
    'Step 1': 'Étape 1', 'Step 2': 'Étape 2', 'Step 3': 'Étape 3', 'Step 4': 'Étape 4',
    'Tell us what you need': 'Dites-nous ce qu’il vous faut',
    'A unit to fill or an apartment to find. We capture the details — budget, neighbourhood, move dates, pets, parking.':
      'Une unité à louer ou un appartement à trouver. Nous notons les détails — budget, quartier, dates, animaux, stationnement.',
    'We list or match': 'Nous inscrivons ou jumelons',
    'Landlords get a marketed listing with photos and a map pin. Renters get matched to vetted, available units that fit.':
      'Les propriétaires obtiennent une annonce avec photos et une épingle sur la carte. Les locataires sont jumelés à des unités vérifiées et disponibles qui conviennent.',
    'Screening & showings': 'Sélection et visites',
    'Credit and reference checks, scheduled showings, and honest answers about every unit and building.':
      'Vérifications de crédit et de références, visites planifiées et réponses honnêtes sur chaque unité et immeuble.',
    'Lease & move in': 'Bail et emménagement',
    'We prepare the Québec lease (bail), coordinate signing, and hand over the keys.':
      'Nous préparons le bail québécois, coordonnons la signature et remettons les clés.',

    // Featured units
    'Move-in ready in Montréal.': 'Prêt à emménager à Montréal.',
    'View all units': 'Voir toutes les unités',

    // FAQ
    'FAQ': 'FAQ',
    'Montréal leasing agency,': 'Agence de location à Montréal,',
    'answered.': 'vos questions.',
    'What does a leasing agency in Montréal do?': 'Que fait une agence de location à Montréal ?',
    'A leasing agency markets rental units, screens and places tenants, and prepares the Québec lease — saving landlords time and helping renters find vetted apartments faster than searching alone.':
      'Une agence de location annonce des unités, sélectionne et place des locataires, et prépare le bail québécois — faisant gagner du temps aux propriétaires et aidant les locataires à trouver des appartements vérifiés plus vite que seuls.',
    'How much does Rentalium charge?': 'Combien Rentalium facture-t-il ?',
    'Landlords pay a placement fee only when we successfully lease the unit. Browsing and applying to our available listings is free for renters.':
      'Les propriétaires paient des frais de placement seulement lorsque l’unité est louée. Parcourir nos annonces et postuler est gratuit pour les locataires.',
    'Which neighbourhoods do you cover?': 'Quels quartiers couvrez-vous ?',
    'We lease island-wide — including the Plateau, Downtown/Ville-Marie, Griffintown, the Sud-Ouest, Mile End, Rosemont, Verdun, NDG and Old Montréal.':
      'Nous louons sur toute l’île — dont le Plateau, le Centre-ville/Ville-Marie, Griffintown, le Sud-Ouest, le Mile End, Rosemont, Verdun, NDG et le Vieux-Montréal.',
    'How fast can you lease my unit?': 'En combien de temps pouvez-vous louer mon unité ?',
    'Our average time to lease is about 14 days, depending on price, condition and neighbourhood. We’ll give you a realistic timeline up front.':
      'Notre délai moyen de location est d’environ 14 jours, selon le prix, l’état et le quartier. Nous vous donnons un échéancier réaliste dès le départ.',
    'Do you handle Québec leases and credit checks?': 'Gérez-vous les baux québécois et les vérifications de crédit ?',
    'Yes. We prepare the standard Québec lease (bail), run credit and reference checks, and follow TAL (Tribunal administratif du logement) rules.':
      'Oui. Nous préparons le bail québécois standard, effectuons les vérifications de crédit et de références, et suivons les règles du TAL (Tribunal administratif du logement).',
    'Do you work in French and English?': 'Travaillez-vous en français et en anglais ?',
    'Both. Our agents serve landlords and renters bilingually across Montréal.':
      'Les deux. Nos agents servent propriétaires et locataires dans les deux langues, partout à Montréal.',

    // Blog teaser + contact
    'From the blog': 'Du blogue',
    'Montréal renting,': 'La location à Montréal,',
    'explained.': 'expliquée.',
    'Read the blog': 'Lire le blogue',
    'Get in touch': 'Nous joindre',
    'Talk to a Montréal': 'Parlez à un agent de',
    'leasing agent.': 'location de Montréal.',
    'Got a unit to fill or an apartment to find? Tell us what you need — we respond within one business day.':
      'Une unité à louer ou un appartement à trouver ? Dites-nous ce qu’il vous faut — nous répondons en un jour ouvrable.',

    // Units / unit-finder page
    'Available now.': 'Disponible maintenant.',
    'Every listing below is currently available for showings. Filter by bedrooms, price, or neighborhood to narrow your search.':
      'Chaque annonce ci-dessous est disponible pour visite. Filtrez par chambres, prix ou quartier pour affiner votre recherche.',
    'Search by address or neighborhood…': 'Rechercher par adresse ou quartier…',
    'Any bedrooms': 'Toutes les chambres',
    'Studio': 'Studio',
    '1 bedroom': '1 chambre',
    '2 bedrooms': '2 chambres',
    '3+ bedrooms': '3+ chambres',
    'Price: low to high': 'Prix : croissant',
    'Price: high to low': 'Prix : décroissant',
    'Largest first': 'Plus grand d’abord',
    'Reset': 'Réinitialiser',
    'Hide map': 'Masquer la carte',
    'Show map': 'Afficher la carte',
    'Click a pin to jump to that listing.': 'Cliquez sur une épingle pour ouvrir l’annonce.',
    'Showing all units': 'Affichage de toutes les unités',
    'Updated daily': 'Mis à jour quotidiennement',
    'No units match your filters. Try widening your search.': 'Aucune unité ne correspond à vos filtres. Élargissez votre recherche.',
    'Don’t see what you need?': 'Vous ne trouvez pas ?',
    'Tell us what you’re looking for.': 'Dites-nous ce que vous cherchez.',
    'New units come available every week. We’ll match you with ones that fit before they go public.':
      'De nouvelles unités se libèrent chaque semaine. Nous vous proposerons celles qui conviennent avant qu’elles ne soient publiques.',
    'Email an agent': 'Écrire à un agent',

    // Budget gate (test flow)
    'What’s your budget?': 'Quel est votre budget ?',
    'Tell us your monthly budget and we’ll show every available unit that fits, on the map.':
      'Indiquez votre budget mensuel et nous afficherons sur la carte chaque unité disponible qui convient.',
    'Monthly budget': 'Budget mensuel',
    'Bedrooms (optional)': 'Chambres (facultatif)',
    'Show units on the map →': 'Voir les unités sur la carte →',
    'Change budget': 'Changer le budget',

    // Listing page
    '← Back to map': '← Retour à la carte',
    'About this unit': 'À propos de cette unité',
    'Details': 'Détails',
    'Location': 'Emplacement',
    'Similar units nearby': 'Unités similaires à proximité',
    'Book a showing': 'Réserver une visite',
    '💬 Text us · reply under 10 min': '💬 Écrivez-nous · réponse en moins de 10 min',
    'Directions:': 'Itinéraire :',
    'Google Maps': 'Google Maps',
    'Apple Maps': 'Apple Maps',
    '← All available units': '← Toutes les unités disponibles',
    'Listing not found': 'Annonce introuvable',
    'Appliances': 'Électroménagers',
    'Parking': 'Stationnement',
    'Locker': 'Casier',
    'Dogs': 'Chiens',
    'Available': 'Disponible',
    'Yes': 'Oui', 'No': 'Non',
    'Dogs welcome': 'Chiens bienvenus',
    'Contact us': 'Contactez-nous',
    'No dogs': 'Pas de chiens',
    'Listing information is provided for general informational purposes only and may change without notice. Square footage, availability, pricing, and amenities are approximate and not guaranteed; photos may not reflect the exact unit. Submitting a showing request does not create a lease, reservation, or obligation. Rentalium is an equal-opportunity housing agency.':
      'Les informations sur les annonces sont fournies à titre informatif seulement et peuvent changer sans préavis. La superficie, la disponibilité, le prix et les commodités sont approximatifs et non garantis; les photos peuvent ne pas refléter l’unité exacte. Soumettre une demande de visite ne crée aucun bail, réservation ou obligation. Rentalium est une agence de logement à chances égales.',

    // Booking modal
    'Send request': 'Envoyer la demande',
    'Cancel': 'Annuler',
    'Your name *': 'Votre nom *',
    'Email *': 'Courriel *',
    'Phone': 'Téléphone',
    'Preferred date': 'Date préférée',
    'Preferred time': 'Heure préférée',
    'Message': 'Message',
    'Anything we should know?': 'Quelque chose à savoir ?',

    // Blog
    'Montréal renting & leasing insights.': 'Conseils sur la location à Montréal.',
    'Guides and updates from Rentalium’s Montréal leasing team — for landlords and renters alike.':
      'Guides et nouvelles de l’équipe de location montréalaise de Rentalium — pour propriétaires et locataires.',
    'Read more': 'Lire la suite',
    'No posts yet — check back soon.': 'Aucun article pour l’instant — revenez bientôt.',

    // Dynamic (set by units.js / featured) — used via window.PUBLIC_LANG
    'Contact for price': 'Prix sur demande',
  };

  // Whole-element HTML overrides for elements with inline markup whose word
  // order differs in French. Keyed by a stable CSS selector.
  var HTML = {
    '.hero h1': 'L’agence de location montréalaise pour des logements qui partent <span class="accent">vite</span>.',
    '.hero-lede': 'Rentalium est une agence boutique <strong>de location à Montréal</strong>. Nous plaçons les locataires dans des appartements vérifiés et louons vite les unités des propriétaires — du Plateau au centre-ville, à Griffintown, au Sud-Ouest et au-delà.',
  };

  function getLang() {
    try {
      var s = localStorage.getItem(KEY);
      if (s === 'fr' || s === 'en') return s;
    } catch (e) {}
    return 'fr'; // French by default (Québec)
  }
  function setLang(l) { try { localStorage.setItem(KEY, l); } catch (e) {} location.reload(); }

  // Regex transforms for dynamic unit data (server-rendered numbers) that
  // can't be dictionary keys. Applied to a text node only when it had no
  // exact dictionary match.
  function frNumbers(s) {
    return s
      .replace(/\$\s*([\d,]+)\s*\/\s*mo\b/g, function (m, n) { return n.replace(/,/g, ' ') + ' $ / mois'; })
      .replace(/\b(\d+)\s*beds?\b/g, function (m, n) { return n + ' chambre' + (Number(n) > 1 ? 's' : ''); })
      .replace(/\b(\d+)\s*baths?\b/g, function (m, n) { return n + ' sdb'; })
      .replace(/\b([\d,]+)\s*sqft\b/g, function (m, n) { return n.replace(/,/g, ' ') + ' pi²'; })
      .replace(/\bAvailable\b/g, 'Disponible')
      .replace(/\bStudio\b/g, 'Studio');
  }

  // Normalize for matching: curly→straight quotes, collapse whitespace, trim.
  // Lets dictionary keys match regardless of apostrophe style or HTML indents.
  function norm(s) {
    return s.replace(/[’‘]/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  var FRN = {};
  for (var key in FR) FRN[norm(key)] = FR[key];

  function lookup(raw) {
    var k = raw.trim();
    if (FR[k]) return raw.replace(k, FR[k]);          // exact, preserves spacing
    var v = FRN[norm(raw)];
    if (v) return raw.match(/^\s*/)[0] + v + raw.match(/\s*$/)[0]; // preserve outer spacing
    return null;
  }

  function translate(root) {
    // Whole-element overrides first (only on pages where they exist).
    for (var sel in HTML) {
      var el = root.querySelector ? root.querySelector(sel) : null;
      if (el) el.innerHTML = HTML[sel];
    }
    // Text nodes.
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = w.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim()) return;
      var out = lookup(node.nodeValue);
      if (out != null) { node.nodeValue = out; return; }
      var t = frNumbers(node.nodeValue);
      if (t !== node.nodeValue) node.nodeValue = t;
    });
    // Common attributes.
    ['placeholder', 'aria-label', 'title', 'alt'].forEach(function (attr) {
      var els = root.querySelectorAll ? root.querySelectorAll('[' + attr + ']') : [];
      Array.prototype.forEach.call(els, function (el) {
        var v = el.getAttribute(attr); if (!v) return;
        var out = lookup(v); if (out != null) el.setAttribute(attr, out);
      });
    });
  }

  window.PUBLIC_LANG = getLang();
  // Lets dynamically-rendered content (units.js cards/popups) be re-translated.
  window.translatePublic = function (root) {
    if (window.PUBLIC_LANG === 'fr') translate(root || document.body);
  };

  function wireToggle() {
    var btns = document.querySelectorAll('.lang-toggle');
    Array.prototype.forEach.call(btns, function (b) {
      b.textContent = window.PUBLIC_LANG === 'fr' ? 'EN' : 'FR';
      b.addEventListener('click', function () { setLang(window.PUBLIC_LANG === 'fr' ? 'en' : 'fr'); });
    });
  }

  function run() {
    if (window.PUBLIC_LANG === 'fr') {
      translate(document.body);
      var t = FR[document.title.trim()];
      if (t) document.title = t;
      document.documentElement.setAttribute('lang', 'fr');
    }
    wireToggle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
