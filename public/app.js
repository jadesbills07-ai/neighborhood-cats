// Neighborhood Cats — shared frontend.
// Cat data lives on the SERVER (GET/POST /api/cats). The browser only
// remembers the visitor's display name and ZIP/county/town scope plus a
// GPS-confirmed flag — never cats, never GPS coordinates as a home
// location, and never another town's cats. There is NO neighborhood
// code and NO View All Maine: you are locked to your own town, and
// Change town forces a fresh ZIP + GPS confirmation.
let cats = [], sightings = [], filter = 'all', search = '';
let displayName = sessionStorage.getItem('nc-name') || '';
let zip = sessionStorage.getItem('nc-zip') || '';
let selectedCounty = sessionStorage.getItem('nc-county') || '';
let selectedTown = sessionStorage.getItem('nc-town') || '';
let gpsConfirmed = sessionStorage.getItem('nc-gps') === '1';
const COUNTIES = ['Androscoggin', 'Aroostook', 'Cumberland', 'Franklin', 'Hancock', 'Kennebec', 'Knox', 'Lincoln', 'Oxford', 'Penobscot', 'Piscataquis', 'Sagadahoc', 'Somerset', 'Waldo', 'Washington', 'York'];
function catCounty(cat) { return COUNTIES.find((c) => c.toLowerCase() === String(cat.county || '').trim().toLowerCase()) || 'Androscoggin'; }
function catTown(cat) { return String(cat.town || '').trim() || 'Lisbon Falls'; }
function isMaineZip(v) { const z = String(v || '').trim(); return /^\d{5}$/.test(z) && Number(z) >= 3901 && Number(z) <= 4992; }
// Rough Maine bounding box for the GPS confirmation flag ONLY. This is
// not a ZIP-boundary check and never blocks a join: a neighbor at a
// town edge is not rejected for a GPS mismatch.
function inMaine(lat, lng) { return lat >= 43.0 && lat <= 47.5 && lng >= -71.2 && lng <= -66.9; }
let map = null, markers = [], pendingPin = null, chosenPhoto = '🐈';
let uploadedPhotoData = null;
let spotGps = null; // this sighting's GPS pin only — never a home location
let currentAlert = null; // {catId, catName, sightingId, location, lat, lng}
let refreshTimer = null;

