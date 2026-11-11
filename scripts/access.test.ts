// The access matrix, enforced (plan part 2.4): authorize(user, scheme, capability)
// with a role × capability test matrix. The expected rights are written out here by
// hand — not read from RIGHTS — so a change to who may do what fails this test until
// someone decides it (Реш. 93, 114, 140; D5, D18; П 7.4.1 т. 3).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { authorize, authorizeAnywhere, schemesFor, parseModelPersona, NONE, type Viewer } from "../src/lib/access-matrix.ts";
import { CAPABILITIES, effectiveRoles, type Capability, type PersonRoles } from "../src/lib/role-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const viewer = (roles: PersonRoles, more: Partial<Viewer> = {}): Viewer => ({ email: "x@ptsbg.eu", roles, build: false, auditor: false, lab: false, ...more });

// ── the matrix: a scheme role in ITS scheme ("A") ───────────────────────────
const IN_SCHEME: Record<string, Capability[]> = {
  scheme_manager: ["names.view", "codes.view", "results.read", "order.view", "scheme.edit", "docs.release", "dispatch", "journal.read", "approve", "library.manage", "participants.manage", "labs.manage"],
  coding_expert: ["names.view", "codes.view", "results.read", "order.view", "results.enter", "dispatch", "participants.manage", "labs.manage"],
  statistics_expert: ["codes.view", "results.read", "order.view", "results.process"],
  // may process (Реш. 140: «експерт по статистическа обработка или технически експерт»)
  technical_expert: ["codes.view", "results.read", "order.view", "results.process", "items.manage"],
  // the authorised person for the independent review, from the Order (2.5, Реш. 140)
  reviewer: ["codes.view", "results.read", "order.view", "journal.read", "review"],
};
for (const [role, allowed] of Object.entries(IN_SCHEME)) {
  const v = viewer({ permanent: [], schemes: { A: [role as never] } });
  const wrong = CAPABILITIES.filter((c) => authorize(v, c, "A") !== allowed.includes(c));
  t(`${role} in its own scheme: exactly ${allowed.length} rights`, wrong.length === 0, wrong.join());
  t(`${role} in another scheme: nothing`, CAPABILITIES.every((c) => !authorize(v, c, "B")));
  t(`${role} asked without a scheme: nothing (a page that forgets the scheme sees less)`, CAPABILITIES.every((c) => !authorize(v, c)));
  t(`${role} somewhere: its own rights, for what is not bound to one scheme`, CAPABILITIES.every((c) => authorizeAnywhere(v, c) === allowed.includes(c)));
}

// ── permanent roles: anywhere ───────────────────────────────────────────────
const PERMANENT: Record<string, Capability[]> = {
  head: ["people.manage", "order.manage", "order.view", "register.authorise", "twofa.reset", "codes.view", "journal.read", "scheme.create", "library.manage", "texts.approve", "system.technical", "validation.record"],
  // the Zadanie's matrix: «кодове и резултати без имена» — да (2.5: the review needs them)
  quality: ["journal.read", "codes.view", "results.read", "review", "validation.record"],
  software_admin: ["system.technical", "register.propose", "journal.read"],
};
for (const [role, allowed] of Object.entries(PERMANENT)) {
  const v = viewer({ permanent: [role as never], schemes: {} });
  for (const where of ["A", undefined]) {
    const wrong = CAPABILITIES.filter((c) => authorize(v, c, where) !== allowed.includes(c));
    t(`${role}${where ? " in a scheme" : " anywhere"}: exactly ${allowed.length} rights`, wrong.length === 0, wrong.join());
  }
}

