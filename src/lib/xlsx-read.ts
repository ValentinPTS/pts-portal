import { inflateRawSync } from "node:zlib";
import type { Cell } from "./xlsx";

// A minimal XLSX READER (plan part 8.2) — no dependency: the ZIP's central directory, the stored and
// deflated entries, the workbook's sheets by name, shared strings (plain and rich), inline strings,
// numbers and booleans. What a 2.0 input file holds — written by the portal (7.1), by Excel or by
// openpyxl. Formulas are read by their cached value; styles and dates are not interpreted (a date is
// its serial number, as stored). Bounded: a file that would inflate past the limit is refused.

const MAX_ROWS = 1_048_576, MAX_COLS = 16_384;
// …and a workbook's cells in all, the gaps a far reference opens included: 3 000 rows with one cell at
// XFD filled 565 MB from a 16 KB file (the security sweep, round 2, R2S-7)
const MAX_SLOTS = 2_000_000;
const MAX_SHEETS = 255;
export interface ReadSheet { name: string; rows: Cell[][] }
export class XlsxReadError extends Error {}

const MAX_ENTRY = 64 * 1024 * 1024, MAX_TOTAL = 256 * 1024 * 1024, MAX_ENTRIES = 2000;

/** The ZIP's entries by name (directories left out) — those `only` keeps (all, by default). */
export function unzipEntries(buf: Uint8Array, only: (name: string) => boolean = () => true): Map<string, Uint8Array> {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  // the end of central directory: the last «PK\x05\x06» within the last 64 KB + 22
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new XlsxReadError("not a ZIP (no central directory)");
  const count = b.readUInt16LE(eocd + 10), cdOffset = b.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new XlsxReadError("too many entries");
  const out = new Map<string, Uint8Array>();
  const offsets = new Set<number>();
  let p = cdOffset, total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new XlsxReadError("a broken central directory");
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), usize = b.readUInt32LE(p + 24);
    const nlen = b.readUInt16LE(p + 28), xlen = b.readUInt16LE(p + 30), clen = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nlen).toString("utf8").replace(/^\/+/, "");
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    // two entries over the same bytes is no workbook — a way to make a small file large (8.2 review)
    if (offsets.has(local)) throw new XlsxReadError("entries that overlap");
    offsets.add(local);
    // only the workbook's own parts are read: the XML and the relationships
    if (!only(name)) continue;
    if (usize > MAX_ENTRY) throw new XlsxReadError("the file is too large once unpacked");
    if (local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) throw new XlsxReadError("a broken entry");
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    if (start + csize > b.length) throw new XlsxReadError("a broken entry");
    const raw = b.subarray(start, start + csize);
    let data: Buffer;
    // the bytes ACTUALLY unpacked count — never the size the file declares (8.2 review)
    const budget = Math.min(MAX_ENTRY, MAX_TOTAL - total);
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) { try { data = inflateRawSync(raw, { maxOutputLength: Math.max(1, budget) }); } catch { throw new XlsxReadError("the file is too large once unpacked, or broken"); } }
    else throw new XlsxReadError(`an entry packed in a way not read (method ${method})`);
    if (data.length !== usize) throw new XlsxReadError("an entry's size is not the one declared");
    if ((total += data.length) > MAX_TOTAL) throw new XlsxReadError("the file is too large once unpacked");
    out.set(name, new Uint8Array(data));
  }
  return out;
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const codePointText = (n: number) => { try { return String.fromCodePoint(n); } catch { return "\ufffd"; } }; // «&#x110000;» threw (round 4)
/** XML text unescaped: the five named entities and numeric references. */
export const unxml = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]{1,8}|#\d{1,10}|amp|lt|gt|quot|apos);/g, (_, e: string) => (e[0] === "#" ? codePointText(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITY[e]));

