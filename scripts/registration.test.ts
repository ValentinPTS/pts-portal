// Plan part 9.1 — registration and joining: the form's read (the three levels, each by its Phase 4
// reader); the neutral answer; a repeated ЕИК a request to join; the approval's making (entity pending,
// origin «portal», laboratory, administrator invited); the refusal kept with its reason; a join decided by
// the profile's administrator, or by PTS as the fallback (a letter when there is an active administrator);
// the administrator's appointment; the notices to the official e-mail (fixed texts); the wiring.
import { readFileSync } from "node:fs";
import { readRegistration, registrationProblemText, inputOf, viesOf, adminJoinProblem, ptsJoinProblem, appointPlan, isEu, EU_COUNTRIES } from "../src/lib/registration-model.ts";
import { addLabApplication, patchLabApplication, listJoinRequests, getLabApplication, eraseRegistrationsOf } from "../src/lib/lab-applications.ts";
import { normCountry, readEntity } from "../src/lib/entities-model.ts";
import { putEntity, entityIdByKey } from "../src/lib/entities.ts";
import { officialNoticePreviews, fixedApproval, PROFILE_CREATED_KEY, USER_JOINED_KEY, ADMIN_CHANGED_KEY, userJoinedText, adminChangedText, profileCreatedText } from "../src/lib/fixed-texts.ts";
import type { LabApplication } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

const GOOD = {
  name: "Тест ЕООД", country: "BG", eik: "131468980", vat: "BG131468980", correspondenceAddress: "София, ул. Тестова 1", officialEmail: "Office@Example-Lab.bg", mol: "Иван Тестов", language: "bg",
  labName: "Изпитвателна лаборатория Тест", deliveryAddress: "София, ул. Тестова 1, ет. 2", accreditationNo: "123 ЛИ", accreditationBody: "ИА БСА",
  personName: "Мария Тестова", email: "Maria@Example-Lab.bg", position: "Ръководител на лабораторията", phone: "+359 2 000 000",
};

// ── the form's read ──
const r = readRegistration(GOOD);
t("the three levels read at once — each by its own Phase 4 reader; the e-mails in their normal form", r.ok && r.value.entity.name === "Тест ЕООД" && r.value.entity.officialEmail === "office@example-lab.bg" && r.value.laboratory.name === "Изпитвателна лаборатория Тест" && r.value.laboratory.mobileOffice === false && r.value.person.email === "maria@example-lab.bg" && r.value.person.position === "Ръководител на лабораторията", JSON.stringify(r));
const bad = (patch: Partial<typeof GOOD>) => { const x = readRegistration({ ...GOOD, ...patch }); return x.ok ? "ok" : x.problem; };
t("a Bulgarian ЕИК by its check digit — named by its level", bad({ eik: "131468981" }) === "entity.eik-bg");
t("the official e-mail is required — the notices go there (К23)", bad({ officialEmail: "" }) === "entity.official-email-required" && bad({ officialEmail: "not-an-address" }) === "entity.official-email");
t("the laboratory: its name and delivery address required", bad({ labName: "" }) === "laboratory.name" && bad({ deliveryAddress: "" }) === "laboratory.address");
t("the person: a login e-mail and a name", bad({ email: "x" }) === "person.email" && bad({ personName: " " }) === "person.name" && bad({ phone: "call me" }) === "person.phone");
t("the country: an ISO code, chosen — never defaulted; outside the EU its registration number (no check digit)", bad({ country: "Serbia" }) === "entity.country" && bad({ country: "" }) === "entity.country" && bad({ country: "XX" }) === "entity.country" && bad({ country: "RS", eik: "HRB-12345", vat: "" }) === "ok");
t("review: one company, one country code — «EL» is Greece «GR», «UK» is «GB»; an ЕИК with no letter or digit is none", normCountry("el") === "GR" && normCountry("UK") === "GB" && normCountry("us") === "US" && normCountry("XX") === null && normCountry("ZZ") === null && bad({ country: "RS", eik: "---", vat: "" }) === "entity.eik" && (() => { const x = readEntity({ name: "a", country: "EL", eik: "123", vat: "", correspondenceAddress: "b", mol: "", language: "bg" }, []); return x.ok && x.fields.country === "GR"; })());
t("each problem has words, by its level; an unknown code none", /^Организацията: ЕИК не е валиден/.test(registrationProblemText("entity.eik-bg")?.bg ?? "") && /^Лабораторията:/.test(registrationProblemText("laboratory.address")?.bg ?? "") && /^You:/.test(registrationProblemText("person.email")?.en ?? "") && registrationProblemText("entity.nope") === null && registrationProblemText("x") === null);
t("the EU: 27 by their ISO codes — Greece «GR» (VIES's «EL» is the VAT number's)", EU_COUNTRIES.length === 27 && isEu("GR") && isEu("bg") && !isEu("RS") && !isEu("EL"));

