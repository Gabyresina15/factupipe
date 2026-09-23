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

export async function ocrImage(imagePath: string): Promise<string> {
  if (!ocrModelId) await initQvac();
  if (!ocrModelId) throw new Error("OCR QVAC no listo");

  const clean = path.join(tmpdir(), `factupipe-${Date.now()}.jpg`);
  try {
    await sharp(imagePath).jpeg({ quality: 90 }).toFile(clean);
    const { blocks } = ocr({ modelId: ocrModelId, image: clean });
    const textBlocks = await blocks;
    return textBlocks.map((b: { text?: string }) => b.text ?? "").join(" ").trim();
  } finally {
    await unlink(clean).catch(() => undefined);
  }
}

export async function completeJson(prompt: string): Promise<Record<string, unknown> | null> {
  if (!llmModelId) await initQvac();
  if (!llmModelId) return null;

  const history = [{ role: "user" as const, content: prompt }];
  const result = completion({
    modelId: llmModelId,
    history,
    stream: true,
    maxTokens: 256,
  });

  let full = "";
  for await (const token of result.tokenStream) {
    full += token;
  }

  const cleaned = full.replace(/<think>[\s\S]*?<\/think>/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
