import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    cuit: String,
    razonSocial: String,
    nroFactura: String,
    fecha: String,
    neto: Number,
    iva: Number,
    total: Number,
    cae: String,
    moneda: { type: String, default: "ARS" },
    pathOrigen: { type: String, required: true },
    contentHash: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["complete", "partial", "failed"], required: true },
    extraction: { type: String, enum: ["rules", "llm", "hybrid"], required: true },
    extractSource: { type: String, enum: ["pdf-parse", "qvac-ocr", "empty"] },
    rawText: String,
    ingestCount: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const InvoiceModel = mongoose.model("Invoice", schema);
