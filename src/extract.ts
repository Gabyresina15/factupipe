import path from "node:path";
import { extractPdfText } from "./pdf.js";
import { ocrImage, qvacReady, initQvac } from "./qvac.js";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"]);

export type ExtractResult = {
  text: string;
  source: "pdf-parse" | "qvac-ocr" | "empty";
};

export async function extractText(filePath: string): Promise<ExtractResult> {
  const ext = path.extname(filePath).toLowerCase();

  if (IMAGE_EXT.has(ext)) {
    if (!qvacReady()) {
      try {
        await initQvac();
      } catch {
        return { text: "", source: "empty" };
      }
    }
    const text = await ocrImage(filePath);
    return { text, source: text ? "qvac-ocr" : "empty" };
  }

  if (ext === ".pdf") {
    const text = await extractPdfText(filePath);
    if (text && text.length >= 40) return { text, source: "pdf-parse" };

    // PDF escaneado / casi vacío → OCR si el motor local está up
    try {
      if (!qvacReady()) await initQvac();
      const ocrText = await ocrImage(filePath);
      if (ocrText) return { text: ocrText, source: "qvac-ocr" };
    } catch {
      /* sharp/ocr puede no tragar PDF; nos quedamos con pdf-parse */
    }
    return { text: text ?? "", source: text ? "pdf-parse" : "empty" };
  }

  return { text: "", source: "empty" };
}
