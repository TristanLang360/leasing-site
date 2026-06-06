const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const fmtPrice = (n) => '$' + (n || 0).toLocaleString('en-US') + ' / mo';
const fmtBeds = (n) => (n === 0 ? 'Studio' : `${n} bed${n > 1 ? 's' : ''}`);
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Capabilities (mirror the server).
const CAP = {
  editUnits: (r) => r === 'master' || r === 'agent',
  deleteUnits: (r) => r === 'master',
  manageUsers: (r) => r === 'master',
  calendar: (r) => r === 'master' || r === 'agent',
};
let ME = null;
const can = (name) => ME && CAP[name] && CAP[name](ME.role);

let units = [];
let editing = null;        // current unit object or null
let allUsers = [];         // for agent assignment + agents tab

async function api(method, url, body, isForm = false) {
  const opts = { method };
  if (body && !isForm) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  } else if (body && isForm) {
    opts.body = body; // FormData
  }
  const r = await fetch(url, opts);
  if (r.status === 401) { location.href = '/login'; throw new Error('Not authenticated'); }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    ME = await api('GET', '/api/me');
  } catch { location.href = '/login'; return; }

  $('#user-badge').textContent = `${ME.name || ME.email} · ${ME.role}`;
  applyCapabilities();
  wireTabs();
  wireUnits();
  wireCsv();
  wireCalendar();
  wireAgents();
  wireAccount();
  $('#logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('POST', '/api/logout').catch(() => {});
    location.href = '/login';
  });

  loadUnits().catch((e) => {
    $('#admin-grid').innerHTML = `<div class="no-results">Failed to load units: ${escapeHtml(e.message)}</div>`;
  });
});

function applyCapabilities() {
  // Hide any element gated by a capability the user lacks.
  $$('[data-cap]').forEach((el) => { if (!can(el.dataset.cap)) el.hidden = true; });
  if (!can('manageUsers')) $('#panel-agents')?.remove();
}