// Every element is found by ONE forward scan (the security sweep, round 4 — R4S-6): a pattern like
// «<row>([\s\S]*?)</row>» ran to the end of the part for every opener never closed — a 1.7 KB workbook
// took 14 s, a 64 MB part hours. An opener whose «>» or closing tag never comes refuses the file.
type Element = { attrs: string; body: string | null; start: number; end: number };
function elements(xml: string, name: string, withBody = true): Element[] {
  const out: Element[] = [];
  const open = `<${name}`, close = `</${name}>`;
  let p = 0;
  for (;;) {
    const i = xml.indexOf(open, p);
    if (i < 0) return out;
    const after = xml.charCodeAt(i + open.length);
    // «<c» is not «<cols», «<sheet» not «<sheets»: the name ends at whitespace, «/» or «>»
    if (!(after === 62 || after === 47 || after === 32 || after === 9 || after === 10 || after === 13)) { p = i + open.length; continue; }
    const gt = xml.indexOf(">", i + open.length);
    if (gt < 0) throw new XlsxReadError("xlsx: a broken part (a tag never closed)");
    const self = xml.charCodeAt(gt - 1) === 47;
    const attrs = xml.slice(i + open.length, self ? gt - 1 : gt);
    if (self || !withBody) { out.push({ attrs, body: null, start: i, end: gt + 1 }); p = gt + 1; continue; }
    const e = xml.indexOf(close, gt + 1);
    if (e < 0) throw new XlsxReadError("xlsx: a broken part (an element never closed)");
    out.push({ attrs, body: xml.slice(gt + 1, e), start: i, end: e + close.length });
    p = e + close.length;
  }
}
/** What stands between the first «open» and the «close» after it, or undefined. */
const between = (xml: string, open: string, close: string): string | undefined => {
  const i = xml.indexOf(open);
  if (i < 0) return undefined;
  const e = xml.indexOf(close, i + open.length);
  return e < 0 ? undefined : xml.slice(i + open.length, e);
};
/** Every <t> of an element (a rich string's runs too), joined — never the phonetic <rPh> guide. */
const textOf = (xml: string) => {
  let plain = xml;
  if (xml.indexOf("<rPh") >= 0) {
    let kept = "", from = 0;
    for (const ph of elements(xml, "rPh")) { kept += xml.slice(from, ph.start); from = ph.end; }
    plain = kept + xml.slice(from);
  }
  return elements(plain, "t").map((t) => unxml(t.body ?? "")).join("");
};
// either quote — Excel writes double, other writers single (8.2 review); found by a scan, never a pattern
// that runs to the end for each «name=» without its closing quote (R4S-6)
const attr = (tag: string, name: string): string | undefined => {
  const key = `${name}=`;
  for (let p = 0; ;) {
    const i = tag.indexOf(key, p);
    if (i < 0) return undefined;
    const before = tag.charCodeAt(i - 1), q = tag[i + key.length];
    if (i > 0 && (before === 32 || before === 9 || before === 10 || before === 13) && (q === '"' || q === "'")) {
      const e = tag.indexOf(q, i + key.length + 1);
      return e < 0 ? undefined : tag.slice(i + key.length + 1, e);
    }
    p = i + key.length;
  }
};
/** A sheet's relationship id: its «r:id», or any «<prefix>:id» (another writer's prefix). */
const relId = (tag: string): string => {
  const own = attr(tag, "r:id");
  if (own !== undefined) return own;
  for (let p = 0; ;) {
    const i = tag.indexOf(':id="', p);
    if (i < 0) return "";
    let j = i;
    while (j > 0 && /\w/.test(tag[j - 1])) j--;
    if (j < i && j > 0 && /\s/.test(tag[j - 1])) { const e = tag.indexOf('"', i + 5); return e < 0 ? "" : tag.slice(i + 5, e); }
    p = i + 5;
  }
};

