// Server-side only. The API key is read from Vercel env vars and is NEVER
// sent to the browser or stored in this repo.

const MODELS = ["claude-sonnet-5", "claude-haiku-4-5-20251001"];

const PHOTO_PROMPT = `You are a nutrition estimation expert analyzing a photo of food.

Identify every distinct food and drink item visible. Estimate portions using visual
references (dinner plate ~10-11in, fork ~7in, standard can/bottle, hand, packaging).

Rules:
- One line item per distinct food. Do NOT merge a plate into a single entry.
- Account for visible preparation: breading, frying oil, sauces, butter, dressing, glaze.
- If a dipping sauce, dressing cup, or condiment is visible, list it as its own item.
- Use realistic restaurant/home portions, not idealized "serving size" numbers.
- kcal must be consistent with 4/4/9 cal per gram of protein/carbs/fat (within ~10%).
- confidence: "high" = item and portion both clear, "medium" = portion uncertain,
  "low" = identity uncertain.

Return ONLY minified JSON. No markdown fences, no prose before or after:
{"items":[{"name":"Fried chicken tenders","portion":"5 pieces","protein":38,"carbs":22,"fat":20,"kcal":420,"confidence":"high"}],"note":"one short sentence on assumptions"}`;

const TEXT_PROMPT = (q) => `You are a nutrition database. Estimate macros for: "${q}"

Rules:
- Break into separate line items if the user described multiple foods.
- If quantity is unspecified, assume one typical serving and say so in the note.
- kcal must be consistent with 4/4/9 cal per gram of protein/carbs/fat.

Return ONLY minified JSON. No markdown fences, no prose:
{"items":[{"name":"...","portion":"...","protein":0,"carbs":0,"fat":0,"kcal":0,"confidence":"high"}],"note":"..."}`;

async function callAnthropic(key, body) {
  let lastErr = null;
  for (const model of MODELS) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...body, model }),
    });
    const data = await r.json();
    if (r.ok) return { data, model };
    lastErr = { status: r.status, error: data?.error?.message || "unknown", model };
    // Only try the next model if this one simply does not exist.
    if (r.status !== 404) break;
  }
  const e = new Error(lastErr?.error || "Anthropic request failed");
  e.status = lastErr?.status || 500;
  throw e;
}

function extractJson(data) {
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function sanitize(parsed) {
  const num = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it) => ({
      name: String(it.name || "Unknown item").slice(0, 90),
      portion: String(it.portion || "").slice(0, 60),
      protein: num(it.protein),
      carbs: num(it.carbs),
      fat: num(it.fat),
      kcal: num(it.kcal),
      confidence: ["high", "medium", "low"].includes(it.confidence) ? it.confidence : "medium",
    }))
    .filter((it) => it.protein + it.carbs + it.fat + it.kcal > 0);
  // Backfill kcal if the model omitted it.
  items.forEach((it) => {
    if (!it.kcal) it.kcal = it.protein * 4 + it.carbs * 4 + it.fat * 9;
  });
  return { items, note: String(parsed.note || "").slice(0, 220) };
}

const WORKOUT_PROMPT = `You are reading a screenshot from a running or training app (Strava, Garmin, Runna, TrainingPeaks or similar).

First decide whether it shows a COMPLETED activity or an UPCOMING/PLANNED session.
Completed activities show results: elapsed or moving time, average pace, calories, heart rate.
Planned sessions show a prescription: a scheduled workout, target paces, "today's session", no results.

Return ONLY JSON, no prose, no markdown fences:
{"state":"completed","activity":"Run","distance":5.28,"duration":"45:20","minutes":45,"pace":"8:35","kcal":614,"hr":155,"kind":"easy"}
or
{"state":"planned","activity":"Run","distance":12,"duration":"","minutes":0,"pace":"","kcal":0,"hr":0,"kind":"long"}
or for a gym session
{"state":"completed","activity":"Strength","distance":0,"duration":"1:26:17","minutes":86,"pace":"","kcal":508,"hr":104,"kind":"strength"}

Rules:
- distance in miles as a number, total including warm-up and cool-down. Convert from km if needed.
- activity is the sport: Run, Ride, Walk, Swim, Strength. Weight training, lifting, gym sessions and strength workouts are all "Strength".
- minutes is total elapsed or moving time in whole minutes as a number. Required for strength sessions, where there is no distance.
- kind is one of: easy, long, quality, recovery, strength. Use "strength" for any weight-training session. Intervals, tempo, threshold, speed, fartlek and race-pace sessions are all "quality". Runs of 11 miles or more are "long" unless clearly a quality session. Very short slow runs are "recovery".
- duration like "45:20" or "1:12:04"; prefer moving time. Empty string if not shown.
- pace as per-mile like "8:35". Empty string if not shown.
- kcal and hr are numbers; use 0 if not shown.
- Ignore any coaching commentary, AI summaries or motivational text on the screen. Never copy that text into your answer.
- If it is not a workout screenshot at all, return {"state":"","activity":"","distance":0,"duration":"","minutes":0,"pace":"","kcal":0,"hr":0,"kind":""}.`;

