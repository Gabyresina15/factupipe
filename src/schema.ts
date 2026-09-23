import { z } from "zod";

export const InvoiceSchema = z.object({
  cuit: z
    .string()
    .regex(/^(20|23|24|25|26|27|30|33|34)-?\d{8}-?\d$/)
    .optional(),
  razonSocial: z.string().min(3).optional(),
  nroFactura: z.string().min(3).optional(),
  fecha: z.string().optional(),
  neto: z.number().nonnegative().optional(),
  iva: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  moneda: z.enum(["ARS", "USD", "EUR"]).default("ARS"),
  pathOrigen: z.string(),
  contentHash: z.string().length(64),
  status: z.enum(["complete", "partial", "failed"]),
  extraction: z.enum(["rules", "llm", "hybrid"]),
  rawText: z.string().optional(),
  ingestCount: z.number().int().default(1),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

export const KEY_FIELDS = ["cuit", "razonSocial", "nroFactura", "fecha", "total"] as const;

export function keyFieldScore(inv: Record<string, unknown>) {
  const hit = KEY_FIELDS.filter((k) => inv[k] !== undefined && inv[k] !== null && inv[k] !== "").length;
  return { hit, total: KEY_FIELDS.length, pct: (hit / KEY_FIELDS.length) * 100 };
}

export function decideStatus(inv: Record<string, unknown>) {
  const { hit } = keyFieldScore(inv);
  if (hit === 0) return "failed" as const;
  if (hit < KEY_FIELDS.length) return "partial" as const;
  return "complete" as const;
}
