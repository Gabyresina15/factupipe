import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { cuitChecksumOk } from "./cuit.js";
import { normalizeFromText } from "./normalize.js";

test("modulo 11 acepta 30-00000000-7 y rechaza el OCR de Lider", () => {
  assert.equal(cuitChecksumOk("30000000007"), true);
  assert.equal(cuitChecksumOk("20123458783"), false);
});

test("golden rawText no inventa CUIT", () => {
  const dir = path.resolve("golden");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 4);
  for (const file of files) {
    const golden = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const got = normalizeFromText(golden.rawText, {
      pathOrigen: file,
      contentHash: "a".repeat(64),
    });
    const expectRaw = golden.expectedFromRawText;
    if (!expectRaw) continue;
    assert.equal(got.cuit ?? null, expectRaw.cuit, file);
    if (expectRaw.warnings) {
      assert.deepEqual(got.warnings, expectRaw.warnings, file);
    }
    if (expectRaw.moneda) assert.equal(got.moneda, expectRaw.moneda, file);
    if (expectRaw.total != null) assert.equal(got.total, expectRaw.total, file);
  }
});
