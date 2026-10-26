# Google sign-in setup — read this before it works live

**Important, plainly:** Google sign-in will NOT work live until the
steps below are done. The code is complete, but Google will not let
anyone sign in until you create an OAuth client for this app and put
its ID and secret into Render. Until then the app still runs, shows
"Google sign-in is not set up yet", and guests can browse a town
read-only. Nothing in the code can do this step for you, because it
needs your Google account and your Render account.

No passwords are ever stored by this app. Google handles sign-in;
the app only stores a Google user ID (never shown to anyone), a
display name, and the ZIP / county / town you chose.

## What you need

- A Google account (the one you want to own the app with)
- Access to the Render service `neighborhood-cats`
- About 10 minutes, on a computer if you can (Google Cloud Console
  is fiddly on a phone, but it works)

## Step 1 — Create a Google Cloud project

1. Go to https://console.cloud.google.com/ and sign in with Google.
2. At the top, click the project picker, then **New Project**.
3. Name it something clear, e.g. `Where in the Whiskers`, and click
   **Create**. Wait for it to finish, then make sure it is the
   selected project at the top.

## Step 2 — Configure the OAuth consent screen

1. In the left menu, go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (this app is for the public, not just one
   organisation), then **Create**.
3. Fill in:
   - App name: `Where in the Whiskers?`
   - User support email: your email
   - Developer contact information: your email
   - Leave everything else blank for now.
4. Click **Save and Continue** through Scopes (no extra scopes are
   needed — the app only asks for `openid email profile`, which
   Google provides by default) and Test users, then **Back to
   Dashboard**.
5. **While the app is in Testing, only users you add as test users
   can sign in.** To let real neighbours sign in, you must either
   add each neighbour as a test user (not practical), or click
   **Publish App** on the consent screen. Publishing is the step
   that makes sign-in public. Google may ask for a privacy policy
   link before publishing — use the deployed app link plus this
   note: the app stores only a display name, town/ZIP, and cats
   the user adds; exact addresses are only shown in Lost /
   Emergency Mode, as described in the app.

## Step 3 — Create the OAuth client ID and secret

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Where in the Whiskers web`.
5. Under **Authorized redirect URIs**, click **Add URI** and paste
   exactly (no trailing slash, no extra spaces):
   ```
   https://neighborhood-cats.onrender.com/auth/google/callback
   ```
   This MUST match `GOOGLE_CALLBACK_URL` below exactly, or Google
   will refuse sign-in with a redirect_uri_mismatch error.
6. Click **Create**. Google shows a **Client ID** and a **Client
   secret**. Copy both. Treat the secret like a password — never
   post it in the app, in a message thread, or in GitHub.

## Step 4 — Put them into Render

1. Open https://dashboard.render.com/ and open the
   `neighborhood-cats` web service.
2. Go to **Environment** (left menu).
3. Add these three environment variables (exact names):
   - `GOOGLE_CLIENT_ID` = the Client ID from Step 3
   - `GOOGLE_CLIENT_SECRET` = the Client secret from Step 3
   - `GOOGLE_CALLBACK_URL` = `https://neighborhood-cats.onrender.com/auth/google/callback`
   - `SESSION_SECRET` = a long random string you make up (for
     example, 32+ random letters/numbers — keep it private; changing
     it later signs everyone out, which is safe, just inconvenient)
4. Click **Save Changes**. Render will restart/redeploy the
   service automatically. Wait for it to say Live again.

## Step 5 — Test it

1. Open https://neighborhood-cats.onrender.com in Chrome.
2. Tap **Sign in with Google**. Google should ask you to pick an
   account and approve sign-in.
3. You are sent back to the app. Because this is your first
   sign-in, you will see **Finish setting up your account — ZIP
   only**: enter your 5-digit Maine ZIP, tap **Confirm my
   location** for GPS confirmation, tap **Check my town**, and
   confirm "Looks like you're in [Town], [County] County — is
   that right?" with **Yes**.
4. You are now signed in with your town set. Sign out, then sign
   in again on a different phone/browser — your profile and your
   cats should be right there.

## If sign-in fails

- `redirect_uri_mismatch`: the Authorized redirect URI in Google
  Cloud does not exactly match `GOOGLE_CALLBACK_URL` in Render.
  Copy it character for character, no trailing slash.
- "Google sign-in is not set up yet" in the app: Render does not
  have `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set, or the
  service has not restarted since you added them.
- "This app isn't verified" / test-user error: the OAuth consent
  screen is still in Testing and the person trying to sign in is
  not a test user. Publish the app (Step 2, point 5), or add them
  as a test user for a trial.
- Sign-in works but the town is wrong: use **Change town** in My
  Profile, enter the correct ZIP, GPS-confirm, and confirm the
  auto-filled town. If the ZIP is not in the lookup, pick county
  and town manually — nothing is guessed.

## For local testing (developers only)

Set the same four variables in your shell before `npm start`, with
`GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback`
(or whatever port you use), and add that exact URI as a second
Authorized redirect URI in Google Cloud. Never commit real
credentials to GitHub.
