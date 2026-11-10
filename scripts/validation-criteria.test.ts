// Plan part 8.1 — the acceptance criteria, signed by PTS before any test (Реш. 134): the form's
// read, the file check, the edition in force by day, criteriaFor per level (the rule 8.3–8.6 use),
// the store (in memory), and the wiring (who, the journal without the file, the gated route, the
// bucket, coverage).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readCriteriaForm, fileProblem, criteriaInForce, criteriaFor, levelStatus, nextEdition, voidProblem, editionProblem, sniffMime, oneLine, type CriteriaEdition } from "../src/lib/validation-model.ts";
import { recordCriteria, listCriteria, voidCriteria, criteriaFile } from "../src/lib/validation-criteria.ts";
import { RIGHTS } from "../src/lib/role-model.ts";
import { MIGRATIONS } from "../src/lib/migrations-list.ts";
import { NOT_ROUND_TABLES, NOT_ROUND_BUCKETS } from "../src/lib/round-export.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const TODAY = "2027-03-10";

// ── the form ──
const good = readCriteriaForm({ edition: "1", signedOn: "2027-03-01", signedBy: "  Р. Беловски, ръководител  ", levels: ["1", "3", "2"], note: "Първа редакция" }, TODAY);
t("the form: the paper's edition number, the day, who signed (trimmed), the levels in order, the note", good.ok && good.edition === 1 && good.signedOn === "2027-03-01" && good.signedBy === "Р. Беловски, ръководител" && good.levels.join() === "1,2,3" && good.note === "Първа редакция");
const bad = (x: Partial<{ edition: unknown; signedOn: unknown; signedBy: unknown; levels: unknown[]; note: unknown }>) => { const r = readCriteriaForm({ edition: "1", signedOn: "2027-03-01", signedBy: "Р. Беловски", levels: ["1"], note: "", ...x }, TODAY); return r.ok ? "ok" : r.problem; };
t("…the edition's number: 1–999, as on the paper", bad({ edition: "" }) === "edition" && bad({ edition: "0" }) === "edition" && bad({ edition: "1000" }) === "edition" && bad({ edition: "2a" }) === "edition" && bad({ edition: "12" }) === "ok");
t("…a day that is not real, or before 2026: refused — the whole value checked (review)", bad({ signedOn: "2027-02-30" }) === "date" && bad({ signedOn: "2025-12-31" }) === "date" && bad({ signedOn: "01.03.2027" }) === "date" && bad({ signedOn: "2027-03-01junk" }) === "date");
t("…signed after today: refused", bad({ signedOn: "2027-03-11" }) === "future" && bad({ signedOn: TODAY }) === "ok");
t("…who signed: 3–200 characters", bad({ signedBy: "Ив" }) === "signed-by" && bad({ signedBy: "x".repeat(201) }) === "signed-by");
t("…the levels: at least one, each 1–5 — an unknown one refuses the form, not silently dropped", bad({ levels: [] }) === "levels" && bad({ levels: ["1", "6"] }) === "levels" && bad({ levels: ["0"] }) === "levels" && bad({ levels: ["1", "1"] }) === "ok");
t("…the note: up to 1000 characters — counted and cut as characters, never inside one (review)", bad({ note: "x".repeat(1001) }) === "note" && bad({ note: "x".repeat(1000) }) === "ok" && (() => { const r = readCriteriaForm({ edition: "1", signedOn: "2027-03-01", signedBy: "Р. Беловски", levels: ["1"], note: "😀".repeat(1000) }, TODAY); return r.ok && Array.from(r.note).length === 1000; })());
t("…who signed is one line: no break, no tab, no invisible or direction-changing character (review)", oneLine("A\nB\tC\u202Eevil\u200B", 200) === "A B C evil" && (() => { const r = readCriteriaForm({ edition: "1", signedOn: "2027-03-01", signedBy: "Р.\nБеловски\u202E", levels: ["1"], note: "" }, TODAY); return r.ok && r.signedBy === "Р. Беловски"; })());

// ── the file ──
const PDF = new Uint8Array(Buffer.from("%PDF-1.4\n% signed criteria\n%%EOF\n"));
t("the file: a real PDF, PNG or JPG by its first bytes; empty, another type, too large, or not what it says — refused",
  fileProblem({ bytes: PDF, mime: "application/pdf" }) === null && fileProblem({ bytes: new Uint8Array(), mime: "application/pdf" }) === "file"
  && fileProblem({ bytes: PDF, mime: "text/html" }) === "type" && fileProblem({ bytes: new Uint8Array(15_000_001).fill(0x25), mime: "application/pdf" }) === "size"
  && fileProblem({ bytes: new Uint8Array(Buffer.from("<html>")), mime: "application/pdf" }) === "not-file"
  && fileProblem({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]), mime: "image/png" }) === null && fileProblem({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 1]), mime: "image/jpeg" }) === null);

