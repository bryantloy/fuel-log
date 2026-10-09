# Validation — October 9, 2026

Automated browser tests ran in headless Chromium at a 430 × 932 viewport against the packaged index.html, running.js, and running.css, using synthetic legacy data.

Passed:
- App startup and Run navigation with no JavaScript page errors.
- Legacy meals, favorites, profile, exercise swaps, and lifting history retained.
- Screenshot example loading, avoiding duplicates on repeated loads.
- Date movement, swapping two sessions, and undo.
- Desktop native drag-and-drop into a destination day.
- Workout creation with six 400-meter repeats and correct distance conversion.
- Date arithmetic across week and year boundaries.
- Persistence after page reload and schema version retention.
- Outdoor/treadmill detail display.
- Linking an existing activity without adding a duplicate run.
- Full JSON backup restoration retains the expected saved state.
- Deleting a linked activity returns its prescription to planned.
- JavaScript syntax checks for running.js and sw.js.
- Visual inspection of the mobile-width calendar and workout detail dialog.

Limitations:
- No Vercel production deployment or API request was made.
- Physical Android/iOS touch dragging remains a user-device check; Move / Swap provides an alternative.
- The service worker's offline flow was reviewed but not exercised against the real hosted app and its icons/manifest.
- No Supabase, Garmin connection, watch transfer, or training-plan generator is implemented or claimed.
- Screenshot mileage is preserved as displayed; some distances and totals are rounded by the source.
