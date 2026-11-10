// The edition core (plan part 3.0; Реш. 50; Задание §3–4): numbered editions, each
// with its date, its note and its frozen file, never overwritten — and what the
// participants hold is an edition. Runs on the in-memory fallback (no database);
// the database's own rules are read from migration 0029.
import { readFileSync } from "node:fs";
import { EDITIONLESS, hasEditions, checkNote, fmtDay, editionLabel, stampEdition, nextEditionNo, FIRST_REASON, MIN_REASON } from "../src/lib/editions-model.ts";
import { freezeNow, issueEdition, listEditions, latestEdition, sameAs, servable, fingerprint, editionContent, editionResponse, getEdition, sha256 } from "../src/lib/editions.ts";
import { DOCUMENTS, LIST_DOCS } from "../src/lib/documents.ts";
import { SENDABLE_DOCS } from "../src/lib/doc-release.ts";
import { sofiaToday } from "../src/lib/clock.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import type { Scheme, UploadedDoc } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── the rules ────────────────────────────────────────────────────────────────
t("no editions: the three lists and the certificate — exactly", JSON.stringify([...EDITIONLESS].sort()) === JSON.stringify([...LIST_DOCS, "certificate"].sort()));
t("…every other document has editions, every one the participants can receive among them", DOCUMENTS.filter((d) => hasEditions(d.key)).length === DOCUMENTS.length - 4 && SENDABLE_DOCS.every(hasEditions) && hasEditions("order") && hasEditions("plan"));
const n1 = checkNote(1, "", "");
t("edition 1 needs no reason: «Първа редакция»", n1.ok && n1.reason === FIRST_REASON && n1.scope === "");
t("from edition 2 a reason is required", !checkNote(2, "", "").ok && !checkNote(2, "   ", "x").ok);
t(`…of ${MIN_REASON} characters at least, counted as a person counts them`, !checkNote(2, "абвг", "").ok && checkNote(2, "абвгд", "").ok);
const n2 = checkNote(3, "  Нов срок за резултатите  ", "  т. 5  ");
t("…trimmed, with its scope", n2.ok && n2.reason === "Нов срок за резултатите" && n2.scope === "т. 5");
t("a note of more than 1000 characters is refused", !checkNote(2, "я".repeat(1001), "").ok && checkNote(2, "я".repeat(1000), "").ok && !checkNote(1, "", "x".repeat(1001)).ok);
t("dates as PTS writes them", fmtDay("2026-11-05") === "05.11.2026");
t("an edition names itself", editionLabel("bg", 2, "2026-11-05") === "Редакция № 2 от 05.11.2026" && editionLabel("en", 2, "2026-11-05") === "Edition No. 2 of 05.11.2026");
t("the next number", nextEditionNo(null) === 1 && nextEditionNo({ no: 4 }) === 5);
const page = '<html><body><div class="page">x<div class="docfooter">Revision 1 · F 7.3.5-1 · 06.01.2025</div></div></body></html>';
const stamped = stampEdition(page, "bg", 3, "2026-11-05");
t("the frozen file says which edition it is, on the document's own footer line", stamped.includes('Revision 1 · F 7.3.5-1 · 06.01.2025 · <span class="doc-edition">Редакция № 3 от 05.11.2026</span></div>'));
t("…the same document with the same edition is the same bytes", stampEdition(page, "bg", 3, "2026-11-05") === stamped && stampEdition(page, "bg", 4, "2026-11-05") !== stamped);
t("…a document with no footer gets the label as one", /<div class="docfooter"><span class="doc-edition">Edition No\. 1 of 05\.11\.2026<\/span><\/div><\/body>/.test(stampEdition("<html><body><p>x</p></body></html>", "en", 1, "2026-11-05")));
t("…and an empty footer line is just the label", stampEdition('<div class="docfooter"></div>', "en", 1, "2026-11-05") === '<div class="docfooter"><span class="doc-edition">Edition No. 1 of 05.11.2026</span></div>');

// ── issuing, freezing, serving (memory) ──────────────────────────────────────
const s: Scheme = { ...structuredClone(pavingBlocks), id: `ED-${Date.now()}` };
s.docs = { instruction: { bg: "<p>Първият текст на инструкцията.</p>", en: "<p>The first text of the instruction.</p>" } };
s.docActive = { instruction: "built" };
const today = sofiaToday(Date.now());