/** A column's index from its letters: A → 0, Z → 25, AA → 26. */
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The workbook's sheets, in the workbook's order, by name. */
export function readXlsx(bytes: Uint8Array): ReadSheet[] {
  const files = unzipEntries(bytes, (n) => /\.(xml|rels)$/i.test(n));
  const text = (name: string) => { const f = files.get(name); return f ? Buffer.from(f).toString("utf8") : null; };
  const wb = text("xl/workbook.xml");
  if (!wb) throw new XlsxReadError("not a workbook (no xl/workbook.xml)");
  const rels = text("xl/_rels/workbook.xml.rels") ?? "";
  const target = new Map(elements(rels, "Relationship", false).map((m) => [attr(` ${m.attrs}`, "Id") ?? "", attr(` ${m.attrs}`, "Target") ?? ""]));
  // «<si/>» is an empty string, never the start of the next (8.2 review)
  const shared = elements(text("xl/sharedStrings.xml") ?? "", "si").map((m) => textOf(m.body ?? ""));
  const sheets: ReadSheet[] = [];
  // one budget for the whole workbook, each sheet's part read once, and a bound on the sheets — a
  // workbook listing one 2-million-cell part a hundred times passed every sheet's own budget (the
  // security sweep, round 3 — R3S-5)
  let slots = 0;
  const spend = (n: number) => { slots += Math.max(0, n); if (slots > MAX_SLOTS) throw new XlsxReadError("xlsx: too many cells for a workbook the portal reads"); };
  const read = new Set<string>();
  const listed = elements(wb, "sheet", false);
  if (listed.length > MAX_SHEETS) throw new XlsxReadError("xlsx: more sheets than a workbook the portal reads");
  for (const m of listed) {
    const tagText = ` ${m.attrs}`;
    const name = unxml(attr(tagText, "name") ?? "");
    const rid = relId(tagText);
    let t = target.get(rid) ?? "";
    if (!t) continue;
    t = t.startsWith("/") ? t.slice(1) : `xl/${t}`.replace(/\/\.\//g, "/");
    if (read.has(t)) throw new XlsxReadError("xlsx: one sheet's part listed twice");
    read.add(t);
    const xml = text(t);
    if (xml === null) continue;
    const rows: Cell[][] = [];
    for (const r of elements(xml, "row")) {
      const rn = Number(attr(` ${r.attrs}`, "r"));
      const ri = Number.isFinite(rn) && rn > 0 ? rn - 1 : rows.length;
      // a sheet's own bounds (Excel: 1 048 576 rows, 16 384 columns) — beyond them a crafted reference
      // filled arrays until the process ran out of memory (the security sweep, SI-7)
      if (ri >= MAX_ROWS) throw new XlsxReadError("xlsx: a row beyond a sheet's bounds");
      const row: Cell[] = [];
      let next = 0;
      for (const c of elements(r.body ?? "", "c")) {
        const tag = ` ${c.attrs}`, body = c.body ?? "";
        const ref = attr(tag, "r");
        const ci = ref ? colIndex(/^[A-Za-z]*/.exec(ref)![0]) : next;
        if (!Number.isFinite(ci) || ci < 0 || ci >= MAX_COLS) throw new XlsxReadError("xlsx: a column beyond a sheet's bounds");
        next = ci + 1;
        const type = attr(tag, "t") ?? "n";
        const v = between(body, "<v>", "</v>");
        let val: Cell = null;
        if (type === "s") val = v !== undefined ? shared[Number(v)] ?? "" : "";
        else if (type === "inlineStr") val = textOf(between(body, "<is>", "</is>") ?? "");
        else if (type === "str" || type === "e") val = v !== undefined ? unxml(v) : "";
        else if (type === "b") val = v === "1" ? "TRUE" : v === "0" ? "FALSE" : null;
        else if (v !== undefined && v.trim() !== "") { const n = Number(v); val = Number.isFinite(n) ? n : unxml(v); }
        if (val === null || val === "") continue;
        spend(ci + 1 - row.length);
        while (row.length < ci) row.push(null);
        row[ci] = val;
      }
      spend(ri + 1 - rows.length);
      while (rows.length < ri) rows.push([]);
      rows[ri] = row;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
