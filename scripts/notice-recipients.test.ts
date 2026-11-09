// Plan part 4.6 — notices per person (N28), the laboratory switcher, and X1: a notice
// read by one person is no longer «read» for everyone; a laboratory's notice goes to
// each of its entity's active users who receive the notices (by the frozen copy in
// force, 4.5), never twice to one; a participant's user sees all its entity's
// laboratories and, for the one chosen, its participations and their notices; the
// accreditation body travels with the laboratory and its copy.
import { readFileSync } from "node:fs";
import { notify, decideNotice, readsFor, withReadState, markRead, readerKey, listForParticipations } from "../src/lib/notifications.ts";
import { putEntity } from "../src/lib/entities.ts";
import { putLaboratory } from "../src/lib/laboratories.ts";
import { putEntityUser, linkEntityUserAccount, acceptEntityUserInvitation, openEntityUsers } from "../src/lib/entity-users.ts";
import { addParticipant } from "../src/lib/participants.ts";
import { freezeParticipation, noticeRecipients, participationsOfEntity, openParticipationSnapshots, inForce } from "../src/lib/participation-snapshots.ts";
import { readLaboratory } from "../src/lib/laboratories-model.ts";
import { readEntityUser } from "../src/lib/entity-users-model.ts";
import { memOpenings } from "../src/lib/identity-store.ts";
import { sentAddresses } from "../src/lib/sent-messages.ts";
import { NOT_ROUND_TABLES } from "../src/lib/round-export.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── read state, per person (N28) ──
const prov = await notify({ kind: "application.received", audience: "provider", bg: "Нова заявка", en: "A new application" });
const A = readerKey.staff("Anna@ptsbg.eu"), B = readerKey.staff("boris@ptsbg.eu");
eq("a reader is named by role and id — never a name", [A, readerKey.labAccount("acc-1"), readerKey.participant("u-1")], ["staff:anna@ptsbg.eu", "lab-account:acc-1", "entityuser:u-1"]);
await markRead(A, [prov.id]);
await markRead(A, [prov.id]);
const [ra, rb] = [await withReadState([prov], A), await withReadState([prov], B)];
t("one person reads a notice — read for them, still unread for another (N28)", !!ra[0].readAt && !rb[0].readAt);
t("…set once: read again changes nothing", (await readsFor(A, [prov.id])).size === 1);

// ── a participation's people ──
const S = "26-03-T-1";
const E = "e7000000-0000-4000-8000-000000000001", L = "17000000-0000-4000-8000-000000000001", L2 = "17000000-0000-4000-8000-000000000002";
const UA = "a7000000-0000-4000-8000-000000000001", UB = "a7000000-0000-4000-8000-000000000002", UC = "a7000000-0000-4000-8000-000000000003";
await putEntity(E, { name: "Известия ООД", country: "BG", eik: "000000060", correspondenceAddress: "София", officialEmail: "office@izv.bg", origin: "pdf", state: "pending" }, "test");
await putLaboratory(L, { entityId: E, name: "Лаб. А", deliveryAddress: "Пловдив", mobileOffice: false, accreditationNo: "11 ЛИ", accreditationBody: "ИА „БСА“", state: "active" }, "test");
await putLaboratory(L2, { entityId: E, name: "Лаб. Б", deliveryAddress: "Варна", mobileOffice: false, accreditationNo: "", accreditationBody: "", state: "active" }, "test");
await putEntityUser(UA, { email: "ana@izv.bg", name: "Ана", position: "", phone: "", role: "admin", twoFactorRequired: false, receivesNotices: true, entityId: E, state: "invited" }, "test");
await putEntityUser(UB, { email: "boyan@izv.bg", name: "Боян", position: "", phone: "", role: "user", twoFactorRequired: false, receivesNotices: false, entityId: E, state: "invited" }, "test");
await putEntityUser(UC, { email: "cveta@izv.bg", name: "Цвета", position: "", phone: "", role: "user", twoFactorRequired: false, receivesNotices: true, entityId: E, state: "invited" }, "test");
for (const [u, a] of [[UA, "b7000000-0000-4000-8000-000000000001"], [UB, "b7000000-0000-4000-8000-000000000002"]]) { await linkEntityUserAccount(u, a, "test"); await acceptEntityUserInvitation(a, "test"); }
const p1 = await addParticipant({ schemeId: S, labName: "от PDF", email: "old@izv.bg" }, "test");
const p2 = await addParticipant({ schemeId: S, labName: "от PDF 2" }, "test");
eq("no copy yet: no copy, no people — the earlier laboratory account's address then", await noticeRecipients(S, p1.code, "system:notify"), { hasCopy: false, people: [] });
await freezeParticipation(p1.id, L, UA, "test");
await freezeParticipation(p2.id, L2, undefined, "test");
eq("a participation's people: its entity's ACTIVE users who receive the notices — not one who opted out, not one still invited", (await noticeRecipients(S, p1.code, "system:notify")).people.map((r) => [r.email, r.entityId]), [["ana@izv.bg", E]]);
t("…on record, purpose «send», which users", memOpenings().some((o) => o.purpose === "send" && o.actor === "system:notify" && o.entityId === E && o.userIds?.length === 1 && o.userIds[0] === UA));
await putEntityUser(UB, { receivesNotices: true }, "test");
eq("…each person says so for themself: one more recipient", (await noticeRecipients(S, p1.code, "system:notify")).people.map((r) => r.email), ["ana@izv.bg", "boyan@izv.bg"]);

