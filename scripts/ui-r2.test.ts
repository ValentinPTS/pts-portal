// Redesign R2 (2026-11-18, direction A): the laboratory's screens — the participation's bar drawn as the path (orange
// only when it is the laboratory's turn, «Чака PTS» when PTS has it), one «Сега» box on «Начало» and on a
// participation's page with the same words as the list, «Какво чака вас» in big cards, the results form's last step
// orange, the pages' titles big. Behaviour unchanged: every hook and class the browser gates read stays.
import { readFileSync } from "node:fs";
import { labsTurn, STAGE_ICON, STATE_WORD } from "../src/lib/ui-model.ts";
import { STAGES, nowFirst, type PState, type ActionItem } from "../src/lib/participation-state-model.ts";
import { ICONS } from "../src/lib/ui-icons.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── whose turn ──
const yours: PState[] = ["dispatched", "received", "draft", "carrier"];
const pts: PState[] = ["applied", "waitlisted", "confirmed", "submitted", "scored", "nr", "withdrawn", "refused", "annulled", "excluded", "not-final", "not-held", "no-object"];
t("R2: the laboratory's turn — the object sent (confirm it), with it, the results a draft, the carrier to choose", yours.every(labsTurn));
t("R2: …and nothing else: PTS's work, or ended — never orange", pts.every((s) => !labsTurn(s)), pts.filter(labsTurn).join(","));
t("R2: every stage of a participation has its icon", STAGES.every((s) => !!ICONS[STAGE_ICON[s]]));
t("R2: «Чака PTS» has its words", STATE_WORD.wait.bg === "Чака PTS" && !!STATE_WORD.wait.en);

// ── the bar, drawn as the path — every hook kept ──
const bar = read("src/components/StageBar.tsx");
t("R2: the bar keeps its hooks (data-stage-bar, data-state, data-stage, data-stage-done, aria-current, data-state-label, data-payment, data-ended-state, the stage-label class)",
  ["data-stage-bar={cur ?? \"ended\"}", "data-state={state}", "data-stage={s}", "data-stage-done={done ? \"1\" : undefined}", "aria-current={now ? \"step\" : undefined}", "data-state-label", "data-payment={payment}", "data-ended-state={state}", "stage-label"].every((h) => bar.includes(h)));
t("R2: the current step orange only when it is the laboratory's turn — «Чака PTS» otherwise", /const look = done \? "done" : now \? \(yours \? "now" : "wait"\) : "later";/.test(bar) && /const yours = labsTurn\(state\);/.test(bar));
t("R2: each step says its state in words (visible, or for a screen reader on the compact line)", /STATE_WORD\[look\]/.test(bar) && /sr-only-pts/.test(bar));

// ── «Сега» and «Какво чака вас»: the same words, once ──
const lists = read("src/components/ParticipationLists.tsx"), home = read("src/app/lab/overview/page.tsx"), part = read("src/app/lab/p/[id]/page.tsx");
t("R2: an action's words are written once (actionLine) — the list and both «Сега» boxes read them", /export function actionLine\(/.test(lists) && /const line = actionLine\(a, v, lang\)/.test(lists) && /actionLine\(first, firstView, lg\)/.test(home) && /actionLine\(first, v, lang, true\)/.test(part));
t("R2: the list keeps its hooks (data-actions, data-action, data-action-what, data-action-for)", /data-actions=\{items\.length\}/.test(lists) && /data-action=\{a\.kind\} data-action-what=\{a\.what\} data-action-for=\{a\.participantId\}/.test(lists));
t("R2: «Сега» is the step the laboratory is on (nowFirst) and carries no list hook — nothing is counted twice", /\.flatMap\(\(v\) => v\.actions\)\.sort\(nowFirst\)\[0\]/.test(home) && /\[\.\.\.v\.actions\]\.sort\(nowFirst\)\[0\]/.test(part) && !/<NextStep[^>]*data-action/.test(home + part));
{
  const at = "2026-12-08T15:00:00Z";
  const acts = [
    { participantId: "p", kind: "document", what: "invitation", docKey: "invitation" },
    { participantId: "p", kind: "deadline", what: "results", at },
    { participantId: "p", kind: "acknowledge", what: "declaration", docKey: "declaration" },
    { participantId: "p", kind: "delivery", what: "receipt", at },
  ] as unknown as ActionItem[];
  t("R2: «Сега» — the object to confirm before the results, the results before a signature, a document last", [...acts].sort(nowFirst).map((a) => a.kind).join(",") === "delivery,deadline,acknowledge,document");
}
t("R2: on the participation's own page the results lead to their form, not back to the page", /actionLine\(first, v, lang, true\)/.test(part) && /if \(onItsPage && a\.what === "results"\) return \{ \.\.\.line, where, href: `\$\{participationHref\(v\)\}\/results`/.test(lists));
t("R2: nothing to do — said calmly, no orange", /Сега не е нужно нищо от вас/.test(home) && /ui-card ui-card-later/.test(home));
t("R2: the participations table keeps its hooks (data-participations-table, data-participation-id, data-row-state, data-row-stage)", ["data-participations-table=", "data-participation-id=", "data-row-state=", "data-row-stage="].every((h) => lists.includes(h)));

// ── the results form: its last step orange, its hooks and classes kept ──
const submit = read("src/components/SubmitPanel.tsx"), results = read("src/app/lab/p/[id]/results/page.tsx");
t("R2: «Прегледай и подай» / «Подай» orange — and still the buttons the checks press (btn-primary, data-review, data-submit)", /className="btn btn-primary btn-sm ui-btn-next" data-review/.test(submit) && /className="btn btn-primary btn-sm ui-btn-next" data-submit/.test(submit));
t("R2: the results page says where the participation is, on one line (its own hooks — never a second bar)", /<StepPath compact/.test(results) && !/<StageBar/.test(results) && /data-results-page=\{v\.participantId\}/.test(results));
t("R2: the participation page keeps its hooks (data-participation-page, data-open-results)", /data-participation-page=\{v\.participantId\} data-state=\{v\.state\}/.test(part) && /data-open-results/.test(part));

// ── titles ──
for (const f of ["lab/apply/page.tsx", "lab/apply/[id]/page.tsx", "lab/catalogue/page.tsx", "lab/confirm/page.tsx", "lab/joins/page.tsx", "lab/profile/page.tsx", "lab/two-factor/page.tsx", "lab/page.tsx"])
  t(`R2: ${f} — its title big, with the green line`, /<h1 className="section-title ui-h1"/.test(read(`src/app/${f}`)));

console.log(`ui-r2.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
