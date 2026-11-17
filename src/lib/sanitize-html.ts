// Sanitizer for USER-AUTHORED document HTML (the Word-like editor's body). It runs
// in three places — on save (server), before re-injecting the body into the printed
// shell (server), and before loading saved HTML into the contentEditable (client) —
// so a document can never carry active content that runs in the app origin when
// another staff member opens it, nor script into the PDF render, nor a picture that
// makes its viewer's browser open one of the portal's own pages, nor a box or a link
// that reaches over the page around it.
//
// Defense in depth: only authenticated staff can author documents, and the print
// routes also send a strict no-script CSP. This is the belt to that CSP's braces.
// It is isomorphic (pure string ops, no DOM) so the exact same rules apply on the
// server and in the browser, and dependency-free (no DOMPurify).
//
// How (the security sweep, round 9 — the rebuild). Rounds 6–8 named the bad cases one by one
// (a negative margin over 150px, «!important» in some spelling, a positioned box around a link…)
// and every round found the next one. This version is an ALLOW-LIST from end to end: a tag, an
// attribute, a class, a CSS property and a CSS value survive only when they are on its list and
// inside its bounds — what the app's own documents, its editor and a paste from Word actually use
// (round 9 inventory). Anything else is dropped; nothing is "refused if it looks bad".
//
//  - The body is READ AS A BROWSER READS IT, in one linear pass (tags with their quoted and
//    unquoted attributes, comments, raw-text elements), as before (R3S-1/2/3). A tag that passes
//    unchanged is kept byte for byte, so the built-in documents come out unchanged.
//  - Inline CSS is TOKENIZED (comments, escapes, strings, numbers with exponents, functions) and
//    each declaration's PARSED value is checked against its property's grammar and bounds; a
//    declaration that is not exactly right is dropped, and what stays is written back from the
//    parsed value whenever its spelling was anything but plain. Spelling tricks have nothing to
//    hide behind: «!/**/important», «\69mportant», «calc(-1*5000px)», «-5e3px» are just values
//    the grammar does not take.
//  - The cleaner KNOWS THE LAYOUT it allows: every block it keeps is checked against the column
//    it sits in (608 px, the body's width on screen, in the editor and in the PDF), so no box,
//    margin, padding or indent it lets through can take a link — or anything — out of the body.
//  - A LINK is text: «href» from what was written, «target=_blank rel="noopener noreferrer"» from the
//    cleaner, and inside it only text and inline formatting that cannot change its size or place. A
//    link around anything else (a picture, a block, a table, a drawing) is no link — its content stays.
//
// What it REMOVES, besides everything not on a list: script/style/iframe/textarea-like raw-text
// elements WITH their content (textarea itself is kept, its text as text); any URL but
// http/https/mailto/tel/sms/viber/ftp or a relative one in a link (made «#»); any picture from
// anywhere but the portal's places — «https://» exactly, a relative one only «/brand/<file>»;
// links inside SVG or MathML; image maps; every inline «position», «transform», viewport unit,
// «calc()», «url()», «!important», «mso-*».

import { BRAND_FILE, imageUrlAllowed } from "./image-hosts";

// ── the page these bounds come from ─────────────────────────────────────────────────────
const PX = 25.4 / 96;            // mm in one CSS px
const COLUMN_MM = 608 * PX;      // the body's column: 210 mm − the printed margins − the page padding (160.9 mm)
const PAGE_MM = 297;             // an A4 sheet's height — no box needs to be taller
const PRINTABLE_H_MM = 263;      // one page's printable height — the largest picture
const MIN_BOX_MM = 15;           // an indent never leaves a box narrower than this (words still fit)
const PULL_MM = 1;               // a Word table pulled into the margin («-5.4pt») — clamped to what a hit may stray (4 px)
const MAX_DEPTH = 100;           // blocks nested deeper than this are not kept as blocks (no document needs it)
// A free picture's place (round 9 review 4): never left of the sheet's own edge (the body starts 14 mm + 50 px in) nor
// lower than fifty pages — a value past either is moved to it, never dropped (the picture kept its place). Fifty: a
// signature sits on a plan's last page, page 12 to 20; the cleaner cannot know a body's real height (its fonts, its
// wrapping, its pictures' own sizes decide it), and a bound under it would move a real signature off its page.
const FREE_LEFT_MM = -27;
const FREE_TOP_MM = [-20, 50 * PAGE_MM] as const;
const INDENT_MM = 20;            // a first line's indent, at most (text-indent)
const UNIT_MM: Record<string, number> = { px: PX, pt: 25.4 / 72, pc: 25.4 / 6, mm: 1, cm: 10, in: 25.4, q: 0.25 };

// ── what is dropped with what is in it ──────────────────────────────────────────────────
// Elements whose content the browser reads as raw text (or never shows): dropped with
// everything up to their end tag — the content is never read as markup by us, so the
// «<p title="</xmp><img onerror=…>">» class has nothing to hide behind.
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "title", "xmp", "noembed", "noframes", "noscript", "plaintext", "template",
]);
// …except a form's text field: kept, its text read as the browser reads it (round 5, R5SA-2 — the
// built form's Fill view keeps its multi-line fields)
const RCDATA_KEPT = new Set(["textarea"]);

