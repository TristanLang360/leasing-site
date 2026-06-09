// Public listings page — fetches live data from /api/units.
// Manage units & photos at /admin.

const fmtPrice = (n) => (Number(n) > 0 ? '$' + Number(n).toLocaleString('en-US') + ' / mo' : 'Contact for price');
const fmtBeds = (n) => n === 0 ? 'Studio' : `${n} bed${n > 1 ? 's' : ''}`;
const fmtAvail = (iso) => {
  if (!iso) return 'Now';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return 'Now';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
      'Could not load units. Is the server running?';
    document.getElementById('no-results').style.display = 'block';
  }
  applyFilters();
  // TEST FLOW: if the budget gate is already showing the map, repopulate now
  // that units have loaded.
  if (document.body.classList.contains('fs-active')) renderFsMap(gateBudget);
}

// ── TEST FLOW (revertable): budget gate → full-screen map ──────────
let fsMap = null, fsLayer = null, gateBudget = null;

function showGate() {
  document.body.classList.add('gate-active');
  document.body.classList.remove('fs-active');
}

function showFsMap(budget) {
  gateBudget = budget;
  document.body.classList.remove('gate-active');
  document.body.classList.add('fs-active');
  if (!fsMap && typeof L !== 'undefined') {
    fsMap = L.map('fs-map', { scrollWheelZoom: true }).setView([45.5019, -73.5674], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(fsMap);
    fsLayer = L.layerGroup().addTo(fsMap);
  }
  setTimeout(() => { if (fsMap) fsMap.invalidateSize(); }, 60);
  renderFsMap(budget);
}

function renderFsMap(budget) {
  if (!fsMap || !fsLayer) return;
  fsLayer.clearLayers();
  const within = UNITS.filter((u) =>
    u.lat != null && u.lng != null && Number(u.price) > 0 && (!budget || Number(u.price) <= budget));
  const pts = [];
  within.forEach((u) => {
    const m = L.marker([u.lat, u.lng]);
    m.bindPopup(
      `<strong>${escapeHtml(u.address)}</strong><br>${fmtBeds(u.beds)} · ${fmtPrice(u.price)}<br>` +
      `<a href="${unitHref(u)}" class="map-popup-link">View listing →</a>`
    );
    m.addTo(fsLayer);
    pts.push([u.lat, u.lng]);
  });
  const count = document.getElementById('fs-count');
  if (count) count.textContent = budget
    ? `${within.length} unit${within.length === 1 ? '' : 's'} up to $${Number(budget).toLocaleString('en-US')}/mo`
    : `${within.length} available unit${within.length === 1 ? '' : 's'}`;
  if (pts.length) fsMap.fitBounds(pts, { padding: [60, 60], maxZoom: 15 });
  else fsMap.setView([45.5019, -73.5674], 11);
}

const fmtCost = (n) => (n ? `$${Number(n).toLocaleString('en-US')}/mo` : 'included');
const dogsLabel = (p) => p === 'yes'
  ? '🐾 Dogs welcome'
  : p === 'contact'
    ? '🐾 Contact us about your dog'
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
  if (u.parking_available === 'yes') amenities.push(`🅿︎ Parking · ${fmtCost(u.parking_cost)}`);
  if (u.locker_available === 'yes') amenities.push(`🔒 Locker · ${fmtCost(u.locker_cost)}`);
  const dogs = dogsLabel(u.dogs_policy);
  if (dogs) amenities.push(dogs);
  const amenitiesHTML = amenities.length
    ? `<div class="unit-amenities">${amenities.map((a) => `<span>${a}</span>`).join('')}</div>`
    : '';

  return `
    <a class="unit-card-link" href="${unitHref(u)}">
    <article class="unit-card" id="unit-card-${u.id}">
      ${photo}
        <span class="unit-tag">Avail ${fmtAvail(u.available_date)}</span>
        <span class="unit-price">${fmtPrice(u.price)}</span>
      </div>
      <div class="unit-body">
        <h3>${escapeHtml(u.address)}</h3>
        ${u.neighborhood ? `<div class="unit-addr">${escapeHtml(u.neighborhood)}</div>` : ''}
        <div class="unit-meta">
          <span>${fmtBeds(u.beds)}</span>
          <span>${u.baths} bath${u.baths > 1 ? 's' : ''}</span>
          ${u.sqft ? `<span>${u.sqft.toLocaleString()} sqft</span>` : ''}
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
    if (empty.textContent.trim() === '' || empty.textContent.includes('No units match')) {
      empty.textContent = 'No units match your filters. Try widening your search.';
    }
    empty.style.display = 'block';
    meta.textContent = '0 units';
    return;
  }
  empty.style.display = 'none';
  meta.textContent = `Showing ${list.length} unit${list.length > 1 ? 's' : ''}`;
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
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);

  const toggle = document.getElementById('toggle-map');
  if (toggle) toggle.addEventListener('click', () => {
    const wrap = document.getElementById('units-map');
    const hint = document.getElementById('map-hint');
    const hidden = wrap.classList.toggle('hidden');
    toggle.textContent = hidden ? 'Show map' : 'Hide map';
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
    const m = L.marker([u.lat, u.lng]);
    m.bindPopup(
      `<strong>${escapeHtml(u.title)}</strong><br>${escapeHtml(u.address)}<br>` +
      `${fmtBeds(u.beds)} · ${fmtPrice(u.price)}<br>` +
      `<a href="${unitHref(u)}" class="map-popup-link">View listing →</a>`
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
      showFsMap(Number.isFinite(v) && v > 0 ? v : null);
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
