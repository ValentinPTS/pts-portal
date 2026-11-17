// A grammar-based generator of document bodies, seeded (same seed → same documents). Used by
// scripts/verify-doc-links.mjs (copied from the round 9 rule test, links/lib/gen.mjs).
//
// Every document holds at least one link (an HTML <a>, an SVG <a>, a link inside MathML's
// <mtext> or SVG's <foreignObject>, or an image map's <area>), nested inside and around boxes
// that can move or grow it: positioned, transformed, floated, flex, grid, table, svg,
// foreignObject, math, dialog/details, free pictures. Style values use every spelling trick:
// «!important» variants, comments, backslash and unicode escapes, calc/var/min/max/clamp/round,
// e-notation, every unit, negative and huge values; width/height attributes; classes from the
// app's own stylesheets (DOC_CSS, the skins, each document's extra CSS, the editor's CSS) and ids.
//
// A document is a tree (so the minimiser can cut it): { tag, attrs: [[n, v|null]], style: [decl…]|null,
// kids: [...] } or { text }. render(tree) → HTML.

const VOID = new Set(["img", "br", "hr", "input", "area", "col", "wbr", "source"]);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function render(n) {
  if (Array.isArray(n)) return n.map(render).join("");
  if (n.raw !== undefined) return n.raw;
  if (n.text !== undefined) return n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let s = "<" + n.tag;
  for (const [k, v] of n.attrs ?? []) s += v === null ? ` ${k}` : ` ${k}="${esc(v)}"`;
  if (n.style && n.style.length) s += ` style="${esc(n.style.join(";"))}"`;
  if (VOID.has(n.tag)) return s + ">";
  if (n.selfClose) return s + "/>";
  return s + ">" + (n.kids ?? []).map(render).join("") + `</${n.tag}>`;
}

const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="; // 1×1 px
const SRCS = [PNG1, "/brand/logo.png", "/brand/snas.png", "/brand/ico-mail.png", PNG1];
const HREFS = ["https://evil.example/landing", "https://ptsbg.eu/", "mailto:x@example.invalid", "tel:+359000000", "/apply", "#top", "http://example.invalid/p?q=1"];
const WORDS = ["линк", "тук", "x", "Виж", "office", "документ", "→", "ptsbg.eu", "1", "Покана"];

// ── values and their spellings ───────────────────────────────────────────────────────
const UNITS = ["px", "pt", "pc", "mm", "cm", "in", "Q", "em", "rem", "ex", "ch", "lh", "rlh", "vw", "vh", "vmin", "vmax", "svh", "lvh", "dvh", "svw", "cqw", "cqh", "%", ""];
function number(r, big) {
  const mag = big ? r.pick([500, 1000, 3000, 5000, 20000, 99999]) : r.pick([0, 1, 4, 10, 20, 50, 100]);
  const forms = [() => String(mag), () => (mag / 1000).toString().replace(/^0/, "") + "e3", () => `${mag / 100}E2`, () => `+${mag}`, () => `${mag}.0`, () => `${mag}e0`, () => `.${mag}e${String(mag).length}`];
  return r.pick(forms)();
}
function length(r, { big = r.chance(0.6), neg = r.chance(0.3) } = {}) {
  const u = r.pick(UNITS);
  const n = number(r, big);
  const plain = `${neg ? "-" : ""}${n}${u}`;
  const wrap = r.int(0, 9);
  if (wrap === 0) return `calc(${neg ? "-1" : "1"} * ${n}${u || "px"})`;
  if (wrap === 1) return `calc(100% + ${n}px)`;
  if (wrap === 2) return `min(${plain}, 99999px)`;
  if (wrap === 3) return `max(${plain}, ${neg ? "-" : ""}1px)`;
  if (wrap === 4) return `clamp(${plain}, ${plain}, ${plain})`;
  if (wrap === 5) return `round(${plain}, 1px)`;
  if (wrap === 6) return `/**/${plain}/**/`;
  return plain;
}
const VARS = ["--x", "--p", "--m", "--w", "--h"];
function spellIdent(r, s) {
  const k = r.int(0, 7);
  if (k === 0) return s.toUpperCase();
  if (k === 1) return s.replace(/[a-z]/, (c) => `\\${c.charCodeAt(0).toString(16)} `); // \61 bsolute
  if (k === 2) return s.replace(/[a-z]/, (c) => `\\${c}`); // abs\olute
  if (k === 3) return s.replace(/[a-z]/, (c) => `\\00${c.charCodeAt(0).toString(16)}`);
  return s;
}
function spellProp(r, p) {
  const k = r.int(0, 9);
  if (k === 0) return p.toUpperCase();
  if (k === 1) return spellIdent(r, p);
  if (k === 2 && !p.startsWith("-")) return `-webkit-${p}`;
  return p;
}
function important(r) { return r.pick(["", "", "", "!important", "! important", "!IMPORTANT", "!/**/important", "!\\69mportant", "!\\000069mportant", " /*'*/!important", " !ie"]); }
function decl(r, prop, value) {
  const sep = r.pick([":", ":", " : ", "/**/:", ":/**/"]);
  return `${spellProp(r, prop)}${sep}${value}${important(r)}`;
}

