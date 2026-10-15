import "dotenv/config";
import mongoose from "mongoose";
import pg from "pg";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text";
const PG_URL = process.env.DATABASE_URL ?? "postgres://factupipe:factupipe@localhost:5432/factupipe";

type InvoiceDoc = {
  _id: mongoose.Types.ObjectId;
  contentHash: string;
  cuit?: string;
  razonSocial?: string;
  nroFactura?: string;
  fecha?: string;
  neto?: number;
  iva?: number;
  total?: number;
  moneda?: string;
  cae?: string;
  rawText?: string;
};

function invoiceText(inv: InvoiceDoc): string {
  const lines = [
    inv.razonSocial && `Razón social: ${inv.razonSocial}`,
    inv.cuit && `CUIT: ${inv.cuit}`,
    inv.nroFactura && `Número: ${inv.nroFactura}`,
    inv.fecha && `Fecha: ${inv.fecha}`,
    inv.neto != null && `Neto: ${inv.neto}`,
    inv.iva != null && `IVA: ${inv.iva}`,
    inv.total != null && `Total: ${inv.total} ${inv.moneda ?? ""}`.trim(),
    inv.cae && `CAE: ${inv.cae}`,
  ].filter(Boolean);
  const body = lines.join("\n");
  const raw = inv.rawText ? `\n\n${inv.rawText.slice(0, 1500)}` : "";
  return `search_document: ${body}${raw}`;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { embeddings?: number[][] };
  const vec = json.embeddings?.[0];
  if (!vec || vec.length !== 768) {
    throw new Error(`embedding inválido: largo ${vec?.length ?? 0}, se esperaban 768`);
  }
  return vec;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("Falta MONGODB_URI");

  await mongoose.connect(mongoUri);
  const invoices = await mongoose.connection
    .collection("invoices")
    .find({})
    .project({
      contentHash: 1,
      cuit: 1,
      razonSocial: 1,
      nroFactura: 1,
      fecha: 1,
      neto: 1,
      iva: 1,
      total: 1,
      moneda: 1,
      cae: 1,
      rawText: 1,
    })
    .toArray();

  const client = new pg.Client({ connectionString: PG_URL });
  await client.connect();

  let ok = 0;
  for (const raw of invoices) {
    const inv = raw as unknown as InvoiceDoc;
    if (!inv.contentHash) continue;
    const text = invoiceText(inv);
    const vector = await embed(text);
    const literal = `[${vector.join(",")}]`;
    await client.query(
      `INSERT INTO invoice_embeddings (content_hash, invoice_id, text, embedding)
       VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT (content_hash) DO UPDATE
         SET text = EXCLUDED.text,
             embedding = EXCLUDED.embedding,
             invoice_id = EXCLUDED.invoice_id`,
      [inv.contentHash, String(inv._id), text, literal]
    );
    ok++;
    console.log(`ok ${inv.contentHash.slice(0, 12)}…`);
  }

  await client.end();
  await mongoose.disconnect();
  console.log(`ingested ${ok}/${invoices.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
