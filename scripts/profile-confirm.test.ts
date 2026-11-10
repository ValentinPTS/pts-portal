// Plan part 4.4 — a profile from a PDF application (Реш. 145): PTS enters it, invites
// its users (1.8); a user sets a password (the invitation accepted); the profile's
// administrator reviews, completes and confirms the data — once, when and who on
// record; from then the data is the laboratory's. At the confirmation the notice to
// the official e-mail (К23) and the link to M4 (Реш. 152).
import { readFileSync } from "node:fs";
import { readCompletion, privacyUrl, confirmDate, COMPLETION_PROBLEM_TEXT } from "../src/lib/profile-confirm-model.ts";
import { changedOnly, readShown } from "../src/lib/form-merge.ts";
import { inviteParticipant, ACCOUNT_TAKEN, type InviteDeps } from "../src/lib/participant-invite.ts";
import { readEntity, readOfficialEmail } from "../src/lib/entities-model.ts";
import { profileConfirmedText, profileConfirmedPreview, PROFILE_CONFIRMED_KEY, fixedApproval, PROFILE_CONFIRMED_SUBJECT } from "../src/lib/fixed-texts.ts";
import { inviteLink } from "../src/lib/auth-links.ts";
import { putEntity, openEntities, confirmEntity } from "../src/lib/entities.ts";
import { putLaboratory } from "../src/lib/laboratories.ts";
import { putEntityUser, openEntityUsers, linkEntityUserAccount, acceptEntityUserInvitation, entityUserByAuth, entityUserForLogin } from "../src/lib/entity-users.ts";
import { memOpenings } from "../src/lib/identity-store.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const throws = async (f: () => Promise<unknown>, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

