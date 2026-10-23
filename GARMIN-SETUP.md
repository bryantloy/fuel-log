# Garmin Personal API update

Adds a **Sync Garmin** button to the Run tab. It pulls the last 14 days of runs and recovery data (sleep, HRV, Body Battery) from your own Garmin Connect account.

- New runs are added to your logs and matched to a planned workout when exactly one planned run is on that date (with View set to Both and two plans on the same day, it stays unmatched; use Link).
- A run you already logged by hand (same date, within 0.15 mi) is not duplicated; it just gets the Garmin ID.
- Re-syncing never creates duplicates. Nothing syncs automatically; tap the button.
- Recovery for the last 7 days shows at the top of the Run tab.

## 1. Create the Garmin key
Garmin Connect (web) > Settings > Personal API > accept the terms > pick 1 year > Create. Garmin shows the key once. Copy it. Do not paste it into chat, GitHub, or the app.

## 2. Add two Vercel environment variables
Vercel > the fuel-log project > Settings > Environment Variables (Production, Preview, Development):

- `GARMIN_PERSONAL_API_KEY` = the key from step 1
- `GARMIN_ALLOWED_EMAIL` = the email you sign in with under Goals > Account & Cloud

The second one locks the endpoint to your account. Without it the function refuses every request.

## 3. Upload the files
Back up first (Goals > Backup). Upload to the repo root and commit:

- Add `api/garmin.mjs` (goes in the existing `api` folder)
- Replace `index.html`, `running.js`, `running.css`, `sw.js`

Vercel must redeploy after the env vars are set. If you added them after the last deploy, redeploy.

## 4. Check it
1. Open `https://YOUR-APP/api/garmin` in a browser. Expect `{"keyPresent":true,"allowedEmailPresent":true}`.
2. In the app, sign in under Goals > Account & Cloud, go to Run, tap **Sync Garmin**.
3. Then use **Save to cloud** so other devices get the synced runs.

## Limits and upkeep
- Read-only. Nothing is sent to your watch.
- The key expires (at most a year). When sync says Garmin rejected the key, create a new one and update the Vercel variable.
- Garmin's rate limits are unpublished and may change. The key is for your own use only; do not share it or build for other people on it.
- Field names for activities, sleep, HRV and Body Battery follow Garmin Connect's usual layout and were tested against mocked responses, not a live account. If a value shows blank after your first sync, tell Claude which one; the function has a `raw=1` debug option that returns Garmin's unmodified response.
