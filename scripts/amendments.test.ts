// Plan part 3.3 — amendments to a running scheme (Zadanie §3; Реш. 154): the order of
// amendment and what it must say; the amended editions «Изменение № … от … по Заповед №
// … от …; заменя редакцията от …»; from the opening, deadlines and a changed plan or
// invitation go only through it; the participants told.
import { readFileSync } from "node:fs";
import {
  checkAmendment, needsAmendment, mayAmend, amendmentLine, amendmentNote, nextAmendmentNo, isAmendedDoc, AMENDED_DOCS,
  AMENDMENT_PROBLEM_TEXT, type Amendment,
} from "../src/lib/amendments-model.ts";
import { stampEdition } from "../src/lib/editions-model.ts";
import { sameAs, amendmentStampFor, fingerprint, sha256, type DocEdition } from "../src/lib/editions.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import type { SchemeStatus } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── when ───────────────────────────────────────────────────────────────────
eq("a draft is still being written: no amendment needed", needsAmendment({ status: "draft" }), false);
t("from the opening on, a change goes by an amendment", (["open", "running", "processing", "report", "closed", "not_held"] as SchemeStatus[]).every((status) => needsAmendment({ status })));
t("…and once opened, a step back to draft is no way around it (review)", needsAmendment({ status: "draft", lifecycle: { acts: [{ to: "open" }, { to: "draft" }] } }));
eq("an amendment is made to an open, running, processing or reported scheme", (["draft", "open", "running", "processing", "report", "closed", "not_held"] as SchemeStatus[]).map(mayAmend), [false, true, true, true, true, false, false]);
eq("it re-issues the plan and the invitation", [...AMENDED_DOCS], ["plan", "invitation"]);
t("…only those", isAmendedDoc("plan") && isAmendedDoc("invitation") && !isAmendedDoc("instruction") && !isAmendedDoc("report"));