// properties that move, grow, stack or hide a box — and their value makers
const POS = ["absolute", "relative", "fixed", "sticky", "static", "-webkit-sticky"];
const DISPLAY = ["block", "inline-block", "flex", "inline-flex", "grid", "table", "table-cell", "contents", "list-item", "flow-root", "inline", "inline-grid", "ruby", "math"];
function styleDecls(r, { inLink = false, holder = false } = {}) {
  const out = [];
  const n = r.int(1, inLink ? 4 : 5);
  for (let i = 0; i < n; i++) {
    const kind = r.int(0, 27);
    switch (kind) {
      case 0: case 1: out.push(decl(r, "position", spellIdent(r, r.pick(POS)))); break;
      case 2: out.push(decl(r, r.pick(["top", "left", "right", "bottom", "inset", "inset-inline-start", "inset-block-start"]), length(r))); break;
      case 3: case 4: out.push(decl(r, r.pick(["width", "height", "min-height", "min-width", "block-size", "inline-size", "min-block-size", "max-height"]), length(r, { neg: false }))); break;
      case 5: out.push(decl(r, r.pick(["margin", "margin-top", "margin-left", "margin-inline-start", "margin-block-start", "-webkit-margin-before", "margin-block"]), length(r))); break;
      case 6: out.push(decl(r, r.pick(["padding", "padding-top", "padding-bottom", "padding-block", "padding-inline"]), length(r, { neg: false }))); break;
      case 7: out.push(decl(r, r.pick(["border", "border-top", "border-width", "border-left-width", "outline"]), `${length(r, { neg: false })} solid transparent`)); break;
      case 8: out.push(decl(r, "transform", r.pick([`scale(${number(r, true)})`, `translate(${length(r)}, ${length(r)})`, `matrix(99,0,0,99,0,0)`, `scaleY(${number(r, true)})`, `translateY(${length(r)})`, `perspective(1px) translateZ(0.99px)`, `rotate(90deg) scale(50)`]))); break;
      case 9: out.push(decl(r, r.pick(["translate", "scale", "rotate", "zoom"]), r.pick([`${length(r)} ${length(r)}`, number(r, true), "50", "5000%", "90deg"]))); break;
      case 10: out.push(decl(r, "display", spellIdent(r, r.pick(DISPLAY)))); break;
      case 11: out.push(decl(r, r.pick(["float", "clear"]), r.pick(["left", "right", "none", "inline-start"]))); break;
      case 12: out.push(decl(r, r.pick(["flex", "flex-grow", "flex-basis", "align-self", "justify-self", "place-self"]), r.pick(["1", "1 1 5000px", "99", length(r, { neg: false }), "stretch", "auto"]))); break;
      case 13: out.push(decl(r, r.pick(["grid-template-rows", "grid-template-columns", "grid-auto-rows"]), r.pick([length(r, { neg: false }), `repeat(3, ${length(r, { neg: false })})`, "1fr", `minmax(${length(r, { neg: false })}, 1fr)`]))); break;
      case 14: out.push(decl(r, r.pick(["font-size", "line-height", "letter-spacing", "word-spacing", "text-indent"]), length(r, { neg: r.chance(0.2) }))); break;
      case 15: out.push(decl(r, "z-index", r.pick(["9999", "2147483647", "-1", "1", "auto"]))); break;
      case 16: out.push(decl(r, "pointer-events", r.pick(["auto", "none", "all", "visiblePainted", "bounding-box"]))); break;
      case 17: out.push(decl(r, r.pick(["opacity", "color", "background", "fill-opacity"]), r.pick(["0", "0.01", "transparent", "rgba(0,0,0,0)", "#fff0"]))); break;
      case 18: out.push(decl(r, r.pick(["overflow", "contain", "content-visibility", "isolation", "clip-path"]), r.pick(["visible", "hidden", "clip", "none", "paint", "auto", "inset(-5000px)", "circle(5000px)", "isolate"]))); break;
      case 19: { const v = r.pick(VARS); out.push(`${v}:${r.pick([length(r), "absolute", "fixed", "-5000px", "scale(50)", "block"])}`); out.push(decl(r, r.pick(["position", "margin-top", "transform", "height", "padding", "display", "width"]), `var(${v}${r.chance(0.4) ? ", " + length(r) : ""})`)); break; }
      case 20: out.push(decl(r, r.pick(["columns", "column-count", "column-width", "writing-mode", "white-space", "direction"]), r.pick(["99", "5000px", "vertical-lr", "nowrap", "pre", "rtl", "sideways-lr"]))); break;
      case 21: out.push(decl(r, r.pick(["offset-path", "offset-distance", "offset-anchor", "offset-position"]), r.pick(["circle(5000px)", "inset(0 0 0 0)", "50%", "100%", "polygon(0 0, 5000px 5000px, 0 5000px)", "ellipse(9999px 9999px)", "0 0"]))); break;
      case 22: out.push(decl(r, r.pick(["aspect-ratio", "box-sizing", "vertical-align"]), r.pick(["1 / 99", "content-box", length(r)]))); break;
      case 23: out.push(decl(r, r.pick(["border-image-outset", "box-shadow", "shape-outside", "shape-margin"]), r.pick([length(r, { neg: false }), `0 0 0 ${length(r, { neg: false })} red`, "circle(5000px)"]))); break;
      case 24: out.push(decl(r, "font", `${length(r, { neg: false })}/${length(r, { neg: false })} serif`)); break;
      case 25: out.push(decl(r, r.pick(["visibility", "appearance", "user-select"]), r.pick(["visible", "hidden", "collapse", "none", "auto"]))); break;
      case 26: out.push(`margin${r.pick(["", "-top", "-left"])}:${r.pick(["-5e3px", "-.5e4px", "-5000PX", "- 5000px", "-0x1", "-5000\\px", "-50vw", "-150px", "-149px", "-112pt", "-113pt", "-40lh", "calc(-5000px)", "-1e99px", "-Infinitypx", "-4.0e2mm"])}`); break;
      default: out.push(decl(r, r.pick(["height", "width"]), r.pick(["100vh", "100vw", "100%", "99999px", "100dvh", "1e5px", "calc(100vh*10)"]))); break;
    }
  }
  if (holder && r.chance(0.3)) out.push(decl(r, "position", "relative"));
  return out;
}

