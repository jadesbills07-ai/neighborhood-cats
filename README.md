# Where in the Whiskers? — Shared Version (Maine, ZIP + county + town, locked to your town)

Formerly called Neighborhood Cats. The GitHub repo and Render service
names are unchanged — only the display name in the app, header, footer,
and this README changed.

## 3 tabs, in order

1. **Local Alerts** — a dedicated alerts feed for your locked town only:
   newest first, Lost / Emergency cats at the top, then sightings
   (including exact GPS sighting pins with time) and loud-alert entries.
   Each entry has “View on map”, which switches to the Map tab and
   centers on that cat / GPS pin. The feed reuses the existing
   `/api/alerts` and `/api/sightings` data — it invents no alerts.
2. **Map** — the existing map view: map pins, cat-filter tabs, search
   within your town, cat list, Add Your Cat form, cat detail, sighting
   and message flows, unchanged in function.
3. **My Profile** — your profile page for this device: display name,
   ZIP, county, town, and GPS-confirmed status, plus optional contact /
   notes for your own emergency use. Most importantly, it makes adding
   **multiple cats** easy: a clear “Add another cat” button (which jumps
   to the Add Your Cat form on the Map tab, pre-filled with your display
   name and town) and a “My Cats” list — cats in this town whose owner
   matches your display name — with shortcuts to view each cat and to
   toggle Emergency Mode for it (owner PIN rules unchanged).

## Google sign-in accounts (Google only — no passwords)

**This is the account system Jade chose.** Sign in with Google
(from the join screen or the My Profile tab), and your profile and
your cats follow you to any phone or browser: sign out here, sign
in somewhere else, and they are right there. Cats are linked to
your account (`ownerId`), so only the signed-in owner can toggle
Emergency Mode for their own cats — the owner PIN remains as an
extra check where one was set. No passwords are stored at all;
Google handles sign-in.

**Zip-only signup.** After your first Google sign-in you enter
ONLY a 5-digit Maine ZIP code, then tap GPS confirmation. County
and town are auto-filled from a curated Maine ZIP lookup
(`zipLookup.js` — Lisbon Falls 04252 → Androscoggin / Lisbon
Falls, plus other pairings the author was confident about). The
app shows "Looks like you're in [Town], [County] County — is that
right?" with Yes / Correct it buttons. If a ZIP is not in the
lookup, you pick county and town manually as a fallback — nothing
is guessed. GPS is a confirmation flag (in-Maine bounding box),
not a hard border check, and GPS coordinates are never stored as
a home location. Your town lock remains: you only see your town,
and changing town requires a new ZIP + GPS step.

**Guest behaviour.** Guests can still browse a town read-only, so
existing live users are not locked out. Adding cats, messaging,
sighting reports, Emergency Mode, and clearing example cats
require a signed-in account (the server returns 401 otherwise).
API responses never include a Google ID, an email, or session
material — only display names and town scope, as before.

