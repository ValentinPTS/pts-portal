import { inflateRawSync } from "node:zlib";
import type { Cell } from "./xlsx";

// A minimal XLSX READER (plan part 8.2) — no dependency: the ZIP's central directory, the stored and
// deflated entries, the workbook's sheets by name, shared strings (plain and rich), inline strings,
// numbers and booleans. What a 2.0 input file holds — written by the portal (7.1), by Excel or by
// openpyxl. Formulas are read by their cached value; styles and dates are not interpreted (a date is
// its serial number, as stored). Bounded: a file that would inflate past the limit is refused.

const MAX_ROWS = 1_048_576, MAX_COLS = 16_384;
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
/** XML text unescaped: the five named entities and numeric references. */
export const unxml = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITY[e]));
/** Every <t> of an element (a rich string's runs too), joined — never the phonetic <rPh> guide. */
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => unxml(m[1] ?? "")).join("");
// either quote — Excel writes double, other writers single (8.2 review)
const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`)); return m ? (m[1] ?? m[2]) : undefined; };

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
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
  // the self-closing form first — else «<si/>» would swallow the next string (8.2 review)
  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ""));
  const sheets: ReadSheet[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = unxml(attr(m[0], "name") ?? "");
    const rid = attr(m[0], "r:id") ?? [...m[0].matchAll(/\s([\w]+:id)="([^"]*)"/g)].find((x) => x[1].endsWith(":id"))?.[2] ?? "";
    let t = target.get(rid) ?? "";
    if (!t) continue;
    t = t.startsWith("/") ? t.slice(1) : `xl/${t}`.replace(/\/\.\//g, "/");
    const xml = text(t);
    if (xml === null) continue;
    const rows: Cell[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*)\/>|<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rAttr = r[1] ?? r[2] ?? "";
      const rn = Number(attr(`<x ${rAttr}>`, "r"));
      const ri = Number.isFinite(rn) && rn > 0 ? rn - 1 : rows.length;
      // a sheet's own bounds (Excel: 1 048 576 rows, 16 384 columns) — beyond them a crafted reference
      // filled arrays until the process ran out of memory (the security sweep, SI-7)
      if (ri >= MAX_ROWS) throw new XlsxReadError("xlsx: a row beyond a sheet's bounds");
      const row: Cell[] = [];
      let next = 0;
      for (const c of (r[3] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c ${c[1]}>`, body = c[2] ?? "";
        const ref = attr(tag, "r");
        const ci = ref ? colIndex(ref.replace(/\d+$/, "")) : next;
        if (!Number.isFinite(ci) || ci < 0 || ci >= MAX_COLS) throw new XlsxReadError("xlsx: a column beyond a sheet's bounds");
        next = ci + 1;
        const type = attr(tag, "t") ?? "n";
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val: Cell = null;
        if (type === "s") val = v !== undefined ? shared[Number(v)] ?? "" : "";
        else if (type === "inlineStr") val = textOf(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
        else if (type === "str" || type === "e") val = v !== undefined ? unxml(v) : "";
        else if (type === "b") val = v === "1" ? "TRUE" : v === "0" ? "FALSE" : null;
        else if (v !== undefined && v.trim() !== "") { const n = Number(v); val = Number.isFinite(n) ? n : unxml(v); }
        if (val === null || val === "") continue;
        while (row.length < ci) row.push(null);
        row[ci] = val;
      }
      while (rows.length < ri) rows.push([]);
      rows[ri] = row;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
