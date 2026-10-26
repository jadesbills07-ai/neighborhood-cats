// Neighborhood Cats — shared frontend.
// Cat data lives on the SERVER (GET/POST /api/cats). The browser only
// remembers the visitor's display name and neighborhood code, never the cats.
let cats = [], sightings = [], filter = 'all', search = '';
let code = sessionStorage.getItem('nc-code') || '';
let displayName = sessionStorage.getItem('nc-name') || '';
let map = null, markers = [], pendingPin = null, chosenPhoto = '🐈';
const PHOTOS = ['🐈', '🐈‍⬛', '🐱', '😺', '😸', '🐾'];

const $ = (id) => document.getElementById(id);
const headers = () => ({ 'Content-Type': 'application/json', 'x-neighborhood-code': code });

function pinClass(cat) {
  return cat.spotted ? 'pin-spotted' : (cat.status === 'outdoor' ? 'pin-outdoor' : 'pin-indoor');
}
function statusLabel(cat) {
  if (cat.spotted) return '⚠️ Spotted Outside';
  return cat.status === 'outdoor' ? '✅ Outdoor OK' : '🏠 Indoor Only';
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function initMap() {
  if (typeof L === 'undefined') { $('mapFallback').hidden = false; return; }
  map = L.map('map').setView([44.003, -70.06], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  map.on('click', (e) => {
    pendingPin = { lat: e.latlng.lat, lng: e.latlng.lng };
    $('pinStatus').textContent = `Pin placed near ${pendingPin.lat.toFixed(4)}, ${pendingPin.lng.toFixed(4)} — approximate, not a house address.`;
  });
}

function renderMap() {
  if (!map) return;
  markers.forEach((m) => m.remove()); markers = [];
  for (const cat of visibleCats()) {
    const icon = L.divIcon({ className: '', html: `<div class="pin ${pinClass(cat)}"></div>`, iconSize: [28, 28] });
    const m = L.marker([cat.lat, cat.lng], { icon }).addTo(map);
    m.on('click', () => openCat(cat.id));
    markers.push(m);
  }
}

function visibleCats() {
  return cats.filter((cat) => {
    if (filter === 'outdoor' && cat.status !== 'outdoor') return false;
    if (filter === 'indoor' && cat.status !== 'indoor') return false;
    if (filter === 'spotted' && !cat.spotted) return false;
    if (search) {
      const hay = `${cat.name} ${cat.owner} ${cat.homeArea} ${cat.description}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function render() {
  const outdoor = cats.filter((c) => c.status === 'outdoor').length;
  const indoor = cats.filter((c) => c.status === 'indoor').length;
  const spotted = cats.filter((c) => c.spotted).length;
  $('counts').textContent = `${cats.length} cats · ${outdoor} Outdoor OK · ${indoor} Indoor Only · ${spotted} Spotted Outside`;
  const spottedCats = cats.filter((c) => c.spotted);
  $('alertBanner').hidden = !spottedCats.length;
  if (spottedCats.length) $('alertBanner').textContent = `⚠️ Spotted outside: ${spottedCats.map((c) => c.name).join(', ')} — tap a cat to see the latest sighting and message the owner.`;
  $('catList').innerHTML = visibleCats().map((cat) => `
    <article class="cat">
      <div class="photo">${cat.photoUrl ? `<img src="${cat.photoUrl}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px" onerror="this.remove()">` : cat.photo}</div>
      <h3>${escapeHtml(cat.name)} ${cat.isExample ? '<span class="small">(example)</span>' : ''}</h3>
      <p><span class="badge ${cat.spotted ? 'spotted' : cat.status}">${statusLabel(cat)}</span> · ${escapeHtml(cat.homeArea || '')}</p>
      <p>${escapeHtml(cat.description || '')}</p>
      <p class="small">Collar/ID: ${escapeHtml(cat.collar || '—')} · Owner: ${escapeHtml(cat.owner)}</p>
      <button onclick="openCat('${cat.id}')">View &amp; message</button>
      ${cat.status === 'indoor' ? `<button onclick="openSpotted('${cat.id}')">I spotted this cat</button>` : ''}
    </article>`).join('') || '<p>No cats match this filter yet.</p>';
  $('sightingFeed').innerHTML = sightings.slice(0, 20).map((s) => `
    <div class="cat"><strong>${escapeHtml(s.catName)}</strong> — ${escapeHtml(s.location)}<br>${escapeHtml(s.note || '')}<br><span class="small">Reported by ${escapeHtml(s.reporter)} · ${new Date(s.createdAt).toLocaleString()}</span></div>`).join('') || '<p>No sightings yet.</p>';
  renderMap();
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

window.openCat = function (id) {
  const cat = cats.find((c) => c.id === id); if (!cat) return;
  $('modalBody').innerHTML = `
    <h2>${escapeHtml(cat.name)} ${cat.isExample ? '<span class="small">(example)</span>' : ''}</h2>
    <p><span class="badge ${cat.spotted ? 'spotted' : cat.status}">${statusLabel(cat)}</span></p>
    <p>${escapeHtml(cat.description || '')}</p>
    <p>Home area: ${escapeHtml(cat.homeArea || '')} (approximate — never a house number)</p>
    <p>Collar / ID: ${escapeHtml(cat.collar || '—')}</p>
    <p>Owner: ${escapeHtml(cat.owner)}</p>
    <h3>Messages to the owner</h3>
    <div>${(cat.messages || []).map((m) => `<p><strong>${escapeHtml(m.author)}:</strong> ${escapeHtml(m.text)}</p>`).join('') || '<p>No messages yet.</p>'}</div>
    <label>Your message <input id="msgText" placeholder="Hi, I saw your cat near…"></label>
    <button onclick="sendMessage('${cat.id}')">Send message</button>
    ${cat.status === 'indoor' ? `<button onclick="openSpotted('${cat.id}')">I spotted this cat</button>` : ''}
    <p id="modalError" class="error"></p>`;
  $('modal').hidden = false;
};

window.openSpotted = function (id) {
  const cat = cats.find((c) => c.id === id); if (!cat) return;
  $('modalBody').innerHTML = `
    <h2>Spotted ${escapeHtml(cat.name)} outside?</h2>
    <p>${escapeHtml(cat.name)} is marked Indoor Only. Your sighting will alert the owner, appear in the sightings feed, and show on the map as Spotted Outside.</p>
    <label>Where did you see them? * <input id="spotLocation" placeholder="e.g. Near Main St & School St"></label>
    <label>Note <input id="spotNote" placeholder="e.g. Heading toward the park, seemed scared"></label>
    <button onclick="sendSighting('${cat.id}')">Send sighting alert</button>
    <p id="modalError" class="error"></p>`;
  $('modal').hidden = false;
};

window.sendMessage = async function (id) {
  try { await api(`/api/cats/${id}/messages`, { method: 'POST', body: JSON.stringify({ author: displayName, text: $('msgText').value }) }); await refresh(); openCat(id); }
  catch (e) { $('modalError').textContent = e.message; }
};
window.sendSighting = async function (id) {
  try { await api(`/api/cats/${id}/sightings`, { method: 'POST', body: JSON.stringify({ location: $('spotLocation').value, note: $('spotNote').value, reporter: displayName }) }); await refresh(); openCat(id); }
  catch (e) { $('modalError').textContent = e.message; }
};

async function refresh() {
  cats = await api('/api/cats');
  sightings = await api('/api/sightings');
  render();
}

$('closeModal').onclick = () => { $('modal').hidden = true; };
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); filter = b.dataset.filter; render();
});
$('search').oninput = (e) => { search = e.target.value.trim().toLowerCase(); render(); };
$('photoChoices').innerHTML = PHOTOS.map((p, i) => `<button type="button" class="photo-btn ${i === 0 ? 'selected' : ''}" data-photo="${p}">${p}</button>`).join('');
document.querySelectorAll('.photo-btn').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.photo-btn').forEach((x) => x.classList.remove('selected'));
  b.classList.add('selected'); chosenPhoto = b.dataset.photo;
});
$('addCat').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api('/api/cats', { method: 'POST', body: JSON.stringify({
      name: f.get('name'), owner: displayName || f.get('owner'), description: f.get('description'),
      collar: f.get('collar'), homeArea: f.get('homeArea'), status: f.get('status'),
      photo: chosenPhoto, photoUrl: f.get('photoUrl'),
      lat: pendingPin?.lat, lng: pendingPin?.lng,
    }) });
    $('addError').textContent = ''; e.target.reset(); pendingPin = null;
    $('pinStatus').textContent = 'No spot picked yet.';
    await refresh();
  } catch (err) { $('addError').textContent = err.message; }
};
$('clearExamples').onclick = async () => {
  if (!confirm('Clear the example cats? Cats neighbors added will stay.')) return;
  await api('/api/clear-examples', { method: 'POST', body: '{}' });
  await refresh();
};
$('joinBtn').onclick = async () => {
  displayName = $('displayName').value.trim(); code = $('joinCode').value.trim();
  if (!displayName || !code) { $('joinError').textContent = 'Please enter both a display name and the neighborhood code.'; return; }
  try {
    await fetch('/api/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).then(async (r) => { if (!r.ok) throw new Error('Wrong neighborhood code.'); });
    sessionStorage.setItem('nc-code', code); sessionStorage.setItem('nc-name', displayName);
    $('join').hidden = true; $('app').hidden = false; initMap(); await refresh();
  } catch (err) { $('joinError').textContent = err.message; }
};
// Auto-join if a code/name were already entered this session.
if (code && displayName) { $('displayName').value = displayName; $('joinCode').value = code; $('joinBtn').click(); }
