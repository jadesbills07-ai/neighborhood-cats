/**
 * Where in the Whiskers? — shared version (Maine, county then town)
 * Formerly called Neighborhood Cats. Repo and deployed URL are unchanged;
 * only the display name changed.
 *
 * One server is the single source of truth. Cats, sightings and messages
 * are stored in data/db.json on the server, NOT in any visitor's browser.
 * Any visitor who joins with a Maine ZIP + county + town sees the same
 * cats for THAT town only. There is NO neighborhood code any more and NO
 * View All Maine view: the old `lisbon-cats` code is retired and the
 * server runs without NEIGHBORHOOD_CODE (an old env var, if set, is
 * ignored). Scope filtering is enforced server-side: /api/cats and
 * /api/sightings REQUIRE county + town, and return only matching cats.
 *
 * GPS note (honest limit): the join GPS check is a confirmation flag
 * only. There is no offline ZIP-boundary dataset and no external
 * geocoding API/key, so GPS is NEVER used as a hard border check and
 * never rejects a neighbor at a town edge for a GPS mismatch. GPS
 * coordinates are never stored as a user's home location — only
 * zip/county/town and a gpsConfirmed boolean travel with the session.
 * The ONE exception is a sighting: when a spotter taps "Use my current
 * location", that moment's exact lat/lng IS stored with the sighting,
 * so the pin lands exactly where the spotter was standing. Home pins
 * stay approximate by design.
 *
 * Emergency Mode note: exact address / contact / vet / medical details
 * are stored server-side but NEVER returned in normal mode, except that
 * an owner who ticks "Always show my exact address" opts that one field
 * (address only) into normal display. Owner PINs are stored only as a
 * sha256 hash and are never returned in any API response.
 *
 * Loud sighting alert note: a sighting of an Indoor Only cat sets
 * cat.lastSightingAlert (and sighting.alert=true). The frontend polls
 * /api/cats and fires the loud in-app alert for any alert it has not
 * seen yet, so anyone viewing that town gets it on the next refresh,
 * not just the spotter. The server cannot push to a closed browser —
 * see README limits.
 *
 * Accounts: Google sign-in ONLY — no passwords are stored at all.
 * See GOOGLE_SETUP.md: real Google OAuth 2.0 (direct code flow, no
 * extra npm dependencies) needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 * GOOGLE_CALLBACK_URL and SESSION_SECRET in the environment. Without
 * them the app still runs, shows a clear "Google sign-in not set up
 * yet" state, and guests can still browse a town read-only.
 *
 * Run:  npm install && npm start
 * Env:  PORT (default 3000), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *       GOOGLE_CALLBACK_URL (default https://neighborhood-cats.onrender.com/auth/google/callback),
 *       SESSION_SECRET
 */
const crypto = require('crypto');
const { lookupZip } = require('./zipLookup');
const COUNTIES = ['Androscoggin', 'Aroostook', 'Cumberland', 'Franklin', 'Hancock', 'Kennebec', 'Knox', 'Lincoln', 'Oxford', 'Penobscot', 'Piscataquis', 'Sagadahoc', 'Somerset', 'Waldo', 'Washington', 'York'];
const DEFAULT_COUNTY = 'Androscoggin';
const DEFAULT_TOWN = 'Lisbon Falls';
const DEFAULT_ZIP = '04252'; // Lisbon Falls, ME — real public ZIP, verified via public ZIP listings.
function normalizeCounty(v) {
  const t = String(v || '').trim();
  return COUNTIES.find((c) => c.toLowerCase() === t.toLowerCase()) || null;
}
// Maine ZIPs run 03901–04992. 5 digits + that numeric range only.
function isMaineZip(v) {
  const z = String(v || '').trim();
  if (!/^\d{5}$/.test(z)) return false;
  const n = Number(z);
  return n >= 3901 && n <= 4992;
}
// Cats stored before county/town existed still show under the sensible
// default (the original Lisbon Falls neighborhood) instead of disappearing.
function withLocationDefaults(cat) {
  return { ...cat, county: normalizeCounty(cat.county) || DEFAULT_COUNTY, town: String(cat.town || '').trim() || DEFAULT_TOWN, zip: String(cat.zip || '').trim() };
}
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json({ limit: '2mb' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large — please use a smaller photo.' });
  return next(err);
});
app.use(express.static(path.join(__dirname, 'public')));
// Public Privacy Policy page — must serve at /privacy (not only
// /privacy.html), because Google requires a privacy policy URL for
// publishing the OAuth app. The file lives in public/privacy.html.
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));