// ── Tabs ───────────────────────────────────────────────────────
function wireTabs() {
  $$('#tabs .tab').forEach((tab) => {
    if (tab.hidden) return;
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
}
function activateTab(name) {
  $$('#tabs .tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
  if (name === 'calendar') loadAppointments();
  if (name === 'agents') loadUsers();
}

// ── Units list ─────────────────────────────────────────────────
async function loadUnits() {
  const showHidden = $('#show-hidden').checked;
  units = await api('GET', `/api/units${showHidden ? '?all=1' : ''}`);
  renderGrid();
}

function renderGrid() {
  const grid = $('#admin-grid');
  $('#result-count').textContent = `${units.length} unit${units.length === 1 ? '' : 's'}`;
  if (units.length === 0) {
    grid.innerHTML = `<div class="no-results">No units yet.${can('editUnits') ? ' Click <strong>+ New unit</strong> to add your first listing.' : ''}</div>`;
    return;
  }
  grid.innerHTML = units.map((u) => {
    const thumb = u.photos[0]
      ? `<div class="row-thumb" style="background-image:url('${u.photos[0].url}')"></div>`
      : `<div class="row-thumb placeholder">${escapeHtml((u.title || '?').slice(0, 1))}</div>`;
    const badge = u.status === 'hidden'
      ? `<span class="pill pill-muted">Hidden</span>`
      : `<span class="pill pill-ok">Available</span>`;
    const geo = (u.lat != null && u.lng != null)
      ? `<span class="pill pill-geo">📍 located</span>`
      : `<span class="pill pill-warn">no map pin</span>`;
    const del = can('deleteUnits')
      ? `<button class="btn btn-danger btn-sm" data-delete="${u.id}">Delete</button>` : '';
    return `
      <article class="admin-row" data-id="${u.id}">
        ${thumb}
        <div class="row-main">
          <div class="row-title">
            <strong>${escapeHtml(u.title)}</strong>
            ${badge} ${geo}
            ${u.unit_code ? `<span class="muted small">${escapeHtml(u.unit_code)}</span>` : ''}
          </div>
          <div class="row-meta">
            <span>${escapeHtml(u.address)}</span>
            ${u.neighborhood ? `<span>· ${escapeHtml(u.neighborhood)}</span>` : ''}
          </div>
          <div class="row-meta">
            <span>${fmtBeds(u.beds)}</span>
            <span>· ${u.baths} bath${u.baths > 1 ? 's' : ''}</span>
            ${u.sqft ? `<span>· ${u.sqft.toLocaleString()} sqft</span>` : ''}
            <span>· ${fmtPrice(u.price)}</span>
            <span>· ${u.photos.length} photo${u.photos.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${u.id}">${can('editUnits') ? 'Edit' : 'View'}</button>
          ${del}
        </div>
      </article>`;
  }).join('');

  grid.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openDrawer(units.find((u) => u.id === Number(b.dataset.edit)))));
  grid.querySelectorAll('[data-delete]').forEach((b) =>
    b.addEventListener('click', () => deleteUnit(Number(b.dataset.delete))));
}

async function deleteUnit(id) {
  const u = units.find((x) => x.id === id);
  if (!u || !confirm(`Delete "${u.title}"? This also removes its photos.`)) return;
  try { await api('DELETE', `/api/units/${id}`); await loadUnits(); }
  catch (e) { alert('Delete failed: ' + e.message); }
}

// ── Unit drawer ────────────────────────────────────────────────
let drawerMap = null, drawerMarker = null, nearbyLayer = null;

function wireUnits() {
  $('#new-unit-btn')?.addEventListener('click', (e) => { e.preventDefault(); openDrawer(null); });
  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#drawer-cancel').addEventListener('click', closeDrawer);
  $('#drawer-backdrop').addEventListener('click', closeDrawer);
  $('#show-hidden').addEventListener('change', loadUnits);
  $('#parking-available').addEventListener('change', syncCostFields);
  $('#locker-available').addEventListener('change', syncCostFields);
  $('#directions-btn').addEventListener('click', openDirections);
  $('#regeocode-btn')?.addEventListener('click', regeocode);
  $('#download-all-btn').addEventListener('click', (e) => {
    e.preventDefault();
    if (editing) window.location.href = `/api/units/${editing.id}/photos.zip`;
  });

  $('#unit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!can('editUnits')) return;
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const id = body.id; delete body.id;
    try {
      const saved = id ? await api('PUT', `/api/units/${id}`, body) : await api('POST', '/api/units', body);
      await loadUnits();
      const fresh = units.find((u) => u.id === saved.id) || saved;
      openDrawer(fresh); // re-open so photos/nearby can be managed
    } catch (err) { alert('Save failed: ' + err.message); }
  });

  // Photo dropzone
  const dz = $('#dropzone');
  const input = $('#photo-input');
  dz.addEventListener('click', () => { if (can('editUnits')) input.click(); });
  input.addEventListener('change', () => uploadFiles(input.files));
  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => { if (can('editUnits')) uploadFiles(e.dataTransfer.files); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#drawer').classList.contains('open')) closeDrawer();
  });
}

function syncCostFields() {
  $('#parking-cost-field').hidden = $('#parking-available').value !== 'yes';
  $('#locker-cost-field').hidden = $('#locker-available').value !== 'yes';
}

function openDrawer(unit) {
  editing = unit || null;
  const form = $('#unit-form');
  form.reset();
  const editable = can('editUnits');
  $('#drawer-title').textContent = unit ? (editable ? 'Edit unit' : 'View unit') : 'New unit';
  $('#save-btn').textContent = unit ? 'Save changes' : 'Create unit';

  if (unit) {
    for (const k of ['unit_code', 'title', 'address', 'neighborhood', 'beds', 'baths', 'sqft',
      'price', 'available_date', 'description', 'appliances', 'parking_available', 'parking_cost',
      'locker_available', 'locker_cost', 'dogs_policy', 'status', 'lat', 'lng']) {
      if (form[k] !== undefined) form[k].value = unit[k] ?? '';
    }
    form.id.value = unit.id;
    $('#photos-field').hidden = false;
    $('#location-field').hidden = false;
    $('#nearby-field').hidden = false;
    renderPhotos(unit.photos);
    setupDrawerMap(unit);
    loadNearby(unit.id);
    updateGeoStatus(unit);
  } else {
    form.id.value = '';
    $('#photos-field').hidden = true;   // photos only after creation
    $('#location-field').hidden = true; // location appears after first save (needs address)
    $('#nearby-field').hidden = true;
  }

  // Lock the form down for read-only (viewer) users.
  $$('#unit-form input, #unit-form select, #unit-form textarea').forEach((el) => {
    if (el.type === 'hidden') return;
    el.disabled = !editable;
  });

  syncCostFields();
  $('#drawer').classList.add('open');
  $('#drawer-backdrop').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  if (editable) setTimeout(() => form.title.focus(), 80);
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer-backdrop').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  editing = null;
}