t("nothing in a document: nothing to freeze, nothing issued", (await freezeNow(s, "protocol")) === null && (await issueEdition({ scheme: s, docKey: "protocol", frozen: null, by: "a@ptsbg.eu" })).ok === false);
t("a list or the certificate is never issued as an edition", ((r) => !r.ok && r.error === "editionless")(await issueEdition({ scheme: s, docKey: "registered", frozen: { source: "rendered", bg: "x", en: "x" }, by: "a@ptsbg.eu" })));

const now1 = await freezeNow(s, "instruction");
t("the document now: rendered in both languages", now1?.source === "rendered" && now1.bg.includes("Първият текст") && now1.en.includes("The first text"));
const r1 = await issueEdition({ scheme: s, docKey: "instruction", frozen: now1, by: "a@ptsbg.eu" });
const ed1 = r1.ok ? r1.edition : null;
t("edition 1: number, the round's date, the first reason, who", !!ed1 && ed1.no === 1 && ed1.issuedOn === today && ed1.reason === FIRST_REASON && ed1.issuedBy === "a@ptsbg.eu" && ed1.source === "rendered");
const c1 = ed1 ? await editionContent(ed1, "bg") : null;
t("…its frozen file: the whole document, stamped, its hash on record", c1?.kind === "html" && /<html/i.test(c1.html) && c1.html.includes("Първият текст") && c1.html.includes(`Редакция № 1 от ${fmtDay(today)}`) && sha256(c1.html) === ed1!.sha.bg);
const c1en = ed1 ? await editionContent(ed1, "en") : null;
t("…in English too", c1en?.kind === "html" && c1en.html.includes(`Edition No. 1 of ${fmtDay(today)}`));
t("unchanged, the document is recognised as edition 1", !!ed1 && sameAs((await freezeNow(s, "instruction"))!, ed1));

s.docs.instruction = { bg: "<p>Вторият, променен текст.</p>", en: "<p>The second, changed text.</p>" };
const now2 = await freezeNow(s, "instruction");
t("edited, it is not edition 1 any more", !!ed1 && !sameAs(now2!, ed1));

// what a document is made from, not how this build renders it (a new version of the
// portal is not a new edition); and not what never reaches a document
const sameContent = { ...structuredClone(s), docs: { instruction: { bg: "<p>Първият текст на инструкцията.</p>", en: "<p>The first text of the instruction.</p>" } } };
t("same content, rendered differently by another build: still edition 1", !!ed1 && sameAs({ source: "rendered", bg: "<html>a new layout</html>", en: "<html>new</html>", fingerprint: fingerprint(sameContent, "instruction") }, ed1));
t("…other content rendering to the same bytes: still edition 1", !!ed1 && sameAs({ ...(now1 as { bg: string; en: string }), source: "rendered", fingerprint: "0".repeat(64) }, ed1));
t("…other content AND other bytes: not edition 1", !!ed1 && !sameAs({ source: "rendered", bg: "x", en: "y", fingerprint: "0".repeat(64) }, ed1));
const fp = fingerprint(s, "instruction");
t("the fingerprint ignores the round's operational record and the other documents",
  fingerprint({ ...s, dates: { results: "2027-01-01" } as Scheme["dates"], sentToParticipants: { instruction: "x" }, status: "running", releasedEditions: {}, docs: { ...s.docs, plan: { bg: "<p>друг документ</p>" } } }, "instruction") === fp
  // …nor a release to one participation, nor the coding act's record (5.4 review)
  && fingerprint({ ...s, releases: [{ id: "r", docKey: "instruction", level: "participation", participantId: "p", editionId: "e", editionNo: 1, at: "a", by: "b" }], coding: [{ id: "c", at: "a", by: "b", day: "d", codes: { Z001: "261101" } }] } as Scheme, "instruction") === fp);