// ── the decisions the matrix keeps ──────────────────────────────────────────
const holders = (cap: Capability) => [...Object.keys(IN_SCHEME), ...Object.keys(PERMANENT)].filter((r) => (IN_SCHEME[r] ?? PERMANENT[r]).includes(cap)).sort();
t("who is behind a code: the scheme manager and the coding expert, no one else (Реш. 93)", JSON.stringify(holders("names.view")) === JSON.stringify(["coding_expert", "scheme_manager"]));
t("…the quality manager never (Реш. 114)", !authorize(viewer({ permanent: ["quality"], schemes: {} }), "names.view", "A"));
const head = viewer({ permanent: ["head"], schemes: {} });
t("the head: no names without a role from the Order (D5) …", !authorize(head, "names.view", "A"));
t("…with one, in that scheme only", authorize(viewer({ permanent: ["head"], schemes: { A: ["scheme_manager"] } }), "names.view", "A") && !authorize(viewer({ permanent: ["head"], schemes: { A: ["scheme_manager"] } }), "names.view", "B"));
t("the technical expert: no names, no dispatch — the objects (D18)", !authorize(viewer({ permanent: [], schemes: { A: ["technical_expert"] } }), "dispatch", "A") && authorize(viewer({ permanent: [], schemes: { A: ["technical_expert"] } }), "items.manage", "A"));
t("dispatch with identities: the scheme manager or the coding expert (D18)", JSON.stringify(holders("dispatch")) === JSON.stringify(["coding_expert", "scheme_manager"]));
const admin = viewer(effectiveRoles({ permanent: ["software_admin", "head"], schemes: { A: ["scheme_manager"] } }));
t("the software administrator: never processes, reviews or approves, no names — whatever else it was given (П 7.4.1 т. 3)",
  ["results.process", "review", "approve", "names.view", "codes.view", "register.authorise", "people.manage"].every((c) => !authorize(admin, c as Capability, "A")) && authorize(admin, "system.technical"));
t("the Order: every role of the scheme and the head who issues it — not the quality manager, the auditor or the software administrator (Реш. 149)", JSON.stringify(holders("order.view")) === JSON.stringify(["coding_expert", "head", "reviewer", "scheme_manager", "statistics_expert", "technical_expert"]));
t("the approval (the third act) is the scheme manager's (Реш. 140)", JSON.stringify(holders("approve")) === JSON.stringify(["scheme_manager"]));
t("the processing (the first act): the statistics expert or a technical expert (Реш. 140)", JSON.stringify(holders("results.process")) === JSON.stringify(["statistics_expert", "technical_expert"]));
t("the review (the second act): the quality manager or an authorised person from the Order (Реш. 140)", JSON.stringify(holders("review")) === JSON.stringify(["quality", "reviewer"]));
t("…and the authorised reviewer sees no name either (Реш. 93)", !authorize(viewer({ permanent: [], schemes: { A: ["reviewer"] } }), "names.view", "A"));
t("a new scheme: the head — the Order starts it", JSON.stringify(holders("scheme.create")) === JSON.stringify(["head"]));
t("PTS's people: the head (Реш. 141)", JSON.stringify(holders("people.manage")) === JSON.stringify(["head"]));

// ── outside the model: the auditor, the laboratory, the build ───────────────
const auditor = viewer(NONE, { auditor: true });
t("the auditor: codes, results and the journal, everywhere — never a name, never a change",
  ["codes.view", "results.read", "journal.read"].every((c) => authorize(auditor, c as Capability, "A") && authorize(auditor, c as Capability))
  && CAPABILITIES.filter((c) => !["codes.view", "results.read", "journal.read"].includes(c)).every((c) => !authorize(auditor, c, "A")));
const lab = viewer({ permanent: ["head"], schemes: { A: ["scheme_manager"] } }, { lab: true });
t("a laboratory: nothing here, whatever it holds", CAPABILITIES.every((c) => !authorize(lab, c, "A") && !authorizeAnywhere(lab, c)));
t("someone signed in with no role: nothing", CAPABILITIES.every((c) => !authorize(viewer(NONE), c, "A") && !authorizeAnywhere(viewer(NONE), c)));
t("the local build (login off, no persona): everything", CAPABILITIES.every((c) => authorize(viewer(NONE, { build: true }), c, "A")));