// ── in force, by day and by level ──
const ed = (edition: number, signedOn: string, levels: number[], voided = false): CriteriaEdition => ({ id: `e${edition}`, edition, signedOn, signedBy: "X Y", levels: levels as CriteriaEdition["levels"], note: "", filePath: "", fileName: "", fileMime: "application/pdf", fileSize: 1, fileSha256: "0".repeat(64), recordedBy: "q@ptsbg.eu", recordedAt: `${signedOn}T10:00:00Z`, ...(voided ? { voided: { reason: "грешка", by: "h", at: "x" } } : {}) });
const E = [ed(1, "2027-02-01", [1, 2]), ed(2, "2027-03-01", [1, 2, 3]), ed(3, "2027-03-05", [3], true)];
t("in force on a day: the latest signed on or before it, not voided", criteriaInForce(E, "2027-01-31") === null && criteriaInForce(E, "2027-02-15")?.edition === 1 && criteriaInForce(E, "2027-03-06")?.edition === 2);
t("Реш. 134 — a level's test before its criteria were signed: none to judge it against", criteriaFor(E, 3, "2027-02-28") === null && criteriaFor(E, 3, "2027-03-01")?.edition === 2 && criteriaFor(E, 1, "2027-02-01")?.edition === 1);
t("…a level no edition covers: never", criteriaFor(E, 4, "2027-12-31") === null && criteriaFor(E, 5, "2027-12-31") === null);
t("review: an edition is the whole document — a level the edition in force leaves out has NO criteria, never an earlier edition's", criteriaFor([ed(1, "2027-02-01", [1, 2, 3]), ed(2, "2027-03-01", [1, 2])], 3, "2027-03-02") === null && criteriaFor([ed(1, "2027-02-01", [1, 2, 3]), ed(2, "2027-03-01", [1, 2])], 3, "2027-02-20")?.edition === 1);
t("…a voided edition is in force for nobody", criteriaFor(E, 3, "2027-03-06")?.edition === 2);
t("…two signed the same day: the higher number on the paper — for the level's test too (review)", criteriaInForce([ed(4, "2027-04-01", [1]), ed(5, "2027-04-01", [1])], "2027-04-01")?.edition === 5 && criteriaFor([ed(5, "2027-04-01", [1]), ed(4, "2027-04-01", [1, 2])], 2, "2027-04-01") === null);
t("the page's per-level line", levelStatus(E, "2027-03-06").map((x) => x.edition?.edition ?? "-").join() === "2,2,2,-,-");
t("the number suggested: after every one in force on record", nextEdition(E) === 3 && nextEdition([]) === 1);
t("review: the number is the paper's — not one recorded already; the numbers follow the days; the same file not twice; a voided number may be recorded again",
  editionProblem(E, { edition: 2, signedOn: "2027-04-01", fileSha256: "1".repeat(64) }) === "taken" && editionProblem(E, { edition: 3, signedOn: "2027-02-15", fileSha256: "1".repeat(64) }) === "order"
  && editionProblem(E, { edition: 3, signedOn: "2027-03-02", fileSha256: "0".repeat(64) }) === "same-file" && editionProblem(E, { edition: 3, signedOn: "2027-03-05", fileSha256: "1".repeat(64) }) === null);
t("review: the type a file IS, by its bytes — a real PDF sent as octet-stream is still one", sniffMime(PDF) === "application/pdf" && sniffMime(new Uint8Array(Buffer.from("<html>"))) === null);
t("a void: the reason 5–500; not twice; not a missing one", voidProblem(E[0], "грешна дата") === null && voidProblem(E[0], "abc") === "reason" && voidProblem(E[2], "грешна дата") === "already" && voidProblem(null, "грешна дата") === "missing");

// ── the store, in memory ──
const PDF2 = new Uint8Array(Buffer.from("%PDF-1.4\n% edition 2\n%%EOF\n"));
const r1 = await recordCriteria({ edition: 1, signedOn: "2027-03-01", signedBy: "Р. Беловски", levels: [1, 2, 3], note: "", file: { bytes: PDF, mime: "application/pdf", name: "criteria.pdf" }, by: "q@ptsbg.eu" });
const r2 = await recordCriteria({ edition: 2, signedOn: "2027-03-02", signedBy: "Р. Беловски", levels: [4], note: "Ниво 4", file: { bytes: PDF2, mime: "application/pdf", name: "c2.pdf" }, by: "q@ptsbg.eu" });
const all = await listCriteria();
t("recorded: by the paper's numbers; the scan's hash; the newest first", r1.ok && r2.ok && all.map((e) => e.edition).join() === "2,1" && all[1].fileSha256 === createHash("sha256").update(PDF).digest("hex"));
const dup = await recordCriteria({ edition: 3, signedOn: "2027-03-03", signedBy: "Р. Беловски", levels: [1], note: "", file: { bytes: PDF, mime: "application/pdf", name: "again.pdf" }, by: "q@ptsbg.eu" });
t("…the same scan pressed twice: refused, nothing recorded (review)", !dup.ok && dup.error === "same-file" && (await listCriteria()).length === 2);
t("…its file: the same bytes", r1.ok && Buffer.from((await criteriaFile(all[1]))!).equals(Buffer.from(PDF)));
const bf = await recordCriteria({ edition: 5, signedOn: "2027-03-05", signedBy: "Р. Беловски", levels: [1], note: "", file: { bytes: new Uint8Array(Buffer.from("not a pdf")), mime: "application/pdf", name: "x.pdf" }, by: "q@ptsbg.eu" });
t("…a file that is not what it says: nothing recorded", !bf.ok && bf.error === "not-file" && (await listCriteria()).length === 2);
const v = await voidCriteria({ id: all[0].id, reason: "Грешна дата на подписа", by: "head@ptsbg.eu" });
t("a void: on record with the reason; then in force for nobody", v.ok && (await listCriteria())[0].voided?.reason === "Грешна дата на подписа" && criteriaFor(await listCriteria(), 4, "2027-12-31") === null);
const v2 = await voidCriteria({ id: all[0].id, reason: "Грешна дата на подписа", by: "head@ptsbg.eu" });
t("…not voided twice", !v2.ok && v2.error === "already");
const again = await recordCriteria({ edition: 2, signedOn: "2027-03-02", signedBy: "Р. Беловски", levels: [4, 5], note: "Правилният файл", file: { bytes: new Uint8Array(Buffer.from("%PDF-1.4\n% the right one\n%%EOF\n")), mime: "application/pdf", name: "c2b.pdf" }, by: "q@ptsbg.eu" });
t("…the voided number recorded again, with the right paper (review)", again.ok && criteriaFor(await listCriteria(), 5, "2027-03-02")?.id === (again.ok ? again.entry.id : ""));