t("…but not what the documents print, nor this document's own body", fingerprint({ ...s, titleBg: s.titleBg + " (изм.)" }, "instruction") !== fp && fingerprint({ ...s, docs: { instruction: { bg: "<p>друго</p>" } } }, "instruction") !== fp);
t("…and the order of keys does not matter", fingerprint(Object.fromEntries(Object.entries(s).reverse()) as unknown as Scheme, "instruction") === fp);
const noReason = await issueEdition({ scheme: s, docKey: "instruction", frozen: now2, by: "a@ptsbg.eu" });
t("edition 2 without a reason is refused, and says which number it would be", !noReason.ok && noReason.error === "reason" && noReason.no === 2);
const r2 = await issueEdition({ scheme: s, docKey: "instruction", frozen: now2, reason: "Нов срок за връщане на резултатите", scope: "т. 4", by: "b@ptsbg.eu" });
const ed2 = r2.ok ? r2.edition : null;
t("…with one, it is edition 2, with its note", !!ed2 && ed2.no === 2 && ed2.reason === "Нов срок за връщане на резултатите" && ed2.scope === "т. 4");
const c1again = ed1 ? await editionContent(ed1, "bg") : null;
t("edition 1 is still exactly what it was — never overwritten", c1again?.kind === "html" && c1?.kind === "html" && c1again.html === c1.html && !c1again.html.includes("Вторият"));
const c2 = ed2 ? await editionContent(ed2, "bg") : null;
t("edition 2 holds the change", c2?.kind === "html" && c2.html.includes("Вторият") && c2.html.includes("Редакция № 2"));
const list = await listEditions(s.id, "instruction");
t("the editions, the latest first", list.map((e) => e.no).join() === "2,1" && (await latestEdition(s.id, "instruction"))?.id === ed2?.id && (await getEdition(ed1!.id))?.no === 1);
t("another scheme's editions are not this one's", (await listEditions("OTHER-SCHEME")).length === 0);
t("an id that is not one finds nothing", (await getEdition("../../etc")) === null);

// two at the same moment: one is the next edition, the other is told
s.docs.instruction = { bg: "<p>Трети текст.</p>", en: "<p>Third text.</p>" };
const now3 = await freezeNow(s, "instruction");
const both = await Promise.all([1, 2].map(() => issueEdition({ scheme: s, docKey: "instruction", frozen: now3, reason: "Едновременно издаване", by: "c@ptsbg.eu" })));
t("of two issued at once, one is edition 3 and the other is refused as a conflict", both.filter((r) => r.ok).length === 1 && both.some((r) => !r.ok && r.error === "conflict") && (await latestEdition(s.id, "instruction"))?.no === 3);

// a stored file that is not the one recorded is not served
const mem = (globalThis as unknown as { __ptsEditionsMem: { id: string; bg?: string }[] }).__ptsEditionsMem;
const rec = mem.find((e) => e.id === ed1!.id)!;
const kept = rec.bg!;
rec.bg = `data:text/html;base64,${Buffer.from((c1 as { html: string }).html.replace("Първият", "Подменен"), "utf8").toString("base64")}`;
const altered = await editionResponse((await getEdition(ed1!.id))!, "bg", false);
t("a frozen file altered in storage is refused, never served", (await editionContent((await getEdition(ed1!.id))!, "bg")).kind === "altered" && altered.status === 500);
t("…and such an edition is not servable — so never reused for a release", (await servable((await getEdition(ed1!.id))!)) === false);
rec.bg = kept;
t("restored, it is servable again", await servable((await getEdition(ed1!.id))!));
const ok1 = await editionResponse((await getEdition(ed1!.id))!, "bg", false);
t("…the recorded one is served: HTML, the documents' policy, not cached", ok1.status === 200 && /text\/html/.test(ok1.headers.get("content-type") ?? "") && /font-src 'self'/.test(ok1.headers.get("content-security-policy") ?? "") && /no-store/.test(ok1.headers.get("cache-control") ?? "") && (await ok1.text()).includes("Първият текст"));
const dl = await editionResponse((await getEdition(ed1!.id))!, "en", true);
t("…and as a download, named by its edition", /attachment; filename="instruction-edition-1-en\.html"/.test(dl.headers.get("content-disposition") ?? ""));

// an uploaded file that is the active version: kept by reference, its bytes hashed
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const up: UploadedDoc = { path: `data:application/pdf;base64,${pdf.toString("base64")}`, name: "protocol.pdf", mime: "application/pdf", size: pdf.length, uploadedAt: "2026-11-05T10:00:00Z", uploadedBy: "a@ptsbg.eu" };
const s2: Scheme = { ...structuredClone(pavingBlocks), id: `ED2-${Date.now()}`, uploads: { protocol: up }, docActive: { protocol: "uploaded" } };
const nowUp = await freezeNow(s2, "protocol");
t("an active upload is the document now — as the file", nowUp?.source === "uploaded" && nowUp.file.path === up.path);
const ru = await issueEdition({ scheme: s2, docKey: "protocol", frozen: nowUp, by: "a@ptsbg.eu" });
const edu = ru.ok ? ru.edition : null;
t("…issued by reference, with the hash of its bytes, no HTML", !!edu && edu.source === "uploaded" && edu.sha.file === sha256(new Uint8Array(pdf)) && !edu.bg && !edu.en);
const ur = await editionResponse(edu!, "bg", false);
t("…served as that file", ur.status === 200 && ur.headers.get("content-type") === "application/pdf" && Buffer.from(await ur.arrayBuffer()).equals(pdf));
t("…and recognised while it is the same file", sameAs((await freezeNow(s2, "protocol"))!, edu!));
const pdf2 = Buffer.from("%PDF-1.4\n% another\n%%EOF\n");
s2.uploads = { protocol: { ...up, path: `data:application/pdf;base64,${pdf2.toString("base64")}`, size: pdf2.length } };
t("…a different file is not that edition", !sameAs((await freezeNow(s2, "protocol"))!, edu!));

