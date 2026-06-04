// Public listings page — fetches live data from /api/units.
// Manage units & photos at /admin.

const fmtPrice = (n) => '$' + (n || 0).toLocaleString('en-US') + ' / mo';
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
}

const fmtCost = (n) => (n ? `$${Number(n).toLocaleString('en-US')}/mo` : 'included');
const dogsLabel = (p) => p === 'yes'
  ? '🐾 Dogs welcome'
  : p === 'contact'
    ? '🐾 Contact us about your dog'
    : '';

function unitCardHTML(u, idx) {
  const variant = ((idx % 6) + 1);
  const photo = u.photos && u.photos[0]
    ? `<div class="unit-photo has-image" style="background-image:url('${u.photos[0].url}')">`
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
    <article class="unit-card">
      ${photo}
        <span class="unit-tag">Avail ${fmtAvail(u.available_date)}</span>
        <span class="unit-price">${fmtPrice(u.price)}</span>
      </div>
      <div class="unit-body">
        <h3>${escapeHtml(u.title)}</h3>
        <div class="unit-addr">${escapeHtml(u.address)}${u.neighborhood ? ' · ' + escapeHtml(u.neighborhood) : ''}</div>
        <div class="unit-meta">
          <span>${fmtBeds(u.beds)}</span>
          <span>${u.baths} bath${u.baths > 1 ? 's' : ''}</span>
          ${u.sqft ? `<span>${u.sqft.toLocaleString()} sqft</span>` : ''}
        </div>
        ${amenitiesHTML}
      </div>
    </article>
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
}

function applyFilters() {
  const q = document.getElementById('f-search').value.trim().toLowerCase();
  const beds = document.getElementById('f-beds').value;
  const maxPrice = document.getElementById('f-price').value;
  const sort = document.getElementById('f-sort').value;

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
    if (maxPrice && u.price > parseInt(maxPrice, 10)) return false;
    return true;
  });

  if (sort === 'price-asc')  list.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  if (sort === 'size-desc')  list.sort((a, b) => (b.sqft || 0) - (a.sqft || 0));

  renderUnits(list);
}

document.addEventListener('DOMContentLoaded', () => {
  ['f-search', 'f-beds', 'f-price', 'f-sort'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', applyFilters);
    el.addEventListener('change', applyFilters);
  });
  const reset = document.getElementById('f-reset');
  if (reset) reset.addEventListener('click', () => {
    document.getElementById('f-search').value = '';
    document.getElementById('f-beds').value = '';
    document.getElementById('f-price').value = '';
    document.getElementById('f-sort').value = 'price-asc';
    applyFilters();
  });
  loadUnits();
});