function updateGeoStatus(unit) {
  const el = $('#geo-status');
  if (unit.lat != null && unit.lng != null) {
    el.textContent = `📍 Located at ${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}.`;
  } else if (unit.geocode_attempted) {
    el.textContent = '⚠️ Could not auto-locate this address. Enter coordinates manually or edit the address, then re-locate.';
  } else {
    el.textContent = '⏳ Locating this address on the map… reopen in a moment.';
  }
}

// Mini-map inside the drawer (unit pin + nearby pins; click to set coords).
function setupDrawerMap(unit) {
  const el = $('#drawer-map');
  if (typeof L === 'undefined') { el.style.display = 'none'; return; }
  el.style.display = '';
  const center = (unit.lat != null && unit.lng != null) ? [unit.lat, unit.lng] : [45.5019, -73.5674];
  setTimeout(() => {
    if (!drawerMap) {
      drawerMap = L.map(el).setView(center, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap',
      }).addTo(drawerMap);
      nearbyLayer = L.layerGroup().addTo(drawerMap);
      drawerMap.on('click', (e) => {
        if (!can('editUnits')) return;
        $('#unit-form').lat.value = e.latlng.lat.toFixed(6);
        $('#unit-form').lng.value = e.latlng.lng.toFixed(6);
        placeDrawerMarker(e.latlng.lat, e.latlng.lng);
      });
    } else {
      drawerMap.setView(center, 14);
    }
    drawerMap.invalidateSize();
    if (unit.lat != null && unit.lng != null) placeDrawerMarker(unit.lat, unit.lng);
    else if (drawerMarker) { drawerMap.removeLayer(drawerMarker); drawerMarker = null; }
  }, 120);
}
function placeDrawerMarker(lat, lng) {
  if (drawerMarker) drawerMap.removeLayer(drawerMarker);
  drawerMarker = L.marker([lat, lng], { draggable: can('editUnits') }).addTo(drawerMap);
  drawerMarker.on('dragend', () => {
    const p = drawerMarker.getLatLng();
    $('#unit-form').lat.value = p.lat.toFixed(6);
    $('#unit-form').lng.value = p.lng.toFixed(6);
  });
  drawerMap.panTo([lat, lng]);
}

function openDirections() {
  if (!editing) return;
  const dest = (editing.lat != null && editing.lng != null)
    ? `${editing.lat},${editing.lng}`
    : encodeURIComponent(editing.address);
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank', 'noopener');
}

async function regeocode() {
  if (!editing) return;
  $('#geo-status').textContent = '⏳ Re-locating from address…';
  try {
    await api('POST', `/api/units/${editing.id}/geocode`);
    // Give the background geocoder a moment, then refresh.
    setTimeout(async () => {
      const fresh = await api('GET', `/api/units/${editing.id}`);
      const i = units.findIndex((u) => u.id === fresh.id);
      if (i > -1) units[i] = fresh;
      if (editing && editing.id === fresh.id) { editing = fresh; updateGeoStatus(fresh); setupDrawerMap(fresh); }
      renderGrid();
    }, 2500);
  } catch (e) { $('#geo-status').textContent = 'Re-locate failed: ' + e.message; }
}

