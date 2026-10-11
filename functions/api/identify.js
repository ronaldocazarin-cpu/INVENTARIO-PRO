// Función de servidor (Cloudflare Pages Functions): reconoce un producto por foto con Claude.
// La llave de Anthropic vive SOLO aquí, como secreto ANTHROPIC_API_KEY. Nunca llega al teléfono.
const SUPABASE_URL = "https://rijcgesumcbmvtbjphrc.supabase.co";
const SUPABASE_KEY = "sb_publishable_xayfLWFfX-1LhOqzkWu38Q_eYNXMMMt"; // llave pública
const MODEL = "claude-haiku-5-5";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);

  // 1) Solo usuarios con sesión iniciada
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "auth" }, 401);
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!who.ok) return json({ error: "auth" }, 401);

  // 2) Foto recibida
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const image = body && body.image;
  if (typeof image !== "string" || image.length < 100 || image.length > 6_000_000) {
    return json({ error: "bad_image" }, 400);
  }

  // 3) Catálogo del propio negocio (las reglas de seguridad de Supabase lo filtran por usuario)
  const pr = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=id,name,barcode,category&order=name&limit=500`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
  );
  if (!pr.ok) return json({ error: "catalog" }, 502);
  const products = await pr.json();
  if (!products.length) return json({ matches: [] });

  const catalog = products
    .map((p) => `${p.id} | ${p.name} | ${p.category || "sin categoría"} | código ${p.barcode || "-"}`)
    .join("\n");
  const prompt =
    `Eres parte de un sistema de inventario para una tienda. Te doy la foto de un producto que se está vendiendo y la lista de productos del catálogo (id | nombre | categoría | código de barras):\n\n${catalog}\n\n` +
    `Identifica cuáles productos del catálogo podrían ser el de la foto, del más al menos probable (máximo 3). ` +
    `Si el producto no se parece a ninguno, responde con una lista vacía. No inventes ids.\n` +
    `Responde SOLO con JSON: {"matches":[{"id":"<id exacto del catálogo>","confidence":0.0-1.0}]}`;

  // 4) Pregunta a Claude
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  if (r.status === 429) return json({ error: "rate_limited" }, 429);
  if (!r.ok) return json({ error: "upstream" }, 502);

  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed = { matches: [] };
  try {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : text);
  } catch { /* respuesta no válida: se devuelve lista vacía */ }

  const valid = new Set(products.map((p) => p.id));
  const matches = (Array.isArray(parsed.matches) ? parsed.matches : [])
    .filter((m) => valid.has(String(m.id)))
    .slice(0, 3)
    .map((m) => ({ id: String(m.id), confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0.5)) }));
  return json({ matches });
}
