// The three processing acts of a scheme (plan part 2.5, Реш. 140; П 7.4.1 т. 3):
// per scheme, who processes (the statistics or a technical expert), who reviews (the
// quality manager or an authorised person from the Order) and who approves (the
// scheme manager). Two acts on one person: a warning and a written justification.
// The quality manager processes: the reviewer is an authorised person from the Order.
// The record keeps every designation; the database checks the rules again.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkProcessing, coincidences, reviewerBasis, basisHolds, charCount, MIN_JUSTIFICATION, MAX_JUSTIFICATION } from "../src/lib/processing-model.ts";
import { personRoles } from "../src/lib/scheme-roles.ts";
import { effectiveRoles, type PersonRoles } from "../src/lib/role-model.ts";
import { designateProcessing, currentDesignation, listDesignations, designationStatus, processingCandidates } from "../src/lib/processing-roles.ts";
import { assignSchemeRole, endSchemeRole, listSchemeRoles } from "../src/lib/scheme-roles.ts";
import { addStaff, updateStaff, getStaffByEmail } from "../src/lib/staff.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

// ── the decision itself, on hand-made roles ─────────────────────────────────
const S = "A";
const R: Record<string, PersonRoles> = {
  "stat@x": { permanent: [], schemes: { A: ["statistics_expert"] } },
  "tech@x": { permanent: [], schemes: { A: ["technical_expert"] } },
  "coder@x": { permanent: [], schemes: { A: ["coding_expert"] } },
  "qm@x": { permanent: ["quality"], schemes: {} },
  "qmstat@x": { permanent: ["quality"], schemes: { A: ["statistics_expert"] } },
  "auth@x": { permanent: [], schemes: { A: ["reviewer"] } },
  "auth-b@x": { permanent: [], schemes: { B: ["reviewer"] } },
  "sm@x": { permanent: [], schemes: { A: ["scheme_manager"] } },
  "smstat@x": { permanent: [], schemes: { A: ["scheme_manager", "statistics_expert"] } },
  "sm-b@x": { permanent: [], schemes: { B: ["scheme_manager"] } },
  "head@x": { permanent: ["head"], schemes: {} },
  "admin@x": effectiveRoles({ permanent: ["software_admin"], schemes: { A: ["statistics_expert", "scheme_manager", "reviewer"] } }),
};
const rolesOf = (e: string) => R[e] ?? { permanent: [], schemes: {} };
// the decision looks people up lowercased: every key above must be found as it is
t("(the test's own people are all found)", Object.keys(R).every((e) => e === e.toLowerCase()));
const check = (processor: string, reviewer: string, approver: string, why = "") => checkProcessing({ processor, reviewer, approver }, rolesOf, S, why);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const ok1 = check("stat@x", "qm@x", "sm@x");
t("the statistics expert processes, the quality manager reviews, the scheme manager approves", ok1.problems.length === 0 && ok1.coincide.length === 0 && ok1.basis === "quality");
t("a technical expert may process (Реш. 140)", check("tech@x", "qm@x", "sm@x").problems.length === 0);
t("the coding expert may not process", same(check("coder@x", "qm@x", "sm@x").problems, ["processor-role"]));
t("…nor the head without a role in the scheme", same(check("head@x", "qm@x", "sm@x").problems, ["processor-role"]));
const ok2 = check("stat@x", "auth@x", "sm@x");
t("an authorised person from the Order reviews — on the ground of the Order", ok2.problems.length === 0 && ok2.basis === "order");
t("…but only in the scheme whose Order names them", same(check("stat@x", "auth-b@x", "sm@x").problems, ["reviewer-role"]));
t("someone who is neither may not review", same(check("stat@x", "tech@x", "sm@x").problems, ["reviewer-role"]));
t("only this scheme's manager approves", same(check("stat@x", "qm@x", "sm-b@x").problems, ["approver-role"]) && same(check("stat@x", "qm@x", "head@x").problems, ["approver-role"]));
const admin = check("admin@x", "admin@x", "admin@x", "a long enough justification");
t("the software administrator does none of the three, whatever roles it was given (П 7.4.1 т. 3)", ["processor-role", "reviewer-role", "approver-role"].every((p) => admin.problems.includes(p as never)));
t("nobody named: refused for each act", same(check("", "", "").problems, ["processor-role", "reviewer-role", "approver-role"]));

