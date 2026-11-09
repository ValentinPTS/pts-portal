// The provider's role model (plan part 2.1): rights sit on the role type, and the
// matrix keeps the decisions — only the scheme manager and the coding expert see who
// is behind a code (Реш. 93); the quality manager never a participant's identity
// (Реш. 114); the head no names without a scheme role (D5); the technical expert
// codes and results only (D18); the software administrator never processes, reviews
// or approves (П 7.4.1 т. 3).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RIGHTS, CAPABILITIES, PERMANENT_ROLES, SCHEME_ROLES, can, schemesWhere, assignmentProblem, effectiveRoles, permanentConflict, ROLE_LABEL, type RoleType, type PersonRoles } from "../src/lib/role-model.ts";
import { assignSchemeRole, endSchemeRole, endAllRolesOf, listSchemeRoles, personRoles, permanentRoleProblem } from "../src/lib/scheme-roles.ts";
import { addStaff, updateStaff, getStaffByEmail } from "../src/lib/staff.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const roles = [...PERMANENT_ROLES, ...SCHEME_ROLES] as RoleType[];
const holders = (cap: string) => roles.filter((r) => (RIGHTS[r] as readonly string[]).includes(cap)).sort();

// ── the matrix ──────────────────────────────────────────────────────────────
t("who is behind a code: the scheme manager and the coding expert, no one else (Реш. 93)", JSON.stringify(holders("names.view")) === JSON.stringify(["coding_expert", "scheme_manager"]));
t("the quality manager: the journal and the codes — never an identity (Реш. 114)", RIGHTS.quality.includes("journal.read") && RIGHTS.quality.includes("codes.view") && !RIGHTS.quality.includes("names.view"));
t("the head: PTS's people, the Order, releases, 2FA — and no names without a scheme role (D5)",
  ["people.manage", "order.manage", "register.authorise", "twofa.reset"].every((c) => (RIGHTS.head as readonly string[]).includes(c)) && !RIGHTS.head.includes("names.view"));
t("the statistics expert: codes and results only (the Ф 7.2.1-5 content) — and the Order that assigns them (Реш. 149, 2.6)", JSON.stringify([...RIGHTS.statistics_expert].sort()) === JSON.stringify(["codes.view", "order.view", "results.process", "results.read"]));
t("the technical expert: codes, results and the objects — no names, no dispatch (D18)", !RIGHTS.technical_expert.includes("names.view") && !RIGHTS.technical_expert.includes("dispatch") && RIGHTS.technical_expert.includes("items.manage"));
t("dispatch with identities: the scheme manager or the coding expert (D18)", JSON.stringify(holders("dispatch")) === JSON.stringify(["coding_expert", "scheme_manager"]));
t("the software administrator: never processes, reviews or approves — and no names (П 7.4.1 т. 3)",
  !["results.process", "review", "approve", "names.view", "results.enter"].some((c) => (RIGHTS.software_admin as readonly string[]).includes(c)) && RIGHTS.software_admin.includes("system.technical"));
t("the approval (the third act) is the scheme manager's (Реш. 140)", JSON.stringify(holders("approve")) === JSON.stringify(["scheme_manager"]));
t("every right is some role's, and every role has rights", CAPABILITIES.every((c) => holders(c).length > 0) && roles.every((r) => RIGHTS[r].length > 0), CAPABILITIES.filter((c) => !holders(c).length).join());
t("every role has its name in both languages", roles.every((r) => ROLE_LABEL[r].bg && ROLE_LABEL[r].en && ROLE_LABEL[r].bg !== ROLE_LABEL[r].en));

