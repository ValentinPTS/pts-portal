// The code rule (plan part 3.12; PTS's А2; D17). Pure.
//
// PTS (А2): «Кодът е пореден и обвързан с номера на схемата. Днешният формат е
// година, месец без водеща нула, поредният номер на схемата и двуцифрен номер на
// лабораторията, например PTS 25/07-T-1 → 257101.» The code is unique within the
// scheme, not across schemes — the key is always the pair (scheme, code).
//
// WHEN the lab number is given, and how:
//   - a SEQUENTIAL calibration scheme — at admission, drawn at random from the numbers
//     not yet given (D17: the device travels before applications close, and the
//     Results Sheet carries the code before it arrives);
//   - every other scheme — at the coding act after applications close, drawn at
//     random (А2; the act is part 5.3). Until 5.3 is built a participant added by PTS
//     gets the next number in turn, as before.
// A number once given is never given again in the scheme.

export const CODE_FORMAT = { bg: "година, месец без водеща нула, пореден номер на схемата, двуцифрен номер на лабораторията", en: "year, month without a leading zero, the scheme's sequence, a two-digit laboratory number" };
export const MAX_LAB_NUMBER = 99;

export type CodeMoment = "admission" | "coding-act";

/** When a scheme's participants get their lab numbers (D17). */
export function codeMoment(s: { type: "T" | "C"; distribution?: string }): CodeMoment {
  return s.type === "C" && s.distribution !== "simultaneous" ? "admission" : "coding-act";
}

/** The lab numbers already given under this prefix. */
export function numbersTaken(prefix: string, taken: readonly string[]): Set<number> {
  return new Set(taken.filter((c) => c.startsWith(prefix) && /^\d{2}$/.test(c.slice(prefix.length))).map((c) => parseInt(c.slice(prefix.length), 10)));
}

/** A lab number drawn at random from those not yet given (1…99); null when none is left.
 *  `below(n)` is a fair random whole number in [0, n) — lib/random.uniformBelow. */
export function drawLabNumber(prefix: string, taken: readonly string[], below: (n: number) => number): number | null {
  const used = numbersTaken(prefix, taken);
  const free = Array.from({ length: MAX_LAB_NUMBER }, (_, i) => i + 1).filter((n) => !used.has(n));
  return free.length ? free[below(free.length)] : null;
}

/** The next lab number in turn (the rule until the coding act of 5.3). */
export function nextLabNumber(prefix: string, taken: readonly string[]): number | null {
  const used = numbersTaken(prefix, taken);
  const next = used.size ? Math.max(...used) + 1 : 1;
  return next <= MAX_LAB_NUMBER ? next : null;
}

export const labCode = (prefix: string, n: number) => `${prefix}${String(n).padStart(2, "0")}`;