// the quality manager processes
const qm1 = check("qmstat@x", "qmstat@x", "sm@x", "the quality manager is the only statistician");
t("the quality manager processes: not their own review, justification or not (Реш. 140)", qm1.problems.includes("quality-processes"));
t("…nor another quality manager's on the permanent role", check("qmstat@x", "qm@x", "sm@x").problems.includes("quality-processes"));
const qm2 = check("qmstat@x", "auth@x", "sm@x");
t("…the reviewer is an authorised person from the Order", qm2.problems.length === 0 && qm2.basis === "order");

// two acts on one person
const two = check("smstat@x", "qm@x", "smstat@x");
t("processing and approval by one person: flagged, and refused without a justification", same(two.coincide, ["process-approve"]) && same(two.problems, ["justification"]));
t("…a word or two is not a justification", same(check("smstat@x", "qm@x", "smstat@x", " too short ").problems, ["justification"]));
t(`…${MIN_JUSTIFICATION} characters and up is`, check("smstat@x", "qm@x", "smstat@x", "Само един статистик в Заповедта.").problems.length === 0);
t("the coincidences, case and spaces aside", same(coincidences({ processor: "A@x ", reviewer: "a@X", approver: " a@x" }), ["process-review", "process-approve", "review-approve"]));
t("…and none when the three differ", coincidences({ processor: "a@x", reviewer: "b@x", approver: "c@x" }).length === 0);
t("…nor when nobody is named yet", coincidences({ processor: "", reviewer: "", approver: "" }).length === 0);
t("a justification is counted in characters, as the database counts them (an emoji is one)", charCount("😀😀😀😀😀") === 5 && same(check("smstat@x", "qm@x", "smstat@x", "😀😀😀😀😀").problems, ["justification"]));
t("the ground a reviewer was designated on, checked as it was given", basisHolds(R["auth@x"], "A", "order") && !basisHolds(R["auth@x"], "A", "quality") && basisHolds(R["qm@x"], "A", "quality") && !basisHolds(R["qm@x"], "A", "order"));
t("the reviewer's ground: the Order before the permanent role", reviewerBasis({ permanent: ["quality"], schemes: { A: ["reviewer"] } }, "A") === "order" && reviewerBasis(R["qm@x"], "A") === "quality" && reviewerBasis(R["stat@x"], "A") === null);

// ── the record (in memory) ──────────────────────────────────────────────────
const SCHEME = "26-01-T-1";
const ORDER = "Заповед № 7/04.11.2026";
for (const [email, name, permanentRole] of [["qm@ptsbg.eu", "Качество", "quality"], ["stat@ptsbg.eu", "Статистик", null], ["tech@ptsbg.eu", "Техник", null],
  ["sm@ptsbg.eu", "Ръководител", null], ["auth@ptsbg.eu", "Упълномощен", null], ["admin@ptsbg.eu", "Админ", "software_admin"]] as const) {
  await addStaff({ email, name, role: "staff" });
  if (permanentRole) await updateStaff((await getStaffByEmail(email))!.id, { permanentRole });
}
const give = async (email: string, role: string) => {
  const r = await assignSchemeRole({ schemeId: SCHEME, personEmail: email, role, orderRef: ORDER, by: "head@ptsbg.eu" });
  if (!r.ok) throw new Error(`${email} ${role}: ${r.error}`);
  return r.entry;
};
await give("stat@ptsbg.eu", "statistics_expert");
await give("tech@ptsbg.eu", "technical_expert");
await give("sm@ptsbg.eu", "scheme_manager");
await give("auth@ptsbg.eu", "reviewer");
t("the Order names the authorised reviewer as a scheme role", (await listSchemeRoles({ schemeId: SCHEME })).some((r) => r.personEmail === "auth@ptsbg.eu" && r.role === "reviewer"));
t("…and never the software administrator", !(await assignSchemeRole({ schemeId: SCHEME, personEmail: "admin@ptsbg.eu", role: "reviewer", orderRef: ORDER, by: "head@ptsbg.eu" })).ok);

