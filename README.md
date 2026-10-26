# Neighborhood Cats — Shared Version (Maine, ZIP + county + town, locked to your town)

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
- “Add your cat”: tap the map for an approximate pin, upload a real photo
  (Chrome on Android: choose an image, it is resized in the browser to at
  most 800px on the long side as a JPEG before it is sent, previewed, and
  stored with the cat — server limit 2mb per request, photos over ~1.5mb
  of data are rejected with a clear error), or pick a built-in emoji photo
  as a fallback, plus an optional photo URL
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
so the first open after a quiet period can take 30–60 seconds. Data lives
in `data/db.json` on that server. On a free tier that restarts, that file
can occasionally reset — for a small neighborhood trial this is fine, but
for a permanent, long-term app, a paid database (or a host with a
persistent disk) is the next upgrade. Back up `data/db.json` if the cats
matter to you.

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

- **No accounts, no code gate any more.** Anyone who knows the link and
  a Maine ZIP can join a town's view and see that town's cats. Do not
  post sensitive personal information, phone numbers, emails, or exact
  addresses in normal fields. Display names only — except for the
  optional Emergency Details, which you should only fill in knowing they
  become visible to everyone in your town when Emergency Mode is ON.
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
- `public/index.html`, `public/style.css`, `public/app.js` — the map,
  cat list, add-cat form, sightings, message threads, GPS join/sighting,
  Emergency Mode, and the loud sighting alert
- `package.json` — `npm install` / `npm start`, no build step

## API (for checking / testing)

No code header is needed any more. Listings require scope.

- `GET /api/health` — server is up, and how many cats it holds
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