// ── the laboratory switcher ──
const own = await participationsOfEntity(E, `participant:${UA}`);
eq("a user's own participations: every laboratory of its entity (К5), by the copies in force", own.map((p) => [p.code, p.laboratoryId]).sort(), [[p1.code, L], [p2.code, L2]].sort());
t("…the laboratory's own opening, on record", memOpenings().some((o) => o.purpose === "lab.own" && o.actor === `participant:${UA}` && o.participantIds?.length === 2));
const nA = await notify({ kind: "docs.sent", audience: "lab", schemeId: S, code: p1.code, bg: "Документите са изпратени.", en: "Documents sent." });
const nB = await notify({ kind: "docs.sent", audience: "lab", schemeId: S, code: p2.code, bg: "За лаб. Б", en: "For lab B" });
const nHeld = await notify({ kind: "docs.sent", audience: "lab", schemeId: S, code: p1.code, bg: "Задържано", en: "Held" });
await decideNotice(nA.id, "release", "m@ptsbg.eu");
await decideNotice(nB.id, "release", "m@ptsbg.eu");
eq("a laboratory's feed: the released notices of ITS participations only — never a held one", (await listForParticipations(own.filter((p) => p.laboratoryId === L))).map((n) => n.id), [nA.id]);
t("…the held one stays held", !(await listForParticipations(own)).some((n) => n.id === nHeld.id));
await markRead(readerKey.participant(UA), [nA.id]);
t("…read by one of its people — still unread for a colleague (N28)", !!(await withReadState([nA], readerKey.participant(UA)))[0].readAt && !(await withReadState([nA], readerKey.participant(UB)))[0].readAt);

// a notice is raised for a participation linked by its copy — no earlier account needed (review of the gap)
const { notifyDocsSent } = await import("../src/lib/notify-events.ts");
const p3 = await addParticipant({ schemeId: S, labName: "без копие" }, "test");
const { listNoticesForScheme } = await import("../src/lib/notifications.ts");
const before = (await listNoticesForScheme(S)).length;
await notifyDocsSent(undefined, S, S, p1.code, "Инструкция", "Instruction");
await notifyDocsSent(undefined, S, S, p3.code, "Инструкция", "Instruction");
const raised = (await listNoticesForScheme(S)).slice(before);
t("a notice for a participation linked by its copy is raised without an earlier account; one with neither is not (4.6)", raised.length === 1 && raised[0].code === p1.code && !raised[0].labId);