const cand = await processingCandidates(SCHEME);
const emails = (c: { email: string }[]) => c.map((x) => x.email).sort();
t("who may process: the statistics and the technical expert", same(emails(cand.processors), ["stat@ptsbg.eu", "tech@ptsbg.eu"]));
t("who may review: the quality manager and the authorised person, each with the ground", same(cand.reviewers.map((c) => `${c.email}:${c.basis}`).sort(), ["auth@ptsbg.eu:order", "qm@ptsbg.eu:quality"]));
t("who may approve: the scheme manager; the software administrator nowhere", same(emails(cand.approvers), ["sm@ptsbg.eu"]) && ![...cand.processors, ...cand.reviewers, ...cand.approvers].some((c) => c.email === "admin@ptsbg.eu"));
t("…with their names, for the page", cand.processors.find((c) => c.email === "stat@ptsbg.eu")?.name === "Статистик");

const noScheme = await designateProcessing({ schemeId: "no-such", processor: "stat@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", by: "head@ptsbg.eu" });
t("a scheme that does not exist: refused as such", !noScheme.ok && noScheme.error === "scheme");
const d1 = await designateProcessing({ schemeId: SCHEME, processor: " Stat@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", justification: "not needed", by: "head@ptsbg.eu" });
t("the head designates the three", d1.ok && d1.entry.processor === "stat@ptsbg.eu" && d1.entry.reviewerBasis === "quality" && d1.previous === null);
t("…a justification is kept only where two acts coincide", d1.ok && d1.entry.justification === "" && d1.entry.coincide.length === 0);
t("…and it is the current designation", (await currentDesignation(SCHEME))?.id === (d1.ok ? d1.entry.id : ""));
const again = await designateProcessing({ schemeId: SCHEME, processor: "stat@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", by: "head@ptsbg.eu" });
t("the same three again: nothing new on record", again.ok && again.unchanged === true && (await listDesignations({ schemeId: SCHEME, all: true })).length === 1);

// the auditor (read-only, outside the model): no permanent role counts, whatever is left
await addStaff({ email: "aud@ptsbg.eu", name: "Одитор", role: "staff" });
await updateStaff((await getStaffByEmail("aud@ptsbg.eu"))!.id, { permanentRole: "quality" });
await updateStaff((await getStaffByEmail("aud@ptsbg.eu"))!.id, { role: "auditor" });
t("an auditor left with the quality manager's role holds none of it", (await personRoles("aud@ptsbg.eu")).permanent.length === 0);
t("…is not offered as a reviewer", !(await processingCandidates(SCHEME)).reviewers.some((c) => c.email === "aud@ptsbg.eu"));
const audRev = await designateProcessing({ schemeId: SCHEME, processor: "stat@ptsbg.eu", reviewer: "aud@ptsbg.eu", approver: "sm@ptsbg.eu", by: "head@ptsbg.eu" });
t("…refused as the reviewer", !audRev.ok && audRev.error === "rules" && audRev.problems.includes("reviewer-role"));

const before = (await listDesignations({ schemeId: SCHEME, all: true })).length;
const refused = await designateProcessing({ schemeId: SCHEME, processor: "sm@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", by: "head@ptsbg.eu" });
t("the scheme manager who is not an expert may not process", !refused.ok && refused.error === "rules" && refused.problems.includes("processor-role"));
await give("sm@ptsbg.eu", "statistics_expert");
const noWhy = await designateProcessing({ schemeId: SCHEME, processor: "sm@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", by: "head@ptsbg.eu" });
t("…as a statistics expert too: processing and approval coincide — refused without a justification", !noWhy.ok && noWhy.error === "rules" && same(noWhy.problems, ["justification"]) && same(noWhy.coincide, ["process-approve"]));
t("…and a refusal records nothing", (await listDesignations({ schemeId: SCHEME, all: true })).length === before && (await currentDesignation(SCHEME))?.id === (d1.ok ? d1.entry.id : ""));
const WHY = "  В Заповедта има само един статистик за тази схема.  ";
const d2 = await designateProcessing({ schemeId: SCHEME, processor: "sm@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", justification: WHY, by: "head@ptsbg.eu" });
t("…with a written justification: recorded, the coincidence with it", d2.ok && same(d2.entry.coincide, ["process-approve"]) && d2.entry.justification === WHY.trim());
t("…the earlier designation is ENDED, not removed — and named as the previous one", d2.ok && d1.ok && d2.previous?.id === d1.entry.id);
const all = await listDesignations({ schemeId: SCHEME, all: true });
t("…the record keeps both, one current", all.length === before + 1 && all.filter((d) => !d.endedAt).length === 1 && !!all.find((d) => d1.ok && d.id === d1.entry.id)?.endedBy);
t("a justification is cut to its length", (await designateProcessing({ schemeId: SCHEME, processor: "sm@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", justification: "я".repeat(MAX_JUSTIFICATION + 50), by: "head@ptsbg.eu" })).ok
  && (await currentDesignation(SCHEME))!.justification.length === MAX_JUSTIFICATION);