// ── list pages: the schemes one works in ───────────────────────────────────
t("schemes to list: a scheme role, its schemes", JSON.stringify(schemesFor(viewer({ permanent: [], schemes: { A: ["statistics_expert"], B: ["technical_expert"] } }), "codes.view")) === JSON.stringify(["A", "B"]));
t("…the head, the quality manager and the auditor: all", schemesFor(head, "codes.view") === "all" && schemesFor(viewer({ permanent: ["quality"], schemes: {} }), "codes.view") === "all" && schemesFor(auditor, "codes.view") === "all");
t("…the software administrator: none", JSON.stringify(schemesFor(viewer({ permanent: ["software_admin"], schemes: {} }), "codes.view")) === "[]");
t("…a scheme role's journal: its own scheme only", JSON.stringify(schemesFor(viewer({ permanent: [], schemes: { A: ["scheme_manager"], B: ["statistics_expert"] } }), "journal.read")) === JSON.stringify(["A"]));

// ── development personas for the model ──────────────────────────────────────
t("a model persona: permanent and per scheme", JSON.stringify(parseModelPersona("quality,scheme_manager@26-01-T-1")) === JSON.stringify({ permanent: ["quality"], schemes: { "26-01-T-1": ["scheme_manager"] } }));
t("…anything else refused", parseModelPersona("manager") === null && parseModelPersona("scheme_manager") === null && parseModelPersona("quality@A") === null && parseModelPersona("scheme_manager@a b") === null && parseModelPersona("") === null);