// ── the model ──
const L1 = "11111111-1111-4111-8111-1111111111aa";
const input = (o: Record<string, unknown> = {}) => ({
  correspondenceAddress: "София, ул. Х 1", officialEmail: " Office@Lab.BG ", mol: "Иван", language: "bg",
  [`lab_${L1}_name`]: "Лаборатория „А“", [`lab_${L1}_deliveryAddress`]: "Пловдив 2", [`lab_${L1}_mobileOffice`]: "on", [`lab_${L1}_accreditationNo`]: "12 ЛИ",
  [`lab_${L1}_accreditationBody`]: "ИА „БСА“",
  ownName: "Мария", ownPosition: "Ръководител на лабораторията", ownPhone: "+359 2 111 222", ownReceivesNotices: "on", confirmTick: "on", ...o,
});
const read = (o: Record<string, unknown>, admin = true, confirm = false) => readCompletion(input(o), { admin, labIds: [L1], confirm });
const all = read({});
eq("an administrator completes the entity, its laboratories and their own details — never the official e-mail (PTS's, review)", all.ok ? all.value : all, {
  entity: { correspondenceAddress: "София, ул. Х 1", mol: "Иван", language: "bg" },
  laboratories: [{ id: L1, fields: { name: "Лаборатория „А“", deliveryAddress: "Пловдив 2", mobileOffice: true, accreditationNo: "12 ЛИ", accreditationBody: "ИА „БСА“" } }],
  own: { name: "Мария", position: "Ръководител на лабораторията", phone: "+359 2 111 222", receivesNotices: true },
});
const user = readCompletion(input({ correspondenceAddress: "" }), { admin: false, labIds: [L1], confirm: false });
eq("a user completes their own details only — the entity and laboratories are not read from them", user.ok ? [user.value.entity, user.value.laboratories.length, user.value.own.name] : user, [null, 0, "Мария"]);
const pr = (o: Record<string, unknown>, confirm = false) => { const r = read(o, true, confirm); return r.ok ? null : r.problem; };
eq("what does not read is said: the address, the language, a laboratory, the own name", [pr({ correspondenceAddress: " " }), pr({ language: "de" }), pr({ [`lab_${L1}_deliveryAddress`]: "" }), pr({ ownName: "" })], ["address", "language", "lab", "own"]);
eq("to confirm: the tick", [pr({ confirmTick: "" }), pr({ confirmTick: "" }, true), pr({}, true)], [null, "confirm-tick", null]);
t("…only the laboratories of ITS entity are read — another id's fields are not", (() => { const r = readCompletion({ ...input(), lab_x_name: "Чужда" }, { admin: true, labIds: [L1], confirm: false }); return r.ok && r.value.laboratories.length === 1 && r.value.laboratories[0].id === L1; })());
t("every problem has its words", Object.values(COMPLETION_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));
// a form writes only what the person changed from what it showed (review: lost updates)
eq("a form left open undoes nothing: only what the person changed is written", changedOnly({ name: "А", phone: "1", mol: "Х" }, { name: "А", phone: "1", mol: "" }, { name: "Б (PTS meanwhile)", phone: "1", mol: "" }), { patch: { mol: "Х" }, conflict: [] });
eq("…the same field changed by both — refused, to look again", changedOnly({ name: "В" }, { name: "А" }, { name: "Б" }), { patch: {}, conflict: ["name"] });
eq("…changed to the same — no conflict; an older page (nothing shown): what differs from now", [changedOnly({ name: "Б" }, { name: "А" }, { name: "Б" }), changedOnly({ name: "А", mol: "Х" }, null, { name: "А", mol: "" })], [{ patch: { name: "Б" }, conflict: [] }, { patch: { mol: "Х" }, conflict: [] }]);
eq("…what was shown, read as JSON or an object; anything else is none", [readShown('{"a":1}'), readShown({ a: 1 }), readShown("[1]"), readShown("nope"), readShown(undefined)], [{ a: 1 }, { a: 1 }, null, null, null]);
eq("M4's address: https only, no credentials; none until set (Реш. 152)", [privacyUrl({ NEXT_PUBLIC_PRIVACY_URL: "https://ptsbg.eu/privacy" }), privacyUrl({ NEXT_PUBLIC_PRIVACY_URL: "http://ptsbg.eu/p" }), privacyUrl({ NEXT_PUBLIC_PRIVACY_URL: "https://a:b@ptsbg.eu/" }), privacyUrl({})], ["https://ptsbg.eu/privacy", null, null, null]);
eq("the date of a confirmation: the day in Sofia", [confirmDate("2026-11-05T22:30:00Z"), confirmDate("2026-07-01T09:00:00Z"), confirmDate("nope")], ["06.11.2026", "01.07.2026", ""]);
eq("the entity's official e-mail: optional for PTS, its normal form, refused when it does not read", [readOfficialEmail(""), readOfficialEmail(" A@B.BG."), readOfficialEmail("a@b")], ["", "a@b.bg", null]);
t("…read with the entity", (() => { const r = readEntity({ name: "Х ООД", country: "RO", eik: "J40/1", vat: "", correspondenceAddress: "Б", officialEmail: "office@x.ro", mol: "", language: "en" }, []); return r.ok && r.fields.officialEmail === "office@x.ro"; })() && (() => { const r = readEntity({ name: "Х ООД", country: "RO", eik: "J40/1", vat: "", correspondenceAddress: "Б", officialEmail: "nope", mol: "", language: "en" }, []); return !r.ok && r.problem === "official-email"; })());

// ── the notice (К23) and the invitation's link ──
const body = profileConfirmedText({ entity: "Х ООД", date: "06.11.2026", by: "Мария", privacy: "https://ptsbg.eu/privacy" });
t("the notice says who, what and when — both languages — and links M4", body.includes("Х ООД") && body.includes("06.11.2026") && body.includes("Мария") && (body.match(/https:\/\/ptsbg\.eu\/privacy/g) ?? []).length === 2 && /Ако не очаквате/.test(body) && /If you did not expect/.test(body) && /Потвърден|потвърден/.test(PROFILE_CONFIRMED_SUBJECT));
t("…a fixed text kept in the code — its approval names its key", fixedApproval(PROFILE_CONFIRMED_KEY).ref === `fixed:${PROFILE_CONFIRMED_KEY}@${profileConfirmedPreview().key}` && /^[0-9a-f]{12}$/.test(profileConfirmedPreview().key));
t("an invitation link: an invitation's, or a new password's to the account made before — both to «set a password»", /type=invite/.test(inviteLink("https://p.test", "abc12345")) && /type=recovery/.test(inviteLink("https://p.test", "abc12345", "recovery")) && inviteLink("https://p.test", "abc12345", "recovery").includes(encodeURIComponent("/auth/set-password?from=invite")));