**Google sign-in will NOT work live until setup is done.** See
`GOOGLE_SETUP.md` for the exact Google Cloud Console steps
(create OAuth client, authorized redirect URI
`https://neighborhood-cats.onrender.com/auth/google/callback`,
copy Client ID/secret and `SESSION_SECRET` into Render env vars,
restart). Without `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
the app still runs and shows a clear "Google sign-in is not set
up yet" state — it never crashes and never claims Google login
works without credentials. Real Google OAuth cannot be fully
tested locally without real Google credentials (see test notes
below).

**Old profile limitation — superseded for signed-in users.**
Guest profile details are still stored in this browser / session
only (sessionStorage) and do not travel. Signed-in users' profiles
live on the server. “My Cats” for signed-in users lists cats by
account ownership; for guests / legacy cats with no owner it
falls back to display-name matching, which is a convenience list,
not proof of ownership.

**Decorations.** Warm, playful cat theme for “Where in the Whiskers?”:
paw-print accents and a whisker divider in the header, a warm
cream/orange/teal colour scheme, and cute paw section headers. Buttons,
tabs, map pins, the emergency banner, and the loud-alert banner keep
their high-contrast colours and stay clearly readable, and the layout
stays mobile-friendly for Android Chrome.

This is the **shared** version. Unlike the earlier session-only page, this one
has a central server database. When one neighbor adds a cat, sends a sighting,
or messages an owner, every other neighbor in the **same town** who opens the
same deployed link sees it. That shared map and shared messaging was the main
feature requested.

**One statewide app, no code, locked to your town.** Everyone uses the same
link. There is NO neighborhood code any more — the old `lisbon-cats` code is
retired and no longer used, and the server runs without `NEIGHBORHOOD_CODE`
(an old env var, if still set, is ignored). Joining is: display name + a
5-digit Maine ZIP code, then a Maine county, then a town. The main view shows
only cats for that ZIP / county / town. There is NO View All Maine toggle and
NO free browsing of other towns. “Change town” is not a free town switcher:
it wipes your stored scope and forces you to enter a new ZIP and confirm
your location again.

**What it does**
- Map of Maine (Leaflet + OpenStreetMap, no paid key) with pins:
  green = Outdoor OK, red = Indoor Only, yellow pulsing = Spotted Outside,
  red pulsing = Lost / Emergency, blue = exact sighting pin (see below)
- ZIP + county then town joining: all 16 Maine counties in a dropdown
  (Androscoggin, Aroostook, Cumberland, Franklin, Hancock, Kennebec, Knox,
  Lincoln, Oxford, Penobscot, Piscataquis, Sagadahoc, Somerset, Waldo,
  Washington, York). Town is a text field with suggestions from towns
  already added in that county — no hard-coded 400-town list, no external
  geocoding API/key. If a town is not listed yet, type it in; it is added
  when the first cat from that town is added.
- ZIP validation: 5 digits, Maine range 03901–04992. Server-side listing
  endpoints (`/api/cats`, `/api/sightings`, `/api/alerts`) REQUIRE county +
  town and return only that town — an unscoped request gets a 400, never
  all of Maine. A ZIP, when supplied, only excludes cats that actually
  carry a different ZIP; seed cats with no ZIP are not hidden by it.
- GPS join confirmation: “Confirm my location” uses browser geolocation.
  If granted and the position is in Maine (rough bounding box), the join
  is marked GPS-confirmed. If GPS is denied or unavailable, you can still
  join with ZIP only, clearly marked unverified, with the plain warning
  that GPS confirmation improves accuracy. GPS is a confirmation flag,
  NOT a hard border check: there is no offline ZIP-boundary dataset and
  no external geocoding API/key, so GPS never rejects a legitimate
  neighbor at a town edge for a mismatch. GPS coordinates are NOT stored
  as a user's home location — only ZIP / county / town and a
  `gpsConfirmed` boolean are stored for session/cat scope.
- Cat profiles: name, description, collar/ID, home area, county, town,
  ZIP, owner display name, Outdoor OK vs Indoor Only
- Tabs + search within your town for Outdoor OK, Indoor Only, and Spotted
  cats, with counts (counts and the sightings feed follow your town only)
- “Add your cat”: tap the map for an approximate pin, upload up to 5 real
  photos per cat (choose multiple images, each is resized in the browser
  to at most 800px on the long side as a JPEG before it is sent, shown as
  a preview gallery with a Remove button per photo, and stored with the
  cat — first photo is the main photo in the cat list, all photos show
  as a gallery in the cat detail, tap a thumbnail to view it larger;
  server limit 8mb per request, each photo over ~1.5mb of data and any
  6th photo are rejected with a clear error "You can add up to 5 photos
  per cat"; legacy cats with a single photo still display, with that
  photo as the first gallery image), or pick a built-in emoji photo
  as a fallback, plus an optional photo URL. Photos are data URLs in
  data/db.json, so multiple photos per cat grow the database faster —
  fine for a small trial, not a long-term media store.
- “I spotted this cat” for Indoor Only cats: creates an alert banner, a
  sightings-feed entry, and a message in that cat's thread
- Sighting GPS ping: when reporting a sighting, “Use my current location”
  uses browser geolocation. If granted, the spotter's exact lat/lng at
  that moment is stored with the sighting, shown as a blue pin on the map
  at exactly that spot, and included in the sightings feed and the cat's
  sighting list with its time. Home pins remain approximate by design —
  the exact pin is ONLY for sightings. If GPS is denied, fall back to the
  typed location as before.
- LOUD SIGHTING PING / URGENT OWNER ALERT: a sighting of an Indoor Only /
  escaped cat is NOT just a quiet thread message. The server flags it
  (`sighting.alert=true`, `cat.lastSightingAlert`), and the app polls
  every 30 seconds while open, so a new sighting in your town triggers the
  alert on the next refresh for anyone viewing that town, not only the
  spotter. The alert is: a red flashing banner that stays until dismissed,
  a Web Audio alert sound, phone vibration via `navigator.vibrate` on
  Android, a “Check now” button that jumps straight to that cat and
  centers the map on its GPS sighting pin, plus a browser Notification if
  the owner granted Notification permission. Controls in the app: a
  “Loud alerts for my cats” on/off toggle (default ON), a “Test alert
  sound” button, and an “Enable browser notifications” button. Turning
  loud alerts off still shows the flashing banner, but with no sound,
  vibration, or notification. See “Honest limits” below — this build does
  NOT claim to override silent / Do Not Disturb or wake a closed browser.
- Lost Emergency Mode with optional details and owner PIN: the Add Your
  Cat form has an optional Emergency Details section (all fields optional):
  exact address, best contact/phone, vet, medical notes, other finder
  notes, plus an “Always show my exact address” checkbox (default OFF)
  and an Owner PIN field (4–6 digits, optional but recommended, stored
  only as a sha256 hash, never in plain text and never in any API
  response). In normal mode, exact address and contact details are NEVER
  shown — only the approximate home area and display name — except that
  ticking “Always show my exact address” opts the address field alone
  into normal display; contact, vet, and medical notes still stay hidden
  until Emergency Mode. “Mark as Lost / Emergency” warns in the UI that
  the filled details will be visible to everyone in that town; if a PIN
  was set it is required to turn emergency ON and to turn it OFF, and if
  no PIN was set the UI warns plainly that anyone in town could toggle
  it and recommends setting a PIN first. When emergency is ON the cat
  jumps to the top of the list, gets an emergency banner and a pulsing
  red pin, and its emergency card shows ONLY the fields the owner filled
  in. Turning it OFF hides the address/contact again.
- A message thread per cat to contact the owner — display names only,
  never phone numbers or emails in normal mode
- Seed example cats default to Androscoggin / Lisbon Falls, ZIP 04252
  (Lisbon Falls' real public ZIP); cats stored before county/town existed
  also show under that default instead of disappearing.

## 1. How to run it locally (exact commands)

You need Node.js 18 or newer installed. Then, in a terminal, from this folder:

```bash
npm install
npm start
```

Then open http://localhost:3000 in a browser.

- Display name: any name you want neighbors to see, e.g. Jade
- Maine ZIP code: 5 digits, e.g. 04252 for Lisbon Falls
- County: pick from the dropdown, then Town: pick from suggestions or
  type a new town. The main view then shows only that county + town.
  Use “Change town (re-enter ZIP + GPS)” to switch — it requires a new
  ZIP and a fresh GPS confirmation; it is not a free switcher.

Try it: add a cat, then open http://localhost:3000 in a second browser
window (or a second phone on the same Wi-Fi, using your computer's address).
Join with the same ZIP / county / town. You will see the same cats — that
is the proof it is shared, not session-only. Join with a different town
and you will NOT see those cats — that is the proof of town locking.

To stop the server: press Ctrl+C in the terminal.

To clear the example cats: click “Clear example cats” in the app, or stop
the server, delete `data/db.json`, and start it again (it will reseed).

## 2. How to deploy it free (plain steps)

This needs a free web-service host. Render is used as the example; Railway
works the same way. No paid key is needed, and you do not need a native
phone-app build.

1. Put this folder on GitHub (create a free GitHub account, make a new
   repository, upload these files). If you need help with this step, ask
   someone to do it with you once — after that, deployment is automatic.
2. Create a free Render account and choose **New → Web Service**.
3. Connect your GitHub repository.
4. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance type: Free
5. Click Create. Render will give you a link like
   `https://neighborhood-cats.onrender.com`. That link is the shared app.
   There is no neighborhood-code environment variable to set any more.