// ── per scheme, from the Order ──────────────────────────────────────────────
const p: PersonRoles = { permanent: [], schemes: { A: ["scheme_manager"], B: ["statistics_expert"] } };
t("a scheme role's rights are for THAT scheme: names in A, not in B", can(p, "names.view", "A") && !can(p, "names.view", "B"));
t("…and not «in general» either", !can(p, "names.view"));
t("…asked without a scheme, a scheme role answers nothing — the journal too (a page that forgets the scheme sees less)", !can(p, "journal.read") && can(p, "journal.read", "A") && !can(p, "codes.view"));
t("…a permanent role answers anywhere", can({ permanent: ["quality"], schemes: {} }, "journal.read") && can({ permanent: ["quality"], schemes: {} }, "codes.view", "Z"));
t("the schemes where a person may do this, for a list page", JSON.stringify(schemesWhere(p, "names.view")) === JSON.stringify(["A"]) && JSON.stringify(schemesWhere(p, "codes.view").sort()) === JSON.stringify(["A", "B"]));
const head: PersonRoles = { permanent: ["head"], schemes: {} };
t("the head sees names only once the Order gives a scheme role (D5)", !can(head, "names.view", "A") && can({ ...head, schemes: { A: ["scheme_manager"] } }, "names.view", "A"));
t("the software administrator takes no scheme role", assignmentProblem({ permanent: ["software_admin"], schemes: {} }, "statistics_expert", "A") === "software-admin");
t("…nor another permanent role", permanentConflict({ permanent: ["software_admin", "quality"], schemes: {} }) !== null && permanentConflict(head) === null);
t("…the head and the quality manager may be one person (a small provider)", permanentConflict({ permanent: ["head", "quality"], schemes: {} }) === null);
const both: PersonRoles = { permanent: ["head", "software_admin"], schemes: { A: ["scheme_manager"] } };
t("conflicts resolve closed: a software administrator keeps only that — no head powers, no scheme role", JSON.stringify(effectiveRoles(both)) === JSON.stringify({ permanent: ["software_admin"], schemes: {} }) && !can(effectiveRoles(both), "register.authorise") && !can(effectiveRoles(both), "names.view", "A"));
t("…and anyone else keeps what they hold", effectiveRoles(p) === p);
t("a role already held is not given twice", assignmentProblem(p, "scheme_manager", "A") === "already");

