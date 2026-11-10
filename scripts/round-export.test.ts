// The whole-round export (plan part 1.10, Реш. 136). Done when: the coverage test
// lists every round table and fails on a missing one. Here: every database table
// and every storage bucket is either in the round export or named as not round data;
// every field of a scheme and a participant has its part; each round table's files
// are in the ZIP; and the coded part carries no identity — no name, address, account
// id, file name or certificate number — while the identity part does.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inflateRawSync } from "node:zlib";
import { ROUND_TABLES, NOT_ROUND_TABLES, ROUND_BUCKETS, NOT_ROUND_BUCKETS, SCHEME_FIELDS, PARTICIPANT_FIELDS, buildRoundExport, csv } from "../src/lib/round-export.ts";
import { crc32, zip } from "../src/lib/zip.ts";
import { updateSchemeWith } from "../src/lib/store.ts";
import { addParticipant } from "../src/lib/participants.ts";
import { addLab } from "../src/lib/labs.ts";
import { notify } from "../src/lib/notifications.ts";
import { appendActivity } from "../src/lib/activity-store.ts";
import { addCaseEvent } from "../src/lib/case-events.ts";
import { addRevision } from "../src/lib/doc-revisions.ts";
import { sendToLab } from "../src/lib/sent-messages.ts";
import { putEntity } from "../src/lib/entities.ts";
import { putLaboratory } from "../src/lib/laboratories.ts";
import { putEntityUser } from "../src/lib/entity-users.ts";
import { freezeParticipation } from "../src/lib/participation-snapshots.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// ── coverage: every table, every bucket, every field ────────────────────────
const migDir = here("../supabase/migrations/");
const tables = new Set(readdirSync(migDir).filter((f) => f.endsWith(".sql"))
  .flatMap((f) => [...readFileSync(join(migDir, f), "utf8").matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+(?:\.[a-z_]+)?)/gi)].map((m) => m[1].toLowerCase())));
const placed = new Set([...Object.keys(ROUND_TABLES), ...Object.keys(NOT_ROUND_TABLES)]);
const unplaced = [...tables].filter((x) => !placed.has(x));
t(`every table in the migrations (${tables.size}) is placed: in the round export, or named as not round data`, tables.size >= 18 && unplaced.length === 0, `not placed: ${unplaced.join(", ")}`);
t("…none is both", Object.keys(ROUND_TABLES).every((x) => !(x in NOT_ROUND_TABLES)));
t("…and none placed that does not exist", [...placed].every((x) => tables.has(x)), [...placed].filter((x) => !tables.has(x)).join());
t("…each not-round table says why", Object.values(NOT_ROUND_TABLES).every((why) => why.length > 10));

