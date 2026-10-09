# Running calendar update — first review package

This is an update for bryantloy/fuel-log, based on index.html blob a0f88f712f6bd653a4dc2bc71fd9bf8613606939. It is not a complete replacement repository. Existing BUILD.LOG branding is retained pending a naming decision.

## Upload

1. In your existing app, use Goals → Backup to download your current data first.
2. Extract this ZIP on your computer.
3. In GitHub, create a development branch from your current main branch, e.g. running-calendar-v1.
4. Upload these four files to the repository root: index.html, running.js, running.css, sw.js. Replace the existing index.html and sw.js. Keep your api folder, icons, manifest, and other existing files.
5. Commit on the development branch. Open its Vercel preview if your project provides branch previews. The preview starts with its own browser storage; you can restore your backup there without changing the production site's storage.
6. Test Run, Today, Lift, and Goals. When satisfied, merge the branch using GitHub. Refresh the existing production app to load the update. Your production data uses the same fuellog_v6 key and origin.

Do not upload the ZIP itself expecting GitHub to extract it. START-HERE.md and QA-NOTES.md are optional documentation, not required runtime files. If main has changed since the reviewed version, compare index.html before replacing it so newer work is not lost.

## Use it

Open RUN. The race date defaults to January 31, 2027 and can be edited. Add a workout or use “Load screenshot examples.” The examples cover October 12–November 8, 2026 and load only once per date. Nothing is automatically marked complete.

Five sessions include supplied steps: Steady into Tempo, 400s into 200s, Tempo 2 Miles, Pyramid Intervals, and the 14-mile Progressive Long Run. Other sessions are marked “Details needed”; their calendar totals are not full prescriptions. October 5–11 was not seeded because the screenshot mixes completed mileage with planned mileage and does not establish every original prescription. Exact distances in the examples use the values displayed in screenshots: 0.12 miles is not silently changed to 200 meters. This can create small differences from Runna's rounded weekly totals.

Use the handle on a card to drag it to another day. On touch screens, hold the handle briefly and drag; the calendar scrolls near its edges. Move / Swap is available on every card for reliable date selection across any number of weeks. Dropping onto a day opens a choice: move/stack, or swap with an eligible workout. Undo restores the last calendar change in the current session. It is cleared after recording or linking an activity and after reload.

Workout editor supports step reordering, miles/meters/minutes/seconds, repeat counts, timed walking/jogging/rest recoveries after each repeat, conversational targets, pace caps, targets, and ranges. Use separate steps for pyramid or progressive segments. Arbitrarily nested repeat groups are not supported in this first release.

Details provides Outdoor / Treadmill display, skip/restore, and completed-run or lift logging. Link an existing activity instead of logging it again. Completed prescriptions are locked against moves and edits. Deleting a prescription retains its activity; deleting a linked activity in Today returns its prescription to planned.

Weekly planned miles exclude skipped sessions and strength. Weekly logged miles use actual activity dates. Planned nutrition targets reuse the app's existing estimation formulas and incorporate active planned runs. They are estimates; logged activity calorie totals retain the existing app's precedence. Conflicts involving long runs, hard runs, and strength on the same or adjacent days are highlighted for review, without automatically changing the plan.

## Backups and storage

All data remains in the browser on this device and site origin. Existing food logs, favorites, profile, lift history, and exercise swaps are retained. Full backup restore now includes these fields and running data. Restore asks for confirmation; supplied settings and matching dates replace existing values, while other dates remain. Download a backup before restoring. A local pre-restore snapshot is also retained under fuellog_before_restore.

A separate Supabase project is a suitable next step for Fuel Log so it can stay independent of the cards app. No account setup, SQL, keys, or cloud changes are required for this package. Cloud sign-in, multi-device synchronization, ownership rules, conflict handling, and local-to-cloud migration still need implementation. Do not put a Supabase service-role key into browser code.

Garmin Connect is not connected. The UI explicitly says so. This package does not send workouts to a watch, provide a FIT export, run a live workout, or generate a complete marathon plan. Continue using Runna for its current plan and watch delivery while those capabilities are developed.

## Review checklist

- Restore a backup into the preview and check food history, favorites, profile, and lifting history.
- Load examples; move a workout across weeks, swap, stack, undo, and reload.
- Open the five detailed workouts and compare the steps against your screenshots.
- Try touch dragging on your actual phone; Move / Swap works if the browser's drag behavior differs.
- Link a completed activity and verify that actual mileage is counted once.
- Edit a repeat block and check outdoor/treadmill views.
- Export and restore a backup.
- After visiting online, test offline reopening. AI photo analysis still requires connectivity.

Production deployment, physical-phone touch behavior, and Garmin behavior were not tested in this environment. See QA-NOTES.md for automated checks.
