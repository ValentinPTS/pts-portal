// Formula engine for the Word-like editor: a tiny linear syntax → native MathML.
// Dependency-free on purpose (no KaTeX/MathJax): MathML Core renders natively in
// every modern browser AND in the Playwright Chromium that makes the PDFs, so a
// formula inserted in the editor prints pixel-identical with zero extra assets.
//
// Syntax (what the owner types in the formula box):
//   /            fraction        (x − y) / σ        → parens around an operand
//                                                     of a fraction are dropped
//   sqrt(...)    square root
//   x^2          superscript     u_i^2 → msubsup
//   x_i          subscript
//   · or ×       multiplication  (a bare * between spaces also works)
//   + − = ± ≈ ≠ ≤ ≥ < > ,   relations/operators
// Identifiers may be Latin/Greek/Cyrillic letters, digits, and a trailing *
// (e.g. s* — the robust SD). Everything is escaped — the output is safe HTML.
//
// PURE module (no DOM, no next) — unit-testable and usable on both sides.

const escText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Tok =
  | { t: "num"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }   // + − = ± ≈ ≠ ≤ ≥ < > ,
  | { t: "mul" }             // · × *
  | { t: "div" }             // /
  | { t: "sup" }             // ^
  | { t: "sub" }             // _
  | { t: "lp" } | { t: "rp" }
  | { t: "sqrt" };

const ID_START = /[A-Za-zͰ-ϿЀ-ӿ…̄̅µ′]/; // letters, greek, cyrillic, …, macron, µ, ′
const ID_CHAR = /[A-Za-z0-9Ͱ-ϿЀ-ӿ…̄̅̃̂µ′]/;
const OPS = new Set(["+", "−", "=", "±", "≈", "≠", "≤", "≥", "<", ">", ","]);

