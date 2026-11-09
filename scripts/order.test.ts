// The Order (plan part 2.6, Реш. 149): the scheme's Order is visible in the portal to
// the staff it assigns roles to — and never to a participant. Its scheme roles, the
// three designated from it to process, review and approve (2.5), and the head who
// issues it read it; the quality manager (unless designated), the auditor and the
// software administrator do not; no laboratory can ever fetch it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { authorize, seesOrder, NONE, type Viewer } from "../src/lib/access-matrix.ts";
import { effectiveRoles, type PersonRoles } from "../src/lib/role-model.ts";
import { SENDABLE_DOCS, isSendableDoc, canLabFetchDoc } from "../src/lib/doc-release.ts";
import { ORDER_DOC, getDoc } from "../src/lib/documents.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const viewer = (roles: PersonRoles, more: Partial<Viewer> = {}): Viewer => ({ email: "me@ptsbg.eu", roles, build: false, auditor: false, lab: false, ...more });

// ── who reads the Order of scheme A ─────────────────────────────────────────
const D = { schemeId: "A", processor: "stat@ptsbg.eu", reviewer: "me@ptsbg.eu", approver: "sm@ptsbg.eu" };
t("the Order is the scheme's «Заповед» document", ORDER_DOC === "order" && getDoc(ORDER_DOC)?.nameBg === "Заповед");
for (const role of ["scheme_manager", "coding_expert", "statistics_expert", "technical_expert", "reviewer"] as const) {
  const v = viewer({ permanent: [], schemes: { A: [role] } });
  t(`${role}: reads the Order of its own scheme — it is assigned by it`, seesOrder(v, "A", null));
  t(`${role}: not another scheme's`, !seesOrder(v, "B", null));
}
t("the head who issues it: every scheme's", seesOrder(viewer({ permanent: ["head"], schemes: {} }), "A", null));
const qm = viewer({ permanent: ["quality"], schemes: {} });
t("the quality manager: not by the permanent role (Реш. 149)", !seesOrder(qm, "A", null) && !authorize(qm, "order.view", "A"));
t("…but when the Order designates them to review this scheme (2.5), they read it", seesOrder(qm, "A", D));
t("…the designation counts in its own scheme only", !seesOrder(qm, "B", D));
t("…case and spaces aside", seesOrder({ ...qm, email: " Me@PTSbg.eu " }, "A", D));
t("…not someone else's designation", !seesOrder({ ...qm, email: "other@ptsbg.eu" }, "A", D));
t("the auditor: never, designated or not — even with a quality role left", !seesOrder(viewer({ permanent: ["quality"], schemes: {} }, { auditor: true }), "A", D));
t("a laboratory: never", !seesOrder(viewer(NONE, { lab: true }), "A", D) && !seesOrder(viewer({ permanent: [], schemes: { A: ["scheme_manager"] } }, { lab: true }), "A", D));
t("the software administrator: never, whatever it was given", !seesOrder(viewer(effectiveRoles({ permanent: ["software_admin", "head"], schemes: { A: ["scheme_manager"] } })), "A", D));
t("…nor one who holds nothing any more, though still in an old designation", !seesOrder(viewer(NONE), "A", D));
t("a processor whose role in the scheme ended (a role elsewhere left): not by the old designation", !seesOrder(viewer({ permanent: [], schemes: { B: ["statistics_expert"] } }, { email: "stat@ptsbg.eu" }), "A", D));
t("…nor a designated reviewer who is no longer the quality manager", !seesOrder(viewer({ permanent: [], schemes: { B: ["coding_expert"] } }), "A", D));
t("…nor the approver by the designation alone", !seesOrder(viewer({ permanent: ["quality"], schemes: {} }, { email: "sm@ptsbg.eu" }), "A", D));
t("…nor a model persona with no address", !seesOrder(viewer({ permanent: ["quality"], schemes: {} }, { email: null }), "A", D));
t("the local build: everything", seesOrder(viewer(NONE, { build: true }), "A", null));

// ── never a participant ─────────────────────────────────────────────────────
t("the Order is not among the documents that can be sent to participants", !SENDABLE_DOCS.includes(ORDER_DOC) && !isSendableDoc(ORDER_DOC));
t("…a laboratory cannot fetch it, whatever the round's state", !canLabFetchDoc(ORDER_DOC, { sent: { order: "2026-11-04" }, reported: true, hasCert: true, officialReport: true }));
const release = read("../src/lib/actions.ts");
t("…and sending to participants refuses anything not sendable", /if \(!def \|\| !isSendableDoc\(docKey\)\) return \{ error: "This document is not one the participants receive\." \}/.test(release));

