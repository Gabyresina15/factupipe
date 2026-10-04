import { decideStatus } from "./schema.js";
import { formatCuit } from "./cuit.js";

const FECHA_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/;
const RATE_VALUES = new Set([10.5, 21, 27, 10, 5, 4, 0]);
const NEXT_LABEL =
  /Fecha|Domicilio|CUIT|Condici[o\u00f3]n|Punto de Venta|Ingresos|IVA|NRO|Comp\.?/i;

export function parseMoney(raw?: string): number | undefined {
  if (!raw) return undefined;
  const s = raw
    .replace(/[oO]/g, "0")
    .replace(/[\u20ac$£]/g, "")
    .replace(/\b(?:EUR|USD|ARS|PESOS?)\b/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return undefined;
  // 10.890.00 y 10.820.00 (OCR de 10.890,00): el último grupo de 2 es decimal.
  if (/^\d{1,3}(\.\d{3})+\.\d{2}$/.test(s)) {
    const last = s.lastIndexOf(".");
    return Number(s.slice(0, last).replace(/\./g, "") + "." + s.slice(last + 1));
  }
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
  if (/\bEUR\b|(?:^|\s)\u20ac(?:\s|$)/.test(text) && !/\bUSD\b/i.test(text)) return "EUR";
  return "ARS";
}

function digitsFromOcr(raw: string) {
  return raw.replace(/[oO]/g, "0").replace(/\D/g, "");
}

function firstLabeledCuit(text: string): { cuit?: string; warning?: "cuit_checksum" } {
  const labeled = [...text.matchAll(/CUIT\s*[:\-]?\s*([0-9oOlIcC\-]{11,16})/gi)];
  if (labeled.length === 0) return {};
  return formatCuit(labeled[0][1]);
}

function normalizeNro(pto?: string, comp?: string, joined?: string) {
  if (pto && comp) {
    const a = digitsFromOcr(pto).padStart(4, "0").slice(-5);
    const b = digitsFromOcr(comp).padStart(8, "0").slice(-8);
    if (b.length === 8 && a.length >= 4) return `${a.slice(-5)}-${b}`;
  }
  if (joined) {
    const cleaned = joined.replace(/[oO]/g, "0").replace(/\s/g, "");
    const m = cleaned.match(/(\d{4,5})-(\d{8})/);
    if (m) return `${m[1]}-${m[2]}`;
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

// Letra del comprobante. Orden: código AFIP explícito > "FACTURA X" > emisor monotributista.
// El código manda: una Factura A/B a un receptor monotributista no se lee como C.
const COD_LETRA: Record<string, "A" | "B" | "C" | "M"> = {
  "01": "A", "02": "A", "03": "A",
  "06": "B", "07": "B", "08": "B",
  "11": "C", "12": "C", "13": "C",
  "51": "M", "52": "M", "53": "M",
};
const RECEPTOR = /\bCliente\b|Se[\u00f1n]or(?:es)?\b|Apellido\s+y\s+N|\bDNI\b/i;

export function tipoComprobante(text: string): "A" | "B" | "C" | "M" | undefined {
  const cod = text.match(/\bC[O\u00d3]D(?:IGO)?\.?\s*(?:N[\u00b0\u00ba.]?\s*)?[:\-]?\s*0?(\d{2})\b/i)?.[1];
  if (cod && COD_LETRA[cod]) return COD_LETRA[cod];
  const letra = text.match(/\bFACTURA\s+([ABCM])\b/)?.[1] as "A" | "B" | "C" | "M" | undefined;
  if (letra) return letra;
  // Sin código ni letra legibles: "Responsable Monotributo" cuenta solo si aparece en el bloque
  // del emisor (antes de los datos del receptor). Un monotributista solo emite C.
  const mono = text.search(/Responsable\s+Monotributo|Monotributista/i);
  const receptor = text.search(RECEPTOR);
  if (mono >= 0 && (receptor < 0 || mono < receptor)) return "C";
  return undefined;
}

// Número de tipo de cambio sin plegar letras: 1.234,56 | 1,234.56 | 1234.56 | 1234,56 | 65,00 | 65.
export function parseRate(raw: string): number | undefined {
  let s = raw;
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.234 = mil doscientos (AR)
  else if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : undefined;
}

const TC_LABEL =
  /(?:tipo\s+de\s+cambio(?:\s+consignado)?(?:\s+de)?|cotizaci[o\u00f3]n(?:\s+(?:del?\s+)?(?:d[o\u00f3]lar|USD))?|\bT\.\s?C\.|\bTC\b)\s*[:=]?\s*(?:\$|ARS)?\s*(\d[\d.,]*\d|\d)(.{0,3})/gi;

// Solo con etiqueta y número limpio. Si después del número viene algo que parece un dígito
// mal leído (letra pegada, o "o", "l", "j", "]", "|" tras un espacio), no se adivina: null.
// Así "65 oo]j0" de Líder y "6S,00" quedan null.
export function parseTipoCambio(text: string): number | undefined {
  for (const m of text.matchAll(TC_LABEL)) {
    const after = m[2] ?? "";
    if (/^[A-Za-z0-9\u00c0-\u017f]/.test(after) || /^\s*[oOlIj\]\[|]/.test(after)) continue;
    const n = parseRate(m[1]);
    if (n !== undefined) return n;
  }
  return undefined;
}

export function normalizeFromText(
  text: string,
  meta: { pathOrigen: string; contentHash: string }
) {
  const cuitParsed = firstLabeledCuit(text);
  const warnings = cuitParsed.warning ? [cuitParsed.warning] : [];

  let razonSocial: string | undefined;
  if (/Nombre de Fantas[i\u00ed]a/i.test(text)) razonSocial = "Nombre de Fantasía";
  const razonLabeled = text.match(/Raz[o\u00f3]n Social\s*[:\-]?\s*(.+?)(?=Fecha|Domicilio|CUIT|Condici|Punto de Venta|$)/i);
  if (!razonSocial && razonLabeled?.[1]) razonSocial = takeUntilLabel(razonLabeled[1]);
  if (razonSocial) {
    razonSocial = razonSocial.split(/\b(?:Avenida|Avda|Calle|Domicilio)\b/i)[0].trim();
  }
  if (!razonSocial) {
    const ing = text.match(/([A-Za-z0-9]{2,12})\s+Ingenier[i\u00ed]a/i);
    if (ing) razonSocial = `${ing[1]} Ingeniería`;
  }

  const pto = text.match(/Punto de Venta\s*[:\-]?\s*([0-9oO]{4,5})/i)?.[1];
  const comp = text.match(/Comp\.?\s*Nro\.?\s*[:\-]?\s*([0-9oO]{6,8})/i)?.[1];
  const joined =
    text.match(/FACTURA\s+([0-9oO]{4}\s*-\s*[0-9oO]{8})/i)?.[1] ||
    text.match(/\b([0-9oO]{4}\s*-\s*[0-9oO]{8})\b/)?.[1];
  const nroFactura = normalizeNro(pto, comp, joined);

  const fecha =
    text.match(/Fecha(?: de Emisi[o\u00f3]n)?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)?.[1] ??
    text.match(FECHA_RE)?.[1];

  const cae = text.match(/CAE[^0-9]{0,16}(\d{10,14})/i)?.[1];

  const isC = tipoComprobante(text) === "C";

  const money = "([0-9oO]{1,3}(?:[.,][0-9oO]{3})+[.,][0-9oO]{2}|[0-9oO]+[.,][0-9oO]{2})";
  let neto =
    lastAmount(text, new RegExp(`Importe Neto Gravado\\s*[:\\-]?\\s*(?:USD|UsD|\\$)?\\s*${money}`, "gi")) ??
    lastAmount(text, new RegExp(`BASE IMPONIBLE\\s*[:\\-]?\\s*${money}`, "gi")) ??
    lastAmount(text, new RegExp(`(?:Neto Gravado|Importe Neto|Subtotal)\\s*[:\\-]?\\s*(?:USD|\\u20ac|\\$)?\\s*${money}`, "gi"));

  let iva =
    lastAmount(text, /IVA\s*21\s*%[^\d]{0,16}([\d.\s]+[.,]\d{2})/gi, true) ??
    lastAmount(text, /IVA\s*(?:\d{1,2}\s*%|\d{2,3}\s+)?[^\d]{0,12}([\d.\s]+[.,]\d{2})/gi, true);

  let total =
    lastAmount(text, new RegExp(`Importe Total\\s*[:\\-]?\\s*(?:USD|UsD|\\$)?\\s*${money}`, "gi")) ??
    lastAmount(text, new RegExp(`\\bTOTAL\\b\\s*[:\\-]?\\s*(?:USD|\\u20ac|\\$)?\\s*${money}`, "gi"));

  // Factura C no discrimina IVA: cualquier "IVA" leído es ruido (p. ej. "Cond. IVA").
  if (isC) {
    if (total != null) neto = total;
    iva = 0;
  }

  if (neto != null && total != null && iva == null && !isC) {
    const diff = Math.round((total - neto) * 100) / 100;
    if (diff > 0 && closeRate(neto, diff)) iva = diff;
  }
  if (neto != null && iva != null && total == null) {
    total = Math.round((neto + iva) * 100) / 100;
  }

  // total queda en la moneda del comprobante; totalArs es derivado y solo si hay ambos.
  const moneda = detectMoneda(text);
  const tipoCambio = moneda === "ARS" ? undefined : parseTipoCambio(text);
  const totalArs =
    tipoCambio !== undefined && total != null ? Math.round(total * tipoCambio * 100) / 100 : undefined;

  return {
    cuit: cuitParsed.cuit,
    warnings,
    razonSocial: razonSocial?.slice(0, 80),
    nroFactura,
    fecha,
    neto,
    iva,
    total,
    cae,
    tipoCambio,
    totalArs,
    moneda,
    pathOrigen: meta.pathOrigen,
    contentHash: meta.contentHash,
    extraction: "rules" as const,
    rawText: text.slice(0, 20_000),
    status: decideStatus({ cuit: cuitParsed.cuit, razonSocial, nroFactura, fecha, total }),
  };
}
