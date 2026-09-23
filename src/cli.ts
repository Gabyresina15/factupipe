import "dotenv/config";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { connectDb, pingDb } from "./db.js";
import { ingestFile } from "./pipeline.js";
import { InvoiceModel } from "./models/Invoice.js";
import { keyFieldScore } from "./schema.js";
import { startWatcher } from "./watch.js";

const cmd = process.argv[2];

await connectDb();

if (cmd === "health") {
  await pingDb();
  console.log("OK Mongo");
  process.exit(0);
}

if (cmd === "ingest") {
  const file = process.argv[3];
  if (!file) {
    console.error("Uso: npm run ingest -- ./samples/factura.pdf");
    process.exit(1);
  }
  const { created, doc } = await ingestFile(file);
  console.log(created ? "CREADO" : "DEDUP", JSON.stringify(doc, null, 2));
  process.exit(0);
}

if (cmd === "list") {
  const limit = Math.min(Number(process.argv[3] ?? 50), 200);
  const rows = await InvoiceModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

if (cmd === "watch") {
  await startWatcher();
  console.log("Watching inbox/");
} else if (cmd === "demo") {
  const dir = process.env.SAMPLES_DIR ?? "./samples";
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (files.length === 0) {
    console.error("No hay PDFs en", dir, "— pone muestras en ./samples");
    process.exit(1);
  }
  const t0 = Date.now();
  for (const f of files) {
    await ingestFile(path.join(dir, f));
  }
  const ms = Date.now() - t0;
  const all = await InvoiceModel.find().lean();
  const ok = all.filter((d) => keyFieldScore(d as Record<string, unknown>).pct >= 80).length;
  const perMin = all.length / (ms / 60000 || 1);
  console.log(
    `procesados=${all.length} clave>=80%=${((ok / Math.max(all.length, 1)) * 100).toFixed(1)}% ms=${ms} facturas/min=${perMin.toFixed(2)}`
  );
  process.exit(0);
} else if (!cmd) {
  console.error("Comandos: health | ingest <path> | list | watch | demo");
  process.exit(1);
}