// the final report: only ever PTS's uploaded file (the portal's render carries its scores)
const s3: Scheme = { ...structuredClone(pavingBlocks), id: `ED3-${Date.now()}`, docs: { report: { bg: "<p>доклад</p>", en: "<p>report</p>" } }, docActive: { report: "built" } };
t("the report built in the editor is not an edition — nothing to freeze", (await freezeNow(s3, "report")) === null);
s3.uploads = { report: up };
t("…its uploaded file is, even with the built one chosen", (await freezeNow(s3, "report"))?.source === "uploaded");

// ── the database's own rules (0029) ──────────────────────────────────────────
const sql = read("supabase/migrations/0029_doc_editions.sql");
t("0029: a record — no change, no removal, no truncation", /if tg_op <> 'INSERT' then\s*raise exception/.test(sql) && /before insert or update or delete on public\.doc_editions/.test(sql) && /before truncate on public\.doc_editions/.test(sql) && /revoke update, delete, truncate on public\.doc_editions from service_role/.test(sql));
t("0029: the next number and only the next, one at a time per document", /pg_advisory_xact_lock\(hashtextextended\('doc_editions:' \|\| new\.scheme_id \|\| '\/' \|\| new\.doc_key, 0\)\)/.test(sql) && /if new\.no <> coalesce\(latest, 0\) \+ 1 then/.test(sql) && /unique \(scheme_id, doc_key, no\)/.test(sql));
t("0029: a reason from edition 2 on", /if new\.no >= 2 and char_length\(new\.reason\) < 5 then/.test(sql));
t("0029: the frozen file in exactly one form, each with its SHA-256", /source = 'uploaded' and file is not null and sha_file ~ '\^\[0-9a-f\]\{64\}\$' and html_bg is null and html_en is null/.test(sql) && /source = 'rendered' and file is null and html_bg is not null and html_en is not null/.test(sql));
t("0029: the fingerprint is a hash; the report only as the uploaded file", /fingerprint text check \(fingerprint is null or fingerprint ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(sql) && /check \(doc_key <> 'report' or source = 'uploaded'\)/.test(sql));
t("0029: never an edition of the lists or the certificate", /check \(doc_key not in \('registered', 'registered-coded', 'results-coded', 'certificate'\)\)/.test(sql));
t("0029: closed to the API, marked applied, expected by the build gate", /alter table public\.doc_editions enable row level security/.test(sql) && /revoke all on public\.doc_editions from anon, authenticated/.test(sql) && sql.includes("('0029_doc_editions')") && read("src/lib/migrations-list.ts").includes('"0029_doc_editions"'));

// ── where the editions are used ──────────────────────────────────────────────
const acts = read("src/lib/actions.ts");
t("«Изпрати»: the latest edition when unchanged AND servable, else the next — which from 2 on asks for the note", /if \(latest && sameAs\(now, latest, stamp\)\) \{\s*if \(await servable\(latest\)\) return \{ edition: latest, issued: false \};[\s\S]{0,300}reason = reissueReason\(latest\.no\);\s*\} else if \(amendmentOnly\(scheme, docKey, latest\)\) return \{ error: EDITION_REFUSAL\.amendment \};\s*else if \(latest && !String\(reason \?\? ""\)\.trim\(\)\) return \{ needsNote:/.test(acts));
t("3.3: from the opening, a changed plan or invitation goes out only by an amendment", /const amendmentOnly = \(scheme: Scheme, docKey: string, latest: DocEdition \| null\) =>\s*!!latest && isAmendedDoc\(docKey\) && needsAmendment\(scheme\);/.test(acts));
t("…decided before the identity store is opened: a send that asks for its note opens nothing", acts.indexOf("const got = await editionToSend(scheme, docKey") > acts.indexOf("export async function setDocSentAction") && acts.indexOf("const got = await editionToSend(scheme, docKey") < acts.indexOf("labOf = await labIdsFor(schemeId, parts, await actorNow())", acts.indexOf("export async function setDocSentAction")));
t("…and records which edition went out", /releasedEditions: \{ \.\.\.\(s\.releasedEditions \?\? \{\}\), \[docKey\]: \{ id: edition\.id, no: edition\.no, at: sentAt \} \}/.test(acts));
t("…nothing released when no edition can be kept", /const got = await editionToSend\(scheme, docKey, note, await actorNow\(\)\);\s*if \("needsNote" in got\) return \{ needsNote: got\.needsNote \};\s*if \("error" in got\) return \{ error: got\.error \};/.test(acts));
t("«Издай редакция»: who edits the scheme, who may open the document; nothing issued when nothing changed", /export async function issueEditionAction\([\s\S]{0,200}await requireCap\("scheme\.edit", schemeId\);[\s\S]{0,200}mayViewDoc\(docKey, schemeId\)[\s\S]{0,1600}Nothing has changed since edition/.test(acts));
const lab = read("src/app/lab/doc/[scheme]/[doc]/route.ts");
t("a laboratory is served the edition it was released as — to everyone, or to it alone (5.4)", /const ed = await \(reaching\.level === "all" \? releasedEdition\(scheme, doc\) : targetEdition\(scheme, doc, reaching\.editionId\)\)[\s\S]{0,300}if \(ed\) return \{ res: await editionResponse\(ed, lang, download\)/.test(lab));
t("…none to be read or kept: refused, never the live document instead (N5, for good since 5.4)", /return \{ res: new Response\("This document cannot be opened right now\. Try again in a moment\.", \{ status: 503 \}\) \};/.test(lab) && !/renderCohortDoc|uploadedDocResponse/.test(lab));
t("…released before editions: kept on its first opening, by the system, saying why", /by: "system:first-opening"/.test(lab) && /изпратен преди въвеждането на редакциите/.test(lab));
t("…two first openings at once: the other one's edition, never the live document", /\} else if \(r\.error === "conflict"\) \{\s*ed = await latestEdition\(scheme\.id, doc\);/.test(lab));
t("the final report: its latest edition — a replaced file reaches the laboratories only as the next edition", /const ed = await reportEdition\(scheme\)/.test(lab) && /async function reportEdition\(scheme: Scheme\)[\s\S]{0,200}if \(latest\) return latest;/.test(lab) && !/if \(doc === "report"\) \{\s*return up \? uploadedDocResponse/.test(lab));
const route = read("src/app/schemes/[id]/editions/[edition]/route.ts");
t("an edition's file: the scheme's staff, the document's own rule (the Order), never another scheme's", /await requireCap\("codes\.view", id\)/.test(route) && /ed\.schemeId !== id/.test(route) && /mayViewDoc\(ed\.docKey, id\)/.test(route) && /isRestrictedDoc\(ed\.docKey\) && !\(await mayNow\("names\.view", id\)\)/.test(route) && /logActivity\("file\.downloaded"/.test(route));
t("what the participants hold, for the staff: its edition", /scheme\.releasedEditions\?\.\[doc\]/.test(read("src/app/schemes/[id]/released/[doc]/route.ts")) && /editionResponse\(ed, lang/.test(read("src/app/schemes/[id]/released/[doc]/route.ts")));
const exp = read("src/lib/round-export.ts");
t("the round export carries every edition and its file (Реш. 136)", /doc_editions: \["coded\/editions\.csv"\]/.test(exp) && /for \(const e of await listEditions\(schemeId\)\)/.test(exp) && /ROUND_BUCKETS = \["scheme-docs", EDITION_BUCKET, "skin-assets"\]/.test(exp));
t("…byte for byte, never through the scrubber, each checked against its hash; one naming a laboratory kept out of coded/", /if \(b\) add\(f, b\); else missing\.push\(f\);/.test(exp) && /const altered = sha256\(b\) !== e\.sha\[lang\]/.test(exp) && /if \(scrub\(text\) !== text\) \{[\s\S]{0,400}identity\/files\/editions/.test(exp) && !/add\(f, Buffer\.from\(b\)\.toString\("utf8"\)\)/.test(exp));
t("a file kept for an edition is removed only when its row is truly not there", /const \{ data: row, error: readErr \} = await db\.from\("doc_editions"\)\.select\("id"\)\.eq\("id", edition\.id\)\.maybeSingle\(\);\s*if \(row\) return \{ ok: true, edition \};\s*if \(!readErr\)/.test(read("src/lib/editions.ts")));
t("the system check watches the editions' bucket stays private", /const BUCKETS = \[SCHEME_DOC_BUCKET, EDITION_BUCKET,/.test(read("src/lib/system-check.ts")) && /if \(bucket\?\.public\) throw new Error/.test(read("src/lib/editions.ts")));

console.log(`editions.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
