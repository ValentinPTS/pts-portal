// Plan part 4.7 — retention (Zadanie §10): a profile with no participation is kept until
// its deletion is requested, then erased by hand on record — the entity, its
// laboratories and users anonymised in one step, never changed after; a profile with a
// participation is kept. A rejected registration is kept six years with its reason,
// then removed — the database refuses earlier.
import { readFileSync } from "node:fs";
import { keptUntil, retentionOver, readRejectReason, readEraseRequest, shiftYears } from "../src/lib/retention-model.ts";
import { putEntity, openEntities, eraseEntity } from "../src/lib/entities.ts";
import { putLaboratory, openLaboratories } from "../src/lib/laboratories.ts";
import { putEntityUser, openEntityUsers, linkEntityUserAccount } from "../src/lib/entity-users.ts";
import { putIdentity } from "../src/lib/identity-store.ts";
import { freezeParticipation } from "../src/lib/participation-snapshots.ts";
import { addLabApplication, setLabApplicationReview, removeLabApplication, listLabApplications } from "../src/lib/lab-applications.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const throws = async (f: () => Promise<unknown>, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

// ── the model ──
eq("kept six years from the rejection — a 29 February until the 28th, as Postgres reckons it (review)", [keptUntil("2026-11-06T10:00:00.000Z"), keptUntil("2028-02-29T00:00:00.000Z"), keptUntil(undefined)], ["2032-11-06T10:00:00.000Z", "2034-02-28T00:00:00.000Z", ""]);
eq("…«now − 6 years» as the database's guard: 29 Feb 2032 → 28 Feb 2026", new Date(shiftYears(Date.parse("2032-02-29T09:00:00Z"), -6)).toISOString(), "2026-02-28T09:00:00.000Z");
t("…so JS and the database agree on that day: rejected 28 Feb 2026 10:00 is not over at 29 Feb 2032 09:00", !retentionOver({ status: "rejected", reviewedAt: "2026-02-28T10:00:00Z" }, Date.parse("2032-02-29T09:00:00Z")));
const at = Date.parse("2032-11-06T10:00:00.000Z");
eq("…over only after that, and only for a rejected one", [retentionOver({ status: "rejected", reviewedAt: "2026-11-06T10:00:00.000Z" }, at - 1), retentionOver({ status: "rejected", reviewedAt: "2026-11-06T10:00:00.000Z" }, at + 1), retentionOver({ status: "pending", reviewedAt: "2000-01-01T00:00:00Z" }, at), retentionOver({ status: "rejected" }, at)], [false, true, false, false]);
eq("a rejection's reason: required — three characters at least", [readRejectReason(""), readRejectReason(" не "), readRejectReason("  дублирана заявка  ")], [null, "не", "дублирана заявка"].map((x) => (x === "не" ? null : x)));
eq("an erasure names its request: its incoming number (no spaces — never a name) and its date, not after today (review)", [readEraseRequest("12", "2026-11-06", "2026-11-06T12:00:00Z"), readEraseRequest("ВХ-12/26", "2026-11-01", "2026-11-06"), readEraseRequest("Иван Петров", "2026-11-06", "2026-11-06"), readEraseRequest("12", "2026-11-07", "2026-11-06"), readEraseRequest("12", "", "2026-11-06")], [{ no: "12", date: "2026-11-06" }, { no: "ВХ-12/26", date: "2026-11-01" }, null, null, null]);