const srcRoot = here("../src/");
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
walk(srcRoot);
const allSrc = files.map((f) => readFileSync(f, "utf8")).join("\n");
const read = new Set([...allSrc.matchAll(/(?<!storage)\.from\("([a-z_]+)"\)/g)].map((m) => m[1]));
t(`every table the code reads (${read.size}) is a migration's table, and placed`, read.size >= 15 && [...read].every((x) => tables.has(x) && placed.has(x)), [...read].filter((x) => !tables.has(x) || !placed.has(x)).join());
const buckets = new Set([
  ...[...allSrc.matchAll(/_BUCKET = "([a-z-]+)"/g)].map((m) => m[1]),
  ...[...allSrc.matchAll(/storage\.from\("([a-z-]+)"\)/g)].map((m) => m[1]),
  ...[...allSrc.matchAll(/createBucket\("([a-z-]+)"/g)].map((m) => m[1]),
]);
const bucketsPlaced = new Set([...ROUND_BUCKETS, ...Object.keys(NOT_ROUND_BUCKETS)]);
t(`every storage bucket (${buckets.size}) is placed`, buckets.size >= 4 && [...buckets].every((b) => bucketsPlaced.has(b)), [...buckets].filter((b) => !bucketsPlaced.has(b)).join());

const types = readFileSync(here("../src/lib/types.ts"), "utf8");
const fieldsOf = (name: string) => {
  const body = types.slice(types.indexOf(`export interface ${name} {`), types.indexOf("\n}", types.indexOf(`export interface ${name} {`)));
  return [...body.matchAll(/^ {2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]);
};
// since 2.3 a participant is its coded part and its identity (types.ts)
const sf = fieldsOf("Scheme"), pf = [...fieldsOf("CodedParticipant"), ...fieldsOf("ParticipantIdentity")];
t(`every field of a scheme (${sf.length}) has its part`, sf.length > 40 && sf.every((f) => f in SCHEME_FIELDS), sf.filter((f) => !(f in SCHEME_FIELDS)).join());
t(`every field of a participant (${pf.length}) has its part`, pf.length > 10 && pf.every((f) => f in PARTICIPANT_FIELDS), pf.filter((f) => !(f in PARTICIPANT_FIELDS)).join());
t("a certificate's number and the scheme's applications are identity", SCHEME_FIELDS.certificates === "identity" && SCHEME_FIELDS.applications === "identity");
t("a laboratory's name, address, account and country are identity", (["labName", "email", "phone", "contact", "deliveryAddress", "labId", "country"] as const).every((k) => PARTICIPANT_FIELDS[k] === "identity"));

// ── the ZIP itself ──────────────────────────────────────────────────────────
function unzip(buf: Uint8Array): Map<string, Buffer> {
  const b = Buffer.from(buf);
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = b.readUInt16LE(end + 10), cdOff = b.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0, p = cdOff; i < n; i++) {
    const method = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16), size = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28), local = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lNameLen = b.readUInt16LE(local + 26), lExtra = b.readUInt16LE(local + 28);
    const data = b.subarray(local + 30 + lNameLen + lExtra, local + 30 + lNameLen + lExtra + size);
    const raw = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    if (crc32(raw) !== crc) throw new Error(`bad CRC: ${name}`);
    out.set(name, raw);
    p += 46 + nameLen + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return out;
}
const z = unzip(zip([{ name: "a/б.txt", data: "здравей ".repeat(50) }, { name: "b.bin", data: new Uint8Array([1, 2, 3]) }]));
t("the ZIP: UTF-8 names, deflated and stored entries, the CRCs right", z.get("a/б.txt")?.toString("utf8") === "здравей ".repeat(50) && z.get("b.bin")?.length === 3);
let refused = false; try { zip([{ name: "../x", data: "" }]); } catch { refused = true; }
t("…a path out of the archive is refused", refused);
t("CSV: quotes, commas, new lines, a BOM for Excel", csv(["a", "b"], [{ a: 'x,"y"', b: "1\n2" }]) === '﻿a,b\r\n"x,""y""","1\n2"\r\n');