// ── the wiring ──
t("who records: the head and the quality manager — never the software administrator", RIGHTS.head.includes("validation.record") && RIGHTS.quality.includes("validation.record") && !RIGHTS.software_admin.includes("validation.record") && !RIGHTS.scheme_manager.includes("validation.record"));
const act = readFileSync(new URL("../src/lib/validation-actions.ts", import.meta.url), "utf8");
t("the actions: «use server»; gated by validation.record; the form read, the file read; journalled with the edition, the day, the levels and the hash — never the file", /^"use server";/.test(act) && (act.match(/await requireCapAnywhere\("validation\.record"\);/g) ?? []).length === 2 && /readCriteriaForm\(/.test(act) && /logActivity\("validation\.criteria_recorded"/.test(act) && /logActivity\("validation\.criteria_voided"/.test(act) && !/after: \{[^}]*bytes/.test(act) && /recorded-unlogged/.test(act));
const route = readFileSync(new URL("../src/app/validation/criteria/[id]/route.ts", import.meta.url), "utf8");
t("the file: through a gated route (the section's rule), by its id only, never cached; an unreadable record 503, never «not found» (review); HEAD refused", /await requireSection\("validation"\);/.test(route) && /UUID\.test\(id\)/.test(route) && /status: 503/.test(route) && /"cache-control": "private, no-store"/.test(route) && /export const HEAD = \(\) => new Response\(null, \{ status: 405/.test(route));
t("the action takes the file's type from its bytes (review)", /mime: sniffMime\(bytes\) \?\? f\.type/.test(act));
const page = readFileSync(new URL("../src/app/validation/page.tsx", import.meta.url), "utf8");
t("the page: the section's gate; the form only to who records; per level, in force or «no test can be recorded»", /await requireSection\("validation"\);/.test(page) && /canRecord \? \(/.test(page) && /const canRecord = await mayAnywhereNow\("validation\.record"\);/.test(page) && /data-level-criteria=/.test(page));
const store = readFileSync(new URL("../src/lib/validation-criteria.ts", import.meta.url), "utf8");
t("the bucket: private, refused if made public — a bucket that cannot be read is not taken for none (review); a scan without its record removed, unless the insert went through (review), and a failed removal logged",
  /if \(bucket\?\.public\) throw new Error/.test(store) && /if \(read && !\/not\.\?found\|does not exist\/i\.test\(read\.message\)\) throw read;/.test(store) && /public: false/.test(store) && /const stayed = uploaded && await db\.from\("validation_criteria"\)\.select\("id"\)\.eq\("id", id\)/.test(store) && /a scan without its record could not be removed/.test(store));
const mig = readFileSync(new URL("../supabase/migrations/0045_validation_criteria.sql", import.meta.url), "utf8");
t("migration 0045: listed; append-only (no update, delete or truncate); the paper's number 1–999, not unique (a voided one may be recorded again); the voids apart; records itself", MIGRATIONS.includes("0045_validation_criteria") && /a new edition is a new row, never a change/.test(mig) && /edition integer not null check \(edition between 1 and 999\)/.test(mig) && !/create unique index/.test(mig) && /revoke update, delete, truncate on public\.validation_criteria from service_role/.test(mig) && /create table if not exists public\.validation_criteria_voids/.test(mig) && /insert into public\.app_migrations \(name\) values \('0045_validation_criteria'\)/.test(mig));
t("coverage: not round data — the tables and the bucket named with why", !!NOT_ROUND_TABLES.validation_criteria && !!NOT_ROUND_TABLES.validation_criteria_voids && !!NOT_ROUND_BUCKETS["validation-docs"]);

console.log(`validation-criteria.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
