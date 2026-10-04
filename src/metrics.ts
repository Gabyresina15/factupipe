import { keyFieldScore } from "./schema.js";

// Ventana en memoria del proceso: se pierde al reiniciar. totalMs = tiempo de la factura
// dentro del worker (hash + texto/OCR + LLM + upsert), sin la espera en cola.
const samples: number[] = [];

function p95(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

export type Timings = { ocrMs: number; llmMs: number; llmCalled: boolean; extractSource?: string };

export const newTimings = (): Timings => ({ ocrMs: 0, llmMs: 0, llmCalled: false });

export function logInvoice(event: {
  jobId?: string;
  contentHash?: string;
  outcome: "done" | "failed";
  errorCode?: string;
  skipped?: boolean;
  status?: string;
  extraction?: string;
  timings: Timings;
  totalMs: number;
  fields: Record<string, unknown>;
}) {
  const score = keyFieldScore(event.fields);
  samples.push(event.totalMs);
  if (samples.length > 200) samples.shift();
  const line = {
    msg: "invoice",
    ts: new Date().toISOString(),
    jobId: event.jobId,
    contentHash: event.contentHash,
    outcome: event.outcome,
    errorCode: event.errorCode,
    skipped: event.skipped ?? false,
    status: event.status,
    extraction: event.extraction,
    extractSource: event.timings.extractSource,
    ocrMs: event.timings.ocrMs,
    llmCalled: event.timings.llmCalled,
    llmMs: event.timings.llmMs,
    totalMs: event.totalMs,
    fieldsHit: score.hit,
    fieldsPct: Math.round(score.pct),
    p95Ms: p95(samples),
    n: samples.length,
  };
  console.log(JSON.stringify(line));
  return line;
}
