import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export async function extractPdfText(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text?: string }>;
  const result = await pdfParse(buf);
  return (result.text ?? "").trim();
}
