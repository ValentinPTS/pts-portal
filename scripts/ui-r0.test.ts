// Redesign R0 (2026-11-18, direction A «Пътека от стъпки»): the shared building blocks. Nothing existing changes in R0;
// these checks hold the rules every later part builds on — colours that read (WCAG 4.5:1 for text), a state never told
// by colour alone (each has an icon and a word), the path's states from where the person is, and the preview page
// that exists in development only.
import { readFileSync } from "node:fs";
import { pathSteps, STATE_WORD, PILL_ICON, STEP_STATES, PILL_STATES } from "../src/lib/ui-model.ts";
import { ICONS } from "../src/lib/ui-icons.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── colours, read from the stylesheet itself ──
const css = read("src/app/globals.css");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`no --${name} in globals.css`);
  return m[1].toLowerCase();
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const W = "#ffffff";
for (const [fg, bg, what] of [
  [W, token("turn"), "white words on the orange «your turn» button"],
  [W, token("done-ink"), "white words on the green main button"],
  [token("turn-ink"), token("turn-soft"), "orange words on the light-orange box"],
  [token("turn-ink"), W, "orange words on white"],
  [token("done-ink"), W, "green words on white"],
  [token("done-ink"), token("done-soft"), "green words on the light-green pill"],
  [token("later-ink"), token("later-soft"), "grey «later» words on their box"],
  [token("info-ink"), token("info-soft"), "blue «info» words on their pill"],
  [token("ink"), W, "the body text on white"],
] as const) {
  const r = contrast(fg, bg);
  t(`R0 contrast ≥ 4.5:1 — ${what} (${fg} on ${bg}: ${r.toFixed(2)})`, r >= 4.5);
}
t("R0: the brand green on white is kept for borders and shapes, never small text (4.50 is the edge)", !/\.ui-[a-z-]+\s*\{[^}]*[^-]color:\s*var\(--done\)/.test(css));

// ── states: an icon and a word each, never colour alone ──
t("R0: every step state has its words in Bulgarian and English", STEP_STATES.every((s) => !!STATE_WORD[s]?.bg && !!STATE_WORD[s]?.en));
t("R0: every pill state has an icon that exists", PILL_STATES.every((s) => !!ICONS[PILL_ICON[s]]));
const pathSrc = read("src/components/ui/StepPath.tsx"), pillSrc = read("src/components/ui/StatusPill.tsx");
t("R0: the path says each step's state in words (visible, or for a screen reader in the compact line)", /STATE_WORD\[s\.state\]\[lang\]/.test(pathSrc) && /sr-only-pts/.test(pathSrc));
t("R0: the path and the pill carry their state for the browser checks (data-step-state, data-pill)", /data-step-state=\{s\.state\}/.test(pathSrc) && /data-pill=\{state\}/.test(pillSrc));
t("R0: the step where the person is, is the page's current step for a screen reader", /aria-current=\{s\.state === "now" \? "step" : undefined\}/.test(pathSrc));

// ── the path's states from where the person is ──
const five = ["a", "b", "c", "d", "e"].map((label) => ({ label }));
const at2 = pathSteps(five, 2).map((s) => s.state).join(",");
t("R0: before «now» done, it now, after it later", at2 === "done,done,now,later,later", at2);
t("R0: not started — every step later", pathSteps(five, -1).every((s) => s.state === "later"));
t("R0: past the last — every step done", pathSteps(five, 5).every((s) => s.state === "done"));
t("R0: exactly one «now» whenever a step is current", [0, 1, 2, 3, 4].every((i) => pathSteps(five, i).filter((s) => s.state === "now").length === 1));

// ── the building blocks are safe to put anywhere ──
const blocks = ["Icon", "StepPath", "NextStep", "PageTitle", "StatusPill", "HelpLink"].map((n) => read(`src/components/ui/${n}.tsx`));
t("R0: no block writes raw HTML", blocks.every((b) => !/dangerouslySetInnerHTML/.test(b)));
t("R0: icons are decoration unless named (aria-hidden, or role=img with a label)", /"aria-hidden": true/.test(blocks[0]) && /role: "img", "aria-label": label/.test(blocks[0]));
t("R0: every new class is «ui-»: nothing existing is restyled in R0", !/^\.(btn|card|chip|input)\b/m.test(css.slice(css.indexOf("Redesign R0"))));
t("R0: motion respects «reduce motion»", /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.ui-btn/.test(css.slice(css.indexOf("Redesign R0"))));

// ── the preview page: development only ──
const gallery = read("src/app/dev/ui/page.tsx");
t("R0: the preview page is not found in a production build or with login on", /if \(process\.env\.NODE_ENV !== "development" \|\| AUTH_ENABLED\) notFound\(\);/.test(gallery));

console.log(`ui-r0.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