// ── a copy with nobody yet: the notice waits (review) ──
const E2 = "e7000000-0000-4000-8000-000000000002", L3 = "17000000-0000-4000-8000-000000000003", UD = "a7000000-0000-4000-8000-000000000004";
await putEntity(E2, { name: "Чака ООД", country: "BG", eik: "000000078", correspondenceAddress: "Русе", officialEmail: "office@chaka.bg", origin: "pdf", state: "pending" }, "test");
await putLaboratory(L3, { entityId: E2, name: "Лаб. В", deliveryAddress: "Русе 1", mobileOffice: false, accreditationNo: "", accreditationBody: "", state: "active" }, "test");
await putEntityUser(UD, { email: "dima@chaka.bg", name: "Дима", position: "", phone: "", role: "admin", twoFactorRequired: false, receivesNotices: true, entityId: E2, state: "invited" }, "test");
const p4 = await addParticipant({ schemeId: S, labName: "чака", email: "old-account@chaka.bg" }, "test");
await freezeParticipation(p4.id, L3, undefined, "test");
eq("a copy, but nobody active yet: a copy with no people — never the earlier address", await noticeRecipients(S, p4.code, "system:notify"), { hasCopy: true, people: [] });
const nW = await notify({ kind: "docs.sent", audience: "lab", labId: "old-lab-account", schemeId: S, code: p4.code, bg: "Чака получател", en: "Waits" });
await decideNotice(nW.id, "release", "m@ptsbg.eu");
const { recipientsOf } = await import("../src/lib/notify-deliver.ts");
eq("…its notice waits for a recipient — not sent to the earlier account, not closed", await recipientsOf({ ...nW, releasedAt: "x" }), { waiting: true, people: [] });
const { listUndelivered: undelivered } = await import("../src/lib/notifications.ts");

// ── delivery: each person, never twice ──
const realFetch = globalThis.fetch;
const posted: string[] = [];
globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => { posted.push(String(init?.body ?? "")); return new Response("{}", { status: 200 }); }) as typeof fetch;
Object.assign(process.env, { MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "portal@ptsbg.eu" });
const { deliverPending } = await import("../src/lib/notify-deliver.ts");
const rep = await deliverPending(50);
globalThis.fetch = realFetch;
for (const k of ["MAIL_PROVIDER", "MAIL_API_KEY", "MAIL_FROM"]) delete process.env[k];
const reached = await sentAddresses(`notice:${nA.id}`);
t("a participation's notice goes to each of its people — each e-mail on record", rep.sent >= 1 && reached.has("ana@izv.bg") && reached.has("boyan@izv.bg") && posted.filter((b) => b.includes("ana@izv.bg") && b.includes("Документите са изпратени")).length === 1 && posted.filter((b) => b.includes("boyan@izv.bg") && b.includes("Документите са изпратени")).length === 1, JSON.stringify(rep));
t("…never the held notice, never an address of someone who opted out or is not active", !posted.some((b) => b.includes("Задържано")) && !posted.some((b) => b.includes("cveta@izv.bg")));
t("…a notice waiting for a recipient: not stamped, not sent anywhere (review)", (await undelivered(200)).some((n) => n.id === nW.id) && !posted.some((b) => b.includes("old-account@chaka.bg") || b.includes("Чака получател")));
// one of several addresses failing: the others reached; it alone retried, then given up (review)
const { failuresByAddress } = await import("../src/lib/sent-messages.ts");
const nF = await notify({ kind: "docs.sent", audience: "lab", schemeId: S, code: p1.code, bg: "Опит по адрес", en: "Per address" });
await decideNotice(nF.id, "release", "m@ptsbg.eu");
Object.assign(process.env, { MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "portal@ptsbg.eu" });
const tries: string[] = [];
globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => { const b = String(init?.body ?? ""); if (b.includes("Опит по адрес")) tries.push(b.includes("boyan@izv.bg") ? "boyan" : "ana"); return new Response("{}", { status: b.includes("boyan@izv.bg") ? 500 : 200 }); }) as typeof fetch;
const r1 = await deliverPending(50);
const r2 = await deliverPending(50);
const r3 = await deliverPending(50);
globalThis.fetch = realFetch;
for (const k of ["MAIL_PROVIDER", "MAIL_API_KEY", "MAIL_FROM"]) delete process.env[k];
const fb = await failuresByAddress(`notice:${nF.id}`);
t("one address failing: the other reached once, never again; the failing one retried alone", tries.filter((x) => x === "ana").length === 1 && tries.filter((x) => x === "boyan").length >= 2 && (await sentAddresses(`notice:${nF.id}`)).has("ana@izv.bg"), JSON.stringify({ tries, r1: r1.failed, r2: r2.failed, r3: r3.failed }));
t("…given up on that address alone after the attempts; the notice then done", (fb.get("boyan@izv.bg") ?? 0) >= 3 && !(await undelivered(200)).some((n) => n.id === nF.id), JSON.stringify([...fb]));

