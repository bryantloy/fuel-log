// Server-side only. The Garmin Personal API key is read from Vercel env vars and is
// NEVER sent to the browser or stored in this repo.
//
// Env vars (Vercel > Settings > Environment Variables):
//   GARMIN_PERSONAL_API_KEY  key created in Garmin Connect > Settings > Personal API
//   GARMIN_ALLOWED_EMAIL     the email you sign in with under Goals > Account & Cloud
//
// Every data request must carry your Supabase session token. The function verifies it
// with Supabase and only answers for GARMIN_ALLOWED_EMAIL, so the public app URL cannot
// be used to read your Garmin data. If either env var is missing, it fails closed.

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_URL = BASE + "/personalapitoken-service/personal-api/personal-api-key/token";
const SUPABASE_URL = "https://wxfftyyoauhgxeilcoug.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uumukcSzMzJj5mbzR_8qlA_60UhfLEN";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 28; // shortest documented window across the health endpoints

let cached = null; // { token, exp } lives only while this serverless instance is warm

function jwtExp(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(part, "base64").toString("utf8")).exp * 1000;
  } catch {
    return 0;
  }
}

async function getToken(apiKey) {
  if (cached && cached.key === apiKey && cached.exp - Date.now() > 60 * 60 * 1000) return cached.token;
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: "ApiKey " + apiKey } });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error("Garmin token exchange failed (HTTP " + r.status + ")");
    e.status = r.status;
    throw e;
  }
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  const token = body && (body.access_token || body.accessToken || body.token);
  if (!token) throw new Error("Garmin token response had no access token");
  cached = { token, key: apiKey, exp: jwtExp(token) || Date.now() + 23 * 60 * 60 * 1000 };
  return token;
}

async function garminGet(apiKey, path) {
  const token = await getToken(apiKey);
  let r = await fetch(BASE + path, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (r.status === 401) {
    cached = null;
    const fresh = await getToken(apiKey);
    r = await fetch(BASE + path, { headers: { Authorization: "Bearer " + fresh, Accept: "application/json" } });
  }
  if (!r.ok) {
    const e = new Error("Garmin returned HTTP " + r.status + " for " + path.split("?")[0]);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function verifyUser(req) {
  const allowed = (process.env.GARMIN_ALLOWED_EMAIL || "").trim().toLowerCase();
  if (!allowed) return { ok: false, code: 500, error: "GARMIN_ALLOWED_EMAIL is not set in Vercel." };
  const auth = req.headers["authorization"] || "";
  if (!/^Bearer\s+\S+/.test(auth)) return { ok: false, code: 401, error: "Sign in under Goals > Account & Cloud first." };
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: auth },
  });
  if (!r.ok) return { ok: false, code: 401, error: "Your sign-in has expired. Sign in again under Goals > Account & Cloud." };
  const user = await r.json();
  if (!user || String(user.email || "").toLowerCase() !== allowed) {
    return { ok: false, code: 403, error: "This account is not allowed to use the Garmin connection." };
  }
  return { ok: true };
}