// ── a round, then its export ────────────────────────────────────────────────
const S = "26-01-T-1";
const SECRET = { name: "Секретна Лаб ЕООД", email: "secret@lab-export.bg", phone: "+359 88 111 2233", cert: "752-T-98765", file: "Протокол-Секретна.pdf" };
const lab = await addLab({ email: SECRET.email, name: SECRET.name });
const p = await addParticipant({ schemeId: S, labName: SECRET.name, email: SECRET.email, phone: SECRET.phone, country: "BG", labId: lab.id }, "test");
const pdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.4 protocol").toString("base64")}`;
await updateSchemeWith(S, (cur) => ({
  certificates: { ...(cur.certificates ?? {}), [p.code]: { no: SECRET.cert, date: "2027-10-01" } },
  applications: [...(cur.applications ?? []), { id: "app-x", schemeId: S, submittedAt: "2026-11-01T10:00:00Z", labName: SECRET.name, accreditationCert: "", manager: "", contactPerson: "", email: SECRET.email, phone: SECRET.phone, companyName: SECRET.name, registeredAddress: "", eik: "", vat: "", mol: "", deliveryAddress: "", postalCode: "", selections: {}, status: "pending" } as never],
  labUploads: { ...(cur.labUploads ?? {}), [p.code]: { protocol: { path: pdf, name: SECRET.file, mime: "application/pdf", size: 17, uploadedAt: "2026-11-02T10:00:00Z", uploadedBy: `lab:${lab.id}` } } },
  scoring: { assigned: { "0": { xpt: 10, sigma: 1, u: 0.1 } }, results: { [p.code]: { "0": { value: 10.2, u: 0.2 } } } },
}));
await notify({ kind: "docs.sent", audience: "lab", labId: lab.id, schemeId: S, code: p.code, bg: "Документите са изпратени.", en: "The documents are sent." });
// the paths an identity could still walk through: an old certificate stamp and journal
// line with the number, an old lab-upload stamp with the lab's e-mail and file name, a
// chain note, a document body naming the lab, a formula in a public form's field
await addCaseEvent({ schemeId: S, code: p.code, kind: "report_issued", source: "auto", ref: SECRET.cert });
await addCaseEvent({ schemeId: S, code: p.code, kind: "results_received", source: "auto", ref: SECRET.file, recordedBy: SECRET.email });
await appendActivity({ action: "certificate.issued", actorEmail: "m@ptsbg.eu", actorRole: "manager", schemeId: S, targetCode: p.code, summary: `Certificate ${SECRET.cert} recorded for ${p.code}` });
const CU5 = "a6000000-0000-4000-8000-0000000000f5"; // an entity user's account id (5.12): identity only
await updateSchemeWith(S, (cur) => ({
  chain: { stops: [{ id: "a", kind: "lab", code: p.code, receivedAt: "2026-11-02T09:00:00Z", received: { by: "pts", recordedAt: "2026-11-02T09:00:00Z", source: "phone", note: `обадиха се от ${SECRET.name}` } }] } as never,
  docs: { ...(cur.docs ?? {}), plan: { bg: `<p>Благодарим на ${SECRET.name}.</p>`, en: "<p>Thanks.</p>" } },
  applications: [...(cur.applications ?? []), { id: "app-f", schemeId: S, submittedAt: "2026-11-01T11:00:00Z", labName: "=HYPERLINK(\"http://x\")", accreditationCert: "", manager: "", contactPerson: "", email: "f@lab-export.bg", phone: "", companyName: "@SUM(1)", registeredAddress: "", eik: "", vat: "", mol: "", deliveryAddress: "", postalCode: "", selections: {}, status: "pending" } as never],
  uploads: { ...(cur.uploads ?? {}), instruction: { path: "missing/not-in-storage.pdf", name: "instr.pdf", mime: "application/pdf", size: 5, uploadedAt: "2026-11-01T08:00:00Z", uploadedBy: "m@ptsbg.eu" } },
  // Phase 5's records (5.12): a receipt with its receiver and remarks, a problem's words, a message's
  // text, an acknowledgement's account — none of which the coded part may carry
  deliveries: { [p.id]: { shipments: [{ id: "sh-x", kind: "dispatch", at: "2026-11-03T08:00:00Z", by: "m@ptsbg.eu", day: "2026-11-03", waybill: "WB-77", carrier: "КУРИЕР-ТАЙНА", docs: [] }], receipts: [{ id: "rc-x", shipmentId: "sh-x", at: "2026-11-04T08:00:00Z", by: `entityuser:${CU5}`, day: "2026-11-04", time: "10:00", checks: {}, undamaged: true, suitable: true, remarks: `ЗАБЕЛЕЖКА-ТАЙНА от ${SECRET.name}`, receivedBy: SECRET.name }], problems: [{ id: "pr-x", at: "2026-11-04T09:00:00Z", by: `entityuser:${CU5}`, text: "ДУМИ-НА-СИГНАЛ-ТАЙНА" }] } } as never,
  acknowledgements: [{ id: "ak-x", participantId: p.id, docKey: "declaration", kind: "declaration", editionId: "e-x", editionNo: 1, sha: "feedface", lang: "bg", at: "2026-11-04T10:00:00Z", by: `entityuser:${CU5}` }] as never,
  messages: [{ id: "ms-x", nonce: "n-x", at: "2026-11-05T10:00:00Z", by: "m@ptsbg.eu", to: { kind: "participation", participantId: p.id }, bg: "ТЕКСТ-НА-СЪОБЩЕНИЕ-ТАЙНА", en: "MESSAGE-TEXT-SECRET" }] as never,
}));
await addRevision({ schemeId: S, docKey: "plan", bg: `<p>${SECRET.name} — ${SECRET.email}</p>`, en: "<p>x</p>", savedBy: "m@ptsbg.eu" });
await appendActivity({ action: "names.viewed", actorEmail: "m@ptsbg.eu", actorRole: "manager", actorName: "М", schemeId: S, summary: `Laboratory names shown — ${SECRET.email}` });
await addCaseEvent({ schemeId: S, code: p.code, kind: "other", source: "manual", note: "по телефона" });
// the participation's frozen copy (4.5): its entity, laboratory and contact — and their
// names written into free text, which the coded part must not carry (4.5 review)
const COPY = { entity: "Копирано Юрлице ООД", eik: "000000051", lab: "Копирана Лаборатория", address: "Русе, ул. Копие 9", contact: "Петя Контактова", mol: "Мол Молов", office: "office@kopirano.bg" };
const CE = "e6000000-0000-4000-8000-000000000001", CL = "16000000-0000-4000-8000-000000000001", CU = "a6000000-0000-4000-8000-000000000001";
await putEntity(CE, { name: COPY.entity, country: "BG", eik: COPY.eik, correspondenceAddress: "Русе", officialEmail: COPY.office, mol: COPY.mol, origin: "pdf", state: "pending" }, "test");
await putLaboratory(CL, { entityId: CE, name: COPY.lab, deliveryAddress: COPY.address, mobileOffice: false, accreditationNo: "", state: "active" }, "test");
await putEntityUser(CU, { email: "petya@kopirano.bg", name: COPY.contact, position: "", phone: "", role: "admin", twoFactorRequired: false, entityId: CE, state: "invited" }, "test");
await freezeParticipation(p.id, CL, CU, "test");
// the entity's other laboratory and a user who is not the contact; renamed after the
// copy; VIES's name for it (4.8 review: the round's parties as they are today, scrubbed too)
const MORE = { lab2: "Втора Копирана Лаборатория", addr2: "Видин, ул. Друга 4", user2: "Борислав Некотактов", mail2: "borislav@kopirano.bg", renamed: "Преименувано Юрлице АД", vies: "KOPIRANO YURLITSE OOD" };
await putLaboratory("16000000-0000-4000-8000-000000000002", { entityId: CE, name: MORE.lab2, deliveryAddress: MORE.addr2, mobileOffice: false, accreditationNo: "", accreditationBody: "", state: "active" }, "test");
await putEntityUser("a6000000-0000-4000-8000-000000000002", { email: MORE.mail2, name: MORE.user2, position: "", phone: "", role: "user", twoFactorRequired: false, entityId: CE, state: "invited" }, "test");
await putEntity(CE, { name: MORE.renamed, vies: { status: "valid", checkedAt: "2026-11-01", name: MORE.vies, vat: "BG000000051", country: "BG" } }, "test");
await addCaseEvent({ schemeId: S, code: p.code, kind: "other", source: "manual", note: `говорих с ${COPY.contact} от ${COPY.entity} (${COPY.lab}, ${COPY.address}; МОЛ ${COPY.mol})` });
await addCaseEvent({ schemeId: S, code: p.code, kind: "other", source: "manual", note: `и с ${MORE.user2} от ${MORE.renamed} / ${MORE.vies}: ${MORE.lab2}, ${MORE.addr2}; Русенския склад; 1234 обекта` });
await addRevision({ schemeId: S, docKey: "plan", bg: "<p>план</p>", en: "<p>plan</p>", savedBy: "m@ptsbg.eu" });
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
Object.assign(process.env, { MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "portal@ptsbg.eu" });
await sendToLab({ class: "provider", kind: "docs.sent", labId: lab.id, schemeId: S, code: p.code, to: SECRET.email, subject: "s", body: "Документите са изпратени." }, { by: "m@ptsbg.eu", ref: "notice:x" });
globalThis.fetch = realFetch;
for (const k of ["MAIL_PROVIDER", "MAIL_API_KEY", "MAIL_FROM"]) delete process.env[k];

