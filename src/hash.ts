import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function contentHash(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}