// the test environment: only PTS's own mailboxes of several (1.2)
const { mailAllowedHere } = await import("../src/lib/environment.ts");
t("the test environment's filter is per address", mailAllowedHere("ana@ptsbg.eu", { PTS_ENVIRONMENT: "test" }) && !mailAllowedHere("ana@izv.bg", { PTS_ENVIRONMENT: "test" }));

// ── X1: the accreditation body ──
eq("the laboratory's accreditation body read with it — optional, short", [(() => { const r = readLaboratory({ name: "Л", deliveryAddress: "А", mobileOffice: false, accreditationNo: "1", accreditationBody: " DAkkS " }); return r.ok ? r.fields.accreditationBody : r.problem; })(), (() => { const r = readLaboratory({ name: "Л", deliveryAddress: "А", mobileOffice: false, accreditationNo: "", accreditationBody: "x".repeat(121) }); return r.ok ? "" : r.problem; })()], ["DAkkS", "accreditation-body"]);
t("…and frozen in each participation's copy (X1), with the entity's country", inForce(await openParticipationSnapshots({ actor: "a", purpose: "names.view" }, S)).get(p1.id)?.laboratory.accreditationBody === "ИА „БСА“" && inForce(await openParticipationSnapshots({ actor: "a", purpose: "names.view" }, S)).get(p1.id)?.entity.country === "BG");
eq("receives the notices: yes unless said otherwise", [readEntityUser({ email: "a@b.bg", name: "А", position: "", phone: "", role: "user", twoFactorRequired: "" }), readEntityUser({ email: "a@b.bg", name: "А", position: "", phone: "", role: "user", twoFactorRequired: "", receivesNotices: null })].map((r) => (r.ok ? r.fields.receivesNotices : null)), [true, false]);
t("…kept on the user", (await openEntityUsers({ actor: "a", purpose: "write" }, { userId: UB }))[0].receivesNotices === true);

// ── the migration ──
const sql = readFileSync(new URL("../supabase/migrations/0036_notice_recipients.sql", import.meta.url), "utf8");
t("0036: a read per person — set once, never changed or removed; closed to the API", /primary key \(notification_id, reader\)/.test(sql) && /before update or delete on public\.notification_reads/.test(sql) && /before truncate on public\.notification_reads/.test(sql) && /alter table public\.notification_reads enable row level security;/.test(sql) && /revoke all on public\.notification_reads from anon, authenticated;/.test(sql));
t("…receives the notices on each user; the users' functions made again with it", /add column if not exists receives_notices boolean not null default true/.test(sql) && /drop function if exists public\.identity_entity_users\(text, text, uuid, uuid\);/.test(sql) && /drop function if exists public\.identity_entity_user_by_auth\(text, uuid\);/.test(sql) && (sql.match(/u\.created_by, u\.receives_notices/g) ?? []).length === 2);
t("…X1: the accreditation body on the laboratory and in its copy", /add column if not exists accreditation_body text not null default ''/.test(sql) && /'accreditation_body', l\.accreditation_body/.test(sql) && /drop function if exists public\.identity_laboratories\(text, text, uuid, uuid\);/.test(sql));
const rc = sql.slice(sql.indexOf("function public.identity_notice_recipients("), sql.indexOf("end $$;", sql.indexOf("function public.identity_notice_recipients(")));
t("…recipients: by the copy in force — the entity's ACTIVE users who receive them; recorded «send»", /order by s\.version desc limit 1/.test(rc) && /u\.state = 'active' and u\.receives_notices/.test(rc) && /'send', p_scheme, pid, ent, ids/.test(rc));
t("…the switcher's participations: the copies in force of the entity, the laboratory's own opening; only the server key may call", /distinct on \(s\.participant_id\)/.test(sql) && /'lab\.own', p_entity, ids/.test(sql) && (sql.match(/grant execute on function public\.identity_[a-z_]+\([^)]*\) to service_role;/g) ?? []).length === 9 && /'0036_notice_recipients'/.test(sql));
t("the reads are not round data — said why", /per person \(4\.6\)/.test(NOT_ROUND_TABLES["notification_reads"] ?? ""));

