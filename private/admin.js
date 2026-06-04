const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const fmtPrice = (n) => '$' + (n || 0).toLocaleString('en-US') + ' / mo';
const fmtBeds = (n) => n === 0 ? 'Studio' : `${n} bed${n > 1 ? 's' : ''}`;

let units = [];
let editing = null; // current unit object or null

async function api(method, url, body, isForm = false) {
  const opts = { method };
  if (body && !isForm) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  } else if (body && isForm) {
    opts.body = body; // FormData
  }
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

async function loadUnits() {
  const showHidden = $('#show-hidden').checked;
  const qs = showHidden ? '?all=1' : '';
  units = await api('GET', `/api/units${qs}`);
  renderGrid();
}

function renderGrid() {
  const grid = $('#admin-grid');
  const count = $('#result-count');
  count.textContent = `${units.length} unit${units.length === 1 ? '' : 's'}`;
  if (units.length === 0) {
    grid.innerHTML = `<div class="no-results">No units yet. Click <strong>+ New unit</strong> to add your first listing.</div>`;
    return;
  }
  grid.innerHTML = units.map((u) => {
    const thumb = u.photos[0]
      ? `<div class="row-thumb" style="background-image:url('${u.photos[0].url}')"></div>`
      : `<div class="row-thumb placeholder">${(u.title || '?').slice(0, 1)}</div>`;
    const badge = u.status === 'hidden'
      ? `<span class="pill pill-muted">Hidden</span>`
      : `<span class="pill pill-ok">Available</span>`;
    return `
      <article class="admin-row" data-id="${u.id}">
        ${thumb}
        <div class="row-main">
          <div class="row-title">
            <strong>${escapeHtml(u.title)}</strong>
            ${badge}
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
          <button class="btn btn-ghost btn-sm" data-edit="${u.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete="${u.id}">Delete</button>
        </div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openDrawer(units.find((u) => u.id === Number(b.dataset.edit))))
  );
  grid.querySelectorAll('[data-delete]').forEach((b) =>
    b.addEventListener('click', () => deleteUnit(Number(b.dataset.delete)))
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function deleteUnit(id) {
  const u = units.find((x) => x.id === id);
  if (!u) return;
  if (!confirm(`Delete "${u.title}"? This also removes its photos.`)) return;
  try {
    await api('DELETE', `/api/units/${id}`);
    await loadUnits();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

// ── Drawer ────────────────────────────────────────────────────
function openDrawer(unit) {
  editing = unit || null;
  const form = $('#unit-form');
  form.reset();
  $('#drawer-title').textContent = unit ? 'Edit unit' : 'New unit';
  $('#save-btn').textContent = unit ? 'Save changes' : 'Create unit';

  if (unit) {
    form.id.value = unit.id;
    form.unit_code.value = unit.unit_code || '';
    form.title.value = unit.title || '';
    form.address.value = unit.address || '';
    form.neighborhood.value = unit.neighborhood || '';
    form.beds.value = unit.beds ?? 1;
    form.baths.value = unit.baths ?? 1;
    form.sqft.value = unit.sqft ?? '';
    form.price.value = unit.price ?? 0;
    form.available_date.value = unit.available_date || '';
    form.description.value = unit.description || '';
    form.appliances.value = unit.appliances || '';
    form.parking_available.value = unit.parking_available || 'no';
    form.parking_cost.value = unit.parking_cost ?? '';
    form.locker_available.value = unit.locker_available || 'no';
    form.locker_cost.value = unit.locker_cost ?? '';
    form.dogs_policy.value = unit.dogs_policy || 'no';
    form.status.value = unit.status || 'available';
    $('#photos-field').hidden = false;
    renderPhotos(unit.photos);
  } else {
    form.id.value = '';
    $('#photos-field').hidden = true; // photos only after creation
  }

  syncCostFields();

  $('#drawer').classList.add('open');
  $('#drawer-backdrop').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  setTimeout(() => form.title.focus(), 80);
}

// Show a cost input only when its amenity is set to "Yes".
function syncCostFields() {
  $('#parking-cost-field').hidden = $('#parking-available').value !== 'yes';
  $('#locker-cost-field').hidden = $('#locker-available').value !== 'yes';
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer-backdrop').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  editing = null;
}

function renderPhotos(photos) {
  const list = $('#photo-list');
  if (!photos || photos.length === 0) {
    list.innerHTML = `<p class="muted small" style="margin:0;">No photos yet. Add some below.</p>`;
    return;
  }
  list.innerHTML = photos.map((p) => `
    <div class="photo-tile" data-photo-id="${p.id}">
      <img src="${p.url}" alt="" loading="lazy" />
      <button type="button" class="photo-del" title="Delete photo" aria-label="Delete photo">×</button>
    </div>
  `).join('');
  list.querySelectorAll('.photo-del').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      const tile = e.target.closest('.photo-tile');
      const photoId = Number(tile.dataset.photoId);
      if (!confirm('Delete this photo?')) return;
      try {
        await api('DELETE', `/api/photos/${photoId}`);
        editing.photos = editing.photos.filter((x) => x.id !== photoId);
        renderPhotos(editing.photos);
        loadUnits(); // refresh thumbnails in main grid
      } catch (err) { alert('Delete failed: ' + err.message); }
    })
  );
}

async function uploadFiles(files) {
  if (!editing || !files || files.length === 0) return;
  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  $('#dropzone').classList.add('uploading');
  try {
    const { photos } = await api('POST', `/api/units/${editing.id}/photos`, fd, true);
    editing.photos = [...(editing.photos || []), ...photos.map((p) => ({ id: p.id, url: p.url }))];
    renderPhotos(editing.photos);
    loadUnits();
  } catch (e) {
    alert('Upload failed: ' + e.message);
  } finally {
    $('#dropzone').classList.remove('uploading');
  }
}

// ── Wire up ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $('#new-unit-btn').addEventListener('click', (e) => { e.preventDefault(); openDrawer(null); });
  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#drawer-cancel').addEventListener('click', closeDrawer);
  $('#drawer-backdrop').addEventListener('click', closeDrawer);
  $('#show-hidden').addEventListener('change', loadUnits);
  $('#parking-available').addEventListener('change', syncCostFields);
  $('#locker-available').addEventListener('change', syncCostFields);

  $('#unit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const id = body.id;
    delete body.id;
    try {
      const saved = id
        ? await api('PUT', `/api/units/${id}`, body)
        : await api('POST', '/api/units', body);
      await loadUnits();
      // Re-open in edit mode so they can immediately add photos
      const fresh = units.find((u) => u.id === saved.id);
      if (fresh) openDrawer(fresh);
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });

  // Dropzone
  const dz = $('#dropzone');
  const input = $('#photo-input');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', () => uploadFiles(input.files));
  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); })
  );
  dz.addEventListener('drop', (e) => uploadFiles(e.dataTransfer.files));

  // Esc closes drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#drawer').classList.contains('open')) closeDrawer();
  });

  loadUnits().catch((e) => {
    $('#admin-grid').innerHTML = `<div class="no-results">Failed to load units: ${escapeHtml(e.message)}</div>`;
  });
});
