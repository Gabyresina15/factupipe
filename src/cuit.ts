const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function cuitChecksumOk(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  if (!/^(20|23|24|25|26|27|30|33|34)/.test(digits)) return false;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = sum % 11;
  let check = 11 - mod;
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return check === Number(digits[10]);
}

export function formatCuit(raw?: string): { cuit?: string; warning?: "cuit_checksum" } {
  if (!raw) return {};
  const folded = raw.replace(/[oO]/g, "0");
  if (/[a-z]/i.test(folded.replace(/[0-9\-\s]/g, ""))) {
    return { warning: "cuit_checksum" };
  }
  const d = folded.replace(/\D/g, "");
  if (d.length !== 11) return { warning: "cuit_checksum" };
  if (!cuitChecksumOk(d)) return { warning: "cuit_checksum" };
  return { cuit: `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` };
}