// ── a stored registration read back by the same rules ──
const stored: LabApplication = {
  id: "00000000-0000-4000-8000-000000000001", status: "pending", region: "eu", orgName: GOOD.name, country: "BG", contactPerson: GOOD.personName, email: "maria@example-lab.bg",
  phone: GOOD.phone, address: GOOD.correspondenceAddress, accreditationBody: GOOD.accreditationBody, accreditationNo: GOOD.accreditationNo, eik: GOOD.eik, vat: GOOD.vat,
  docPaths: [], createdAt: "2026-11-10T08:00:00.000Z", kind: "entity", officialEmail: "office@example-lab.bg", mol: GOOD.mol, language: "bg", labName: GOOD.labName,
  deliveryAddress: GOOD.deliveryAddress, position: GOOD.position, vatStatus: "valid", vatName: "TEST EOOD",
};
const back = readRegistration(inputOf(stored));
t("the approval reads the stored registration by the form's rules — the same three levels", back.ok && r.ok && JSON.stringify(back.value) === JSON.stringify(r.value));
const ent = r.ok ? r.value.entity : null!;
t("VIES's answer carried over only when valid, and FOR the entity's number as it is", JSON.stringify(viesOf(stored, ent)) === JSON.stringify({ status: "valid", checkedAt: stored.createdAt, vat: "BG131468980", country: "BG", name: "TEST EOOD" }) && viesOf({ ...stored, vatStatus: "unavailable" }, ent) === undefined && viesOf({ ...stored, vat: "BG000000000" }, ent) === undefined && viesOf(stored, { ...ent, vat: "" }) === undefined);

// ── who decides a join ──
const E1 = "00000000-0000-4000-8000-0000000000e1", E2 = "00000000-0000-4000-8000-0000000000e2";
const join = { kind: "join" as const, status: "pending" as const, entityId: E1 };
t("a join: the entity's ACTIVE administrator decides it — for its own entity only, once", adminJoinProblem({ role: "admin", state: "active", entityId: E1 }, join) === null && adminJoinProblem({ role: "user", state: "active", entityId: E1 }, join) === "not-admin" && adminJoinProblem({ role: "admin", state: "invited", entityId: E1 }, join) === "not-admin" && adminJoinProblem({ role: "admin", state: "active", entityId: E2 }, join) === "other-entity" && adminJoinProblem({ role: "admin", state: "active", entityId: E1 }, { ...join, status: "approved" }) === "decided" && adminJoinProblem({ role: "admin", state: "active", entityId: E1 }, { ...join, kind: "entity" }) === "other-entity");
t("review: PTS decides a join only on the signed letter — always (a stranger who typed a public ЕИК is never let in on a click)", ptsJoinProblem({ letter: false }) === "letter" && ptsJoinProblem({ letter: true }) === null);

// ── the appointment ──
const users = [
  { id: "a", role: "admin" as const, state: "active" as const, entityId: E1 },
  { id: "b", role: "user" as const, state: "active" as const, entityId: E1 },
  { id: "c", role: "user" as const, state: "invited" as const, entityId: E1 },
  { id: "d", role: "admin" as const, state: "inactive" as const, entityId: E1 },
];
const plan = appointPlan(users, "b", true);
t("PTS appoints an active user: promoted FIRST, the administrator before demoted after (never none on the way); an inactive one left alone", plan.ok && plan.promoted && JSON.stringify(plan.changes) === JSON.stringify([{ id: "b", role: "admin" }, { id: "a", role: "user" }]));
t("review: a demotion that failed is done again — the administrator already, the others made users; nothing left — said", (() => { const two = users.map((u) => u.id === "b" ? { ...u, role: "admin" as const } : u); const p = appointPlan(two, "b", true); return p.ok && !p.promoted && JSON.stringify(p.changes) === JSON.stringify([{ id: "a", role: "user" }]); })());
t("…kept as administrators both, when not demoted", (() => { const p = appointPlan(users, "b", false); return p.ok && p.changes.length === 1; })());
t("…never an invited one, nor one already the only administrator, nor someone else's", !appointPlan(users, "c", true).ok && (appointPlan(users, "a", false) as { problem: string }).problem === "already" && (appointPlan(users.filter((u) => u.id !== "d"), "a", true) as { problem: string }).problem === "already" && (appointPlan(users, "zz", true) as { problem: string }).problem === "not-found");

