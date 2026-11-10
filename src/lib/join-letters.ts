// The organisation's signed letters on which PTS decided a request to join (plan part 9.1) — kept in the
// private «lab-docs» bucket and opened only through their gate (/registrations/letter/<id>); in memory
// locally. Not a server action module: nothing here is callable from a browser.
export const JOIN_LETTER_BUCKET = "lab-docs";

const g = globalThis as unknown as { __ptsJoinLetters?: Map<string, { bytes: Uint8Array; type: string }> };
export function keepMemLetter(path: string, v: { bytes: Uint8Array; type: string }): void { (g.__ptsJoinLetters ??= new Map()).set(path, v); }
export function memLetter(path: string): { bytes: Uint8Array; type: string } | undefined { return g.__ptsJoinLetters?.get(path); }
