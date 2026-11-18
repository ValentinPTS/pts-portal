// Redesign R1 (2026-11-18, direction A): the frame every page sits in — the team's menu (light, an icon beside every
// section), the top bar with «Помощ», the laboratory's tabs, the help pages, and the base pieces every page already
// uses (buttons, fields, cards, labels) in the new shapes and sizes. Behaviour unchanged: every hook the browser gates
// read stays, every page keeps its gate.
import { readFileSync } from "node:fs";
import { SECTION_ICON } from "../src/lib/ui-nav.ts";
import { SECTIONS } from "../src/lib/admin-sections.ts";
import { ICONS } from "../src/lib/ui-icons.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── the team's menu ──
const rail = read("src/components/AdminRail.tsx");
t("R1: every section of the menu has an icon that exists", SECTIONS.every((s) => !!SECTION_ICON[s.key] && !!ICONS[SECTION_ICON[s.key]]), SECTIONS.filter((s) => !SECTION_ICON[s.key]).map((s) => s.key).join(","));
t("R1: the menu keeps its hooks — data-admin-rail, data-section, aria-current, the classes the print rules hide", /data-admin-rail/.test(rail) && /data-section=\{s\.key\}/.test(rail) && /aria-current=\{active === s\.key \? "page" : undefined\}/.test(rail) && /className="adminrail"/.test(rail) && /adminrail-link\$\{active === s\.key \? " is-active" : ""\}/.test(rail));
t("R1: a section's name is words beside its icon — never an icon alone", /<Icon name=\{SECTION_ICON\[s\.key\]\}[^>]*\/>\s*<span[^>]*>\{label\(s\)\}<\/span>/.test(rail));

// ── the top bar and help ──
const chrome = read("src/components/Chrome.tsx"), nav = read("src/components/ParticipantNav.tsx");
t("R1: the team's top bar carries «Помощ» → /help", /<HelpLink href="\/help"/.test(chrome));
t("R1: the laboratory's tabs keep their hook and links, and carry «Помощ» → /lab/help", /data-participant-nav/.test(nav) && ["/lab/overview", "/lab/apply", "/lab/catalogue", "/lab/confirm", "/lab/joins"].every((h) => nav.includes(`"${h}"`)) && /<HelpLink href="\/lab\/help"/.test(nav));
t("R1: sign-out stays a plain form (works before the page is live)", /<form action=\{signOutLabAction\}><button type="submit"/.test(nav));
const help = read("src/app/help/page.tsx"), labHelp = read("src/app/lab/help/page.tsx"), helpBody = read("src/components/HelpContent.tsx");
t("R1: the team's help page — for every one of PTS (requireStaff first)", /export default async function \w+\(\)[^{]*\{\n\s*await requireStaff\(\);/.test(help));
t("R1: the laboratory's help page — for a signed-in participant (requireParticipant first)", /export default async function \w+\(\)[^{]*\{\n\s*const \{ user, persona \} = await requireParticipant\(\);/.test(labHelp));
t("R1: help gives PTS's own contacts, as the documents print them (never typed twice)", /PTS_CONTACTS/.test(helpBody) && /export const PTS_CONTACTS/.test(read("src/lib/doc-shell.ts")));
t("R1: help shows nothing of any scheme or laboratory — no store, no names", !/from "@\/lib\/(store|participants|labs|identities|entity-users)"/.test(helpBody + help + labHelp));
const routes = read("scripts/regression-routes.mjs");
t("R1: both help pages are in the regression's inventory, as pages that never show names", /\{ file: "help\/page\.tsx", names: "never"/.test(routes) && /\{ file: "lab\/help\/page\.tsx", names: "never"/.test(routes));

// ── the base pieces, in the new shapes and sizes ──
const css = read("src/app/globals.css");
const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`))?.[1] ?? "";
const px = (decl: string, prop: string) => Number(decl.match(new RegExp(`${prop}:\\s*(\\d+)px`))?.[1] ?? 0);
t("R1: a button is at least 44 px tall, a small one 40 — big enough for any finger", px(rule(".btn"), "min-height") >= 44 && px(rule(".btn-sm"), "min-height") >= 40);
t("R1: a field is at least 44 px tall with 16 px words (a phone does not zoom in)", px(rule(".input"), "min-height") >= 44 && px(rule(".input"), "font-size") >= 16);
t("R1: the main button is the deep green (white words 6.2:1), not the brand green (4.50)", /background: var\(--done-ink\)/.test(rule(".btn-primary")));
t("R1: labels are words, not capitals — easier to read", !/text-transform: uppercase/.test(rule(".field-label")) && px(rule(".field-label"), "font-size") >= 14);
t("R1: the menu stays in view while the page scrolls, below the test banner (as before)", /top: var\(--banner-h\); height: calc\(100dvh - var\(--banner-h\)\)/.test(css));

console.log(`ui-r1.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
