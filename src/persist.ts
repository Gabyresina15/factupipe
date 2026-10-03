import { InvoiceModel } from "./models/Invoice.js";
import { decideStatus, keyFieldScore } from "./schema.js";

const OVERWRITE = [
  "cuit",
  "razonSocial",
  "nroFactura",
  "fecha",
  "neto",
  "iva",
  "total",
  "cae",
  "moneda",
  "status",
  "extraction",
  "extractSource",
  "rawText",
  "pathOrigen",
  "warnings",
  "tipoCambio",
  "totalArs",
] as const;

const FILL_GAPS = ["cuit", "razonSocial", "nroFactura", "fecha", "neto", "iva", "total", "cae"] as const;

export async function upsertInvoice(doc: Record<string, unknown>) {
  const hash = String(doc.contentHash);
  const existing = await InvoiceModel.findOne({ contentHash: hash });
  if (!existing) {
    const created = await InvoiceModel.create(doc);
    return { doc: created, created: true, skipped: false };
  }

  const target = existing as unknown as Record<string, unknown>;
  existing.ingestCount = (existing.ingestCount ?? 1) + 1;

  if (existing.status === "complete") {
    await existing.save();
    return { doc: existing, created: false, skipped: true };
  }

  // Un reintento peor (menos campos clave, o sin texto) no pisa lo bueno: solo completa huecos.
  const worse = doc.status === "failed" || keyFieldScore(doc).hit < keyFieldScore(target).hit;
  const keys = worse ? FILL_GAPS : OVERWRITE;
  for (const key of keys) {
    const empty = target[key] === undefined || target[key] === null || target[key] === "";
    if (doc[key] !== undefined && (!worse || empty)) target[key] = doc[key];
  }
  if (worse) target.status = decideStatus(target);
  await existing.save();
  return { doc: existing, created: false, skipped: false };
}