// ── the store (memory): the claim once; the join requests of one entity; the ЕИК looked up ──
const app = await addLabApplication({ kind: "join", entityId: E1, region: "eu", orgName: "X", country: "BG", contactPerson: "Петър", email: "p@example-lab.bg", phone: "", address: "a", accreditationBody: "", accreditationNo: "", officialEmail: "o@example-lab.bg", labName: "Лаб" });
await addLabApplication({ kind: "join", entityId: E2, region: "eu", orgName: "Y", country: "BG", contactPerson: "Друг", email: "d@example-lab.bg", phone: "", address: "a", accreditationBody: "", accreditationNo: "" });
t("the join requests of ONE entity — its own only, pending", (await listJoinRequests(E1)).map((a) => a.id).join() === app.id);
const first = await patchLabApplication(app.id, { status: "approved", decidedAs: "admin", reviewedBy: "entityuser:x" }, true);
const second = await patchLabApplication(app.id, { status: "rejected", rejectReason: "късно", decidedAs: "pts" }, true);
const now = await getLabApplication(app.id);
t("a decision claims the request once — the second finds it decided; the review's time set", first && !second && now?.status === "approved" && now.decidedAs === "admin" && !!now.reviewedAt && (await listJoinRequests(E1)).length === 0);
// the approval saves the entity it makes BEFORE making it — once (review)
const reg = await addLabApplication({ kind: "entity", region: "eu", orgName: "Z", country: "BG", contactPerson: "Зара", email: "z@example-lab.bg", phone: "", address: "a", accreditationBody: "", accreditationNo: "" });
const s1 = await patchLabApplication(reg.id, { entityId: E1 }, { pending: true, noEntity: true });
const s2 = await patchLabApplication(reg.id, { entityId: E2 }, { pending: true, noEntity: true });
t("review: the entity's id saved on the registration once — a second approval at once continues with the first's", s1 && !s2 && (await getLabApplication(reg.id))?.entityId === E1);
// an erased profile takes its registrations with it (review)
const j9 = await addLabApplication({ kind: "join", entityId: E1, region: "non_eu", orgName: "Пазено ООД", country: "RS", contactPerson: "Лична Личност", email: "lichna@example-lab.bg", phone: "+359 1", address: "Белград", accreditationBody: "", accreditationNo: "", officialEmail: "o@example-lab.bg", labName: "Лаб", position: "x", docPaths: ["f/doc.pdf"] });
await patchLabApplication(app.id, { letterPath: "letters/l.pdf" });
const er = await eraseRegistrationsOf(E1);
const g9 = await getLabApplication(j9.id), gApp = await getLabApplication(app.id), gReg = await getLabApplication(reg.id);
t("review: erasure — every registration naming the entity anonymised (the record kept), a waiting one refused with why, its papers and letters given to remove", er.rows === 3 && er.files.includes("f/doc.pdf") && er.files.includes("letters/l.pdf") && g9?.status === "rejected" && /изтрит/.test(g9.rejectReason ?? "") && g9.contactPerson === "‹изтрит›" && !JSON.stringify(g9).includes("Лична") && !JSON.stringify(g9).includes("lichna") && !JSON.stringify(gApp).includes("Петър") && gApp?.status === "approved" && gApp.letterPath === undefined && gReg?.orgName === "‹изтрито по искане›" && (await getLabApplication((await addLabApplication({ kind: "join", entityId: E2, region: "eu", orgName: "Друго", country: "BG", contactPerson: "Друг", email: "dd@example-lab.bg", phone: "", address: "a", accreditationBody: "", accreditationNo: "" })).id))?.orgName === "Друго");

await putEntity("00000000-0000-4000-8000-0000000000e3", { name: "Съществуващо ООД", country: "BG", eik: "131468980", correspondenceAddress: "a" }, "test");
t("a repeated ЕИК found — by its normal form, in its country only", (await entityIdByKey("test", "BG", " 131468980 ")) === "00000000-0000-4000-8000-0000000000e3" && (await entityIdByKey("test", "RO", "131468980")) === null && (await entityIdByKey("test", "BG", "175074752")) === null);