// classes the app's own stylesheets know — the ones that position, lift or stretch first
export function classPool(cssTexts) {
  const all = new Map();
  for (const css of cssTexts) {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1], body = m[2];
      const hot = /position\s*:\s*(absolute|fixed|sticky|relative)|transform|margin\s*:\s*-|z-index|inset|left\s*:\s*calc\(-|right\s*:\s*calc\(-/.test(body);
      for (const c of sel.matchAll(/\.([a-zA-Z][\w-]*)/g)) all.set(c[1], (all.get(c[1]) ?? 0) + (hot ? 3 : 0.2));
    }
  }
  const hot = [...all].filter(([, w]) => w >= 3).map(([c]) => c);
  const cold = [...all].filter(([, w]) => w < 3).map(([c]) => c);
  return { hot, cold, all: [...all.keys()] };
}

// ── the tree grammar ──────────────────────────────────────────────────────────────────
export function makeGenerator(classes) {
  let mapNo = 0;
  const el = (tag, attrs = [], style = null, kids = []) => ({ tag, attrs, style, kids });
  const T = (s) => ({ text: s });
  function clsAttrs(r) {
    const a = [];
    if (r.chance(0.35)) {
      const n = r.int(1, 2), cs = [];
      for (let i = 0; i < n; i++) cs.push(r.chance(0.7) ? r.pick(classes.hot) : r.pick(classes.cold));
      a.push(["class", cs.join(" ")]);
    }
    if (r.chance(0.1)) a.push(["id", r.pick(["top", "x", "page", "content", "main", "createElement", "body"])]);
    return a;
  }
  function img(r, { free = r.chance(0.35), map = false } = {}) {
    const a = [["src", r.pick(SRCS)], ["alt", ""]];
    if (r.chance(0.4)) a.push(["width", r.pick(["5000", "100", "1", "99999", "100%", "50"])]);
    if (r.chance(0.4)) a.push(["height", r.pick(["5000", "100", "1", "99999", "3000"])]);
    if (r.chance(0.15)) a.push(["border", r.pick(["500", "0", "9"])]);
    const style = [];
    if (free) {
      a.push(["class", r.chance(0.8) ? "free" : "free " + r.pick(classes.hot)]);
      style.push(`left:${r.pick(["10mm", "-500mm", "-50px", "0", "300mm", length(r)])}`, `top:${r.pick(["5mm", "-300mm", "-40px", "0", "200mm", length(r)])}`);
      style.push(`width:${r.pick(["40mm", "2000mm", "5000px", "100vw", "30mm"])}`, `height:${r.pick(["20mm", "2000mm", "5000px", "100vh", "15mm"])}`);
      if (r.chance(0.6)) style.push(`z-index:${r.pick(["2", "9999", "50", "1"])}`);
    }
    if (r.chance(0.4)) style.push(...styleDecls(r, { inLink: true }));
    let mapEl = null;
    if (map) {
      const name = "m" + ++mapNo;
      a.push(["usemap", "#" + name]);
      mapEl = el("map", [["name", name]], null, [el("area", [["href", r.pick(HREFS)], ["shape", r.pick(["default", "rect", "circle", "poly"])], ["coords", r.pick(["0,0,99999,99999", "0,0,10,10", "50,50,99999", "0,0,99999,0,0,99999"])], ...(r.chance(0.3) ? [["target", "_blank"]] : [])])]);
    }
    const node = el("img", a, style.length ? style : null);
    return mapEl ? [node, mapEl] : [node];
  }
  function svg(r, depth, withLink) {
    const a = [["xmlns", "http://www.w3.org/2000/svg"]];
    if (r.chance(0.7)) a.push(["width", r.pick(["5000", "100", "100%", "99999", "200"])]);
    if (r.chance(0.7)) a.push(["height", r.pick(["5000", "60", "100%", "99999", "3000"])]);
    if (r.chance(0.5)) a.push(["viewBox", r.pick(["0 0 10 10", "0 0 5000 5000", "-5000 -5000 10000 10000", "0 0 100 60"])]);
    if (r.chance(0.2)) a.push(["overflow", "visible"]);
    if (r.chance(0.2)) a.push(["preserveAspectRatio", "none"]);
    const shape = () => {
      const k = r.int(0, 5);
      const common = [["fill", r.pick(["red", "none", "transparent", "#000"])], ...(r.chance(0.4) ? [["fill-opacity", "0"]] : []), ...(r.chance(0.3) ? [["transform", r.pick(["scale(500)", "translate(-5000,-5000)", "matrix(99 0 0 99 0 0)"])]] : [])];
      if (k === 0) return el("rect", [["x", r.pick(["0", "-5000"])], ["y", r.pick(["0", "-5000"])], ["width", r.pick(["10", "99999", "100%"])], ["height", r.pick(["10", "99999", "100%"])], ...common]);
      if (k === 1) return el("circle", [["cx", "5"], ["cy", "5"], ["r", r.pick(["5", "99999"])], ...common]);
      if (k === 2) return el("text", [["x", "0"], ["y", "20"], ["font-size", r.pick(["12", "5000"])], ...common], null, [T(r.pick(WORDS))]);
      if (k === 3) return el("path", [["d", r.pick(["M0 0 L10 10", "M-5000 -5000 H5000 V5000 H-5000 Z"])], ["stroke", "red"], ["stroke-width", r.pick(["1", "99999"])], ...common]);
      if (k === 4) return el("image", [["href", r.pick([PNG1, "/brand/logo.png"])], ["width", r.pick(["10", "99999"])], ["height", r.pick(["10", "99999"])], ...common]);
      return el("foreignObject", [["x", r.pick(["0", "-5000"])], ["y", "0"], ["width", r.pick(["100", "99999"])], ["height", r.pick(["40", "99999"])]], null, [el("div", [["xmlns", "http://www.w3.org/1999/xhtml"]], r.chance(0.5) ? styleDecls(r, { holder: true }) : null, [withLink && r.chance(0.6) ? link(r, depth + 1) : T("fo")])]);
    };
    const kids = [];
    if (withLink) {
      const inner = [];
      const n = r.int(1, 2);
      for (let i = 0; i < n; i++) inner.push(shape());
      const aAttrs = [[r.chance(0.7) ? "href" : "xlink:href", r.pick(HREFS)], ...clsAttrs(r)];
      if (r.chance(0.3)) aAttrs.push(["target", "_blank"]);
      const sa = el("a", aAttrs, r.chance(0.5) ? styleDecls(r, { inLink: true }) : null, inner);
      kids.push(r.chance(0.3) ? el("g", [["transform", r.pick(["scale(99)", "translate(-5000 -5000)", "matrix(99 0 0 99 0 0)"])]], null, [sa]) : sa);
    } else kids.push(shape());
    return el("svg", [...a, ...clsAttrs(r)], r.chance(0.5) ? styleDecls(r, { holder: true }) : null, kids);
  }
  function math(r, depth, withLink) {
    const tok = () => r.pick([el("mi", [], null, [T("x")]), el("mn", [], null, [T("1")]), el("mo", [], null, [T("+")])]);
    const linkIn = withLink ? el("mtext", [], null, [link(r, depth + 1)]) : el("mtext", [], null, [T("t")]);
    const wrap = r.int(0, 4);
    let inner = el("mrow", [], null, [tok(), linkIn]);
    if (wrap === 0) inner = el("mpadded", [["width", r.pick(["5000px", "+99999px", "0"])], ["height", r.pick(["5000px", "+99999px"])], ["depth", r.pick(["5000px", "0"])], ["lspace", r.pick(["-5000px", "0"])], ["voffset", r.pick(["-5000px", "5000px"])]], null, [inner]);
    if (wrap === 1) inner = el("mstyle", [["mathsize", r.pick(["5000%", "99", "big"])], ["displaystyle", "true"]], null, [inner]);
    if (wrap === 2) inner = el("mtable", [], null, [el("mtr", [], null, [el("mtd", [], r.chance(0.5) ? styleDecls(r, { holder: true }) : null, [inner])])]);
    if (wrap === 3) inner = el("mrow", [], null, [inner, el("mspace", [["width", "5000px"], ["height", "5000px"], ["depth", "5000px"]])]);
    return el("math", [["xmlns", "http://www.w3.org/1998/Math/MathML"], ...(r.chance(0.3) ? [["display", "block"]] : []), ...clsAttrs(r)], r.chance(0.5) ? styleDecls(r, { holder: true }) : null, [inner]);
  }
  function inlineContent(r, depth) {
    const k = r.int(0, 12);
    if (k <= 3) return [T(r.pick(WORDS))];
    if (k === 4) return [T("\u00a0")];
    if (k === 5) return [el(r.pick(["span", "b", "i", "u", "sup", "sub", "small", "big", "font", "em", "strong", "mark", "code", "label"]), clsAttrs(r), styleDecls(r, { inLink: true }), [T(r.pick(WORDS))])];
    if (k === 6) return img(r, { free: r.chance(0.4) });
    if (k === 7) return [svg(r, depth, false)];
    if (k === 8) return [el(r.pick(["div", "p", "table", "section", "li", "h2", "blockquote", "pre"]), clsAttrs(r), styleDecls(r, { inLink: true }), r.pick([[T(r.pick(WORDS))], [el("br")], []]))];
    if (k === 9) return [el("table", r.chance(0.5) ? [["width", r.pick(["5000", "100%"])], ["height", r.pick(["5000", "10"])]] : [], styleDecls(r, { inLink: true }), [el("tbody", [], null, [el("tr", [], null, [el("td", r.chance(0.5) ? [["height", "3000"], ["width", "3000"]] : [], null, [T("td")])])])])];
    if (k === 10) return [el(r.pick(["input", "select", "textarea", "button"]), r.pick([[["type", "text"]], [["rows", "200"], ["cols", "500"]], [["size", "99"]], []]), styleDecls(r, { inLink: true }), r.chance(0.5) ? [T("b")] : [])];
    if (k === 11) return [el("span", [], null, [T("")])];
    return [T(r.pick(WORDS)), el("br"), T(r.pick(WORDS))];
  }
  function link(r, depth) {
    const attrs = [["href", r.pick(HREFS)], ...clsAttrs(r)];
    if (r.chance(0.3)) attrs.push(["target", "_blank"]);
    if (r.chance(0.1)) attrs.push(["title", "t"]);
    const kids = [];
    const n = r.int(1, 3);
    for (let i = 0; i < n; i++) kids.push(...inlineContent(r, depth));
    return el("a", attrs, r.chance(0.75) ? styleDecls(r, { inLink: true }) : null, kids);
  }
  // a wrapper around something (positioned, transformed, flex, grid, table, …)
  function wrap(r, depth, inner) {
    const k = r.int(0, 17);
    const st = r.chance(0.8) ? styleDecls(r, { holder: true }) : null;
    const c = clsAttrs(r);
    switch (k) {
      case 0: return el("div", c, st, [inner]);
      case 1: return el("span", c, st, [inner]);
      case 2: return el("p", c, st, [inner]);
      case 3: return el("table", [...(r.chance(0.5) ? [["width", r.pick(["5000", "100%", "99999"])]] : []), ...(r.chance(0.4) ? [["height", r.pick(["5000", "3000"])]] : []), ...(r.chance(0.2) ? [["cellpadding", "1500"]] : []), ...c], st, [el("tbody", [], null, [el("tr", [], null, [el(r.pick(["td", "th"]), r.chance(0.4) ? [["height", "3000"], ["colspan", "9"]] : [], r.chance(0.5) ? styleDecls(r, { holder: true }) : null, [inner])])])]);
      case 4: return el("ul", c, st, [el("li", [], r.chance(0.4) ? styleDecls(r, { holder: true }) : null, [inner])]);
      case 5: return el("div", c, [`display:${r.pick(["flex", "inline-flex"])}`, `height:${r.pick(["3000px", "100vh", "5e3px", "200px"])}`, ...(st ?? [])], [inner]);
      case 6: return el("div", c, [`display:${r.pick(["grid", "inline-grid"])}`, `grid-template-rows:${r.pick(["3000px", "100vh", "1fr", "minmax(5000px, 1fr)"])}`, `grid-template-columns:${r.pick(["5000px", "1fr", "100vw"])}`, ...(st ?? [])], [inner]);
      case 7: return el("details", [["open", null], ...c], st, [el("summary", [], null, [T("s")]), inner]);
      case 8: return el("dialog", [["open", null], ...c], st, [inner]);
      case 9: return el("figure", c, st, [inner, el("figcaption", [], null, [T("c")])]);
      case 10: return el("fieldset", c, st, [el("legend", [], null, [inner])]);
      case 11: return el("center", c, st, [inner]);
      case 12: return el("blockquote", c, st, [inner]);
      case 13: return el("label", c, st, [inner]);
      case 14: return el("div", c, [`float:${r.pick(["left", "right"])}`, ...(st ?? [])], [inner]);
      case 15: return el("section", c, [`transform:${r.pick(["scale(50)", "translate(-40vw,-40vh) scale(9)", "matrix(40,0,0,40,0,0)", "rotate(90deg) scale(9)"])}`, ...(st ?? [])], [inner]);
      case 16: return el("div", c, [`position:${r.pick(["absolute", "relative"])}`, `inset:${r.pick(["0", "-5000px", "-50vh -50vw"])}`, ...(st ?? [])], [inner]);
      default: return el("marquee", c, st, [inner]);
    }
  }
  function linkSite(r, depth) {
    const k = r.int(0, 9);
    if (k <= 4) return link(r, depth);
    if (k === 5) return svg(r, depth, true);
    if (k === 6) return math(r, depth, true);
    if (k === 7) { const [i, m] = img(r, { free: r.chance(0.6), map: true }); return el("div", [], null, [i, m]); }
    if (k === 8) { const a = link(r, depth); a.kids = [el(r.pick(["div", "table", "p", "section"]), clsAttrs(r), styleDecls(r, { inLink: true }), [T(r.pick(WORDS))])]; return a; }
    // a free picture inside a link (a stamp), or a link around a free picture
    const a = link(r, depth); a.kids = img(r, { free: true }); return a;
  }
  function block(r) {
    let node = linkSite(r, 0);
    const depth = r.int(0, 3);
    for (let i = 0; i < depth; i++) node = wrap(r, i, node);
    // text around, so the link sits among words like in a real document
    if (r.chance(0.6)) node = el("p", [], null, [T("Текст преди "), node, T(" текст след.")]);
    return node;
  }
  return function generate(r) {
    const n = r.int(1, 3);
    const kids = [];
    if (r.chance(0.5)) kids.push(el("h2", [["class", "sec"]], null, [el("span", [["class", "n"]], null, [T("1.")]), T(" Раздел")]));
    for (let i = 0; i < n; i++) { kids.push(block(r)); if (r.chance(0.5)) kids.push(el("p", [], null, [T("Обикновен абзац с текст, който е под линка и трябва да остане под него.")])); }
    return kids;
  };
}

