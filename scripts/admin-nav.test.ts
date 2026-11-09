// The administrative panel (plan part 2.7; PTS's design «10. Административен
// панел»): its sections in the design's order, each shown only to whom the role
// model gives it. The expected sections are written out here by hand, role by role —
// not read from the code — so a change to who sees what fails this test until
// someone decides it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SECTIONS, visibleSections, sectionOf, type SectionKey } from "../src/lib/admin-nav.ts";
import { NONE, type Viewer } from "../src/lib/access-matrix.ts";
import { effectiveRoles, type PersonRoles } from "../src/lib/role-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const viewer = (roles: PersonRoles, more: Partial<Viewer> = {}): Viewer => ({ email: "x@ptsbg.eu", roles, build: false, auditor: false, lab: false, ...more });
const keys = (v: Viewer, managesPeople = false) => visibleSections(v, managesPeople).map((s) => s.key).join(" ");

// ── the design's order ──────────────────────────────────────────────────────
t("the design's sections, in its order (without «Одобрения на регистрации» — 9.1)",
  SECTIONS.filter((s) => s.group !== "more").map((s) => s.bg).join(" · ") === "Табло · Схеми · Организации и лаборатории · Обекти и партиди · Доставки · Фактури · Регистър на действията · Потребители на провайдъра");
t("the three still to be built name the part that builds them («Обекти и партиди» is built, 3.5)", SECTIONS.filter((s) => s.comesIn).map((s) => `${s.key}:${s.comesIn}`).join(" ") === "deliveries:5.6 invoices:5.8");

// ── who sees what, role by role (hand-written) ──────────────────────────────
const MORE = "library skins changes holidays";
const EXPECT: [string, Viewer, boolean, string][] = [
  ["the local build", viewer(NONE, { build: true }), false, `dashboard schemes organizations batches deliveries invoices journal people notices ${MORE} system`],
  ["the head (manages PTS's people)", viewer({ permanent: ["head"], schemes: {} }), true, `dashboard schemes journal people notices ${MORE} system`],
  ["the quality manager", viewer({ permanent: ["quality"], schemes: {} }), false, `dashboard schemes journal notices ${MORE}`],
  ["the software administrator", viewer(effectiveRoles({ permanent: ["software_admin"], schemes: { A: ["scheme_manager"] } })), false, `dashboard journal notices ${MORE} system`],
  ["the scheme manager", viewer({ permanent: [], schemes: { A: ["scheme_manager"] } }), false, `dashboard schemes organizations batches deliveries invoices journal people notices ${MORE}`],
  ["the coding expert", viewer({ permanent: [], schemes: { A: ["coding_expert"] } }), false, `dashboard schemes organizations deliveries invoices people ${MORE}`],
  ["the statistics expert", viewer({ permanent: [], schemes: { A: ["statistics_expert"] } }), false, `dashboard schemes ${MORE}`],
  ["the technical expert", viewer({ permanent: [], schemes: { A: ["technical_expert"] } }), false, `dashboard schemes batches ${MORE}`],
  ["the authorised reviewer", viewer({ permanent: [], schemes: { A: ["reviewer"] } }), false, `dashboard schemes journal notices ${MORE}`],
  ["the auditor", viewer(NONE, { auditor: true }), false, `dashboard schemes journal notices ${MORE}`],
  ["someone of PTS with no role yet (day one)", viewer(NONE), false, `dashboard ${MORE}`],
  ["a founder managing PTS's people while no head can act, with no role", viewer(NONE), true, `dashboard people ${MORE}`],
];
for (const [who, v, mp, want] of EXPECT) t(`${who}: exactly ${want.split(" ").length} sections`, keys(v, mp) === want, keys(v, mp));
t("a laboratory: none at all", keys(viewer({ permanent: [], schemes: { A: ["scheme_manager"] } }, { lab: true }), true) === "");
t("a signed-out visitor (login on: no roles, no address): only what any page of PTS shows — and the layout gives such a one no panel at all", keys(viewer(NONE, { email: null })) === `dashboard ${MORE}`);

// ── the highlight ───────────────────────────────────────────────────────────
const at: [string, SectionKey | null][] = [["/", "schemes"], ["/files/testing", "schemes"], ["/schemes/26-01-T-1/results", "schemes"], ["/dashboard", "dashboard"], ["/activity", "journal"], ["/users/applications/x/0", "people"], ["/system", "system"], ["/account", null], ["/itemsx", null]];
for (const [path, want] of at) t(`${path} is under ${want ?? "no section"}`, sectionOf(path) === want, String(sectionOf(path)));