// a calibration form submitted (6.2/6.4): the laboratory's name as typed, and again inside its method
const TYPED_LAB = "Типирана Лабораторийка ТАЙНА", TYPED_PERSON = "Пенка Попълващова";
(globalThis as unknown as { __ptsSubmissionsMem?: unknown[] }).__ptsSubmissionsMem?.push({ id: "sub-x", participantId: p.id, schemeId: S, version: 1, submittedAt: "2026-11-06T10:00:00Z", submittedBy: `entityuser:${CU5}`, data: { v: 1, kind: "C", general: { labName: TYPED_LAB, signedBy: TYPED_PERSON, method: `пряко сравнение в ${TYPED_LAB}`, manufacturer: "Tecsis" }, points: {} } });
const all = (await buildRoundExport(S, "all"))!;
const zAll = unzip(all.zip);
t("the export is made", !!all && zAll.size === all.files.length && zAll.has("README.md"), String(all?.files.length));
const listed = Object.values(ROUND_TABLES).flat();
t("each round table's files are in the ZIP", listed.every((f) => zAll.has(f)), listed.filter((f) => !zAll.has(f)).join());
const coded = [...zAll].filter(([n]) => n.startsWith("coded/"));
const leaks = coded.filter(([, b]) => [SECRET.name, SECRET.email, SECRET.phone, SECRET.cert, SECRET.file, lab.id].some((x) => b.toString("utf8").includes(x))).map(([n]) => n);
t("the coded part: no laboratory name, address, phone, account id, file name or certificate number", leaks.length === 0, leaks.join());
const copyLeaks = coded.filter(([, b]) => Object.values(COPY).some((x) => b.toString("utf8").includes(x))).map(([n]) => n);
t("…nor anything of a participation's frozen copy — its entity, laboratory, address, МОЛ, official e-mail, contact (4.5 review)", copyLeaks.length === 0, copyLeaks.join());
t("…but it has the results by code", (zAll.get("coded/results.csv")?.toString("utf8") ?? "").includes(`${p.code},0,10.2,0.2`));
// the round's tables (5.12) through the real path — the scrubber and the columns included
const rt = (f: string) => zAll.get(`coded/${f}.csv`)?.toString("utf8") ?? "";
t("the round's tables (5.12): a row each, by the code — the shipment, the receipt, the problem, the acknowledgement, the message, the chain stop", rt("shipments").includes(`${p.code},sh-x,dispatch`) && rt("receipts").includes(`${p.code},rc-x,shipment,sh-x`) && rt("delivery_problems").includes(`${p.code},pr-x`) && rt("acknowledgements").includes(`${p.code},declaration,declaration,1,feedface`) && rt("scheme_messages").includes(`ms-x`) && rt("scheme_messages").includes(p.code) && rt("chain_stops").includes(`1,a,lab,${p.code}`));
const roundLeaks = coded.filter(([, b]) => ["КУРИЕР-ТАЙНА", "ЗАБЕЛЕЖКА-ТАЙНА", "ДУМИ-НА-СИГНАЛ-ТАЙНА", "ТЕКСТ-НА-СЪОБЩЕНИЕ-ТАЙНА", "MESSAGE-TEXT-SECRET", CU5].some((x) => b.toString("utf8").includes(x))).map(([n]) => n);
t("…and nothing of what they leave out reaches ANY coded file: the carrier, the remarks, a problem's words, a message's text, the account", roundLeaks.length === 0, roundLeaks.join());
const identityScheme5 = zAll.get("identity/scheme-identity.json")?.toString("utf8") ?? "";
const subsCsv = zAll.get("coded/submissions.csv")?.toString("utf8") ?? "", subsBy = zAll.get("identity/submissions_by.csv")?.toString("utf8") ?? "";
t("submissions (6.2): the coded part — by code, the data without the typed laboratory and person, even inside its method (scrubbed)", subsCsv.includes(p.code) && subsCsv.includes("Tecsis") && !coded.some(([, b]) => b.toString("utf8").includes(TYPED_LAB) || b.toString("utf8").includes(TYPED_PERSON)));
t("…the identity part names them, with who submitted", subsBy.includes(TYPED_LAB) && subsBy.includes(TYPED_PERSON) && subsBy.includes(CU5));
t("…the identity part keeps them whole", identityScheme5.includes("ТЕКСТ-НА-СЪОБЩЕНИЕ-ТАЙНА") && identityScheme5.includes("ДУМИ-НА-СИГНАЛ-ТАЙНА") && identityScheme5.includes("КУРИЕР-ТАЙНА"));
t("…the code itself", (zAll.get("coded/codes.csv")?.toString("utf8") ?? "").includes(p.code));
t("…and the message's words, without its address", /Документите са изпратени/.test(zAll.get("coded/messages.csv")?.toString("utf8") ?? ""));
const id = (f: string) => zAll.get(f)?.toString("utf8") ?? "";
t("the identity part: who is behind the code", id("identity/participants.csv").includes(COPY.lab) && id("identity/participants.csv").includes(p.code));
t("the round's legal entities, laboratories and users as they are today, in identity/ (4.8) — never a sign-in account's id",
  id("identity/entities.csv").includes(MORE.renamed) && id("identity/entities.csv").includes(COPY.office) && id("identity/laboratories.csv").includes(COPY.lab) && id("identity/laboratories.csv").includes(COPY.address)
  && id("identity/entity_users.csv").includes(COPY.contact) && id("identity/entity_users.csv").includes("petya@kopirano.bg") && !/authUserId/.test(id("identity/entity_users.csv")));
