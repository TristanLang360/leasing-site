// Public listings page — fetches live data from /api/units.
// Manage units & photos at /admin.

const FR = (typeof window !== 'undefined' && window.PUBLIC_LANG === 'fr');
const fmtPrice = (n) => Number(n) > 0
  ? (FR ? Number(n).toLocaleString('fr-CA') + ' $ / mois' : '$' + Number(n).toLocaleString('en-US') + ' / mo')
  : (FR ? 'Prix sur demande' : 'Contact for price');
const fmtBeds = (n) => n === 0 ? 'Studio' : (FR ? `${n} chambre${n > 1 ? 's' : ''}` : `${n} bed${n > 1 ? 's' : ''}`);
const fmtBath = (n) => FR ? `${n} sdb` : `${n} bath${n > 1 ? 's' : ''}`;
const fmtAvail = (iso) => {
  const now = FR ? 'Maintenant' : 'Now';
  if (!iso) return now;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return now;
  return d.toLocaleDateString(FR ? 'fr-CA' : 'en-US', { month: 'short', day: 'numeric' });
};
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// SEO-friendly listing URL: /units/:id/:slug
const slugify = (s) => String(s ?? '').toLowerCase().normalize('NFKD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const unitHref = (u) => `/units/${u.id}/${slugify(u.title) || 'listing'}`;

let UNITS = [];

async function loadUnits() {
  try {
    const r = await fetch('/api/units');
    if (!r.ok) throw new Error(`${r.status}`);
    UNITS = await r.json();
  } catch (e) {
    UNITS = [];
    document.getElementById('no-results').textContent =
      FR ? 'Impossible de charger les unités.' : 'Could not load units. Is the server running?';
    document.getElementById('no-results').style.display = 'block';
  }
  applyFilters();
  // TEST FLOW: if the budget gate is already showing the map, repopulate now
  // that units have loaded.
  if (document.body.classList.contains('fs-active')) renderFsMap(gateBudget, gateBeds);
}

// ── TEST FLOW (revertable): budget gate → full-screen map ──────────
let fsMap = null, fsLayer = null, gateBudget = null, gateBeds = '';

function showGate() {
  document.body.classList.add('gate-active');
  document.body.classList.remove('fs-active');
}

// Map styling: monochrome tiles (CSS) + price-tag markers that collapse to
// dots when zoomed out, so hundreds of units stay readable.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const shortPrice = (n) => Number(n) > 0
  ? (FR ? Number(n).toLocaleString('fr-CA') + ' $' : '$' + Number(n).toLocaleString('en-US'))
  : '•';
function priceIcon(u) {
  return L.divIcon({
    className: 'price-pin-wrap',
    html: `<span class="price-pin">${escapeHtml(shortPrice(u.price))}</span>`,
    iconSize: null,
    iconAnchor: [0, 0],
    popupAnchor: [0, -14],
  });
}
function trackZoom(m) {
  const set = () => m.getContainer().classList.toggle('map-zoomed-out', m.getZoom() < 13);
  m.on('zoomend', set);
  set();
}

function showFsMap(budget, beds) {
  gateBudget = budget;
  gateBeds = beds || '';
  document.body.classList.remove('gate-active');
  document.body.classList.add('fs-active');
  if (!fsMap && typeof L !== 'undefined') {
    fsMap = L.map('fs-map', { scrollWheelZoom: true }).setView([45.5019, -73.5674], 11);
    L.tileLayer(TILE_URL, {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(fsMap);
    trackZoom(fsMap);
    fsLayer = L.layerGroup().addTo(fsMap);
  }
  setTimeout(() => { if (fsMap) fsMap.invalidateSize(); }, 60);
  renderFsMap(budget, beds);
}

function renderFsMap(budget, beds) {
  if (!fsMap || !fsLayer) return;
  beds = beds === undefined ? gateBeds : beds;
  fsLayer.clearLayers();
  const within = UNITS.filter((u) => {
    if (u.lat == null || u.lng == null || !(Number(u.price) > 0)) return false;
    if (budget && Number(u.price) > budget) return false;
    if (beds !== '') {
      const n = parseInt(beds, 10);
      if (n === 3) { if ((u.beds || 0) < 3) return false; }
      else if ((u.beds || 0) !== n) return false;
    }
    return true;
  });
  const pts = [];
  within.forEach((u) => {
    const m = L.marker([u.lat, u.lng], { icon: priceIcon(u), riseOnHover: true });
    m.bindPopup(
      `<strong>${escapeHtml(u.address)}</strong><br>${fmtBeds(u.beds)} · ${fmtPrice(u.price)}<br>` +
      `<a href="${unitHref(u)}" class="map-popup-link">${FR ? 'Voir l’annonce →' : 'View listing →'}</a>`
    );
    m.addTo(fsLayer);
    pts.push([u.lat, u.lng]);
  });
  const count = document.getElementById('fs-count');
  const nU = within.length, plural = nU === 1 ? '' : 's';
  if (count) count.textContent = budget
    ? (FR ? `${nU} unité${plural} jusqu’à ${Number(budget).toLocaleString('fr-CA')} $/mois`
          : `${nU} unit${plural} up to $${Number(budget).toLocaleString('en-US')}/mo`)
    : (FR ? `${nU} unité${plural} disponible${plural}` : `${nU} available unit${plural}`);
  // Keep the view comfortably zoomed out so the whole set is visible.
  if (pts.length > 1) fsMap.fitBounds(pts, { padding: [60, 60], maxZoom: 13 });
  else if (pts.length === 1) fsMap.setView(pts[0], 13);
  else fsMap.setView([45.5019, -73.5674], 11);
}

const fmtCost = (n) => n
  ? (FR ? `${Number(n).toLocaleString('fr-CA')} $/mois` : `$${Number(n).toLocaleString('en-US')}/mo`)
  : (FR ? 'inclus' : 'included');
const dogsLabel = (p) => p === 'yes'
  ? (FR ? '🐾 Chiens bienvenus' : '🐾 Dogs welcome')
  : p === 'contact'
    ? (FR ? '🐾 Contactez-nous au sujet de votre chien' : '🐾 Contact us about your dog')
    : '';

function unitCardHTML(u, idx) {
  const variant = ((idx % 6) + 1);
  const cover = u.photos && u.photos[0];
  const photo = cover
    ? (cover.kind === 'video'
        ? `<div class="unit-photo has-image"><video class="unit-photo-vid" src="${cover.url}" muted playsinline preload="metadata"></video>`
        : `<div class="unit-photo has-image" style="background-image:url('${cover.url}')">`)
    : `<div class="unit-photo v${variant}">`;

  const amenities = [];
  if (u.appliances) amenities.push(`⚡︎ ${escapeHtml(u.appliances)}`);
  if (u.parking_available === 'yes') amenities.push(`🅿︎ ${FR ? 'Stationnement' : 'Parking'} · ${fmtCost(u.parking_cost)}`);
  if (u.locker_available === 'yes') amenities.push(`🔒 ${FR ? 'Casier' : 'Locker'} · ${fmtCost(u.locker_cost)}`);
  const dogs = dogsLabel(u.dogs_policy);
  if (dogs) amenities.push(dogs);
  const amenitiesHTML = amenities.length
    ? `<div class="unit-amenities">${amenities.map((a) => `<span>${a}</span>`).join('')}</div>`
    : '';

  return `
    <a class="unit-card-link" href="${unitHref(u)}">
    <article class="unit-card" id="unit-card-${u.id}">
      ${photo}
        <span class="unit-tag">${FR ? 'Dispo' : 'Avail'} ${fmtAvail(u.available_date)}</span>
        <span class="unit-price">${fmtPrice(u.price)}</span>
      </div>
      <div class="unit-body">
        <h3>${escapeHtml(u.address)}</h3>
        ${u.neighborhood ? `<div class="unit-addr">${escapeHtml(u.neighborhood)}</div>` : ''}
        <div class="unit-meta">
          <span>${fmtBeds(u.beds)}</span>
          <span>${fmtBath(u.baths)}</span>
          ${u.sqft ? `<span>${u.sqft.toLocaleString()} ${FR ? 'pi²' : 'sqft'}</span>` : ''}
        </div>
        ${amenitiesHTML}
      </div>
    </article>
    </a>
  `;
}

function renderUnits(list) {
  const grid = document.getElementById('units-grid');
  const empty = document.getElementById('no-results');
  const meta = document.getElementById('result-count');

  if (list.length === 0) {
    grid.innerHTML = '';
    if (empty.textContent.trim() === '' || empty.textContent.includes('No units match') || empty.textContent.includes('correspond')) {
      empty.textContent = FR ? 'Aucune unité ne correspond à vos filtres. Élargissez votre recherche.'
                             : 'No units match your filters. Try widening your search.';
    }
    empty.style.display = 'block';
    meta.textContent = FR ? '0 unité' : '0 units';
    return;
  }
  empty.style.display = 'none';
  meta.textContent = FR ? `${list.length} unité${list.length > 1 ? 's' : ''} affichée${list.length > 1 ? 's' : ''}`
                        : `Showing ${list.length} unit${list.length > 1 ? 's' : ''}`;
  grid.innerHTML = list.map(unitCardHTML).join('');
  renderMap(list);
}

// ── Map (Leaflet + OpenStreetMap, no API key) ──────────────────
let map = null;
let markerLayer = null;

function initMap() {
  const el = document.getElementById('units-map');
  if (!el || typeof L === 'undefined') return;
  map = L.map(el, { scrollWheelZoom: false }).setView([45.5019, -73.5674], 12); // Montréal
  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  trackZoom(map);
  markerLayer = L.layerGroup().addTo(map);

  const toggle = document.getElementById('toggle-map');
  if (toggle) toggle.addEventListener('click', () => {
    const wrap = document.getElementById('units-map');
    const hint = document.getElementById('map-hint');
    const hidden = wrap.classList.toggle('hidden');
    toggle.textContent = hidden ? (FR ? 'Afficher la carte' : 'Show map') : (FR ? 'Masquer la carte' : 'Hide map');
    toggle.setAttribute('aria-expanded', String(!hidden));
    if (hint) hint.style.visibility = hidden ? 'hidden' : 'visible';
    if (!hidden) setTimeout(() => map.invalidateSize(), 50);
  });
}

function renderMap(list) {
  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  const pts = [];
  list.forEach((u) => {
    if (u.lat == null || u.lng == null) return;
    const m = L.marker([u.lat, u.lng], { icon: priceIcon(u), riseOnHover: true });
    m.bindPopup(
      `<strong>${escapeHtml(u.title)}</strong><br>${escapeHtml(u.address)}<br>` +
      `${fmtBeds(u.beds)} · ${fmtPrice(u.price)}<br>` +
      `<a href="${unitHref(u)}" class="map-popup-link">${FR ? 'Voir l’annonce →' : 'View listing →'}</a>`
    );
    m.addTo(markerLayer);
    pts.push([u.lat, u.lng]);
  });
  const toolbar = document.querySelector('.map-toolbar');
  if (toolbar) toolbar.style.display = pts.length ? '' : 'none';
  document.getElementById('units-map').style.display = pts.length ? '' : 'none';
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
}

function applyFilters() {
  const q = document.getElementById('f-search').value.trim().toLowerCase();
  const beds = document.getElementById('f-beds').value;
  const minPrice = parseInt(document.getElementById('f-price-min').value, 10);
  const maxPrice = parseInt(document.getElementById('f-price-max').value, 10);
  const sort = document.getElementById('f-sort').value;
  const hasPriceFilter = Number.isFinite(minPrice) || Number.isFinite(maxPrice);

  let list = UNITS.filter((u) => {
    if (q) {
      const hay = `${u.address || ''} ${u.neighborhood || ''} ${u.title || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (beds !== '') {
      const n = parseInt(beds, 10);
      if (n === 3) { if ((u.beds || 0) < 3) return false; }
      else if ((u.beds || 0) !== n) return false;
    }
    if (hasPriceFilter) {
      const p = Number(u.price);
      if (!p) return false; // "Contact for price" units can't match a range
      if (Number.isFinite(minPrice) && p < minPrice) return false;
      if (Number.isFinite(maxPrice) && p > maxPrice) return false;
    }
    return true;
  });

  // Units with no price (0) sort to the end either way, so the grid leads with real listings.
  if (sort === 'price-asc')  list.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
  if (sort === 'price-desc') list.sort((a, b) => (b.price || 0) - (a.price || 0));
  if (sort === 'size-desc')  list.sort((a, b) => (b.sqft || 0) - (a.sqft || 0));

  renderUnits(list);
}

document.addEventListener('DOMContentLoaded', () => {
  // TEST FLOW: gate visitors behind a budget form, then show a full-screen map.
  const budgetForm = document.getElementById('budget-form');
  if (budgetForm) {
    showGate();
    budgetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseInt(document.getElementById('budget-input').value, 10);
      const beds = document.getElementById('budget-beds').value;
      showFsMap(Number.isFinite(v) && v > 0 ? v : null, beds);
    });
    const change = document.getElementById('fs-change');
    if (change) change.addEventListener('click', showGate);
  }

  initMap();
  ['f-search', 'f-beds', 'f-price-min', 'f-price-max', 'f-sort'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', applyFilters);
    el.addEventListener('change', applyFilters);
  });
  const reset = document.getElementById('f-reset');
  if (reset) reset.addEventListener('click', () => {
    document.getElementById('f-search').value = '';
    document.getElementById('f-beds').value = '';
    document.getElementById('f-price-min').value = '';
    document.getElementById('f-price-max').value = '';
    document.getElementById('f-sort').value = 'price-asc';
    applyFilters();
  });
  loadUnits();
});