// ---- Loud sighting alert (sound / vibration / notification) ----
function loudEnabled() { return sessionStorage.getItem('nc-loud') !== '0'; }
function seenAlerts() { try { return new Set(JSON.parse(sessionStorage.getItem('nc-seen-alerts') || '[]')); } catch (e) { return new Set(); } }
function markAlertSeen(id) { const s = seenAlerts(); s.add(id); sessionStorage.setItem('nc-seen-alerts', JSON.stringify([...s])); }
function playAlertSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const gain = ctx.createGain(); gain.gain.value = 0.15; gain.connect(ctx.destination);
    // Two-tone siren, 3 repeats — loud and hard to miss, no audio file needed.
    let t = ctx.currentTime;
    for (let r = 0; r < 3; r++) {
      for (const freq of [880, 660, 880, 660]) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
        o.connect(gain); o.start(t); o.stop(t + 0.28); t += 0.32;
      }
      t += 0.4;
    }
    return true;
  } catch (e) { return false; }
}
function fireLoudAlert(cat, alert) {
  currentAlert = { catId: cat.id, catName: cat.name, sightingId: alert.sightingId, location: alert.location, lat: alert.lat, lng: alert.lng, createdAt: alert.createdAt };
  const banner = $('loudAlert');
  if (banner) {
    $('loudAlertText').textContent = `🚨 URGENT: ${cat.name} (Indoor Only) was spotted outside near ${alert.location} — ${new Date(alert.createdAt).toLocaleString()}${alert.lat != null ? ` — GPS pin ${Number(alert.lat).toFixed(5)}, ${Number(alert.lng).toFixed(5)}` : ''}`;
    $('loudAlertNote').textContent = loudEnabled() ? 'This banner stays until you dismiss it.' : 'Loud alerts are OFF, so there is no sound, vibration, or browser notification for this alert. Turn them on to hear future alerts.';
    banner.hidden = false;
  }
  if (loudEnabled()) {
    const sounded = playAlertSound();
    if (!sounded && $('loudAlertNote')) $('loudAlertNote').textContent = 'Sound could not play automatically (browsers block sound until you tap something). Tap “Test alert sound” once, then future alerts can play.';
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 800]); } catch (e) {}
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`🚨 ${cat.name} spotted outside!`, { body: `Indoor Only cat spotted near ${alert.location}. Tap to check now.` });
      }
    } catch (e) {}
  }
}
function checkUnseenAlerts() {
  const seen = seenAlerts();
  // Newest first; show the first unseen alert. Dismissing it reveals
  // the next unseen one on the following refresh — none are skipped.
  const candidates = [];
  for (const cat of cats) {
    if (cat.lastSightingAlert && !seen.has(cat.lastSightingAlert.sightingId)) candidates.push([cat, cat.lastSightingAlert]);
  }
  candidates.sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt));
  if (candidates.length && (!currentAlert || currentAlert.sightingId !== candidates[0][1].sightingId)) {
    fireLoudAlert(candidates[0][0], candidates[0][1]);
  }
}
window.dismissLoudAlert = function () {
  if (currentAlert) markAlertSeen(currentAlert.sightingId);
  currentAlert = null;
  if ($('loudAlert')) $('loudAlert').hidden = true;
  refresh().catch(() => {});
};
window.checkNowAlert = function () {
  const alert = currentAlert;
  if (!alert) return;
  if (map && alert.lat != null && alert.lng != null) map.setView([alert.lat, alert.lng], 16);
  openCat(alert.catId);
};
window.testAlertSound = function () {
  const ok = playAlertSound();
  $('alertSettingsNote').textContent = ok ? 'Test sound played. If you heard it, future loud alerts can play on this device (with sound on).' : 'Could not play sound on this browser. The flashing banner and vibration (Android) still work.';
};
window.enableNotifications = async function () {
  if (!('Notification' in window)) { $('alertSettingsNote').textContent = 'This browser does not support browser notifications.'; return; }
  try {
    const p = await Notification.requestPermission();
    $('alertSettingsNote').textContent = p === 'granted' ? 'Browser notifications ON — sightings can now reach you when the tab is in the background.' : 'Browser notifications not granted. The in-app flashing banner still works while the app is open.';
  } catch (e) { $('alertSettingsNote').textContent = 'Could not ask for notification permission on this browser.'; }
};