function seedCats() {
  // Example cats only — clearly marked, so neighbors can clear them.
  // Home areas are streets/corners only. No house numbers, no real people.
  const base = [
    { name: 'Mango', status: 'outdoor', description: 'Friendly orange tabby, loves sun patches and will say hello.', collar: 'Orange collar, no bell', homeArea: 'Near Main St & School St', owner: 'Alex (example)', photo: '🐈', lat: 44.0045, lng: -70.0615 },
    { name: 'Shadow', status: 'outdoor', description: 'Shy black cat, usually seen at dusk near porches.', collar: 'Black collar', homeArea: 'Near Lisbon St', owner: 'Sam (example)', photo: '🐈‍⬛', lat: 44.0015, lng: -70.0585 },
    { name: 'Cleo', status: 'outdoor', description: 'Calico, chatty, likes to supervise gardens.', collar: 'Pink collar with bell', homeArea: 'Near Uplands area', owner: 'Pat (example)', photo: '🐈', lat: 44.0060, lng: -70.0640 },
    { name: 'Miso', status: 'indoor', description: 'Small grey tabby. Skittish, not food motivated — please do not chase.', collar: 'Grey collar', homeArea: 'Near Main St', owner: 'Jordan (example)', photo: '🐱', lat: 44.0030, lng: -70.0600, spotted: true },
    { name: 'Smokey', status: 'indoor', description: 'Fluffy grey cat, strictly indoors. If seen outside, please alert the owner.', collar: 'Blue collar', homeArea: 'Near Ferry Rd area', owner: 'Taylor (example)', photo: '🐱', lat: 44.0005, lng: -70.0635 },
    { name: 'Oreo', status: 'indoor', description: 'Black-and-white, very friendly but should not be outside.', collar: 'Red collar', homeArea: 'Near Village St area', owner: 'Casey (example)', photo: '🐈', lat: 44.0055, lng: -70.0575 },
  ];
  return base.map((c, i) => ({
    id: `seed-${i + 1}`, ownerId: '',
    county: DEFAULT_COUNTY, town: DEFAULT_TOWN, zip: DEFAULT_ZIP,
    ...c,
    spotted: !!c.spotted,
    isExample: true,
    emergencyOn: false,
    emergency: { address: '', contact: '', vet: '', medical: '', notes: '', showAddressAlways: false },
    pinHash: '',
    lastSightingAlert: null,
    createdAt: new Date().toISOString(),
    sightings: c.spotted ? [{ id: 'seed-sighting-1', location: 'Near Main St', note: 'Example sighting: Miso was seen outside.', reporter: 'Neighbor (example)', createdAt: new Date().toISOString(), alert: false }] : [],
    messages: c.spotted ? [{ id: 'seed-msg-1', author: 'Neighbor (example)', text: 'Example message: I think I just saw Miso near Main St — is she supposed to be out?', createdAt: new Date().toISOString() }] : [],
  }));
}

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (Array.isArray(data.cats)) return { ...data, cats: data.cats.map(withLocationDefaults) };
    }
  } catch (e) { console.error('Could not read db, reseeding:', e.message); }
  const fresh = { cats: seedCats() };
  saveDb(fresh);
  return fresh;
}

function saveDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDb();
if (!Array.isArray(db.users)) db.users = [];
if (!Array.isArray(db.sessions)) db.sessions = [];
const nextId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const hashPin = (pin) => crypto.createHash('sha256').update(String(pin)).digest('hex');

// ---- Google sign-in (direct OAuth 2.0 code flow, no passport) ----
// Sessions are random tokens; only an HMAC/sha256 hash is stored in
// db.json, never the token itself. SESSION_SECRET, when set, keys the
// hash — changing it invalidates old sessions, which is the safe
// behaviour. Without it, a plain sha256 hash is used and a warning is
// logged; the app still works, sessions just do not survive a secret
// change (there is none to change).
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'https://neighborhood-cats.onrender.com/auth/google/callback';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const GOOGLE_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
if (!GOOGLE_CONFIGURED) console.log('Google sign-in NOT configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing) — app runs in guest-browse mode. See GOOGLE_SETUP.md.');
if (!SESSION_SECRET) console.log('Warning: SESSION_SECRET not set — set it in production so sessions are keyed to a stable secret.');
const hashToken = (token) => SESSION_SECRET
  ? crypto.createHmac('sha256', SESSION_SECRET).update(String(token)).digest('hex')
  : crypto.createHash('sha256').update(String(token)).digest('hex');
