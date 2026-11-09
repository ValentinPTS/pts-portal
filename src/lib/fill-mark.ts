// A visible mark for what a document still needs — «[за попълване: …]» (plan parts
// 3.10, 3.11). Pure. A document on M1 carrying one is not issued (lib/m1-render).
import { esc, pick } from "./doc-css";
import type { Lang } from "./types";

export const FILL_BG = "[за попълване:";
export const FILL_EN = "[to be filled in:";
export function fillMark(lang: Lang, what: { bg: string; en: string }): string {
  return `<span class="m1-fill" style="background:#fdf1c7;border:1px dashed #c9a227;padding:0 4px;">${esc(pick(lang, `${FILL_EN} ${what.en}]`, `${FILL_BG} ${what.bg}]`))}</span>`;
}

/** Replace every element that opens with `open` — to its matching close, counting the
 *  same tags inside it — by what `make` gives for it. */
export function replaceBlocks(html: string, open: RegExp, tag: string, make: (old: string) => string): string {
  let out = "", i = 0;
  const re = new RegExp(open.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const t = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
    t.lastIndex = m.index + m[0].length;
    let depth = 1, end = -1, x: RegExpExecArray | null;
    while ((x = t.exec(html))) { depth += x[0][1] === "/" ? -1 : 1; if (depth === 0) { end = x.index + x[0].length; break; } }
    if (end < 0) break;
    out += html.slice(i, m.index) + make(html.slice(m.index, end));
    i = end;
    re.lastIndex = end;
  }
  return out + html.slice(i);
}
