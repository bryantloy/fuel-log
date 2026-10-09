# Supabase cloud update

This package updates the running-calendar version currently in `bryantloy/fuel-log`. The source files were fetched from GitHub on October 9, 2026 before this package was built.

It also adds a complete 16-week Bryant comparison marathon plan, a Both/Bryant/Runna view control, Saturday long runs, deliberate recovery weeks, and marathon-pace decision gates. See `BRYANT-MARATHON-PLAN.md` for the training logic.

The Goals screen now includes a Workout Fueling Lab. It stores recipes, scales ingredient batches, assigns recipes and hourly targets to planned workouts, and records actual servings plus GI feedback. It includes four gel recipes and four drink recipes spanning light training, standard long-run, high-carbohydrate, and high-sodium use cases.

## 1. Install the database table and policy

Open the new Supabase project, select **SQL Editor**, create a new query, paste the complete contents of `supabase-setup.sql`, and run it once. A successful run should complete without an error. The script creates one cloud-state row per account, enables row-level security, permits each signed-in person to read only their own row, and requires writes to pass a revision check.

The publishable key is bundled in `cloud.js`, which is the intended use for that key. Do not add the database password, connection string, secret key, or service-role key to GitHub or the browser app.

## 2. Configure authentication URLs

In Supabase, open **Authentication → URL Configuration**. Set **Site URL** to the live app URL. Add the live URL and any Vercel preview URL pattern you intend to use under redirect URLs. Email/password authentication is enabled by default on hosted projects, and email confirmation is normally enabled.

## 3. Upload the app update

Back up the live app first using **Goals → Backup**. Extract this ZIP, then upload these files to the root of the existing `fuel-log` repository:

- Replace `index.html`
- Replace `sw.js`
- Replace `running.js`
- Replace `running.css`
- Add `cloud.js`
- Add `cloud.css`
- Add `fueling.js`
- Add `fueling.css`

`supabase-setup.sql`, this file, and `QA-NOTES.md` are documentation/setup files. They do not need to be served by the app.

Commit the files. When Vercel finishes, refresh the app. If the old version remains, fully close and reopen the installed app or browser tab once; the updated service worker uses a new cache version.

## 4. Make the first cloud copy

On the device that already contains your real logs:

1. Download a local backup.
2. Open **Goals → Account & Cloud**.
3. Create an account with your email and a password of at least eight characters.
4. Confirm the email if Supabase asks you to. Return to the app and sign in.
5. Choose **Check cloud**. It should say no cloud copy exists.
6. Choose **Save to cloud** and accept the first-upload confirmation. Wait for “Cloud save confirmed.”

Signing in never uploads or replaces local data. Cloud saves are manual.

On another device, sign in with the same account, choose **Check cloud**, then **Load from cloud**. Loading replaces that device’s app state after saving a local recovery snapshot. Download a local backup first if the second device contains changes you may want to keep.

## Conflict behavior

Each cloud save increments a revision. A new or stale device cannot overwrite an existing cloud copy. Load the newer cloud copy first, make changes, and save again. The first version does not merge two independently edited devices. A reliable workflow is: load before editing on a second device; save when finished.

Signing out removes the local authentication session but leaves the local logs on that device. Use the app only on a private device. Each Supabase account can access only its own cloud row under the installed policy.

## Recovery

- Normal JSON backups still work.
- A standard restore keeps a pre-restore snapshot in browser storage.
- A cloud load keeps the prior state under `fuellog_before_cloud_load`.
- If the app says database setup is missing, rerun `supabase-setup.sql`.
- If the confirmation email redirects incorrectly, correct the Supabase Site URL and redirect URLs.

This update does not connect Garmin or automatically synchronize every keystroke. It provides the account and storage foundation needed for later integrations.
