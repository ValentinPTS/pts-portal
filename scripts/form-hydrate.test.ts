// form-hydrate: a saved, owner-EDITED form document stays a live form. Static
// controls carry data-ff identity; hydrateFormBody turns them back into inputs
// (Fill view) and drawFormBody redraws their static state from newer fill values.
import { hydrateFormBody, drawFormBody, hasFormFields, retagFormBody } from "../src/lib/form-hydrate.ts";
import { fCheck, fRadio, fRating, fText, fLines, withFormCtx } from "../src/lib/form-fields.ts";
import { sanitizeDocHtml } from "../src/lib/sanitize-html.ts";

let pass = 0, fail = 0;
function t(name: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else { fail++; console.error("FAIL:", name, extra); }
}

const stat = (fn: () => string, values: Record<string, string> = {}) =>
  withFormCtx({ fill: false, values }, fn);

// ── hydrate: checkbox ──
const cbOn = stat(() => fCheck("agree", "Yes"), { agree: "1" }); // baked ✓ (drawn at render time)
let h = hydrateFormBody(cbOn, {});
t("checkbox: baked ✓ hydrates checked", h.includes(`type="checkbox" name="agree" value="1" checked`), h);
t("checkbox: hidden clear-companion emitted", h.includes(`<input type="hidden" name="agree" value="">`), h);
h = hydrateFormBody(cbOn, { agree: "" });
t("checkbox: fill-saved '' overrides baked ✓", !/checkbox[^>]*checked/.test(h), h);
t("checkbox: label text survives", h.includes("Yes"), h);

// ── hydrate: radio group ──
const rad = stat(() => fRadio("cond", [["ok", "OK"], ["bad", "BAD"]]), { cond: "bad" });
t("radio: static draw marks the saved option", /data-ff="r:cond:bad">✓</.test(rad), rad);
h = hydrateFormBody(rad, { cond: "ok" });
t("radio: hydrates with values choice", /type="radio" name="cond" value="ok" checked/.test(h), h);
t("radio: other option unchecked", !/value="bad" checked/.test(h), h);
t("radio: ONE hidden companion per group", (h.match(/type="hidden" name="cond"/g) ?? []).length === 1, h);

// ── hydrate: rating ──
const rate = stat(() => fRating("q1", "Bad", "Excellent"));
h = hydrateFormBody(rate, { q1: "4" });
t("rating: five live radios", (h.match(/class="ff-rate-in"/g) ?? []).length === 5, h);
t("rating: value 4 checked", /name="q1" value="4" checked/.test(h), h);
t("rating: end labels kept", h.includes("Excellent"), h);

// ── hydrate: text blank ──
const txt = stat(() => fText("lab_name", 240), { lab_name: "Ekolab" });
t("text: static draws the value", txt.includes(">Ekolab</span>"), txt);
h = hydrateFormBody(txt, {});
t("text: baked value becomes the input value", /name="lab_name" value="Ekolab"/.test(h), h);
t("text: min-width style preserved", h.includes("min-width:240px"), h);
h = hydrateFormBody(txt, { lab_name: 'A "B" & C' });
t("text: fill value wins + quotes escaped", h.includes('value="A &quot;B&quot; &amp; C"'), h);

// an edited blank with formatting inside still yields its text
h = hydrateFormBody(`<span class="ff-line" data-ff="t:x" style="min-width:100px">my <b>lab</b></span>`, {});
t("text: nested markup flattens to text", /name="x" value="my lab"/.test(h), h);

// adjacent close/open boundary (regression: inner must not swallow the close tag)
h = hydrateFormBody(`<span class="ff-box on" data-ff="c:z">✓</span><p>after</p>`, {});
t("boundary: trailing markup intact", h.includes("<p>after</p>") && !h.includes("</span>"), h);

// ── hydrate: lines ──
const lines = stat(() => fLines("remarks", 3), { remarks: "line one\nline two" });
h = hydrateFormBody(lines, {});
t("lines: baked rows → textarea content", h.includes(`<textarea class="ff-area" name="remarks" rows="3">line one\nline two</textarea>`), h);
h = hydrateFormBody(lines, { remarks: "fresh" });
t("lines: fill value wins", h.includes(">fresh</textarea>"), h);