// ── enforced everywhere: no earlier gate is left ────────────────────────────
const root = fileURLToPath(new URL("..", import.meta.url));
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
walk(join(root, "src"));
const src = (p: string) => readFileSync(p, "utf8").replace(/\/\/[^\n]*/g, "");
const rel = (p: string) => p.slice(root.length);
const stale = files.filter((f) => !f.endsWith("lib/roles.ts") && /\b(requireManager|requireWriter|canRevealNames|canRevealNamesNow|getCurrentRole)\(/.test(src(f))).map(rel);
t("no page or action is gated by the earlier roles any more", stale.length === 0, stale.join());
// every HANDLER of a scheme page or route — not just the file — asks the role model
// in ITS scheme, as a gate (a refusal), not only to decide what to show
// (a thin handler that hands the request to a local function — `serve`, which the
// journal's download wrappers use, 1.9 — is gated by that function)
const handlers: { f: string; name: string; body: string; locals: Map<string, string> }[] = [];
// requireOneOf: one of several capabilities, in THIS scheme (the reference values, 5.7)
const GATED = /(await requireCap\("[a-z.]+", id\)|await requireOneOf\(\[(?:"[a-z.]+"(?:, )?)+\], id\)|if \(!\(await mayNow\("[a-z.]+", id\)\)\) return new Response)/;
for (const f of files.filter((x) => /src\/app\/schemes\/\[id\]\//.test(x))) {
  const s = src(f);
  const at = [...s.matchAll(/(export (?:default )?)?async function (\w+)/g)].map((m) => ({ i: m.index!, exported: !!m[1], name: m[2] }));
  const bodies = at.map((h, k) => ({ ...h, body: s.slice(h.i, at[k + 1]?.i ?? s.length) }));
  const locals = new Map(bodies.filter((b) => !b.exported).map((b) => [b.name, b.body]));
  for (const b of bodies.filter((x) => x.exported)) handlers.push({ f: rel(f), name: b.name, body: b.body, locals });
}
const gatedHandler = (h: (typeof handlers)[number]) => GATED.test(h.body) || [...h.locals].some(([n, body]) => new RegExp(`\\b${n}\\(`).test(h.body) && GATED.test(body));
const ungatedHandlers = handlers.filter((h) => !gatedHandler(h)).map((h) => `${h.f}#${h.name}`);
t(`every scheme page and route handler (${handlers.length}) is gated in ITS scheme`, handlers.length >= 19 && ungatedHandlers.length === 0, ungatedHandlers.join());
const actions = src(join(root, "src/lib/actions.ts"));
const needs = (fn: string, cap: string, scoped = true) => new RegExp(`export async function ${fn}\\([\\s\\S]{0,700}?await requireCap${scoped ? "" : "(?:Anywhere)?"}\\("${cap.replace(".", "\\.")}"${scoped ? ", (?:schemeId|id|String\\(formData\\.get\\(\"id\"\\) \\?\\? \"\"\\))\\)" : "\\)"}`).test(actions);
for (const [fn, cap] of [
  ["addParticipantAction", "participants.manage"], ["updateParticipantAction", "participants.manage"], ["approveApplicationAction", "participants.manage"],
  ["issueCertificateAction", "approve"], ["setDocSentAction", "docs.release"], ["addCaseEventAction", "dispatch"], ["stampChainStopAction", "dispatch"],
  ["updateSchemeAction", "scheme.edit"], ["uploadSchemeDocAction", "scheme.edit"], ["issueEditionAction", "scheme.edit"], ["autoAssignAction", "results.process"],
] as const) t(`${fn}: ${cap}, in its scheme`, needs(fn, cap));
// every exported action begins with a gate — the model's, the head's, a laboratory's
// own session (ownGoingOn, 5.6: a laboratory's account or an entity's user, its own
// participation going on) — or is one of the few named here and why
const allActions = [...actions.matchAll(/^export async function (\w+)/gm)].map((m, k, all) => {
  const seg = actions.slice(m.index!, all[k + 1]?.index ?? actions.length);
  return [seg, m[1], seg.slice(seg.indexOf("{\n") + 2, seg.indexOf("{\n") + 702)] as const;
});
const OPEN: Record<string, string> = {
  submitApplicationAction: "the public application to a scheme",
  submitRegistrationAction: "the public registration of an organisation (9.1) — the honeypot, the per-address limit, a neutral answer",
  inviteLabAction: "a form wrapper of inviteLabByIdAction, which is gated",
};
const noGate = allActions.filter(([, name, head]) => !(name in OPEN) && !/await (requireCap|requireCapAnywhere|requireOneOf|requirePeopleManager|requireDocWriter|getLabSession|requireParticipant|participantViewer|myChainStop|ownGoingOn)\(/.test(head)).map(([, n]) => n);
t(`every action (${allActions.length}) starts with a gate`, allActions.length > 70 && noGate.length === 0, noGate.join());
t("…the open ones are what they say", /export async function inviteLabAction[\s\S]{0,200}await inviteLabByIdAction\(/.test(actions));
for (const [fn, cap] of [
  ["voidCaseEventAction", "scheme.edit"], ["approveDocRevisionAction", "scheme.edit"], ["restoreDocRevisionAction", "scheme.edit"], ["setChainAction", "dispatch"],
  ["setChainPaceAction", "dispatch"], ["confirmChainDispatchAction", "dispatch"], ["confirmChainReturnAction", "dispatch"], ["setSchemeDatesAction", "scheme.edit"],
  ["setParticipantPaidAction", "participants.manage"], ["uploadLabDocAction", "participants.manage"], ["removeLabDocAction", "participants.manage"],
  ["rejectApplicationAction", "participants.manage"], ["renameSchemeAction", "scheme.edit"], ["removeSchemeDocUploadAction", "scheme.edit"], ["saveSchemeSkinAction", "scheme.edit"], ["setTestClockAction", "scheme.edit"],
  ["lifecycleActAction", "scheme.edit"],
] as const) t(`${fn}: ${cap}, in its scheme`, needs(fn, cap));
t("a stage's tick: its role's capability in the scheme, or the designated person's act's own (3.2)", /export async function stageTickAction[\s\S]{0,1400}await requireCap\(ticker\.cap, schemeId\);[\s\S]{0,200}await requireCap\(ticker\.designated === "processor" \? "results\.process" : ticker\.designated === "reviewer" \? "review" : "approve", schemeId\);/.test(actions));
t("saving results: entered OR processed, in its scheme; the consensus: processed", /export async function saveScoringAction[\s\S]{0,300}await requireOneOf\(\["results\.enter", "results\.process"\], String\(formData\.get\("id"\) \?\? ""\)\)/.test(actions) && needs("autoAssignAction", "results.process"));
t("a held notice: decided only after it is FOUND, in its own scheme", /const notice = id \? await getNotice\(id\)\.catch\(\(\) => null\) : null;\s*if \(!notice \|\| !\(await mayNow\("docs\.release", notice\.schemeId\)\)\) redirect/.test(actions));
t("the default cover: the shared library's gate, not a scheme editor's", /export async function uploadDefaultCoverAction[\s\S]{0,200}requireCapAnywhere\("library\.manage"\)[\s\S]{0,120}await storeCoverImage\(formData\)/.test(actions) && !/async function storeCoverImage[^{]*\{\s*await require/.test(actions));
t("a document with names is never a shared template", /if \(isListDoc\(docKey\) \|\| showsIdentities\(docKey\)\) return \{ error:/.test(actions));
for (const [fn, cap] of [["createSchemeAction", "scheme.create"], ["proposeChangeAction", "register.propose"], ["decideChangeAction", "register.authorise"], ["approveReminderTemplateAction", "texts.approve"], ["addLabAction", "labs.manage"], ["addLibraryItemAction", "library.manage"]] as const) {
  t(`${fn}: ${cap}`, needs(fn, cap, false));
}
t("F 7.2.1-6, the mapping: its editors only if they also see names there", /async function requireDocWriter\(docKey: string, schemeId\?: string\)[\s\S]{0,400}await requireCap\("scheme\.edit", schemeId\);\s*if \(isRestrictedDoc\(docKey\)\) await requireCap\("names\.view", schemeId\);/.test(actions));
t("in the data: the identity store opens only for names.view in THAT scheme", /if \(!\(await mayNow\("names\.view", schemeId\)\)\) return coded\.map\(withoutIdentity\);/.test(src(join(root, "src/lib/identities.ts"))));

// ── beyond the scheme pages ─────────────────────────────────────────────────
const page = (p: string) => src(join(root, p));
const build = page("src/app/schemes/[id]/build/[doc]/page.tsx");
t("the editor's «copy from»: only schemes where this person sees what the document shows", /\.filter\(\(o\) => authorize\(viewer, identityDoc \? "names\.view" : doc === ORDER_DOC \? "order\.view" : "codes\.view", o\.id\)\)/.test(build) && /const savedTemplates = identityDoc \|\| doc === ORDER_DOC \? \[\]/.test(build));
const notices = page("src/app/notices/page.tsx");
t("«Известия»: only the schemes one works in; deciding and addresses per scheme", /const held = heldAll\.filter\(\(n\) => inScope\(n\.schemeId\)\);/.test(notices) && /const sent = sentAll\.filter\(\(m\) => inScope\(m\.schemeId\)\);/.test(notices) && /mayDecide\(n\.schemeId\)/.test(notices) && /seesAddress\(m\.schemeId\) \? m\.to/.test(notices));
t("the bell: only the schemes one works in", /scope === "all" \|\| \(!!n\.schemeId && scope\.includes\(n\.schemeId\)\)/.test(page("src/app/layout.tsx")));
t("the journal page: a scheme role reads its own scheme's lines; names per line", /schemesFor\(viewer, "journal\.read"\)/.test(page("src/app/activity/page.tsx")) && /authorize\(viewer, "names\.view", e\.schemeId \?\? undefined\) \? e : redactActivityForStaff\(e\)/.test(page("src/app/activity/page.tsx")));
const pdf = page("src/app/api/pdf/route.ts");
t("/api/pdf: the scheme's codes, names per scheme", /if \(!\(await mayNow\("codes\.view", id\)\)\) return new Response\("Forbidden", \{ status: 403 \}\)/.test(pdf) && /const reveal = \(await mayNow\("names\.view", id\)\) \? "1" : ""/.test(pdf));
t("«Потребители»: the head's 2FA button by the model", /canReset2fa=\{ctx\.authEnabled && \(await mayNow\("twofa\.reset"\)\) && \(await isEffectiveHead\(me\)\)\}/.test(page("src/app/users/page.tsx")));
const acc = page("src/lib/access.ts");
t("the open build is LOCAL: on a deployment, login off grants nothing", /if \(!ctx\.authEnabled\) \{\s*(?:\/\/[^\n]*\s*)*if \(dbMode\(\)\.strict\) return \{ email: null, roles: NONE, build: false/.test(readFileSync(join(root, "src/lib/access.ts"), "utf8")));
t("the auditor stays outside the model, whatever roles that address was given", /if \(ctx\.role === "auditor"\) return \{ email: ctx\.email, roles: NONE, build: false, auditor: true/.test(acc) && /staff\.status === "active" && staff\.role !== "auditor"/.test(page("src/lib/scheme-roles.ts")));

console.log(`access.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
