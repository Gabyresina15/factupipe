import { decideStatus, KEY_FIELDS } from "./schema.js";
import { completeJson, qvacReady, initQvac } from "./qvac.js";

function buildPrompt(rawText: string) {
  return `Analiza este texto extraído de una factura argentina.
Devuelve ÚNICAMENTE un JSON válido con estas claves:
cuit (formato NN-NNNNNNNN-N), razonSocial, nroFactura, fecha, neto (número), iva (número), total (número), moneda (ARS o USD).

TEXTO:
${rawText.slice(0, 3500)}`;
}

export async function maybeEnrichWithLlm(rules: Record<string, unknown>) {
  const missing = KEY_FIELDS.some((k) => rules[k] == null || rules[k] === "");
  const needLlm = rules.status === "partial" || rules.status === "failed" || missing;
  if (!needLlm) return { ...rules, extraction: "rules" };

  const raw = String(rules.rawText ?? "");
  if (!raw.trim()) return { ...rules, extraction: "rules" };

  try {
    if (!qvacReady()) await initQvac();
    const parsed = await completeJson(buildPrompt(raw));
    if (!parsed) {
      console.error("[QVAC LLM] no devolvió JSON — se conserva el resultado de reglas");
      return { ...rules, extraction: "rules" };
    }

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
  } catch (e) {
    console.error("[QVAC LLM] error — sin fallback de red", e);
    return { ...rules, extraction: "rules" };
  }
}