// ── the store ───────────────────────────────────────────────────────────────
process.env.PROVIDER_HEAD_EMAILS = "head@ptsbg.eu";
await addStaff({ email: "dobreva@ptsbg.eu", name: "Д", role: "staff" });
await addStaff({ email: "admin@ptsbg.eu", name: "A", role: "staff" });
const adm = (await getStaffByEmail("admin@ptsbg.eu"))!;
await updateStaff(adm.id, { permanentRole: "software_admin" });
const qm = (await getStaffByEmail("dobreva@ptsbg.eu"))!;
await updateStaff(qm.id, { permanentRole: "quality" });
const a1 = await assignSchemeRole({ schemeId: "26-01-T-1", personEmail: "Dobreva@ptsbg.eu", role: "statistics_expert", orderRef: "Заповед № 12/03.11.2026", by: "head@ptsbg.eu" });
t("a role given from the Order: by whom, with the Order", a1.ok && a1.entry.personEmail === "dobreva@ptsbg.eu" && a1.entry.orderRef === "Заповед № 12/03.11.2026" && a1.entry.assignedBy === "head@ptsbg.eu");
const ORDER = "Заповед № 12/03.11.2026";
const refused = async (q: Partial<Parameters<typeof assignSchemeRole>[0]>) => {
  const r = await assignSchemeRole({ schemeId: "26-01-T-1", personEmail: "dobreva@ptsbg.eu", role: "coding_expert", orderRef: ORDER, by: "head@ptsbg.eu", ...q });
  return r.ok ? "given" : r.error;
};
t("…the software administrator is refused", (await refused({ personEmail: "admin@ptsbg.eu" })) === "software-admin");
t("…someone who is not one of PTS's people is refused", (await refused({ personEmail: "lab@example.com" })) === "person");
t("…an unknown role is refused", (await refused({ role: "manager" })) === "role");
t("…a scheme that does not exist is refused (a typo is no permanent row)", (await refused({ schemeId: "26-01-T-9" })) === "scheme");
t("…a role with no Order is refused", (await refused({ orderRef: "  " })) === "order" && (await refused({ orderRef: undefined })) === "order");
t("…a role already held is refused, not given twice", (await refused({ role: "statistics_expert" })) === "already" && (await listSchemeRoles({ personEmail: "dobreva@ptsbg.eu" })).length === 1);
let pr = await personRoles("dobreva@ptsbg.eu");
t("a person's roles: the permanent one and the scheme's", pr.permanent.join() === "quality" && pr.schemes["26-01-T-1"]?.join() === "statistics_expert", JSON.stringify(pr));
t("…the head from PROVIDER_HEAD_EMAILS", (await personRoles("head@ptsbg.eu")).permanent.includes("head"));
t("nobody BECOMES the software administrator while holding a scheme role …", (await permanentRoleProblem("dobreva@ptsbg.eu", "software_admin")) === "holds-scheme-roles" && (await permanentRoleProblem("dobreva@ptsbg.eu", "quality")) === null);
t("…nor while named the head", (await permanentRoleProblem("head@ptsbg.eu", "software_admin")) === "head" && (await permanentRoleProblem("x@ptsbg.eu", "head")) === "role" && (await permanentRoleProblem("x@ptsbg.eu", null)) === null);
await addStaff({ email: "head@ptsbg.eu", name: "Р", role: "manager" });
await updateStaff((await getStaffByEmail("head@ptsbg.eu"))!.id, { permanentRole: "software_admin" });
const hr = await personRoles("head@ptsbg.eu");
t("a head made software administrator anyway keeps only that — no head powers (the system check warns)", JSON.stringify(hr) === JSON.stringify({ permanent: ["software_admin"], schemes: {} }));
const ended = a1.ok ? await endSchemeRole(a1.entry.id, "head@ptsbg.eu") : null;
pr = await personRoles("dobreva@ptsbg.eu");
t("a role ended: no longer held …", !!ended?.endedAt && !pr.schemes["26-01-T-1"]);
t("…but kept on record, with who ended it", (await listSchemeRoles({ schemeId: "26-01-T-1", all: true })).some((r) => r.id === ended?.id && r.endedBy === "head@ptsbg.eu"));
t("…and ended once", a1.ok && (await endSchemeRole(a1.entry.id, "x")) === null);
await assignSchemeRole({ schemeId: "26-01-T-1", personEmail: "dobreva@ptsbg.eu", role: "coding_expert", orderRef: ORDER, by: "head@ptsbg.eu" });
await assignSchemeRole({ schemeId: "25-06-C-1", personEmail: "dobreva@ptsbg.eu", role: "technical_expert", orderRef: ORDER, by: "head@ptsbg.eu" });
const n = (await endAllRolesOf("dobreva@ptsbg.eu", "head@ptsbg.eu")).length;
t("deactivation ends every scheme role, on record with who", n === 2 && (await listSchemeRoles({ personEmail: "dobreva@ptsbg.eu" })).length === 0 && (await listSchemeRoles({ personEmail: "dobreva@ptsbg.eu", all: true })).filter((r) => r.endedBy === "head@ptsbg.eu").length === 3);
await updateStaff(qm.id, { status: "inactive" });
t("a deactivated person holds no role", (await personRoles("dobreva@ptsbg.eu")).permanent.length === 0);
const acts = readFileSync(fileURLToPath(new URL("../src/lib/actions.ts", import.meta.url)), "utf8");
t("…the team page's deactivation ends them (setStaffStatusAction → clearRolesOf)", /if \(status === "inactive"\) \{[\s\S]{0,400}await clearRolesOf\(before, by, "deactivation"\)/.test(acts) && /async function clearRolesOf[\s\S]{0,700}ended = await endAllRolesOf\(before\.email, by\)/.test(acts));
t("…and a deactivated person takes no new one — the head or a founder included, while the row is inactive", (await assignSchemeRole({ schemeId: "26-01-T-1", personEmail: "dobreva@ptsbg.eu", role: "coding_expert", orderRef: ORDER, by: "x" })).ok === false);
delete process.env.PROVIDER_HEAD_EMAILS;

// ── the database keeps the rules ────────────────────────────────────────────
const sql = readFileSync(fileURLToPath(new URL("../supabase/migrations/0023_role_model.sql", import.meta.url)), "utf8");
t("0023: a permanent role is the quality manager or the software administrator (the head is named in the settings)", /permanent_role in \('quality', 'software_admin'\)/.test(sql));
t("…a scheme role is ended, never removed", /a role is ended, never removed/.test(sql) && /revoke delete, truncate on public\.scheme_roles from service_role/.test(sql) && /before truncate on public\.scheme_roles/.test(sql));
t("…the software administrator holds no scheme role, refused by the database too", /u\.permanent_role = 'software_admin'/.test(sql));
t("…and only a held role is ended, once", /only a held role is ended, once/.test(sql));
t("…a role is held once at a time (two at once: the index answers)", /create unique index if not exists scheme_roles_held_once on public\.scheme_roles \(scheme_id, lower\(person_email\), role\) where ended_at is null/.test(sql));
t("…the two guards cannot both pass at once: the insert locks the person's team row first", /perform 1 from public\.staff_users u where lower\(u\.email\) = lower\(new\.person_email\) for update;\s*if exists/.test(sql));
t("…nobody becomes the software administrator while holding a scheme role", /before update of permanent_role on public\.staff_users/.test(sql) && /new\.permanent_role = 'software_admin'[\s\S]*r\.ended_at is null/.test(sql));
const exp = readFileSync(fileURLToPath(new URL("../src/lib/round-export.ts", import.meta.url)), "utf8");
t("the round's roles are in the round export (who held what, from the Order)", /scheme_roles: \["coded\/scheme_roles\.csv"\]/.test(exp) && /listSchemeRoles\(\{ schemeId, all: true \}\)/.test(exp));

console.log(`role-model.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