// the quality manager processes
await give("qm@ptsbg.eu", "statistics_expert");
const qmSelf = await designateProcessing({ schemeId: SCHEME, processor: "qm@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", justification: "the quality manager is the only statistician", by: "head@ptsbg.eu" });
t("the quality manager processes and reviews: refused, justification or not", !qmSelf.ok && qmSelf.error === "rules" && qmSelf.problems.includes("quality-processes"));
const qmOk = await designateProcessing({ schemeId: SCHEME, processor: "qm@ptsbg.eu", reviewer: "auth@ptsbg.eu", approver: "sm@ptsbg.eu", by: "head@ptsbg.eu" });
t("…the authorised person from the Order reviews", qmOk.ok && qmOk.entry.reviewerBasis === "order");

// a designation that no longer holds
t("today's designation holds", (await designationStatus(SCHEME)).problems.length === 0);
const authRole = (await listSchemeRoles({ schemeId: SCHEME })).find((r) => r.personEmail === "auth@ptsbg.eu" && r.role === "reviewer")!;
await endSchemeRole(authRole.id, "head@ptsbg.eu");
const stale = await designationStatus(SCHEME);
t("the reviewer's role from the Order ended: the designation no longer holds", same(stale.problems, ["reviewer-role", "quality-processes"]) && !!stale.current);
// an authorised reviewer who is also the quality manager: the Order role ends — they may
// still review as the quality manager, but not «by the Order» as designated
await updateStaff((await getStaffByEmail("auth@ptsbg.eu"))!.id, { permanentRole: "quality" });
const r2 = await give("auth@ptsbg.eu", "reviewer");
const byOrder = await designateProcessing({ schemeId: SCHEME, processor: "tech@ptsbg.eu", reviewer: "auth@ptsbg.eu", approver: "sm@ptsbg.eu", by: "head@ptsbg.eu" });
t("(an authorised person who is also the quality manager is designated by the Order)", byOrder.ok && byOrder.entry.reviewerBasis === "order");
await endSchemeRole(r2.id, "head@ptsbg.eu");
t("…their Order role ends: the designation no longer holds, though they are the quality manager", same((await designationStatus(SCHEME)).problems, ["reviewer-role"]));
await updateStaff((await getStaffByEmail("stat@ptsbg.eu"))!.id, { status: "inactive" });
t("a deactivated person is designated for nothing", !(await designateProcessing({ schemeId: SCHEME, processor: "stat@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "sm@ptsbg.eu", by: "head@ptsbg.eu" })).ok);

// ── the action, the database and the rest of the portal ─────────────────────
const actions = read("../src/lib/actions.ts");
const body = (name: string) => { const i = actions.indexOf(`export async function ${name}(`); return i < 0 ? "" : actions.slice(i, actions.indexOf("\nexport ", i + 10)); };
const act = body("designateProcessingAction");
t("the action: the head of the PT provider's, first of all (he issues the Order)", /\{\n\s*await requirePeopleManager\(\);/.test(act));
t("…journalled, and in the change register (rule 7)", act.includes('logActivity("processing.designated"') && act.includes("recordSettingChange("));
t("…a refusal names each problem", /r\.problems\.map\(\(p\) => PROCESSING_REFUSAL\[p\]\)/.test(act));
t("…two at once, or the database's own refusal, say so — not «try again»", /r\.error === "conflict"/.test(act) && /r\.error === "refused"/.test(act));
t("…the same three again record nothing", /if \(r\.unchanged\) return \{ ok: true \};/.test(act));
t("becoming the auditor ends what the person holds, on record (as a deactivation does)", /if \(role === "auditor"\) \{\s*const cleared = await clearRolesOf\(before, me \?\? "build", "auditor"\);/.test(body("setStaffRoleAction")) && /clearRolesOf\(before, by, "deactivation"\)/.test(body("setStaffStatusAction")));

const sql = read("../supabase/migrations/0026_processing_roles.sql");
t("0026: the authorised reviewer is a role of the Order", /scheme_roles_role_check[\s\S]*'reviewer'\)\)/.test(sql));
t("…the database works out the coincidences itself", /new\.coincide := array_remove\(array\[/.test(sql) && /new\.processor_email = new\.approver_email then 'process-approve'/.test(sql));
t(`…and refuses one without a justification (${MIN_JUSTIFICATION} characters, as the portal)`, new RegExp(`cardinality\\(new\\.coincide\\) > 0 and char_length\\(new\\.justification\\) < ${MIN_JUSTIFICATION}`).test(sql));
t(`…a justification of at most ${MAX_JUSTIFICATION}, as the portal`, sql.includes(`char_length(justification) <= ${MAX_JUSTIFICATION}`));
t("…who may do each act, again", /r\.role in \('statistics_expert', 'technical_expert'\)/.test(sql) && /r\.role = 'scheme_manager'/.test(sql) && /r\.role = 'reviewer'/.test(sql) && /u\.permanent_role = 'quality' and u\.status = 'active'/.test(sql));
t("…the quality manager's processing, the software administrator, an inactive person or the auditor", /reviewer_basis <> 'order' or new\.reviewer_email = new\.processor_email/.test(sql) && /permanent_role = 'software_admin'/.test(sql) && /u\.status <> 'active' or u\.role = 'auditor'/.test(sql));
t("…a record: no delete, no truncate, an update only ends it once", /tg_op in \('DELETE', 'TRUNCATE'\)/.test(sql) && /revoke delete, truncate on public\.processing_roles from service_role/.test(sql) && /only a current designation is ended, once/.test(sql));
t("…the rows it checks are locked first (a role ended at the same moment is seen)", /perform 1 from public\.staff_users u[\s\S]*?for update;[\s\S]*?perform 1 from public\.scheme_roles r[\s\S]*?for update;[\s\S]*?PTS's active people only/.test(sql));
t("…and the function returns the one it ended, for the journal", /returning \* into prev;/.test(sql) && /'previous', case when prev\.id is null then null else to_jsonb\(prev\) end/.test(sql));
t("…one current per scheme", /unique index if not exists processing_roles_current on public\.processing_roles \(scheme_id\) where ended_at is null/.test(sql));
t("…a new one ends the current one in one function, for the server key only", /function public\.processing_roles_set[\s\S]*security definer set search_path = ''/.test(sql)
  && /revoke execute on function public\.processing_roles_set[^;]*from public, anon, authenticated/.test(sql) && /grant execute on function public\.processing_roles_set[^;]*to service_role/.test(sql));
t("…closed to the API, and marked applied", /enable row level security/.test(sql) && /revoke all on public\.processing_roles from anon, authenticated/.test(sql) && sql.includes("('0026_processing_roles')"));
t("the build gate expects it", read("../src/lib/migrations-list.ts").includes('"0026_processing_roles"'));
t("the round export carries every designation", /processing_roles: \["coded\/processing_roles\.csv"\]/.test(read("../src/lib/round-export.ts")));
t("the scheme page shows it to everyone who opens the scheme; the head designates", /<SchemeProcessing [\s\S]*canDesignate=\{canDesignate\}/.test(read("../src/app/schemes/[id]/page.tsx")) && read("../src/app/schemes/[id]/page.tsx").includes("canManagePeople(await getRoleContext())"));
t("the system check names schemes with nobody designated, and designations that no longer hold", /schemesWithoutProcessing/.test(read("../src/lib/system-check.ts")) && /processingStale/.test(read("../src/app/system/page.tsx")));

console.log(`processing-roles.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