// ── Nearby units ───────────────────────────────────────────────
async function loadNearby(unitId) {
  const box = $('#nearby-list');
  box.innerHTML = `<p class="muted small" style="margin:0;">Finding nearby units…</p>`;
  try {
    const { nearby, reason } = await api('GET', `/api/units/${unitId}/nearby?limit=5`);
    if (reason === 'no-coords') {
      box.innerHTML = `<p class="muted small" style="margin:0;">This unit isn't located on the map yet, so we can't measure distances.</p>`;
      return;
    }
    if (!nearby.length) {
      box.innerHTML = `<p class="muted small" style="margin:0;">No other located units to compare against.</p>`;
      return;
    }
    box.innerHTML = nearby.map((n) => `
      <button type="button" class="nearby-row" data-open="${n.id}">
        <span class="nearby-dist">${n.distance_km} km</span>
        <span class="nearby-main">
          <strong>${escapeHtml(n.title)}</strong>
          <span class="muted small">${escapeHtml(n.address)} · ${fmtPrice(n.price)}</span>
        </span>
        <span class="nearby-go">→</span>
      </button>`).join('');
    box.querySelectorAll('[data-open]').forEach((b) =>
      b.addEventListener('click', () => {
        const u = units.find((x) => x.id === Number(b.dataset.open));
        if (u) openDrawer(u);
        else api('GET', `/api/units/${b.dataset.open}`).then(openDrawer);
      }));
    // Plot nearby pins on the drawer map too.
    if (nearbyLayer) {
      nearbyLayer.clearLayers();
      nearby.forEach((n) => {
        if (n.lat == null || n.lng == null) return;
        L.circleMarker([n.lat, n.lng], { radius: 7, color: '#8a6a3b', fillColor: '#b89572', fillOpacity: 0.8 })
          .bindPopup(`<strong>${escapeHtml(n.title)}</strong><br>${n.distance_km} km away`).addTo(nearbyLayer);
      });
    }
  } catch (e) {
    box.innerHTML = `<p class="muted small" style="margin:0;">Could not load nearby units.</p>`;
  }
}

// ── Photos ─────────────────────────────────────────────────────
function renderPhotos(photos) {
  const list = $('#photo-list');
  if (!photos || photos.length === 0) {
    list.innerHTML = `<p class="muted small" style="margin:0;">No photos yet.${can('editUnits') ? ' Add some below.' : ''}</p>`;
    return;
  }
  list.innerHTML = photos.map((p) => `
    <div class="photo-tile" data-photo-id="${p.id}">
      <img src="${p.url}" alt="" loading="lazy" />
      <a class="photo-dl-one" href="/api/photos/${p.id}/download" title="Download" download>⬇</a>
      ${can('editUnits') ? `<button type="button" class="photo-del" title="Delete photo" aria-label="Delete photo">×</button>` : ''}
    </div>`).join('');
  list.querySelectorAll('.photo-del').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      const tile = e.target.closest('.photo-tile');
      const photoId = Number(tile.dataset.photoId);
      if (!confirm('Delete this photo?')) return;
      try {
        await api('DELETE', `/api/photos/${photoId}`);
        editing.photos = editing.photos.filter((x) => x.id !== photoId);
        renderPhotos(editing.photos);
        loadUnits();
      } catch (err) { alert('Delete failed: ' + err.message); }
    }));
}

async function uploadFiles(files) {
  if (!editing || !can('editUnits') || !files || files.length === 0) return;
  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  $('#dropzone').classList.add('uploading');
  try {
    const { photos } = await api('POST', `/api/units/${editing.id}/photos`, fd, true);
    editing.photos = [...(editing.photos || []), ...photos];
    renderPhotos(editing.photos);
    loadUnits();
  } catch (e) { alert('Upload failed: ' + e.message); }
  finally { $('#dropzone').classList.remove('uploading'); }
}