// ── what the order must say ────────────────────────────────────────────────
const base = { orderNo: "12", orderDate: "2026-11-04", reason: "Забавена доставка на обектите", points: "т. 10 — график", validity: "Не засяга валидността", dates: { resultsDue: "2026-12-20" }, docs: ["invitation"] };
const S = { status: "running" as SchemeStatus, dates: { resultsDue: "2026-12-10" } };
const ok = checkAmendment(S, base);
t("a whole order: accepted", ok.ok);
eq("…the new deadline kept, the docs named", ok.ok ? [ok.value.dates, ok.value.docs] : null, [{ resultsDue: "2026-12-20" }, ["invitation"]]);
const p = (over: Record<string, unknown>, s = S) => { const r = checkAmendment(s, { ...base, ...over }); return r.ok ? null : r.problem; };
eq("no order number", p({ orderNo: " " }), "order-no");
eq("no order date", p({ orderDate: "" }), "order-date");
eq("an order date that is not a day", p({ orderDate: "2026-02-31" }), "order-date");
eq("no reason", p({ reason: "abc" }), "reason");
eq("no amended points", p({ points: "" }), "points");
eq("no assessment of validity", p({ validity: "—" }), "validity");
eq("a new deadline that is not a date", p({ dates: { resultsDue: "20.12.2026" } }), "date");
eq("a reason over 2000 characters", p({ reason: "я".repeat(2001) }), "too-long");
eq("an order number over 60", p({ orderNo: "1".repeat(61) }), "too-long");
eq("nothing changed: the same deadline, no document", p({ dates: { resultsDue: "2026-12-10" }, docs: [] }), "nothing");
eq("…a document alone is a change", p({ dates: {}, docs: ["plan"] }), null);
eq("…an unknown document is ignored", p({ dates: {}, docs: ["report", "__proto__"] }), "nothing");
eq("a draft is not amended (it is edited)", p({}, { status: "draft", dates: {} }), "state");
eq("nor a scheme closed or not held", [p({}, { status: "closed", dates: {} }), p({}, { status: "not_held", dates: {} })], ["state", "state"]);
eq("a crafted non-list of documents is no document", p({ dates: {}, docs: "plan" as unknown as unknown[] }), "nothing");
t("invisible characters are dropped", (() => { const r = checkAmendment(S, { ...base, orderNo: "​12​" }); return r.ok && r.value.orderNo === "12"; })());
t("every problem has its words", Object.values(AMENDMENT_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// ── the amended edition says so (Zadanie §3) ───────────────────────────────
const A = { no: 1, day: "2026-11-05", orderNo: "12", orderDate: "2026-11-04" };
eq("the line, BG", amendmentLine("bg", A, { issuedOn: "2026-10-01" }), "Изменение № 1 от 05.11.2026 по Заповед № 12 от 04.11.2026; заменя редакцията от 01.10.2026");
eq("the line, EN", amendmentLine("en", A, { issuedOn: "2026-10-01" }), "Amendment No. 1 of 05.11.2026 by Order No. 12 of 04.11.2026; replaces the edition of 01.10.2026");
eq("…with nothing replaced (a first edition)", amendmentLine("bg", A), "Изменение № 1 от 05.11.2026 по Заповед № 12 от 04.11.2026");
const note = amendmentNote({ ...A, reason: "Забавена доставка", points: "т. 10" }, { issuedOn: "2026-10-01" });
t("the edition's note: the line and the reason; the points are its scope", note.reason.startsWith("Изменение № 1") && note.reason.includes("Забавена доставка") && note.scope === "т. 10");
t("…within the edition's 1000 characters", amendmentNote({ ...A, reason: "я".repeat(3000), points: "я".repeat(3000) }).reason.length <= 1000 && amendmentNote({ ...A, reason: "x", points: "я".repeat(3000) }).scope.length <= 1000);
const html = '<html><body><div class="docfooter">Ревизия 1 · Ф 7.2.1-2</div></body></html>';
const stamped = stampEdition(html, "bg", 2, "2026-11-05", amendmentLine("bg", A, { issuedOn: "2026-10-01" }));
t("the frozen file carries both: the edition and the amendment", stamped.includes('<span class="doc-edition">Редакция № 2 от 05.11.2026</span> · <span class="doc-amendment">Изменение № 1 от 05.11.2026 по Заповед № 12 от 04.11.2026; заменя редакцията от 01.10.2026</span>'));
t("…an order number with markup is text", stampEdition(html, "bg", 2, "2026-11-05", amendmentLine("bg", { ...A, orderNo: "<b>12</b>" })).includes("&lt;b&gt;12&lt;/b&gt;"));
t("…without an amendment the stamp is as in 3.0", stampEdition(html, "bg", 2, "2026-11-05") === html.replace("Ф 7.2.1-2</div>", 'Ф 7.2.1-2 · <span class="doc-edition">Редакция № 2 от 05.11.2026</span></div>'));
// an amended edition is recognised by its bytes too — with its line (review)
const ed2 = { id: "e2", docKey: "invitation", no: 2, issuedOn: "2026-11-05", source: "rendered", sha: { bg: sha256(stamped), en: sha256(stampEdition(html, "en", 2, "2026-11-05", amendmentLine("en", A, { issuedOn: "2026-10-01" }))) }, fingerprint: "0".repeat(64) } as unknown as DocEdition;
const nowR = { source: "rendered" as const, bg: html, en: html, fingerprint: "1".repeat(64) };
const sch = { amendments: [{ ...A, id: "a1", reason: "", points: "", validity: "", at: "", by: "", editions: { invitation: { id: "e2", no: 2, replaces: { no: 1, issuedOn: "2026-10-01" } } } }] } as unknown as Parameters<typeof amendmentStampFor>[0];
const st = amendmentStampFor(sch, ed2);
t("amendmentStampFor: the line it was stamped with, from the record", st?.bg === amendmentLine("bg", A, { issuedOn: "2026-10-01" }));
t("…not an edition no amendment issued", amendmentStampFor(sch, { id: "other", docKey: "invitation" }) === undefined);
t("sameAs: the same content, other fingerprint — recognised by its stamped bytes", sameAs(nowR, ed2, st));
t("…without the line it would not be", !sameAs(nowR, ed2));
const sc = structuredClone(pavingBlocks);
t("the fingerprint: a result saved is no change to the plan or the invitation", fingerprint({ ...sc, scoring: { x: 1 } as never }, "invitation") === fingerprint(sc, "invitation"));
t("…but it is to the results sheet and the report", fingerprint({ ...sc, scoring: { x: 1 } as never }, "results") !== fingerprint(sc, "results"));
t("…the folder's name is no document's", fingerprint({ ...sc, name: "другo" }, "plan") === fingerprint(sc, "plan"));

eq("numbered within the scheme", [nextAmendmentNo(undefined), nextAmendmentNo([{ no: 1 }, { no: 2 }] as Amendment[])], [1, 3]);

// ── the actions and pages keep the rules ───────────────────────────────────
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const rec = actions.slice(actions.indexOf("export async function recordAmendmentAction"));
t("the order is the head's: order.manage, in the scheme", /await requireCap\("order\.manage", schemeId\);/.test(rec));
const recAct = rec.slice(0, rec.indexOf("async function issueAmendmentEditions"));
const issueFn = rec.slice(rec.indexOf("async function issueAmendmentEditions"), rec.indexOf("export async function completeAmendmentAction"));
t("who to tell looked up BEFORE anything is recorded (2.3)", recAct.indexOf("labIdsFor(") > 0 && recAct.indexOf("labIdsFor(") < recAct.indexOf("await updateSchemeWith("));
t("an empty document refused before anything is recorded", recAct.indexOf("is empty — there is nothing to issue") < recAct.indexOf("await updateSchemeWith("));
t("the amendment is recorded FIRST — its number taken in the lock — and its editions after (review)", /no = nextAmendmentNo\(cur\.amendments\);/.test(recAct) && recAct.indexOf("await updateSchemeWith(") < recAct.indexOf("issueAmendmentEditions(schemeId, id, by)") && !/issueEdition\(/.test(recAct));
t("…re-checked in that lock (the state)", /if \(!checkAmendment\(cur, input\)\.ok\)/.test(recAct));
t("…with what it still has to issue pending", /\.\.\.\(v\.docs\.length \? \{ pending: v\.docs \} : \{\}\)/.test(recAct));
t("each amended edition names the amendment and the edition it replaces", /issueEdition\(\{ scheme, docKey: doc, frozen, by, reason: note\.reason, scope: note\.scope, amendment: \{ bg: amendmentLine\("bg", a, replaces\), en: amendmentLine\("en", a, replaces\) \} \}\)/.test(issueFn));
t("…recorded on the amendment one by one; a failure stops, the rest stays pending", /pending: \(x\.pending \?\? \[\]\)\.filter\(\(d\) => d !== doc\)/.test(issueFn) && /if \(!r\.ok\) return \{ left, why: EDITION_REFUSAL\[r\.error\] \};/.test(issueFn));
t("…and why it stopped is said (5.11 review): never only «try again»; the documents checked issuable BEFORE the amendment is recorded", /issued\.why \? ` \$\{issued\.why\}` : ""/.test(actions) && /m1Refusal\(scheme, doc, now\)/.test(actions.slice(actions.indexOf("export async function recordAmendmentAction"), actions.indexOf("const id = randomUUID();", actions.indexOf("export async function recordAmendmentAction")))) && /stillByEmail\(now\.bg\) \|\| stillByEmail\(now\.en\)/.test(actions));
t("the participants now hold the amended edition of what they had — checked in the lock", /const sent = !!cur\.sentToParticipants\?\.\[doc\];/.test(issueFn));
t("an unfinished amendment is completed by the head", /export async function completeAmendmentAction[\s\S]{0,120}await requireCap\("order\.manage", schemeId\);/.test(rec));
t("the new deadlines become the scheme's", /dates: \{ \.\.\.\(cur\.dates \?\? \{\}\), \.\.\.v\.dates \}/.test(recAct));
t("a send that overlaps an amendment of the plan or the invitation is refused (review)", /if \(isAmendedDoc\(docKey\) && \(s\.amendments\?\.length \?\? 0\) !== \(scheme\.amendments\?\.length \?\? 0\)\) \{ amendedMeanwhile = true; return \{\}; \}/.test(actions));
t("withdrawn after the opening, the plan or invitation keeps the edition the participants held", /if \(!\(isAmendedDoc\(docKey\) && needsAmendment\(s\)\)\) delete eds\[docKey\];/.test(actions));
t("…sent again: that edition, not a later one issued without an amendment", /if \(latest && keptRec && keptRec\.id !== latest\.id && !amendmentStampFor\(scheme, latest\)\)/.test(actions));
t("a re-issue of an amendment's edition (its file gone) keeps the line", /amendment: latest && sameAs\(now, latest, stamp\) \? stamp : undefined/.test(actions) && /amendment: same \? stamp : undefined/.test(actions));
const labRoute = readFileSync(new URL("../src/app/lab/doc/[scheme]/[doc]/route.ts", import.meta.url), "utf8");
t("a first opening never issues an opened scheme's changed plan or invitation (review)", /if \(!ed && latest && !same && isAmendedDoc\(doc\) && needsAmendment\(scheme\)\) ed = \(await servable\(latest\)\) \? latest : null;/.test(labRoute));
const labPage = readFileSync(new URL("../src/app/lab/page.tsx", import.meta.url), "utf8");
t("the laboratory sees the amendment beside the document (an uploaded PDF cannot carry the stamp)", /const amLine = am \? ` — \$\{amendmentLine\(/.test(labPage));
t("journalled, with the deadlines before and after", /logActivity\("scheme\.amendment", \{\s*schemeId, subject: `scheme:\$\{schemeId\}`, before: \{ dates: datesBefore \}/.test(recAct));
t("each participation IN THE ROUND told, by code (through the send control) — a refused, annulled or withdrawn one not (5.1)", /parts = \(await listParticipants\(schemeId\)\)\.filter\(inRound\);/.test(rec) && /for \(const p of parts\) await notifySchemeAmended\(labOf\.get\(p\.code\)/.test(rec));
const datesAct = actions.slice(actions.indexOf("export async function setSchemeDatesAction"), actions.indexOf("// ── Per-laboratory documents"));
t("the working dates: from the opening, a date set changes only by an amendment; a blank one may be set", /const changesSet = \(s: Scheme\) => needsAmendment\(s\) && DATE_KEYS\.some\(\(k\) => !!s\.dates\?\.\[k\] && dates\[k\] !== s\.dates\[k\]\);/.test(datesAct) && /if \(changesSet\(prior\)\) return refusal;/.test(datesAct));
t("«Изпрати» and «Издай нова редакция»: a changed plan or invitation only by an amendment", (actions.match(/amendmentOnly\(scheme, docKey, latest\)\) return \{ error: EDITION_REFUSAL\.amendment \}/g) ?? []).length === 2);
const editions = readFileSync(new URL("../src/lib/editions.ts", import.meta.url), "utf8");
t("the amendments are not a document's content (fingerprint)", /"lifecycle", "amendments",/.test(editions));
t("issueEdition stamps the amendment line", /stampEdition\(frozen\[lang\], lang, no, issuedOn, p\.amendment\?\.\[lang\]\)/.test(editions));
const exportSrc = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("the round export carries them (coded)", /amendments: "coded"/.test(exportSrc));
const routes = readFileSync(new URL("./regression-routes.mjs", import.meta.url), "utf8");
t("«Изменения» is in the §4.2 inventory: never a laboratory's identity", /file: "schemes\/\[id\]\/amendments\/page\.tsx", names: "never"/.test(routes));
const page = readFileSync(new URL("../src/app/schemes/[id]/amendments/page.tsx", import.meta.url), "utf8");
t("the page: the scheme's codes viewers; the form for the head while it may be amended", /await requireCap\("codes\.view", id\);/.test(page) && /const canAmend = \(await mayNow\("order\.manage", id\)\) && mayAmend\(s\.status\);/.test(page));
const form = readFileSync(new URL("../src/components/AmendmentForm.tsx", import.meta.url), "utf8");
t("the form is not cleared by a refusal (onSubmit)", /<form onSubmit=\{submit\}/.test(form) && /e\.preventDefault\(\);/.test(form));
const dates = readFileSync(new URL("../src/components/SchemeDates.tsx", import.meta.url), "utf8");
t("the dates panel points to the amendments once open; only the set dates are locked", /byAmendment && \(/.test(dates) && /\/schemes\/\$\{schemeId\}\/amendments/.test(dates) && /const locked = byAmendment && !!initial\[k\];/.test(dates) && /disabled=\{locked\}/.test(dates));

console.log(`amendments.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