// Photo precedence: uploaded photo > photo URL > emoji fallback.
function photoHtml(cat, size) {
  const s = size || 56;
  if (cat.photoData && String(cat.photoData).startsWith('data:image/')) return `<img src="${escapeHtml(cat.photoData)}" alt="" style="width:${s}px;height:${s}px;object-fit:cover;border-radius:8px">`;
  if (cat.photoUrl) return `<img src="${escapeHtml(cat.photoUrl)}" alt="" style="width:${s}px;height:${s}px;object-fit:cover;border-radius:8px" onerror="this.remove()">`;
  return escapeHtml(cat.photo || '🐈');
}
function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image.'));
      img.onload = () => {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
const PHOTOS = ['🐈', '🐈‍⬛', '🐱', '😺', '😸', '🐾'];

const $ = (id) => document.getElementById(id);
const headers = () => ({ 'Content-Type': 'application/json' });

function pinClass(cat) {
  if (cat.emergencyOn) return 'pin-emergency';
  return cat.spotted ? 'pin-spotted' : (cat.status === 'outdoor' ? 'pin-outdoor' : 'pin-indoor');
}
function statusLabel(cat) {
  if (cat.emergencyOn) return '🚨 LOST / Emergency';
  if (cat.spotted) return '⚠️ Spotted Outside';
  return cat.status === 'outdoor' ? '✅ Outdoor OK' : '🏠 Indoor Only';
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function scopeQuery() {
  return `county=${encodeURIComponent(selectedCounty)}&town=${encodeURIComponent(selectedTown)}&zip=${encodeURIComponent(zip)}`;
}

function initMap() {
  if (typeof L === 'undefined') { $('mapFallback').hidden = false; return; }
  if (map) { map.remove(); map = null; }
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
    // Exact sighting pins ONLY — home pins stay approximate by design.
    for (const s of (cat.sightings || [])) {
      if (s.lat != null && s.lng != null) {
        const si = L.divIcon({ className: '', html: `<div class="pin pin-sighting" title="Sighting pin"></div>`, iconSize: [22, 22] });
        const sm = L.marker([s.lat, s.lng], { icon: si }).addTo(map);
        sm.on('click', () => openCat(cat.id));
        markers.push(sm);
      }
    }
  }
}

function visibleCats() {
  // Server already scopes to this town; client only applies tabs/search,
  // then sorts Lost/Emergency cats to the top.
  const list = cats.filter((cat) => {
    if (filter === 'outdoor' && cat.status !== 'outdoor') return false;
    if (filter === 'indoor' && cat.status !== 'indoor') return false;
    if (filter === 'spotted' && !cat.spotted) return false;
    if (search) {
      const hay = `${cat.name} ${cat.owner} ${cat.homeArea} ${cat.description}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  list.sort((a, b) => Number(!!b.emergencyOn) - Number(!!a.emergencyOn));
  return list;
}

function render() {
  const el = $('scopeLabel');
  if (el) el.textContent = (selectedCounty && selectedTown) ? `Showing: ${selectedCounty} / ${selectedTown} (${zip}) · GPS: ${gpsConfirmed ? 'confirmed ✓' : 'unverified (ZIP only)'}` : 'Pick a county and town to see local cats.';
  const outdoor = cats.filter((c) => c.status === 'outdoor').length;
  const indoor = cats.filter((c) => c.status === 'indoor').length;
  const spotted = cats.filter((c) => c.spotted).length;
  $('counts').textContent = `${cats.length} cats in your town · ${outdoor} Outdoor OK · ${indoor} Indoor Only · ${spotted} Spotted Outside`;
  const emergencyCats = cats.filter((c) => c.emergencyOn);
  $('emergencyBanner').hidden = !emergencyCats.length;
  if (emergencyCats.length) $('emergencyBanner').textContent = `🚨 LOST / EMERGENCY: ${emergencyCats.map((c) => c.name).join(', ')} — tap a cat to see the emergency details the owner chose to share.`;
  const spottedCats = cats.filter((c) => c.spotted);
  $('alertBanner').hidden = !spottedCats.length;
  if (spottedCats.length) $('alertBanner').textContent = `⚠️ Spotted outside: ${spottedCats.map((c) => c.name).join(', ')} — tap a cat to see the latest sighting and message the owner.`;
  $('catList').innerHTML = visibleCats().map((cat) => `
    <article class="cat ${cat.emergencyOn ? 'cat-emergency' : ''}">
      <div class="photo">${photoHtml(cat, 56)}</div>
      ${cat.emergencyOn ? '<p><strong>🚨 LOST / EMERGENCY — details below are shown because the owner marked this cat lost.</strong></p>' : ''}
      <h3>${escapeHtml(cat.name)} ${cat.isExample ? '<span class="small">(example)</span>' : ''}</h3>
      <p><span class="badge ${cat.emergencyOn ? 'spotted' : (cat.spotted ? 'spotted' : cat.status)}">${statusLabel(cat)}</span> · ${escapeHtml(catCounty(cat))} / ${escapeHtml(catTown(cat))} · ${escapeHtml(cat.homeArea || '')}</p>
      <p>${escapeHtml(cat.description || '')}</p>
      <p class="small">Collar/ID: ${escapeHtml(cat.collar || '—')} · Owner: ${escapeHtml(cat.owner)}</p>
      <button onclick="openCat('${cat.id}')">View &amp; message</button>
      ${cat.status === 'indoor' ? `<button onclick="openSpotted('${cat.id}')">I spotted this cat</button>` : ''}
    </article>`).join('') || '<p>No cats match this filter yet.</p>';
  $('sightingFeed').innerHTML = sightings.slice(0, 20).map((s) => `
    <div class="cat"><strong>${escapeHtml(s.catName)}</strong> — ${escapeHtml(s.location)}${s.lat != null ? `<br><span class="small">📍 Exact GPS pin: ${Number(s.lat).toFixed(5)}, ${Number(s.lng).toFixed(5)} (where the spotter was standing)</span>` : ''}<br>${escapeHtml(s.note || '')}<br><span class="small">Reported by ${escapeHtml(s.reporter)} · ${new Date(s.createdAt).toLocaleString()}</span></div>`).join('') || '<p>No sightings yet.</p>';
  renderMap();
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function emergencyCardHtml(cat) {
  if (cat.emergencyOn) {
    const d = cat.emergencyDetails || {};
    const rows = [];
    if (d.address) rows.push(`<p><strong>Exact address (owner shared in emergency):</strong> ${escapeHtml(d.address)}</p>`);
    if (d.contact) rows.push(`<p><strong>Best contact:</strong> ${escapeHtml(d.contact)}</p>`);
    if (d.vet) rows.push(`<p><strong>Vet:</strong> ${escapeHtml(d.vet)}</p>`);
    if (d.medical) rows.push(`<p><strong>Medical notes:</strong> ${escapeHtml(d.medical)}</p>`);
    if (d.notes) rows.push(`<p><strong>Finder notes:</strong> ${escapeHtml(d.notes)}</p>`);
    return `<div class="card emergency-card"><h3>🚨 LOST / Emergency details</h3>${rows.join('') || '<p>The owner marked this cat lost but did not fill in emergency details.</p>'}</div>`;
  }
  if (cat.alwaysAddress) return `<div class="card"><p><strong>Exact address:</strong> ${escapeHtml(cat.alwaysAddress)} <span class="small">(the owner chose “Always show my exact address”)</span></p></div>`;
  return `<p class="small">Exact address and contact details are hidden in normal mode. They only appear here if the owner marks this cat Lost / Emergency (or ticked “Always show my exact address” for the address only).</p>`;
}

window.openCat = function (id) {
  const cat = cats.find((c) => c.id === id); if (!cat) return;
  const sightHtml = (cat.sightings || []).map((s) => `<p><strong>${escapeHtml(s.location)}</strong>${s.lat != null ? ` — 📍 exact GPS pin ${Number(s.lat).toFixed(5)}, ${Number(s.lng).toFixed(5)}` : ''}<br>${escapeHtml(s.note || '')}<br><span class="small">Reported by ${escapeHtml(s.reporter)} · ${new Date(s.createdAt).toLocaleString()}</span></p>`).join('') || '<p>No sightings yet.</p>';
  $('modalBody').innerHTML = `
    <div class="photo">${photoHtml(cat, 120)}</div>
    <h2>${escapeHtml(cat.name)} ${cat.isExample ? '<span class="small">(example)</span>' : ''}</h2>
    <p><span class="badge ${cat.emergencyOn ? 'spotted' : (cat.spotted ? 'spotted' : cat.status)}">${statusLabel(cat)}</span></p>
    <p>${escapeHtml(cat.description || '')}</p>
    <p>County / town: ${escapeHtml(catCounty(cat))} / ${escapeHtml(catTown(cat))}</p>
    <p>Home area: ${escapeHtml(cat.homeArea || '')} (approximate — never a house number)</p>
    <p>Collar / ID: ${escapeHtml(cat.collar || '—')}</p>
    <p>Owner: ${escapeHtml(cat.owner)}</p>
    ${emergencyCardHtml(cat)}
    <p><button onclick="toggleEmergency('${cat.id}', ${cat.emergencyOn ? 'false' : 'true'})">${cat.emergencyOn ? 'Emergency OFF — cat found / safe' : 'Mark as Lost / Emergency'}</button></p>
    <p class="small">${cat.hasPin ? 'This cat has an owner PIN — you will be asked for it to turn emergency mode on or off.' : 'No owner PIN was set for this cat, so anyone in town could toggle emergency mode. The owner should set a PIN when adding the cat.'}</p>
    <h3>Sightings</h3><div>${sightHtml}</div>
    <h3>Messages to the owner</h3>
    <div>${(cat.messages || []).map((m) => `<p><strong>${escapeHtml(m.author)}:</strong> ${escapeHtml(m.text)}</p>`).join('') || '<p>No messages yet.</p>'}</div>
    <label>Your message <input id="msgText" placeholder="Hi, I saw your cat near…"></label>
    <button onclick="sendMessage('${cat.id}')">Send message</button>
    ${cat.status === 'indoor' ? `<button onclick="openSpotted('${cat.id}')">I spotted this cat</button>` : ''}
    <p id="modalError" class="error"></p>`;
  $('modal').hidden = false;
};

window.toggleEmergency = async function (id, turnOn) {
  const cat = cats.find((c) => c.id === id); if (!cat) return;
  let pin = '';
  if (turnOn) {
    if (!confirm('⚠️ Turning Emergency ON will show the emergency details the owner filled in (exact address, contact, vet, medical notes) to everyone in this town. Turn it on?')) return;
    if (!cat.hasPin && !confirm('No owner PIN was set for this cat, so anyone in town could toggle this. It is recommended the owner set a PIN first. Turn emergency ON anyway?')) return;
  }
  if (cat.hasPin) {
    pin = prompt(`Enter the owner PIN to turn emergency ${turnOn ? 'ON' : 'OFF'}:`) || '';
    if (!pin) return;
  } else if (!turnOn) {
    if (!confirm('Turn emergency OFF? The exact address and contact details will hide again.')) return;
  }
  try {
    await api(`/api/cats/${id}/emergency`, { method: 'POST', body: JSON.stringify({ emergency: turnOn, pin }) });
    await refresh(); openCat(id);
  } catch (e) { const el = $('modalError'); if (el) el.textContent = e.message; else alert(e.message); }
};

window.openSpotted = function (id) {
  const cat = cats.find((c) => c.id === id); if (!cat) return;
  spotGps = null;
  $('modalBody').innerHTML = `
    <h2>Spotted ${escapeHtml(cat.name)} outside?</h2>
    <p>${escapeHtml(cat.name)} is marked Indoor Only. Your sighting will alert the owner, appear in the sightings feed, and show on the map as Spotted Outside. <strong>It also triggers a loud urgent alert for everyone viewing this town</strong> — a flashing banner, alert sound (if loud alerts are on), vibration on Android, and a browser notification if the owner allowed notifications.</p>
    <label>Where did you see them? * <input id="spotLocation" placeholder="e.g. Near Main St & School St"></label>
    <p><button type="button" onclick="useSpotGps()">📍 Use my current location</button></p>
    <p id="spotGpsStatus" class="small">GPS pin is optional. If you use it, the exact spot where you are standing right now is saved with this sighting and shown as a pin. Home pins stay approximate — exact pins are only for sightings.</p>
    <label>Note <input id="spotNote" placeholder="e.g. Heading toward the park, seemed scared"></label>
    <button onclick="sendSighting('${cat.id}')">Send sighting alert</button>
    <p id="modalError" class="error"></p>`;
  $('modal').hidden = false;
};

window.useSpotGps = function () {
  const status = $('spotGpsStatus');
  if (!navigator.geolocation) { status.textContent = 'GPS is not available on this device — please type the location instead.'; return; }
  status.textContent = 'Getting your location…';
  navigator.geolocation.getCurrentPosition((pos) => {
    spotGps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const loc = $('spotLocation');
    if (loc && !loc.value.trim()) loc.value = `GPS pin ${spotGps.lat.toFixed(5)}, ${spotGps.lng.toFixed(5)}`;
    status.textContent = `✓ GPS pin set: ${spotGps.lat.toFixed(5)}, ${spotGps.lng.toFixed(5)} — this exact spot will be saved with the sighting.`;
  }, () => {
    spotGps = null;
    status.textContent = 'GPS was denied or unavailable — please type the location instead.';
  }, { enableHighAccuracy: true, timeout: 10000 });
};

window.sendMessage = async function (id) {
  try { await api(`/api/cats/${id}/messages`, { method: 'POST', body: JSON.stringify({ author: displayName, text: $('msgText').value }) }); await refresh(); openCat(id); }
  catch (e) { $('modalError').textContent = e.message; }
};
window.sendSighting = async function (id) {
  try {
    const s = await api(`/api/cats/${id}/sightings`, { method: 'POST', body: JSON.stringify({ location: $('spotLocation').value, note: $('spotNote').value, reporter: displayName, lat: spotGps?.lat, lng: spotGps?.lng }) });
    // Don't loud-alert the spotter for their own report on the next refresh.
    if (s && s.id) markAlertSeen(s.id);
    spotGps = null;
    await refresh(); openCat(id);
  } catch (e) { $('modalError').textContent = e.message; }
};

async function refresh() {
  cats = await api(`/api/cats?${scopeQuery()}`);
  sightings = await api(`/api/sightings?${scopeQuery()}`);
  render();
  checkUnseenAlerts();
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
function clearUploadedPhoto() {
  uploadedPhotoData = null;
  $('photoUpload').value = '';
  $('photoPreview').hidden = true;
  $('photoPreviewImg').src = '';
  $('photoUploadError').textContent = '';
}
$('photoUpload').onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
    uploadedPhotoData = await resizeImageFile(file);
    if (uploadedPhotoData.length > 1500000) throw new Error('That photo is still too large after resizing — please try a smaller photo.');
    $('photoPreviewImg').src = uploadedPhotoData;
    $('photoPreview').hidden = false;
    $('photoUploadError').textContent = '';
  } catch (err) {
    clearUploadedPhoto();
    $('photoUploadError').textContent = err.message;
  }
};
$('photoRemove').onclick = clearUploadedPhoto;
$('addCat').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const pin = String(f.get('ownerPin') || '').trim();
  if (pin && !/^\d{4,6}$/.test(pin)) { $('addError').textContent = 'Owner PIN must be 4–6 digits, or left blank.'; return; }
  try {
    await api('/api/cats', { method: 'POST', body: JSON.stringify({
      name: f.get('name'), owner: displayName || f.get('owner'), description: f.get('description'),
      collar: f.get('collar'), homeArea: f.get('homeArea'), status: f.get('status'),
      county: f.get('county') || selectedCounty, town: f.get('town') || selectedTown, zip: zip,
      photo: chosenPhoto, photoUrl: f.get('photoUrl'), photoData: uploadedPhotoData,
      lat: pendingPin?.lat, lng: pendingPin?.lng,
      emergencyAddress: f.get('emergencyAddress'), emergencyContact: f.get('emergencyContact'),
      emergencyVet: f.get('emergencyVet'), emergencyMedical: f.get('emergencyMedical'),
      emergencyNotes: f.get('emergencyNotes'), showAddressAlways: f.get('showAddressAlways') === 'on',
      ownerPin: pin,
    }) });
    $('addError').textContent = ''; e.target.reset(); clearUploadedPhoto(); pendingPin = null;
    $('pinStatus').textContent = 'No spot picked yet.';
    await refresh(); syncAddFormLocation();
  } catch (err) { $('addError').textContent = err.message; }
};
$('clearExamples').onclick = async () => {
  if (!confirm('Clear the example cats? Cats neighbors added will stay.')) return;
  await api('/api/clear-examples', { method: 'POST', body: '{}' });
  await refresh();
};
// Town suggestions come from the SERVER for the chosen county, so they
// work on the join screen before any cats are loaded.
async function fetchTownSuggestions(county, listEl) {
  if (!county || !listEl) return;
  try {
    const towns = await fetch(`/api/towns?county=${encodeURIComponent(county)}`).then((r) => r.json());
    if (Array.isArray(towns)) listEl.innerHTML = towns.map((t) => `<option value="${escapeHtml(t)}">`).join('');
  } catch (e) {}
}
function syncAddFormLocation() {
  const c = document.getElementById('addCounty'), t = document.getElementById('addTown');
  if (c && selectedCounty) c.value = selectedCounty;
  if (t && selectedTown) t.value = selectedTown;
}
$('joinCounty').onchange = () => { fetchTownSuggestions($('joinCounty').value, $('joinTownList')); };
$('addCounty').onchange = () => { fetchTownSuggestions($('addCounty').value, $('addTownList')); };
$('joinGpsBtn').onclick = () => {
  const status = $('joinGpsStatus');
  if (!navigator.geolocation) { status.textContent = 'GPS is not available on this device. You can still join with your ZIP only — it will be marked unverified.'; gpsConfirmed = false; return; }
  status.textContent = 'Getting your location…';
  navigator.geolocation.getCurrentPosition((pos) => {
    // Coordinates are checked in memory only and never stored.
    if (inMaine(pos.coords.latitude, pos.coords.longitude)) {
      gpsConfirmed = true;
      status.textContent = '✓ GPS confirmed — your device is in Maine. GPS is a confirmation flag only; it does not prove your exact ZIP boundary, and your coordinates are not stored.';
    } else {
      gpsConfirmed = false;
      status.textContent = 'GPS shows a location outside Maine. You can still join with your Maine ZIP — GPS does not block you, and this join will be marked unverified. Please double-check your ZIP.';
    }
  }, () => {
    gpsConfirmed = false;
    status.textContent = 'GPS was denied or unavailable. You can still join with your ZIP only, marked unverified. GPS confirmation improves accuracy, but it is not required.';
  }, { enableHighAccuracy: true, timeout: 10000 });
};
// Change town is NOT a free town switcher: it wipes the stored scope and
// forces a fresh join with a new ZIP and a new GPS confirmation.
$('changeScopeBtn').onclick = () => {
  sessionStorage.removeItem('nc-zip'); sessionStorage.removeItem('nc-county');
  sessionStorage.removeItem('nc-town'); sessionStorage.removeItem('nc-gps');
  zip = ''; selectedCounty = ''; selectedTown = ''; gpsConfirmed = false;
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  $('app').hidden = true; $('join').hidden = false;
  $('displayName').value = displayName;
  $('joinZip').value = ''; $('joinCounty').value = ''; $('joinTown').value = '';
  $('joinGpsStatus').textContent = 'Not confirmed yet. Tap “Confirm my location” to GPS-confirm, or join with your ZIP only (marked unverified).';
  $('joinError').textContent = '';
};
$('loudToggle').onchange = (e) => {
  sessionStorage.setItem('nc-loud', e.target.checked ? '1' : '0');
  $('alertSettingsNote').textContent = e.target.checked ? 'Loud alerts ON: sound, vibration (Android), and browser notifications (if allowed) will fire for new Indoor Only sightings.' : 'Loud alerts OFF: you will still see the flashing banner, but no sound, vibration, or browser notification.';
};
$('joinBtn').onclick = async () => {
  displayName = $('displayName').value.trim(); zip = $('joinZip').value.trim();
  selectedCounty = $('joinCounty').value; selectedTown = $('joinTown').value.trim();
  if (!displayName) { $('joinError').textContent = 'Please enter a display name.'; return; }
  if (!isMaineZip(zip)) { $('joinError').textContent = 'Please enter a valid 5-digit Maine ZIP code (Maine ZIPs run 03901–04992).'; return; }
  if (!selectedCounty) { $('joinError').textContent = 'Please pick a Maine county first.'; return; }
  if (!selectedTown) { $('joinError').textContent = 'Please pick a town — type it in if yours is not listed yet.'; return; }
  sessionStorage.setItem('nc-name', displayName); sessionStorage.setItem('nc-zip', zip);
  sessionStorage.setItem('nc-county', selectedCounty); sessionStorage.setItem('nc-town', selectedTown);
  sessionStorage.setItem('nc-gps', gpsConfirmed ? '1' : '0');
  $('join').hidden = true; $('app').hidden = false; initMap();
  if ($('loudToggle')) $('loudToggle').checked = loudEnabled();
  try { await refresh(); syncAddFormLocation(); fetchTownSuggestions(selectedCounty, $('addTownList')); } catch (err) { $('joinError').textContent = err.message; $('app').hidden = true; $('join').hidden = false; return; }
  // Poll every 30 seconds while the app is open, so a new sighting in
  // your town triggers the loud alert without a manual refresh.
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (!$('app').hidden) refresh().catch(() => {}); }, 30000);
};
// Auto-join if a full scope was already entered this session (ZIP +
// county + town). Change town wipes that scope, so it cannot auto-join
// into a new town without a fresh ZIP + GPS step.
if (displayName && zip && selectedCounty && selectedTown) {
  $('displayName').value = displayName; $('joinZip').value = zip;
  $('joinCounty').value = selectedCounty; $('joinTown').value = selectedTown;
  $('joinGpsStatus').textContent = gpsConfirmed ? '✓ GPS confirmed in a previous step this session.' : 'Joined with ZIP only (unverified). Tap “Confirm my location” to GPS-confirm.';
  $('joinBtn').click();
} else if (selectedCounty) {
  $('joinCounty').value = selectedCounty;
  if (selectedTown) $('joinTown').value = selectedTown;
}
