import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { connectDb, pingDb } from "./db.js";
import { InvoiceModel } from "./models/Invoice.js";
import { ingestFile } from "./pipeline.js";
import { initQvac, qvacReady } from "./qvac.js";
import { homePage } from "./ui.js";

const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
await mkdir(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".bin";
    cb(null, `factura-${Date.now()}${ext.toLowerCase()}`);
  },
});
const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.type("html").send(homePage());
});

app.get("/health", async (_req, res) => {
  await pingDb();
  res.json({ ok: true, mongo: "ok", qvac: qvacReady() });
});

app.post("/ingest", async (req, res) => {
  const filePath = req.body?.path as string | undefined;
  if (!filePath) return res.status(400).json({ error: "Falta path" });
  const result = await ingestFile(filePath);
  res.json({ created: result.created, data: result.doc });
});

app.post("/api/upload", upload.single("factura"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta archivo" });
  try {
    const result = await ingestFile(req.file.path);
    res.json({ created: result.created, data: result.doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error procesando el comprobante" });
  }
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
app.listen(PORT, async () => {
  console.log(`FactuPipe http://localhost:${PORT}`);
  if (process.env.QVAC_ENABLED !== "0") {
    initQvac().catch((e) => console.error("QVAC init diferido falló", e));
  }
});
