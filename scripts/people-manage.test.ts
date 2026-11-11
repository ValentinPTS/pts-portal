// PTS manages its own people (plan part 2.2, Реш. 141): the head of the PT provider
// adds, invites and deactivates PTS's people, sets their permanent roles and, from the
// Order, their roles in each scheme — journalled, and in the change register (rule 7).
// Laboratories stay a manager's; a head sees no laboratory unless also a manager (D5).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mayManagePeople, isEffectiveHead, someHeadCanAct, onDeployment, type Who } from "../src/lib/people-manager.ts";
import { addStaff, updateStaff, getStaffByEmail } from "../src/lib/staff.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const actions = read("../src/lib/actions.ts");
const roles = read("../src/lib/roles.ts");
const page = read("../src/app/users/page.tsx");
const table = read("../src/components/UsersTable.tsx");
const i18n = read("../src/lib/i18n.ts");

// the first statement of the action (its signature is one line, ending in «{»)
// ── who may manage PTS's people: the decision itself, not its source text ─────────
const on = (email: string, role: string | null = "staff"): Who => ({ authEnabled: true, persona: false, role, email });
const may = (w: Who, env: Record<string, string>) => mayManagePeople(w, env);
await addStaff({ email: "head@ptsbg.eu", name: "Р", role: "staff" });
await addStaff({ email: "mgr@ptsbg.eu", name: "М", role: "manager" });
const ENV = { OWNER_EMAILS: "founder@ptsbg.eu", PROVIDER_HEAD_EMAILS: "head@ptsbg.eu" };
t("the head manages PTS's people — even with the old role «staff»", await may(on("head@ptsbg.eu"), ENV));
t("a manager who is not the head does not", !(await may(on("mgr@ptsbg.eu", "manager"), ENV)));
t("…nor a founder, while a head can act", !(await may(on("founder@ptsbg.eu", "manager"), ENV)));
t("…nor a laboratory named as head, nor someone with no role", !(await may(on("head@ptsbg.eu", "lab"), ENV)) && !(await may(on("head@ptsbg.eu", null), ENV)));
// login off on a deployment (a preview; production with the setting missing): nothing
for (const dep of [{ VERCEL: "1" }, { VERCEL_ENV: "preview" }, { PTS_STRICT_DB: "1" }]) {
  t(`login off on a deployment (${Object.keys(dep)[0]}): nobody manages PTS's people, the manager persona neither`, onDeployment(dep) && !(await may({ authEnabled: false, persona: false, role: "manager", email: null }, { ...ENV, ...dep })) && !(await may({ authEnabled: false, persona: true, role: "manager", email: null }, { ...ENV, ...dep })));
}
t("…the developer's own computer is not a deployment", !onDeployment({}));
t("…and the older gates (requireStaff, requireWriter, requirePeopleManager, requireManager) shut there too", /async function personaGate\(allowed: readonly EffectiveRole\[\]\): Promise<void> \{[\s\S]{0,260}if \(onDeployment\(\)\) redirect\("\/login\?denied=1"\);/.test(roles) && (roles.match(/if \(!AUTH_ENABLED\) return personaGate\(/g) ?? []).length === 4);
t("login off: the manager persona; a staff persona is not", (await may({ authEnabled: false, persona: false, role: "manager", email: null }, ENV)) && !(await may({ authEnabled: false, persona: true, role: "staff", email: null }, ENV)));
const ghost = { ...ENV, PROVIDER_HEAD_EMAILS: "nobody-yet@ptsbg.eu" };
t("a head named with no account: no head can act, so the founders keep it (never locked out)", !(await someHeadCanAct(ghost)) && (await may(on("founder@ptsbg.eu", "manager"), ghost)) && !(await may(on("mgr@ptsbg.eu", "manager"), ghost)));
const shared = { ...ENV, PROVIDER_HEAD_EMAILS: "office@ptsbg.eu" };
t("…only a shared address named: the founders keep it", await may(on("founder@ptsbg.eu", "manager"), shared));
await updateStaff((await getStaffByEmail("head@ptsbg.eu"))!.id, { permanentRole: "software_admin" });
t("a head who is the software administrator is not the head (effectiveRoles) …", !(await isEffectiveHead("head@ptsbg.eu", ENV)) && !(await may(on("head@ptsbg.eu"), ENV)));
t("…so the founders keep it, and can clear that role", await may(on("founder@ptsbg.eu", "manager"), ENV));
await updateStaff((await getStaffByEmail("head@ptsbg.eu"))!.id, { permanentRole: null, status: "inactive" });
t("a deactivated head: the founders keep it", !(await someHeadCanAct(ENV)) && (await may(on("founder@ptsbg.eu", "manager"), ENV)));
await updateStaff((await getStaffByEmail("head@ptsbg.eu"))!.id, { status: "active" });
t("…reactivated, the head again — and not the founders", (await may(on("head@ptsbg.eu"), ENV)) && !(await may(on("founder@ptsbg.eu", "manager"), ENV)));
t("a founder named as head: head", await may(on("founder@ptsbg.eu", "manager"), { OWNER_EMAILS: "founder@ptsbg.eu" }));

const guard = (fn: string) => new RegExp(`export async function ${fn}\\([^\\n]*\\{\\n\\s*await (\\w+)\\(`).exec(actions)?.[1];
for (const fn of ["addStaffAction", "inviteStaffAction", "setStaffRoleAction", "setStaffStatusAction", "setPermanentRoleAction", "assignSchemeRoleAction", "endSchemeRoleAction"]) {
  t(`${fn}: the head of the PT provider (requirePeopleManager)`, guard(fn) === "requirePeopleManager", guard(fn));
}
for (const fn of ["addLabAction", "setLabStatusAction", "inviteLabByIdAction"]) {
  t(`${fn}: who works with laboratory accounts (labs.manage, 2.4) — laboratories are not PTS's people`, guard(fn) === "requireCapAnywhere" && new RegExp(`export async function ${fn}\\([^\\n]*\\{\\n\\s*await requireCapAnywhere\\("labs\\.manage"\\)`).test(actions), guard(fn));
}
t("the guard asks the decision above", /export async function canManagePeople[^{]*\{\s*return mayManagePeople\(ctx \?\? \(await getRoleContext\(\)\)\);/.test(roles) && /export async function requirePeopleManager[\s\S]{0,300}if \(!\(await canManagePeople\(ctx\)\)\) redirect\(ctx\.role && ctx\.role !== "lab" \? "\/denied" : "\/login\?denied=1"\)/.test(roles));
t("…while login is off, the manager persona (as requireManager)", /export async function requirePeopleManager\(\)[^{]*\{\s*if \(!AUTH_ENABLED\) return personaGate\(\["manager"\]\);/.test(roles));
t("«Потребители»: who manages laboratory accounts, or the head — through a full gate either way (a temporary password, 2FA)", /const peopleManager = await canManagePeople\(ctx\);[\s\S]{0,160}if \(peopleManager\) await requirePeopleManager\(\);\s*else await requireCapAnywhere\("labs\.manage"\);/.test(page));
for (const fn of ["setStaffRoleAction", "setStaffStatusAction", "setPermanentRoleAction"]) {
  const body = actions.slice(actions.indexOf(`export async function ${fn}`), actions.indexOf("\n}\n", actions.indexOf(`export async function ${fn}`)));
  t(`${fn}: nobody changes their own role or access (a head would make themselves a manager — D5)`, /if \(me && before\.email === me\) return \{ error: SELF_REFUSAL \}/.test(body));
}
t("…and the page offers no such control on one's own row", /disabled=\{pending \|\| !canManagePeople \|\| !!r\.you\}/.test(table) && /\{canManagePeople && !r\.you && \(/.test(table));
const deact = actions.slice(actions.indexOf("export async function setStaffStatusAction"), actions.indexOf("\n}\n", actions.indexOf("export async function setStaffStatusAction")));
// what the person holds is cleared by one helper — on deactivation, and on becoming the auditor (2.5)
const clear = actions.slice(actions.indexOf("async function clearRolesOf"), actions.indexOf("\n}\n", actions.indexOf("async function clearRolesOf")));
t("a deactivation ends the roles and clears the permanent role BEFORE the status — a failure leaves the person active, to try again",
  /const cleared = await clearRolesOf\(before, by, "deactivation"\);\s*if \(cleared\) return cleared;/.test(deact) && deact.indexOf("clearRolesOf(") < deact.indexOf("updateStaff(id, { status })")
  && clear.indexOf("endAllRolesOf(") > 0 && clear.indexOf("permanentRole: null") > clear.indexOf("endAllRolesOf(") && /return \{ error: NOT_SAVED \}/.test(clear));
t("…each ended role journalled and in the change register; the status only when it changes", /for \(const r of ended\) await logActivity\("scheme_role\.ended"/.test(clear) && /if \(ended\.length\) await recordSettingChange/.test(clear) && /if \(before\.status === status\) \{ revalidatePath/.test(deact));
t("the 2FA reset and the release authorisation: the head as the role model sees them (no software administrator)", /if \(!\(await isEffectiveHead\(ctx\.email\)\)\) return \{ error: "Само ръководителят/.test(actions) && /ctx\.authEnabled && !\(await isEffectiveHead\(ctx\.email\)\)\) redirect/.test(actions));
t("a write that fails is a message, not an error page", (actions.match(/return \{ error: NOT_SAVED \}/g) ?? []).length >= 7);
t("…a head who is not a manager is shown no laboratory and no application (D5)", /manager \? listLabs\(\) : Promise\.resolve\(\[\]\)/.test(page) && /manager \? listLabApplications\("pending"\) : Promise\.resolve\(\[\]\)/.test(page) && /\{manager && <PendingLabApplications/.test(page));
t("…a manager who is not the head sees no people controls", /canManagePeople \? <>/.test(table) && /disabled=\{pending \|\| !canManagePeople/.test(table) && /\{canManagePeople && \(\s*<button[^>]*\n?[^>]*onClick=\{\(\) => run\(\(\) => inviteStaffAction/.test(table));
for (const [fn, act] of [["setPermanentRoleAction", "role.permanent"], ["assignSchemeRoleAction", "scheme_role.assigned"], ["endSchemeRoleAction", "scheme_role.ended"]]) {
  const body = actions.slice(actions.indexOf(`export async function ${fn}`), actions.indexOf("\n}\n", actions.indexOf(`export async function ${fn}`)));
  t(`${fn}: journalled (${act}) and in the change register`, body.includes(`logActivity("${act}"`) && body.includes("recordSettingChange("));
  t(`…«${act}» has its name in both languages`, new RegExp(`"act\\.${act.replace(".", "\\.")}": \\{ bg: "[^"]+", en: "[^"]+" \\}`).test(i18n));
}
t("the refusals are the role model's own (permanentRoleProblem, assignSchemeRole)", /await permanentRoleProblem\(before\.email, next\)/.test(actions) && /const r = await assignSchemeRole\(\{/.test(actions));
t("every refusal of the store has words for the head", /const ASSIGN_REFUSAL: Record<AssignProblem, string>/.test(actions));

console.log(`people-manage.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