// ── the erasure, in memory ──
const E = "e8000000-0000-4000-8000-000000000001", EP = "e8000000-0000-4000-8000-000000000002";
const L = "18000000-0000-4000-8000-000000000001", LP = "18000000-0000-4000-8000-000000000002";
const U = "a8000000-0000-4000-8000-000000000001", U2 = "a8000000-0000-4000-8000-000000000002", UP = "a8000000-0000-4000-8000-000000000003";
await putEntity(E, { name: "Изтрий ООД", country: "BG", eik: "000000086", vat: "BG000000086", correspondenceAddress: "Плевен, ул. 1", officialEmail: "office@iztrii.bg", mol: "Мол Молов", origin: "pdf", state: "pending", proofPath: "proofs/x.pdf", proofHistory: [{ path: "proofs/old.pdf", at: "2026-01-01", by: "h" }, { path: "proofs/x.pdf", at: "2026-02-01", by: "h" }] }, "test");
await putLaboratory(L, { entityId: E, name: "Лаб. Изтрий", deliveryAddress: "Плевен 2", mobileOffice: true, accreditationNo: "9 ЛИ", accreditationBody: "ИА „БСА“", state: "active" }, "test");
await putEntityUser(U, { email: "ivo@iztrii.bg", name: "Иво Иванов", position: "Ръководител", phone: "+359 64 1", role: "admin", twoFactorRequired: false, receivesNotices: true, entityId: E, state: "invited" }, "test");
await putEntityUser(U2, { email: "eva@iztrii.bg", name: "Ева", position: "", phone: "", role: "user", twoFactorRequired: false, receivesNotices: true, entityId: E, state: "invited" }, "test");
await linkEntityUserAccount(U2, "b8000000-0000-4000-8000-000000000009", "test");
await putEntityUser(U2, { email: "eva.new@iztrii.bg" }, "test"); // a changed login leaves its old sign-in behind
await linkEntityUserAccount(U, "b8000000-0000-4000-8000-000000000001", "test");
const { recordPending, settle, listSent } = await import("../src/lib/sent-messages.ts");
const msg = await recordPending({ class: "provider", kind: "invite", entityId: E, to: "ivo@iztrii.bg", subject: "Покана", body: "Здравейте, Иво Иванов" }, { by: "m@ptsbg.eu", ref: "invite:x" });
await settle(msg!, true);
t("an erasure without its request named: refused", await throws(() => eraseEntity(E, { no: "Иван Петров", date: "2026-11-06" }, "head@ptsbg.eu"), /needs the request/));
const r = await eraseEntity(E, { no: "12", date: "2026-11-06" }, "head@ptsbg.eu");
eq("erased on request: every sign-in account it had to delete — a changed login's too (review) — every document, how many", [r.accounts.sort(), r.proofs.sort(), r.laboratories, r.users, r.messages], [["b8000000-0000-4000-8000-000000000001", "b8000000-0000-4000-8000-000000000009"], ["proofs/old.pdf", "proofs/x.pdf"], 1, 2, 1]);
const sentNow = (await listSent(200)).find((m) => m.id === msg);
t("…the messages the portal sent it: their address and words blanked (review)", !!sentNow && sentNow.to === "‹изтрито›" && sentNow.body === "‹изтрито›" && sentNow.subject === "‹изтрито›");
const [e] = await openEntities({ actor: "a", purpose: "write" }, E);
t("…nothing of who it was left: the entity anonymised, inactive, when — and on which request", e.name === "‹изтрито по искане›" && e.country === "XX" && !e.eik.includes("000000086") && !e.vat && !e.officialEmail && !e.mol && e.correspondenceAddress === "—" && !e.proofPath && (e.proofHistory ?? []).length === 0 && e.state === "inactive" && !!e.erasedAt && e.eraseRequestNo === "12" && e.eraseRequestDate === "2026-11-06");
const [l] = await openLaboratories({ actor: "a", purpose: "write" }, { laboratoryId: L });
const us = await openEntityUsers({ actor: "a", purpose: "write" }, { entityId: E });
t("…its laboratories and users anonymised and inactive; no sign-in left; none takes the notices", l.name === "‹изтрита›" && l.deliveryAddress === "—" && !l.accreditationNo && !l.accreditationBody && l.state === "inactive"
  && us.every((u) => u.name === "‹изтрит›" && /^erased-.*@erased\.invalid$/.test(u.email) && !u.phone && !u.position && !u.authUserId && u.state === "inactive" && !u.receivesNotices));