// ── the invitation's steps, with a fake Supabase (review) ──
const fake = (o: { invite?: { authId?: string; error?: string }; recovery?: { authId?: string; error?: string }; linkFails?: boolean; sendOk?: boolean }) => {
  const calls: string[] = [];
  const deps: InviteDeps = {
    generateLink: async (type) => { calls.push(`gen:${type}`); const r = (type === "invite" ? o.invite : o.recovery) ?? {}; return { ...r, token: r.authId ? "tok12345" : undefined }; },
    link: async (_u, authId) => { calls.push(`link:${authId}`); if (o.linkFails) throw new Error("no"); },
    send: async () => { calls.push("send"); return { ok: o.sendOk !== false, error: o.sendOk === false ? "mail down" : undefined }; },
    linkFor: (_t, type) => `https://p.test/auth/confirm?type=${type}`,
  };
  return { deps, calls };
};
const U = { id: "u1", email: "maria@lab.bg", authUserId: undefined as string | undefined };
{ const f = fake({ invite: { authId: "acc-new" } }); const r = await inviteParticipant(U, f.deps);
  t("a new login: a new account, linked, THEN the e-mail", "ok" in r && f.calls.join() === "gen:invite,link:acc-new,send"); }
{ const f = fake({ invite: { error: "A user with this email address has already been registered" }, recovery: { authId: "someone-else" } });
  const r = await inviteParticipant(U, f.deps);
  t("an account already there, and the user linked to none: never taken over — refused, nothing linked or sent (review)", "error" in r && r.error === ACCOUNT_TAKEN && f.calls.join() === "gen:invite"); }
{ const f = fake({ invite: { error: "email_exists" }, recovery: { authId: "someone-else" } });
  const r = await inviteParticipant({ ...U, authUserId: "acc-mine" }, f.deps);
  t("…another account than the user's own: refused, nothing linked or sent (review)", "error" in r && r.error === ACCOUNT_TAKEN && f.calls.join() === "gen:invite,gen:recovery"); }
{ const f = fake({ invite: { error: "already registered" }, recovery: { authId: "acc-mine" } });
  const r = await inviteParticipant({ ...U, authUserId: "acc-mine" }, f.deps);
  t("…the user's OWN account from its earlier invitation: a new link to it (recovery), linked, sent", "ok" in r && f.calls.join() === "gen:invite,gen:recovery,link:acc-mine,send"); }
{ const f = fake({ invite: { authId: "acc-new" }, linkFails: true }); const r = await inviteParticipant(U, f.deps);
  t("a link that fails: nothing sent", "error" in r && !f.calls.includes("send")); }
{ const f = fake({ invite: { error: "rate limited" } }); const r = await inviteParticipant(U, f.deps);
  t("no link from Supabase: nothing linked or sent", "error" in r && f.calls.join() === "gen:invite"); }