// ── the notices (fixed texts, К23; M4 — Реш. 152) ──
const pv = officialNoticePreviews();
t("three fixed texts to the official e-mail: a profile made, a user joined, an administrator changed — each with M4 and «write to us»", pv.map((p) => p.key).join() === [PROFILE_CREATED_KEY, USER_JOINED_KEY, ADMIN_CHANGED_KEY].join() && pv.every((p) => /раздел М4/.test(p.body) && /section M4/.test(p.body) && /office@ptsbg\.eu at once/.test(p.body) && /^[0-9a-f]{12}$/.test(p.textKey)));
t("…each approval names the text by its key (a changed text, a new key)", [PROFILE_CREATED_KEY, USER_JOINED_KEY, ADMIN_CHANGED_KEY].every((k) => fixedApproval(k).ref === `fixed:${k}@${pv.find((p) => p.key === k)!.textKey}`));
t("…the words carry the data: who joined and who approved; the new administrator; the profile's administrator", /Петър стана потребител на профила на Тест ЕООД/.test(userJoinedText({ entity: "Тест ЕООД", date: "10.11.2026", name: "Петър", by: "letter", privacy: "p" })) && /по подписаното писмо/.test(userJoinedText({ entity: "e", date: "d", name: "n", by: "letter", privacy: "p" })) && /администратор на профила на Тест ЕООД .* е Мария/.test(adminChangedText({ entity: "Тест ЕООД", date: "10.11.2026", name: "Мария", privacy: "p" })) && /Администратор на профила е Мария/.test(profileCreatedText({ entity: "e", date: "d", admin: "Мария", privacy: "p" })));

