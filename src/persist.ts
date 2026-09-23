import { InvoiceModel } from "./models/Invoice.js";

export async function upsertInvoice(doc: Record<string, unknown>) {
  const hash = String(doc.contentHash);
  const existing = await InvoiceModel.findOne({ contentHash: hash });
  if (existing) {
    existing.ingestCount = (existing.ingestCount ?? 1) + 1;
    existing.pathOrigen = String(doc.pathOrigen);
    await existing.save();
    return { doc: existing, created: false };
  }
  const created = await InvoiceModel.create(doc);
  return { doc: created, created: true };
}
