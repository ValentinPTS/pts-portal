// Plan part 4.3 — a legal entity's users (Zadanie §8, §6; Реш. 112; К5): login e-mail
// (one login once), name, position (information only), phone, the profile's
// administrator or a user, two-step sign-in required or not; «поканен» until the
// invitation (4.4); the entity keeps an active administrator; never deleted; in the
// identity store, every opening on record.
import { readFileSync } from "node:fs";
import { readEntityUser, leavesNoAdmin, entityUserDiff, emailKey, ENTITY_USER_PROBLEM_TEXT } from "../src/lib/entity-users-model.ts";
import { openEntityUsers, putEntityUser, userEmailTaken } from "../src/lib/entity-users.ts";
import { putEntity } from "../src/lib/entities.ts";
import { memOpenings } from "../src/lib/identity-store.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const input = (o: Record<string, unknown> = {}) => ({ email: " Ivan.Ivanov@Lab.BG ", name: "Иван Иванов", position: "Ръководител на лабораторията", phone: "+359 88 123 4567", role: "user", twoFactorRequired: "on", ...o });
const p = (o: Record<string, unknown>) => { const r = readEntityUser(input(o)); return r.ok ? null : r.problem; };
eq("a user reads — the login e-mail in its normal form", (() => { const r = readEntityUser(input()); return r.ok ? r.fields : r; })(), { email: "ivan.ivanov@lab.bg", name: "Иван Иванов", position: "Ръководител на лабораторията", phone: "+359 88 123 4567", role: "user", twoFactorRequired: true, receivesNotices: true });
eq("required: a login e-mail that reads, a name; the phone if given reads; two roles only", [p({ email: "ivan" }), p({ name: "" }), p({ phone: "звъни" }), p({ role: "owner" }), p({ phone: "", position: "" })], ["email", "name", "phone", "role", null]);
eq("one login once: the same e-mail in any case is one — and with a trailing dot (review)", [emailKey(" A@B.BG "), emailKey("a@b.bg.")], ["a@b.bg", "a@b.bg"]);
eq("a login e-mail as mail servers take it — no empty, leading or trailing dot, no edge hyphen, a Latin domain (review)", ["ivan@lab..bg", ".ivan@lab.bg", "ivan.@lab.bg", "ivan@-lab.bg", "ivan@lab-.bg", "иван@лаб.бг", "ivan@lab.b", "ivan@lab.bg."].map((e) => p({ email: e })), ["email", "email", "email", "email", "email", "email", "email", null]);
eq("…what it does take: a plus, an apostrophe, a punycode domain", ["ivan+lab@lab.bg", "o'brien@lab.ie", "ivan@xn--80aswg.xn--90ae"].map((e) => p({ email: e })), [null, null, null]);
eq("the entity keeps an active administrator", [
  leavesNoAdmin([{ id: "a", role: "admin", state: "active" }, { id: "b", role: "user", state: "invited" }], { id: "a", role: "user" }),
  leavesNoAdmin([{ id: "a", role: "admin", state: "active" }, { id: "b", role: "user", state: "invited" }], { id: "a", state: "inactive" }),
  leavesNoAdmin([{ id: "a", role: "admin", state: "active" }, { id: "b", role: "admin", state: "invited" }], { id: "a", state: "inactive" }),
  leavesNoAdmin([{ id: "b", role: "user", state: "invited" }], { id: "b", state: "inactive" }),
], [true, true, false, false]);
t("every problem has its words", Object.values(ENTITY_USER_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));
eq("the journal names the fields that changed — never their values", entityUserDiff({ name: "А", email: "x@y.bg" }, { name: "Б", email: "x@y.bg" }), ["name"]);