// ── the tags a document is made of (round 9 inventory) ───────────────────────────────────
// Blocks: what the built-in documents, the editor's toolbar and a Word paste produce.
const TABLE_PARTS_0 = new Set(["thead", "tbody", "tfoot", "tr", "td", "th"]);
const BLOCKS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "pre"]);
// Boxes a pasted page has that no document needs as such — HTML5's sections, <center>, a definition list, a
// LibreOffice <font> — each kept as what it is to a reader: a box (<div>; a list: <ul>), or a <span> of its colour,
// face and size. Never dropped: the words on either side of a dropped box ran together («T-4» + «2. Scope» →
// «T-42. Scope», R7UP-3; round 9 review 4).
const ALIAS: Record<string, string> = Object.fromEntries([
  ...("address article aside center details dialog dl dt dd fieldset figcaption figure footer form header hgroup " +
    "legend listing main nav search section summary").split(" ").map((t) => [t, "div"]),
  ["menu", "ul"], ["dir", "ul"], ["font", "span"],
]);
// …and a rule and preformatted text, as plain as they come (no attribute, no style: DOC_CSS wraps a <pre>'s lines)
const PLAIN = new Set(["hr", "pre"]);
const NONE: Record<string, (d: string) => Verdict> = {};
// a tag the cleaner keeps somewhere (by the name it is written with) — every other one is dropped wherever it stands
const keptTag = (name: string) => name === "a" || BLOCKS.has(name) || PHRASING.has(name) || FIELDS.has(name) || name === "br" || name === "hr" || name === "img" || name === "svg" || name === "math";
const NO_CLASSES: string[] = [];
// What a browser closes an open paragraph for: every box but a table's own parts (the paragraph closed here too, by
// its end tag — a stray «</p>» later made an empty paragraph); and the boxes a list item, a term or a definition
// closes the one before it through (all but these — a <div>, a <p>, an <address> — stop it).
const P_CLOSERS = new Set([...BLOCKS].filter((t) => !TABLE_PARTS_0.has(t)).concat("hr"));
const SIBLING_THROUGH = new Set(["div", "p", "address"]);
// Elements a browser draws as a box of their own among the words (a button, a meter, a video): dropped, they leave a
// space between the words on either side, or «OK» and «Cancel» ran together.
const SEPARATE = new Set(["button", "meter", "progress", "output", "video", "audio", "canvas", "object", "embed"]);
// Inline formatting: the toolbar's bold/italic/underline/strike/sub/sup, Word's and the documents' spans.
const PHRASING = new Set(["span", "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "small"]);
// Inside a link: only what cannot change its size or place (and a line break) — no <small>, <sub>, <sup>: a link's
// box is its own font's, and words smaller or shifted inside it left that box reaching past them.
const IN_LINK = new Set(["span", "b", "strong", "i", "em", "u", "s", "strike", "br"]);
// The formatting a browser carries on past a box that closes over it (its «active formatting elements»): one left open
// at the end of the body came back around the page's footer (round 9 review 4) — so each is closed before the end.
const FMT = new Set(["b", "strong", "i", "em", "u", "s", "strike", "small"]);
// The Fill view's live controls (form-hydrate) and the dropdown form element.
const FIELDS = new Set(["input", "textarea", "select", "option"]);
const VOID = new Set(["br", "img", "input", "hr"]);
// SVG: the title pages' and the forms' little icons. No <a>, <use>, <image>, <foreignObject>, no text.
const SVG_TAGS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
// MathML: what lib/formula.ts writes. No <mtext> (HTML would live inside it), no links.
const MATH_TAGS = new Set(["math", "mrow", "mi", "mn", "mo", "mfrac", "msqrt", "msub", "msup", "msubsup"]);
// …and its letters, numbers and operators hold text only: what a browser finds inside one of them it reads as HTML,
// and an element there broke out of the formula and took the page after it (round 9 review 4)
const MATH_TOKENS = new Set(["mi", "mn", "mo"]);

// ── classes: the documents' own (round 9 inventory), each only on the tags the app puts it on ──────────
// (a class is how a document gets its layout from DOC_CSS and the skins — an unknown one could only borrow the
// shell's or the editor's: «page», «doc-side», «we-stickyhead» in a body; a known one on another tag — a 14-px
// tick box made a <div> — boxes content the app never puts in it)
const CLASS_TAGS: Record<string, string> = {
  "a": "div", "assigned": "span", "bar": "span", "blank": "span", "blue": "div", "body": "div", "bottom": "img",
  "c": "div td th", "cal": "div", "cals": "div", "cap": "span", "certcontent": "div", "certfrom": "div p",
  "certno": "div", "certpreview": "div", "ch": "td th", "charmeta": "p", "chars": "div", "charsec": "div",
  "cline": "div", "code": "td", "col": "div", "compiledby": "div", "confnote": "p", "contact": "div",
  "contacts": "div", "cover": "div", "coverimg": "img", "coverimg-empty": "img", "crit": "div", "crule": "div",
  "csub": "div", "ctext": "span", "ctitle": "div", "d": "div", "dec-declare": "div", "dec-field": "div",
  "dec-hint": "div", "dec-intro": "div", "dec-list": "ol", "dec-sign": "div", "dochead": "div",
  "dochead-wrap": "div", "docttl": "div", "docttl2": "div", "em": "span", "emb": "img", "empty": "div span p",
  "example": "div", "fbintro": "div", "fbq": "div", "ff-area": "textarea", "ff-box": "span", "ff-cb": "input",
  "ff-end": "span", "ff-line": "input span", "ff-lines": "div", "ff-lrow": "div", "ff-opt": "span", "ff-pn": "span",
  "ff-pt": "span", "ff-rate": "span", "ff-rate-in": "input", "ff-rb": "span", "ff-rb-in": "input",
  "ff-scale": "span", "ff-selbox": "span", "ff-select": "select", "fl": "span", "fld": "div", "formula": "div",
  "frame": "div", "free": "img", "hband": "span", "head": "div", "help": "div p", "ico": "span", "ilac": "img",
  "imp": "div p", "inacc": "div", "internal": "div", "iso": "div", "issued": "div", "kv": "div", "labcode": "div",
  "labname": "div", "lbl": "div span", "lead": "div", "ln": "div span", "logo": "img", "macc": "div", "marks": "div",
  "masked": "span", "mband": "div", "mcover": "div", "minacc": "div", "mincover": "div", "minfo": "div",
  "minlogo": "img", "minno": "div", "minrule": "div", "mintitle": "div", "mlogo": "img", "mname": "div",
  "mno": "div", "mttl": "div", "muted": "div p span", "n": "div span td th", "nabox": "div", "nm": "div span",
  "note": "div", "odate": "div", "odecl": "div", "ohead": "div", "oitem": "div", "on": "span", "opt": "p",
  "opt-row": "div", "orel": "div", "osign": "div", "oteam": "ul", "otitle": "div", "partner": "div",
  "pending": "div", "person": "div", "pricebox": "div", "provider": "div", "pt": "td", "ptable": "table",
  "qn": "div", "reg": "div", "regno": "div", "rl": "div span", "ro": "div", "role": "div span", "rs-field": "div",
  "rs-headlab": "div", "rs-notes": "div", "rs-remarks-l": "div", "rs-scheme": "div", "rs-sign": "div",
  "rs-tcap": "div", "rs-warn": "div", "rs-warns": "div", "rtable": "table", "scalewrap": "div", "schemename": "div",
  "schemeno": "div", "schemettl": "div", "sec": "h2", "selbox": "div", "sig": "div", "signs": "div", "sigrow": "div",
  "snasbox": "div", "spacer": "div", "std": "span", "stdnote": "p", "sub": "h3", "subj": "div", "tag": "img",
  "tagline-img": "img", "team": "div", "tight": "ul", "we-f": "span", "we-tab": "span", "who": "div",
};
const CLASSES = new Map(Object.entries(CLASS_TAGS).map(([c, t]) => [c, new Set(t.split(" "))]));
// Classes that give a box a FIXED height in the stylesheets (a header band, a calendar bar, a rule, a tick box): they
// hold nothing or a mark — one that turns out to hold more loses the class, or what it held ran out of the box.
const FIXED_H = new Set(["hband", "bar", "blank", "ff-box", "ff-rb", "ff-rate", "minrule", "crule"]);
// Classes that give a box a FIXED width in the stylesheets (mm): what is inside one is checked against it.
const FIXED_W: Record<string, number> = { "ff-box": 14 * PX, "ff-rb": 14 * PX, "ff-rate": 15 * PX, cal: 96 * PX, "we-tab": 12.5, minrule: 60 * PX, osign: 300 * PX, crule: 120 * PX };
// Boxes that bleed out of the body by design (the title page's header band): a link inside one is unlinked.
const SHELL = new Set(["dochead-wrap"]);
// Classes that make a flex or grid container (DOC_CSS, the skins, the editor's mirror of them): a link
// that is a direct child of one would be a flex/grid item, stretched to the row — it is unlinked.
const FLEX = new Set(("cals certcontent contact contacts crit dec-field dec-sign dochead ff-box ff-opt ff-pt ff-rb ff-scale " +
  "frame head ico marks mband ohead partner rs-sign rs-warn scalewrap sig signs sigrow team").split(" "));

const SAFE_LINK_SCHEME = new Set(["http", "https", "mailto", "tel", "sms", "viber", "ftp"]);
// Every link the cleaner keeps opens in a new tab, never with a hold on the page it came from — written by the
// cleaner itself, the same on every link (PTS, round 9): nothing of a target or a rel in what was pasted is kept
// (a named window kept the opener, R5SA-3; «opener», R4S-8; « _blank», R6S-8).
const LINK_TARGET = ` target="_blank" rel="noopener noreferrer"`;

// ── character references, as the browser reads them inside an attribute ───────────────
// Every named reference that yields an ASCII character (the rest yield none — they cannot
// make a scheme, a path or CSS syntax). One this check does not know refuses the value.
const NAMED: Record<string, string> = {
  Tab: "\t", NewLine: "\n", excl: "!", quot: '"', QUOT: '"', num: "#", dollar: "$", percnt: "%", amp: "&", AMP: "&",
  apos: "'", lpar: "(", rpar: ")", ast: "*", midast: "*", plus: "+", comma: ",", period: ".", sol: "/", colon: ":",
  semi: ";", lt: "<", LT: "<", equals: "=", gt: ">", GT: ">", quest: "?", commat: "@", lsqb: "[", lbrack: "[",
  bsol: "\\", rsqb: "]", rbrack: "]", Hat: "^", lowbar: "_", UnderBar: "_", grave: "`", DiacriticalGrave: "`",
  lcub: "{", lbrace: "{", verbar: "|", vert: "|", VerticalLine: "|", rcub: "}", rbrace: "}", fjlig: "fj",
  nvlt: "<\u20d2", nvgt: ">\u20d2", bne: "=\u20e5", nbsp: "\u00a0", NonBreakingSpace: "\u00a0", shy: "\u00ad",
};
// The references a browser also reads WITHOUT a «;» (the legacy ones): those yielding ASCII, and the
// Latin-1 ones — each to its own character (round 5: a placeholder lost «é» from a rebuilt style).
const LEGACY_ASCII: Record<string, string> = { amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">", quot: '"', QUOT: '"' };
const LATIN1_NAMES = ("nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml" +
  " ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml").split(" ");
const LEGACY_OTHER: Record<string, string> = Object.fromEntries([
  ...LATIN1_NAMES.map((n, i) => [n, String.fromCharCode(0xa0 + i)]),
  ["COPY", "\u00a9"], ["REG", "\u00ae"],
]);
// the C1 range of a numeric reference, read as Windows-1252 (as the browser does)
const C1 = "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f" +
  "\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";

const isAlpha = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isDigit = (c: number) => c >= 48 && c <= 57;
const isAlnum = (c: number) => isAlpha(c) || isDigit(c);
const isHex = (c: number) => isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
// the tokenizer's whitespace (a CR is a LF once the browser has normalised the input)
const isWs = (c: number) => c === 32 || c === 9 || c === 10 || c === 12 || c === 13;

function numericRef(cp: number): string {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "\ufffd";
  if (cp >= 0x80 && cp <= 0x9f) return C1[cp - 0x80];
  return String.fromCodePoint(cp);
}

/** An attribute's value as the browser decodes it, or null when it holds a reference this cannot read. */
function decodeAttr(raw: string): string | null {
  if (raw.indexOf("&") < 0) return raw;
  let out = "", i = 0;
  const n = raw.length;
  for (;;) {
    const amp = raw.indexOf("&", i);
    if (amp < 0) return out + raw.slice(i);
    out += raw.slice(i, amp);
    let k = amp + 1;
    if (raw.charCodeAt(k) === 35 /* # */) {
      k++;
      const hex = raw.charCodeAt(k) === 120 || raw.charCodeAt(k) === 88;
      if (hex) k++;
      const start = k;
      while (k < n && (hex ? isHex(raw.charCodeAt(k)) : isDigit(raw.charCodeAt(k)))) k++;
      if (k === start) { out += raw.slice(amp, k); i = k; continue; } // «&#» with no digits: as written
      const digits = raw.slice(start, k).replace(/^0+/, "");
      const cp = digits.length > 8 ? 0x110000 : parseInt(digits || "0", hex ? 16 : 10);
      if (raw.charCodeAt(k) === 59) k++;
      out += numericRef(cp);
      i = k;
      continue;
    }
    while (k < n && isAlnum(raw.charCodeAt(k))) k++;
    const name = raw.slice(amp + 1, k);
    if (!name) { out += "&"; i = amp + 1; continue; }
    if (raw.charCodeAt(k) === 59 /* ; */) {
      const ch = NAMED[name] ?? LEGACY_ASCII[name] ?? LEGACY_OTHER[name];
      if (ch === undefined) return null;
      out += ch;
      i = k + 1;
      continue;
    }
    // no «;»: only a legacy name, and in an attribute not when «=» follows
    if (raw.charCodeAt(k) !== 61 /* = */ && (name in LEGACY_ASCII || name in LEGACY_OTHER)) {
      out += LEGACY_ASCII[name] ?? LEGACY_OTHER[name];
    } else out += raw.slice(amp, k);
    i = k;
  }
}

// a URL as the URL parser reads it: no leading/trailing controls or spaces, no tab or newline anywhere
function urlFlat(v: string): string {
  let a = 0, b = v.length;
  while (a < b && v.charCodeAt(a) <= 32) a++;
  while (b > a && v.charCodeAt(b - 1) <= 32) b--;
  return v.slice(a, b).replace(/[\t\n\r]/g, "");
}

/** May a link go here? Only http/https/mailto/tel/… and addresses on the portal itself. */
function linkSafe(raw: string): boolean {
  const v = decodeAttr(raw);
  if (v === null) return false;
  const flat = urlFlat(v).replace(/\\/g, "/").toLowerCase();
  if (flat === "") return true;
  const m = /^([a-z][a-z0-9+.-]*):/.exec(flat);
  if (m) return SAFE_LINK_SCHEME.has(m[1]);
  return !flat.startsWith("//"); // never protocol-relative («\\host» too, read as «//host»)
}
/** A link's address, or null — no link: one that may not go here, and one to this very page (empty, «#…», «?…»): it
 *  opened a copy of the page in a new tab, and the ids it pointed to are not kept (round 9 review 4). */
function linkHref(raw: string): string | null {
  const v = decodeAttr(raw);
  if (v === null || !linkSafe(raw)) return null;
  const flat = urlFlat(v);
  return flat === "" || flat[0] === "#" || flat[0] === "?" ? null : raw;
}

// ── a link's words: the letters of it a reader sees ─────────────────────────────────────
// Blanks: what takes room on a line and shows nothing (any space, a Braille blank, a Hangul filler); and what
// shows nothing and takes no room (joiners, marks of direction, variation selectors…).
const BLANK = "\\s\\u200b\\u2800\\u3164\\u115f\\u1160\\uffa0";
const ZERO = "\\u00ad\\u034f\\u061c\\u180e\\u200c-\\u200f\\u202a-\\u202e\\u2060-\\u2064\\u2066-\\u206f\\ufe00-\\ufe0f\\u{e0000}-\\u{e007f}\\u{e0100}-\\u{e01ef}";
const BLANK_RUN = new RegExp(`[${BLANK}${ZERO}]+`, "gu");
const HAS_BLANK = new RegExp(`[${BLANK}]`, "u");
const ONLY_BLANK = new RegExp(`^[${BLANK}${ZERO}]+$`, "u");
// a letter a reader sees: anything but a blank, a control, a mark alone or a character the font draws as nothing
const VISIBLE = new RegExp(`[^${BLANK}${ZERO}\\p{White_Space}\\p{Cc}\\p{Cf}\\p{M}\\p{Default_Ignorable_Code_Point}]`, "u");
const TEXT_REF = /&(?:#[xX][0-9a-fA-F]+;?|#\d+;?|[A-Za-z][A-Za-z0-9]*;?)/g;
// the named references that are blanks (the rest of the named ones this does not read are no visible letter either)
const BLANK_NAMED: Record<string, string> = {
  ensp: "\u2002", emsp: "\u2003", emsp13: "\u2004", emsp14: "\u2005", numsp: "\u2007", puncsp: "\u2008", thinsp: "\u2009",
  ThinSpace: "\u2009", hairsp: "\u200a", VeryThinSpace: "\u200a", MediumSpace: "\u205f", ThickSpace: "\u205f\u200a",
  ZeroWidthSpace: "\u200b", NegativeVeryThinSpace: "\u200b", NegativeThinSpace: "\u200b", NegativeMediumSpace: "\u200b",
  NegativeThickSpace: "\u200b", zwnj: "\u200c", zwj: "\u200d", lrm: "\u200e", rlm: "\u200f", NoBreak: "\u2060",
  ApplyFunction: "\u2061", af: "\u2061", InvisibleTimes: "\u2062", it: "\u2062", InvisibleComma: "\u2063", ic: "\u2063",
};
const refChars = (m: string): string | null => decodeAttr(m) ?? (m.endsWith(";") ? BLANK_NAMED[m.slice(1, -1)] ?? null : null);
/** A link's text as written: every run of blanks — however spelled — one space (a link's area is its words, never a
 *  field of blanks: 3000 «&emsp;» or Braille blanks made one, round 9 review 4); and whether a letter is left. */
function linkWords(t: string): { text: string; seen: boolean } {
  const text = t.replace(TEXT_REF, (m) => { const d = refChars(m); return d !== null && ONLY_BLANK.test(d) ? d : m; })
    .replace(BLANK_RUN, (r) => (HAS_BLANK.test(r) ? " " : r));
  return { text, seen: VISIBLE.test(text.replace(TEXT_REF, (m) => refChars(m) ?? "")) };
}

const RASTER = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,]/;

/** May this be fetched as a picture? Only inline pictures, the portal's own /brand/ (as the browser
 *  resolves it), its storage and ptsbg.eu (R2S-10, R3S-2, R4S-1). */
function pictureUrlSafe(decoded: string, svgData: boolean): boolean {
  const flat = urlFlat(decoded);
  if (flat === "") return true;
  const lower = flat.toLowerCase();
  if (lower.startsWith("data:")) return RASTER.test(lower) || (svgData && lower.startsWith("data:image/svg+xml"));
  // an absolute address is «https://host/…» exactly: «https:/ptsbg.eu/../x», «https:ptsbg.eu/x» are RELATIVE
  if (/^https?:[\\/]{2}/i.test(flat)) {
    let u: URL;
    try { u = new URL(flat); } catch { return false; }
    if (portalOrigins().includes(u.origin)) return BRAND_FILE.test(u.pathname);
    return imageUrlAllowed(u.href);
  }
  if (/^[a-z][a-z0-9+.-]*:/.test(lower)) return false;
  return BRAND_FILE.test(flat);
}
/** The portal's own origin(s): its fixed address, and in a browser the page's own. */
function portalOrigins(): string[] {
  const origins: string[] = [];
  try { const site = process.env.NEXT_PUBLIC_SITE_URL; if (site) origins.push(new URL(site).origin); } catch { /* none set */ }
  try { const here = (globalThis as { location?: { origin?: string } }).location?.origin; if (here && here !== "null") origins.push(here); } catch { /* not a browser */ }
  return origins;
}
/** A picture on the portal's own address under /brand/, written whole — its path (R4U-3). */
function ownBrandPath(decoded: string): string | null {
  const flat = urlFlat(decoded);
  if (!/^https?:[\\/]{2}/i.test(flat)) return null;
  try {
    const u = new URL(flat);
    return portalOrigins().includes(u.origin) && BRAND_FILE.test(u.pathname) && !u.search && !u.hash ? u.pathname : null;
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════════════════════════
// CSS — tokenized as CSS Syntax reads it; each declaration's PARSED value checked against its grammar
// ════════════════════════════════════════════════════════════════════════════════════════
// (a style attribute's tokens; `a`/`b` are where each starts and ends in the decoded value)
type Tok = { k: "ident" | "fn" | "hash" | "str" | "num" | "pct" | "dim" | "ws" | "colon" | "semi" | "comma" | "open" | "close" | "bad" | "delim"; v: string; n: number; s: string; u: string; a: number; b: number };

const cssNameChar = (c: number) => isAlnum(c) || c === 45 || c === 95 || c >= 0x80;
const cssNameStart = (c: number) => isAlpha(c) || c === 95 || c >= 0x80;

/** The tokens of a style attribute. A comment is whitespace (it separates tokens, as in CSS). Linear:
 *  every branch moves forward. What none of our grammars is made of («@», «[», «{», «\» alone, a
 *  string cut by a newline, «url(…)» as a whole) is a «bad» token — the declaration holding it is dropped. */
function cssTokens(css: string): Tok[] {
  const n = css.length, out: Tok[] = [];
  let i = 0;
  const tok = (k: Tok["k"], a: number, b: number, x: Partial<Tok> = {}) => { out.push({ k, v: "", n: 0, s: "", u: "", a, b, ...x }); };
  const validEsc = (p: number) => css.charCodeAt(p) === 92 && p + 1 < n && css.charCodeAt(p + 1) !== 10 && css.charCodeAt(p + 1) !== 12 && css.charCodeAt(p + 1) !== 13;
  const escape = (p: number): [string, number] => { // p at «\»
    let q = p + 1;
    if (isHex(css.charCodeAt(q))) {
      const s = q;
      while (q < n && q - s < 6 && isHex(css.charCodeAt(q))) q++;
      const cp = parseInt(css.slice(s, q), 16);
      if (q < n && isWs(css.charCodeAt(q))) q++;
      return [cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? "\ufffd" : String.fromCodePoint(cp), q];
    }
    const cp = css.codePointAt(q)!;
    return [String.fromCodePoint(cp), q + (cp > 0xffff ? 2 : 1)];
  };
  const name = (p: number): [string, number] => {
    let v = "";
    while (p < n) {
      const c = css.charCodeAt(p);
      if (cssNameChar(c)) { v += css[p]; p++; }
      else if (validEsc(p)) { const [ch, q] = escape(p); v += ch; p = q; }
      else break;
    }
    return [v, p];
  };
  const identStart = (p: number) => {
    const c = css.charCodeAt(p);
    if (cssNameStart(c) || validEsc(p)) return true;
    if (c === 45) { const d = css.charCodeAt(p + 1); return cssNameStart(d) || d === 45 || validEsc(p + 1); }
    return false;
  };
  const numberEnd = (p: number): number => { // where a number starting at p ends, or -1
    let q = p;
    if (css[q] === "+" || css[q] === "-") q++;
    const d0 = q;
    while (q < n && isDigit(css.charCodeAt(q))) q++;
    let digits = q > d0;
    if (css[q] === "." && isDigit(css.charCodeAt(q + 1))) { q++; while (q < n && isDigit(css.charCodeAt(q))) q++; digits = true; }
    if (!digits) return -1;
    if (css[q] === "e" || css[q] === "E") {
      let r = q + 1;
      if (css[r] === "+" || css[r] === "-") r++;
      if (isDigit(css.charCodeAt(r))) { while (r < n && isDigit(css.charCodeAt(r))) r++; q = r; }
    }
    return q;
  };
  const ws = (a: number, b: number) => { const last = out[out.length - 1]; if (last?.k === "ws") last.b = b; else tok("ws", a, b); };
  while (i < n) {
    const c = css.charCodeAt(i);
    if (c === 47 && css.charCodeAt(i + 1) === 42) { const e = css.indexOf("*/", i + 2); const end = e < 0 ? n : e + 2; ws(i, end); out[out.length - 1].v = "/*"; i = end; continue; }
    if (isWs(c)) { const a = i; while (i < n && isWs(css.charCodeAt(i))) i++; ws(a, i); continue; }
    if (c === 34 || c === 39) { // a string — one not closed before the end is «bad»: what the cleaner adds after it
      let v = "", p = i + 1, bad = false;  // would be read as inside it (no fixed point; round 9 review 4)
      for (;;) {
        if (p >= n) { bad = true; break; }
        const d = css.charCodeAt(p);
        if (d === c) { p++; break; }
        if (d === 10 || d === 12 || d === 13) { bad = true; break; }
        if (d === 92) {
          if (p + 1 >= n) { p++; continue; }
          const e = css.charCodeAt(p + 1);
          if (e === 10 || e === 12 || e === 13) { p += 2; continue; }
          const [ch, q] = escape(p); v += ch; p = q; continue;
        }
        v += css[p]; p++;
      }
      tok(bad ? "bad" : "str", i, p, { v });
      i = p;
      continue;
    }
    const ne = c === 43 || c === 45 || c === 46 || isDigit(c) ? numberEnd(i) : -1;
    if (ne > 0) {
      const s = css.slice(i, ne), num = Number(s);
      if (identStart(ne)) { const [u, q] = name(ne); tok("dim", i, q, { n: num, s, u: u.toLowerCase() }); i = q; }
      else if (css.charCodeAt(ne) === 37) { tok("pct", i, ne + 1, { n: num, s }); i = ne + 1; }
      else { tok("num", i, ne, { n: num, s }); i = ne; }
      continue;
    }
    if (identStart(i)) {
      const [v, q] = name(i);
      if (css.charCodeAt(q) === 40) { tok(v.toLowerCase() === "url" ? "bad" : "fn", i, q + 1, { v: v.toLowerCase() }); i = q + 1; }
      else { tok("ident", i, q, { v }); i = q; }
      continue;
    }
    if (c === 35 && (cssNameChar(css.charCodeAt(i + 1)) || validEsc(i + 1))) { const [v, q] = name(i + 1); tok("hash", i, q, { v }); i = q; continue; }
    if (c === 58) { tok("colon", i, i + 1); i++; continue; }
    if (c === 59) { tok("semi", i, i + 1); i++; continue; }
    if (c === 44) { tok("comma", i, i + 1); i++; continue; }
    if (c === 40) { tok("open", i, i + 1); i++; continue; }
    if (c === 41) { tok("close", i, i + 1); i++; continue; }
    if (c === 64 || c === 91 || c === 93 || c === 123 || c === 125 || c === 92 || c === 60) { tok("bad", i, i + 1); i++; continue; }
    tok("delim", i, i + 1, { v: css[i] });
    i++;
  }
  return out;
}

/** A declaration: its property, its value's tokens, the text it was written as, and whether that text is plain
 *  (no comment, no escape, no «!») — a plain declaration that passes is kept exactly as written. */
type Decl = { prop: string; val: Tok[]; src: string; plain: boolean };
function cssDecls(css: string): { decls: Decl[]; dropped: boolean } {
  const toks = cssTokens(css);
  const decls: Decl[] = [];
  let dropped = false, from = 0, depth = 0;
  const parts: Tok[][] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === "open" || t.k === "fn") depth++;
    else if (t.k === "close") depth = Math.max(0, depth - 1);
    else if (t.k === "semi" && depth === 0) { parts.push(toks.slice(from, i)); from = i + 1; }
  }
  parts.push(toks.slice(from));
  for (const p of parts) {
    let a = 0, b = p.length;
    while (a < b && p[a].k === "ws") a++;
    while (b > a && p[b - 1].k === "ws") b--;
    if (a === b) continue; // an empty declaration («;;», a closing «;») — nothing lost
    let k = a + 1;
    while (k < b && p[k].k === "ws") k++;
    if (p[a].k !== "ident" || p[k]?.k !== "colon") { dropped = true; continue; }
    let val = p.slice(k + 1, b);
    while (val.length && val[0].k === "ws") val = val.slice(1);
    let plain = true;
    // «!important» — however spelled, it is a «!» and then the word — taken off: an inline !important beat the
    // page's own rules (round 8 review, RV8-2). Any other «!» leaves no declaration.
    const bang = val.findIndex((x) => x.k === "delim" && x.v === "!");
    if (bang >= 0) {
      const rest = val.slice(bang + 1).filter((x) => x.k !== "ws");
      if (rest.length !== 1 || rest[0].k !== "ident" || rest[0].v.toLowerCase() !== "important") { dropped = true; continue; }
      val = val.slice(0, bang);
      while (val.length && val[val.length - 1].k === "ws") val = val.slice(0, -1);
      plain = false;
    }
    if (val.some((x) => x.k === "bad")) { dropped = true; continue; }
    if (!val.length) { dropped = true; continue; }
    const src = css.slice(p[a].a, val[val.length - 1].b);
    if (src.includes("/*") || src.includes("\\") || p.slice(a, b).some((x) => x.v === "/*")) plain = false;
    decls.push({ prop: p[a].v.toLowerCase(), val, src, plain });
  }
  return { decls, dropped };
}

// ── values ──────────────────────────────────────────────────────────────────────────────
type Len = { mm: number } | { pct: number } | { auto: true };
/** A token written back (the parsed value, never its spelling). */
const tokOut = (t: Tok): string => {
  switch (t.k) {
    case "ident": return t.v;
    case "num": return t.s;
    case "pct": return t.s + "%";
    case "dim": return t.s + t.u;
    case "hash": return "#" + t.v;
    case "str": return t.v.includes("'") ? `"${t.v}"` : `'${t.v}'`;
    default: return "";
  }
};
/** The words of a value, split at its whitespace (a function and its arguments stay one word). */
function words(val: Tok[]): Tok[][] {
  const out: Tok[][] = [[]];
  let depth = 0;
  for (const t of val) {
    if (t.k === "fn" || t.k === "open") depth++;
    if (t.k === "close") depth = Math.max(0, depth - 1);
    if (t.k === "ws" && depth === 0) { if (out[out.length - 1].length) out.push([]); continue; }
    if (t.k !== "ws") out[out.length - 1].push(t);
  }
  return out.filter((w) => w.length);
}
const ident = (w: Tok[] | undefined): string | null => (w && w.length === 1 && w[0].k === "ident" ? w[0].v.toLowerCase() : null);
/** A length: an absolute unit or 0; a percentage and «auto» only where the property takes them. Never em,
 *  rem, vw/vh, calc() or var(): the cleaner must know what the value IS to keep it in its bounds. */
function length(w: Tok[] | undefined, o: { pct?: boolean; auto?: boolean } = {}): Len | null {
  if (!w || w.length !== 1) return null;
  const t = w[0];
  if (!Number.isFinite(t.n)) return null;
  if (t.k === "num") return t.n === 0 ? { mm: 0 } : null;
  if (t.k === "dim") { const f = UNIT_MM[t.u]; return f === undefined ? null : { mm: t.n * f }; }
  if (t.k === "pct" && o.pct) return { pct: t.n };
  if (t.k === "ident" && o.auto && t.v.toLowerCase() === "auto") return { auto: true };
  return null;
}
const within = (l: Len | null, lo: number, hi: number, pctHi = 100): boolean =>
  !!l && ("auto" in l || ("mm" in l ? l.mm >= lo - 1e-9 && l.mm <= hi + 1e-9 : l.pct >= 0 && l.pct <= pctHi));
// (rounded down: a value the cleaner writes must pass the cleaner again unchanged — its output is its own fixed point)
const mmOut = (mm: number) => `${Math.floor(mm * 100 + 1e-6) / 100}mm`;

// colours: #hex, rgb()/rgba(), a named colour, the document's own palette — never an invisible colour for letters
const NAMED_COLORS = new Set(("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue " +
  "chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta " +
  "darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink " +
  "deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey " +
  "honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow " +
  "lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime " +
  "limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen " +
  "mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
  "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue " +
  "saddlebrown salmon seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato " +
  "turquoise violet wheat white whitesmoke yellow yellowgreen currentcolor windowtext canvastext").split(" "));
// the document's own palette (DOC_CSS :root) — the built-in bodies write «var(--green-dark)», «var(--ink)»
const COLOR_TOKENS = new Set(["--green", "--green-dark", "--green-soft", "--red", "--ink", "--muted", "--line"]);
const FONT_TOKENS = new Set(["--sans", "--serif"]);
/** A colour (one word), or null. `letters`: the colour of text — never transparent nor faded below 0.3. */
function color(w: Tok[] | undefined, letters: boolean): string | null {
  if (!w || !w.length) return null;
  const t = w[0];
  if (w.length === 1 && t.k === "hash") {
    if (!/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t.v)) return null;
    if (letters && (t.v.length === 4 || t.v.length === 8)) { const al = t.v.length === 4 ? parseInt(t.v[3] + t.v[3], 16) : parseInt(t.v.slice(6), 16); if (al < 77) return null; }
    return "#" + t.v;
  }
  if (w.length === 1 && t.k === "ident") {
    const v = t.v.toLowerCase();
    if (NAMED_COLORS.has(v) || (v === "transparent" && !letters)) return t.v;
    return null;
  }
  if (t.k === "fn" && (t.v === "rgb" || t.v === "rgba") && w[w.length - 1].k === "close") {
    const args = w.slice(1, -1).filter((x) => x.k !== "comma" && x.k !== "ws" && !(x.k === "delim" && x.v === "/"));
    if (args.length < 3 || args.length > 4) return null;
    const ch = args.slice(0, 3);
    if (!ch.every((x) => (x.k === "num" && x.n >= 0 && x.n <= 255) || (x.k === "pct" && x.n >= 0 && x.n <= 100))) return null;
    let alpha = 1;
    if (args[3]) { const al = args[3]; if (al.k === "num" && al.n >= 0 && al.n <= 1) alpha = al.n; else if (al.k === "pct" && al.n >= 0 && al.n <= 100) alpha = al.n / 100; else return null; }
    if (letters && alpha < 0.3) return null;
    const s = ch.map(tokOut).join(", ");
    return args[3] ? `rgba(${s}, ${tokOut(args[3])})` : `rgb(${s})`;
  }
  if (t.k === "fn" && t.v === "var" && w.length === 3 && w[1].k === "ident" && COLOR_TOKENS.has(w[1].v) && w[2].k === "close") return `var(${w[1].v})`;
  return null;
}
/** font-family: quoted names or names of letters, or the document's own token — no function, no escape trick. */
function fontFamily(val: Tok[]): string | null {
  if (val.length === 3 && val[0].k === "fn" && val[0].v === "var" && val[1].k === "ident" && FONT_TOKENS.has(val[1].v) && val[2].k === "close") return `var(${val[1].v})`;
  const fams: string[] = [];
  let cur: string[] = [], quoted: string | null = null;
  const end = (): boolean => {
    if (quoted !== null) { if (cur.length) return false; fams.push(quoted.includes("'") ? `"${quoted}"` : `'${quoted}'`); }
    else { if (!cur.length) return false; fams.push(cur.join(" ")); }
    cur = []; quoted = null;
    return true;
  };
  for (const t of val) {
    if (t.k === "ws") continue;
    if (t.k === "comma") { if (!end()) return null; continue; }
    if (t.k === "str" && !cur.length && quoted === null && /^[\p{L}\p{N} ._-]{1,64}$/u.test(t.v)) { quoted = t.v; continue; }
    if (t.k === "ident" && quoted === null && /^[\p{L}\p{N}_-]{1,64}$/u.test(t.v)) { cur.push(t.v); continue; }
    return null;
  }
  if (!end() || fams.length > 10) return null;
  return fams.join(", ");
}

// ── the grammar of each property ────────────────────────────────────────────────────────
// A check returns the value written back (null: dropped); `c.rewrote` when it had to clamp it. It also notes
// in `c.box` what the layout check needs — the sides and the width of the box, read from the PARSED value.
type Box = { mL?: Len; mR?: Len; pL?: Len; pR?: Len; bL?: number; bR?: number; W?: Len; minW?: Len; ti?: number; left?: number };
type Ctx = { tag: string; inLink: boolean; free: boolean; box: Box; rewrote: boolean };
type Check = (val: Tok[], c: Ctx) => string | null;

const kw = (...ok: string[]): Check => (val) => { const w = words(val); const v = ident(w[0]); return w.length === 1 && v !== null && ok.includes(v) ? v : null; };
const one = (f: (w: Tok[]) => string | null): Check => (val) => { const w = words(val); return w.length === 1 ? f(w[0]) : null; };
// the boxes a layout property may sit on: blocks, tables and their cells, pictures
const BOXES = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "table", "td", "th", "tr", "img"]);
const BREAKS = new Set([...BOXES, "br"]);

