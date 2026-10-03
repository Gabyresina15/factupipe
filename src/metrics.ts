import { keyFieldScore } from "./schema.js";

const samples: number[] = [];

function p95(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

export function logInvoice(event: {
  contentHash: string;
  status: string;
  extraction: string;
  extractSource?: string;
  ocrMs: number;
  llmMs: number;
  fields: Record<string, unknown>;
}) {
  const score = keyFieldScore(event.fields);
  const totalMs = event.ocrMs + event.llmMs;
  samples.push(totalMs);
  if (samples.length > 200) samples.shift();
  const line = {
    msg: "invoice",
    contentHash: event.contentHash,
    status: event.status,
    extraction: event.extraction,
    extractSource: event.extractSource,
    ocrMs: event.ocrMs,
    llmMs: event.llmMs,
    totalMs,
    fieldsHit: score.hit,
    fieldsPct: Math.round(score.pct),
    p95Ms: p95(samples),
    n: samples.length,
  };
  console.log(JSON.stringify(line));
  return line;
}
