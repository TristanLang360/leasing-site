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
    'List your unit': 'Inscrire mon unité',
    'Blog': 'Blogue',
    'Contact': 'Contact',
    'Browse rentals': 'Voir les locations',
    'Contact agent': 'Contacter un agent',
    'Join our team': 'Rejoindre notre équipe',
    'Staff': 'Personnel',

    // CTA buttons (include the → arrow since it's part of the text node)
    'Browse available apartments →': 'Voir les appartements disponibles →',
    'List your unit →': 'Inscrire mon unité →',
    'See available units →': 'Voir les unités disponibles →',
    'View all units →': 'Voir toutes les unités →',
    'Read more →': 'Lire la suite →',
    'Back to homepage': 'Retour à l’accueil',

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
    '$ / month': '$ / mois',
    'Bedrooms (optional)': 'Chambres (facultatif)',
    'Show units on the map →': 'Voir les unités sur la carte →',
    'Change budget': 'Changer le budget',

    // Units page hero
    'Apartments for rent in Montréal.': 'Appartements à louer à Montréal.',
    'Every listing below is a vetted, currently-available apartment for rent across Montréal — from the Plateau to Griffintown. Filter by bedrooms, price, or neighbourhood, then book a showing.':
      'Chaque annonce ci-dessous est un appartement vérifié, actuellement disponible à louer partout à Montréal — du Plateau à Griffintown. Filtrez par chambres, prix ou quartier, puis réservez une visite.',

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
    'Post not found': 'Article introuvable',
    '← Back to the blog': '← Retour au blogue',
    '← All posts': '← Tous les articles',

    // Careers section (index.html)
    'Careers': 'Carrières',
    'Join Rentalium as': 'Rejoignez Rentalium en tant que',
    'a lease agent.': 'agent de location.',
    'We\'re growing. If you know Montréal, love working with people, and want to earn on every placement — we want to hear from you.':
      'Nous grandissons. Si vous connaissez Montréal, aimez travailler avec les gens et souhaitez être rémunéré à chaque placement — nous voulons vous entendre.',
    'Apply now →': 'Postuler maintenant →',
    'Learn more': 'En savoir plus',

    // Agent application page
    'Join the team · Montréal': 'Rejoindre l’équipe · Montréal',
    'Become a Rentalium lease agent.': 'Devenez agent de location Rentalium.',
    'Why Rentalium': 'Pourquoi Rentalium',
    'What you get as': 'Ce que vous obtenez en tant que',
    'a Rentalium agent.': 'agent Rentalium.',
    'We give our agents real listings, real clients, and a system that handles the admin — so you can focus on showing units and closing leases.':
      'Nous offrons à nos agents de vraies annonces, de vrais clients et un système qui gère l’administration — pour que vous puissiez vous concentrer sur les visites et les baux.',
    'Commission-based earnings': 'Rémunération à la commission',
    'Earn a competitive commission on every unit you place. More placements, more income — no ceiling.':
      'Gagnez une commission compétitive pour chaque unité placée. Plus de placements, plus de revenus — sans plafond.',
    'Island-wide portfolio': 'Portefeuille sur toute l’île',
    'Access to listings across Plateau, Downtown, Griffintown, Verdun, Mile End and beyond.':
      'Accès aux annonces du Plateau, du Centre-ville, de Griffintown, de Verdun, du Mile End et au-delà.',
    'Flexible schedule': 'Horaire flexible',
    'Work when it suits you. Book your own showings and manage your pipeline from anywhere.':
      'Travaillez quand cela vous convient. Réservez vos propres visites et gérez votre pipeline de partout.',
    'Full training & support': 'Formation et soutien complets',
    'Québec lease (bail) training, client scripts, and an admin platform built for agents.':
      'Formation sur le bail québécois, scripts clients et une plateforme d’administration conçue pour les agents.',
    'What we look for': 'Ce que nous recherchons',
    'The right fit for': 'Le bon profil pour',
    'Rentalium.': 'Rentalium.',
    'Bilingual English & French (spoken)': 'Bilingue anglais et français (oral)',
    'Knowledge of Montréal neighbourhoods': 'Connaissance des quartiers de Montréal',
    'Strong communication and follow-through': 'Excellentes aptitudes en communication et suivi',
    'Comfortable with digital tools and apps': 'À l’aise avec les outils numériques',
    'Available for weekend showings': 'Disponible pour les visites de fin de semaine',
    'Reliable transportation or transit access': 'Accès fiable à un transport ou aux transports en commun',
    'Applications are reviewed within 3–5 business days. We\'ll reach out by email to schedule a short call if you\'re a fit.':
      'Les candidatures sont examinées en 3 à 5 jours ouvrables. Nous vous contacterons par courriel pour planifier un bref appel si votre profil correspond.',
    'Apply to join': 'Postuler pour rejoindre',
    'Takes about 3 minutes. We review every application personally.': 'Environ 3 minutes. Nous examinons chaque candidature personnellement.',
    'Full name': 'Nom complet',
    'Phone number': 'Numéro de téléphone',
    'Email address': 'Adresse courriel',
    'Why do you want to join Rentalium?': 'Pourquoi voulez-vous rejoindre Rentalium ?',
    'Confirm password': 'Confirmer le mot de passe',
    'Repeat password': 'Répétez le mot de passe',
    'Min. 8 characters': 'Min. 8 caractères',
    'Submit application →': 'Soumettre la candidature →',
    // Agent application (agent-apply)
    'Show apartments, sign tenants and earn on every lease, on your own schedule. Apply in two minutes.': 'Faites visiter des appartements, signez des locataires et touchez une commission sur chaque bail, selon votre horaire. Postulez en deux minutes.',
    'Commission on every lease': 'Commission sur chaque bail',
    'Training provided': 'Formation fournie',
    'No licence needed': 'Aucun permis requis',
    'About you': 'À propos de vous',
    'Your email becomes your agent login if we work together.': 'Votre courriel deviendra votre identifiant d’agent si nous travaillons ensemble.',
    'Please enter your full name.': 'Veuillez entrer votre nom complet.',
    'Please enter a valid email address.': 'Veuillez entrer une adresse courriel valide.',
    'A bit more': 'Un peu plus',
    'All optional, but it helps us get back to you faster.': 'Tout est facultatif, mais cela nous aide à vous répondre plus vite.',
    'Languages you speak': 'Langues parlées',
    'Other': 'Autre',
    'When are you available?': 'Quand êtes-vous disponible ?',
    'Weekdays': 'En semaine',
    'Evenings': 'Le soir',
    'Weekends': 'La fin de semaine',
    'Why Rentalium?': 'Pourquoi Rentalium ?',
    'Your experience in sales, real estate or customer service, the neighbourhoods you know…': 'Votre expérience en vente, en immobilier ou en service à la clientèle, les quartiers que vous connaissez…',
    'CV / résumé': 'CV',
    'We review every application personally and reply within 3–5 business days.': 'Nous examinons chaque candidature personnellement et répondons en 3 à 5 jours ouvrables.',
    // Owner listing form (landlord-intake)
    'List Your Unit — Rentalium': 'Inscrire mon unité — Rentalium',
    "Two minutes, no commitment. We'll call you back within one business day to go over the details.":
      'Deux minutes, sans engagement. Nous vous rappelons en un jour ouvrable pour passer les détails en revue.',
    'Free to list': 'Inscription gratuite',
    "You pay only once it's leased": 'Vous payez seulement une fois louée',
    'Screening & Québec lease handled': 'Sélection et bail québécois pris en charge',
    'Your unit': 'Votre unité',
    'Only the address is required.': 'Seule l’adresse est obligatoire.',
    'Unit address': 'Adresse de l’unité',
    'e.g. 4521 Rue Saint-Denis, apt. 3': 'ex. 4521 rue Saint-Denis, app. 3',
    "Please enter the unit's address.": 'Veuillez entrer l’adresse de l’unité.',
    'Type': 'Type',
    '(optional)': '(facultatif)',
    'Apartment': 'Appartement',
    'Condo': 'Condo',
    'House / plex': 'Maison / plex',
    'Room': 'Chambre',
    'Commercial': 'Commercial',
    'Bedrooms': 'Chambres',
    'Monthly rent': 'Loyer mensuel',
    'Now': 'Maintenant',
    'Pick a date': 'Choisir une date',
    'Available from': 'Disponible à partir du',
    'Included or allowed': 'Inclus ou permis',
    '(optional — tap all that apply)': '(facultatif — touchez tout ce qui s’applique)',
    'Storage / locker': 'Rangement / casier',
    'Heating included': 'Chauffage inclus',
    'Pets allowed': 'Animaux permis',
    'Furnished': 'Meublé',
    'Anything else?': 'Autre chose ?',
    "Renovations, view, current tenant's move-out date, best times to visit…":
      'Rénovations, vue, date de départ du locataire actuel, meilleurs moments pour visiter…',
    'How can we reach you?': 'Comment vous joindre ?',
    'Your name, and an email or a phone number.': 'Votre nom, et un courriel ou un numéro de téléphone.',
    'Your name': 'Votre nom',
    'Please enter your name.': 'Veuillez entrer votre nom.',
    'Please check the email address.': 'Veuillez vérifier l’adresse courriel.',
    'Add an email or a phone number so we can reach you.': 'Ajoutez un courriel ou un numéro de téléphone pour qu’on puisse vous joindre.',
    'Send my unit →': 'Envoyer mon unité →',
    'No commitment. We only use your details to contact you about this unit.':
      'Sans engagement. Vos coordonnées servent uniquement à vous contacter au sujet de cette unité.',
    "Thank you, we've got it.": 'Merci, c’est bien reçu.',
    'A Rentalium agent will contact you within one business day to confirm the details and next steps.':
      'Un agent Rentalium vous contactera en un jour ouvrable pour confirmer les détails et les prochaines étapes.',
    'Rentalium · Leasing agency in Montréal, QC ·': 'Rentalium · Agence de location à Montréal, QC ·',
    // Editorial homepage
    'From listing': 'De l’annonce',
    'Our portfolio': 'Notre portfolio',
    'See all': 'Voir tout',
    'Portfolio': 'Portfolio',
    'To move-in': 'À l’emménagement',
    'Find your next apartment': 'Trouver votre prochain appartement',
    'Email': 'Courriel',
    'Montréal skyline at dusk': 'Horizon de Montréal au crépuscule',
    'Boutique leasing agency in Montréal — vetted apartments for renters, fast tenant placement for landlords.':
      'Agence de location boutique à Montréal — des appartements vérifiés pour les locataires, un placement rapide pour les propriétaires.',
    "You don't need a real-estate licence to apply — but you do need to be bilingual, client-focused, and genuinely excited about Montréal's rental market.": "Aucun permis de courtier n'est requis pour postuler — mais vous devez être bilingue, axé sur le client et sincèrement enthousiaste face au marché locatif montréalais.",
    "Tell us a bit about yourself, your experience with real estate or sales, and why Montréal's rental market interests you…": "Parlez-nous un peu de vous, de votre expérience en immobilier ou en vente, et de ce qui vous attire dans le marché locatif montréalais…",
    'Choose a file': 'Choisir un fichier',
    'or drag and drop here': 'ou glissez-déposez ici',
    'PDF, DOC or DOCX · max 10 MB': 'PDF, DOC ou DOCX · 10 Mo max',
    "Thanks for applying to Rentalium. We review every application personally and will reach out within 3–5 business days if you're a strong fit.":
      'Merci d’avoir postulé chez Rentalium. Nous examinons chaque candidature personnellement et vous contacterons d’ici 3 à 5 jours ouvrables si votre profil correspond.',
    'PDF, Word, Pages, OpenDocument or a photo · max 10 MB': 'PDF, Word, Pages, OpenDocument ou une photo · 10 Mo max',
    'Submitting…': 'Envoi en cours…',
    'Application received!': 'Candidature reçue !',
    'Back to homepage': 'Retour à l’accueil',

    // Dynamic (set by units.js / featured) — used via window.PUBLIC_LANG
    'Contact for price': 'Prix sur demande',

    // Listing / 404 / carousel / booking extras
    '← Back to all units': '← Retour à toutes les unités',
    'No photos yet — contact us for more details.': 'Pas encore de photos — contactez-nous pour en savoir plus.',
    'Request a showing for': 'Demander une visite pour',
    '— we’ll confirm by email.': '— nous confirmerons par courriel.',
    'Previous': 'Précédent',
    'Next': 'Suivant',
    'Close': 'Fermer',
    'Done': 'Terminé',
    'Get directions in Google Maps': 'Itinéraire dans Google Maps',
    'Get directions in Apple Maps': 'Itinéraire dans Apple Maps',
    'Language': 'Langue',
    'Minimum price': 'Prix minimum',
    'Maximum price': 'Prix maximum',
    'Min $': 'Min $',
    'Max $': 'Max $',
  };

  // Whole-element HTML overrides for elements with inline markup whose word
  // order differs in French. Keyed by a stable CSS selector.
  var HTML = {
    '.hero h1, .home-intro h1': 'L’agence de location montréalaise pour des logements qui partent <span class="accent">vite</span>.',
    '.hero-lede, .home-intro .lede': 'Rentalium est une agence boutique <strong>de location à Montréal</strong>. Nous plaçons les locataires dans des appartements vérifiés et louons vite les unités des propriétaires — du Plateau au centre-ville, à Griffintown, au Sud-Ouest et au-delà.',
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
  var MONTHS = {
    January: 'janvier', February: 'février', March: 'mars', April: 'avril',
    May: 'mai', June: 'juin', July: 'juillet', August: 'août',
    September: 'septembre', October: 'octobre', November: 'novembre', December: 'décembre'
  };
  function frNumbers(s) {
    return s
      .replace(/\$\s*([\d,]+)\s*\/\s*mo\b/g, function (m, n) { return n.replace(/,/g, ' ') + ' $ / mois'; })
      .replace(/\b(\d+)\s*beds?\b/g, function (m, n) { return n + ' chambre' + (Number(n) > 1 ? 's' : ''); })
      .replace(/\b(\d+)\s*baths?\b/g, function (m, n) { return n + ' sdb'; })
      .replace(/\b([\d,]+)\s*sqft\b/g, function (m, n) { return n.replace(/,/g, ' ') + ' pi²'; })
      // "January 5, 2026" → "5 janvier 2026" (French date order) before the lone-month pass
      .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/g, function (m, mo, d, y) { return d + ' ' + MONTHS[mo] + ' ' + y; })
      .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g, function (m) { return MONTHS[m]; })
      .replace(/\bAvailable\b/g, 'Disponible')
      .replace(/\bNow\b/g, 'maintenant')
      .replace(/\bYes\b/g, 'Oui')
      .replace(/\bNo\b/g, 'Non');
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
  document.documentElement.setAttribute('lang', window.PUBLIC_LANG === 'fr' ? 'fr-CA' : 'en-CA');
  // French is the primary language: the pages are authored in English and
  // translated here, so hide the page until that's done to avoid a flash of
  // English. The timeout guarantees the page is never left hidden.
  if (window.PUBLIC_LANG === 'fr') {
    document.documentElement.classList.add('i18n-pending');
    var hide = document.createElement('style');
    hide.textContent = 'html.i18n-pending body{visibility:hidden}';
    document.head.appendChild(hide);
    setTimeout(function () { document.documentElement.classList.remove('i18n-pending'); }, 1500);
  }
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
      document.documentElement.setAttribute('lang', 'fr-CA');
    }
    wireToggle();
    document.documentElement.classList.remove('i18n-pending');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();

  // Fix bfcache: if the browser restores a cached page (back/forward), re-check
  // localStorage and reload if the language has changed since the page was cached.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && getLang() !== window.PUBLIC_LANG) location.reload();
  });
})();
