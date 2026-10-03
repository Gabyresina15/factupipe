import path from "node:path";
import { contentHash } from "./hash.js";
import { extractText } from "./extract.js";
import { normalizeFromText } from "./normalize.js";
import { maybeEnrichWithLlm } from "./llm.js";
import { upsertInvoice } from "./persist.js";
import { logInvoice } from "./metrics.js";

export async function ingestFile(filePath: string, opts: { signal?: AbortSignal } = {}) {
  const abs = path.resolve(filePath);
  const hash = await contentHash(abs);
  const t0 = Date.now();
  const { text, source } = await extractText(abs);
  const ocrMs = Date.now() - t0;

  // Si el job ya venció por timeout, el resultado tardío no se escribe.
  opts.signal?.throwIfAborted();
  if (!text) {
    return upsertInvoice({
      pathOrigen: abs,
      contentHash: hash,
      status: "failed",
      extraction: "rules",
      rawText: "",
      moneda: "ARS",
      extractSource: source,
    });
  }

  const rules = normalizeFromText(text, { pathOrigen: abs, contentHash: hash });
  const t1 = Date.now();
  const finalDoc = await maybeEnrichWithLlm({ ...rules, extractSource: source });
  const llmMs = Date.now() - t1;
  opts.signal?.throwIfAborted();
  const saved = await upsertInvoice(finalDoc);
  logInvoice({
    contentHash: hash,
    status: String(saved.doc.status ?? finalDoc.status),
    extraction: String(finalDoc.extraction ?? "rules"),
    extractSource: source,
    ocrMs,
    llmMs,
    fields: saved.doc.toObject?.() ?? saved.doc,
  });
  return saved;
}
