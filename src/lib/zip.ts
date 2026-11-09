import { deflateRawSync } from "zlib";

// A plain ZIP writer (part 1.10, the round export) — no dependency, PKZIP 2.0: each
// entry deflated when that makes it smaller, stored otherwise; names in UTF-8 (the
// general-purpose flag bit 11), so Bulgarian names open as they are. Opens in
// Windows Explorer, macOS Archive Utility, 7-Zip and `unzip`. No ZIP64: a round's
// export stays far below 4 GB and 65 535 entries; a larger one is refused.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry { name: string; data: Uint8Array | string }

// MS-DOS date and time, as ZIP keeps them (local time of the server; 2-second steps)
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function zip(entries: ZipEntry[], when: Date = new Date()): Uint8Array {
  if (entries.length > 0xffff) throw new Error("too many files for a ZIP without ZIP64");
  const enc = new TextEncoder();
  const { time, date } = dosTime(when);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const e of entries) {
    const name = e.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name || name.split("/").includes("..")) throw new Error(`bad entry name: ${e.name}`);
    if (seen.has(name)) throw new Error(`duplicate entry: ${name}`);
    seen.add(name);
    const raw = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const deflated = deflateRawSync(raw);
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? new Uint8Array(deflated) : raw;
    const nameBytes = enc.encode(name);
    const crc = crc32(raw);
    if (offset + 30 + nameBytes.length + body.length > 0xffffffff) throw new Error("export too large for a ZIP without ZIP64");

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);              // version needed
    lv.setUint16(6, 0x0800, true);          // UTF-8 names
    lv.setUint16(8, useDeflate ? 8 : 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);              // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, useDeflate ? 8 : 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);         // where its local header is
    central.set(nameBytes, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length; }
  return out;
}