Notes for a non-developer: the free tier may sleep when nobody uses it,
so the first open after a quiet period can take 30–60 seconds.

## Persistent storage — REQUIRED on Render (do not skip this)

**Why this exists.** Accounts, cats, sightings, messages and sessions
used to live only in `data/db.json` on Render's free server. That file
is wiped on every Render restart, spin-down and redeploy — proven on
2026-10-26, when seed cats were re-created at 01:35 EDT and a
signed-in user got a 401 when adding a cat, because her session had
been wiped. A file-only app on Render free tier will keep losing
collected info. That is not acceptable for a real neighbourhood app,
so the server now supports PostgreSQL.

**How it works.** Set one env var, `DATABASE_URL`, to a Postgres
connection string (see below). On startup the server creates the
table automatically if it does not exist:

```sql
CREATE TABLE app_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

and stores the entire app state — cats, users, sessions, everything —
as a single row with `id = 'main'`. The existing JSON data model is
unchanged; only where it is stored changes. Every save upserts that
row (serial write queue, last-write-wins, errors logged, never
crashing the server). Once `DATABASE_URL` is set, Render restarts,
spin-downs and redeploys no longer wipe data, because the data lives
in Postgres, not in Render's ephemeral filesystem. The file is no
longer the source of truth in that mode.

**How to set it up (free, no card).**
1. Create a free Postgres project — **Supabase** (free tier, sign in
   with Google, no card for the free project) or **Neon** (free tier)
   are both suitable. Create a new project / database for this app.
2. Copy its connection string. In Supabase this is the Postgres
   connection string (pooler / transaction mode works); in Neon it is
   the connection string shown for the database. It must include
   `sslmode=require` (Supabase / Neon strings normally do). Example
   shape only — never paste a real password into chat or git:
   `postgresql://user:password@host:5432/postgres?sslmode=require`