// ── CSV import ─────────────────────────────────────────────────
function wireCsv() {
  const open = () => { $('#csv-backdrop').classList.add('open'); $('#csv-modal').classList.add('open'); };
  const close = () => {
    $('#csv-backdrop').classList.remove('open'); $('#csv-modal').classList.remove('open');
    $('#csv-result').hidden = true; $('#csv-input').value = ''; $('#csv-filename').textContent = 'No file selected';
    $('#csv-submit').disabled = true;
  };
  $('#import-csv-btn')?.addEventListener('click', open);
  $('#csv-close').addEventListener('click', close);
  $('#csv-cancel').addEventListener('click', close);
  $('#csv-backdrop').addEventListener('click', close);

  const input = $('#csv-input');
  $('#csv-dropzone').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    $('#csv-filename').textContent = input.files[0]?.name || 'No file selected';
    $('#csv-submit').disabled = !input.files[0];
  });

  $('#csv-sample').addEventListener('click', (e) => {
    e.preventDefault();
    const sample = [
      'unit_code,title,address,neighborhood,beds,baths,sqft,price,available_date,parking,locker,dogs,description',
      'C-101,Bright 1BR,5200 Rue Saint-Denis Montréal,Plateau,1,1,650,1750,2026-07-01,yes,no,contact,Sunny one-bedroom',
      'C-204,Spacious 2BR,1000 Rue de la Montagne Montréal,Downtown,2,1,900,2300,2026-08-01,no,yes,no,Close to metro',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'rentalium-units-sample.csv'; a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#csv-submit').addEventListener('click', async () => {
    if (!input.files[0]) return;
    const fd = new FormData(); fd.append('file', input.files[0]);
    $('#csv-submit').disabled = true; $('#csv-submit').textContent = 'Importing…';
    try {
      const res = await api('POST', '/api/units/import', fd, true);
      const errs = res.errors && res.errors.length
        ? `<ul class="csv-errs">${res.errors.map((er) => `<li>Row ${er.row}: ${escapeHtml(er.error)}</li>`).join('')}</ul>` : '';
      $('#csv-result').hidden = false;
      $('#csv-result').innerHTML =
        `<strong>Imported ${res.imported} of ${res.total} rows.</strong>` +
        (res.skipped ? ` ${res.skipped} skipped.` : '') +
        ` Addresses are being located on the map in the background.` + errs;
      await loadUnits();
    } catch (e) {
      $('#csv-result').hidden = false;
      $('#csv-result').innerHTML = `<span style="color:#b3261e;">Import failed: ${escapeHtml(e.message)}</span>`;
    } finally {
      $('#csv-submit').disabled = false; $('#csv-submit').textContent = 'Import';
    }
  });
}

// ── Calendar ───────────────────────────────────────────────────
let calCursor = new Date(); calCursor.setDate(1);
let appointments = [];

function wireCalendar() {
  $('#cal-prev').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() - 1); loadAppointments(); });
  $('#cal-next').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() + 1); loadAppointments(); });
  $('#cal-today').addEventListener('click', () => { calCursor = new Date(); calCursor.setDate(1); loadAppointments(); });
  $('#new-appt-btn')?.addEventListener('click', () => openAppt(null));
  $('#appt-close').addEventListener('click', closeAppt);
  $('#appt-cancel').addEventListener('click', closeAppt);
  $('#appt-backdrop').addEventListener('click', closeAppt);
  $('#appt-delete').addEventListener('click', deleteAppt);
  $('#appt-form').addEventListener('submit', saveAppt);
}

async function loadAppointments() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  const from = new Date(y, m, 1).toISOString();
  const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
  try {
    appointments = await api('GET', `/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  } catch { appointments = []; }
  renderCalendar();
  renderApptList();
}

function renderCalendar() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  $('#cal-label').textContent = calCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const byDay = {};
  appointments.forEach((a) => {
    const d = new Date(a.start_at); const key = d.getDate();
    (byDay[key] = byDay[key] || []).push(a);
  });

  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map((d) => `<div class="cal-dow">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < startDay; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= days; day++) {
    const date = new Date(y, m, day);
    const isToday = date.getTime() === today.getTime();
    const appts = (byDay[day] || []).sort((a, b) => a.start_at.localeCompare(b.start_at));
    const items = appts.slice(0, 3).map((a) => {
      const t = new Date(a.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `<button class="cal-appt status-${a.status}" data-appt="${a.id}">${t} ${escapeHtml(a.client_name || a.title)}</button>`;
    }).join('');
    const more = appts.length > 3 ? `<span class="cal-more">+${appts.length - 3} more</span>` : '';
    cells += `<div class="cal-cell${isToday ? ' is-today' : ''}" data-day="${day}">
      <span class="cal-date">${day}</span>${items}${more}</div>`;
  }
  $('#calendar').innerHTML = `<div class="cal-grid">${dow}${cells}</div>`;

  $$('#calendar .cal-appt').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); openAppt(appointments.find((a) => a.id === Number(b.dataset.appt))); }));
  if (can('calendar')) {
    $$('#calendar .cal-cell[data-day]').forEach((cell) =>
      cell.addEventListener('click', () => {
        const day = Number(cell.dataset.day);
        openAppt(null, new Date(y, m, day, 10, 0));
      }));
  }
}

