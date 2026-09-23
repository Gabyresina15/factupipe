import path from "node:path";
import { contentHash } from "./hash.js";
import { extractText } from "./extract.js";
import { normalizeFromText } from "./normalize.js";
import { maybeEnrichWithLlm } from "./llm.js";
import { upsertInvoice } from "./persist.js";

export async function ingestFile(filePath: string) {
  const abs = path.resolve(filePath);
  const hash = await contentHash(abs);
  const { text, source } = await extractText(abs);

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
  const finalDoc = await maybeEnrichWithLlm({ ...rules, extractSource: source });
  return upsertInvoice(finalDoc);
}
