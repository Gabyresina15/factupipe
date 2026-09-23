import { decideStatus, KEY_FIELDS } from "./schema.js";
import { completeJson, qvacReady, initQvac } from "./qvac.js";

function buildPrompt(rawText: string) {
  return `Analiza este texto extraído de una factura argentina.
Devuelve ÚNICAMENTE un JSON válido con estas claves:
cuit (formato NN-NNNNNNNN-N), razonSocial, nroFactura, fecha, neto (número), iva (número), total (número), moneda (ARS o USD).

TEXTO:
${rawText.slice(0, 3500)}`;
}

async function cloudComplete(rawText: string): Promise<Record<string, unknown> | null> {
  if (!process.env.LLM_API_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(`${process.env.LLM_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Extrae factura AR. JSON: cuit, razonSocial, nroFactura, fecha, neto, iva, total, moneda." },
          { role: "user", content: rawText.slice(0, 6000) },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function maybeEnrichWithLlm(rules: Record<string, unknown>) {
  const missing = KEY_FIELDS.some((k) => rules[k] == null || rules[k] === "");
  const needLlm = rules.status === "partial" || rules.status === "failed" || missing;
  if (!needLlm) return { ...rules, extraction: "rules" };

  const raw = String(rules.rawText ?? "");
  if (!raw.trim()) return { ...rules, extraction: "rules" };

  let parsed: Record<string, unknown> | null = null;
  let via: "llm" | "hybrid" = "hybrid";

  if (process.env.QVAC_ENABLED !== "0") {
    try {
      if (!qvacReady()) await initQvac();
      parsed = await completeJson(buildPrompt(raw));
    } catch (e) {
      console.error("[QVAC LLM] fallback", e);
    }
  }

  if (!parsed) parsed = await cloudComplete(raw);

  if (!parsed) return { ...rules, extraction: "rules" };

  const merged = {
    ...rules,
    cuit: rules.cuit ?? parsed.cuit,
    razonSocial: rules.razonSocial ?? parsed.razonSocial,
    nroFactura: rules.nroFactura ?? parsed.nroFactura,
    fecha: rules.fecha ?? parsed.fecha,
    neto: rules.neto ?? parsed.neto,
    iva: rules.iva ?? parsed.iva,
    total: rules.total ?? parsed.total,
    moneda: rules.moneda ?? parsed.moneda ?? "ARS",
    extraction: via,
  };
  return { ...merged, status: decideStatus(merged) };
}
