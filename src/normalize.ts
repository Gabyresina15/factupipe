import { decideStatus } from "./schema.js";

const CUIT_RE = /\b((?:20|23|24|25|26|27|30|33|34)[-\s]?\d{8}[-\s]?\d)\b/;
const NRO_RE =
  /(?:Factura|Comprobante|N[\u00b0\u00bao]|Punto de Venta)[^\d]{0,24}(\d{4,5}\s*[-\u2013]\s*\d{8}|\d{8,13})/i;
const FECHA_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/;

function parseArNumber(s?: string) {
  if (!s) return undefined;
  const t = s.replace(/\s/g, "");
  if (t.includes(",") && t.includes(".")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (t.includes(",")) return Number(t.replace(",", "."));
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function formatCuit(raw?: string) {
  if (!raw) return undefined;
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return raw.replace(/\s/g, "");
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

export function normalizeFromText(
  text: string,
  meta: { pathOrigen: string; contentHash: string }
) {
  const cuit = formatCuit(text.match(CUIT_RE)?.[1]);

  const razonMatch =
    text.match(/Raz[o\u00f3]n Social\s*[:\-]?\s*([^\n]{3,80})/i) ||
    text.match(/Emisor\s*[:\-]?\s*([^\n]{3,80})/i);
  const razonSocial = razonMatch?.[1]?.trim();

  const nroFactura = text.match(NRO_RE)?.[1]?.replace(/\s/g, "");
  const fecha = text.match(FECHA_RE)?.[1];

  const totalM = text.match(
    /(?:Importe\s+Total|Total\s+Factura|\bTotal\b)\s*[:\-]?\s*\$?\s*([\d.\s]+,\d{2}|\d+[.,]\d{2})/i
  );
  const netoM = text.match(
    /(?:Neto Gravado|Importe Neto|Subtotal)\s*[:\-]?\s*\$?\s*([\d.\s]+,\d{2}|\d+[.,]\d{2})/i
  );
  const ivaM = text.match(/(?:IVA|I\.V\.A\.)[^\d]{0,24}([\d.\s]+,\d{2}|\d+[.,]\d{2})/i);

  const draft = {
    cuit,
    razonSocial: razonSocial?.slice(0, 120),
    nroFactura,
    fecha,
    neto: parseArNumber(netoM?.[1]),
    iva: parseArNumber(ivaM?.[1]),
    total: parseArNumber(totalM?.[1]),
    moneda: /USD|U\$S|D[\u00f3o]lar/i.test(text) ? ("USD" as const) : ("ARS" as const),
    pathOrigen: meta.pathOrigen,
    contentHash: meta.contentHash,
    extraction: "rules" as const,
    rawText: text.slice(0, 20_000),
  };

  return { ...draft, status: decideStatus(draft) };
}
