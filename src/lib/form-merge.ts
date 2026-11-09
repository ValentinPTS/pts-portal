// What a form may write (4.4 review): only the fields the person CHANGED from what they
// were shown — a field left as shown is not written, so a form left open does not undo
// what someone else saved meanwhile. A field the person changed that someone else also
// changed meanwhile (to something else) is a conflict: refused, to be looked at again.
// Pure.

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

/** `posted`: the values as read from the form; `shown`: as the form showed them (none:
 *  an older page — then what differs from now); `current`: as they are now. */
export function changedOnly<T extends object>(
  posted: T,
  shown: Record<string, unknown> | null | undefined,
  current: object,
): { patch: Partial<T>; conflict: (keyof T & string)[] } {
  const patch: Partial<T> = {};
  const conflict: (keyof T & string)[] = [];
  const now = current as Record<string, unknown>;
  for (const k of Object.keys(posted) as (keyof T & string)[]) {
    const v = posted[k];
    if (!shown) { if (!same(v, now[k])) patch[k] = v; continue; }
    if (same(v, shown[k])) continue;                                          // not changed by the person
    if (!same(now[k], shown[k]) && !same(now[k], v)) { conflict.push(k); continue; } // changed by someone else too
    patch[k] = v;
  }
  return { patch, conflict };
}

/** A form's «shown» values, posted as JSON — an object, or none. */
export function readShown(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v !== "string" || !v.trim()) return null;
  try { const o = JSON.parse(v); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { return null; }
}

export const CONFLICT_TEXT = {
  bg: "някой друг промени същите данни междувременно — заредете страницата и опитайте пак",
  en: "someone else changed the same data meanwhile — reload the page and try again",
};
