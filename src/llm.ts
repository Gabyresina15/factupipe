import { decideStatus, KEY_FIELDS } from "./schema.js";
import { completeJson, qvacReady, initQvac } from "./qvac.js";

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asStr(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() && v !== "null") return v.trim();
  return undefined;
}

function buildPrompt(rawText: string) {
  return `Factura. Responde SOLO un objeto JSON, nada mas.
Formato exacto:
{"cuit":null,"razonSocial":"","nroFactura":"","fecha":"","neto":0,"iva":0,"total":0,"moneda":"EUR"}
Moneda: EUR si hay euro, USD si hay dolar, si no ARS.
Numeros con punto decimal. cuit null si no es Argentina.

TEXTO:
${rawText.slice(0, 2800)}`;
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
      cuit: rules.cuit ?? asStr(parsed.cuit),
      razonSocial: rules.razonSocial ?? asStr(parsed.razonSocial),
      nroFactura: rules.nroFactura ?? asStr(parsed.nroFactura),
      fecha: rules.fecha ?? asStr(parsed.fecha),
      neto: rules.neto ?? asNum(parsed.neto),
      iva: rules.iva ?? asNum(parsed.iva),
      total: rules.total ?? asNum(parsed.total),
      moneda: rules.moneda ?? asStr(parsed.moneda) ?? "ARS",
      extraction: "hybrid",
    };
    return { ...merged, status: decideStatus(merged) };
  } catch (e) {
    console.error("[QVAC LLM] error — sin fallback de red", e);
    return { ...rules, extraction: "rules" };
  }
}