// ── every way into a document asks ──────────────────────────────────────────
const at = (p: string) => read(`../src/app/${p}`);
for (const [p, re] of [
  ["schemes/[id]/doc/[doc]/page.tsx", /await requireDocView\(doc, id\);/],
  ["schemes/[id]/build/[doc]/page.tsx", /await requireDocView\(doc, id\);/],
  ["schemes/[id]/build/[doc]/history/page.tsx", /await requireDocView\(doc, id\);/],
  ["schemes/[id]/doc/[doc]/print/route.ts", /if \(!isInternal && !\(await mayViewDoc\(def\.key, id\)\)\) return new Response\("Forbidden — the Order/],
  ["schemes/[id]/build/[doc]/print/route.ts", /if \(!isInternal && !\(await mayViewDoc\(doc, id\)\)\) return new Response\("Forbidden — the Order/],
  ["schemes/[id]/fill/[doc]/route.ts", /if \(!\(await mayViewDoc\(doc, id\)\)\) return new Response\("Forbidden — the Order[\s\S]*await requireDocView\(doc, id\);/],
  ["schemes/[id]/uploaded/[doc]/route.ts", /if \(!\(await mayViewDoc\(doc, id\)\)\) return new Response\("Forbidden — the Order/],
  ["api/pdf/route.ts", /if \(!\(await mayViewDoc\(def\.key, id\)\)\) return new Response\("Forbidden — the Order/],
] as const) t(`${p}: asks who may read this document`, re.test(at(p)));
t("the internal renderer is admitted only after /api/pdf asked", /if \(!\(await mayViewDoc\(def\.key, id\)\)\)[\s\S]*x-internal-token/.test(at("api/pdf/route.ts")));
t("the scheme page lists the Order only to those who read it", /const seesOrder = await mayViewDoc\(ORDER_DOC, id\);/.test(at("schemes/[id]/page.tsx")) && /\(seesOrder \|\| k !== ORDER_DOC\)/.test(at("schemes/[id]/page.tsx")));
t("…so does the documents index", /\(seesOrder \|\| d\.key !== ORDER_DOC\)/.test(at("schemes/[id]/build/page.tsx")));
t("the editor's «copy from»: another scheme's Order only where one reads it", /doc === ORDER_DOC \? "order\.view"/.test(at("schemes/[id]/build/[doc]/page.tsx")));
t("«Потребители»: a scheme's roles (what its Order assigns) only where one reads that Order — unless one manages PTS's people", /peopleManager \? held : held\.filter\(\(r\) => authorize\(viewer, "order\.view", r\.schemeId\)\)/.test(at("users/page.tsx")));
t("no shared template of the Order: none offered, none saved", /identityDoc \|\| doc === ORDER_DOC \? \[\]/.test(at("schemes/[id]/build/[doc]/page.tsx")) && /if \(docKey === ORDER_DOC\) return \{ error: "Заповедта не се пази като шаблон/.test(release));
const changes = at("changes/page.tsx");
t("the change register: a scheme's roles and processing acts only to who reads that scheme's journal or Order, or manages PTS's people", /const seesScheme = \(schemeId: string\) => peopleManager \|\| authorize\(viewer, "journal\.read", schemeId\) \|\| authorize\(viewer, "order\.view", schemeId\);/.test(changes)
  && /if \(scheme\) return seesScheme\(scheme\);/.test(changes) && /\(scheme_role\|processing\):\/\.test\(e\.ref\)\) return peopleManager;/.test(changes) && /\.filter\(shown\)/.test(changes));
t("…roles ended on a deactivation (several schemes): to who reads every scheme's journal", /if \(\/\^Роли в схеми на \/\.test\(e\.title\)\) return seesAll;/.test(changes));
t("«Потребители»: the scheme numbers only of the roles shown, unless one manages PTS's people", /schemes\.filter\(\(s\) => peopleManager \|\| shown\.some\(\(r\) => r\.schemeId === s\.id\)\)/.test(at("users/page.tsx")));
const access = read("../src/lib/access.ts");
t("the decision is the pure one, with the scheme's current designation — asked for only when it could matter, and closed if unreadable", /if \(quickNoOrder\(v\)\) return false;[\s\S]*try \{\s*return seesOrder\(v, schemeId, await currentDesignation\(schemeId\)\);\s*\} catch \{\s*return false;/.test(access));

console.log(`order.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