// ── the store, in memory ──
const E = "c0000000-0000-4000-8000-000000000001", A = "c0000000-0000-4000-8000-0000000000a1", B = "c0000000-0000-4000-8000-0000000000b1";
const AUTH_A = "d0000000-0000-4000-8000-0000000000a1", AUTH_B = "d0000000-0000-4000-8000-0000000000b1";
await putEntity(E, { name: "Потвърди ООД", country: "BG", eik: "000000035", correspondenceAddress: "София", origin: "pdf", state: "pending" }, "head@ptsbg.eu");
await putLaboratory(L1, { name: "Лаб", deliveryAddress: "Пловдив", mobileOffice: false, accreditationNo: "", entityId: E, state: "active" }, "head@ptsbg.eu");
await putEntityUser(A, { email: "maria@lab.bg", name: "Мария", position: "", phone: "", role: "admin", twoFactorRequired: false, entityId: E, state: "invited" }, "head@ptsbg.eu");
await putEntityUser(B, { email: "petar@lab.bg", name: "Петър", position: "", phone: "", role: "user", twoFactorRequired: false, entityId: E, state: "invited" }, "head@ptsbg.eu");
t("before the invitation: no sign-in account, no user found by one", (await entityUserByAuth(AUTH_A, "auth:x")) === null);
await linkEntityUserAccount(A, AUTH_A, "head@ptsbg.eu");
eq("the invitation links the sign-in account — the user found by it, still «поканен»", (await entityUserByAuth(AUTH_A, `auth:${AUTH_A}`))?.state, "invited");
t("…the user's own opening, on record", memOpenings().some((o) => o.purpose === "lab.own" && o.actor === `auth:${AUTH_A}` && o.userIds?.[0] === A));
t("…never another account to a linked user, nor one account to two users", await throws(() => linkEntityUserAccount(A, AUTH_B, "h"), /another sign-in account/) && await throws(() => linkEntityUserAccount(B, AUTH_A, "h"), /duplicate/));
await linkEntityUserAccount(B, AUTH_B, "head@ptsbg.eu");
t("…a password set — not before — makes the user active", (await acceptEntityUserInvitation(AUTH_A, "participant:a")) === A && (await openEntityUsers({ actor: "a", purpose: "write" }, { userId: A }))[0].state === "active" && (await acceptEntityUserInvitation(AUTH_A, "participant:a")) === null);
t("…an active user is not linked again", await throws(() => linkEntityUserAccount(A, AUTH_A, "h"), /only an invited user/));
t("only the profile's ACTIVE administrator confirms — not a user, not one still invited", await throws(() => confirmEntity(E, B, "participant:b"), /active administrator/));
t("…not without the official e-mail to tell (К23)", await throws(() => confirmEntity(E, A, "participant:a"), /official e-mail/));
await putEntity(E, { officialEmail: "Office@Potvardi.bg" }, "participant:a");
const c1 = await confirmEntity(E, A, "participant:a");
const c2 = await confirmEntity(E, A, "participant:a");
t("confirmed once — when and who on record; again it says so and changes nothing", c1.nowConfirmed && !c2.nowConfirmed && c1.confirmedAt === c2.confirmedAt && (await openEntities({ actor: "a", purpose: "write" }, E))[0].confirmedBy === A);
await putEntity(E, { confirmedAt: "2000-01-01T00:00:00Z", confirmedBy: B } as never, "head@ptsbg.eu");
t("…a confirmation is never changed by a write", (await openEntities({ actor: "a", purpose: "write" }, E))[0].confirmedAt === c1.confirmedAt);
eq("the official e-mail kept in its normal form", (await openEntities({ actor: "a", purpose: "write" }, E))[0].officialEmail, "office@potvardi.bg");
await putEntityUser(A, { email: "maria.new@lab.bg" }, "head@ptsbg.eu");
const aNow = (await openEntityUsers({ actor: "a", purpose: "write" }, { userId: A }))[0];
t("a changed login: the sign-in account unlinked, «поканен» again (4.3) — no session by the old account", aNow.state === "invited" && !aNow.authUserId && (await entityUserByAuth(AUTH_A, "auth:x")) === null);
eq("a login, looked up for a new password (review): its state and whether it has an account — recorded «send»", [await entityUserForLogin("petar@lab.bg", "auth:password.reset"), await entityUserForLogin("nobody@lab.bg", "auth:password.reset")], [{ id: B, entityId: E, state: "invited", linked: true }, null]);
t("…on record", memOpenings().some((o) => o.purpose === "send" && o.actor === "auth:password.reset" && o.userIds?.[0] === B));