t("the rail's list carries no rule — the client gets the sections, not the role model", !/access-matrix|role-model/.test(read("../src/lib/admin-sections.ts")) && /from "@\/lib\/admin-sections"/.test(read("../src/components/AdminRail.tsx")));
const css = read("../src/app/globals.css");
t("the rail stays in view while the page scrolls (no fixed-height shell), below the test banner", !/\.adminshell \{[^}]*min-height: 0/.test(css) && /top: var\(--banner-h\); height: calc\(100dvh - var\(--banner-h\)\)/.test(css));

// ── the pages gate as the panel shows ───────────────────────────────────────
const page = (p: string) => read(`../src/app/${p}`);
for (const key of ["dashboard", "organizations", "batches", "deliveries", "invoices"] as const) {
  t(`/${key}: gated by the panel's own rule, first of all`, new RegExp(`export default async function \\w+\\(\\) \\{\\n\\s*await requireSection\\("${key}"\\);`).test(page(`${key}/page.tsx`)));
}
t("the older pages keep their gates, which the panel mirrors", /await requireCapAnywhere\("journal\.read"\)/.test(page("activity/page.tsx")) && /requireCap(Anywhere)?\("system\.technical"\)/.test(page("system/page.tsx"))
  && /if \(peopleManager\) await requirePeopleManager\(\);\s*else await requireCapAnywhere\("labs\.manage"\);/.test(page("users/page.tsx")));
t("…the notices and their texts: who reads the journal, as the bell and the panel", /await requireCapAnywhere\("journal\.read"\);/.test(page("notices/page.tsx")) && /await requireCapAnywhere\("journal\.read"\);/.test(page("notices/texts/page.tsx")) && !/requireStaff\(\)/.test(page("notices/page.tsx")));
t("…the items, the skins and the change register: every one of PTS", ["items/page.tsx", "skins/page.tsx", "changes/page.tsx"].every((p) => /await requireStaff\(\);/.test(page(p))));
t("«Схеми» with nobody's schemes to show goes to the dashboard (the software administrator, no role yet)", /if \(scope !== "all" && scope\.length === 0\) redirect\("\/dashboard"\);/.test(page("page.tsx")));
t("a new folder or scheme — and the next number, which counts every scheme — only for who may create one", ["files/[type]/page.tsx", "files/[type]/f/[folderId]/page.tsx"].every((p) => /const canCreate = await mayAnywhereNow\("scheme\.create"\);/.test(page(p)) && !/\n\s*<NewProjectDialog/.test(page(p)) && !/\n\s*<NewFolderDialog/.test(page(p))));
const access = read("../src/lib/access.ts");
t("requireSection: the sign-in gate, then the panel's rule", /export async function requireSection\(key: SectionKey\)[\s\S]*?return gate\(\(v\) => maySection\(key, v, managesPeople\)\);/.test(access));
t("the layout gives the rail exactly the visible sections — and none to one not of PTS", /const ofPts = ctx\.authEnabled \? !!ctx\.email && !!ctx\.role && ctx\.role !== "lab" : ctx\.role !== "lab";/.test(page("layout.tsx")) && /const sections = ofPts \? visibleSections\(await getViewer\(\), managesPeople\)/.test(page("layout.tsx")) && /<Chrome user=\{user\} sections=\{sections\}/.test(page("layout.tsx")));
t("the rail is on every provider page (a bar on the wide editor pages), not on the laboratory's, the application's or the sign-in", /\{sections\.length > 0 && <AdminRail sections=\{sections\} \/>\}/.test(read("../src/components/Chrome.tsx")) && /adminshell\$\{wide \? " is-bar" : ""\}/.test(read("../src/components/Chrome.tsx")) && /path\.startsWith\("\/apply"\) \|\| path\.startsWith\("\/lab"\) \|\|\s*path\.startsWith\("\/login"\) \|\| path\.startsWith\("\/register"\)/.test(read("../src/components/Chrome.tsx")));
t("the folder tree beside the lists: only the schemes one works in (2.4)", /const scope = schemesFor\(await getViewer\(\), "codes\.view"\);[\s\S]*\.filter\(\(s\) => scope === "all" \|\| scope\.includes\(s\.id\)\)/.test(read("../src/components/Sidebar.tsx")));
t("the dashboard: only the schemes one works in, and no laboratory", /\.filter\(\(s\) => scope === "all" \|\| scope\.includes\(s\.id\)\)/.test(page("dashboard/page.tsx")) && !/listParticipants|namesFor|listLabs/.test(page("dashboard/page.tsx")));

console.log(`admin-nav.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
