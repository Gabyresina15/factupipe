import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDb, pingDb } from "./db.js";
import { InvoiceModel } from "./models/Invoice.js";
import { ingestFile } from "./pipeline.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  await pingDb();
  res.json({ ok: true, mongo: "ok" });
});

app.post("/ingest", async (req, res) => {
  const filePath = req.body?.path as string | undefined;
  if (!filePath) return res.status(400).json({ error: "Falta path" });
  const result = await ingestFile(filePath);
  res.json({ created: result.created, data: result.doc });
});

app.get("/invoices", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const rows = await InvoiceModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  res.json(rows);
});

app.get("/invoices/:id", async (req, res) => {
  const row = await InvoiceModel.findById(req.params.id).lean();
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

const PORT = Number(process.env.PORT ?? 3000);

await connectDb();
app.listen(PORT, () => {
  console.log(`FactuPipe http://localhost:${PORT}`);
});
