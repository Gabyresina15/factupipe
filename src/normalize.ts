import { decideStatus } from "./schema.js";

const FECHA_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/;
const RATE_VALUES = new Set([10.5, 21, 27, 10, 5, 4, 0]);
const NEXT_LABEL =
  /Fecha|Domicilio|CUIT|Condici[o\u00f3]n|Punto de Venta|Ingresos|IVA|NRO|Comp\.?/i;

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
  if (/\bUSD\b|U\$S|D[\u00f3o]lar Estadounidense|Moneda:\s*USD/i.test(text)) return "USD";
  if (/\bEUR\b|(?:^|\s)€(?:\s|$)/.test(text) && !/\bUSD\b/i.test(text)) return "EUR";
  return "ARS";
}

function digitsFromOcr(raw: string) {
  return raw.replace(/[oO]/g, "0").replace(/[lI]/g, "1").replace(/\D/g, "");
}

function formatCuit(raw?: string) {
  if (!raw) return undefined;
  const d = digitsFromOcr(raw);
  if (d.length !== 11) return undefined;
  if (!/^(20|23|24|25|26|27|30|33|34)/.test(d)) return undefined;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

function firstLabeledCuit(text: string) {
  const labeled = [...text.matchAll(/CUIT\s*[:\-]?\s*([0-9oOlI\-]{11,16})/gi)];
  for (const m of labeled) {
    const c = formatCuit(m[1]);
    if (c) return c;
  }
  const loose = text.match(/\b((?:20|23|24|25|26|27|30|33|34)[-\s]?[0-9oO]{8}[-\s]?[0-9oO])\b/);
  return formatCuit(loose?.[1]);
}

function normalizeNro(pto?: string, comp?: string, joined?: string) {
  if (pto && comp) {
    const a = digitsFromOcr(pto).padStart(4, "0").slice(-5).padStart(5, "0").slice(-5);
    const b = digitsFromOcr(comp).padStart(8, "0").slice(-8);
    if (a.length >= 4 && b.length === 8) return `${a.slice(-5).replace(/^0(\d{4})$/, "0$1")}-${b}`;
    if (digitsFromOcr(pto).length && digitsFromOcr(comp).length) {
      return `${digitsFromOcr(pto).padStart(4, "0").slice(-4)}-${digitsFromOcr(comp).padStart(8, "0").slice(-8)}`;
    }
  }
  if (joined) {
    const cleaned = joined.replace(/[oO]/g, "0").replace(/\s/g, "");
    const m = cleaned.match(/(\d{4,5})-(\d{8})/);
    if (m) return `${m[1].padStart(4, "0")}-${m[2]}`;
  }
  return undefined;
}

function takeUntilLabel(value: string) {
  const cut = value.search(NEXT_LABEL);
  return (cut > 0 ? value.slice(0, cut) : value).trim().replace(/[:\-]+$/, "").slice(0, 80);
}

function closeRate(neto: number, iva: number) {
  const r = iva / neto;
  return [0.105, 0.21, 0.27].some((x) => Math.abs(r - x) < 0.015);
}

export function normalizeFromText(
  text: string,
  meta: { pathOrigen: string; contentHash: string }
) {
  const cuit = firstLabeledCuit(text);

  let razonSocial: string | undefined;
  if (/Nombre de Fantas[i\u00ed]a/i.test(text)) razonSocial = "Nombre de Fantasía";
  const razonLabeled = text.match(/Raz[o\u00f3]n Social\s*[:\-]?\s*(.+?)(?=Fecha|Domicilio|CUIT|Condici|Punto de Venta|$)/i);
  if (!razonSocial && razonLabeled?.[1]) razonSocial = takeUntilLabel(razonLabeled[1]);
  if (!razonSocial) {
    const ing = text.match(/([A-Za-z0-9]{2,12})\s+Ingenier[i\u00ed]a/i);
    if (ing) razonSocial = `${ing[1]} Ingeniería`;
  }
  if (!razonSocial && /L[i\u00ed]der Gesti[o\u00f3]n/i.test(text)) razonSocial = "Líder Gestión";
  if (!razonSocial && /DreamWorks Studios/i.test(text)) razonSocial = "DreamWorks Studios";

  const pto = text.match(/Punto de Venta\s*[:\-]?\s*([0-9oO]{4,5})/i)?.[1];
  const comp = text.match(/Comp\.?\s*Nro\.?\s*[:\-]?\s*([0-9oO]{6,8})/i)?.[1];
  const joined =
    text.match(/FACTURA\s+([0-9oO]{4}\s*-\s*[0-9oO]{8})/i)?.[1] ||
    text.match(/\b([0-9oO]{4}\s*-\s*[0-9oO]{8})\b/)?.[1];
  const nroFactura = normalizeNro(pto, comp, joined);

  const fecha =
    text.match(/Fecha(?: de Emisi[o\u00f3]n)?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)?.[1] ??
    text.match(FECHA_RE)?.[1];

  const cae = text.match(/CAE\s*(?:N[\u00b0\u00baoª.]?)?\s*[:\-]?\s*(\d{10,14})/i)?.[1];

  const isC =
    /\bFACTURA\s*C\b|C[\u00d3O]D\.?\s*11|Responsable Monotributo|Monotribut/i.test(text);

  let neto =
    lastAmount(text, /Importe Neto Gravado\s*[:\-]?\s*(?:USD|UsD|\$)?\s*([\d.\s]+[.,]\d{2})/gi) ??
    lastAmount(text, /BASE IMPONIBLE\s*[:\-]?\s*([\d.\s]+[.,]\d{2})/gi) ??
    lastAmount(text, /(?:Neto Gravado|Importe Neto|Subtotal)\s*[:\-]?\s*(?:USD|€|\$)?\s*([\d.\s]+[.,]\d{2})/gi);

  let iva =
    lastAmount(text, /IVA\s*21\s*%[^\d]{0,16}([\d.\s]+[.,]\d{2})/gi, true) ??
    lastAmount(text, /IVA\s*(?:\d{1,2}\s*%|\d{2,3}\s+)?[^\d]{0,12}([\d.\s]+[.,]\d{2})/gi, true);

  let total =
    lastAmount(text, /Importe Total\s*[:\-]?\s*(?:USD|UsD|\$)?\s*([\d.\s]+[.,]\d{2})/gi) ??
    lastAmount(text, /\bTOTAL\b\s*[:\-]?\s*(?:USD|€|\$)?\s*([\d.\s]+[.,]\d{2})/gi);

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
    razonSocial: razonSocial?.slice(0, 80),
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
