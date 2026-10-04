import path from "node:path";
import { contentHash } from "./hash.js";
import { extractText } from "./extract.js";
import { normalizeFromText } from "./normalize.js";
import { maybeEnrichWithLlm } from "./llm.js";
import { upsertInvoice } from "./persist.js";
import { logInvoice, newTimings, type Timings } from "./metrics.js";

export async function ingestFile(
  filePath: string,
  opts: { signal?: AbortSignal; jobId?: string; timings?: Timings } = {}
) {
  const started = Date.now();
  const timings = opts.timings ?? newTimings();
  let hash: string | undefined;
  let saved: Awaited<ReturnType<typeof upsertInvoice>> | undefined;
  let failure: unknown;
  try {
    const abs = path.resolve(filePath);
    hash = await contentHash(abs);
    const t0 = Date.now();
    const { text, source } = await extractText(abs);
    timings.ocrMs = Date.now() - t0;
    timings.extractSource = source;

    // Si el job ya venció por timeout, el resultado tardío no se escribe.
    opts.signal?.throwIfAborted();
    if (!text) {
      saved = await upsertInvoice({
        pathOrigen: abs,
        contentHash: hash,
        status: "failed",
        extraction: "rules",
        rawText: "",
        moneda: "ARS",
        extractSource: source,
      });
      return saved;
    }

    const rules = normalizeFromText(text, { pathOrigen: abs, contentHash: hash });
    const finalDoc = await maybeEnrichWithLlm({ ...rules, extractSource: source }, timings);
    opts.signal?.throwIfAborted();
    saved = await upsertInvoice(finalDoc);
    return saved;
  } catch (e) {
    failure = e;
    throw e;
  } finally {
    // Con timeout la línea la escribe jobs.ts; un resultado tardío no loguea de nuevo.
    if (!opts.signal?.aborted) {
      const doc = saved ? ((saved.doc.toObject?.() ?? saved.doc) as Record<string, unknown>) : {};
      logInvoice({
        jobId: opts.jobId,
        contentHash: hash,
        outcome: failure ? "failed" : "done",
        errorCode: failure ? "ingest_error" : undefined,
        skipped: saved?.skipped,
        status: doc.status as string | undefined,
        extraction: doc.extraction as string | undefined,
        timings,
        totalMs: Date.now() - started,
        fields: doc,
      });
    }
  }
}
