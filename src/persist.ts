import { InvoiceModel } from "./models/Invoice.js";

const OVERWRITE = [
  "cuit",
  "razonSocial",
  "nroFactura",
  "fecha",
  "neto",
  "iva",
  "total",
  "moneda",
  "status",
  "extraction",
  "extractSource",
  "rawText",
  "pathOrigen",
] as const;

export async function upsertInvoice(doc: Record<string, unknown>) {
  const hash = String(doc.contentHash);
  const existing = await InvoiceModel.findOne({ contentHash: hash });
  if (existing) {
    for (const key of OVERWRITE) {
      if (doc[key] !== undefined) {
        (existing as unknown as Record<string, unknown>)[key] = doc[key];
      }
    }
    existing.ingestCount = (existing.ingestCount ?? 1) + 1;
    await existing.save();
    return { doc: existing, created: false };
  }
  const created = await InvoiceModel.create(doc);
  return { doc: created, created: true };
}