// the store, in memory
const E = "88888888-8888-4888-8888-888888888888", EX = "99999999-9999-4999-8999-999999999999";
await putEntity(E, { name: "Потребители ООД", country: "BG", eik: "000000027", correspondenceAddress: "София", origin: "pdf", state: "pending" }, "head@ptsbg.eu");
await putEntity(EX, { name: "Неактивно ООД", country: "RO", eik: "J40/9", correspondenceAddress: "Букурещ", origin: "pdf", state: "inactive" }, "head@ptsbg.eu");
const U1 = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", U2 = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
await putEntityUser(U1, { ...(readEntityUser(input({ role: "admin" })) as { fields: object }).fields, entityId: E, state: "invited" }, "head@ptsbg.eu");
await putEntityUser(U2, { ...(readEntityUser(input({ email: "maria@lab.bg", name: "Мария" })) as { fields: object }).fields, entityId: E, state: "invited" }, "head@ptsbg.eu");
eq("users of the entity, opened on record — which ones", (await openEntityUsers({ actor: "head@ptsbg.eu", purpose: "names.view" }, { entityId: E })).map((u) => [u.name, u.role, u.state]), [["Иван Иванов", "admin", "invited"], ["Мария", "user", "invited"]]);
t("…every opening and write recorded with WHICH users", memOpenings().some((o) => o.purpose === "write" && !!o.userIds?.includes(U1)) && memOpenings().some((o) => o.purpose === "names.view" && o.entityId === E && o.userIds?.length === 2));
eq("one login once — asked narrowly, in any case", [await userEmailTaken("a@b", "IVAN.IVANOV@lab.bg"), await userEmailTaken("a@b", "ivan.ivanov@lab.bg", U1), await userEmailTaken("a@b", "nobody@lab.bg")], [true, false, false]);
let dup = false; try { await putEntityUser(U2, { email: "Ivan.Ivanov@lab.bg" }, "head@ptsbg.eu"); } catch { dup = true; }
t("…the same login twice refused by the store too", dup);
let lastAdmin = false; try { await putEntityUser(U1, { state: "inactive" }, "head@ptsbg.eu"); } catch { lastAdmin = true; }
t("the last active administrator not made inactive — by the store as by the database", lastAdmin);
let underInactive = false; try { await putEntityUser("aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3", { email: "x@lab.bg", name: "Х", entityId: EX }, "head@ptsbg.eu"); } catch { underInactive = true; }
t("none added under an inactive entity", underInactive);
eq("an id that is no id opens nothing", (await openEntityUsers({ actor: "a", purpose: "write" }, { userId: "nope" })).length, 0);
let activeNoSignIn = false; try { await putEntityUser(U2, { state: "active" }, "head@ptsbg.eu"); } catch { activeNoSignIn = true; }
t("active only with a sign-in account — linked at the invitation, never by the put (review)", activeNoSignIn);
await putEntityUser(U2, { authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } as never, "head@ptsbg.eu");
t("…the put never links one", !(await openEntityUsers({ actor: "a", purpose: "write" }, { userId: U2 }))[0].authUserId);
await putEntity(E, { state: "inactive" }, "head@ptsbg.eu");
eq("an entity made inactive takes its users with it — none can sign in (review)", (await openEntityUsers({ actor: "a", purpose: "write" }, { entityId: E })).map((u) => u.state), ["inactive", "inactive"]);
// review: brought back, its users can be edited and brought back — no administrator is
// demanded of an entity that had none active
await putEntity(E, { state: "pending" }, "head@ptsbg.eu");
let editAfter = true; try { await putEntityUser(U2, { phone: "+359 2 000 0000" }, "head@ptsbg.eu"); await putEntityUser(U2, { state: "invited" }, "head@ptsbg.eu"); } catch { editAfter = false; }
t("an entity brought back: a user's phone corrected, a user brought back (review)", editAfter);
const U3 = "aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaab3";
await putEntityUser(U3, { ...(readEntityUser(input({ email: "petar@lab.bg", name: "Петър", role: "user" })) as { fields: object }).fields, entityId: E, state: "invited" }, "head@ptsbg.eu");
eq("…the first user while it has no active administrator is its administrator — whatever was asked (review)", (await openEntityUsers({ actor: "a", purpose: "write" }, { userId: U3 }))[0].role, "admin");
await putEntityUser(U1, { email: "ivan.new@lab.bg" }, "head@ptsbg.eu");
eq("an inactive user whose login changes stays inactive (review)", (await openEntityUsers({ actor: "a", purpose: "write" }, { userId: U1 }))[0].state, "inactive");