/** font-size: an absolute size, 4–96 pt (the editor's own size box takes 4–96); inside a link at most 24 pt. */
function fontSize(w: Tok[], inLink: boolean): string | null {
  const l = length(w);
  if (!l || !("mm" in l)) return null;
  const pt = l.mm / UNIT_MM.pt;
  return pt >= 4 - 1e-9 && pt <= (inLink ? 24 : 96) + 1e-9 ? tokOut(w[0]) : null;
}
/** line-height: a number or a percentage from 1 to 4, or «normal» — never a fixed length (the lines of a big
 *  font would overlap, and its letters would hang out of their box). */
function lineHeight(w: Tok[]): string | null {
  if (w.length !== 1) return null;
  const t = w[0];
  if (t.k === "ident" && t.v.toLowerCase() === "normal") return t.v;
  if (t.k === "num" && t.n >= 1 && t.n <= 4) return t.s;
  if (t.k === "pct" && t.n >= 100 && t.n <= 400) return t.s + "%";
  return null;
}
/** border (all sides or one): a width of at most 3 mm, a style, a colour — in any order, each once at most. */
function border(val: Tok[], c: Ctx, sides: string): string | null {
  const ws = words(val);
  if (!ws.length || ws.length > 3) return null;
  const out: string[] = [];
  let width: number | null = null;
  for (const w of ws) {
    const v = ident(w);
    if (v && ["none", "hidden", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"].includes(v)) { out.push(v); if (v === "none" || v === "hidden") width = 0; continue; }
    if (v && ["thin", "medium", "thick"].includes(v)) { out.push(v); width = (v === "thin" ? 1 : v === "medium" ? 3 : 5) * PX; continue; }
    const l = length(w);
    if (l && "mm" in l) { if (l.mm < 0 || l.mm > 3) return null; out.push(tokOut(w[0])); width = l.mm; continue; }
    const col = color(w, false);
    if (col) { out.push(col); continue; }
    return null;
  }
  const bw = width ?? 3 * PX;
  if (sides.includes("L")) c.box.bL = bw;
  if (sides.includes("R")) c.box.bR = bw;
  return out.join(" ");
}
/** margin/padding: 1–4 words → [top, right, bottom, left]. */
function sides4(val: Tok[]): Tok[][] | null {
  const ws = words(val);
  if (ws.length < 1 || ws.length > 4) return null;
  const [t, r = t, b = t, l = r] = ws;
  return [t, r, b, l];
}
// margins: above and below 0–50 mm; left and right 0–120 mm (Word's deepest list level is 114 mm) or «auto»;
// negative only on a table (Word pulls its tables 5.4 pt into the margin), and only as far as a hit may stray
// (1 mm): a table pulled further carried a link out of the body (round 9, B).
function marginSide(w: Tok[], c: Ctx, side: string): { out: string; len: Len } | null {
  const l = length(w, { pct: true, auto: true });
  if (!l) return null;
  if ("auto" in l) return { out: tokOut(w[0]), len: l };
  if ("pct" in l) return l.pct >= 0 && l.pct <= (side === "t" || side === "b" ? 10 : 50) ? { out: tokOut(w[0]), len: l } : null;
  if (side === "t" || side === "b") return l.mm >= 0 && l.mm <= 50 ? { out: tokOut(w[0]), len: l } : null;
  if (l.mm < 0) {
    if (c.tag !== "table") return null;
    if (l.mm >= -PULL_MM) return { out: tokOut(w[0]), len: l };
    c.rewrote = true;
    return { out: mmOut(-PULL_MM), len: { mm: -PULL_MM } };
  }
  return l.mm <= 120 ? { out: tokOut(w[0]), len: l } : null;
}
// paddings: 0–30 mm (Word's cells: 5.4 pt), or up to 20 %
function paddingSide(w: Tok[]): { out: string; len: Len } | null {
  const l = length(w, { pct: true });
  if (!l || "auto" in l) return null;
  if ("pct" in l) return l.pct >= 0 && l.pct <= 20 ? { out: tokOut(w[0]), len: l } : null;
  return l.mm >= 0 && l.mm <= 30 ? { out: tokOut(w[0]), len: l } : null;
}
function textDecoration(val: Tok[]): string | null {
  const w = words(val);
  if (!w.length || w.length > 3) return null;
  const v = w.map(ident);
  if (v.length === 1 && v[0] === "none") return "none";
  return v.every((x) => x === "underline" || x === "overline" || x === "line-through") && new Set(v).size === v.length ? v.join(" ") : null;
}

// Every property a document's inline style may use (the round 9 inventory: the built-in bodies, the editor's
// toolbar, a paste from Word). `link`: allowed on a link's own text too — its colour, background, weight, slant and
// underline; never its size, font or baseline (they made the link's box larger than its words). `tags`: only on these.
const PROPS: Record<string, { tags?: Set<string>; link?: boolean; check: Check }> = {
  // ── the look of letters ──
  color: { link: true, check: one((w) => color(w, true)) },
  "background-color": { link: true, check: one((w) => color(w, false)) },
  background: { link: true, check: one((w) => color(w, false)) }, // a colour only — never a picture
  "font-weight": { link: true, check: one((w) => (w.length === 1 && w[0].k === "num" && w[0].n >= 1 && w[0].n <= 1000 ? w[0].s : ["normal", "bold", "bolder", "lighter"].includes(ident(w) ?? "") ? ident(w) : null)) },
  "font-style": { link: true, check: kw("normal", "italic", "oblique") },
  "font-family": { check: (val) => fontFamily(val) },
  "font-size": { check: (val, c) => { const w = words(val); return w.length === 1 ? fontSize(w[0], c.inLink) : null; } },
  "text-decoration": { link: true, check: textDecoration },
  "text-decoration-line": { link: true, check: textDecoration },
  "vertical-align": { check: kw("top", "middle", "bottom", "baseline", "sub", "super", "text-top", "text-bottom") },
  // Word's «font: 7.0pt "Times New Roman"» (its list bullets' spacer): [style] [weight] size[/line-height] families
  font: { check: (val, c) => {
    const ws = words(val);
    const out: string[] = [];
    let i = 0;
    for (; i < ws.length && i < 2; i++) {
      const v = ident(ws[i]);
      if (v && ["normal", "italic", "oblique", "bold", "bolder", "lighter"].includes(v)) out.push(v);
      else if (ws[i].length === 1 && ws[i][0].k === "num" && ws[i][0].n >= 100 && ws[i][0].n <= 900) out.push(ws[i][0].s);
      else break;
    }
    const sz = ws[i];
    if (!sz) return null;
    const slash = sz.findIndex((t) => t.k === "delim" && t.v === "/");
    const size = fontSize(slash < 0 ? sz : sz.slice(0, slash), c.inLink);
    if (!size) return null;
    let s = size;
    if (slash >= 0) { const lh = lineHeight(sz.slice(slash + 1)); if (!lh) return null; s += "/" + lh; }
    out.push(s);
    const at = val.indexOf(sz[sz.length - 1]);
    const fam = fontFamily(val.slice(at + 1));
    if (!fam) return null;
    out.push(fam);
    return out.join(" ");
  } },
  // ── the paragraph ──
  "text-align": { tags: BOXES, check: kw("left", "right", "center", "justify", "start", "end") },
  "line-height": { check: one(lineHeight) },
  "letter-spacing": { check: one((w) => (ident(w) === "normal" ? "normal" : ((l) => (l && "mm" in l && l.mm >= -2 * UNIT_MM.pt && l.mm <= 5 * UNIT_MM.pt ? tokOut(w[0]) : null))(length(w)))) },
  // a hanging indent may reach back only as far as the same box's own margin, border and padding (the layout check);
  // a first line indented at most 20 mm — what follows it on that line is pushed no further past the body than the
  // sheet's own margin (21.9 mm): a column-wide drawing after a 100-px indent left the sheet (round 9 review 4)
  "text-indent": { tags: BOXES, check: (val, c) => { const w = words(val); const l = w.length === 1 ? length(w[0]) : null; if (!l || !("mm" in l)) return null; if (l.mm > INDENT_MM) { c.rewrote = true; c.box.ti = INDENT_MM; return mmOut(INDENT_MM); } c.box.ti = l.mm; return tokOut(w[0][0]); } },
  "page-break-before": { tags: BREAKS, check: kw("auto", "always", "avoid", "left", "right") },
  "page-break-after": { tags: BREAKS, check: kw("auto", "always", "avoid", "left", "right") },
  "page-break-inside": { tags: BOXES, check: kw("auto", "avoid") },
  "break-before": { tags: BREAKS, check: kw("auto", "avoid", "page", "left", "right", "column") },
  "break-after": { tags: BREAKS, check: kw("auto", "avoid", "page", "left", "right", "column") },
  "break-inside": { tags: BOXES, check: kw("auto", "avoid", "avoid-page") },
  // ── the box ──
  margin: { tags: BOXES, check: (val, c) => {
    const s = sides4(val); if (!s) return null;
    const r = s.map((w, i) => marginSide(w, c, "trbl"[i]));
    if (r.some((x) => !x)) return null;
    c.box.mR = r[1]!.len; c.box.mL = r[3]!.len;
    return words(val).map((_, j) => r[j]!.out).join(" ");
  } },
  "margin-top": { tags: BOXES, check: (val, c) => { const w = words(val); return w.length === 1 ? marginSide(w[0], c, "t")?.out ?? null : null; } },
  "margin-bottom": { tags: BOXES, check: (val, c) => { const w = words(val); return w.length === 1 ? marginSide(w[0], c, "b")?.out ?? null : null; } },
  "margin-left": { tags: BOXES, check: (val, c) => { const w = words(val); const r = w.length === 1 ? marginSide(w[0], c, "l") : null; if (r) c.box.mL = r.len; return r?.out ?? null; } },
  "margin-right": { tags: BOXES, check: (val, c) => { const w = words(val); const r = w.length === 1 ? marginSide(w[0], c, "r") : null; if (r) c.box.mR = r.len; return r?.out ?? null; } },
  padding: { tags: BOXES, check: (val, c) => { const s = sides4(val); if (!s) return null; const r = s.map(paddingSide); if (r.some((x) => !x)) return null; c.box.pR = r[1]!.len; c.box.pL = r[3]!.len; return words(val).map((_, j) => r[j]!.out).join(" "); } },
  "padding-top": { tags: BOXES, check: one((w) => paddingSide(w)?.out ?? null) },
  "padding-bottom": { tags: BOXES, check: one((w) => paddingSide(w)?.out ?? null) },
  "padding-left": { tags: BOXES, check: (val, c) => { const w = words(val); const r = w.length === 1 ? paddingSide(w[0]) : null; if (r) c.box.pL = r.len; return r?.out ?? null; } },
  "padding-right": { tags: BOXES, check: (val, c) => { const w = words(val); const r = w.length === 1 ? paddingSide(w[0]) : null; if (r) c.box.pR = r.len; return r?.out ?? null; } },
  border: { tags: BOXES, check: (val, c) => border(val, c, "LR") },
  "border-left": { tags: BOXES, check: (val, c) => border(val, c, "L") },
  "border-right": { tags: BOXES, check: (val, c) => border(val, c, "R") },
  "border-top": { tags: BOXES, check: (val, c) => border(val, c, "") },
  "border-bottom": { tags: BOXES, check: (val, c) => border(val, c, "") },
  "border-color": { tags: BOXES, check: (val) => { const w = words(val); if (!w.length || w.length > 4) return null; const r = w.map((x) => color(x, false)); return r.every(Boolean) ? r.join(" ") : null; } },
  "border-style": { tags: BOXES, check: (val) => { const w = words(val); const v = w.map(ident); return w.length && w.length <= 4 && v.every((x) => ["none", "hidden", "solid", "dashed", "dotted", "double"].includes(x ?? "")) ? v.join(" ") : null; } },
  "border-width": { tags: BOXES, check: (val, c) => { const s = sides4(val); if (!s) return null; const l = s.map((w) => length(w)); if (!l.every((x) => x && "mm" in x && x.mm >= 0 && x.mm <= 3)) return null; c.box.bR = (l[1] as { mm: number }).mm; c.box.bL = (l[3] as { mm: number }).mm; return words(val).map((w) => tokOut(w[0])).join(" "); } },
  "border-radius": { tags: BOXES, check: (val) => { const w = words(val); return w.length >= 1 && w.length <= 4 && w.every((x) => within(length(x, { pct: true }), 0, 10, 50)) ? w.map((x) => tokOut(x[0])).join(" ") : null; } },
  "border-collapse": { tags: new Set(["table"]), check: kw("collapse", "separate") },
  "border-spacing": { tags: new Set(["table"]), check: (val) => { const w = words(val); return w.length >= 1 && w.length <= 2 && w.every((x) => within(length(x), 0, 5)) ? w.map((x) => tokOut(x[0])).join(" ") : null; } },
  // sizes: never wider than the column (the layout check then fits them in the box they sit in), never taller
  // than a page; a free picture as wide as the sheet
  // (a picture in the line a little wider than the column — Word's 161 mm — is as wide as the column, not its own size)
  width: { tags: new Set([...BOXES, "span", "input"]), check: (val, c) => { const w = words(val); const l = w.length === 1 ? length(w[0], { pct: true, auto: true }) : null; if (c.tag === "img" && !c.free && l && "mm" in l && l.mm > COLUMN_MM) { c.rewrote = true; c.box.W = { mm: Math.floor(COLUMN_MM * 100) / 100 }; return mmOut(COLUMN_MM); } if (!within(l, 0, c.free ? 182 : COLUMN_MM)) return null; c.box.W = l!; return tokOut(w[0][0]); } },
  "min-width": { tags: new Set([...BOXES, "span", "input"]), check: (val, c) => { const w = words(val); const l = w.length === 1 ? length(w[0], { pct: true }) : null; if (!within(l, 0, COLUMN_MM)) return null; c.box.minW = l!; return tokOut(w[0][0]); } },
  "max-width": { tags: new Set([...BOXES, "span", "input"]), check: one((w) => (within(length(w, { pct: true }), 0, COLUMN_MM) ? tokOut(w[0]) : null)) },
  height: { tags: BOXES, check: (val, c) => { const w = words(val); const l = w.length === 1 ? length(w[0], { auto: true }) : null; return within(l, 0, c.tag === "img" ? PRINTABLE_H_MM : PAGE_MM) ? tokOut(w[0][0]) : null; } },
  "min-height": { tags: BOXES, check: one((w) => (within(length(w), 0, PAGE_MM) ? tokOut(w[0]) : null)) },
  overflow: { tags: new Set(["div", "td", "th"]), check: kw("hidden", "visible", "clip") },
  gap: { tags: new Set(["div"]), check: (val) => { const w = words(val); return w.length >= 1 && w.length <= 2 && w.every((x) => within(length(x), 0, 20)) ? w.map((x) => tokOut(x[0])).join(" ") : null; } },
  "justify-content": { tags: new Set(["div"]), check: kw("start", "end", "center", "flex-start", "flex-end", "left", "right", "normal", "space-between", "space-around", "space-evenly") },
  // a picture in the line (left / right / centred) and a table set inline — what the editor and the documents write
  display: { tags: new Set(["img", "table"]), check: (val, c) => kw(...(c.tag === "img" ? ["block", "inline", "inline-block"] : ["table", "inline-table"]))(val, c) },
  float: { tags: new Set(["img"]), check: kw("left", "right", "none") },
  // a free picture (class «free», positioned by DOC_CSS): where the editor put it — on the sheet, as far down as
  // a long document goes (a place past that is moved to it: FREE_LEFT_MM, FREE_TOP_MM) — and its layer, clamped
  // (Word writes 251659264)
  left: { tags: new Set(["img"]), check: (val, c) => { if (!c.free) return null; const w = words(val); const l = w.length === 1 ? length(w[0]) : null; if (!l || !("mm" in l)) return null; const v = Math.min(182, Math.max(FREE_LEFT_MM, l.mm)); c.box.left = v; if (v === l.mm) return tokOut(w[0][0]); c.rewrote = true; return mmOut(v); } },
  top: { tags: new Set(["img"]), check: (val, c) => { if (!c.free) return null; const w = words(val); const l = w.length === 1 ? length(w[0]) : null; if (!l || !("mm" in l)) return null; const v = Math.min(FREE_TOP_MM[1], Math.max(FREE_TOP_MM[0], l.mm)); if (v === l.mm) return tokOut(w[0][0]); c.rewrote = true; return mmOut(v); } },
  "z-index": { tags: new Set(["img"]), check: (val, c) => {
    if (!c.free) return null;
    const w = words(val); const t = w.length === 1 && w[0].length === 1 ? w[0][0] : null;
    if (!t || t.k !== "num" || !Number.isInteger(t.n)) return null;
    const z = Math.max(0, Math.min(20, t.n));
    if (String(z) !== t.s) c.rewrote = true;
    return String(z);
  } },
};

/** A style attribute, checked: what stays — as written when it was plain and passed untouched, else its parsed
 *  value written back — whether anything changed, and (in `c.box`) the box it describes. */
function checkStyle(decoded: string, c: Ctx): { kept: { prop: string; out: string }[]; changed: boolean } {
  const { decls, dropped } = cssDecls(decoded);
  let changed = dropped;
  const kept: { prop: string; out: string }[] = [];
  for (const d of decls) {
    const p = PROPS[d.prop];
    if (!p || (c.inLink && !p.link) || (p.tags && !p.tags.has(c.tag))) { changed = true; continue; }
    c.rewrote = false;
    const out = p.check(d.val, c);
    if (out === null) { changed = true; continue; }
    if (d.plain && !c.rewrote) kept.push({ prop: d.prop, out: d.src });
    else { kept.push({ prop: d.prop, out: `${d.prop}:${out}` }); changed = true; }
  }
  return { kept, changed };
}

// the tag reader (the HTML tokenizer's tag states) — unchanged from round 3
// ════════════════════════════════════════════════════════════════════════════════════════
type Attr = { name: string; raw: string | null };
type Tag = { name: string; attrs: Attr[]; selfClosing: boolean; end: number; complete: boolean; nameOk: boolean };
const TAG_NAME_OK = /^[a-z][a-z0-9-]*$/;

/** Read a tag whose name starts at p (just after «<» or «</»), exactly as the browser does. */
function readTag(s: string, p: number): Tag {
  const n = s.length;
  const attrs: Attr[] = [];
  let selfClosing = false;
  const s0 = p;
  while (p < n) { const c = s.charCodeAt(p); if (isWs(c) || c === 47 || c === 62) break; p++; }
  const name = s.slice(s0, p).replace(/[A-Z]+/g, (m) => m.toLowerCase());
  const done = (end: number, complete: boolean): Tag => ({ name, attrs, selfClosing, end, complete, nameOk: TAG_NAME_OK.test(name) });
  for (;;) {
    while (p < n && isWs(s.charCodeAt(p))) p++;
    if (p >= n) return done(n, false);
    let c = s.charCodeAt(p);
    if (c === 62) return done(p + 1, true);
    if (c === 47) {
      p++;
      if (p >= n) return done(n, false);
      if (s.charCodeAt(p) === 62) { selfClosing = true; return done(p + 1, true); }
      continue;
    }
    const a0 = p;
    p++;
    while (p < n) { c = s.charCodeAt(p); if (isWs(c) || c === 47 || c === 62 || c === 61) break; p++; }
    const attr: Attr = { name: s.slice(a0, p).replace(/[A-Z]+/g, (m) => m.toLowerCase()), raw: null };
    attrs.push(attr);
    while (p < n && isWs(s.charCodeAt(p))) p++;
    if (p >= n) return done(n, false);
    if (s.charCodeAt(p) !== 61) continue;
    p++;
    while (p < n && isWs(s.charCodeAt(p))) p++;
    if (p >= n) return done(n, false);
    c = s.charCodeAt(p);
    if (c === 34 || c === 39) {
      const close = s.indexOf(c === 34 ? '"' : "'", p + 1);
      if (close < 0) return done(n, false);
      attr.raw = s.slice(p + 1, close);
      p = close + 1;
      continue;
    }
    if (c === 62) { attr.raw = ""; return done(p + 1, true); }
    const v0 = p;
    while (p < n) { c = s.charCodeAt(p); if (isWs(c) || c === 62) break; p++; }
    attr.raw = s.slice(v0, p);
    if (p >= n) return done(n, false);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════
// attributes, per tag
// ════════════════════════════════════════════════════════════════════════════════════════
type Verdict = { keep: false } | { keep: true; value?: string };
const NO: Verdict = { keep: false };
const YES: Verdict = { keep: true };
const intIn = (lo: number, hi: number) => (d: string): Verdict => { const t = d.trim(); if (!/^\d{1,7}$/.test(t)) return NO; const v = Math.min(hi, Math.max(lo, Number(t))); return String(v) === t ? YES : { keep: true, value: String(v) }; };
const oneOf = (...ok: string[]) => (d: string): Verdict => (ok.includes(d.trim().toLowerCase()) ? YES : NO);
const text = (max: number) => (d: string): Verdict => (d.length <= max ? YES : NO);
/** A size attribute: «N» px or «N%», at most `maxPx` (the column, a page) — clamped. */
const sizeAttr = (maxPx: number) => (d: string): Verdict => {
  const t = d.trim();
  const m = /^(\d{1,7})(?:\.\d+)?(%?)$/.exec(t);
  if (!m) return NO;
  if (m[2]) return Number(m[1]) <= 100 ? YES : { keep: true, value: "100%" };
  return Number(m[1]) <= maxPx ? YES : { keep: true, value: String(maxPx) };
};
const svgNum = (d: string): Verdict => (/^-?\d{0,6}(?:\.\d{1,6})?$/.test(d.trim()) && d.trim() !== "" && d.trim() !== "-" ? YES : NO);
const svgPaint = (d: string): Verdict => (/^(?:none|currentcolor|#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(d.trim()) && !/^transparent$/i.test(d.trim()) ? YES : NO);
// the attributes each tag may carry; every other one is dropped
// (no «dir»: a right-to-left box turned a negative indent outwards and pushed a link off the sheet; round 9 review 4)
const GLOBAL: Record<string, (d: string) => Verdict> = { lang: (d) => (/^[A-Za-z][A-Za-z0-9-]{0,34}$/.test(d.trim()) ? YES : NO), title: text(500) };
const ALIGN = oneOf("left", "right", "center", "justify");
const VALIGN = oneOf("top", "middle", "bottom", "baseline");
const PER_TAG: Record<string, Record<string, (d: string) => Verdict>> = {
  p: { align: ALIGN }, div: { align: ALIGN }, h1: { align: ALIGN }, h2: { align: ALIGN }, h3: { align: ALIGN }, h4: { align: ALIGN }, h5: { align: ALIGN }, h6: { align: ALIGN },
  table: { width: sizeAttr(608), border: intIn(0, 9), cellspacing: intIn(0, 20), cellpadding: intIn(0, 30) },
  td: { colspan: intIn(1, 100), rowspan: intIn(1, 1000), width: sizeAttr(608), height: sizeAttr(1123), valign: VALIGN, align: ALIGN },
  th: { colspan: intIn(1, 100), rowspan: intIn(1, 1000), width: sizeAttr(608), height: sizeAttr(1123), valign: VALIGN, align: ALIGN },
  tr: { valign: VALIGN, align: ALIGN },
  ol: { start: intIn(0, 100000), type: (d) => (/^[1aAiI]$/.test(d.trim()) ? YES : NO) },
  br: { clear: oneOf("all", "left", "right", "none", "both") },
  img: { alt: text(500), width: sizeAttr(608), height: sizeAttr(1000) },
  input: { type: (d) => (/^(text|hidden|checkbox|radio)$/i.test(d.trim()) ? YES : NO), name: (d) => (/^[A-Za-z0-9_:.-]{1,80}$/.test(d) ? YES : NO), value: text(5000), checked: () => YES },
  textarea: { name: (d) => (/^[A-Za-z0-9_:.-]{1,80}$/.test(d) ? YES : NO), rows: intIn(1, 50) },
  select: { name: (d) => (/^[A-Za-z0-9_:.-]{1,80}$/.test(d) ? YES : NO) },
  option: { value: text(5000), selected: () => YES },
  // SVG: drawing attributes with plain numbers and plain colours — no url(#…), no transform, no href; a height in
  // px only (a share of a tall cell's height made a drawing 1871 px wide)
  svg: { width: sizeAttr(608), height: (d) => (/^\s*\d{1,4}(?:\.\d+)?\s*$/.test(d) ? sizeAttr(1000)(d) : NO), viewbox: (d) => { const p = d.trim().split(/[\s,]+/); return p.length === 4 && p.every((x) => /^-?\d{0,7}(?:\.\d{0,7})?$/.test(x) && x !== "" && x !== "-") ? YES : NO; }, fill: svgPaint, stroke: svgPaint, "stroke-width": svgNum, xmlns: (d) => (d === "http://www.w3.org/2000/svg" ? YES : NO), "aria-hidden": oneOf("true", "false", "") },
  g: { fill: svgPaint, stroke: svgPaint, "stroke-width": svgNum },
  path: { d: (d) => (d.length <= 20000 && /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,eE+-]*$/.test(d) ? YES : NO), fill: svgPaint, stroke: svgPaint, "stroke-width": svgNum },
  rect: { x: svgNum, y: svgNum, width: svgNum, height: svgNum, rx: svgNum, ry: svgNum, fill: svgPaint, stroke: svgPaint, "stroke-width": svgNum },
  circle: { cx: svgNum, cy: svgNum, r: svgNum, fill: svgPaint, stroke: svgPaint, "stroke-width": svgNum },
  ellipse: { cx: svgNum, cy: svgNum, rx: svgNum, ry: svgNum, fill: svgPaint, stroke: svgPaint, "stroke-width": svgNum },
  line: { x1: svgNum, y1: svgNum, x2: svgNum, y2: svgNum, stroke: svgPaint, "stroke-width": svgNum },
  polyline: { points: (d) => (d.length <= 20000 && /^[\d\s.,eE+-]*$/.test(d) ? YES : NO), fill: svgPaint, stroke: svgPaint, "stroke-width": svgNum },
  polygon: { points: (d) => (d.length <= 20000 && /^[\d\s.,eE+-]*$/.test(d) ? YES : NO), fill: svgPaint, stroke: svgPaint, "stroke-width": svgNum },
  math: { xmlns: (d) => (d === "http://www.w3.org/1998/Math/MathML" ? YES : NO), display: oneOf("block", "inline") },
};
// on any HTML element of the body (not on a link, nor inside one, nor in a drawing)
const HTML_EXTRA: Record<string, (d: string) => Verdict> = {
  "data-ff": text(200), "data-empty": text(10), "data-cover": text(10), "data-team-contacts": text(10), "data-written-instructions": text(10),
  "data-accreditation": oneOf("mark", "na"), "data-f": text(2000), "aria-hidden": oneOf("true", "false", ""),
  // the formula and the dropdown are blocks the editor keeps whole
  contenteditable: (d) => (d.trim().toLowerCase() === "false" ? YES : NO),
};

// a decoded value written into an attribute: its «&», «"» and «<» as references
const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// A <font> (LibreOffice, old Word): a <span> whose style says what its colour, face and size said — each then checked
// as any style is — and what its own style says after them (a style wins over them, as it does in the browser).
const FONT_PT = [7.5, 10, 12, 13.5, 18, 24, 36]; // sizes 1–7, as the browser draws them
function fontAsSpan(tag: Tag): Tag {
  const get = (k: string) => { const a = tag.attrs.find((x) => x.name === k); return a?.raw != null ? decodeAttr(a.raw) : null; };
  const css: string[] = [];
  const color = get("color"), face = get("face"), size = /^\s*([+-]?)(\d{1,2})\s*$/.exec(get("size") ?? "");
  if (color) css.push(`color:${color}`);
  if (face) css.push(`font-family:${face}`);
  if (size) { const v = Number(size[2]), k = size[1] === "+" ? 3 + v : size[1] === "-" ? 3 - v : v; css.push(`font-size:${FONT_PT[Math.min(7, Math.max(1, k)) - 1]}pt`); }
  const style = get("style");
  if (style) css.push(style);
  const attrs = tag.attrs.filter((a) => !["color", "face", "size", "style"].includes(a.name));
  if (css.length) attrs.push({ name: "style", raw: escAttr(css.join(";")) });
  return { ...tag, name: "span", attrs };
}
// A <center>: a <div> whose lines are centred (its own style, after, wins).
function centerAsDiv(tag: Tag): Tag {
  const a = tag.attrs.find((x) => x.name === "style");
  const style = a?.raw != null ? decodeAttr(a.raw) : null;
  return { ...tag, name: "div", attrs: [...tag.attrs.filter((x) => x.name !== "style"), { name: "style", raw: escAttr("text-align:center" + (style ? ";" + style : "")) }] };
}
// a value written back, always double-quoted: its references stay as written (they decode the same)
const quoteAttr = (raw: string) => raw.replace(/"/g, "&quot;").replace(/</g, "&lt;");

// a comment kept as written only when it is plain — the cover's mark, a builder's note; the
// portal's other markers never come from what a person wrote (R2S-1)
function commentKept(data: string): boolean {
  if (/[<>]|--/.test(data) || data.startsWith("-")) return false;
  return !/^pts:/i.test(data) || data === "PTS:CV";
}
const COMMENT_END = /--!?>/g;

// ════════════════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════════════════
// the layout the cleaner allows: the open blocks, each with the room its content has
// ════════════════════════════════════════════════════════════════════════════════════════
// Why a model at all: a link stays in the body only if every box around it does. A box's own bounds are
// not enough — twelve boxes each under a margin cap still lifted a link out (round 8). So each block is
// checked against the room its parent leaves, and a width, a margin or a padding that would not fit is
// narrowed or dropped. The model only ever errs towards LESS room (an unclosed <p> is still counted), never more.
type Block = {
  tag: string;
  cw: number;            // the content box's width, at most (mm)
  offL: number;          // its content's left edge, from the column's left (mm; negative = pulled into the margin)
  offR: number;          // its content's right edge, from the column's right (mm, inward)
  minC: number;          // the widest thing inside that does not shrink (mm)
  ins: number;           // its own borders and paddings, left + right (mm)
  mLp: number; mRp: number; // its margins that take room (positive ones)
  W?: number; minW: number; // its explicit width / min-width (mm)
  inline: number;        // inline elements open straight in it (a link inside one is no flex item)
  flex: boolean;         // a flex or grid container (by its class)
  shell: boolean;        // a box that bleeds out of the body by design, or one inside it
  table?: Block;         // a section, a row, a cell: its table
  used?: number;         // a row: the room the cells before took
  // a table: its rows so far, the room the cells spanning into the next row take, and when each stops (by row) —
  // a running sum: a list of the spanning cells, walked at every row, took 90 s on 2.9 MB (round 9 review 4)
  rowNo?: number; spanSum?: number; spanEnds?: Map<number, number>;
  fmt?: Map<string, number>; // the formatting (FMT) opened in it and not closed — a box that closes hands its own on to
                         // the box around it, as the browser carries it on; a cell's ends with it
  src?: string;          // a box kept under another name (ALIAS): the name its end tag has
  cellpad?: number;      // a table: its cells' padding (cellpadding)
  avail?: number;        // a cell: the room its row had left when it opened
  rowspan?: number;      // a cell
  at?: number;           // where its start tag went in the output
  emits0?: number;       // how much had been written when it opened
  tags0?: number; chars0?: number; // …and how many elements and letters
  remake?: { name: string; kept: [string, string][]; classes: string[]; style: Kept | null }; // to write its start tag again
  inlineBox?: boolean;   // an inline element with a fixed-size class (a tick box): a box of its own
};
const ROOT = (): Block => ({ tag: "#body", cw: COLUMN_MM, offL: 0, offR: 0, minC: 0, ins: 0, mLp: 0, mRp: 0, minW: 0, inline: 0, flex: false, shell: false });
const SCOPE = new Set(["table", "td", "th"]);   // the parser's «in scope»: an end tag never closes past these
const TABLE_SCOPE = new Set(["table"]);
const TABLE_PARTS = new Set(["thead", "tbody", "tfoot", "tr", "td", "th"]);
const TABLE_BOX = new Set(["table", "tr", "td", "th"]);
const mmOf = (l: Len | undefined, base: number): number => (!l || "auto" in l ? 0 : "mm" in l ? l.mm : (l.pct / 100) * base);

// ════════════════════════════════════════════════════════════════════════════════════════
// the pass
// ════════════════════════════════════════════════════════════════════════════════════════
type Kept = { prop: string; out: string }[];
function sanitizePass(s: string): string {
  const n = s.length;
  const lower = s.replace(/[A-Z]+/g, (m) => m.toLowerCase()); // ASCII only: same length, same indexes
  const out: string[] = [];
  let text = 0; // the start of the text not yet written
  let i = 0;
  const stack: Block[] = [ROOT()];
  const top = () => stack[stack.length - 1];
  // how many boxes of each name are open: an end tag of none is dropped at once (750 000 «</p>» under 100 boxes
  // each walked them all)
  const opened = new Map<string, number>();
  const push = (b: Block) => { stack.push(b); const k = b.src ?? b.tag; opened.set(k, (opened.get(k) ?? 0) + 1); };
  let foreign: { ns: "svg" | "math"; open: string[] } | null = null; // inside an <svg> or a <math>: its open elements
  let inSelect = false;
  // the link being written: where its «<a …>» went in `out`, and the inline tags opened inside it
  let link: { at: number; open: string[]; words: boolean } | null = null;
  const aStack: ("link" | "gone")[] = []; // every <a> start tag, kept or not — so its end tag knows what it ends
  // how much has been written — things (words, elements), elements, letters — to tell an empty box from a full one
  let emits = 0, tagsOut = 0, chars = 0;
  let fonts = 0; // <font>s open (each written as a <span>): a </font> closes one, or nothing
  let apart = false, lastCh = " "; // a box of its own was dropped between words (SEPARATE); the last letter written

  // Text. A «<» that starts nothing stays («ΔM < 0.1 %»); one that could start a tag is escaped. Inside a link,
  // a run of blanks is one space and only a letter a reader sees is a word (linkWords).
  const flush = (to: number) => {
    if (to <= text) return;
    let t = s.slice(text, to).replace(/<(?=[A-Za-z/!?]|$)/g, "&lt;");
    let seen = false;
    if (apart && t) { if (!/^\s/.test(t) && !/\s/.test(lastCh)) t = " " + t; apart = false; }
    if (link) ({ text: t, seen } = linkWords(t));
    if (/\S/.test(t)) { emits++; chars += t.replace(/\s+/g, "").length; if (link && seen) link.words = true; }
    if (t) lastCh = t[t.length - 1];
    out.push(t);
  };
  // a link that holds anything but words is no link: its «<a>» taken back, what it held kept
  const unlink = () => { if (!link) return; out[link.at] = ""; aStack[aStack.length - 1] = "gone"; link = null; };
  // …and one that holds no word at all (only blanks or a line break) is no link either: an invisible click target
  const endLink = () => { if (!link) return; if (link.words) out.push("</a>"); else out[link.at] = ""; aStack.pop(); link = null; };
  // may a link start here? Never as a flex/grid item (it would be stretched to its row), never in the title
  // page's header band (it bleeds over the margin by design)
  const linkHere = () => { const t = top(); return !t.shell && !(t.flex && t.inline === 0); };

  // a block closes: its width counted in its parent's — a cell's in its row, a row's in its table
  // A box with a fixed height that holds something gets it as a minimum: its content never runs out of it
  // (over the page below the body), and an empty decorative box — the plan's calendar bars — stays as written.
  // A box of a fixed-height class (a header band, a tick box) that holds more than a mark loses that class, for the same reason.
  const settle = (b: Block) => {
    const r = b.remake;
    if (!r || b.at === undefined) return;
    // (a table, a row, a cell: a height there IS a minimum — and a min-height is one browsers ignore: Word's row and
    // cell heights, a 30 mm signature box, were lost; round 9 review 4)
    const grow = !TABLE_BOX.has(b.tag) && !!r.style?.some((k) => k.prop === "height") && emits > (b.emits0 ?? 0);
    const unfix = r.classes.some((c) => FIXED_H.has(c)) && (tagsOut > (b.tags0 ?? 0) || chars - (b.chars0 ?? 0) > 3);
    if (!grow && !unfix) return;
    const classes = unfix ? r.classes.filter((c) => !FIXED_H.has(c)) : r.classes;
    const style = grow ? r.style!.filter((k) => k.prop !== "min-height").map((k) => (k.prop === "height" ? { prop: "min-height", out: "min-height:" + k.out.slice(k.out.indexOf(":") + 1).trim() } : k)) : r.style;
    out[b.at] = `<${r.name}${r.kept.map((k) => k[1]).join("")}${classes.length ? ` class="${escAttr(classes.join(" "))}"` : ""}${style && style.length ? ` style="${escAttr(style.map((k) => k.out).join(";"))}"` : ""}>`;
  };
  // The end — of the input, or of what can be read of it: everything still open is closed, innermost first, by the
  // end tags a document's own would be (so a second pass reads them alike) — a link, a drawing, a dropdown, every
  // box, and the formatting a browser would carry on: what was left open took the page's footer into it (a link
  // annotation over the whole footer in the PDF, a footer inside a dropdown or in white 4-pt letters; round 9 review 4).
  const finish = () => {
    const close = (name: string) => { const e = endTag(name); if (e) out.push(e); };
    if (link) { for (let k = link.open.length - 1; k >= 0; k--) close(link.open[k]); close("a"); }
    if (foreign) for (let k = foreign.open.length - 1; k >= 0; k--) close(foreign.open[k]);
    if (inSelect) close("select");
    for (;;) {
      const b = top();
      if (b.fmt) for (const [name, k] of b.fmt) for (let j = 0; j < k; j++) close(name);
      if (stack.length === 1) break;
      close(b.src ?? b.tag);
      if (top() === b) popBlock();
    }
    return out.join("");
  };
  const popBlock = () => {
    const b = stack.pop()!;
    const name = b.src ?? b.tag;
    opened.set(name, opened.get(name)! - 1);
    settle(b);
    const p = top();
    if (b.fmt && b.tag !== "td" && b.tag !== "th") { p.fmt ??= new Map(); for (const [name, k] of b.fmt) p.fmt.set(name, (p.fmt.get(name) ?? 0) + k); }
    else if (b.fmt) for (const k of b.fmt.values()) fmtOpenN -= k; // (a cell's end ends what was opened in it)
    const content = Math.max(b.W ?? 0, b.minW, b.minC + b.ins);
    if (b.tag === "td" || b.tag === "th") {
      const w = Math.min(b.avail ?? COLUMN_MM, content);
      if (p.tag === "tr") p.used = (p.used ?? 0) + w;
      const t = b.table;
      if (t && (b.rowspan ?? 1) > 1) { const end = t.rowNo! + b.rowspan!; t.spanSum! += w; t.spanEnds!.set(end, (t.spanEnds!.get(end) ?? 0) + w); }
    } else if (b.tag === "tr") {
      if (b.table) b.table.minC = Math.max(b.table.minC, b.used ?? 0);
    } else if (b.tag !== "thead" && b.tag !== "tbody" && b.tag !== "tfoot") {
      p.minC = Math.max(p.minC, b.mLp + content + b.mRp);
    }
  };
  // close through to the nearest open `tag` (the name it was written with) within its scope: the boxes closed,
  // innermost first, or null when it is not open (its end tag is dropped)
  const popTo = (tag: string, scope: Set<string>): Block[] | null => {
    if (!opened.get(tag)) return null;
    for (let k = stack.length - 1; k > 0; k--) {
      const t = stack[k].tag;
      if ((stack[k].src ?? t) === tag) { const closed = stack.slice(k).reverse(); while (stack.length > k) popBlock(); return closed; }
      if (scope.has(t) || (tag === "li" && (t === "ul" || t === "ol"))) return null;
    }
    return null;
  };
  const nearest = (tags: string[]): Block | null => { for (let k = stack.length - 1; k > 0; k--) if (tags.includes(stack[k].tag)) return stack[k]; return null; };
  // a row starts after the cells of the rows above that span into it
  const startRow = (t: Block): number => {
    t.rowNo! += 1;
    const ended = t.spanEnds!.get(t.rowNo!);
    if (ended !== undefined) { t.spanSum = Math.max(0, t.spanSum! - ended); t.spanEnds!.delete(t.rowNo!); }
    return t.spanSum!;
  };
  // formatting opened, and closed: by the box it is open in, or the nearest one around it this side of its cell
  // (at most 100 left open at a time, as boxes: each is closed again at the end — 900 000 «</b>» made a 3-MB body 7 MB)
  let fmtOpenN = 0;
  const fmtOpen = (name: string) => { if (FMT.has(name)) { const t = top(); t.fmt ??= new Map(); t.fmt.set(name, (t.fmt.get(name) ?? 0) + 1); fmtOpenN++; } };
  const fmtClose = (name: string) => {
    if (!FMT.has(name)) return;
    for (let k = stack.length - 1; k >= 0; k--) {
      const f = stack[k].fmt, n = f?.get(name) ?? 0;
      if (n) { if (n > 1) f!.set(name, n - 1); else f!.delete(name); fmtOpenN--; return; }
      if (stack[k].tag === "td" || stack[k].tag === "th") return;
    }
  };
  const part = (tag: string, t: Block, used?: number): Block => ({ tag, cw: t.cw, offL: t.offL, offR: t.offR, minC: 0, ins: 0, mLp: 0, mRp: 0, minW: 0, inline: 0, flex: false, shell: t.shell, table: t, used });

  /** A box a start tag opens, checked against the room it has; null when it may not open (nested too deep). */
  const layout = (name: string, c: Ctx, classes: string[], tag: Tag, style: Kept | null, kept: [string, string][]): { block: Block | null; style: Kept | null; changed: boolean } | null => {
    let changed = false;
    let st = style;
    const dropProps = (props: string[]) => { if (!st) return; const k = st.length; st = st.filter((x) => !props.includes(x.prop)); if (st.length !== k) changed = true; };
    const setMm = (prop: string, mm: number) => { st = (st ?? []).filter((x) => x.prop !== prop); st.push({ prop, out: `${prop}:${mmOut(mm)}` }); changed = true; };
    const attr = (k: string) => { const a = tag.attrs.find((x) => x.name === k); return a?.raw != null ? decodeAttr(a.raw) : null; };
    // a size attribute in px (a percentage is a share the browser fits — it never overflows)
    const attrMm = (k: string) => { if (!kept.some((x) => x[0] === k)) return 0; const m = /^\s*(\d{1,7})(?:\.\d+)?\s*$/.exec(attr(k) ?? ""); return m ? Number(m[1]) * PX : 0; };
    const box = c.box;
    const P = top();
    const done = (block: Block | null) => ({ block, style: st, changed });

    // pictures: a free one sits in the sheet (never past its right edge), never in the flow, and has no margin to
    // carry it further; one in the line never wider than its box (DOC_CSS and the editor give every picture
    // max-width:100%) — nor its margins: those a picture keeps fit beside it, and are room a cell must have
    // (a 100-mm margin pushed a cell, and a link beside it, off the sheet; round 9 review 4)
    if (name === "img") {
      const w = box.W ? mmOf(box.W, c.free ? COLUMN_MM : P.cw) : attrMm("width");
      if (c.free) {
        dropProps(["margin", "margin-left", "margin-right", "margin-top", "margin-bottom"]);
        if (box.left !== undefined && box.left + w > 182 + 1e-6) setMm("left", Math.max(FREE_LEFT_MM, 182 - w));
        return done(null);
      }
      // side margins that do not fit beside it are reduced to the room it leaves — never dropped with the ones above
      // and below (round 9 review 4, second look: a float as wide as its cell lost all four)
      let mL = Math.max(0, mmOf(box.mL, P.cw)), mR = Math.max(0, mmOf(box.mR, P.cw));
      const wFit = Math.min(w, P.cw);
      if (mL + wFit + mR > P.cw + 1e-6) { const k = Math.max(0, P.cw - wFit) / (mL + mR); mL *= k; mR *= k; setMm("margin-left", mL); setMm("margin-right", mR); }
      P.minC = Math.max(P.minC, mL + mR);
      return done(null);
    }
    // a tick box, a rating dot, a tab stop, a band: an inline box of a fixed size — what it holds is checked against it
    const fixedW = classes.map((x) => FIXED_W[x]).find((x) => x !== undefined);
    if (name === "span" && (fixedW !== undefined || classes.some((x) => FIXED_H.has(x)))) {
      if (stack.length > MAX_DEPTH) return null; // a box like any other: never nested deeper than a document goes
      const w = Math.min(fixedW ?? P.cw, P.cw);
      P.minC = Math.max(P.minC, w);
      return done({ ...part("span", P), table: undefined, cw: w, W: w, flex: classes.some((x) => FLEX.has(x)), shell: P.shell, inlineBox: true });
    }
    // an inline field or line with a width it keeps (the Fill view's lines): never wider than its box
    if (name === "span" || name === "input") {
      for (const [prop, l] of [["min-width", box.minW], ["width", box.W]] as const) {
        if (!l || "auto" in l) continue;
        let w = mmOf(l, P.cw);
        if (w > P.cw + 1e-6) { setMm(prop, P.cw); w = P.cw; }
        P.minC = Math.max(P.minC, w);
      }
      return done(null);
    }
    // a drawing: its width attribute in the room it has
    // a drawing: as wide as it will really be — its width, or its height times its viewBox's proportions, or the
    // browser's 300 px — never wider than its box (an <svg height=1000 viewBox="0 0 5000 5000"> was 1000 px wide)
    if (name === "svg") {
      const vb = /^\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*$/.exec(attr("viewbox") ?? "");
      const ratio = vb && Number(vb[2]) > 0 ? Number(vb[1]) / Number(vb[2]) : null;
      const hasW = kept.some((x) => x[0] === "width"), h = attrMm("height");
      let w = hasW ? attrMm("width") : h ? h * (ratio ?? 2) : ratio ? 0 : 300 * PX;
      if (w > P.cw + 1e-6) {
        const k = kept.findIndex((x) => x[0] === "width");
        const val = ` width="${Math.min(608, Math.floor(P.cw / PX))}"`;
        if (k >= 0) kept[k] = ["width", val]; else kept.push(["width", val]);
        changed = true; w = P.cw;
      }
      P.minC = Math.max(P.minC, w);
      return done(null);
    }
    if (!BLOCKS.has(name)) return done(null);
    if (stack.length > MAX_DEPTH) return null;

    // a table's parts: the browser closes an open cell (a row, a section) when the next one starts, and adds
    // the row a cell straight in a table needs
    const isCell = name === "td" || name === "th";
    let table: Block | undefined;
    if (isCell) {
      const open = nearest(["td", "th", "tr", "thead", "tbody", "tfoot", "table"]);
      if (open && (open.tag === "td" || open.tag === "th")) popTo(open.tag, TABLE_SCOPE);
      const host = nearest(["tr", "thead", "tbody", "tfoot", "table"])!;
      while (top() !== host) popBlock();
      if (host.tag !== "tr") { const t = host.tag === "table" ? host : host.table!; push(part("tr", t, startRow(t))); }
      table = top().table;
    } else if (name === "tr") {
      const open = nearest(["tr", "td", "th", "thead", "tbody", "tfoot", "table"]);
      if (open && open.tag !== "table" && open.tag !== "thead" && open.tag !== "tbody" && open.tag !== "tfoot") popTo("tr", TABLE_SCOPE);
      const host = nearest(["thead", "tbody", "tfoot", "table"])!;
      while (top() !== host) popBlock();
      const t = host.tag === "table" ? host : host.table!;
      return done(part("tr", t, startRow(t)));
    } else if (name === "thead" || name === "tbody" || name === "tfoot") {
      const t = nearest(["table"])!;
      while (top() !== t) popBlock();
      return done(part(name, t));
    } else if (name === "li") {
      for (let k = stack.length - 1; k > 0; k--) { const b = stack[k]; if (b.tag === "li") { popTo("li", SCOPE); break; } if (!b.inlineBox && !SIBLING_THROUGH.has(b.tag)) break; }
    }

    // its sides — the style's, the table's, and the browser's own (a list's indent, a quote's margins, a cell's padding)
    const Q = top();
    const base = isCell ? Math.max(0, (table?.cw ?? Q.cw) - (Q.used ?? 0)) : Q.cw;
    // (a cell's own padding: the largest of the browser's, its table's cellpadding, and the editor's and DOC_CSS's 8 px)
    const defPL = name === "ul" || name === "ol" ? 40 * PX : isCell ? Math.max(table?.cellpad ?? PX, 8 * PX) : 0;
    const defPR = isCell ? Math.max(table?.cellpad ?? PX, 8 * PX) : 0;
    const defM = name === "blockquote" ? 40 * PX : 0;
    let mL = box.mL === undefined ? defM : mmOf(box.mL, base), mR = box.mR === undefined ? defM : mmOf(box.mR, base);
    let pL = box.pL === undefined ? defPL : mmOf(box.pL, base), pR = box.pR === undefined ? defPR : mmOf(box.pR, base);
    const bL = box.bL ?? 0, bR = box.bR ?? 0;
    const wl = box.W;
    let W: number | undefined = !wl || "auto" in wl ? undefined : "mm" in wl ? wl.mm : isCell ? undefined : (wl.pct / 100) * base;
    if (W === undefined) { const fw = classes.map((x) => FIXED_W[x]).find((x) => x !== undefined); if (fw !== undefined) W = Math.min(fw, base); }
    let wAttr = false;
    if (W === undefined && (name === "table" || isCell) && attrMm("width")) { W = attrMm("width"); wAttr = true; }
    const ml = box.minW;
    let minW = !ml || "auto" in ml ? 0 : "mm" in ml ? ml.mm : isCell ? 0 : (ml.pct / 100) * base;
    // a pull into the margin, only from a box that is not pulled already (one Word table in another)
    if (mL < 0 && Q.offL + mL < -PULL_MM - 1e-6) { dropProps(["margin", "margin-left"]); mL = 0; }
    if (mR < 0 && Q.offR + mR < -PULL_MM - 1e-6) { dropProps(["margin", "margin-right"]); mR = 0; }
    // never wider than the room it has: a width narrowed (an attribute's dropped — the browser then fits it)
    const room = () => base - mL - mR;
    if (W !== undefined && W > room() + 1e-6) {
      if (wAttr) { const k = kept.findIndex((x) => x[0] === "width"); if (k >= 0) kept.splice(k, 1); changed = true; W = undefined; }
      else { W = Math.max(0, room()); setMm("width", W); }
    }
    if (minW > room() + 1e-6) { minW = Math.max(0, room()); setMm("min-width", minW); }
    // a table without a width of its own takes no room beside it: the editor draws every table 100 % wide
    if (name === "table" && W === undefined) { if (mL > 0) { setMm("margin-left", 0); mL = 0; } if (mR > 0) { setMm("margin-right", 0); mR = 0; } }
    // never so indented that no words fit: its paddings, then its margins, then the browser's own indent go
    const inner = () => (W ?? room()) - bL - bR - pL - pR;
    // (a box the author made narrow on purpose — a 46 px icon cell — keeps its padding: only the room left by
    // insets in an auto-width box is guarded)
    const floor = W !== undefined ? 0 : Math.min(MIN_BOX_MM, base);
    if (inner() < floor - 1e-6 && (box.pL !== undefined || box.pR !== undefined)) { dropProps(["padding", "padding-left", "padding-right"]); pL = defPL; pR = defPR; }
    if (inner() < floor - 1e-6 && (box.mL !== undefined || box.mR !== undefined) && (mL > 0 || mR > 0)) { dropProps(["margin", "margin-left", "margin-right"]); mL = defM; mR = defM; }
    if (inner() < floor - 1e-6 && (name === "ul" || name === "ol") && pL > 0) { setMm("padding-left", 0); pL = 0; }
    if (inner() < floor - 1e-6 && name === "blockquote" && (mL > 0 || mR > 0)) { setMm("margin-left", 0); setMm("margin-right", 0); mL = mR = 0; }
    // a hanging indent reaches back only as far as this box's own margin, border and padding
    if (box.ti !== undefined && ((box.ti < 0 && -box.ti > Math.max(0, mL) + bL + pL + 1e-6) || (box.ti > 0 && box.ti > inner() / 2 + 1e-6))) dropProps(["text-indent"]);

    const cw = Math.max(0, inner());
    const left = Q.offL + (isCell ? Q.used ?? 0 : 0) + mL;
    const b: Block = {
      tag: name, cw, offL: left + bL + pL, offR: COLUMN_MM - (left + (W ?? room())) + bR + pR,
      minC: 0, ins: bL + bR + pL + pR, mLp: Math.max(0, mL), mRp: Math.max(0, mR), W, minW, inline: 0,
      flex: classes.some((x) => FLEX.has(x)), shell: Q.shell || classes.some((x) => SHELL.has(x)),
    };
    if (name === "table") { b.rowNo = 0; b.spanSum = 0; b.spanEnds = new Map(); const cp = attr("cellpadding"); b.cellpad = cp && /^\s*\d+\s*$/.test(cp) ? Math.min(30, Number(cp)) * PX : undefined; }
    if (isCell) {
      b.table = table; b.avail = base;
      // as written out: 1 to 1000 (PER_TAG)
      const rs = attr("rowspan");
      b.rowspan = rs && /^\s*\d{1,7}\s*$/.test(rs) ? Math.min(1000, Math.max(1, Number(rs))) : 1;
    }
    return done(b);
  };

  /** One start tag: what is written for it (null — nothing). */
  const startTag = (tag0: Tag, raw: string): string | null => {
    // a box or a <font> under the name a document has for it (ALIAS) — never inside a drawing or a formula
    const src = tag0.name;
    const name = foreign ? src : ALIAS[src] ?? src;
    const tag = name === src ? tag0 : src === "font" ? fontAsSpan(tag0) : src === "center" ? centerAsDiv(tag0) : { ...tag0, name };
    // what may open here: in a drawing or a formula only its own elements (and in a formula's letter, number or
    // operator none); in a dropdown its options; in a link only inline formatting (anything else ends the link's
    // words: it is unlinked)
    if (foreign) { if (!(foreign.ns === "svg" ? SVG_TAGS : MATH_TAGS).has(name) || (foreign.ns === "math" && MATH_TOKENS.has(foreign.open[foreign.open.length - 1]))) return null; }
    else if (inSelect) { if (name !== "option") return null; }
    else {
      // (a tag that is dropped wherever it stands — a <button>, a <wbr>, a <code> — is dropped inside a link too,
      // its words kept in it: only what is kept ends a link's words; round 9, last look)
      if (!keptTag(name)) return null;
      if (link) { if (name === "a") endLink(); else if (!IN_LINK.has(name)) unlink(); }
      if (name === "option") return null;
      if (TABLE_PARTS.has(name) && !nearest(["table"])) return null; // a table's parts only in a table (the browser ignores them elsewhere)
      if (name === "a" && !linkHere()) { aStack.push("gone"); return null; }
      // what the browser closes before this opens — here in so many words (P_CLOSERS, SIBLING_THROUGH)
      if (P_CLOSERS.has(name) && opened.get("p")) { const e = endTag("p"); if (e) out.push(e); }
      if (src === "dt" || src === "dd") {
        for (let k = stack.length - 1; k > 0; k--) {
          const b = stack[k], bn = b.src ?? b.tag;
          if (bn === "dt" || bn === "dd") { const e = endTag(bn); if (e) out.push(e); break; }
          if (!b.inlineBox && !SIBLING_THROUGH.has(b.tag)) break; // (by what is written: a <section> kept is a <div>)
        }
      }
    }
    const inLink = !!link;

    // ── attributes ── (a tag with none — most of a long body — allocates nothing here)
    const per = PER_TAG[name] ?? NONE;
    const classAttr = tag.attrs.length ? tag.attrs.find((a) => a.name === "class") : undefined;
    const classList = classAttr?.raw ? (decodeAttr(classAttr.raw) ?? "").split(/[\t\n\f\r ]+/).filter(Boolean) : NO_CLASSES;
    // a free picture is one the editor placed and sized: without a width of its own it is a picture in the line
    const free = name === "img" && classList.includes("free") && /(?:^|;)\s*width\s*:/i.test(decodeAttr(tag.attrs.find((a) => a.name === "style")?.raw ?? "") ?? "");
    const c: Ctx = { tag: name, inLink, free, box: {}, rewrote: false };
    let changed = raw.indexOf("<", 1) >= 0 || name !== src; // a «<» inside a tag: rebuilt, escaped
    const seen = tag.attrs.length > 1 ? new Set<string>() : null;
    const kept: [string, string][] = [];
    let classes: string[] = [];
    let classRaw: string | null = null;
    let style: Kept | null = null;
    let href: string | null = null;
    for (const a of tag.attrs) {
      if (PLAIN.has(name)) { changed = true; continue; }
      if (seen) { if (seen.has(a.name)) { changed = true; continue; } seen.add(a.name); } // the browser keeps the first
      if (name === "a") {
        // a link is its address and nothing else (round 9): no style, class, name — and no target or rel of its
        // own: the cleaner writes those itself (LINK_TARGET)
        if (a.name === "href" && a.raw !== null) href = linkHref(a.raw); // (one refused is no link — never «#»)
        continue;
      }
      const d = a.raw === null ? "" : decodeAttr(a.raw);
      if (d === null) { if (name === "img" && a.name === "src") return null; changed = true; continue; }
      if (name === "img" && a.name === "src") {
        const own = ownBrandPath(d);
        if (own) { kept.push(["src", ` src="${quoteAttr(own)}"`]); changed = true; continue; }
        if (!pictureUrlSafe(d, true)) return null; // a picture from where none may come is no picture at all (R4U-3)
        kept.push(["src", ` src="${quoteAttr(a.raw ?? "")}"`]);
        continue;
      }
      if (a.name === "class" && !foreign) { classRaw = d; continue; } // decided below, once the style has said whether it is a free picture
      if (a.name === "style" && !foreign) {
        let r = checkStyle(d, c);
        // a free picture whose width did not pass is a picture in the line: checked again as one (so a second
        // pass reads what the first wrote — the cleaner's output must be its own fixed point)
        if (c.free && !r.kept.some((k) => k.prop === "width")) { c.free = false; c.box = {}; r = checkStyle(d, c); r.changed = true; }
        style = r.kept;
        if (r.changed) changed = true;
        continue;
      }
      const check = per[a.name] ?? (foreign ? undefined : GLOBAL[a.name] ?? (inLink ? undefined : HTML_EXTRA[a.name]));
      const v = check ? check(d) : NO;
      if (!v.keep) { changed = true; continue; }
      if (v.value !== undefined) { changed = true; kept.push([a.name, ` ${a.name}="${escAttr(v.value)}"`]); continue; }
      kept.push([a.name, a.raw === null ? ` ${a.name}` : ` ${a.name}="${quoteAttr(a.raw)}"`]);
    }
    if (classRaw !== null) {
      // (a box kept under another name is a plain one: a document's class is the app's, never a pasted <figure>'s)
      classes = inLink || name !== src ? [] : classList.filter((x) => CLASSES.get(x)?.has(name) && (x !== "free" || c.free));
      if (classes.join(" ") !== classRaw) changed = true;
    }
    if (name === "a" && href === null) { aStack.push("gone"); return null; } // an anchor without an address (Word's bookmarks) is no link
    if (name === "img" && !tag.attrs.some((a) => a.name === "src")) return null;

    // ── the layout ──
    let block: Block | null = null;
    if (!foreign && !inLink && name !== "a") {
      const r = layout(name, c, classes, tag, style, kept);
      if (!r) return null; // nested deeper than any document: not kept as a block
      block = r.block; style = r.style;
      if (block && name !== src) block.src = src;
      if (r.changed) changed = true;
    }

    // ── written: as it was when nothing changed, else from what passed; a link always in its one fixed form ──
    const html = name === "a" ? `<a href="${quoteAttr(href!)}"${LINK_TARGET}>`
      : !changed ? raw
      : `<${name}${kept.map((k) => k[1]).join("") + (classes.length ? ` class="${escAttr(classes.join(" "))}"` : "") + (style && style.length ? ` style="${escAttr(style.map((k) => k.out).join(";"))}"` : "")}${(foreign || name === "svg" || name === "math") && tag.selfClosing ? "/" : ""}>`;

    // ── what it opens ──
    // (inline formatting and a drawing's elements nest no deeper than boxes do: each end tag looks through them)
    const begun = () => { if (src === "font") fonts++; fmtOpen(name); };
    if (name === "a") { aStack.push("link"); link = { at: out.length, open: [], words: false }; out.push(html); return null; }
    if (inLink) { if (!VOID.has(name)) { if (link!.open.length >= MAX_DEPTH || (FMT.has(name) && fmtOpenN >= MAX_DEPTH)) return null; link!.open.push(name); begun(); } return html; }
    if (foreign) { if (!tag.selfClosing) { if (foreign.open.length >= MAX_DEPTH) return null; foreign.open.push(name); } return html; }
    if (name === "svg" || name === "math") { if (!tag.selfClosing) foreign = { ns: name, open: [name] }; return html; }
    if (!block && PHRASING.has(name) && (top().inline >= MAX_DEPTH || (FMT.has(name) && fmtOpenN >= MAX_DEPTH))) return null;
    if (name === "select") inSelect = true;
    if (block) {
      if (style?.some((k) => k.prop === "height") || classes.some((c) => FIXED_H.has(c))) block.remake = { name, kept, classes, style };
      block.at = out.length; block.emits0 = emits + 1; block.tags0 = tagsOut + 1; block.chars0 = chars;
      push(block);
    } else if (PHRASING.has(name)) top().inline++;
    begun();
    return html;
  };

  /** One end tag: written only when it closes what is open in the model — and so in the browser. */
  const endTag = (src: string): string | null => {
    if (foreign) {
      const name = src;
      const k = foreign.open.lastIndexOf(name);
      if (k < 0) return null;
      foreign.open.length = k;
      if (!foreign.open.length) foreign = null;
      return `</${name}>`;
    }
    if (inSelect) {
      if (src === "option") return "</option>";
      if (src === "select") { inSelect = false; return "</select>"; }
      return null;
    }
    if (src === "font") { if (!fonts) return null; fonts--; }
    const name = ALIAS[src] ?? src;
    if (name === "a") {
      const mode = aStack.pop();
      if (mode === "link" && link) { const words = link.words; if (!words) out[link.at] = ""; link = null; return words ? "</a>" : null; }
      return null;
    }
    if (link) {
      // an inline element opened inside the link closes inside it; any other end tag of what is kept ends the
      // link's words (that of a tag dropped wherever it stands is dropped here too)
      const k = link.open.lastIndexOf(name);
      if (k >= 0) { link.open.length = k; fmtClose(name); return `</${name}>`; }
      if (!keptTag(name)) return null;
      unlink();
    }
    if (PHRASING.has(name)) {
      const t = top();
      if (t.inlineBox && t.tag === name) popBlock(); // a tick box closes
      else if (t.inline > 0) t.inline--;
      fmtClose(name);
      return `</${name}>`;
    }
    if (!BLOCKS.has(name)) return null;
    const scope = TABLE_PARTS.has(name) || name === "table" ? (name === "table" ? new Set<string>() : TABLE_SCOPE) : SCOPE;
    const closed = popTo(src, scope);
    if (!closed) return null;
    // a box kept under another name closes by the name it is written with — each box it closes, by its own end tag
    // (the browser reading what is written must close what this closed: «</section>» over a <div> in it)
    return closed.some((b) => b.src) ? closed.map((b) => `</${b.tag}>`).join("") : `</${name}>`;
  };

  while (i < n) {
    const lt = s.indexOf("<", i);
    if (lt < 0) break;
    const c1 = s.charCodeAt(lt + 1);
    if (isAlpha(c1)) {
      const tag = readTag(s, lt + 1);
      flush(lt);
      if (!tag.complete) return finish(); // cut off at the end: the browser drops it, and so does this
      i = text = tag.end;
      if (!tag.nameOk) continue;
      if (DROP_WITH_CONTENT.has(tag.name) || RCDATA_KEPT.has(tag.name)) {
        // up to its end tag («</name» then whitespace, «/» or «>»), never read as markup
        let from = tag.end, closeAt = -1, closeEnd = -1;
        for (;;) {
          const e = lower.indexOf("</" + tag.name, from);
          if (e < 0) return finish();
          if (e + 2 + tag.name.length >= n) return finish();
          const after = s.charCodeAt(e + 2 + tag.name.length);
          if (isWs(after) || after === 47 || after === 62) {
            const close = readTag(s, e + 2);
            if (!close.complete) return finish();
            closeAt = e; closeEnd = close.end;
            break;
          }
          from = e + 2;
        }
        if (RCDATA_KEPT.has(tag.name)) {
          // a text field: the tag rebuilt from what passed, its text as text — every «<» escaped
          const kept = startTag(tag, s.slice(lt, tag.end));
          if (kept !== null) { out.push(`${kept}${s.slice(tag.end, closeAt).replace(/</g, "&lt;")}</${tag.name}>`); emits++; tagsOut++; }
        }
        i = text = closeEnd;
        continue;
      }
      const kept = startTag(tag, s.slice(lt, tag.end));
      if (kept) { out.push(kept); emits++; tagsOut++; }
      else if (SEPARATE.has(tag.name)) apart = true;
      continue;
    }
    if (c1 === 47 /* / */) {
      const c2 = s.charCodeAt(lt + 2);
      if (isAlpha(c2)) {
        const tag = readTag(s, lt + 2);
        flush(lt);
        if (!tag.complete) return finish();
        i = text = tag.end;
        if (!tag.nameOk || DROP_WITH_CONTENT.has(tag.name)) continue;
        const e = endTag(tag.name);
        if (e) out.push(e);
        else if (SEPARATE.has(tag.name)) apart = true;
        continue;
      }
      if (lt + 2 >= n) { i = lt + 1; continue; } // «</» at the very end is text
      flush(lt);
      if (c2 === 62) { i = text = lt + 3; continue; } // «</>» is nothing
      const e = s.indexOf(">", lt + 2); // a bogus comment
      if (e < 0) return finish();
      i = text = e + 1;
      continue;
    }
    if (c1 === 33 /* ! */) {
      flush(lt);
      if (s.startsWith("<!--", lt)) {
        const p = lt + 4;
        if (s.charCodeAt(p) === 62) { i = text = p + 1; continue; } // «<!-->»
        if (s.charCodeAt(p) === 45 && s.charCodeAt(p + 1) === 62) { i = text = p + 2; continue; } // «<!--->»
        // its end — «-->» or «--!>», whichever comes first — in ONE forward scan (round 4, R4S-3)
        COMMENT_END.lastIndex = p;
        const e = COMMENT_END.exec(s);
        if (!e) return finish();
        if (e[0] === "-->" && commentKept(s.slice(p, e.index))) out.push(s.slice(lt, e.index + 3));
        i = text = e.index + e[0].length;
        continue;
      }
      const e = s.indexOf(">", lt + 2); // <!DOCTYPE …>, <![CDATA[ … — dropped
      if (e < 0) return finish();
      i = text = e + 1;
      continue;
    }
    if (c1 === 63 /* ? */) {
      flush(lt);
      const e = s.indexOf(">", lt + 2);
      if (e < 0) return finish();
      i = text = e + 1;
      continue;
    }
    i = lt + 1; // a «<» that starts nothing — text, escaped when written
  }
  flush(n);
  return finish();
}

// The portal's body markers never belong in what a person wrote (lib/doc-css; R2S-1).
const BODY_MARKS = /<!--PTS:(?:BS|BE)-->/g;

export function sanitizeDocHtml(html: string | null | undefined): string {
  if (!html) return "";
  const input = String(html).replace(BODY_MARKS, "").replace(/\u0000/g, "\ufffd");
  const once = sanitizePass(input);
  // a second pass changes nothing; if it ever did, every «<» is escaped — nothing runs
  return sanitizePass(once) === once ? once : once.replace(/</g, "&lt;");
}

// True when sanitizing would change the input — i.e. it contained something unsafe.
// Used only for logging/telemetry; callers always store the sanitized output.
export function isUnsafeDocHtml(html: string): boolean {
  return sanitizeDocHtml(html) !== html;
}