const oauthStates = new Map(); // state -> createdAt (10 min expiry)
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isHttpsReq(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}
function setCookie(res, name, value, opts) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (opts && opts.httpOnly) bits.push('HttpOnly');
  if (opts && opts.secure) bits.push('Secure');
  if (opts && opts.maxAge) bits.push(`Max-Age=${opts.maxAge}`);
  if (opts && opts.expires) bits.push(`Expires=${opts.expires.toUTCString()}`);
  res.append('Set-Cookie', bits.join('; '));
}
// Attach req.user (or null) from the session cookie. Never throws.
function attachUser(req, res, next) {
  req.user = null;
  try {
    const token = parseCookies(req).wiw_session;
    if (!token) return next();
    const hash = hashToken(token);
    const sess = (db.sessions || []).find((s) => s.tokenHash === hash);
    if (!sess) return next();
    if (sess.expiresAt && new Date(sess.expiresAt).getTime() < Date.now()) return next();
    req.user = (db.users || []).find((u) => u.id === sess.userId) || null;
    if (!req.user) return next();
    req.sessionHash = hash;
  } catch (e) { /* guest */ }
  return next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in with Google to do that.', needsAuth: true, googleConfigured: GOOGLE_CONFIGURED });
  return next();
}
// Safe public view of the signed-in user: display name + town scope
// only. NEVER googleId, email, or session material in any response.
function publicUser(user) {
  if (!user) return null;
  return {
    displayName: user.displayName || '',
    zip: user.zip || '', county: user.county || '', town: user.town || '',
    gpsConfirmed: !!user.gpsConfirmed,
    hasProfile: !!(user.zip && user.county && user.town),
  };
}

// Public view of a cat: NEVER includes pinHash or the full emergency
// details. In emergency mode only the fields the owner actually filled
// in are shown. In normal mode only the opted-in exact address (if the
// owner ticked "Always show my exact address") is shown — contact, vet,
// medical and notes stay hidden until emergency mode is ON.
function publicCat(cat) {
  const c = withLocationDefaults(cat);
  const em = c.emergency || {};
  const filled = {};
  if (c.emergencyOn) {
    for (const k of ['address', 'contact', 'vet', 'medical', 'notes']) {
      if (String(em[k] || '').trim()) filled[k] = String(em[k]).trim();
    }
  }
  const out = { ...c };
  delete out.pinHash;
  delete out.ownerId;
  delete out.emergency;
  out.hasPin = !!c.pinHash;
  out.emergencyOn = !!c.emergencyOn;
  out.emergencyDetails = c.emergencyOn ? filled : null;
  out.alwaysAddress = (!c.emergencyOn && em.showAddressAlways && String(em.address || '').trim()) ? String(em.address).trim() : '';
  out.showAddressAlways = !!em.showAddressAlways;
  return out;
}
const publicCats = (cats) => cats.map(publicCat);

// Scope is mandatory for listings: no unscoped request may return all
// of Maine. ZIP, when supplied, only excludes cats that actually carry
// a different ZIP — seed/legacy cats with no ZIP are not hidden by it,
// and county+town remain the primary scope.
function requireScope(req, res, next) {
  const county = normalizeCounty(req.query.county);
  const town = String(req.query.town || '').trim();
  if (!county || !town) return res.status(400).json({ error: 'Pick your county and town first — you only see your own town.' });
  if (req.query.zip && !isMaineZip(req.query.zip)) return res.status(400).json({ error: 'Please enter a valid 5-digit Maine ZIP code.' });
  req.scope = { county, town: town.toLowerCase(), zip: String(req.query.zip || '').trim() };
  next();
}

function filterByScope(cats, scope) {
  return cats.map(withLocationDefaults).filter((c) => {
    if (c.county !== scope.county) return false;
    if (c.town.toLowerCase() !== scope.town) return false;
    if (scope.zip && c.zip && c.zip !== scope.zip) return false;
    return true;
  });
}

app.use(attachUser);

