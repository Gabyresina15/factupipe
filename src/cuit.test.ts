import assert from "node:assert/strict";
import test from "node:test";
import { cuitChecksumOk, formatCuit } from "./cuit.js";

test("30-00000000-7 cierra módulo 11", () => {
  assert.equal(cuitChecksumOk("30000000007"), true);
  assert.equal(formatCuit("30-00000000-7").cuit, "30-00000000-7");
});

test("OCR con letras no se pliega a un CUIT válido", () => {
  const dirty = formatCuit("300o0c0o007");
  assert.equal(dirty.cuit, undefined);
  assert.deepEqual(dirty.warning, "cuit_checksum");
  const ohs = formatCuit("3OOOOOOOOO7");
  assert.equal(ohs.cuit, undefined);
});

test("dígito verificador mal no pasa", () => {
  assert.equal(cuitChecksumOk("30000000006"), false);
  assert.equal(formatCuit("30-00000000-6").cuit, undefined);
});

test("resultado 10 es inválido, no se guarda como 9", () => {
  assert.equal(cuitChecksumOk("20000000019"), false);
  assert.equal(formatCuit("20-00000001-9").cuit, undefined);
});