// ── the wiring ──
const actions = src("lib/actions.ts");
const submit = actions.slice(actions.indexOf("export async function submitRegistrationAction"), actions.indexOf("// Manager approves a pending application"));
t("the public form: the honeypot and the per-e-mail cap dropped quietly — the same page", /if \(get\("website"\)\) redirect\("\/register\/thanks"\)/.test(submit) && /countPendingByEmail\(person\.email\)\) >= 3\) redirect\("\/register\/thanks"\)/.test(submit));
t("…a neutral answer: every redirect the same page; every other end a mistake in the FORM (its level, a file, the address's limit) — never «exists»", (submit.match(/redirect\(/g) ?? []).length === (submit.match(/redirect\("\/register\/thanks"\)/g) ?? []).length && (submit.match(/return mistake\(/g) ?? []).length === (submit.match(/return mistake\((r\.problem|"later"|"filetype"|"filesize"|"docs")\)/g) ?? []).length && !/exists|taken|duplicate/i.test(submit.replace(/\/\/.*$/gm, "")));
t("review: the per-address limit counts real submissions only (after the form is read) and is SAID — a valid registration never dropped unsaid; a mistake keeps what was typed", submit.indexOf("publicFormLimit(\"registration\"") > submit.indexOf("readRegistration(") && /if \(\(await publicFormLimit\("registration", requestAddress\(h\)\)\) !== "ok"\) return mistake\("later"\)/.test(submit) && /const mistake = \(error: string\): RegistrationFormState => \(\{ error, values, at: Date\.now\(\) \}\)/.test(submit) && /useActionState<RegistrationFormState, FormData>\(submitRegistrationAction/.test(src("components/RegisterForm.tsx")) && /defaultValue=\{v\[name\] \?\? ""\}/.test(src("components/RegisterForm.tsx")));
t("…a repeated ЕИК: a request to JOIN that entity (asked of the identity store, the question only); a failed lookup a registration", /joinOf = await entityIdByKey\(REGISTRATION_ACTOR, entity\.country, entity\.eik\)/.test(submit) && /kind: joinOf \? "join" : "entity", entityId: joinOf \?\? undefined/.test(submit));
const approve = actions.slice(actions.indexOf("export async function approveRegistrationAction"), actions.indexOf("/** PTS refuses a registration"));
t("the approval: labs.manage; the login checked (staff, an earlier account, taken); made pending, from the portal; its laboratory; its administrator invited; once", /requireCapAnywhere\("labs\.manage"\)/.test(approve) && /personLoginProblem\(actor, person\.email, madeAdmin\?\.id\)/.test(approve) && /origin: "portal", state: "pending"/.test(approve) && /putLaboratory\(labId, \{ \.\.\.laboratory, entityId, state: "active" \}/.test(approve) && /role: "admin", twoFactorRequired: false, receivesNotices: true, entityId, state: "invited"/.test(approve) && /patchLabApplication\(a\.id, \{ status: "approved", reviewedBy: me \}, true\)/.test(approve));
t("…an ЕИК registered meanwhile: the registration becomes a join — never a second entity; guarded (only while it names none)", /if \(other\) \{\s*if \(!\(await patchLabApplication\(a\.id, \{ kind: "join", entityId: other \}, \{ pending: true, noEntity: true \}\)/.test(approve));
t("review: an approval stopped half way is continued — the entity's id saved BEFORE it is made, made if missing; the laboratory and the administrator only if missing", /patchLabApplication\(a\.id, \{ entityId: randomUUID\(\) \}, \{ pending: true, noEntity: true \}\)/.test(approve) && approve.indexOf("entityId: randomUUID()") < approve.indexOf("await putEntity(") && /if \(!there\)/.test(approve) && /if \(!labs\.length\)/.test(approve) && /if \(!madeAdmin\)/.test(approve));
const reject = actions.slice(actions.indexOf("export async function rejectRegistrationAction"), actions.indexOf("/** The person a request to join names"));
t("review: a refusal after an approval began closes the profile it began — inactive, nothing deleted", /if \(a\.kind === "entity" && a\.entityId\)/.test(reject) && /putEntity\(begun\.id, \{ state: "inactive" \}, actor\)/.test(reject));
t("review: the earlier account actions refuse a registration or a join", (actions.match(/\(app\.kind \?\? "account"\) !== "account"\) return \{ error: "Application not found or already handled\." \}/g) ?? []).length === 2);
t("…the official e-mail told (a fixed text, PTS's person approves it)", /sendOfficialNotice\(ent, "profile\.created", PROFILE_CREATED_SUBJECT/.test(approve) && /\{ by: me, ref: fixedApproval\(PROFILE_CREATED_KEY\)\.ref \}, "provider"/.test(approve));
const ptsJoin = actions.slice(actions.indexOf("export async function approveJoinByPtsAction"), actions.indexOf("/** The profile's administrator decides a request to join"));
t("PTS's join: the letter always; checked by its bytes BEFORE anything is claimed or stored", /ptsJoinProblem\(\{ letter: !!file \}\)/.test(ptsJoin) && /magicMatches\(bytes, file\.type\)/.test(ptsJoin) && ptsJoin.indexOf("magicMatches(") < ptsJoin.indexOf("joinUser("));
t("review: a profile with no administrator — the person comes in as its administrator (the database's rule), read back, and the official e-mail told that too", /const admin = j\.user\.role === "admin";/.test(ptsJoin) && /admin \? await sendOfficialNotice\(ent, "profile\.admin_changed"/.test(ptsJoin));
const adminJoin = actions.slice(actions.indexOf("export async function decideJoinAction"), actions.indexOf("/** PTS appoints another active user"));
t("the administrator's join: the participant's session; its own entity; the invitation shown first (its key), sent on its action; the official e-mail told", /const ps = await requireParticipant\(\)/.test(adminJoin) && /adminJoinProblem\(user, a\)/.test(adminJoin) && /if \(inviteKey !== shown\.key\)/.test(adminJoin) && /sendParticipantInvite\(j\.user, .*"triggered"\)/.test(adminJoin) && /fixedApproval\(USER_JOINED_KEY\), "triggered"/.test(adminJoin) && /data-join-invite/.test(src("components/JoinDecision.tsx")));
const joinU = actions.slice(actions.indexOf("async function joinUser"), actions.indexOf("/** PTS decides a join"));
t("review: the login checked and the claim made BEFORE the letter is stored; each failure gives the claim back (guarded — a give-back that fails is journalled) and removes the letter", joinU.indexOf("personLoginProblem(") < joinU.indexOf('status: "approved"') && joinU.indexOf('status: "approved"') < joinU.indexOf("upload(letterPath") && /status: "pending", decidedAs: undefined/.test(joinU) && /registration\.join_stuck/.test(joinU) && /remove\(\[letterPath\]\)/.test(joinU) && /role: "user", twoFactorRequired: false, receivesNotices: true, entityId, state: "invited"/.test(joinU));
const appoint = actions.slice(actions.indexOf("export async function appointEntityAdminAction"), actions.indexOf("// ── A frozen copy per participation"));
t("the appointment: the text shown (its key); an official e-mail to tell; the plan's order; once promoted — the notice and the record, a failed demotion said apart", /textKeyShown !== shown\.textKey/.test(appoint) && /if \(!ent\.officialEmail\)/.test(appoint) && /for \(const c of plan\.changes\)/.test(appoint) && /if \(promoted\) \{\s*sent = await sendOfficialNotice\(ent, "profile\.admin_changed"/.test(appoint) && /failed\.push\(c\.id\)/.test(appoint));
t("a profile that is the laboratory's: its role changes only by the appointment (К23)", /if \(ent && \(ent\.origin === "portal" \|\| ent\.confirmedAt\)\) return \{ error: "Профилът е на лабораторията/.test(actions));
t("review: the server actions file exports async functions and types only — nothing else callable or importable from a browser; the letters' store apart", !/^export (const|let|var|function|class) /m.test(actions) && !/"use server"/.test(src("lib/join-letters.ts")) && /^"use server";/m.test(actions));
t("review: a failed notice to the official e-mail is sent again from «Организации» — the same recorded words, the three kinds only", /failedLatestByEntity\(OFFICIAL_NOTICE_KINDS_91\)/.test(src("app/organizations/page.tsx")) && /OFFICIAL_NOTICE_KINDS_91 as readonly string\[\]\)\.includes\(m\.kind\) \|\| m\.outcome !== "failed"/.test(actions));
t("review: /registrations goes through the proxy — only /register and below are public", /register\(\?:\/\|\$\)/.test(src("proxy.ts")));
t("review: erasure takes the registrations with it — their papers and letters removed", /const reg = await eraseRegistrationsOf\(String\(entityId\)\)/.test(actions) && /db\.storage\.from\(DOC_BUCKET\)\.remove\(reg\.files\)/.test(actions));
const regPage = src("app/registrations/page.tsx");
t("«Одобрения на регистрации»: its section's gate; registrations and joins (an inactive organisation's only refused); who waits for the invitation; the refused, kept six years", /await requireSection\("registrations"\)/.test(regPage) && /a\.kind === "entity"/.test(regPage) && /a\.kind === "join" && a\.entityId/.test(regPage) && /<RejectedRegistrations /.test(regPage) && /canApprove=\{!closed\}/.test(regPage) && /data-waiting-invite/.test(regPage));
const letter = src("app/registrations/letter/[id]/route.ts");
t("the letter: through the section's gate, by id, never cached; unreadable — 503; HEAD refused", /await requireSection\("registrations"\)/.test(letter) && /UUID_RE\.test\(id\)/.test(letter) && /status: 503/.test(letter) && /private, no-store/.test(letter) && /export const HEAD/.test(letter));
t("the section: labs.manage — the people of the laboratories", /case "registrations": return any\("labs\.manage"\);/.test(src("lib/admin-nav.ts")) && /key: "registrations", href: "\/registrations"/.test(src("lib/admin-sections.ts")));
t("the laboratory's portal: the tab for its administrator only; the page lists its own entity's", /role === "admin" && tab\("\/lab\/joins"/.test(src("components/ParticipantNav.tsx")) && /listJoinRequests\(entity\.id\)/.test(src("app/lab/joins/page.tsx")));
t("«Потребители»: only the earlier account requests stay", /\(a\.kind \?\? "account"\) === "account"/.test(src("app/users/page.tsx")) && !/<RejectedRegistrations /.test(src("app/users/page.tsx")));
t("the form: the M4 link (Реш. 152); the thanks page the same words for all", /data-register-privacy/.test(src("components/RegisterForm.tsx")) && /privacy=\{privacyUrl\(\)\}/.test(src("app/register/page.tsx")) && !/searchParams/.test(src("app/register/thanks/page.tsx")));
t("review: one text for the joined notice — both approvers in its place, one key", /‹администратора на профила \| PTS Bulgaria, по подписаното писмо на организацията›/.test(pv.find((p) => p.key === USER_JOINED_KEY)!.body));
t("migration 0049: the columns, the decided-by check, the ЕИК's lookup for the server only; listed", /add column if not exists kind text not null default 'account'/.test(readFileSync(new URL("../supabase/migrations/0049_registrations.sql", import.meta.url), "utf8")) && /grant execute on function public\.identity_entity_by_key\(text, text, text\) to service_role/.test(readFileSync(new URL("../supabase/migrations/0049_registrations.sql", import.meta.url), "utf8")) && /"0049_registrations"/.test(src("lib/migrations-list.ts")));

console.log(`registration.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