// ── the migration ──
const sql = readFileSync(new URL("../supabase/migrations/0034_profile_confirmation.sql", import.meta.url), "utf8");
t("0034: the official e-mail (its normal form) and the confirmation — whole, once, never changed by any writer", /add column if not exists official_email text not null default ''/.test(sql) && /official_email = lower\(btrim\(official_email\)\)/.test(sql) && /check \(\(confirmed_at is null\) = \(confirmed_by is null\)\)/.test(sql) && /references identity\.entity_users\(id\)/.test(sql) && /a confirmation is never changed/.test(sql) && /before update on identity\.legal_entities/.test(sql));
t("…the entities opened with them (made again, its rights again); the put takes the e-mail, never the confirmation", /drop function if exists public\.identity_entities\(text, text, uuid\);/.test(sql) && /official_email text, confirmed_at timestamptz, confirmed_by uuid\)/.test(sql) && /official_email = case when p_fields \? 'official_email'/.test(sql) && !/p_fields \? 'confirmed/.test(sql));
const fn = (name: string) => sql.slice(sql.indexOf(`function public.${name}(`), sql.indexOf("end $$;", sql.indexOf(`function public.${name}(`)));
t("…linked: only an invited user, only the account auth.users holds for its own login, never another's", /if st <> 'invited' then raise exception/.test(fn("identity_entity_user_link")) && /from auth\.users a where a\.id = p_auth and lower\(btrim\(a\.email\)\) = em/.test(fn("identity_entity_user_link")) && /cur is not null and cur <> p_auth/.test(fn("identity_entity_user_link")));
t("…accepted: invited → active, by its account; found by its account: the laboratory's own opening", /set state = 'active'[\s\S]*where u\.auth_user_id = p_auth and u\.state = 'invited'/.test(fn("identity_entity_user_accept")) && /'lab\.own'/.test(fn("identity_entity_user_by_auth")) && /where u\.id = any \(coalesce\(ids, '\{\}'\)\)/.test(fn("identity_entity_user_by_auth")));
t("…confirmed: under a lock, its active administrator, the official e-mail there; once", /for update;/.test(fn("identity_entity_confirm")) && /u\.role = 'admin' and u\.state = 'active'/.test(fn("identity_entity_confirm")) && /the official e-mail is required to confirm/.test(fn("identity_entity_confirm")) && /if was is not null then/.test(fn("identity_entity_confirm")));
t("…a message names its entity; the record's guard keeps that too", /alter table public\.sent_messages add column if not exists entity_id uuid;/.test(sql) && (sql.match(/new\.entity_id|old\.entity_id/g) ?? []).length === 2);
t("…only the server key may call them; all definers with an empty search path", (sql.match(/grant execute on function public\.identity_[a-z_]+\([^)]*\) to service_role;/g) ?? []).length === 7 && (sql.match(/security definer set search_path = ''/g) ?? []).length === 7 && /'0034_profile_confirmation'/.test(sql) && !/to (anon|authenticated)/.test(sql));
t("…a login looked up for a new password: which, its state, whether it has an account — recorded «send» (review)", /'send', ent/.test(fn("identity_entity_user_for_login")) && /u\.auth_user_id is not null/.test(fn("identity_entity_user_for_login")));

