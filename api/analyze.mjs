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
            { type: "text", text: PHOTO_PROMPT + (body.hint ? `\n\nUser hint about this meal: ${body.hint}` : "") },
          ],
        },
      ];
    } else if (body.query) {
      messages = [{ role: "user", content: TEXT_PROMPT(String(body.query).slice(0, 300)) }];
    } else {
      return res.status(400).json({ error: "Send either image or query" });
    }

    const { data } = await callAnthropic(key, { max_tokens: 1200, messages });
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
