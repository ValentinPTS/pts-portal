// Every action string passed to logActivity() must have a BG+EN label, and every
// act.* label must correspond to a real action. Without this, /activity silently
// renders raw keys like "act.lab.uploaded" — t() falls back to the key by design,
// which is right for a missing translation but looks broken on screen.
//
// Scans the SOURCE of both sides (the i18n dictionary is module-private, and
// reading it as text also keeps this test from forcing an export that only a test
// needs), so the check can never drift from the code.
import { readFileSync, readdirSync } from "node:fs";

let pass = 0, fail = 0;
function t(name: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else { fail++; console.error("FAIL:", name, extra); }
}
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

// ── every action logged ANYWHERE under src/ ──
// The whole tree, not a hand-kept list of files: logActivity is called from route
// handlers as well as the action modules, and a list would quietly stop covering
// the newest call site exactly when it mattered.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) sourceFiles(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}
const files = sourceFiles("src");
t("walked the source tree", files.length > 50, `found ${files.length} files`);

const actions = new Set<string>();
for (const f of files) {
  const src = read(f);
  if (!src.includes("logActivity(")) continue;
  for (const m of src.matchAll(/logActivity\(\s*"([^"]+)"/g)) actions.add(m[1]);
  // some call sites choose the action with a ternary — catch both literals
  for (const m of src.matchAll(/logActivity\(\s*\w+\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)) {
    actions.add(m[1]);
    actions.add(m[2]);
  }
}

t("found the logActivity call sites at all", actions.size > 10, `found ${actions.size}`);

// ── every act.* label in the dictionary, with both languages ──
const i18n = read("src/lib/i18n.ts");
const labels = new Map<string, { bg: string; en: string }>();
for (const m of i18n.matchAll(/"act\.([^"]+)":\s*\{\s*bg:\s*"([^"]*)",\s*en:\s*"([^"]*)"\s*\}/g)) {
  labels.set(m[1], { bg: m[2], en: m[3] });
}
t("parsed the act.* dictionary", labels.size > 20, `parsed ${labels.size}`);

const missing = [...actions].filter((a) => !labels.has(a)).sort();
t("every logged action has an act.* label", missing.length === 0, `missing: ${missing.join(", ")}`);

const orphans = [...labels.keys()].filter((l) => !actions.has(l)).sort();
t("no orphan act.* labels", orphans.length === 0, `orphans: ${orphans.join(", ")}`);

const blank = [...labels].filter(([, v]) => !v.bg.trim() || !v.en.trim()).map(([k]) => k).sort();
t("every act.* label has non-empty BG and EN", blank.length === 0, `blank: ${blank.join(", ")}`);

const same = [...labels].filter(([, v]) => v.bg === v.en).map(([k]) => k).sort();
t("BG and EN are actually different strings (not a copy-paste)", same.length === 0, `identical: ${same.join(", ")}`);

// the results audit trail specifically (added with the scoring log calls)
for (const k of ["results.saved", "results.auto_assigned", "results.conflict"]) {
  t(`results audit action "${k}" is labelled`, labels.has(k));
}

console.log(`i18n-actions.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