t("…nothing of them in coded/ (4.8)", !coded.some(([, b]) => ["petya@kopirano.bg", CE, CL, CU].some((x) => b.toString("utf8").includes(x))));
t("…nor of the round's parties as they are today — another laboratory, a user not the contact, the new name, VIES's name (4.8 review)", !coded.some(([, b]) => Object.values(MORE).some((x) => b.toString("utf8").includes(x))));
t("…while a word that merely begins like a value, and a short number, stay (whole words only; review)", /Русенския склад/.test(zAll.get("coded/case_events.csv")?.toString("utf8") ?? "") && /1234 обекта/.test(zAll.get("coded/case_events.csv")?.toString("utf8") ?? ""));
const ent = id("identity/entities.csv").split("\r\n")[0].replace(/^\uFEFF/, "");
t("identity/entities.csv: exactly its columns — no stored document, no check note, no erasure request, no VIES name", ent === "id,name,country,eik,vat,correspondenceAddress,officialEmail,mol,language,state,origin,confirmedAt,erasedAt,viesStatus,manualCheckAt", ent);
t("…every laboratory and user of the round's entities, as they are today", id("identity/laboratories.csv").includes(MORE.lab2) && id("identity/entity_users.csv").includes(MORE.user2) && id("identity/entities.csv").includes(MORE.renamed));
t("README: how many values the scrubber hid", /Заменени: [1-9]\d*\. /.test(id("README.md")));
t("the messages' entity in identity/, not in coded/ (4.8 review)", id("identity/message_recipients.csv").replace(/^\uFEFF/, "").startsWith("id,code,labId,entityId,to,error") && !/entityId/.test(zAll.get("coded/messages.csv")?.toString("utf8").split("\r\n")[0] ?? ""), `${id("identity/message_recipients.csv").slice(0, 60)} | ${(zAll.get("coded/messages.csv")?.toString("utf8") ?? "").slice(0, 120)}`);
t("…and the participation's copy, every field it froze (4.5)", [COPY.entity, COPY.eik, COPY.lab, COPY.address, COPY.mol, COPY.office, CU, p.code].every((x) => id("identity/participation_snapshots.csv").includes(x)) && /entityState,entityOrigin/.test(id("identity/participation_snapshots.csv")));
t("…the certificate's number", id("identity/certificates.csv").includes(SECRET.cert));
t("…the message's recipient", id("identity/message_recipients.csv").includes(SECRET.email));
t("…the laboratory's own file, with its name", zAll.has(`identity/files/lab-uploads/${p.code}-protocol.pdf`) && id("identity/lab_files.csv").includes(SECRET.file));
t("…and the full journal", id("identity/journal_full.csv").includes(SECRET.email));
t("…old stamps and lines: no certificate number, e-mail or file name in coded/", !["coded/case_events.csv", "coded/journal.csv"].some((f) => [SECRET.cert, SECRET.email, SECRET.file].some((x) => (zAll.get(f)?.toString("utf8") ?? "").includes(x))));
t("…a free-text note or a document naming the lab: scrubbed", /‹скрито · hidden›/.test(zAll.get("coded/scheme.json")?.toString("utf8") ?? "") && !(zAll.get("coded/scheme.json")?.toString("utf8") ?? "").includes(SECRET.name));
t("…the full case file and journal stay in identity/", id("identity/case_events_full.csv").includes(SECRET.cert) && id("identity/journal_full.csv").includes(SECRET.cert));
t("a formula from a public form is text in the CSV", /'=HYPERLINK/.test(id("identity/applications.csv")) && /'@SUM/.test(id("identity/applications.csv")));
t("…and a negative result stays a number", csv(["v"], [{ v: -1.67 }, { v: "-2.5" }]).includes("-1.67") && !csv(["v"], [{ v: "-2.5" }]).includes("'-2.5"));
t("every document as a printable page: coded without names, the lists and the certificate named in identity/",
  zAll.has("coded/files/documents/plan-bg.html") && zAll.has("identity/files/documents/results-coded-bg.html") && id("identity/files/documents/results-coded-bg.html").includes(COPY.lab) /* the frozen name — what its documents say (4.5) */
  && zAll.has(`identity/files/documents/certificate-${p.code}-bg.html`) && ![...zAll.keys()].some((n) => n.startsWith("coded/files/documents/results-coded") || n.startsWith("coded/files/documents/certificate")));
