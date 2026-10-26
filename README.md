# Neighborhood Cats — Shared Version (Lisbon Falls, Maine)

This is the **shared** version. Unlike the earlier session-only page, this one
has a central server database. When one neighbor adds a cat, sends a sighting,
or messages an owner, every other neighbor who opens the same deployed link
sees it. That shared map and shared messaging was the main feature requested.

**What it does**
- Map of the Lisbon Falls area (Leaflet + OpenStreetMap, no paid key) with pins:
  green = Outdoor OK, red = Indoor Only, yellow pulsing = Spotted Outside
- Cat profiles: name, description, collar/ID, home area, owner display name,
  Outdoor OK vs Indoor Only
- Tabs + search for Outdoor OK, Indoor Only, and Spotted cats, with counts
- “Add your cat”: tap the map for an approximate pin, pick a built-in photo
  (no file-upload picker — that broke on some Android phones before),
  optional photo URL
- “I spotted this cat” for Indoor Only cats: creates an alert banner, a
  sightings-feed entry, and a message in that cat's thread
- A message thread per cat to contact the owner — display names only,
  never phone numbers or emails
- One neighborhood to start, gated by a simple shared neighborhood code

## 1. How to run it locally (exact commands)

You need Node.js 18 or newer installed. Then, in a terminal, from this folder:

```bash
npm install
npm start
```

Then open http://localhost:3000 in a browser.

- Display name: any name you want neighbors to see, e.g. Jade
- Neighborhood code: `lisbon-cats` (unless you changed it — see below)

Try it: add a cat, then open http://localhost:3000 in a second browser
window (or a second phone on the same Wi-Fi, using your computer's address).
Use the same code. You will see the same cats — that is the proof it is
shared, not session-only.

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
5. Under Environment, add a variable:
   - Name: `NEIGHBORHOOD_CODE`
   - Value: pick a code only your neighbors will know, e.g. `lisbon-cats-2026`
   (Do not reuse a password you use anywhere else.)
6. Click Create. Render will give you a link like
   `https://neighborhood-cats.onrender.com`. That link is the shared app.

Notes for a non-developer: the free tier may sleep when nobody uses it,
so the first open after a quiet period can take 30–60 seconds. Data lives
in `data/db.json` on that server. On a free tier that restarts, that file
can occasionally reset — for a small neighborhood trial this is fine, but
for a permanent, long-term app, a paid database (or a host with a
persistent disk) is the next upgrade. Back up `data/db.json` if the cats
matter to you.

## 3. How neighbors join once deployed

1. Send them the deployed link from step 2.
2. They open the link, pick a display name (first name is fine),
   and enter the neighborhood code you chose.
3. They can now see every cat, tap a cat to message its owner, tap
   “I spotted this cat” for an Indoor Only cat, and add their own cat.

Everyone must use the **same** deployed link and the **same** code.
A different link or a different server is a different neighborhood.

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

- **Neighborhood code, not full accounts.** Anyone who knows the code can
  join and see the cats. Do not post sensitive personal information, phone
  numbers, emails, or exact addresses. Display names only.
- **Pins are approximate by design.** The Add Your Cat form asks for a
  street or nearest corner ONLY. It will reject an entry that starts with
  a house number. Never enter a house number, and never drop a pin exactly
  on your front door if you would not want neighbors to know that spot.
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
  cat list, add-cat form, sightings, and message threads
- `package.json` — `npm install` / `npm start`, no build step

## API (for checking / testing)

All cat endpoints need the header `x-neighborhood-code: <your code>`.

- `GET /api/health` — server is up, and how many cats it holds
- `POST /api/verify-code` — `{ "code": "…" }`
- `GET /api/cats` — all shared cats, with sightings and messages
- `POST /api/cats` — add a cat
- `POST /api/cats/:id/sightings` — report a sighting (indoor cats become Spotted)
- `POST /api/cats/:id/messages` — message a cat's owner
- `GET /api/sightings` — shared sightings feed
- `POST /api/clear-examples` — remove only the seed example cats