t("…never changed after — the entity, a laboratory, a user; never erased twice", await throws(() => putEntity(E, { name: "Обратно" }, "h"), /erased profile is never changed/) && await throws(() => putLaboratory(L, { name: "Обратно" }, "h"), /erased profile is never changed/) && await throws(() => putEntityUser(U, { name: "Обратно" }, "h"), /erased profile is never changed/) && await throws(() => eraseEntity(E, { no: "13", date: "2026-11-06" }, "h"), /erased already/));
t("…nothing added to it either — no new laboratory, no new user, even inactive (review)", await throws(() => putLaboratory("18000000-0000-4000-8000-0000000000ff", { entityId: E, name: "Нова", deliveryAddress: "А", mobileOffice: false, accreditationNo: "", accreditationBody: "", state: "inactive" }, "h"), /erased profile/) && await throws(() => putEntityUser("a8000000-0000-4000-8000-0000000000ff", { email: "new@iztrii.bg", name: "Нов", position: "", phone: "", role: "user", twoFactorRequired: false, receivesNotices: true, entityId: E, state: "inactive" }, "h"), /erased profile/));
t("…and it says it has no participation; the one with a copy says it has", (await openEntities({ actor: "a", purpose: "write" }, E))[0].hasParticipations === false);
// a profile with a participation is kept
await putEntity(EP, { name: "Участва ООД", country: "BG", eik: "000000094", correspondenceAddress: "Русе", origin: "pdf", state: "pending" }, "test");
await putLaboratory(LP, { entityId: EP, name: "Лаб. Участва", deliveryAddress: "Русе 3", mobileOffice: false, accreditationNo: "", accreditationBody: "", state: "active" }, "test");
await putEntityUser(UP, { email: "uchastva@lab.bg", name: "Участник", position: "", phone: "", role: "admin", twoFactorRequired: false, receivesNotices: true, entityId: EP, state: "invited" }, "test");
const P = "f8000000-0000-4000-8000-000000000001";
await putIdentity(P, "RET-1", { labName: "от PDF" }, "test");
await freezeParticipation(P, LP, undefined, "test");
t("a profile with a participation is kept — not erased", await throws(() => eraseEntity(EP, { no: "14", date: "2026-11-06" }, "h"), /a profile with a participation is kept/) && (await openEntities({ actor: "a", purpose: "write" }, EP))[0].name === "Участва ООД" && (await openEntities({ actor: "a", purpose: "write" }, EP))[0].hasParticipations === true);

// ── rejected registrations: six years ──
const app = await addLabApplication({ email: "rejected@lab.bg", orgName: "Отхвърлена ООД", contactPerson: "Х", phone: "", country: "BG", region: "eu", address: "", eik: "", vat: "", accreditationNo: "", docPaths: ["lab-docs/a.pdf"] } as never);
await setLabApplicationReview(app.id, { status: "rejected", rejectReason: "дублирана заявка", reviewedBy: "m@ptsbg.eu" });
const kept = (await listLabApplications("rejected")).find((a) => a.id === app.id)!;
t("a rejected registration: kept with its reason", kept.rejectReason === "дублирана заявка" && !!kept.reviewedAt);
t("…not removed before its six years", await throws(() => removeLabApplication(app.id), /kept — a rejected one six years/) && (await listLabApplications("rejected")).some((a) => a.id === app.id));
const later = Date.parse(keptUntil(kept.reviewedAt)) + 1000;
eq("…removed after them, with its documents named for removal", await removeLabApplication(app.id, later), ["lab-docs/a.pdf"]);
t("…gone then", !(await listLabApplications("rejected")).some((a) => a.id === app.id));
const pend = await addLabApplication({ email: "pending@lab.bg", orgName: "Чака ООД", contactPerson: "Х", phone: "", country: "BG", region: "eu", address: "", eik: "", vat: "", accreditationNo: "", docPaths: [] } as never);
t("a pending registration is never removed", await throws(() => removeLabApplication(pend.id, later + 10 * 365 * 86_400_000), /kept/));

// ── the migration ──
const sql = readFileSync(new URL("../supabase/migrations/0037_retention.sql", import.meta.url), "utf8");
const er = sql.slice(sql.indexOf("function public.identity_entity_erase("), sql.indexOf("end $$;", sql.indexOf("function public.identity_entity_erase(")));
t("0037: the erasure — its request by number and date (no free text), under a lock, once, refused for a profile with a participation", /p_request_no text, p_request_date date/.test(er) && /\^\[0-9A-Za-zА-Яа-я№\/\.-\]\{1,30\}\$/.test(er) && /p_request_date > current_date/.test(er) && /where e\.id = p_entity for update;/.test(er) && /the profile is erased already/.test(er) && /from identity\.participation_snapshots s where s\.entity_id = p_entity/.test(er) && !/erase_request text/.test(sql));
t("…its users and laboratories first, then the entity; every sign-in it had returned; the messages blanked; recorded with which rows (review)", er.indexOf("update identity.entity_users u set") < er.indexOf("update identity.laboratories l set") && er.indexOf("update identity.laboratories l set") < er.indexOf("update identity.legal_entities e set") && /unnest\(u\.past_auth_user_ids\)/.test(er) && /update public\.sent_messages m set to_address = '‹изтрито›'/.test(er) && /'accounts', to_jsonb\(accounts\), 'proofs', to_jsonb\(proofs\)/.test(er) && /user_ids, laboratory_ids, rows\)/.test(er));
t("…an erased profile never changed after, nothing added to it — the entity, its laboratories, its users (every writer; review)", /before update on identity\.legal_entities/.test(sql) && /before insert or update on identity\.laboratories/.test(sql) && /before insert or update on identity\.entity_users/.test(sql) && /where e\.id = new\.entity_id and e\.erased_at is not null/.test(sql));
t("…a changed login's sign-in kept in mind; a sent message's one change: its anonymisation (review)", /past_auth_user_ids = case when new_email <> old_email and u\.auth_user_id is not null then array_append/.test(sql) && /new\.to_address = '‹изтрито›' and new\.subject = '‹изтрито›' and new\.body = '‹изтрито›'/.test(sql));
t("…the entities opened with the erasure's request and whether one has a participation; only the server key may call", /drop function if exists public\.identity_entities\(text, text, uuid\);/.test(sql) && /erase_request_no text, erase_request_date date,\s*has_participations boolean\)/.test(sql) && (sql.match(/grant execute on function public\.identity_[a-z_]+\([^)]*\) to service_role;/g) ?? []).length === 3);
const m33 = readFileSync(new URL("../supabase/migrations/0033_entity_users.sql", import.meta.url), "utf8");
t("the deferred administrator check runs as its owner — at COMMIT the API role cannot read the identity schema (review)", /create or replace function identity\.entity_users_admin_kept\(\) returns trigger\s*language plpgsql security definer set search_path = ''/.test(m33));
t("…a rejection's reason from now on (earlier rows as they were); removed only six years after, by every writer", /check \(status <> 'rejected' or char_length\(btrim\(coalesce\(reject_reason, ''\)\)\) >= 3\) not valid;/.test(sql) && /old\.reviewed_at < now\(\) - interval '6 years'/.test(sql) && /before delete on public\.lab_applications/.test(sql) && /before truncate on public\.lab_applications/.test(sql) && /'0037_retention'/.test(sql));