function renderApptList() {
  const box = $('#appt-list');
  const upcoming = [...appointments].sort((a, b) => a.start_at.localeCompare(b.start_at));
  if (!upcoming.length) { box.innerHTML = `<p class="muted small">No showings this month.</p>`; return; }
  box.innerHTML = upcoming.map((a) => {
    const d = new Date(a.start_at);
    const when = d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `
      <button class="appt-row status-${a.status}" data-appt="${a.id}">
        <span class="appt-when">${when}</span>
        <span class="appt-main">
          <strong>${escapeHtml(a.title)}</strong>
          <span class="muted small">
            ${a.unit ? escapeHtml(a.unit.title) : 'No unit'}
            ${a.client_name ? ' · ' + escapeHtml(a.client_name) : ''}
            ${a.agent ? ' · ' + escapeHtml(a.agent.name || a.agent.email) : ''}
          </span>
        </span>
        <span class="pill pill-${a.status}">${a.status}</span>
      </button>`;
  }).join('');
  box.querySelectorAll('[data-appt]').forEach((b) =>
    b.addEventListener('click', () => openAppt(appointments.find((a) => a.id === Number(b.dataset.appt)))));
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fillApptSelects() {
  const unitSel = $('#appt-unit');
  unitSel.innerHTML = `<option value="">— No unit —</option>` +
    units.map((u) => `<option value="${u.id}">${escapeHtml(u.title)}${u.unit_code ? ' (' + escapeHtml(u.unit_code) + ')' : ''}</option>`).join('');
  const agentSel = $('#appt-agent');
  const list = allUsers.length ? allUsers : (ME ? [ME] : []);
  agentSel.innerHTML = `<option value="">— Unassigned —</option>` +
    list.map((u) => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join('');
}

async function openAppt(appt, presetDate) {
  if (!can('calendar')) return; // viewers can browse the calendar but not edit
  if (!allUsers.length && can('manageUsers')) { try { allUsers = await api('GET', '/api/users'); } catch {} }
  if (!units.length) await loadUnits();
  fillApptSelects();
  const form = $('#appt-form'); form.reset();
  $('#appt-title').textContent = appt ? 'Edit showing' : 'New showing';
  $('#appt-delete').hidden = !appt;
  if (appt) {
    form.id.value = appt.id;
    form.title.value = appt.title || '';
    form.unit_id.value = appt.unit_id || '';
    form.start_at.value = toLocalInput(appt.start_at);
    form.end_at.value = toLocalInput(appt.end_at);
    form.client_name.value = appt.client_name || '';
    form.client_phone.value = appt.client_phone || '';
    form.client_email.value = appt.client_email || '';
    form.agent_id.value = appt.agent_id || '';
    form.status.value = appt.status || 'scheduled';
    form.notes.value = appt.notes || '';
  } else {
    form.id.value = '';
    if (presetDate) form.start_at.value = toLocalInput(presetDate.toISOString());
  }
  $('#appt-backdrop').classList.add('open');
  $('#appt-modal').classList.add('open');
}
function closeAppt() {
  $('#appt-backdrop').classList.remove('open');
  $('#appt-modal').classList.remove('open');
}
async function saveAppt(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const id = body.id; delete body.id;
  // datetime-local has no timezone; convert to ISO.
  if (body.start_at) body.start_at = new Date(body.start_at).toISOString();
  if (body.end_at) body.end_at = new Date(body.end_at).toISOString();
  try {
    if (id) await api('PUT', `/api/appointments/${id}`, body);
    else await api('POST', '/api/appointments', body);
    closeAppt();
    loadAppointments();
  } catch (err) { alert('Save failed: ' + err.message); }
}
async function deleteAppt() {
  const id = $('#appt-form').id.value;
  if (!id || !confirm('Delete this showing?')) return;
  try { await api('DELETE', `/api/appointments/${id}`); closeAppt(); loadAppointments(); }
  catch (e) { alert('Delete failed: ' + e.message); }
}

// ── Agents (master only) ───────────────────────────────────────
function wireAgents() {
  if (!can('manageUsers')) return;
  $('#new-user-btn')?.addEventListener('click', () => openUser(null));
  $('#user-close').addEventListener('click', closeUser);
  $('#user-cancel').addEventListener('click', closeUser);
  $('#user-backdrop').addEventListener('click', closeUser);
  $('#user-form').addEventListener('submit', saveUser);
}
async function loadUsers() {
  if (!can('manageUsers')) return;
  try { allUsers = await api('GET', '/api/users'); } catch { allUsers = []; }
  const grid = $('#users-grid');
  $('#users-count').textContent = `${allUsers.length} team member${allUsers.length === 1 ? '' : 's'}`;
  grid.innerHTML = allUsers.map((u) => `
    <article class="user-row">
      <div class="user-avatar">${escapeHtml((u.name || u.email).slice(0, 1).toUpperCase())}</div>
      <div class="row-main">
        <div class="row-title">
          <strong>${escapeHtml(u.name || u.email)}</strong>
          <span class="pill pill-role role-${u.role}">${u.role}</span>
          ${u.active ? '' : '<span class="pill pill-muted">disabled</span>'}
          ${u.id === ME.id ? '<span class="muted small">you</span>' : ''}
        </div>
        <div class="row-meta"><span>${escapeHtml(u.email)}</span></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-euser="${u.id}">Edit</button>
        ${u.id === ME.id ? '' : `<button class="btn btn-danger btn-sm" data-duser="${u.id}">Delete</button>`}
      </div>
    </article>`).join('');
  grid.querySelectorAll('[data-euser]').forEach((b) =>
    b.addEventListener('click', () => openUser(allUsers.find((u) => u.id === Number(b.dataset.euser)))));
  grid.querySelectorAll('[data-duser]').forEach((b) =>
    b.addEventListener('click', () => deleteUser(Number(b.dataset.duser))));
}
function openUser(user) {
  const form = $('#user-form'); form.reset();
  $('#user-msg').hidden = true;
  $('#user-modal-title').textContent = user ? 'Edit team member' : 'Add agent';
  $('#user-active-wrap').hidden = !user;
  $('#user-pw-label').textContent = user ? 'New password (leave blank to keep)' : 'Password *';
  if (user) {
    form.id.value = user.id;
    form.email.value = user.email; form.email.disabled = true;
    form.name.value = user.name || '';
    form.role.value = user.role;
    $('#user-active').checked = !!user.active;
  } else {
    form.id.value = ''; form.email.disabled = false;
  }
  $('#user-backdrop').classList.add('open');
  $('#user-modal').classList.add('open');
}
function closeUser() {
  $('#user-backdrop').classList.remove('open');
  $('#user-modal').classList.remove('open');
}
async function saveUser(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  const body = {
    name: form.name.value, role: form.role.value, password: form.password.value || undefined,
  };
  if (!id) { body.email = form.email.value; }
  else { body.active = $('#user-active').checked; }
  try {
    if (id) await api('PUT', `/api/users/${id}`, body);
    else await api('POST', '/api/users', body);
    closeUser(); loadUsers();
  } catch (err) {
    $('#user-msg').textContent = err.message; $('#user-msg').hidden = false;
  }
}
async function deleteUser(id) {
  const u = allUsers.find((x) => x.id === id);
  if (!u || !confirm(`Remove ${u.name || u.email}?`)) return;
  try { await api('DELETE', `/api/users/${id}`); loadUsers(); }
  catch (e) { alert('Delete failed: ' + e.message); }
}

// ── Account ────────────────────────────────────────────────────
function wireAccount() {
  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = $('#pw-msg'); msg.hidden = true;
    try {
      await api('PUT', '/api/me/password', { current: form.current.value, password: form.password.value });
      msg.textContent = '✓ Password updated.'; msg.style.color = '#1a7f37'; msg.hidden = false;
      form.reset();
    } catch (err) {
      msg.textContent = err.message; msg.style.color = '#b3261e'; msg.hidden = false;
    }
  });
}