// ---- Auth routes ----
// /api/auth/status never crashes without credentials: it simply
// reports configured:false, and the frontend shows the not-set-up
// state while guests can still browse a town read-only.
app.get('/api/auth/status', (req, res) => res.json({
  googleConfigured: GOOGLE_CONFIGURED,
  signedIn: !!req.user,
  user: publicUser(req.user),
}));
app.get('/api/zip-lookup', (req, res) => {
  const zip = String(req.query.zip || '').trim();
  if (!isMaineZip(zip)) return res.status(400).json({ error: 'Please enter a valid 5-digit Maine ZIP code.' });
  const hit = lookupZip(zip);
  if (!hit) return res.json({ zip, found: false });
  return res.json({ zip, found: true, town: hit.town, county: hit.county });
});
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CONFIGURED) return res.redirect('/?auth=not-configured');
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now());
  setCookie(res, 'wiw_oauth_state', state, { httpOnly: true, secure: isHttpsReq(req), maxAge: 600 });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_CALLBACK_URL,
    response_type: 'code', scope: 'openid email profile', state,
    access_type: 'online', prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});
app.get('/auth/google/callback', async (req, res) => {
  try {
    if (!GOOGLE_CONFIGURED) return res.redirect('/?auth=not-configured');
    const { code, state, error } = req.query;
    if (error) return res.redirect('/?auth=denied');
    const savedState = parseCookies(req).wiw_oauth_state;
    const created = oauthStates.get(String(state || ''));
    oauthStates.delete(String(state || ''));
    if (!code || !state || savedState !== state || !created || Date.now() - created > 10 * 60 * 1000) {
      return res.redirect('/?auth=bad-state');
    }
    // Exchange code for tokens (server-to-server, secret never in browser).
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code), client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_CALLBACK_URL, grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) return res.redirect('/?auth=token-failed');
    const meRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !profile.sub) return res.redirect('/?auth=profile-failed');
    let user = db.users.find((u) => u.googleId === profile.sub);
    if (!user) {
      user = {
        id: nextId(), googleId: profile.sub,
        displayName: String(profile.name || profile.email || 'Neighbor').trim(),
        zip: '', county: '', town: '', gpsConfirmed: false,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.push({ tokenHash: hashToken(token), userId: user.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() });
    saveDb(db);
    setCookie(res, 'wiw_session', token, { httpOnly: true, secure: isHttpsReq(req), maxAge: 30 * 24 * 3600 });
    setCookie(res, 'wiw_oauth_state', '', { httpOnly: true, expires: new Date(0) });
    return res.redirect('/?auth=signed-in');
  } catch (e) {
    console.error('Google callback failed:', e.message);
    return res.redirect('/?auth=failed');
  }
});
function clearSession(req, res) {
  if (req.sessionHash) db.sessions = (db.sessions || []).filter((s) => s.tokenHash !== req.sessionHash);
  saveDb(db);
  setCookie(res, 'wiw_session', '', { httpOnly: true, expires: new Date(0) });
}
app.get('/auth/logout', (req, res) => { clearSession(req, res); res.redirect('/'); });
app.post('/api/auth/logout', (req, res) => { clearSession(req, res); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ signedIn: !!req.user, user: publicUser(req.user), googleConfigured: GOOGLE_CONFIGURED }));
app.get('/api/me/cats', requireAuth, (req, res) => {
  const mine = db.cats.filter((c) => c.ownerId === req.user.id);
  res.json(publicCats(mine));
});
// Zip-only signup: enter ONLY a ZIP + GPS confirmation. County/town
// are auto-filled from the ZIP lookup; if the ZIP is not in the table,
// county + town must be supplied manually (fallback, never guessed).
// Changing town uses this same endpoint: a new ZIP + GPS step.
function applyZipSetup(user, body) {
  const zip = String(body.zip || '').trim();
  if (!isMaineZip(zip)) return { error: 'Please enter a valid 5-digit Maine ZIP code.' };
  const hit = lookupZip(zip);
  let county = normalizeCounty(body.county);
  let town = String(body.town || '').trim();
  if (hit) {
    county = hit.county; town = hit.town;
  } else {
    if (!county || !town) return { error: 'That ZIP is not in the town lookup yet — please pick your county and town to confirm it.', needsManual: true };
  }
  user.zip = zip; user.county = county; user.town = town;
  user.gpsConfirmed = !!body.gpsConfirmed;
  return { user: publicUser(user) };
}
app.post('/api/me/setup', requireAuth, (req, res) => {
  const result = applyZipSetup(req.user, req.body || {});
  if (result.error) return res.status(400).json(result);
  saveDb(db);
  res.json(result.user);
});
app.post('/api/me/scope', requireAuth, (req, res) => {
  const result = applyZipSetup(req.user, req.body || {});
  if (result.error) return res.status(400).json(result);
  saveDb(db);
  res.json(result.user);
});