3. In Render, open the `neighborhood-cats` web service → Environment
   → Add Environment Variable: key `DATABASE_URL`, value the string
   from step 2 → Save. Render redeploys automatically.
4. After that deploy, check the deploy logs for
   "Loaded persistent state from Postgres" (on later restarts) or
   "No Postgres state row yet — saved current state … to Postgres"
   (on the very first Postgres deploy). From then on, accounts and
   cats survive restarts.

**If DATABASE_URL is not set**, the server falls back to
`data/db.json` exactly as before, so local testing still works
without a database — but that fallback is NOT safe on Render, and
the server logs a warning saying so on every startup. Do not invite
real neighbours until `DATABASE_URL` is set in Render.

**One-time migration note — read this before switching.** Cats and
accounts created before the switch will NOT magically appear in
Postgres, because Render already wiped them (that is the bug being
fixed). The first Postgres-backed sign-in will be fresh: neighbours
sign in with Google again, complete the ZIP-only setup, and add
their cats again — and after that, restarts will no longer wipe
them. There is nothing to migrate from the old file, because the
old file is gone on every Render restart; do not promise neighbours
that pre-switch data will reappear.

## 3. How neighbors join once deployed

1. Send them the deployed link from step 2.
2. They open the link, pick a display name, enter their Maine ZIP code,
   optionally tap “Confirm my location” for GPS confirmation, then pick
   their county and town.
3. They can now see cats for that town only, tap a cat to message its
   owner, tap “I spotted this cat” for an Indoor Only cat (with an
   optional GPS pin), and add their own cat (county/town/ZIP default to
   the town they joined with).

Everyone must use the **same** deployed link. A different link or a
different server is a different neighborhood. County/town/ZIP do NOT
change the link — they lock which town's cats you see.

## 4. How to Add to Home Screen on Android (so it feels like an app)

1. Open the deployed link in **Chrome** (not in a chat preview).
2. Tap the three-dot menu (top right).
3. Tap **Add to Home screen** (or “Install app” if Chrome offers it).
4. Tap **Add**. An icon appears on your home screen and opens the app
   full-screen, like a regular app.

It is still a web app, not a Play Store app. It will not appear in the
Play Store, and it will not update itself like a store app — but it will
open from your home screen and, once deployed, it will show the shared
neighborhood data.

## 5. Honest limits — please read this

- **Accounts, no code gate any more.** Anyone who knows the link and
  a Maine ZIP can browse a town's view and see that town's cats, but
  adding cats, messaging, sightings, and Emergency Mode require a
  signed-in Google account. Do not post sensitive personal information,
  phone numbers, emails, or exact addresses in normal fields. Display
  names only — except for the optional Emergency Details, which you
  should only fill in knowing they become visible to everyone in your
  town when Emergency Mode is ON.
- **Loud alert limits — read this before relying on it.** A web app
  cannot guarantee it will override a phone on silent / Do Not Disturb,
  and it cannot reliably wake a fully closed browser without a native
  app and a push service. This build does NOT claim otherwise. What it
  delivers is: a red flashing banner that stays until dismissed, a Web
  Audio alert sound (which browsers may block until you have tapped
  something in the app — use “Test alert sound” once), vibration on
  Android, and a browser Notification — but only if the owner granted
  Notification permission and has sound on. If the browser is fully
  closed, or the phone is on silent / Do Not Disturb, the loud alert may
  not reach the owner. A native app with a push service would be needed
  for a guaranteed wake-up alert.
