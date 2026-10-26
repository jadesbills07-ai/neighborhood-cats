// Where in the Whiskers? — shared frontend (formerly Neighborhood Cats).
// Repo and deployed URL are unchanged; only the display name changed.
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
const MAX_PHOTOS_PER_CAT = 5;
let uploadedPhotos = [];
// Google account state. Guests can browse a town read-only; adding
// cats, messaging, sightings, and Emergency Mode require sign-in.
let signedIn = false, googleConfigured = false, accountUser = null, myCats = [];
let setupGpsConfirmed = false, setupLookup = null;
async function refreshAuth() {
  try {
    const s = await api('/api/auth/status');
    signedIn = !!s.signedIn; googleConfigured = !!s.googleConfigured; accountUser = s.user || null;
  } catch (e) { signedIn = false; accountUser = null; }
  updateAuthUI();
  if (signedIn) { try { myCats = await api('/api/me/cats'); } catch (e) { myCats = []; } }
  return { signedIn, user: accountUser };
}
function updateAuthUI() {
  const status = signedIn
    ? (accountUser && accountUser.hasProfile ? `✓ Signed in with Google as ${accountUser.displayName} — ${accountUser.county} / ${accountUser.town} (${accountUser.zip}) · GPS: ${accountUser.gpsConfirmed ? 'confirmed ✓' : 'unverified (ZIP only)'}`
      : `✓ Signed in with Google as ${accountUser ? accountUser.displayName : ''} — please finish ZIP setup below so your town is set.`)
    : (googleConfigured ? 'Not signed in. Sign in with Google to add cats, message, report sightings, and use Emergency Mode. Guests can browse a town read-only.'
      : '⚠️ Google sign-in is not set up yet on this server (no Google credentials configured). You can still browse as a guest. See GOOGLE_SETUP.md for the owner setup steps.');
  const a = $('authStatus'); if (a) a.textContent = status;
  const p = $('profileAuthStatus'); if (p) p.textContent = status;
  const signInBtns = [$('googleSignInBtn'), $('profileGoogleSignInBtn')];
  signInBtns.forEach((b) => { if (b) b.closest('p, a') && (b.parentElement.hidden = signedIn); });
  // Sign-in buttons are <a><button> wrappers; hide the anchor when signed in.
  document.querySelectorAll('#googleSignInBtn, #profileGoogleSignInBtn').forEach((b) => { if (b.parentElement && b.parentElement.tagName === 'A') b.parentElement.hidden = signedIn; });
  const outBtns = [$('googleSignOutBtn'), $('profileGoogleSignOutBtn')];
  outBtns.forEach((b) => { if (b) b.hidden = !signedIn; });
  const setup = $('accountSetup');
  if (setup) setup.hidden = !(signedIn && accountUser && !accountUser.hasProfile);
  if (!googleConfigured) {
    document.querySelectorAll('#googleSignInBtn, #profileGoogleSignInBtn').forEach((b) => { b.disabled = true; });
  }
}
function signOut() { window.location.href = '/auth/logout'; }
async function enterWithAccount(user) {
  displayName = user.displayName || displayName; zip = user.zip; selectedCounty = user.county; selectedTown = user.town; gpsConfirmed = !!user.gpsConfirmed;
  sessionStorage.setItem('nc-name', displayName); sessionStorage.setItem('nc-zip', zip);
  sessionStorage.setItem('nc-county', selectedCounty); sessionStorage.setItem('nc-town', selectedTown);
  sessionStorage.setItem('nc-gps', gpsConfirmed ? '1' : '0');
  $('join').hidden = true; $('app').hidden = false; initMap();
  if ($('loudToggle')) $('loudToggle').checked = loudEnabled();
  try { await refresh(); syncAddFormLocation(); fetchTownSuggestions(selectedCounty, $('addTownList')); switchMainTab('alerts'); syncProfileForm(); } catch (e) {}
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (!$('app').hidden) refresh().catch(() => {}); }, 30000);
}
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
  switchMainTab('map');
  if (map && alert.lat != null && alert.lng != null) map.setView([alert.lat, alert.lng], 16);
  openCat(alert.catId);
};
// Jump from a Local Alerts entry to that cat on the Map tab, centering
// on its exact GPS sighting pin when one exists.
window.viewAlertOnMap = function (catId, lat, lng) {
  switchMainTab('map');
  if (map && lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    map.setView([Number(lat), Number(lng)], 16);
  }
  openCat(catId);
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

// Photo precedence: uploaded photos (first = main) > photo URL > emoji fallback.
// Legacy cats have only photoData (one photo); that is treated as a 1-photo gallery.
function catPhotos(cat) {
  if (Array.isArray(cat.photos) && cat.photos.length) return cat.photos.filter((p) => typeof p === 'string' && p.startsWith('data:image/'));
  if (cat.photoData && String(cat.photoData).startsWith('data:image/')) return [cat.photoData];
  return [];
}
function photoHtml(cat, size) {
  const s = size || 56;
  const photos = catPhotos(cat);
  if (photos.length) return `<img src="${escapeHtml(photos[0])}" alt="" style="width:${s}px;height:${s}px;object-fit:cover;border-radius:8px">`;
  if (cat.photoUrl) return `<img src="${escapeHtml(cat.photoUrl)}" alt="" style="width:${s}px;height:${s}px;object-fit:cover;border-radius:8px" onerror="this.remove()">`;
  return escapeHtml(cat.photo || '🐈');
}
function photoGalleryHtml(cat) {
  const photos = catPhotos(cat);
  if (!photos.length) return '';
  // Main image swaps when a thumbnail is tapped (this.src is the same
  // data URL, so no extra function or URL passing is needed).
  const thumbs = photos.map((p, i) => `<img src="${escapeHtml(p)}" alt="Photo ${i + 1} of ${photos.length}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid #e8d9bd" onclick="document.getElementById('catGalleryMainImg').src=this.src">`).join('');
  return `<div><img id="catGalleryMainImg" src="${escapeHtml(photos[0])}" alt="" style="width:100%;max-width:420px;max-height:420px;object-fit:cover;border-radius:12px"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${thumbs}</div><p class="small">${photos.length} photo${photos.length === 1 ? '' : 's'} — tap a thumbnail to view it larger. First photo is the main photo.</p></div>`;
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

const NO_PIN_TEXT = 'No pin placed yet — tap the map or use my current location, otherwise it will default to the town centre.';
const HOME_GPS_NOTE = 'This is your approximate home area — tap the map to move it if it is off, e.g. to the end of your road or nearest corner. Do NOT place it exactly on your house if you want to stay private.';
// Home-pin GPS: GPS only ever sets pendingPin in this browser; nothing
// is sent to the server until the user submits the Add Your Cat form.
// The button below re-places/re-centres it on demand. Sighting GPS
// pins stay exact and separate — exact pins are ONLY for sightings.
function placeHomePinFromGps() {
  const status = $('pinStatus');
  if (!navigator.geolocation) { if (status) status.textContent = 'GPS is not available on this device — please tap the map to place your pin instead.'; return; }
  if (status) status.textContent = 'Getting your location…';
  navigator.geolocation.getCurrentPosition((pos) => {
    pendingPin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (map) map.setView([pendingPin.lat, pendingPin.lng], 16);
    if (status) status.textContent = `GPS pin placed near ${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}. ${HOME_GPS_NOTE}`;
  }, () => {
    if (status) status.textContent = 'GPS was denied or unavailable — please tap the map to place your pin instead. Your pin will still default to the town centre if you submit without placing one.';
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function initMap() {
  if (typeof L === 'undefined') { $('mapFallback').hidden = false; return; }
  if (map) { map.remove(); map = null; }
  // Fallback centre first, so the map always renders even if GPS is
  // denied or unavailable. If the user grants location, the map is
  // then centred on their GPS location (in Maine) AND the home pin
  // defaults to that GPS location automatically — NOT to the town
  // centre, and NOT manual-tap-only. A phone GPS fix indoors can
  // still drift tens of metres, e.g. to the end of a road, which is
  // why the pin stays tap-to-move afterwards. If GPS is denied or
  // unavailable, no pin is auto-set: the user must tap the map (or
  // use the button later), and the no-pin warning stays visible.
  map = L.map('map').setView([44.003, -70.06], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  if (navigator.geolocation && !pendingPin) {
    navigator.geolocation.getCurrentPosition((pos) => {
      if (map && inMaine(pos.coords.latitude, pos.coords.longitude)) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 14);
        pendingPin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const status = $('pinStatus');
        if (status) status.textContent = `GPS pin placed near ${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}. ${HOME_GPS_NOTE}`;
      }
    }, () => {
      // Denied / unavailable: keep the fallback centre for viewing,
      // but do NOT auto-set a town-centre home pin. The no-pin
      // warning in the Add Your Cat form stays as the prompt.
    }, { enableHighAccuracy: true, timeout: 10000 });
  }
  map.on('click', (e) => {
    pendingPin = { lat: e.latlng.lat, lng: e.latlng.lng };
    $('pinStatus').textContent = `Pin placed near ${pendingPin.lat.toFixed(4)}, ${pendingPin.lng.toFixed(4)} — approximate, not a house address. Tap again to move it.`;
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
  renderAlerts();
  renderProfile();
  renderMap();
}

// ---- 3 main tabs: 1 Local Alerts, 2 Map, 3 My Profile ----
// Tab order lives in index.html (buttons + panels in the same order).
// switchMainTab is the only place that knows the tab names, so the
// order can be swapped later by moving the HTML blocks together.
let currentMainTab = 'alerts';
function switchMainTab(name) {
  if (!['alerts', 'map', 'profile'].includes(name)) return;
  currentMainTab = name;
  document.querySelectorAll('.main-tab-btn').forEach((b) => {
    const active = b.dataset.mainTab === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (name === 'profile') syncProfileForm();
  if (name === 'map' && map) {
    // Leaflet was initialised while the map panel was hidden; it needs
    // a resize once it becomes visible, or tiles render blank.
    setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 60);
  }
}
function goToAddCat() {
  // The single Add Your Cat form lives on the Map tab (one form, one
  // set of IDs — it is not duplicated on My Profile). From My Profile,
  // "Add another cat" jumps there and pre-fills owner + town.
  switchMainTab('map');
  // If no home pin exists yet (e.g. GPS was not available when the
  // map first loaded, or a previous cat was just submitted), try GPS
  // again as the automatic starting pin — the button and tap-to-move
  // remain available afterwards.
  if (!pendingPin) placeHomePinFromGps();
  const ownerInput = document.querySelector('#addCat [name="owner"]');
  if (ownerInput && displayName) ownerInput.value = displayName;
  syncAddFormLocation();
  const contact = document.querySelector('#addCat [name="emergencyContact"]');
  const savedContact = sessionStorage.getItem('nc-profile-contact') || '';
  if (contact && savedContact && !contact.value.trim()) contact.value = savedContact;
  const form = $('addCat');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function syncProfileForm() {
  const nameEl = $('profileName');
  if (nameEl && document.activeElement !== nameEl) nameEl.value = displayName || '';
  const contactEl = $('profileContact');
  if (contactEl && document.activeElement !== contactEl) contactEl.value = sessionStorage.getItem('nc-profile-contact') || '';
  const notesEl = $('profileNotes');
  if (notesEl && document.activeElement !== notesEl) notesEl.value = sessionStorage.getItem('nc-profile-notes') || '';
  renderProfile();
}
function renderAlerts() {
  const el = $('alertList');
  if (!el) return;
  const entries = [];
  // Lost / Emergency cats first — they are the most urgent alerts.
  for (const cat of cats.filter((c) => c.emergencyOn)) {
    entries.push({ kind: 'emergency', cat, createdAt: cat.createdAt, location: cat.homeArea || '', lat: cat.lat, lng: cat.lng, text: '🚨 LOST / Emergency — the owner marked this cat lost. Tap to see the emergency details the owner chose to share.' });
  }
  // Then every sighting, newest first. Sighting data comes from the
  // server (/api/sightings); nothing here is invented. Loud-alert
  // sightings (Indoor Only) are flagged with 🚨, others with 📍.
  const sortedSightings = [...sightings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const s of sortedSightings) {
    const cat = cats.find((c) => c.id === s.catId);
    entries.push({ kind: s.alert ? 'loud' : 'sighting', cat, sighting: s, createdAt: s.createdAt, location: s.location, lat: s.lat, lng: s.lng, text: s.note || '' });
  }
  if (!entries.length) {
    el.innerHTML = '<p class="paw-note">🐾 No alerts in your town yet. Good news — no indoor-only cats have been spotted outside, and no cats are in Lost / Emergency Mode.</p>';
    return;
  }
  el.innerHTML = entries.map((e) => {
    const cat = e.cat;
    const name = cat ? escapeHtml(cat.name) : escapeHtml(e.sighting?.catName || 'A cat');
    const gps = (e.lat != null && e.lng != null) ? `<br><span class="small">📍 Exact GPS pin: ${Number(e.lat).toFixed(5)}, ${Number(e.lng).toFixed(5)}${e.kind === 'loud' || e.kind === 'sighting' ? ' (where the spotter was standing)' : ''}</span>` : '';
    const when = e.createdAt ? `<br><span class="small">${new Date(e.createdAt).toLocaleString()}${e.sighting ? ` · Reported by ${escapeHtml(e.sighting.reporter)}` : ''}</span>` : '';
    const viewBtn = cat ? `<button onclick="viewAlertOnMap('${cat.id}', ${e.lat != null ? Number(e.lat) : 'null'}, ${e.lng != null ? Number(e.lng) : 'null'})">View on map</button> <button onclick="openCat('${cat.id}')">View cat</button>` : '';
    const heading = e.kind === 'emergency' ? `🚨 LOST / EMERGENCY: ${name}` : (e.kind === 'loud' ? `🚨 Spotted outside (loud alert): ${name}` : `📍 Sighting: ${name}`);
    return `<article class="cat ${e.kind === 'emergency' ? 'cat-emergency' : ''}"><h3>${heading}</h3><p>${escapeHtml(e.location)}${gps}${when}</p>${e.text ? `<p>${escapeHtml(e.text)}</p>` : ''}<p>${viewBtn}</p></article>`;
  }).join('');
}
function renderProfile() {
  const scopeEl = $('profileScope');
  if (scopeEl) scopeEl.textContent = (selectedCounty && selectedTown) ? `Display name: ${displayName || '—'} · ZIP: ${zip} · ${selectedCounty} / ${selectedTown}` : 'Join a town first to see your profile.';
  const gpsEl = $('profileGps');
  if (gpsEl) gpsEl.textContent = `GPS join confirmation: ${gpsConfirmed ? 'confirmed ✓' : 'unverified (ZIP only) — tap “Confirm my location” on the join screen, or re-join, to confirm.'}`;
  const listEl = $('myCatList');
  if (!listEl) return;
  // Signed-in users: My Cats = cats owned by their account (ownerId),
  // fetched from /api/me/cats. Guests / legacy cats with no ownerId
  // fall back to display-name matching, which is a convenience list,
  // not proof of ownership. The owner PIN still governs Emergency
  // Mode as an extra check where one was set.
  const mine = signedIn ? myCats.filter((cat) => String(catTown(cat)).toLowerCase() === String(selectedTown || '').trim().toLowerCase())
    : cats.filter((cat) => String(cat.owner || '').trim().toLowerCase() === String(displayName || '').trim().toLowerCase() && displayName);
  if (!mine.length) {
    listEl.innerHTML = '<p class="paw-note">🐾 You have not added a cat yet (with this display name, in this town). Tap “Add another cat” above — you can add as many as you like, one at a time.</p>';
    return;
  }
  listEl.innerHTML = mine.map((cat) => `
    <article class="cat ${cat.emergencyOn ? 'cat-emergency' : ''}">
      <div class="photo">${photoHtml(cat, 56)}</div>
      <h3>${escapeHtml(cat.name)}</h3>
      <p><span class="badge ${cat.emergencyOn ? 'spotted' : (cat.spotted ? 'spotted' : cat.status)}">${statusLabel(cat)}</span> · ${escapeHtml(cat.homeArea || '')}</p>
      <p><button onclick="openCat('${cat.id}')">View &amp; message</button> <button onclick="toggleEmergency('${cat.id}', ${cat.emergencyOn ? 'false' : 'true'})">${cat.emergencyOn ? 'Emergency OFF — cat found / safe' : 'Mark as Lost / Emergency'}</button></p>
      <p class="small">${cat.hasPin ? 'Owner PIN required to toggle Emergency Mode.' : 'No owner PIN was set for this cat — anyone in town could toggle emergency mode. Add a PIN when you add a cat, if you can.'}</p>
    </article>`).join('');
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
  const gallery = photoGalleryHtml(cat);
  $('modalBody').innerHTML = `
    ${gallery || `<div class="photo">${photoHtml(cat, 120)}</div>`}
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
  if (!signedIn) { alert('Please sign in with Google to use Emergency Mode. Guests can browse only.'); switchMainTab('profile'); return; }
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
  if (!signedIn) { $('modalError').textContent = 'Please sign in with Google to message an owner. Guests can browse only.'; return; }
  try { await api(`/api/cats/${id}/messages`, { method: 'POST', body: JSON.stringify({ text: $('msgText').value }) }); await refresh(); openCat(id); }
  catch (e) { $('modalError').textContent = e.message; }
};
window.sendSighting = async function (id) {
  if (!signedIn) { $('modalError').textContent = 'Please sign in with Google to report a sighting. Guests can browse only.'; return; }
  try {
    const s = await api(`/api/cats/${id}/sightings`, { method: 'POST', body: JSON.stringify({ location: $('spotLocation').value, note: $('spotNote').value, lat: spotGps?.lat, lng: spotGps?.lng }) });
    // Don't loud-alert the spotter for their own report on the next refresh.
    if (s && s.id) markAlertSeen(s.id);
    spotGps = null;
    await refresh(); openCat(id);
  } catch (e) { $('modalError').textContent = e.message; }
};

async function refresh() {
  cats = await api(`/api/cats?${scopeQuery()}`);
  sightings = await api(`/api/sightings?${scopeQuery()}`);
  if (signedIn) { try { myCats = await api('/api/me/cats'); } catch (e) {} }
  render();
  checkUnseenAlerts();
}

$('closeModal').onclick = () => { $('modal').hidden = true; };
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); filter = b.dataset.filter; render();
});
// Main 3-tab navigation (separate class from the cat-filter tabs above).
document.querySelectorAll('.main-tab-btn').forEach((b) => b.onclick = () => switchMainTab(b.dataset.mainTab));
$('addAnotherCatBtn').onclick = goToAddCat;
$('addAnotherCatBtn2').onclick = goToAddCat;
$('profileChangeScopeBtn').onclick = () => $('changeScopeBtn').click();
// Profile is session/browser-stored for this device only — never sent
// to the server, never shown publicly. It only pre-fills the Add Cat
// form's emergency contact (if empty) and matches "My Cats" by display
// name. A different device or cleared browser data starts fresh.
$('profileForm').onsubmit = (e) => {
  e.preventDefault();
  const newName = $('profileName').value.trim();
  if (!newName) { $('profileSaved').textContent = 'Please enter a display name.'; return; }
  displayName = newName;
  sessionStorage.setItem('nc-name', displayName);
  sessionStorage.setItem('nc-profile-contact', $('profileContact').value.trim());
  sessionStorage.setItem('nc-profile-notes', $('profileNotes').value.trim());
  const ownerInput = document.querySelector('#addCat [name="owner"]');
  if (ownerInput) ownerInput.value = displayName;
  $('profileSaved').textContent = '✓ Profile saved on this device. Your cats in this town are still shared on the server — only these profile details are device-local.';
  renderProfile();
};
$('search').oninput = (e) => { search = e.target.value.trim().toLowerCase(); render(); };
$('photoChoices').innerHTML = PHOTOS.map((p, i) => `<button type="button" class="photo-btn ${i === 0 ? 'selected' : ''}" data-photo="${p}">${p}</button>`).join('');
document.querySelectorAll('.photo-btn').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.photo-btn').forEach((x) => x.classList.remove('selected'));
  b.classList.add('selected'); chosenPhoto = b.dataset.photo;
});
function renderPhotoPreview() {
  const gallery = $('photoPreviewGallery');
  if (!gallery) return;
  gallery.innerHTML = uploadedPhotos.map((p, i) => `<span style="display:inline-block;text-align:center"><img src="${escapeHtml(p)}" alt="Photo ${i + 1}" style="width:96px;height:96px;object-fit:cover;border-radius:8px"><br><button type="button" onclick="removeUploadedPhoto(${i})">Remove</button></span>`).join('');
  $('photoPreview').hidden = !uploadedPhotos.length;
}
window.removeUploadedPhoto = function (i) {
  uploadedPhotos.splice(i, 1);
  $('photoUpload').value = '';
  renderPhotoPreview();
};
function clearUploadedPhoto() {
  uploadedPhotos = [];
  $('photoUpload').value = '';
  $('photoPreview').hidden = true;
  $('photoUploadError').textContent = '';
  renderPhotoPreview();
}
$('photoUpload').onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  if (uploadedPhotos.length + files.length > MAX_PHOTOS_PER_CAT) {
    $('photoUploadError').textContent = `You can add up to 5 photos per cat — you already have ${uploadedPhotos.length}, so these were not added. Remove one first if you want to add a different photo.`;
    $('photoUpload').value = '';
    return;
  }
  try {
    const resized = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) throw new Error('Please choose image files only.');
      const data = await resizeImageFile(file);
      if (data.length > 1500000) throw new Error('That photo is still too large after resizing — please try a smaller photo.');
      resized.push(data);
    }
    uploadedPhotos.push(...resized);
    renderPhotoPreview();
    $('photoUploadError').textContent = '';
    $('photoUpload').value = '';
  } catch (err) {
    $('photoUploadError').textContent = err.message;
    $('photoUpload').value = '';
  }
};
$('photoRemove').onclick = clearUploadedPhoto;
if ($('homeGpsBtn')) $('homeGpsBtn').onclick = placeHomePinFromGps;
$('addCat').onsubmit = async (e) => {
  e.preventDefault();
  if (!signedIn) { $('addError').textContent = 'Please sign in with Google to add a cat. Guests can browse only — sign in on the My Profile tab.'; switchMainTab('profile'); return; }
  const f = new FormData(e.target);
  const pin = String(f.get('ownerPin') || '').trim();
  if (pin && !/^\d{4,6}$/.test(pin)) { $('addError').textContent = 'Owner PIN must be 4–6 digits, or left blank.'; return; }
  try {
    await api('/api/cats', { method: 'POST', body: JSON.stringify({
      name: f.get('name'), owner: displayName || f.get('owner'), description: f.get('description'),
      collar: f.get('collar'), homeArea: f.get('homeArea'), status: f.get('status'),
      county: f.get('county') || selectedCounty, town: f.get('town') || selectedTown, zip: zip,
      photo: chosenPhoto, photoUrl: f.get('photoUrl'), photoData: uploadedPhotos[0] || null, photos: uploadedPhotos, photoDataList: uploadedPhotos,
      lat: pendingPin?.lat, lng: pendingPin?.lng,
      emergencyAddress: f.get('emergencyAddress'), emergencyContact: f.get('emergencyContact'),
      emergencyVet: f.get('emergencyVet'), emergencyMedical: f.get('emergencyMedical'),
      emergencyNotes: f.get('emergencyNotes'), showAddressAlways: f.get('showAddressAlways') === 'on',
      ownerPin: pin,
    }) });
    $('addError').textContent = ''; e.target.reset(); clearUploadedPhoto(); pendingPin = null;
    $('pinStatus').textContent = NO_PIN_TEXT;
    // Next cat starts from GPS again, if permission is allowed;
    // if denied, the no-pin / denied warning above is replaced by
    // the GPS-denied message in placeHomePinFromGps, not a silent
    // town-centre pin.
    placeHomePinFromGps();
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
  try { await refresh(); syncAddFormLocation(); fetchTownSuggestions(selectedCounty, $('addTownList')); switchMainTab('alerts'); syncProfileForm(); } catch (err) { $('joinError').textContent = err.message; $('app').hidden = true; $('join').hidden = false; return; }
  // Poll every 30 seconds while the app is open, so a new sighting in
  // your town triggers the loud alert without a manual refresh.
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (!$('app').hidden) refresh().catch(() => {}); }, 30000);
};
// ---- Google account setup: ZIP only, GPS confirmation, auto-fill ----
// The user enters ONLY a ZIP. /api/zip-lookup fills county/town.
// If the ZIP is not in the lookup, manual county/town is the fallback
// — nothing is guessed. GPS is a confirmation flag only.
if ($('googleSignOutBtn')) $('googleSignOutBtn').onclick = signOut;
if ($('profileGoogleSignOutBtn')) $('profileGoogleSignOutBtn').onclick = signOut;
if ($('setupGpsBtn')) $('setupGpsBtn').onclick = () => {
  const status = $('setupGpsStatus');
  if (!navigator.geolocation) { status.textContent = 'GPS is not available on this device. You can still continue with your ZIP only, marked unverified.'; setupGpsConfirmed = false; return; }
  status.textContent = 'Getting your location…';
  navigator.geolocation.getCurrentPosition((pos) => {
    if (inMaine(pos.coords.latitude, pos.coords.longitude)) { setupGpsConfirmed = true; status.textContent = '✓ GPS confirmed — your device is in Maine. GPS is a confirmation flag only; your coordinates are not stored.'; }
    else { setupGpsConfirmed = false; status.textContent = 'GPS shows a location outside Maine. You can still continue with your Maine ZIP, marked unverified — please double-check your ZIP.'; }
  }, () => { setupGpsConfirmed = false; status.textContent = 'GPS was denied or unavailable. You can still continue with your ZIP only, marked unverified.'; }, { enableHighAccuracy: true, timeout: 10000 });
};
if ($('setupCheckBtn')) $('setupCheckBtn').onclick = async () => {
  const z = $('setupZip').value.trim();
  if (!isMaineZip(z)) { $('setupError').textContent = 'Please enter a valid 5-digit Maine ZIP code.'; return; }
  $('setupError').textContent = '';
  try {
    const hit = await api(`/api/zip-lookup?zip=${encodeURIComponent(z)}`);
    const preview = $('setupPreview'); preview.hidden = false;
    if (hit.found) {
      setupLookup = hit; $('setupManual').hidden = true;
      preview.textContent = `Looks like you're in ${hit.town}, ${hit.county} County — is that right?`;
      $('setupSaveBtn').hidden = false; $('setupSaveBtn').textContent = `Yes, that's my town — save & enter`;
    } else {
      setupLookup = null; $('setupManual').hidden = false;
      preview.textContent = `That ZIP is not in the town lookup yet — please pick your county and town below to confirm it, then save.`;
      $('setupSaveBtn').hidden = false; $('setupSaveBtn').textContent = 'Save my town & enter';
    }
  } catch (e) { $('setupError').textContent = e.message; }
};
if ($('setupSaveBtn')) $('setupSaveBtn').onclick = async () => {
  const z = $('setupZip').value.trim();
  const body = { zip: z, gpsConfirmed: setupGpsConfirmed };
  if (!setupLookup) { body.county = $('setupCounty').value; body.town = $('setupTown').value.trim(); }
  try {
    const user = await api('/api/me/setup', { method: 'POST', body: JSON.stringify(body) });
    accountUser = user; signedIn = true;
    await enterWithAccount(user);
  } catch (e) { $('setupError').textContent = e.message; }
};
// Changing town for a signed-in account: go back to the ZIP + GPS
// setup step (not a free town switcher). Guests use Change town below.
if ($('profileChangeScopeBtn')) {
  const origProfileChange = $('profileChangeScopeBtn').onclick;
  $('profileChangeScopeBtn').onclick = () => {
    if (signedIn) {
      $('app').hidden = true; $('join').hidden = false;
      const setup = $('accountSetup'); if (setup) setup.hidden = false;
      if (accountUser) $('setupZip').value = accountUser.zip || '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (origProfileChange) origProfileChange();
  };
}
// Initial auth check. If a signed-in account already has a town, enter
// straight away (this is how a profile follows you to a new device).
// Otherwise the guest join / ZIP setup flows above are shown.
refreshAuth().then(({ signedIn: si, user }) => {
  if (si && user && user.hasProfile && $('app').hidden) {
    // Only auto-enter if the guest auto-join below did not already
    // enter with a different scope; account scope wins on new devices
    // where sessionStorage is empty.
    if (!sessionStorage.getItem('nc-town')) enterWithAccount(user);
    else { displayName = user.displayName; }
  }
  if (si && user && !user.hasProfile) {
    const setup = $('accountSetup'); if (setup) setup.hidden = false;
  }
}).catch(() => {});

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