// ── the actions and the pages ──
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const sect = actions.slice(actions.indexOf("// ── Retention (plan part 4.7"), actions.indexOf("// ── Applications entered by PTS (plan part 5.1"));
t("the expired rejections: labs.manage; the erasure: the head of the PT provider (review)", (sect.match(/export async function \w+Action/g) ?? []).length === 2 && /removeExpiredRejectionsAction\([^\n]*\{\n\s*await requireCapAnywhere\("labs\.manage"\)/.test(sect) && /eraseEntityAction\([^\n]*\{\n\s*await requirePeopleManager\(\);/.test(sect));
const ea = sect.slice(sect.indexOf("export async function eraseEntityAction"));
t("erasure: its request, its confirmation; the sign-in accounts deleted, the documents removed — what could not be, said and journalled by id; never the request in the journal (review)", /readEraseRequest\(requestNo, requestDate/.test(ea) && /confirmed !== true && confirmed !== "on"/.test(ea) && /db\.auth\.admin\.deleteUser\(a\)/.test(ea) && /if \(!\(await removeProof\(p\)\)\) documentsLeft\.push\(p\)/.test(ea) && /accountsLeft, documentsLeft/.test(ea) && !(ea.match(/logActivity\([^;]*;/g) ?? []).some((c) => /\$\{req\b|\breq\s*[,})]|req\.no|req\.date/.test(c)));
t("a rejection needs its reason", /const reason = readRejectReason\(formData\.get\("reason"\)\);\s*if \(!reason\) return/.test(actions));
t("removing expired rejections: only those over their six years; their documents first, the record only once they are gone (review)", /filter\(\(a\) => retentionOver\(a, Date\.now\(\)\)\)/.test(sect) && sect.indexOf("db.storage.from(DOC_BUCKET).remove(a.docPaths)") < sect.indexOf("await removeLabApplication(a.id)") && /if \(r\.error\) \{ failedDocs\.push/.test(sect));
t("a document's removal says whether it went (Supabase answers in error, not by throwing)", /return !r\.error;/.test(readFileSync(new URL("../src/lib/entity-proofs.ts", import.meta.url), "utf8")));
const org = readFileSync(new URL("../src/app/organizations/page.tsx", import.meta.url), "utf8");
t("«Организации»: an erased profile shows only its request; one with participations says it is kept; the head is offered «Изтриване по искане» (review)", /if \(e\.erasedAt\) return \(/.test(org) && /e\.eraseRequestNo/.test(org) && /data-kept-for-rounds/.test(org) && /managesPeople && <EraseEntityForm lang=\{lg\} entityId=\{e\.id\} \/>/.test(org));
t("«Одобрения на регистрации» (9.1): the refused registrations with their reason and the day each is kept until", /<RejectedRegistrations /.test(readFileSync(new URL("../src/app/registrations/page.tsx", import.meta.url), "utf8")));

console.log(`retention.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
