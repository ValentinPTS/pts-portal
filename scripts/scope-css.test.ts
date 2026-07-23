// scopeCss(): prefixes every selector of a document's print-only stylesheet with
// the editor-page scope, so editing looks like the locked/printed document
// without the rules leaking into the app UI.
import { scopeCss } from "../src/lib/doc-css.ts";
import { RS_CSS } from "../src/lib/docs/results.ts";
import { docEditorCss } from "../src/lib/documents.ts";

let pass = 0, fail = 0;
function t(name: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else { fail++; console.error("FAIL:", name, extra); }
}

const out = scopeCss(".a{color:red;}", ".we-page");
t("single rule gets the scope", out === ".we-page .a{color:red;}", out);

const multi = scopeCss(".a,.b{margin:0;}", ".we-page");
t("every selector in a list is scoped", multi === ".we-page .a,.we-page .b{margin:0;}", multi);

const chain = scopeCss(".a{c:1;}\n  .b .c{d:2;}", ".we-page");
t("descendant selectors keep their shape", chain.includes(".we-page .b .c{"), chain);
t("second rule also scoped", chain.includes(".we-page .a{"), chain);

const decl = scopeCss("table.rtable th{background:var(--green-soft);}", ".we-page");
t("declarations untouched", decl === ".we-page table.rtable th{background:var(--green-soft);}", decl);

// the real Results-Sheet stylesheet: every rule ends up scoped, none escape
const rs = scopeCss(RS_CSS, ".we-page");
const unscoped = [...rs.matchAll(/(^|\})\s*([^{@}]+)\{/g)].map((m) => m[2].trim()).filter((sel) => sel && !sel.startsWith(".we-page"));
t("RS_CSS: every selector scoped", unscoped.length === 0, JSON.stringify(unscoped.slice(0, 3)));
t("RS_CSS: rule count preserved", (RS_CSS.match(/\{/g) ?? []).length === (rs.match(/\{/g) ?? []).length);

// @media blocks: inner rules are scoped, the wrapper survives, nothing leaks
const med = scopeCss(".a{x:1;}@media screen{.page{padding:1mm;}.b{y:2;}}.c{z:3;}", ".we-page");
t("media: wrapper kept", med.includes("@media screen{"), med);
t("media: first inner rule scoped", med.includes("@media screen{.we-page .page{padding:1mm;}"), med);
t("media: second inner rule scoped ONCE", med.includes(".we-page .b{y:2;}") && !med.includes(".we-page .we-page"), med);
t("media: rules before/after still scoped", med.startsWith(".we-page .a{") && med.includes(".we-page .c{z:3;}"), med);
const medVals = scopeCss("@media screen{.s{flex:0 0 42%;margin:0 1px 0 2px;}}", ".we-page");
t("media: numeric values untouched", medVals.includes("flex:0 0 42%;margin:0 1px 0 2px;"), medVals);

// registry: the editor gets the same stylesheet the print pass uses
t("docEditorCss(results, T) is RS_CSS", docEditorCss("results", "T") === RS_CSS);
t("docEditorCss(results, C) differs (calibration variant)", docEditorCss("results", "C").length > 0);
t("docEditorCss(plan) empty (no extra css)", docEditorCss("plan", "T") === "");
t("docEditorCss(report, T) non-empty", docEditorCss("report", "T").length > 0);

console.log(`scope-css.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
