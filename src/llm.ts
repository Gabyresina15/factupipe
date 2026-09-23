import { decideStatus, KEY_FIELDS } from "./schema.js";

export async function maybeEnrichWithLlm(rules: Record<string, unknown>) {
  const missing = KEY_FIELDS.some((k) => rules[k] == null || rules[k] === "");
  const needLlm = rules.status === "partial" || rules.status === "failed" || missing;

  if (!needLlm) return { ...rules, extraction: "rules" };
  if (!process.env.LLM_API_KEY) return { ...rules, extraction: "rules" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);

  try {
    const body = {
      model: process.env.LLM_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extrae de una factura argentina. Devuelve JSON con claves: cuit, razonSocial, nroFactura, fecha, neto, iva, total, moneda. Numeros como number. cuit con guiones NN-NNNNNNNN-N. Sin texto extra.",
        },
        { role: "user", content: String(rules.rawText ?? "").slice(0, 6000) },
      ],
    };

    const r = await fetch(`${process.env.LLM_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!r.ok) return { ...rules, extraction: "rules" };

    const json = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;

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
      extraction: "hybrid",
    };
    return { ...merged, status: decideStatus(merged) };
  } catch {
    return { ...rules, extraction: "rules" };
  } finally {
    clearTimeout(timer);
  }
}