function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  const s = src.replace(/-/g, "−"); // hyphen → proper minus
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      toks.push({ t: "num", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < s.length && ID_CHAR.test(s[j])) j++;
      if (s[j] === "*") j++; // s* — the robust-statistics star belongs to the name
      const word = s.slice(i, j);
      toks.push(word === "sqrt" ? { t: "sqrt" } : { t: "id", v: word });
      i = j;
      continue;
    }
    if (c === "(") { toks.push({ t: "lp" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rp" }); i++; continue; }
    if (c === "/") { toks.push({ t: "div" }); i++; continue; }
    if (c === "^") { toks.push({ t: "sup" }); i++; continue; }
    if (c === "_") { toks.push({ t: "sub" }); i++; continue; }
    if (c === "·" || c === "×" || c === "*") { toks.push({ t: "mul" }); i++; continue; }
    if (OPS.has(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    return null; // unknown character → parse error
  }
  return toks;
}

// A parsed node: its MathML plus, for "(…)" groups, the inner MathML without the
// visible parens — a fraction operand drops them (like Word), sup/sub keep them.
interface Node { ml: string; inner?: string }

class P {
  toks: Tok[]; i = 0;
  constructor(toks: Tok[]) { this.toks = toks; }
  peek(): Tok | undefined { return this.toks[this.i]; }
  next(): Tok | undefined { return this.toks[this.i++]; }

  expr(): Node | null {
    const parts: string[] = [];
    let n = this.term();
    if (!n) return null;
    parts.push(n.ml);
    while (this.peek()?.t === "op") {
      const op = this.next() as { t: "op"; v: string };
      parts.push(`<mo>${escText(op.v)}</mo>`);
      n = this.term();
      if (!n) return null;
      parts.push(n.ml);
    }
    return parts.length === 1 ? n : { ml: `<mrow>${parts.join("")}</mrow>` };
  }

  term(): Node | null {
    let n = this.factor();
    if (!n) return null;
    for (;;) {
      const t = this.peek();
      if (t?.t === "div") {
        this.next();
        const d = this.factor();
        if (!d) return null;
        n = { ml: `<mfrac><mrow>${n.inner ?? n.ml}</mrow><mrow>${d.inner ?? d.ml}</mrow></mfrac>` };
      } else if (t?.t === "mul") {
        this.next();
        const m = this.factor();
        if (!m) return null;
        n = { ml: `<mrow>${n.ml}<mo>·</mo>${m.ml}</mrow>` };
      } else break;
    }
    return n;
  }

  factor(): Node | null {
    const base = this.atom();
    if (!base) return null;
    let sub: Node | null = null;
    let sup: Node | null = null;
    for (;;) {
      const t = this.peek();
      if (t?.t === "sub" && !sub) { this.next(); sub = this.atom(); if (!sub) return null; }
      else if (t?.t === "sup" && !sup) { this.next(); sup = this.atom(); if (!sup) return null; }
      else break;
    }
    if (sub && sup) return { ml: `<msubsup>${wrap(base.ml)}${wrap(sub.ml)}${wrap(sup.ml)}</msubsup>` };
    if (sub) return { ml: `<msub>${wrap(base.ml)}${wrap(sub.ml)}</msub>` };
    if (sup) return { ml: `<msup>${wrap(base.ml)}${wrap(sup.ml)}</msup>` };
    return base;
  }

  atom(): Node | null {
    const t = this.next();
    if (!t) return null;
    if (t.t === "num") return { ml: `<mn>${escText(t.v)}</mn>` };
    if (t.t === "id") return { ml: `<mi>${escText(t.v)}</mi>` };
    if (t.t === "op" && t.v === "−") {
      // unary minus (e.g. −2 or −x)
      const n = this.atom();
      return n ? { ml: `<mrow><mo>−</mo>${n.ml}</mrow>` } : null;
    }
    if (t.t === "sqrt") {
      if (this.next()?.t !== "lp") return null;
      const inner = this.expr();
      if (!inner || this.next()?.t !== "rp") return null;
      return { ml: `<msqrt><mrow>${inner.inner ?? inner.ml}</mrow></msqrt>` };
    }
    if (t.t === "lp") {
      const inner = this.expr();
      if (!inner || this.next()?.t !== "rp") return null;
      return { ml: `<mrow><mo>(</mo>${inner.ml}<mo>)</mo></mrow>`, inner: inner.ml };
    }
    return null;
  }
}

// single-element wrap for msub/msup children (MathML wants exactly one element each)
const wrap = (ml: string) => (/^<m(i|n|o|row|frac|sqrt|sub|sup|subsup)[ >]/.test(ml) && balanced(ml) ? ml : `<mrow>${ml}</mrow>`);
// crude single-root check: the first tag closes at the very end
function balanced(ml: string): boolean {
  const m = /^<(m[a-z]+)[ >]/.exec(ml);
  return !!m && ml.endsWith(`</${m[1]}>`) && ml.indexOf(`</${m[1]}>`) === ml.length - m[1].length - 3;
}

// The public API: linear source → a complete <math> element, or null on error.
export function formulaToMathML(src: string): string | null {
  const toks = tokenize(src.trim());
  if (!toks || toks.length === 0) return null;
  const p = new P(toks);
  const n = p.expr();
  if (!n || p.i !== toks.length) return null;
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>${n.ml}</mrow></math>`;
}

// Ready-made PT-statistics formulas (ISO 13528 / ISO/IEC 17043) for the insert
// panel — the source strings round-trip through the same parser.
export const PT_FORMULAS: { id: string; nameBg: string; nameEn: string; src: string }[] = [
  { id: "z", nameBg: "z-показател", nameEn: "z score", src: "z = (x_i − x_pt) / σ_pt" },
  { id: "zeta", nameBg: "ζ-показател", nameEn: "ζ score", src: "ζ = (x_i − x_pt) / sqrt(u_xi^2 + u_xpt^2)" },
  { id: "en", nameBg: "Eₙ-показател (калибриране)", nameEn: "Eₙ number (calibration)", src: "E_n = (x_lab − X_ref) / sqrt(U_lab^2 + U_ref^2)" },
  { id: "uxpt", nameBg: "Неопределеност на определената стойност", nameEn: "Uncertainty of assigned value", src: "u_xpt = 1.25 · s* / sqrt(p)" },
  { id: "bigU", nameBg: "Разширена неопределеност", nameEn: "Expanded uncertainty", src: "U = k · u_c , k = 2" },
  { id: "mean", nameBg: "Средна стойност", nameEn: "Mean value", src: "x̄ = (x_1 + x_2 + … + x_n) / n" },
];
