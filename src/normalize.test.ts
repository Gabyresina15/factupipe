import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { cuitChecksumOk } from "./cuit.js";
import { normalizeFromText, parseTipoCambio, tipoComprobante } from "./normalize.js";

const META = { pathOrigen: "test", contentHash: "a".repeat(64) };
const FIELDS = ["cuit", "warnings", "nroFactura", "fecha", "neto", "iva", "total", "moneda", "tipoCambio", "totalArs"] as const;

test("modulo 11 acepta 30-00000000-7 y rechaza el OCR de Lider", () => {
  assert.equal(cuitChecksumOk("30000000007"), true);
  assert.equal(cuitChecksumOk("20123458783"), false);
});

test("golden rawText: cada campo de expectedFromRawText", () => {
  const dir = path.resolve("golden");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 4);
  for (const file of files) {
    const golden = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const expectRaw = golden.expectedFromRawText;
    if (!expectRaw) continue;
    const got = normalizeFromText(golden.rawText, { ...META, pathOrigen: file }) as Record<string, unknown>;
    for (const key of FIELDS) {
      if (!(key in expectRaw)) continue;
      assert.deepEqual(got[key] ?? null, expectRaw[key], `${file} ${key}`);
    }
  }
});

test("Factura C (golden arca-c): iva 0 y neto = total", () => {
  const golden = JSON.parse(readFileSync(path.resolve("golden/arca-c.json"), "utf8"));
  assert.equal(tipoComprobante(golden.rawText), "C");
  const got = normalizeFromText(golden.rawText, META);
  assert.equal(got.iva, 0);
  assert.equal(got.neto, got.total);
  assert.equal(got.total, 10890);
});

test("Factura C sintética: código 011 manda, IVA leído se descarta", () => {
  const got = normalizeFromText(
    "FACTURA C COD. 011 Punto de Venta: 00003 Comp. Nro: 00000042 Cond. IVA 21 % 50,00 Importe Total: $ 1.500,00",
    META
  );
  assert.equal(got.iva, 0);
  assert.equal(got.neto, 1500);
  assert.equal(got.total, 1500);
});

test("Factura A/B con receptor monotributista no es C", () => {
  const a =
    "ORIGINAL A FACTURA Cod. 01 Razon Social: Proveedor SA Responsable Inscripto Cliente: Juan Perez Responsable Monotributo Importe Neto Gravado: $ 1.000,00 IVA 21% $ 210,00 Importe Total: $ 1.210,00";
  assert.equal(tipoComprobante(a), "A");
  const gotA = normalizeFromText(a, META);
  assert.equal(gotA.iva, 210);
  assert.equal(gotA.neto, 1000);
  const b = "FACTURA B COD. 006 Señor(es): Ana Gomez Responsable Monotributo Importe Total: $ 500,00";
  assert.equal(tipoComprobante(b), "B");
  // Sin código ni letra: monotributo después de los datos del receptor no alcanza para decir C.
  assert.equal(tipoComprobante("FACTURA Cliente: Pepe Monotributista Total: $ 10,00"), undefined);
  // Monotributo en el bloque del emisor, antes del receptor: C.
  assert.equal(tipoComprobante("FACTURA Juan SRL Responsable Monotributo Cliente: Pepe Total: $ 10,00"), "C");
});

test("tipo de cambio: formatos AR con etiqueta", () => {
  assert.equal(parseTipoCambio("Tipo de cambio: 1.234,56"), 1234.56);
  assert.equal(parseTipoCambio("T.C. 1234.56"), 1234.56);
  assert.equal(parseTipoCambio("Cotización: 65,00"), 65);
  assert.equal(parseTipoCambio("TC 1,234.50"), 1234.5);
  assert.equal(parseTipoCambio("tipo de cambio consignado de $ 1.050"), 1050);
  assert.equal(parseTipoCambio("Cotización del dólar: 980,5"), 980.5);
});

test("tipo de cambio: sin etiqueta o con OCR sucio queda null", () => {
  assert.equal(parseTipoCambio("Importe Total: USD 12100,00 65,00"), undefined);
  assert.equal(parseTipoCambio("Tipo de cambio: 65 oo]j0"), undefined);
  assert.equal(parseTipoCambio("Tipo de cambio: 6S,00"), undefined);
  assert.equal(parseTipoCambio("canibic Coisnauode 65 oo]j0 ascenle & 786500,00"), undefined);
});

test("USD: total en USD, totalArs = total * tipoCambio redondeado", () => {
  const got = normalizeFromText(
    "FACTURA A Cod. 01 Moneda: USD Importe Neto Gravado: USD 1.000,00 IVA 21% USD 210,00 Importe Total: USD 1.210,00 Tipo de cambio: 1.234,567",
    META
  );
  assert.equal(got.moneda, "USD");
  assert.equal(got.total, 1210);
  assert.equal(got.tipoCambio, 1234.567);
  assert.equal(got.totalArs, 1493826.07);
});

test("USD sin tipo de cambio legible: totalArs null; ARS ignora cotizaciones", () => {
  const usd = normalizeFromText("Moneda: USD Importe Total: USD 100,00", META);
  assert.equal(usd.total, 100);
  assert.equal(usd.tipoCambio, undefined);
  assert.equal(usd.totalArs, undefined);
  const ars = normalizeFromText("FACTURA B Cod. 06 Importe Total: $ 100,00 Cotización: 1.000,00", META);
  assert.equal(ars.moneda, "ARS");
  assert.equal(ars.tipoCambio, undefined);
  assert.equal(ars.totalArs, undefined);
});

test("importe AR con punto de miles y punto decimal de OCR", async () => {
  const { parseMoney, normalizeFromText } = await import("./normalize.js");
  assert.equal(parseMoney("10.890.00"), 10890);
  assert.equal(parseMoney("10.820.0o"), 10820);
  const got = normalizeFromText(
    "FACTURA B COD. 06 CUIT: 20-12345878-3 Subtotal: 10.820.0o Total: $ 10.890.00 IVA Contenido: $ 1.890,00",
    { pathOrigen: "b", contentHash: "a".repeat(64) }
  );
  assert.equal(got.cuit, undefined);
  assert.deepEqual(got.warnings, ["cuit_checksum"]);
  assert.equal(got.total, 10890);
  assert.equal(got.neto, 10820);
});
