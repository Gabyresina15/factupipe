const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// Módulo 11 AFIP. Resto 11 -> DV 0. Resultado 10 -> CUIT inválido
// (AFIP en ese caso cambia el prefijo a 23/33, que ya valida solo con esta regla).
export function cuitChecksumOk(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  if (!/^(20|23|24|25|26|27|30|33|34)/.test(digits)) return false;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const check = 11 - (sum % 11);
  if (check === 10) return false;
  return (check === 11 ? 0 : check) === Number(digits[10]);
}

// Sin plegar letras: cualquier caracter que no sea dígito, guion o espacio invalida.
export function formatCuit(raw?: string): { cuit?: string; warning?: "cuit_checksum" } {
  if (!raw) return {};
  if (/[^0-9\-\s]/.test(raw)) return { warning: "cuit_checksum" };
  const d = raw.replace(/\D/g, "");
  if (!cuitChecksumOk(d)) return { warning: "cuit_checksum" };
  return { cuit: `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` };
}