// ── minimiser: cut the tree while the violation stays ────────────────────────────────────
// candidates(tree) yields smaller trees: drop a node, unwrap a node (keep its children), drop an
// attribute, drop a style declaration, drop all styles of a node.
export function* shrinks(tree) {
  const nodes = [];
  const walk = (arr, parent) => arr.forEach((n, i) => { nodes.push({ arr, i, n, parent }); if (n.kids) walk(n.kids, n); });
  walk(tree, null);
  const clone = () => structuredClone(tree);
  const locate = (t, idx) => { let k = 0, found = null; const w = (arr) => arr.forEach((n, i) => { if (k++ === idx) found = { arr, i, n }; if (n.kids && !found) w(n.kids); }); w(t); return found; };
  // larger cuts first
  for (let j = 0; j < nodes.length; j++) { const t = clone(); const f = locate(t, j); if (f) { f.arr.splice(f.i, 1); yield t; } }
  for (let j = 0; j < nodes.length; j++) { if (!nodes[j].n.kids || !nodes[j].n.tag) continue; const t = clone(); const f = locate(t, j); if (f) { f.arr.splice(f.i, 1, ...(f.n.kids ?? [])); yield t; } }
  for (let j = 0; j < nodes.length; j++) { if (!nodes[j].n.style?.length) continue; const t = clone(); const f = locate(t, j); if (f) { f.n.style = null; yield t; } }
  for (let j = 0; j < nodes.length; j++) {
    const st = nodes[j].n.style; if (!st) continue;
    for (let d = 0; d < st.length; d++) { const t = clone(); const f = locate(t, j); f.n.style.splice(d, 1); yield t; }
  }
  for (let j = 0; j < nodes.length; j++) {
    const at = nodes[j].n.attrs; if (!at) continue;
    for (let d = 0; d < at.length; d++) { if (["href", "xlink:href", "name", "usemap", "src"].includes(at[d][0])) continue; const t = clone(); const f = locate(t, j); f.n.attrs.splice(d, 1); yield t; }
  }
  for (let j = 0; j < nodes.length; j++) { const n = nodes[j].n; if (n.text && n.text.length > 2) { const t = clone(); const f = locate(t, j); f.n.text = "x"; yield t; } }
}
