// Redesign R4 (2026-11-18, direction A): the team's other screens — every title big with the green line, «Табло» as
// big tiles (the schemes, the sections), the small type and fields of the team's panel a size bigger on the screen
// (printing and the documents shown on the screen untouched; the document editor's toolbar compact), and on a phone
// the team's menu a «Меню» button. Behaviour unchanged: the hooks the gates read stay.
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const css = read("src/app/globals.css");
const r4 = css.slice(css.indexOf("Redesign R4"));

// ── titles ──
const PAGES = ["account", "activity", "auth/confirm", "auth/confirmed", "auth/forgot", "auth/set-password", "batches", "changes",
  "dashboard", "deliveries", "holidays", "invoices", "items", "notices", "notices/texts", "open", "organizations", "",
  "registrations", "skins", "system", "users", "validation", "validation/record", "website"];
for (const pg of PAGES) {
  const src = read(`src/app/${pg ? pg + "/" : ""}page.tsx`);
  const h1s = src.match(/<h1\b[^>]*>/g) ?? [];
  t(`R4: ${pg || "(home)"} — every title big, with the green line (ui-h1)`, h1s.length > 0 && h1s.every((h) => /className="[^"]*\bui-h1\b/.test(h)), h1s.join(" "));
}
t("R4: a failed confirmation's title still says so in red", /<h1 className="ui-h1" style=\{failed \? \{ color: "var\(--red\)" \} : undefined\}>/.test(read("src/app/auth/confirmed/page.tsx")));

// ── «Табло» ──
const dash = read("src/app/dashboard/page.tsx");
t("R4: «Табло» keeps its hooks (data-dashboard, -who, -declaration, -roles, -schemes, -sections)", ["data-dashboard ", "data-dashboard-who", "data-dashboard-declaration", "data-dashboard-roles", "data-dashboard-schemes", "data-dashboard-sections"].every((h) => dash.includes(h)));
const schemesBlock = dash.match(/data-dashboard-schemes[\s\S]*?<\/section>/)?.[0] ?? "", sectionsBlock = dash.match(/data-dashboard-sections[\s\S]*?<\/section>/)?.[0] ?? "";
t("R4: each scheme is one big tile — one link to the scheme", /<Link key=\{s\.id\} href=\{`\/schemes\/\$\{s\.id\}`\} className="ui-tile">/.test(schemesBlock) && (schemesBlock.match(/<Link\b/g) ?? []).length === 2 /* + «Всички в «Схеми»» past 20 */);
t("R4: each section is one big tile with its picture — one link each (the gate counts them)", /<Link key=\{s\.key\} href=\{s\.href\} className="ui-tile">\s*<Icon name=\{SECTION_ICON\[s\.key\]\}/.test(sectionsBlock) && (sectionsBlock.match(/<Link\b/g) ?? []).length === 1);
t("R4: the declaration's line says signed or not with an icon and words, not colour alone", /<Icon name=\{mine \? "check" : "info"\}/.test(dash));

// ── the team's menu on a phone ──
const rail = read("src/components/AdminRail.tsx");
t("R4: the menu button says whether the list is open, and which list it opens", /aria-expanded=\{open\} aria-controls="adminrail-nav"/.test(rail) && /<nav id="adminrail-nav"/.test(rail));
t("R4: the list closes on the next page by itself — open only on the page it was opened on, no effect to run", /const open = openAt === path;/.test(rail) && !/useEffect/.test(rail));
t("R4: the button exists only on a narrow screen; there the list is hidden until it is opened", /\.adminrail-toggle \{ display: none; \}\s*@media \(max-width: 900px\) \{[\s\S]*?\.adminrail-nav:not\(\[data-open\]\) \{ display: none; \}/.test(r4));
t("R4: the opened list — one section per line, the «Още» label shown", /\.adminrail-nav\[data-open\] \{ flex-basis: 100%; flex-direction: column;/.test(r4) && /\.adminrail-nav\[data-open\] \.adminrail-label \{ display: block; \}/.test(r4));
t("R4: the menu keeps its hooks (data-admin-rail, data-section, aria-current)", /data-admin-rail/.test(rail) && /data-section=\{s\.key\} aria-current=/.test(rail));

// ── bigger words and fields — on the screen only, in the team's panel only ──
const screen = r4.match(/@media screen \{([\s\S]*?)\n\}/)?.[1] ?? "";
t("R4: the small type a size bigger — on the screen, inside the team's panel", /\.adminmain \.text-xs \{ font-size: 13\.5px;/.test(screen) && /\.adminmain \.text-sm \{ font-size: 15\.5px;/.test(screen));
t("R4: …never when printing (the rules are inside «@media screen»)", !/\.adminmain \.text-(xs|sm) \{/.test(r4.replace(/@media screen \{[\s\S]*?\n\}/, "")));
t("R4: every field big enough to read and tap (42px, 16px — no zoom on a phone)", /min-height: 42px; font-size: 16px;/.test(screen));
t("R4: …not ticks, choices, hidden or file fields, nor the editor's toolbar, picture bar and colour box", ['[type="checkbox"]', '[type="radio"]', '[type="hidden"]', '[type="file"]', ".we-num"].every((x) => screen.includes(x)) && /:not\(\.we-toolbar \*, \.we-imgbar \*, \.we-colorpop \*\)/.test(screen));
t("R4: a field's name readable (15px, bold)", /\.adminmain label > \.text-xs:first-child \{ font-size: 15px; font-weight: 600;/.test(screen));
t("R4: the documents shown on the screen set their sizes themselves (the results record inline) — untouched", /<article data-results-record=\{version\.version\} style=\{\{ maxWidth: 980, fontSize: 13,/.test(read("src/components/ResultsRecord.tsx")));
t("R4: the lab's portal is not inside the team's panel (its own frame) — R2 stays as it was", /path\.startsWith\("\/lab"\)/.test(read("src/components/Chrome.tsx")) && /<div className="adminmain">/.test(read("src/components/Chrome.tsx")));

console.log(`ui-r4.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
