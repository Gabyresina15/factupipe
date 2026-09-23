import path from "node:path";
import { contentHash } from "./hash.js";
import { extractPdfText } from "./pdf.js";
import { normalizeFromText } from "./normalize.js";
import { maybeEnrichWithLlm } from "./llm.js";
import { upsertInvoice } from "./persist.js";

export async function ingestFile(filePath: string) {
  const abs = path.resolve(filePath);
  const hash = await contentHash(abs);
  const text = await extractPdfText(abs);

  if (!text) {
    return upsertInvoice({
      pathOrigen: abs,
      contentHash: hash,
      status: "failed",
      extraction: "rules",
      rawText: "",
      moneda: "ARS",
    });
  }

  const rules = normalizeFromText(text, { pathOrigen: abs, contentHash: hash });
  const finalDoc = await maybeEnrichWithLlm(rules);
  return upsertInvoice(finalDoc);
}