- **GPS is a confirmation flag, not a border check.** There is no
  ZIP-boundary dataset and no geocoding API/key, so GPS cannot prove
  which ZIP you are in, and it never blocks a join. GPS accuracy also
  varies by phone, signal, and indoors vs outdoors.
- **Pins are approximate by design — except sighting pins.** The Add
  Your Cat form asks for a street or nearest corner ONLY. It will reject
  an entry that starts with a house number. Never enter a house number,
  and never drop a pin exactly on your front door if you would not want
  neighbors to know that spot. Sighting GPS pins are the deliberate
  exception: they are exact, because the spotter chose to share exactly
  where they were standing at that moment.
- **Example cats are not real cats.** Mango, Shadow, Cleo, Miso, Smokey,
  and Oreo are seed examples from the demo so you can see how it works.
  Clear them with the button in the app before inviting real neighbors,
  or they will stay mixed in with real cats.
- **No real cats or personal details of Jade are in this codebase.**
  Nothing here invents her address or her own cats.
- **Free hosting can reset.** See section 2. This first shared version is
  a working neighborhood trial, not a bank-grade, permanently guaranteed
  service.

## Files

- `server.js` — Express server + shared database (data/db.json)
- `zipLookup.js` — curated Maine ZIP → town/county lookup for
  zip-only signup (fallback to manual county/town if a ZIP is missing)
- `GOOGLE_SETUP.md` — exact Google Cloud + Render setup steps; Google
  sign-in does NOT work live until those env vars are set
- `public/index.html`, `public/style.css`, `public/app.js` — the 3-tab
  layout (Local Alerts / Map / My Profile), Google sign-in / sign-out
  and ZIP-only account setup, the map, cat list, add-cat form,
  sightings, message threads, GPS join/sighting, Emergency Mode,
  and the loud sighting alert
- `package.json` — `npm install` / `npm start`, no build step, no new
  dependencies (Google OAuth is a direct code flow in server.js)

## API (for checking / testing)

No code header is needed any more. Listings require scope.

- `GET /api/health` — server is up, and how many cats it holds
- `GET /api/auth/status` — `{ googleConfigured, signedIn, user }`
  (user = display name + town scope only, never Google ID/email)
- `GET /auth/google` — start Google sign-in (redirects to
  `/?auth=not-configured` if credentials are missing)
- `GET /auth/google/callback` — Google OAuth callback (server-side
  code exchange; secret never in the browser)
- `GET /auth/logout` / `POST /api/auth/logout` — sign out
- `GET /api/me` — signed-in user (display name + town scope only)
- `GET /api/me/cats` — signed-in user's own cats (auth required)
- `POST /api/me/setup` / `POST /api/me/scope` — zip-only account
  setup / town change: `{ zip, gpsConfirmed, county?, town? }`
  (county/town auto-filled from ZIP, or required manually if the
  ZIP is not in the lookup)
- `GET /api/zip-lookup?zip=04252` — `{ found, town, county }` for a
  Maine ZIP, or `{ found: false }` (never guessed)
- `GET /api/counties` — the 16 Maine counties
- `GET /api/towns?county=Cumberland` — towns already added in that county
- `GET /api/cats?county=…&town=…&zip=…` — cats for that town ONLY
  (county + town required; without them you get a 400, never all Maine)
- `POST /api/cats` — add a cat (include `county`, `town`, `zip`; optional
  emergency fields + `ownerPin` 4–6 digits; PIN is stored hashed and the
  response never includes it or hidden emergency details)
- `POST /api/cats/:id/sightings` — report a sighting (indoor cats become
  Spotted and set `lastSightingAlert`; optional `lat`/`lng` GPS pin)
- `POST /api/cats/:id/messages` — message a cat's owner
- `GET /api/sightings?county=…&town=…&zip=…` — sightings feed for that town only
- `GET /api/alerts?county=…&town=…&zip=…` — urgent-alert sightings for that town only
- `POST /api/cats/:id/emergency` — `{ "emergency": true|false, "pin": "…" }`
  (PIN required if one was set, for both ON and OFF)
- `POST /api/clear-examples` — remove only the seed example cats
