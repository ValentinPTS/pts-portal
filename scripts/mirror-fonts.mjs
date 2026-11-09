// Mirror the documents' typefaces into public/fonts, so the portal serves them itself
// and opening a document never contacts Google (docs/participant-portal/PROCESSORS-BG.md,
// «Четири неща за решение», item 1).
//
// A developer tool, run by hand when the font allow-list changes (FONTS in
// src/skins/custom.ts) — never by the portal, the build or the tests:
//
//   node --import ./scripts/ts-ext-hook.mjs scripts/mirror-fonts.mjs [outDir]
//
// outDir defaults to public/fonts. For each family it asks Google Fonts for the very
// stylesheet the documents used to load (the same css2 `family=` spec, the same modern
// browser → woff2 files split into unicode-range subsets), downloads every file, and
// writes <slug>.css with the @font-face rules unchanged except that each url() now
// points at the local copy. Same faces, same weights, same subsets — the documents look
// exactly as before. Each family's licence (SIL Open Font License 1.1, which allows
// this) is saved beside its files as <slug>/OFL.txt.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FONTS } from "../src/skins/custom.ts";
import { fontSlug } from "../src/lib/doc-fonts.ts";

const portal = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(process.argv[2] ?? join(portal, "public/fonts"));
// A current desktop Chrome: Google answers it with woff2 + unicode-range subsets.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const today = new Date().toISOString().slice(0, 10);

async function get(url, as) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === "bytes" ? Buffer.from(await res.arrayBuffer()) : res.text();
}

let files = 0, bytes = 0;
for (const f of FONTS) {
  const slug = fontSlug(f.id);
  const css = await get(`https://fonts.googleapis.com/css2?family=${f.g}&display=swap`);
  // every rule: /* subset */ @font-face { … url(https://fonts.gstatic.com/s/<fam>/<vN>/<id>.woff2) … }
  const rules = [...css.matchAll(/\/\* ([a-z0-9-]+) \*\/\s*@font-face \{([^}]*)\}/g)].map((m) => ({
    subset: m[1],
    weight: m[2].match(/font-weight: (\d+);/)?.[1],
    url: m[2].match(/url\((https:\/\/fonts\.gstatic\.com\/s\/[a-z0-9]+\/(v\d+)\/[A-Za-z0-9_-]+\.woff2)\)/),
  }));
  if (!rules.length || rules.some((r) => !r.weight || !r.url) || rules.length !== (css.match(/@font-face/g) ?? []).length)
    throw new Error(`${f.id}: unexpected stylesheet from Google — nothing written for it`);

  // one local file per Google file; a variable font serves several weights from one file
  const byUrl = new Map();
  for (const r of rules) {
    const e = byUrl.get(r.url[1]) ?? { subset: r.subset, version: r.url[2], weights: [] };
    e.weights.push(+r.weight);
    byUrl.set(r.url[1], e);
  }
  const names = new Set();
  mkdirSync(join(out, slug), { recursive: true });
  let local = css;
  for (const [url, e] of byUrl) {
    const w = [Math.min(...e.weights), Math.max(...e.weights)];
    const name = `${e.version}-${e.subset}-${w[0] === w[1] ? w[0] : w.join("-")}.woff2`;
    if (names.has(name)) throw new Error(`${f.id}: two files would be named ${name}`);
    names.add(name);
    const data = await get(url, "bytes");
    if (data.subarray(0, 4).toString("latin1") !== "wOF2") throw new Error(`${f.id}: ${url} is not a woff2 file`);
    writeFileSync(join(out, slug, name), data);
    local = local.split(`url(${url})`).join(`url(${slug}/${name})`);
    files++; bytes += data.length;
  }
  if (/https?:/.test(local)) throw new Error(`${f.id}: an outside address is left in the stylesheet`);

  const licence = await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${slug.replace(/-/g, "")}/OFL.txt`);
  if (!/SIL OPEN FONT LICENSE/i.test(licence)) throw new Error(`${f.id}: OFL.txt is not the SIL Open Font License`);
  writeFileSync(join(out, slug, "OFL.txt"), licence);

  const head = `/* ${f.id} — the portal's own copy, mirrored from Google Fonts on ${today} (css2 spec ${f.g}).\n` +
    `   SIL Open Font License 1.1: ${slug}/OFL.txt. Written by scripts/mirror-fonts.mjs — do not edit by hand. */\n`;
  writeFileSync(join(out, `${slug}.css`), head + local);
  console.log(`${f.id.padEnd(22)} ${String(byUrl.size).padStart(2)} files  ${rules.length} rules`);
}
console.log(`${FONTS.length} families, ${files} files, ${Math.round(bytes / 1024)} KB → ${out}`);