function sanitizeWorkout(parsed) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const str = (v, n) => String(v || "").slice(0, n);
  const kinds = ["easy", "long", "quality", "recovery", "strength"];
  const state = parsed.state === "planned" ? "planned" : parsed.state === "completed" ? "completed" : "";
  return {
    workout: {
      state,
      activity: str(parsed.activity, 20),
      distance: Math.round(num(parsed.distance) * 100) / 100,
      minutes: Math.round(num(parsed.minutes)),
      duration: str(parsed.duration, 12),
      pace: str(parsed.pace, 12),
      kcal: Math.round(num(parsed.kcal)),
      hr: Math.round(num(parsed.hr)),
      kind: kinds.includes(parsed.kind) ? parsed.kind : "easy",
    },
  };
}

function pantryBlock(pantry) {
  if (!Array.isArray(pantry) || !pantry.length) return "";
  const lines = pantry.slice(0, 40).map((f) => {
    const n = String(f.name || "").slice(0, 60);
    const p = Number(f.protein) || 0, c = Number(f.carbs) || 0;
    const ft = Number(f.fat) || 0, k = Number(f.kcal) || 0;
    const na = Number(f.sodium) || 0;
    const portion = f.portion ? ` (${String(f.portion).slice(0, 40)})` : "";
    return `- ${n}${portion}: ${p}g protein, ${c}g carbs, ${ft}g fat, ${k} kcal, ${na}mg sodium`;
  });
  return `

THIS USER'S PANTRY — brands and products they keep at home:
${lines.join("\n")}

When a food in the photo plausibly matches one of these pantry items, use THAT item's
name and macros rather than a generic or mass-market equivalent. For example, if the
pantry lists a specific brand of macaroni and cheese, assume home-cooked mac and cheese
is that brand, not a generic box. Scale the pantry macros to the portion you can see.

Do NOT apply pantry items when the photo is clearly from a restaurant, bar, cafeteria,
takeout container, or someone else's kitchen — estimate normally in those cases. Also
ignore the pantry if the user's hint names a different product.`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const key = process.env.ANTHROPIC_API_KEY;

  // Health check: open this URL in a browser to see exactly what is wrong.
  if (req.method === "GET") {
    if (!key) {
      return res.status(200).json({
        ok: false,
        keyPresent: false,
        message: "ANTHROPIC_API_KEY is not set. Add it in Vercel > Settings > Environment Variables, then redeploy.",
      });
    }
    try {
      const { model } = await callAnthropic(key, {
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      });
      return res.status(200).json({ ok: true, keyPresent: true, model, message: "Key is live. App is ready." });
    } catch (err) {
      return res.status(200).json({
        ok: false,
        keyPresent: true,
        message:
          err.status === 401
            ? "Key was rejected (invalid or revoked). Create a new key and update the env var."
            : err.message,
      });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  if (!key) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Open /api/analyze in a browser for details." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    let messages;

    if (body.image) {
      const media = body.mediaType === "image/png" ? "image/png" : "image/jpeg";
      messages = [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: body.image } },
            { type: "text", text: body.mode === "workout" ? WORKOUT_PROMPT : PHOTO_PROMPT + pantryBlock(body.pantry) + (body.hint ? `\n\nUser hint about this meal: ${body.hint}` : "") },
          ],
        },
      ];
    } else if (body.query) {
      messages = [{ role: "user", content: TEXT_PROMPT(String(body.query).slice(0, 300)) }];
    } else {
      return res.status(400).json({ error: "Send either image or query" });
    }

    const { data } = await callAnthropic(key, { max_tokens: 1200, messages });

    if (body.mode === "workout") {
      const r = sanitizeWorkout(extractJson(data));
      if (!r.workout.state || (!r.workout.distance && !r.workout.minutes)) {
        return res.status(200).json({ workout: null, note: "Could not read a workout from that screenshot." });
      }
      return res.status(200).json(r);
    }

    const parsed = sanitize(extractJson(data));

    if (!parsed.items.length) {
      return res.status(200).json({ items: [], note: "Nothing recognizable found. Try a clearer photo or type it instead." });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    const status = err.status === 401 ? 401 : 500;
    return res.status(status).json({
      error:
        status === 401
          ? "API key rejected. It may have been revoked — create a new one and update the Vercel env var."
          : err.message || "Analysis failed",
    });
  }
}