function ymd(s) { return new Date(s + "T12:00:00Z"); }
function addDays(s, n) { const d = ymd(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function windows(start, end) {
  const out = [];
  for (let s = start; s <= end; s = addDays(s, MAX_DAYS)) {
    const e = addDays(s, MAX_DAYS - 1);
    out.push([s, e < end ? e : end]);
  }
  return out;
}

const RUN_TYPES = new Set(["running", "treadmill_running", "trail_running", "track_running", "indoor_running", "virtual_run", "street_running"]);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Field names follow the Garmin Connect activity list convention. Use ?raw=1 while signed in
// to see exactly what Garmin returned if a value ever comes back empty.
function normalizeActivity(a) {
  const typeKey = (a.activityType && a.activityType.typeKey) || a.activityTypeKey || "";
  const meters = num(a.distance);
  const seconds = num(a.movingDuration) ?? num(a.duration);
  return {
    id: String(a.activityId),
    name: a.activityName || "",
    typeKey,
    isRun: RUN_TYPES.has(typeKey),
    date: String(a.startTimeLocal || "").slice(0, 10),
    miles: meters == null ? null : meters / 1609.344,
    minutes: seconds == null ? null : seconds / 60,
    calories: num(a.calories),
    avgHr: num(a.averageHR),
    maxHr: num(a.maxHR),
    trainingEffect: num(a.aerobicTrainingEffect),
    vo2max: num(a.vO2MaxValue),
  };
}

function pick(obj, keys) {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return null;
}

async function recovery(apiKey, start, end, raw) {
  const days = {};
  const rawOut = {};
  const put = (date, patch) => { if (DATE.test(date || "")) days[date] = Object.assign(days[date] || {}, patch); };
  const errors = [];

  for (const [s, e] of windows(start, end)) {
    try {
      const sleep = await garminGet(apiKey, `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${s}&endDate=${e}`);
      if (raw) (rawOut.sleep = rawOut.sleep || []).push(sleep);
      const rows = Array.isArray(sleep) ? sleep : pick(sleep, ["dailySleepSummaries", "summaries", "sleepSummaries"]) || [];
      for (const r of rows) {
        const date = pick(r, ["calendarDate", "date"]);
        const secs = num(pick(r, ["sleepTimeSeconds", "totalSleepSeconds"]));
        const score = num(pick(r, ["sleepScore", "overallScore"])) ?? num(r.sleepScores && r.sleepScores.overall && r.sleepScores.overall.value);
        put(date, { sleepHours: secs == null ? null : Math.round((secs / 3600) * 10) / 10, sleepScore: score });
      }
    } catch (err) { errors.push("sleep: " + err.message); }

    try {
      const hrv = await garminGet(apiKey, `/hrv-service/hrv/daily/${s}/${e}`);
      if (raw) (rawOut.hrv = rawOut.hrv || []).push(hrv);
      const rows = Array.isArray(hrv) ? hrv : pick(hrv, ["hrvSummaries", "dailyHrv", "summaries"]) || [];
      for (const r of rows) {
        put(pick(r, ["calendarDate", "date"]), {
          hrv: num(pick(r, ["lastNightAvg", "avgOvernightHrv", "weeklyAvg"])),
          hrvStatus: pick(r, ["status", "hrvStatus"]),
        });
      }
    } catch (err) { errors.push("hrv: " + err.message); }

    try {
      const bb = await garminGet(apiKey, `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${s}&endDate=${e}`);
      if (raw) (rawOut.bodyBattery = rawOut.bodyBattery || []).push(bb);
      const rows = Array.isArray(bb) ? bb : pick(bb, ["reports", "dailyReports"]) || [];
      for (const r of rows) {
        // bodyBatteryValuesArray is a list of [timestamp, level] pairs for the day.
        const levels = Array.isArray(r.bodyBatteryValuesArray)
          ? r.bodyBatteryValuesArray.map((p) => (Array.isArray(p) ? p[1] : null)).filter((v) => typeof v === "number")
          : [];
        put(pick(r, ["date", "calendarDate"]), {
          bodyBatteryHigh: levels.length ? Math.max(...levels) : num(pick(r, ["highestValue", "max"])),
          bodyBatteryLow: levels.length ? Math.min(...levels) : num(pick(r, ["lowestValue", "min"])),
        });
      }
    } catch (err) { errors.push("bodyBattery: " + err.message); }
  }
  return { days, errors, raw: raw ? rawOut : undefined };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });

  const q = req.query || {};
  const action = String(q.action || "status");
  const apiKey = (process.env.GARMIN_PERSONAL_API_KEY || "").trim();

  // Config check: shows only whether the env vars exist, never their values.
  if (action === "status" && !req.headers["authorization"]) {
    return res.status(200).json({
      keyPresent: Boolean(apiKey),
      allowedEmailPresent: Boolean((process.env.GARMIN_ALLOWED_EMAIL || "").trim()),
    });
  }

  if (!apiKey) return res.status(500).json({ error: "GARMIN_PERSONAL_API_KEY is not set in Vercel. Add it, then redeploy." });

  try {
    const who = await verifyUser(req);
    if (!who.ok) return res.status(who.code).json({ error: who.error });

    if (action === "status") {
      await getToken(apiKey);
      return res.status(200).json({ ok: true, message: "Garmin connection is live." });
    }

    const start = String(q.start || "");
    const end = String(q.end || "");
    if (!DATE.test(start) || !DATE.test(end) || start > end) return res.status(400).json({ error: "Send start and end as YYYY-MM-DD." });
    if ((ymd(end) - ymd(start)) / 86400000 > 90) return res.status(400).json({ error: "Ask for 90 days or fewer at a time." });
    const raw = q.raw === "1";

    if (action === "activities") {
      const list = await garminGet(
        apiKey,
        `/activitylist-service/activities/search/activities?start=0&limit=50&startDate=${start}&endDate=${end}`
      );
      const rows = Array.isArray(list) ? list : [];
      return res.status(200).json({ activities: rows.map(normalizeActivity), raw: raw ? rows : undefined });
    }

    if (action === "recovery") {
      return res.status(200).json(await recovery(apiKey, start, end, raw));
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    const expired = err.status === 401 || err.status === 403;
    return res.status(expired ? 401 : 502).json({
      error: expired
        ? "Garmin rejected the key. It may be wrong or expired. Create a new one in Garmin Connect and update the Vercel env var."
        : err.message || "Garmin request failed",
    });
  }
}