// ── safety: malformed metadata is left inert ──
const evil = `<span class="ff-line" data-ff="t:bad id!"><i>x</i></span>`;
t("invalid field id: element untouched", hydrateFormBody(evil, {}) === evil);
t("invalid field id: no input emitted", !hydrateFormBody(evil, {}).includes("<input"));

// ── draw: redraw static state from newer values ──
let d = drawFormBody(cbOn, { agree: "" });
t("draw: fill-cleared checkbox unticks", /data-ff="c:agree"><\/span>/.test(d) && !/ on"/.test(d), d);
d = drawFormBody(cbOn, {});
t("draw: absent id keeps the baked state", d === cbOn, d);
d = drawFormBody(rad, { cond: "ok" });
t("draw: radio moves to the new option", /data-ff="r:cond:ok">✓</.test(d) && /data-ff="r:cond:bad"><\/span>/.test(d), d);
const round = stat(() => fRadio("yn", [["yes", "Yes"]], true), {});
d = drawFormBody(round, { yn: "yes" });
t("draw: round radio uses ●", /data-ff="r:yn:yes">●</.test(d), d);
d = drawFormBody(txt, { lab_name: "" });
t("draw: emptied text gets data-empty", /data-empty="1" data-ff="t:lab_name"/.test(d), d);
d = drawFormBody(lines, { remarks: "a\nb\nc\nd" });
t("draw: lines grow past the row count", (d.match(/ff-lrow/g) ?? []).length === 4, d);

// ── retag: legacy bodies (saved before data-ff) regain identity ──
const template = stat(() =>
  fText("head_name", 180) + fText("org", 180) + fCheck("agree", "Yes") +
  fRadio("cond", [["ok", "OK"], ["bad", "BAD"]]) + fLines("remarks", 3));
const legacy = template.replace(/ data-ff="[^"]*"/g, ""); // exactly what old saves look like
t("legacy body really has no tags", !hasFormFields(legacy));
const retagged = retagFormBody(legacy, template);
t("retag: text blanks get their ids in order",
  /data-ff="t:head_name"/.test(retagged) && /data-ff="t:org"/.test(retagged) &&
  retagged.indexOf("t:head_name") < retagged.indexOf("t:org"), retagged);
t("retag: markers get checkbox + radio tokens in order",
  /data-ff="c:agree"/.test(retagged) && /data-ff="r:cond:ok"/.test(retagged) && /data-ff="r:cond:bad"/.test(retagged), retagged);
t("retag: lines area tagged", /data-ff="l:remarks:3"/.test(retagged), retagged);
t("retag: idempotent", retagFormBody(retagged, template) === retagged);
t("retag: hydrates into named inputs afterwards",
  /name="head_name"/.test(hydrateFormBody(retagged, {})) && /type="checkbox" name="agree"/.test(hydrateFormBody(retagged, {})));

// a partially-tagged body: existing tokens are respected, not reassigned
const half = template.replace(' data-ff="t:head_name"', "");
const rehalf = retagFormBody(half, template);
t("retag: untagged control gets the missing token", /data-ff="t:head_name"/.test(rehalf), rehalf);
t("retag: no token assigned twice", (rehalf.match(/data-ff="t:org"/g) ?? []).length === 1, rehalf);

// owner-added extra blank beyond the template stays untagged (inert, no wrong id)
const extra = retagFormBody(legacy + '<span class="ff-line" style="min-width:100px"></span>', template);
t("retag: extra control left untagged", (extra.match(/data-ff="t:/g) ?? []).length === 2, extra);

// ── round-trip: sanitizer keeps identity; hasFormFields detects it ──
t("sanitizer preserves data-ff", sanitizeDocHtml(rad) === rad);
t("hasFormFields: true on a form body", hasFormFields(txt));
t("hasFormFields: false on plain html", !hasFormFields("<p>hello <b>world</b></p>"));

console.log(`form-hydrate.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
