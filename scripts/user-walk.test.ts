// Round 9, stage 3 — the real-user walk-through (attack-user): what a person met on the rebuilt parts and around
// them, as fixed. Each check fails on the code before the fix (rule 1).
//   M1  «Издай редакция»: a choice made before the page is live never reached the form — the wrong document issued
//   M3  the Order is signed by the head of PTS (Ivaylo, 2026-11-17: «Head of PTS, always»), never the scheme's team
//   M4  the calibration chain's buttons offered to roles that cannot use them (pressed, confirmed, then refused)
//   M7  «уведомено» said before anything is sent — a laboratory's notice waits in «Известия» (Реш. 138)
//   M8  the scheme's settings lost without a word on leaving
//   M9  a step the case file does not offer was shown preselected as another (traceability → «Изпратени обекти»)
//   M10 the Order shows each person's given duties (Ivaylo, 2026-11-17), so it agrees with the coded lists
//   L1  «само Мениджър» — the names are for the scheme manager and the coding expert (the role model)
import { readFileSync } from "node:fs";
import { renderOrder } from "../src/lib/docs/order.ts";
import { withSkin, classicSkin, wrapDoc } from "../src/lib/doc-shell.ts";
import { sanitizeDocHtml } from "../src/lib/sanitize-html.ts";
import { docPrintHtml } from "../src/lib/doc-template.ts";
const wrapDocForTest = () => wrapDoc("bg", "x", '<img class="coverimg coverimg-empty" src="data:image/png;base64,AA==">');
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

// ── M1 ──
t("M1: «Издай редакция» is a «data-live-only» form — nothing chosen before its script is live is taken",
  /<form onSubmit=\{submit\} data-issue-edition data-live-only/.test(src("components/IssueEdition.tsx")));

