import { decideStatus } from "./schema.js";
import { completeJson, qvacReady, initQvac } from "./qvac.js";

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9,.-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asStr(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() && v.toLowerCase() !== "null") return v.trim();
  return undefined;
}

function buildPrompt(rawText: string) {
  return `Analiza este texto extraído de una factura. Devuelve ÚNICAMENTE un JSON válido con las claves "merchantName" (nombre del comercio) y "totalAmount" (el total numérico).

TEXTO:
${rawText}`;
}

export async function maybeEnrichWithLlm(rules: Record<string, unknown>) {
  const raw = String(rules.rawText ?? "");
  if (!raw.trim()) return { ...rules, extraction: "rules" };

  try {
    if (!qvacReady()) await initQvac();
    const parsed = await completeJson(buildPrompt(raw));
    if (!parsed) {
      console.error("[QVAC LLM] no devolvió JSON — se conserva el resultado de reglas");
      return { ...rules, extraction: "rules" };
    }

    const merchant = asStr(parsed.merchantName ?? parsed.razonSocial);
    const llmTotal = asNum(parsed.totalAmount ?? parsed.total);

    const iva = typeof rules.iva === "number" && typeof rules.total === "number" && rules.iva > Number(rules.total)
      ? undefined
      : rules.iva;

    const merged = {
      ...rules,
      iva,
      razonSocial: rules.razonSocial ?? merchant,
      total: llmTotal ?? rules.total,
      extraction: "hybrid",
    };
    return { ...merged, status: decideStatus(merged) };
  } catch (e) {
    console.error("[QVAC LLM] error — sin fallback de red", e);
    return { ...rules, extraction: "rules" };
  }
}
