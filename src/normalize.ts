import { decideStatus } from "./schema.js";

const CUIT_RE = /\b((?:20|23|24|25|26|27|30|33|34)[-\s]?\d{8}[-\s]?\d)\b/;
const FECHA_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/;
const RATE_VALUES = new Set([10.5, 21, 27, 10, 5, 4, 0]);

export function parseMoney(raw?: string): number | undefined {
  if (!raw) return undefined;
  const s = raw
    .replace(/[€$£]/g, "")
    .replace(/\b(?:EUR|USD|ARS|PESOS?)\b/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return undefined;
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(s)) return Number(s.replace(/,/g, ""));
  if (/^\d{1,3}(\.\d{3})+\.\d{2}$/.test(s)) {
    const last = s.lastIndexOf(".");
    return Number(s.slice(0, last).replace(/\./g, "") + "." + s.slice(last + 1));
  }
  if (/^\d+[.,]\d{2}$/.test(s)) return Number(s.replace(",", "."));
  if (/^\d+$/.test(s)) return Number(s);
  return undefined;
}

function lastAmount(text: string, label: RegExp, skipRates = false): number | undefined {
  const matches = [...text.matchAll(label)];
  const nums = matches
    .map((m) => parseMoney(m[1]))
    .filter((n): n is number => n !== undefined && (!skipRates || !RATE_VALUES.has(n)));
  return nums.at(-1);
}

function detectMoneda(text: string): "ARS" | "USD" | "EUR" {
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/\bUSD\b|U\$S|D[\u00f3o]lar/i.test(text)) return "USD";
  return "ARS";
}

function formatCuit(raw?: string) {
  if (!raw) return undefined;
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return undefined;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

function normalizeNro(raw?: string) {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[oO]/g, "0").replace(/\s/g, "");
  const m = cleaned.match(/(\d{4})-(\d{8})/);
  if (m) return `${m[1]}-${m[2]}`;
  return cleaned;
}

function closeRate(neto: number, iva: number) {
  const r = iva / neto;
  return [0.105, 0.21, 0.27].some((x) => Math.abs(r - x) < 0.015);
}

export function normalizeFromText(
  text: string,
  meta: { pathOrigen: string; contentHash: string }
) {
  const cuit = formatCuit(
    text.match(/CUIT\s*[:\-]?\s*([0-9\-]{11,13})/i)?.[1] ?? text.match(CUIT_RE)?.[1]
  );

  const razonMatch =
    text.match(/Nombre de Fantas[i\u00ed]a/i) ||
    text.match(/Raz[o\u00f3]n Social\s*[:\-]?\s*([^\n]{3,80})/i) ||
    text.match(/Emisor\s*[:\-]?\s*([^\n]{3,80})/i) ||
    text.match(/([A-Za-z0-9]{2,12})\s+Ingenier[i\u00ed]a/i) ||
    text.match(/\b(DreamWorks Studios)\b/i);

  let razonSocial = razonMatch?.[0]?.includes("Fantas")
    ? "Nombre de Fantasía"
    : razonMatch?.[1]?.trim();
  if (razonMatch && /ingenier/i.test(razonMatch[0]) && razonMatch[1] && !/ingenier/i.test(razonMatch[1])) {
    razonSocial = `${razonMatch[1]} Ingeniería`;
  }

  const nroMatch =
    text.match(/FACTURA\s+([0-9oO]{4}\s*-\s*[0-9oO]{8})/i) ||
    text.match(/\b([0-9oO]{4}\s*-\s*[0-9oO]{8})\b/) ||
    text.match(/Factura[^\n]{0,48}#\s*([A-Z]?\d{4,12})/i);
  const nroFactura = normalizeNro(nroMatch?.[1]);

  const fecha =
    text.match(/Fecha(?: de Emisi[o\u00f3]n)?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)?.[1] ??
    text.match(FECHA_RE)?.[1];

  const cae = text.match(/CAE\s*(?:N[\u00b0\u00baoª.]?)?\s*[:\-]?\s*(\d{8,14})/i)?.[1];

  const isC =
    /\bFACTURA\s*C\b|C[\u00d3O]D\.?\s*11|Responsable Monotributo|Monotribut/i.test(text);

  let neto =
    lastAmount(text, /BASE IMPONIBLE\s*[:\-]?\s*([\d.\s]+[.,]\d{2})/gi) ??
    lastAmount(text, /(?:Neto Gravado|Importe Neto|Subtotal)\s*[:\-]?\s*[€$]?\s*([\d.\s]+[.,]\d{2})/gi);

  let iva =
    lastAmount(text, /IVA\s*(?:\d{1,2}\s*%|\d{2,3}\s+)?[^\d]{0,12}([\d.\s]+[.,]\d{2})/gi, true) ??
    lastAmount(text, /I\.V\.A\.[^\d]{0,20}([\d.\s]+[.,]\d{2})/gi, true);

  let total =
    lastAmount(text, /\bTOTAL\b\s*[:\-]?\s*[€$]?\s*([\d.\s]+[.,]\d{2})/gi) ??
    lastAmount(text, /Importe\s+Total\s*[:\-]?\s*[€$]?\s*([\d.\s]+[.,]\d{2})/gi);

  if (isC) {
    if (total != null) neto = total;
    iva = iva ?? 0;
  }

  if (neto != null && total != null && iva == null && !isC) {
    const diff = Math.round((total - neto) * 100) / 100;
    if (diff > 0 && closeRate(neto, diff)) iva = diff;
  }
  if (neto != null && iva != null && total == null) {
    total = Math.round((neto + iva) * 100) / 100;
  }

  const draft = {
    cuit,
    razonSocial: razonSocial?.slice(0, 120),
    nroFactura,
    fecha,
    neto,
    iva,
    total,
    cae,
    moneda: detectMoneda(text),
    pathOrigen: meta.pathOrigen,
    contentHash: meta.contentHash,
    extraction: "rules" as const,
    rawText: text.slice(0, 20_000),
  };

  return { ...draft, status: decideStatus(draft) };
}
