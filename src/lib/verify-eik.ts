// Offline validation of a Bulgarian ЕИК / Булстат (Unified Identification Code).
// Pure, no I/O — a cheap, instant sanity check that catches typos and fabricated
// numbers on the public application form. It does NOT prove the company exists or
// is accredited; that's the human reviewer's job (§approval). Algorithm per the
// Registry Agency (Bulstat) spec: 9-digit legal entities and their 13-digit
// branch/unit extension, each with a weighted mod-11 check digit.

function digitsOnly(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

// mod-11 with a primary weight set; if the remainder is 10, retry with a secondary
// set, and a remainder of 10 there maps to a check digit of 0.
function weightedCheck(nums: number[], primary: number[], secondary: number[]): number {
  const sum = (w: number[]) => nums.reduce((acc, n, i) => acc + n * w[i], 0);
  let c = sum(primary) % 11;
  if (c === 10) {
    c = sum(secondary) % 11;
    if (c === 10) c = 0;
  }
  return c;
}

function valid9(d: string): boolean {
  const n = d.split("").map(Number);
  const c = weightedCheck(n.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8], [3, 4, 5, 6, 7, 8, 9, 10]);
  return c === n[8];
}

function valid13(d: string): boolean {
  if (!valid9(d.slice(0, 9))) return false;
  const n = d.split("").map(Number);
  // The 13th digit checks positions 9–12 (0-indexed 8–11).
  const c = weightedCheck(n.slice(8, 12), [2, 7, 3, 5], [4, 9, 5, 7]);
  return c === n[12];
}

// Returns whether the ЕИК is structurally valid + the digits-only normalized form.
export function validateEik(raw: string): { ok: boolean; normalized: string } {
  const d = digitsOnly(raw);
  if (d.length === 9) return { ok: valid9(d), normalized: d };
  if (d.length === 13) return { ok: valid13(d), normalized: d };
  return { ok: false, normalized: d };
}