// ── M3 / M10 ──
const S = structuredClone(pavingBlocks) as Scheme;
const sign = (html: string) => html.slice(html.indexOf('<div class="osign">'), html.indexOf('<div class="osign">') + 400);
const head = { bg: "Главен Тестов", en: "Head Testov" };
const withHead = (lang: "bg" | "en") => withSkin({ ...classicSkin, providerHead: head }, () => renderOrder(S, lang));
t("M3: the Order is signed by the head of PTS, set once for the organisation (BG)", sign(withHead("bg")).includes("Главен Тестов") && !sign(withHead("bg")).includes("Belovski"), sign(withHead("bg")));
t("M3: …and in English", sign(withHead("en")).includes("Head Testov"));
t("M3: no head set — the line is left for a handwritten signature, never the scheme manager's name", !sign(renderOrder(S, "bg")).includes("Belovski") && sign(renderOrder(S, "bg")).includes('<div class="nm"></div>'), sign(renderOrder(S, "bg")));
const li = (html: string, name: string) => (html.match(/<li>[^]*?<\/li>/g) ?? []).find((x) => x.includes(name)) ?? "";
const bg = renderOrder(S, "bg"), en = renderOrder(S, "en");
t("M10: the Order's team shows who was given the scheme manager's duty", li(bg, "eng. V. Belovski").includes("ръководител на схемата"), li(bg, "eng. V. Belovski"));
t("M10: …and the coding duty, as the coded lists name their compiler", li(bg, "T. Kasabova").includes("съставя кодираните списъци") && li(en, "T. Kasabova").includes("compiles the coded lists"), li(bg, "T. Kasabova"));
t("M10: a person given no duty is listed as typed, nothing added", !/\(/.test(li(bg, "I. Dobreva, PhD").replace(/I\. Dobreva, PhD/, "")), li(bg, "I. Dobreva, PhD"));
const S2 = structuredClone(S); S2.team = S2.team.map((m) => (m.name === "T. Kasabova" ? { ...m, duties: undefined } : m.name === "eng. A. Atanasov" ? { ...m, duties: ["coding" as const] } : m));
t("M10: the coding duty given to the statistician — the Order marks the statistician, not the row whose role says «coding»", li(renderOrder(S2, "bg"), "eng. A. Atanasov").includes("съставя кодираните списъци") && !li(renderOrder(S2, "bg"), "T. Kasabova").includes("съставя"));

// review 5 (M3): the head's name on every path that prints the Order — a saved body (an issued edition, the editor's
// PDF, the round export) or the default one — and an Order saved before (the scheme manager's name under the head's
// title) printed with the head of PTS as set now
{
  const savedOld = sign(renderOrder(S, "bg")).length ? renderOrder(S, "bg").slice(renderOrder(S, "bg").indexOf("<!--PTS:BS-->") + 13, renderOrder(S, "bg").indexOf("<!--PTS:BE-->")).replace('<div class="nm"></div>', '<div class="nm">eng. V. Belovski</div>') : "";
  const skinHead = { ...classicSkin, providerHead: head };
  const printed = docPrintHtml(S, "order", "bg", savedOld, undefined, skinHead);
  t("review 5 M3: an Order saved with the scheme manager's name prints the head of PTS as set now", sign(printed).includes("Главен Тестов") && !sign(printed).includes("Belovski"), sign(printed));
  const printedNone = docPrintHtml(S, "order", "bg", savedOld, undefined, classicSkin);
  t("review 5 M3: …and no head set — the line is blank, never the old name", !sign(printedNone).includes("Belovski") && /<div class="nm"><\/div>/.test(sign(printedNone)), sign(printedNone));
  const page = src("app/schemes/[id]/build/[doc]/page.tsx"), read = src("lib/doc-editor-read.ts");
  t("review 5 M3: the editor opens the Order with the head as set now — its saved body and its default alike",
    [page, read].every((f) => /const head = await getProviderHead\(\);/.test(f) && /refreshOrderHead\(refreshTeam\(/.test(f)) && /defaultBg=\{refreshOrderHead\(dft\.bg, doc, head, "bg"\)\}/.test(page));
  t("review 5 M3: who signs every Order is set by the head only (people.manage) — not by any scheme's manager",
    /export async function setProviderHeadAction\(formData: FormData\): Promise<void> \{\n\s*await requireCapAnywhere\("people\.manage"\);/.test(src("lib/actions.ts")) && /const canSetHead = await mayAnywhereNow\("people\.manage"\);/.test(src("app/skins/page.tsx")) && /\{canSetHead && <ProviderHeadCard/.test(src("app/skins/page.tsx")));
}

// ── M4 ──
const chain = src("components/SchemeChainPanel.tsx"), schemePage = src("app/schemes/[id]/page.tsx");
t("M4: the chain panel is read-only for who cannot mark the chain (no button to press, then be refused)",
  /canEdit = true/.test(chain) && /<fieldset disabled=\{!canEdit\}/.test(chain) && /canEdit=\{await mayNow\("dispatch", id\)\}/.test(schemePage));

// ── M6 ──
const we = src("components/WordEditor.tsx");
const sticky = we.slice(we.indexOf('<div className="we-stickyhead">'), we.indexOf('<div className="we-stickyhead">') + 1200);
t("M6: a refused save, or a newer copy stored elsewhere, is said inside the sticky head (where the person types)",
  /data-save-error-sticky/.test(sticky) && /\(saveErr && !saved\) \|\| staleShown/.test(sticky));
t("M6: back on the tab, the stored version is peeked — a newer one, not this opening's own, is said before typing",
  /window\.addEventListener\("focus", onFocus\);/.test(we) && /document\.addEventListener\("visibilitychange", onShown\);/.test(we) && /v\.rev > revRef\.current && !\(v\.sid && mySids\.current\.includes\(v\.sid\)\)\) setStaleRev\(v\.rev\)/.test(we)
  && /const staleShown = staleRev > revRef\.current && !syncing;/.test(we) && /: staleShown \? <span data-stale-note/.test(we));

// ── M5 ──
{
  const page = withSkin(classicSkin, () => wrapDocForTest());
  t("M5: the «Cover photo» placeholder is never printed — every document page hides it, whatever the skin",
    /\.coverimg-empty\{display:none!important;\}/.test(page));
  t("M5: …but the editor still shows it (where the owner adds the photo)",
    !/coverimg-empty\{display:none/.test(src("components/WordEditor.tsx")) && /\.we-page \.coverimg-empty\{opacity:\.95;\}/.test(src("components/WordEditor.tsx")));
}
// M10 (the fix's own seam): the duty marks kept by the cleaner — a saved Order lost them
t("M10: the cleaner keeps the Order's duty marks", /<span class="duty">\(x\)<\/span>/.test(sanitizeDocHtml('<span class="duty">(x)</span>')));

t("review 5 L5: the focus peek — for who edits only; a window's focus at most once every 3 s, a tab shown again always",
  /if \(!canEdit \|\| peeking \|\| document\.visibilityState !== "visible" \|\| \(!always && Date\.now\(\) - last < 3_000\)\) return;/.test(we) && /onFocus = \(\) => void check\(false\), onShown = \(\) => void check\(true\)/.test(we));

// ── M7 ──
const deliveries = src("app/deliveries/page.tsx"), ext = src("components/ExtensionForm.tsx"), rel = src("components/ReleaseToOne.tsx"), notices = src("app/notices/page.tsx");
t("M7: no message says the laboratory is told when its notice only waits in «Известия»",
  ![deliveries, ext, rel].some((f) => /участието е уведомено|лабораторията се уведомява|the participation is told|the laboratory is told/.test(f))
  && /чака във «Известия»/.test(ext) && /чака във «Известия»/.test(rel) && (deliveries.match(/чака във «Известия», докато ръководителят на схемата го изпрати/g) ?? []).length === 3);
t("M7: a held notice tells who may not send it who does", /data-notice-sender/.test(notices) && /Чака ръководителя на схемата да го изпрати/.test(notices));

// ── M8 ──
const editor = src("components/SchemeEditor.tsx");
t("M8: the scheme's settings warn before they are left unsaved — a reload, a closed tab, an in-app link",
  /addEventListener\("beforeunload"/.test(editor) && /document\.addEventListener\("click", onLeave, true\)/.test(editor) && /if \(!e\.defaultPrevented\) sentRef\.current = true;/.test(editor));
t("review 5 L4: «changed» is the form against how it opened — a button that changes nothing (the status already chosen, «Копирай линка») asks nothing",
  /const changed = \(\) => !sentRef\.current && openedAs\.current !== null && formNow\(formRef\.current\) !== openedAs\.current;/.test(editor) && !/dirtyRef/.test(editor));

// ── M9 ──
const caseFile = src("app/schemes/[id]/participants/[code]/page.tsx");
t("M9: a step the case file does not offer is never shown preselected as another one",
  /const pre = offered\.includes\(preKind\) \? preKind : "";/.test(caseFile) && /\{pre === "" && <option value="" disabled>/.test(caseFile) && /defaultValue=\{pre\} required/.test(caseFile));

// ── L1 ──
const i18n = src("lib/i18n.ts"), registered = src("lib/docs/registered.ts");
const line = (key: string) => i18n.split("\n").find((l) => l.includes(`"${key}"`)) ?? "";
t("L1: names are for the scheme manager and the coding expert — never «само Мениджър»",
  ["part.confBanner", "case.revealHint", "case.hiddenName"].every((k) => !/Мениджър|Manager/.test(line(k)) && /ръководител/.test(line(k)))
  && !/само Мениджър|only a Manager/.test(registered));

console.log(`user-walk.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