// ── the actions, the session, the pages ──
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const sect = actions.slice(actions.indexOf("// ── A profile from a PDF application (plan part 4.4"));
const inv = sect.slice(sect.indexOf("export async function inviteEntityUserAction"), sect.indexOf("async function sendParticipantInvite"));
t("the invitation: labs.manage; the text shown, else nothing; an invited user only; PTS's people and earlier accounts refused, failing closed", /\{\n\s*await requireCapAnywhere\("labs\.manage"\);/.test(inv.slice(0, 260)) && inv.indexOf("textKey !== shown.key") < inv.indexOf("sendParticipantInvite(") && /if \(u\.state !== "invited"\) return/.test(inv) && /try \{\s*if \(await providerMailbox\(u\.email\)\)[\s\S]*labEmailInUse\(mailboxKey\(u\.email\)\)[\s\S]*\} catch \{ return \{ error: ENTITY_FAILED \}; \}/.test(inv) && /ref: `invite:\$\{shown\.key\}`/.test(inv));
t("…only once PTS entered the entity's official e-mail — where the notice of the confirmation goes (review)", /if \(!ent\.officialEmail\) return \{ error:/.test(inv) && inv.indexOf("!ent.officialEmail") < inv.indexOf("sendParticipantInvite("));
const spi = sect.slice(sect.indexOf("async function sendParticipantInvite"), sect.indexOf("export async function saveProfileAction"));
t("…its steps in the tested module: generateLink, link, then sendToLab on record", /await inviteParticipant\(u, \{/.test(spi) && /db\.auth\.admin\.generateLink\(\{ type, email \}\)/.test(spi) && /link: \(userId, authId\) => linkEntityUserAccount\(userId, authId, actor\)/.test(spi) && /cls: "provider" \| "triggered" = "provider"/.test(spi) && /sendToLab\(\{ class: cls, kind: "invite", entityId: u\.entityId, to: u\.email/.test(spi));
const sp = sect.slice(sect.indexOf("export async function saveProfileAction"), sect.indexOf("async function sendConfirmationNotice"));
t("the laboratory's save: its own session's gate; confirms only its administrator; M4 there on the real portal; the official e-mail PTS's", /\{\n\s*const ps = await requireParticipant\(\);/.test(sp.slice(0, 260)) && /if \(confirm && !admin\) return/.test(sp) && /if \(confirm && !privacyUrl\(\) && process\.env\.NODE_ENV === "production" && !isTestEnvironment\(\)\) return/.test(sp) && /if \(confirm && !entity\.officialEmail\) return/.test(sp) && !/officialEmail:/.test(sp));
t("…only ITS entity and ITS laboratories — the session's, never an id typed", /openLaboratories\(\{ actor, purpose: "lab\.own" \}, \{ entityId: entity\.id \}\)/.test(sp) && /putEntity\(entity\.id, ent\.patch, actor\)/.test(sp) && /putLaboratory\(l\.id, l\.patch, actor\)/.test(sp) && /putEntityUser\(user\.id, own\.patch, actor\)/.test(sp) && !/input\.(entityId|id)\b/.test(sp));
t("…only what the person changed from what the page showed; the same field changed meanwhile refused (review)", /changedOnly\(c\.entity, sub\("entity"\), entity\)/.test(sp) && /changedOnly\(c\.own, sub\("own"\), user\)/.test(sp) && /\.conflict\.length[\s\S]{0,160}return say\(CONFLICT_TEXT\)/.test(sp));
const scn = sect.slice(sect.indexOf("async function sendConfirmationNotice"), sect.indexOf("const privacyOrPlaceholder"));
// the shared sender of the notices to the official e-mail (9.1)
const son = sect.slice(sect.indexOf("const privacyOrPlaceholder"), sect.indexOf("export async function resendConfirmationNoticeAction"));
t("…the notice at a fresh confirmation (К23): to the official e-mail PTS entered, a fixed text — on record even when it cannot go (review)", /if \(conf\.nowConfirmed\)/.test(sp) && /sendConfirmationNotice\(entity, /.test(sp) && /sendOfficialNotice\(entity, "profile\.confirmed", PROFILE_CONFIRMED_SUBJECT/.test(scn) && /to: entity\.officialEmail/.test(son) && /kind, entityId: entity\.id/.test(son) && /if \(!res\.recordId\) \{ const id = await recordPending\(msg, approval\); if \(id\) await settle\(id, false/.test(son) && /privacy: privacyOrPlaceholder\(\)/.test(scn) && /privacyUrl\(\) \?\? "‹раздел М4/.test(son));
const rs = sect.slice(sect.indexOf("export async function resendConfirmationNoticeAction"));
t("…sent again from «Организации»: labs.manage; only a confirmed profile; PTS's person approves it (review)", /\{\n\s*await requireCapAnywhere\("labs\.manage"\);/.test(rs.slice(0, 220)) && /if \(!e\.confirmedAt \|\| !e\.confirmedBy\) return/.test(rs) && /\{ by: person, ref: fixedApproval\(PROFILE_CONFIRMED_KEY\)\.ref \}, "provider"/.test(rs));
t("…the journal: what changed and who by id — never a value, a name or an address", (sp.match(/logAs\([^;]*;/g) ?? []).length === 2 && !(sp.match(/logAs\([^;]*;/g) ?? []).some((c) => /\.(name|email|officialEmail|phone|position)\b|c\.entity\b|c\.own\b|\.patch\b/.test(c)));
t("PTS's own change after the confirmation: marked so in the journal; PTS's forms too write only what was changed (review)", /const afterConfirmation = !!was\?\.confirmedAt;/.test(actions) && /afterConfirmation \? \{ afterConfirmation: true \}/.test(actions) && (actions.match(/const m = was \? changedOnly\(r\.fields, readShown\(input\.shown\), was\)/g) ?? []).length === 3);
t("a changed login: its old sign-in account closed for good — banned, nothing deleted (review)", /const closed = emailChanged && was\?\.authUserId \? await closeSignInAccount\(was\.authUserId\)/.test(actions) && (() => { const f = actions.slice(actions.indexOf("async function closeSignInAccount"), actions.indexOf("async function closeSignInAccount") + 600); return /updateUserById\(authUserId, \{ ban_duration: "876000h" \}\)/.test(f) && !/deleteUser\(/.test(f); })());
const aa = readFileSync(new URL("../src/lib/auth-actions.ts", import.meta.url), "utf8");
t("sign-in: a participant's user by its sign-in account and only while its e-mail is the login; ACTIVE only — an invited one has no role (review)", /if \(userId && \(await participantUserOf\(userId, email\)\)\) return "lab";/.test(aa) && /if \(!u \|\| u\.email !== email\.trim\(\)\.toLowerCase\(\)\) return null;/.test(aa) && /return u\.state === "active" \|\| \(invited && u\.state === "invited"\) \? u : null;/.test(aa));
t("…the invitation accepted only by a session its e-mail's link made, within the hour — read before the password changes (review)", /const byLink = await cameByEmailLink\(\);[\s\S]{0,400}updateUser\(\{ password \}\)/.test(aa) && /if \(!byLink\) \{[^}]*signOut[^}]*\}[^\n]*return "\/lab\/login\?invited=1"/.test(aa) && /currentAuthenticationMethods/.test(aa) && /now - Number\(m\.timestamp\) < 60 \* 60/.test(aa) && /return "\/lab\/confirm";/.test(aa));
t("…its password messages on record too (1.8): only a login with an account; an inactive one gets none; failing closed (review)", /if \(!lab\) return recordForParticipant\(/.test(aa) && /if \(!f \|\| !f\.linked\) return null;\s*if \(f\.state === "inactive"\) return false;/.test(aa) && /recentCountTo\(email, kind/.test(aa) && /\} catch \{ return false; \}/.test(aa.slice(aa.indexOf("async function recordForParticipant"))));
const ses = readFileSync(new URL("../src/lib/participant-session.ts", import.meta.url), "utf8");
t("the participant's session: by the sign-in account, its e-mail the login; active only; its entity not inactive; no temporary password, no unpassed 2FA", /entityUserByAuth\(session\.userId/.test(ses) && /if \(user && user\.email !== session\.email\) return null;/.test(ses) && /if \(!user \|\| user\.state !== "active"\) return null;/.test(ses) && /if \(!entity \|\| entity\.state === "inactive"\) return null;/.test(ses) && /session\.mustChangePassword \|\| session\.needsAal2/.test(ses));
t("…two-step sign-in where PTS requires it: nothing else open until it is set up (review)", /twoStepMissing: !persona && user\.twoFactorRequired && !aal2/.test(ses) && /if \(s\.twoStepMissing\) redirect\("\/lab\/two-factor"\);/.test(ses) && /<TotpEnroll after="\/lab\/confirm" \/>/.test(readFileSync(new URL("../src/app/lab/two-factor/page.tsx", import.meta.url), "utf8")) && /=== "\/lab\/confirm" \? "\/lab\/confirm" : "\/"/.test(aa));
t("…the laboratory's area sends it to its own pages (4.6); the proxy to its side", /if \(await getParticipantSignIn\(\)\) redirect\("\/lab\/overview"\);/.test(readFileSync(new URL("../src/lib/lab-auth.ts", import.meta.url), "utf8")) && /isParticipantUser\(user\.id\)/.test(readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8")));
t("…a development persona of a participant's user: in memory only, never a database's — not even the test one (review)", /if \(getDb\(\)\) return null; \/\/ memory only/.test(readFileSync(new URL("../src/lib/roles.ts", import.meta.url), "utf8")) && /if \(!memoryOnly\) return new NextResponse\("A participant's user persona is offered in memory only\."/.test(readFileSync(new URL("../src/app/dev/persona/route.ts", import.meta.url), "utf8")));
const page = readFileSync(new URL("../src/app/lab/confirm/page.tsx", import.meta.url), "utf8");
t("the review page: the participant's gate; its laboratories by its entity; M4 linked; the checked identifiers shown, not edited", /await requireParticipant\(\)/.test(page) && /openLaboratories\(\{ actor: participantActor\(user\.id\), purpose: "lab\.own" \}, \{ entityId: entity\.id \}\)/.test(page) && /privacyUrl\(\)/.test(page) && /data-checked-identity/.test(page) && !/name="(eik|vat|country|name)"/.test(page));
const form = readFileSync(new URL("../src/components/ProfileConfirmForm.tsx", import.meta.url), "utf8");
t("…its form: the official e-mail read-only (no field posts it); what it showed posted with it (review)", !/name="officialEmail"/.test(form) && /input\.shown = shown;/.test(form));
const org = readFileSync(new URL("../src/app/organizations/page.tsx", import.meta.url), "utf8");
t("«Организации»: the official e-mail, the origin and the confirmation, the notice's outcome with «send again»; the invitation shown before «Изпрати»", /data-official-email/.test(org) && /data-origin=\{e\.origin\}/.test(org) && /data-notice-outcome/.test(org) && /<ResendNoticeButton entityId=\{e\.id\}/.test(org) && /invitePreview\(\)/.test(org) && /inviteEntityUserAction\(u\.id, invite\.key\)/.test(readFileSync(new URL("../src/components/EntityUserForms.tsx", import.meta.url), "utf8")));

console.log(`profile-confirm.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
