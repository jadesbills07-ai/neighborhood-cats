/**
 * Neighborhood Cats — shared version (Lisbon Falls, Maine)
 *
 * One server is the single source of truth. Cats, sightings and messages
 * are stored in data/db.json on the server, NOT in any visitor's browser.
 * Any visitor who joins with the neighborhood code sees the same data.
 *
 * Run:  npm install && npm start
 * Env:  PORT (default 3000), NEIGHBORHOOD_CODE (default "lisbon-cats")
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CODE = process.env.NEIGHBORHOOD_CODE || 'lisbon-cats';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
    id: `seed-${i + 1}`,
    ...c,
    spotted: !!c.spotted,
    isExample: true,
    createdAt: new Date().toISOString(),
    sightings: c.spotted ? [{ id: 'seed-sighting-1', location: 'Near Main St', note: 'Example sighting: Miso was seen outside.', reporter: 'Neighbor (example)', createdAt: new Date().toISOString() }] : [],
    messages: c.spotted ? [{ id: 'seed-msg-1', author: 'Neighbor (example)', text: 'Example message: I think I just saw Miso near Main St — is she supposed to be out?', createdAt: new Date().toISOString() }] : [],
  }));
}

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (Array.isArray(data.cats)) return data;
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
const nextId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function requireCode(req, res, next) {
  // Join-code gate: neighbors must know the code to read or write.
  // This is a shared-code gate, NOT full password accounts (see README).
  const code = req.headers['x-neighborhood-code'] || req.body?.code || req.query?.code;
  if (code !== CODE) return res.status(401).json({ error: 'Wrong neighborhood code.' });
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true, cats: db.cats.length }));

// Verify a code without returning cat data yet (used by the join screen).
app.post('/api/verify-code', (req, res) => {
  if (req.body?.code === CODE) return res.json({ ok: true });
  return res.status(401).json({ error: 'Wrong neighborhood code.' });
});

app.get('/api/cats', requireCode, (req, res) => res.json(db.cats));

app.get('/api/sightings', requireCode, (req, res) => {
  const all = [];
  for (const cat of db.cats) {
    for (const s of cat.sightings || []) all.push({ ...s, catId: cat.id, catName: cat.name });
  }
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

app.post('/api/cats', requireCode, (req, res) => {
  const { name, description, collar, homeArea, owner, status, photo, photoUrl, lat, lng } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cat name is required.' });
  if (!['outdoor', 'indoor'].includes(status)) return res.status(400).json({ error: 'Status must be outdoor or indoor.' });
  if (!owner || !owner.trim()) return res.status(400).json({ error: 'Owner display name is required.' });
  // Never store a house number: reject an obvious leading house number.
  if (homeArea && /^\s*\d+\s+\S/.test(homeArea)) {
    return res.status(400).json({ error: 'Please use a street or nearest corner only — do not enter a house number.' });
  }
  const cat = {
    id: nextId(), name: name.trim(), description: (description || '').trim(),
    collar: (collar || '').trim(), homeArea: (homeArea || '').trim(),
    owner: owner.trim(), status, photo: photo || '🐈', photoUrl: (photoUrl || '').trim(),
    lat: Number(lat) || 44.003, lng: Number(lng) || -70.06,
    spotted: false, isExample: false, createdAt: new Date().toISOString(),
    sightings: [], messages: [],
  };
  db.cats.unshift(cat);
  saveDb(db);
  res.status(201).json(cat);
});

app.post('/api/cats/:id/sightings', requireCode, (req, res) => {
  const cat = db.cats.find((c) => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Cat not found.' });
  const { location, note, reporter } = req.body || {};
  if (!location || !location.trim()) return res.status(400).json({ error: 'Sighting location is required.' });
  const sighting = { id: nextId(), location: location.trim(), note: (note || '').trim(), reporter: (reporter || 'Neighbor').trim(), createdAt: new Date().toISOString() };
  cat.sightings.unshift(sighting);
  // A sighting of an indoor-only cat marks it Spotted Outside and
  // posts the same alert into its message thread so the owner sees it.
  if (cat.status === 'indoor') {
    cat.spotted = true;
    cat.messages.unshift({ id: nextId(), author: 'Spotted alert', text: `Spotted outside near ${sighting.location}. ${sighting.note}`.trim(), createdAt: sighting.createdAt });
  }
  saveDb(db);
  res.status(201).json(sighting);
});

app.post('/api/cats/:id/messages', requireCode, (req, res) => {
  const cat = db.cats.find((c) => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Cat not found.' });
  const { author, text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message text is required.' });
  const msg = { id: nextId(), author: (author || 'Neighbor').trim(), text: text.trim(), createdAt: new Date().toISOString() };
  cat.messages.unshift(msg);
  saveDb(db);
  res.status(201).json(msg);
});

// Clear only the seed example cats (keeps real cats neighbors added).
app.post('/api/clear-examples', requireCode, (req, res) => {
  const before = db.cats.length;
  db.cats = db.cats.filter((c) => !c.isExample);
  saveDb(db);
  res.json({ removed: before - db.cats.length, remaining: db.cats.length });
});

app.listen(PORT, () => {
  console.log(`Neighborhood Cats (shared) running on http://localhost:${PORT}`);
  console.log(`Neighborhood: Lisbon Falls area. Join code is set via NEIGHBORHOOD_CODE (default: lisbon-cats).`);
});
