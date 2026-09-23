import {
  loadModel,
  ocr,
  completion,
  OCR_LATIN,
  MODEL_TYPES,
  LLAMA_3_2_1B_INST_Q4_0,
} from "@qvac/sdk";
import sharp from "sharp";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

let ocrModelId: string | null = null;
let llmModelId: string | null = null;
let loading: Promise<void> | null = null;
let chain: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function isStale(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /stale job replaced by new run/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function qvacReady() {
  return Boolean(ocrModelId && llmModelId);
}

export async function initQvac() {
  if (process.env.QVAC_ENABLED === "0") {
    console.log("QVAC deshabilitado (QVAC_ENABLED=0)");
    return;
  }
  if (ocrModelId && llmModelId) return;
  if (loading) return loading;

  loading = (async () => {
    console.log("[QVAC] Cargando OCR + LLM local...");
    ocrModelId = await loadModel({
      modelSrc: OCR_LATIN.src,
      modelType: MODEL_TYPES.ggmlOcr,
    });
    console.log("[QVAC] OCR listo", ocrModelId);

    llmModelId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      modelConfig: { ctx_size: Number(process.env.QVAC_CTX_SIZE ?? 2048) },
    });
    console.log("[QVAC] LLM listo", llmModelId);
  })();

  try {
    await loading;
  } catch (e) {
    ocrModelId = null;
    llmModelId = null;
    loading = null;
    console.error("[QVAC] no se pudo inicializar", e);
    throw e;
  }
}

async function runOcrOnce(cleanJpg: string): Promise<string> {
  if (!ocrModelId) throw new Error("OCR QVAC no listo");
  const { blocks } = ocr({ modelId: ocrModelId, image: cleanJpg });
  const textBlocks = await blocks;
  return textBlocks.map((b: { text?: string }) => b.text ?? "").join(" ").trim();
}

export async function ocrImage(imagePath: string): Promise<string> {
  if (!ocrModelId) await initQvac();
  if (!ocrModelId) throw new Error("OCR QVAC no listo");

  const clean = path.join(tmpdir(), `factupipe-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`);
  await sharp(imagePath).rotate().jpeg({ quality: 92 }).toFile(clean);

  try {
    return await exclusive(async () => {
      let lastErr: unknown;
      for (let i = 0; i < 3; i++) {
        try {
          return await runOcrOnce(clean);
        } catch (e) {
          lastErr = e;
          if (!isStale(e) || i === 2) break;
          console.warn("[QVAC OCR] job pisado, reintento", i + 1);
          await sleep(400 * (i + 1));
        }
      }
      throw lastErr;
    });
  } finally {
    await unlink(clean).catch(() => undefined);
  }
}

export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const slice = cleaned.slice(start, i + 1);
      try {
        return JSON.parse(slice) as Record<string, unknown>;
      } catch {
        try {
          const repaired = slice
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]")
            .replace(/[\u201c\u201d]/g, '"');
          return JSON.parse(repaired) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function completeJson(prompt: string): Promise<Record<string, unknown> | null> {
  if (!llmModelId) await initQvac();
  if (!llmModelId) return null;

  return exclusive(async () => {
    const history = [{ role: "user" as const, content: prompt }];
    const result = completion({
      modelId: llmModelId!,
      history,
      stream: true,
      maxTokens: 320,
    });

    let full = "";
    for await (const token of result.tokenStream) {
      full += token;
    }

    const parsed = extractJsonObject(full);
    if (!parsed) {
      console.error("[QVAC LLM] raw:", full.slice(0, 500));
    }
    return parsed;
  });
}