// the migration
const sql = readFileSync(new URL("../supabase/migrations/0033_entity_users.sql", import.meta.url), "utf8");
t("0033: in the closed identity schema under its entity — RLS on, every API role's right revoked, a read by hand audited", /create table if not exists identity\.entity_users/.test(sql) && /entity_id uuid not null references identity\.legal_entities\(id\)/.test(sql) && /alter table identity\.entity_users enable row level security;/.test(sql) && /revoke all on identity\.entity_users from public, anon, authenticated, service_role;/.test(sql) && /grant select, insert, update, delete on identity\.entity_users to identity_auditor;/.test(sql));
t("…one login once (lower case), one sign-in account once; never deleted", /create unique index if not exists entity_users_email on identity\.entity_users \(email\)/.test(sql) && /email = lower\(btrim\(email\)\)/.test(sql) && /entity_users_auth on identity\.entity_users \(auth_user_id\) where auth_user_id is not null/.test(sql) && /before delete on identity\.entity_users/.test(sql));
t("…held by the database: never moved, not invited or active under an inactive entity (review)", /a user never moves to another entity/.test(sql) && /for share;/.test(sql) && /after update of state on identity\.legal_entities/.test(sql) && /where u\.id = any \(coalesce\(ids, '\{\}'\)\)/.test(sql));
const putFn = sql.slice(sql.indexOf("create or replace function public.identity_entity_user_put"), sql.indexOf("revoke execute on function public.identity_entity_users("));
t("…an active administrator kept for every writer — a deferred constraint trigger under a lock on the entity, skipping an inactive one; not in the put (review)", /create constraint trigger entity_users_admin_kept after update of role, state on identity\.entity_users\s+deferrable initially deferred/.test(sql) && /old\.role = 'admin' and old\.state <> 'inactive'/.test(sql) && /where e\.id = new\.entity_id for update;/.test(sql) && /st is distinct from 'inactive'/.test(sql) && !/administrator'/.test(putFn));
t("…the first user while no administrator is active: made its administrator by the database (review)", /case when not exists \(select 1 from identity\.entity_users u where u\.entity_id = ent and u\.role = 'admin' and u\.state <> 'inactive'\) then 'admin'/.test(putFn));
t("…the sign-in account never set by the put; active only with one; a changed login unlinked, invited again unless inactive (review)", !/p_fields \? 'auth_user_id'/.test(sql) && /check \(state <> 'active' or auth_user_id is not null\)/.test(sql) && /auth_user_id = case when new_email <> old_email then null else u\.auth_user_id end/.test(putFn) && /when new_email <> old_email and \(case when p_fields \? 'state' then p_fields->>'state' else u\.state end\) = 'active' then 'invited'/.test(putFn));
t("…every opening recorded with which; only the server key may call", /insert into identity\.openings \(actor, purpose, entity_id, user_id, user_ids, rows\)/.test(sql) && (sql.match(/grant execute on function public\.identity_(entity_user|user_email)[a-z_]*\([^)]*\) to service_role;/g) ?? []).length === 3 && /'0033_entity_users'/.test(sql));

// the actions and the page
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const sect = actions.slice(actions.indexOf("// ── A legal entity's users (plan part 4.3"), actions.indexOf("// ── A profile from a PDF application (plan part 4.4"));
t("both user actions behind labs.manage", (sect.match(/export async function \w+Action/g) ?? []).length === 2 && (sect.match(/await requireCapAnywhere\("labs\.manage"\)/g) ?? []).length === 2);
const pm = sect.slice(sect.indexOf("async function providerMailbox"), sect.indexOf("async function providerMailbox") + 600);
t("a participant's login is never one of PTS's people — by the mailbox — nor an earlier laboratory account; a failed lookup refuses (review)", /try \{\s*if \(await providerMailbox\(r\.fields\.email\)\) return say\("staff"\);\s*if \(\(await labEmailInUse\(r\.fields\.email\)\) \|\| \(await labEmailInUse\(mailboxKey\(r\.fields\.email\)\)\)\) return say\("lab-account"\);\s*\} catch \{ return \{ error: ENTITY_FAILED \}; \}/.test(sect) && /mailboxKey\(email\)/.test(pm) && /isSharedMailbox\(email\)/.test(pm) && /isProviderHead\(e\) \|\| isFounder\(e\) \|\| isOwnerEmail\(e\)/.test(pm) && /staffEmailInUse\(email\)\) \|\| \(await staffEmailInUse\(k\)\)/.test(pm) && !/getStaffByEmail/.test(sect));
const pl = (fn: string) => { const i = actions.indexOf(`export async function ${fn}(`); return actions.slice(i, actions.indexOf("\nexport async function", i + 10)); };
t("…nor, the other way, a team member, an earlier laboratory account or an approved request a participant's user's login (review)", ["addStaffAction", "addLabAction", "approveLabApplicationAction"].every((f) => /await participantLogin\((app\.)?email\)/.test(pl(f))) && /userEmailTaken\(actor, email\)\) \|\| \(await userEmailTaken\(actor, mailboxKey\(email\)\)\)/.test(actions));
t("the rules are the database's: no read of every user to pick the administrator or keep one (review)", !/leavesNoAdmin/.test(sect) && (sect.match(/openEntityUsers\(\{ actor, purpose: "write" \}, \{ entityId/g) ?? []).length === 0);
t("…a state that changed with a login — its own journal entry (review)", /if \(was && now && now\.state !== was\.state\) await logActivity\("entityuser\.state"/.test(sect));
t("…the journal never carries a user's name, e-mail or phone — in any argument", !(sect.match(/logActivity\([^;]*;/g) ?? []).some((c) => /\.(name|email|phone|position)\b|\.\.\.(r\.)?fields/.test(c)));
t("…the entity's state the database's to hold — its refusal said in words (review)", (sect.match(/entityRefusal\(e, ENTITY_USER_PROBLEM_TEXT\.entity\)/g) ?? []).length === 2);
const page = readFileSync(new URL("../src/app/organizations/page.tsx", import.meta.url), "utf8");
t("the page opens the users on record, under their entities — the section whole now", /openEntityUsers\(\{ actor, purpose: "names\.view" \}\)/.test(page) && /<EntityUserForms /.test(page) && !/PlannedSection/.test(page));

console.log(`entity-users.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