// ── the actions and the pages ──
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const mr2 = actions.slice(actions.indexOf("export async function markNotificationsReadAction"), actions.indexOf("export async function markNotificationsReadAction") + 2200);
t("«read» for the session's reader only — a laboratory account, a participant's user, PTS's person; never all", /markRead\(readerKey\.labAccount\(ls\.userId\)/.test(mr2) && /markRead\(readerKey\.participant\(ps\.user\.id\)/.test(mr2) && /markRead\(readerKey\.staff\(ctx\.email \?\? "build"\)/.test(mr2) && !/markAllRead/.test(mr2));
t("…only what the person was shown, within their own feed as their page filters it (review)", /const shown = new Set\(/.test(mr2) && (mr2.match(/mine\(/g) ?? []).length === 3 && /started\.has\(p\.schemeId\)/.test(mr2) && /n\.kind !== "application\.received"/.test(mr2) && /scope\.includes\(n\.schemeId\)/.test(mr2) && /markNotificationsReadAction\(items\.map\(\(n\) => n\.id\)\)/.test(readFileSync(new URL("../src/components/NotificationBell.tsx", import.meta.url), "utf8")));
t("the earlier laboratory account's bell: read as ITS sign-in read it (review: it never cleared)", /withReadState\([\s\S]{0,400}readerKey\.labAccount\(userId\)\)/.test(readFileSync(new URL("../src/app/lab/page.tsx", import.meta.url), "utf8")));
t("a read from before 4.6 still counts (review: no flood of the old as new)", /readAt: r\.get\(n\.id\) \?\? n\.readAt/.test(readFileSync(new URL("../src/lib/notifications.ts", import.meta.url), "utf8")));
const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
t("…the bell shows what THIS person read", /withReadState\(/.test(layout) && /readerKey\.staff\(ctx\.email \?\? "build"\)/.test(layout));
const deliver = readFileSync(new URL("../src/lib/notify-deliver.ts", import.meta.url), "utf8");
t("delivery: each person by the copy in force — only they, with a copy; never twice to one; given up per address", /await noticeRecipients\(n\.schemeId, n\.code, "system:notify"\)/.test(deliver) && /if \(r\.hasCopy\) \{/.test(deliver) && /sentAddresses\(ref\), failuresByAddress\(ref\)/.test(deliver) && /if \(reached\.has\(addr\)\) continue;/.test(deliver) && />= MAX_ATTEMPTS\) \{ gaveUp\+\+; continue; \}/.test(deliver) && /listUndelivered\(limit \* 4\)/.test(deliver));
t("…the reminder job and the round's recipients list know a participation linked by its copy (review)", /if \(!p\.labId && !\(await participationEntity\(s\.id, p\.code, "system:reminders"\)/.test(readFileSync(new URL("../src/lib/notify-reminders.ts", import.meta.url), "utf8")) && /n\.labId \|\| \(n\.code && entityOfCode\.get\(n\.code\)\)/.test(readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8")));
t("…the accreditation body is no laboratory's name: not scrubbed from coded/ (review)", !/x\.laboratory\.accreditationBody, x\.laboratoryId/.test(readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8")));
const page = readFileSync(new URL("../src/app/lab/overview/page.tsx", import.meta.url), "utf8");
t("the switcher: the participant's gate; only its own entity's laboratories — the one asked for, if it is one of them", /await requireParticipant\(\)/.test(page) && /openLaboratories\(\{ actor: participantActor\(user\.id\), purpose: "lab\.own" \}, \{ entityId: entity\.id \}\)/.test(page) && /shown\.find\(\(l\) => l\.id === sp\.lab\)/.test(page) && /participationsOf\(ps\)/.test(page));
t("…a scheme not started is not shown (Реш. 147); the notices read as THIS person read them", /schemes\.filter\(\(s\) => isStarted\(s\)\)/.test(page) && /withReadState\(await listForParticipations\(ofLab, 30\)[\s\S]{0,60}readerKey\.participant\(user\.id\)\)/.test(page));
t("…the laboratory's area leads a participant's user here", /if \(await getParticipantSignIn\(\)\) redirect\("\/lab\/overview"\);/.test(readFileSync(new URL("../src/lib/lab-auth.ts", import.meta.url), "utf8")));

console.log(`notice-recipients.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
