// Redesign R3 (2026-11-18, direction A): the scheme's screens for the PTS team — the scheme's six states as the path
// (orange where it is now only for who may edit it, «Чака PTS» for who only reads), «Какво следва» from the real list
// of stages (calm grey for who only reads), the header's small buttons as big tiles, every subpage's title big. The
// path measures its own box (beside the folder tree it must not collide); on a phone the tree steps aside. Behaviour
// unchanged: the hooks the browser gates read stay.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const page = read("src/app/schemes/[id]/page.tsx");
const css = read("src/app/globals.css");

// ── the path: the scheme's own states, in their order ──
const statuses = (read("src/lib/types.ts").match(/export type SchemeStatus = ([^;]+);/)?.[1] ?? "").match(/"([a-z_]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
const pathBlock = page.match(/const PATH:[\s\S]*?\n  \];/)?.[0] ?? "";
const pathKeys = [...pathBlock.matchAll(/\{ key: "([a-z_]+)", bg:/g)].map((m) => m[1]);
t("R3: the path is the scheme's states in their order — every one but «not held»", pathKeys.join(",") === statuses.filter((s) => s !== "not_held").join(","), `${pathKeys} vs ${statuses}`);
t("R3: every step of the path has its words in Bulgarian and English, and its picture", pathKeys.length === 6 && pathBlock.split("\n").filter((l) => /\{ key: "[a-z_]+", bg:/.test(l)).every((l) => /bg: "[^"]+", en: "[^"]+", icon: "[a-z]+"/.test(l)));
t("R3: orange where the scheme is only for who may edit it — «Чака PTS» for who only reads", /i === pathAt \? \(canAct \? "now" as const : "wait" as const\)/.test(page));
t("R3: a closed scheme is all done; a scheme not held shows its state, not a path", /i === pathAt && x\.key === "closed"\) \? "done"/.test(page) && /data-scheme-ended/.test(page));

// ── «Какво следва»: the real next stage, calm for who only reads ──
t("R3: «Какво следва» is the next of the stages not done — read from the list, never guessed", /const nextStage = stageRows\.find\(\(r\) => r\.current && !r\.done && !r\.skipped\);/.test(page));
t("R3: both «Какво следва» boxes are calm (grey) for who only reads", (page.match(/<NextStep calm=\{!canAct\}/g) ?? []).length === 2);
t("R3: their button orange only for who may act; it leads to the stages, which exist", (page.match(/className=\{canAct \? "ui-btn ui-btn-next" : "ui-btn"\}/g) ?? []).length === 2 && /href="#stages"/.test(page) && /<SchemeLifecycle\b/.test(page) && /<section id="stages" data-lifecycle/.test(read("src/components/SchemeLifecycle.tsx")));
t("R3: nothing to come for a closed scheme or one not held", /s\.status !== "closed" && s\.status !== "not_held" &&/.test(page));
const next = read("src/components/ui/NextStep.tsx");
t("R3: the calm box is grey — never orange", /calm \? "ui-next ui-next-calm" : "ui-next"/.test(next) && /\.ui-next-calm \{ background: var\(--later-soft\);/.test(css) && /\.ui-next-calm \.ui-next-eyebrow \{ color: var\(--later-ink\); \}/.test(css));

// ── the tiles: everything about the scheme, one big link each ──
const tiles = page.match(/data-scheme-tiles>[\s\S]*?<\/section>/)?.[0] ?? "";
const hrefs = [...tiles.matchAll(/href=\{`\/schemes\/\$\{id\}\/([a-z-]+)`\}/g)].map((m) => m[1]);
t("R3: the tiles lead to participants, results, traceability, editions, amendments, batches and the scheme's data", hrefs.join(",") === "participants,results,traceability,editions,amendments,batches,edit", hrefs.join(","));
t("R3: batches only for a testing scheme", /\{type === "T" && <Link href=\{`\/schemes\/\$\{id\}\/batches`\} className="ui-tile"/.test(tiles));
t("R3: the data tile says «Редактирай» only to who may edit — «Данните на схемата» (read-only) otherwise", /canAct \? tr\("scheme\.editData"\) : L\("Данните на схемата"/.test(tiles));
t("R3: the header's small buttons are gone (the tiles have them) — the skin and «Управление» stay", !/className="btn" style=\{\{ fontSize: 13 \}\}>\{tr\("scheme\.(participants|results|editData)"\)\}/.test(page) && /<SkinPicker/.test(page) && /<ManageMenu/.test(page));
t("R3: the scheme's name is the page's one title (an h1)", (page.match(/<h1\b/g) ?? []).length === 1 && /\{schemeName\(s\)\}<\/h1>/.test(page));
t("R3: the tiles are whole-tile links with a visible keyboard focus", /\.ui-tile \{ display: flex;/.test(css) && /\.ui-tile:focus-visible \{ outline: 3px solid/.test(css));

// ── every other scheme screen: its title big ──
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : n === "page.tsx" ? [p] : []; });
const root = fileURLToPath(new URL("../src/app/schemes/", import.meta.url));
// the scheme's own page (its name is the h1), the retired «new» (a redirect), a submitted version's record (an ISO form, kept)
const exempt = new Set(["[id]/page.tsx", "new/page.tsx", "[id]/participants/[code]/v/[n]/page.tsx"]);
const subs = walk(root).map((p) => p.slice(root.length)).filter((p) => !exempt.has(p));
for (const p of subs) {
  const src = readFileSync(join(root, p), "utf8");
  if (!/<h1\b/.test(src)) continue; // a page with no title of its own (a print or a redirect) — nothing to make bigger
  t(`R3: schemes/${p} — its title big, with the green line (ui-h1)`, /<h1 className="ui-h1\b/.test(src));
}
t("R3: the scheme screens with a title — all fifteen made big", subs.filter((p) => /<h1 className="ui-h1\b/.test(readFileSync(join(root, p), "utf8"))).length === 15);

// ── the path in its box; the explorer on a phone ──
const path = read("src/components/ui/StepPath.tsx"), bar = read("src/components/StageBar.tsx"), shell = read("src/components/ExplorerShell.tsx");
t("R3: the full path sits in a box it measures (the compact line does not)", /return compact \? path : <div className="ui-path-box">\{path\}<\/div>;/.test(path) && /className=\{compact \? undefined : "ui-path-box"\}/.test(bar));
t("R3: the box is a container; narrow, the path stands up — beside the folder tree too, not only on a phone", /\.ui-path-box \{ container-type: inline-size; \}/.test(css) && /@container \(max-width: 680px\) \{\s*\.ui-path:not\(\.ui-path-compact\) \{ grid-template-columns: minmax\(0, 1fr\);/.test(css));
t("R3: the phone rule for the path is kept (a path outside a box still stands up)", /@media \(max-width: 700px\) \{\s*\.ui-path:not\(\.ui-path-compact\) \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css));
t("R3: on a phone the folder tree steps aside and the page has the width", /className="ui-explorer"/.test(shell) && /className="ui-explorer-main"/.test(shell) && /@media \(max-width: 700px\) \{\s*\.ui-explorer > aside \{ display: none; \}/.test(css));

// ── hooks the gates read: kept ──
t("R3: the stage list is still the page's (the stages section with its hook)", /<SchemeLifecycle\b/.test(page) && /id="stages" data-lifecycle/.test(read("src/components/SchemeLifecycle.tsx")));
t("R3: the path and the box carry their hooks (data-step-path, data-step-state, data-next-step, data-scheme-tiles)", /data-step-path/.test(path) && /data-step-state=\{s\.state\}/.test(path) && /data-next-step/.test(next) && /data-scheme-tiles/.test(page));

console.log(`ui-r3.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