app.get('/api/health', (req, res) => res.json({ ok: true, cats: db.cats.length, googleConfigured: GOOGLE_CONFIGURED }));

app.get('/api/counties', (req, res) => res.json(COUNTIES));

// Towns already in use in a county, for town suggestions. No hard-coded
// 400-town list and no external geocoding: new towns are added by free
// entry when a neighbor adds a cat in that town.
app.get('/api/towns', (req, res) => {
  const county = normalizeCounty(req.query.county);
  if (!county) return res.status(400).json({ error: 'Pick a county first.' });
  const towns = [...new Set(db.cats.map(withLocationDefaults).filter((c) => c.county === county).map((c) => c.town))].sort();
  res.json(towns);
});

app.get('/api/cats', requireScope, (req, res) => res.json(publicCats(filterByScope(db.cats, req.scope))));

app.get('/api/sightings', requireScope, (req, res) => {
  const scoped = filterByScope(db.cats, req.scope);
  const all = [];
  for (const cat of scoped) {
    for (const s of cat.sightings || []) all.push({ ...s, catId: cat.id, catName: cat.name });
  }
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

// Urgent-alert feed for polling clients: only sightings flagged alert
// (Indoor Only cats), already scoped to the caller's town.
app.get('/api/alerts', requireScope, (req, res) => {
  const scoped = filterByScope(db.cats, req.scope);
  const all = [];
  for (const cat of scoped) {
    for (const s of cat.sightings || []) {
      if (s.alert) all.push({ ...s, catId: cat.id, catName: cat.name });
    }
  }
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

app.post('/api/cats', requireAuth, (req, res) => {
  const { name, description, collar, homeArea, owner, status, photo, photoUrl, photoData, lat, lng, county, town, zip,
    emergencyAddress, emergencyContact, emergencyVet, emergencyMedical, emergencyNotes, showAddressAlways, ownerPin } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cat name is required.' });
  if (!['outdoor', 'indoor'].includes(status)) return res.status(400).json({ error: 'Status must be outdoor or indoor.' });
  // The signed-in account owns the cat: display name comes from the
  // account, so one user cannot post as another. Guests cannot add.
  const ownerName = (req.user.displayName || '').trim() || (owner || '').trim();
  if (!ownerName) return res.status(400).json({ error: 'Owner display name is required.' });
  if (county && !normalizeCounty(county)) return res.status(400).json({ error: 'Please pick a Maine county from the list.' });
  if (zip && !isMaineZip(zip)) return res.status(400).json({ error: 'Please enter a valid 5-digit Maine ZIP code.' });
  const catCounty = normalizeCounty(county) || DEFAULT_COUNTY;
  const catTown = String(town || '').trim() || DEFAULT_TOWN;
  const catZip = isMaineZip(zip) ? String(zip).trim() : '';
  // Never store a house number in the HOME AREA: reject an obvious
  // leading house number. This does NOT apply to the optional emergency
  // exact address, which the owner only fills in to be shown in
  // Emergency Mode (or if they tick "Always show my exact address").
  if (homeArea && /^\s*\d+\s+\S/.test(homeArea)) {
    return res.status(400).json({ error: 'Please use a street or nearest corner only — do not enter a house number.' });
  }
  const pin = String(ownerPin || '').trim();
  if (pin && !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'Owner PIN must be 4–6 digits, or left blank.' });
  let cleanPhotoData = '';
  if (photoData) {
    if (typeof photoData !== 'string' || !photoData.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Uploaded photo must be an image.' });
    }
    if (photoData.length > 1500000) {
      return res.status(400).json({ error: 'Uploaded photo is too large — please use a smaller photo (it is resized in the browser to at most 800px).' });
    }
    cleanPhotoData = photoData;
  }
  const cat = {
    id: nextId(), ownerId: req.user.id, name: name.trim(), description: (description || '').trim(),
    collar: (collar || '').trim(), homeArea: (homeArea || '').trim(),
    county: catCounty, town: catTown, zip: catZip,
    owner: ownerName, status, photo: photo || '🐈', photoUrl: (photoUrl || '').trim(),
    photoData: cleanPhotoData,
    lat: Number(lat) || 44.003, lng: Number(lng) || -70.06,
    spotted: false, isExample: false, createdAt: new Date().toISOString(),
    emergencyOn: false,
    emergency: {
      address: (emergencyAddress || '').trim(), contact: (emergencyContact || '').trim(),
      vet: (emergencyVet || '').trim(), medical: (emergencyMedical || '').trim(),
      notes: (emergencyNotes || '').trim(), showAddressAlways: !!showAddressAlways,
    },
    pinHash: pin ? hashPin(pin) : '',
    lastSightingAlert: null,
    sightings: [], messages: [],
  };
  db.cats.unshift(cat);
  saveDb(db);
  res.status(201).json(publicCat(cat));
});

app.post('/api/cats/:id/sightings', requireAuth, (req, res) => {
  const cat = db.cats.find((c) => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Cat not found.' });
  const { location, note, lat, lng } = req.body || {};
  const reporter = req.user.displayName || 'Neighbor';
  let sightLat = null, sightLng = null;
  if (lat !== undefined && lat !== null && lat !== '') {
    sightLat = Number(lat); sightLng = Number(lng);
    if (!Number.isFinite(sightLat) || sightLat < -90 || sightLat > 90 || !Number.isFinite(sightLng) || sightLng < -180 || sightLng > 180) {
      return res.status(400).json({ error: 'Sighting GPS coordinates are invalid.' });
    }
  }
  // Typed location is the fallback; a GPS pin alone is enough, and the
  // server labels it from its coordinates.
  const loc = (location && location.trim()) || (sightLat !== null ? `GPS pin ${sightLat.toFixed(5)}, ${sightLng.toFixed(5)}` : '');
  if (!loc) return res.status(400).json({ error: 'Sighting location is required — type a location or use your current location.' });
  const isIndoorAlert = cat.status === 'indoor';
  const sighting = { id: nextId(), location: loc, note: (note || '').trim(), reporter: (reporter || 'Neighbor').trim(), createdAt: new Date().toISOString(), lat: sightLat, lng: sightLng, gps: sightLat !== null, alert: isIndoorAlert };
  cat.sightings.unshift(sighting);
  // A sighting of an indoor-only cat marks it Spotted Outside, posts
  // the same alert into its message thread, AND sets the urgent-alert
  // flag the frontend polls for (loud alert, not just a quiet message).
  if (isIndoorAlert) {
    cat.spotted = true;
    cat.lastSightingAlert = { sightingId: sighting.id, location: sighting.location, lat: sightLat, lng: sightLng, createdAt: sighting.createdAt };
    cat.messages.unshift({ id: nextId(), author: 'Spotted alert', text: `Spotted outside near ${sighting.location}. ${sighting.note}`.trim(), createdAt: sighting.createdAt });
  }
  saveDb(db);
  res.status(201).json(sighting);
});

app.post('/api/cats/:id/messages', requireAuth, (req, res) => {
  const cat = db.cats.find((c) => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Cat not found.' });
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message text is required.' });
  const msg = { id: nextId(), author: (req.user.displayName || 'Neighbor').trim(), text: text.trim(), createdAt: new Date().toISOString() };
  cat.messages.unshift(msg);
  saveDb(db);
  res.status(201).json(msg);
});

// Emergency toggle. If the owner set a PIN, it is required BOTH to turn
// emergency ON and to turn it OFF, and it is checked only as a hash.
app.post('/api/cats/:id/emergency', requireAuth, (req, res) => {
  const cat = db.cats.find((c) => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Cat not found.' });
  // Ownership is now primary: a cat with an ownerId can only be put
  // in Emergency Mode by that signed-in owner. Legacy cats with no
  // ownerId fall back to the PIN check below. PIN remains an extra
  // check where one was set.
  if (cat.ownerId && cat.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the cat\'s owner can change Emergency Mode for this cat.' });
  const on = req.body?.emergency;
  if (typeof on !== 'boolean') return res.status(400).json({ error: 'Send { "emergency": true } or { "emergency": false }.' });
  if (cat.pinHash) {
    const pin = String(req.body?.pin || '').trim();
    if (!pin || hashPin(pin) !== cat.pinHash) return res.status(403).json({ error: 'Wrong owner PIN.' });
  }
  cat.emergencyOn = on;
  saveDb(db);
  res.json(publicCat(cat));
});

// Clear only the seed example cats (keeps real cats neighbors added).
app.post('/api/clear-examples', requireAuth, (req, res) => {
  const before = db.cats.length;
  db.cats = db.cats.filter((c) => !c.isExample);
  saveDb(db);
  res.json({ removed: before - db.cats.length, remaining: db.cats.length });
});

app.listen(PORT, () => {
  console.log(`Where in the Whiskers? (shared) running on http://localhost:${PORT}`);
  console.log(`Neighborhood: Maine, ZIP + county + town locked to your own town. No neighborhood code.`);
});
