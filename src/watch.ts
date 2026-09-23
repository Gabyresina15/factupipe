import chokidar from "chokidar";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { ingestFile } from "./pipeline.js";

export async function startWatcher() {
  const inbox = process.env.INBOX_DIR ?? "./inbox";
  const processed = process.env.PROCESSED_DIR ?? "./processed";
  const failed = process.env.FAILED_DIR ?? "./failed";
  await Promise.all([inbox, processed, failed].map((d) => mkdir(d, { recursive: true })));

  const w = chokidar.watch(inbox, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 800 },
  });

  w.on("add", async (file) => {
    if (!file.toLowerCase().endsWith(".pdf")) return;
    try {
      const { created } = await ingestFile(file);
      await rename(file, path.join(processed, path.basename(file)));
      console.log(created ? "INGEST" : "DEDUP", path.basename(file));
    } catch (e) {
      await rename(file, path.join(failed, path.basename(file))).catch(() => undefined);
      console.error("FAIL", file, e);
    }
  });

  return w;
}