t("revision texts are files, not CSV cells", [...zAll.keys()].some((n) => /files\/revisions\/plan-v\d+-bg\.html$/.test(n)) && !(zAll.get("coded/doc_revisions.csv")?.toString("utf8") ?? "").includes("<p>"));
t("the laboratories' accounts (invoice data) are in identity/", id("identity/labs.csv").includes(SECRET.email));
t("a file recorded but not in storage: listed missing, the export says INCOMPLETE", all.missing.some((m) => m.includes("uploads/instruction")) && /НЕПЪЛЕН/.test(id("README.md")));
t("README: the format and both parts", /pts-round-export\/1/.test(id("README.md")) && /coded\//.test(id("README.md")) && /identity\//.test(id("README.md")));

const onlyCoded = (await buildRoundExport(S, "coded"))!;
const zc = unzip(onlyCoded.zip);
t("the coded part alone: no identity/ at all", [...zc.keys()].every((n) => n === "README.md" || n.startsWith("coded/")) && zc.has("coded/results.csv"));
t("…and no identity anywhere in it", ![...zc.values()].some((b) => [SECRET.name, SECRET.email, SECRET.cert].some((x) => b.toString("utf8").includes(x))));
t("an unknown scheme: no export", (await buildRoundExport("no-such-scheme", "all")) === null);
await updateSchemeWith(S, () => ({ archivedAt: "2026-11-02T12:00:00Z", archivedBy: "m@ptsbg.eu" }));
t("an archived round can still be exported (an archive is kept to be read)", !!(await buildRoundExport(S, "coded")));

// a real unzip opens it too
const dir = mkdtempSync(join(tmpdir(), "round-export-"));
writeFileSync(join(dir, "r.zip"), all.zip);
const ut = await promisify(execFile)("unzip", ["-t", join(dir, "r.zip")]).then((r) => r.stdout, (e) => ((e as { code?: string }).code === "ENOENT" ? "ENOENT" : String((e as { stdout?: string }).stdout ?? e)));
// a build machine without `unzip` (Vercel's image): said, not passed in silence —
// the reader above has already checked every entry's CRC
if (ut === "ENOENT") console.log("note: `unzip` is not installed here — that one check is skipped");
else t("`unzip -t` finds no errors", /No errors detected/.test(ut), ut.slice(-200));

// ── who may export, and the journal ─────────────────────────────────────────
const route = readFileSync(here("../src/app/schemes/[id]/export/route.ts"), "utf8");
t("only who sees names in THIS scheme exports — the scheme manager and the coding expert (2.4)", /export async function GET[\s\S]{0,200}const \{ id \} = await ctx\.params;\s*await requireCap\("names\.view", id\);/.test(route));
t("an unknown ?part is refused, never both parts", /if \(raw !== null && raw !== "all" && raw !== "coded"\) return new Response\([^)]*\{ status: 400 \}\)/.test(route));
t("no export goes out whose journal line was not written", /if \(!logged\) return new Response\([^)]*\{ status: 503 \}\)/.test(route));
t("on a deployment: a private bucket and a five-minute signed link (a function answers at most 4.5 MB)", /createSignedUrl\(path, 300/.test(route) && /createBucket\(EXPORT_BUCKET, \{ public: false \}\)/.test(route));
const ce = readFileSync(join(srcRoot, "lib/actions.ts"), "utf8");
t("a certificate's number never beside its code in the journal or the case file", !/logActivity\("certificate\.(issued|updated)"[^\n]*\$\{out\.no\}/.test(ce) && /kind: "report_issued", at: day, ref: "certificate"/.test(ce));
t("every export is journalled; the whole one as an opening of the code link", /logActivity\("round\.exported"/.test(route) && /\(want === "coded" \|\| await logActivity\("names\.viewed"/.test(route));
t("…the round's parties too: one reading, thrown on a database error, never memory (4.8 review)", (() => { const f = readFileSync(join(srcRoot, "lib/participation-snapshots.ts"), "utf8"); const fn = f.slice(f.indexOf("export async function openRoundParties")); const body = fn.slice(0, fn.indexOf("\n}\n")); return /if \(error\) throw error;/.test(body) && !/catch/.test(body); })());
t("an export is whole or not made: the whole-round readers throw, never fall back",
  ["lib/notifications.ts", "lib/sent-messages.ts", "lib/activity-store.ts", "lib/doc-revisions.ts", "lib/case-events.ts"].every((f) => {
    const s = readFileSync(join(srcRoot, f), "utf8");
    const fn = s.slice(s.search(/export async function list(NoticesForScheme|SentForScheme|ActivityForScheme|RevisionsForScheme|CaseEventsForScheme)/));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    return /if \(error\) throw error;/.test(body) && !/catch/.test(body);
  }));

console.log(`round-export.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
