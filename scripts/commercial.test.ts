// Plan part 3.7 — the commercial fields of a scheme (Zadanie §16; Реш. 153; Реш. 120;
// D12): base price for one characteristic, step for each further one, the SHARE of the
// full price a 2nd+ participation pays (default 50 — at 40 it pays 40 %, not 60 %), the
// MT/CY/IE add-on, the own-courier pickup address (empty until PTS fills it), the
// hidden maximum (a label, never a closing), the minimum; all in euro cents.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCents, parseShare, fmtEur, fullPrice, sharePrice, shareOf, isFull, readCommercial, commercialDiff, COMMERCIAL_PROBLEM_TEXT, DEFAULT_SHARE_PCT, type Commercial,
} from "../src/lib/commercial-model.ts";
import { fingerprint } from "../src/lib/editions.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── amounts in cents ───────────────────────────────────────────────────────
eq("amounts read with a comma, a point, spaces, a € sign", ["120", "120,5", "120.50", "1 200,50", "1 200", "€120", "120 €"].map(parseCents), [12000, 12050, 12050, 120050, 120000, 12000, 12000]);
eq("…and refused when they are no amount", ["", "abc", "-5", "120,505", "1e3", "12.3.4", "0x10"].map(parseCents), [null, null, null, null, null, null, null]);
// review: a space only between groups of three; «1.200» / «1,200» are no thousands
eq("a stray space is no thousands separator; «1.200» and «1,200» refused", ["12 50", "1 20", "1.200", "1,200", "1 2000"].map(parseCents), [null, null, null, null, null]);
eq("…groups of three are", ["1 200 000", "12 000,5"].map(parseCents), [120000000, 1200050]);
eq("the share as typed: «40», «40,5», «40 %»; refused: 0, over 100, three decimals, exponents", ["40", "40,5", "40 %", "40%", " 100 ", "0", "101", "50.555", "1e1", "+40", "0x10"].map(parseShare), [40, 40.5, 40, 40, 100, null, null, null, null, null, null]);
eq("shown in euro, both languages", [fmtEur(120050, "bg"), fmtEur(120050, "en"), fmtEur(5, "bg")], ["1 200,50 €", "1,200.50 €", "0,05 €"]);

// ── the prices (the calculation over a round is 9.4) ───────────────────────
const c: Commercial = { base: 10000, step: 4000 };
eq("the full price: base + step × (n − 1)", [fullPrice(c, 1), fullPrice(c, 3)], [10000, 18000]);
eq("…none without a base price, or for no characteristic", [fullPrice({}, 1), fullPrice(c, 0), fullPrice(c, 1.5)], [null, null, null]);
eq(`a 2nd participation pays the default share, ${DEFAULT_SHARE_PCT} %`, [shareOf(c), sharePrice(c, 3)], [50, 9000]);
eq("at 40 it pays 40 % OF the full price — not 60 % (PTS's warning)", sharePrice({ ...c, sharePct: 40 }, 3), 7200);
t("…the case that passes unnoticed at 50: there both readings agree, here they do not", sharePrice({ ...c, sharePct: 40 }, 3) !== Math.round(18000 * (1 - 0.4)));
eq("rounded to the cent, half up", sharePrice({ base: 10001, sharePct: 50 }, 1), 5001);
// review: a decimal share — exact, never a float's half-cent just below .5
eq("…at a decimal share too: 110 € at 45,55 % = 50,105 → 50,11 €; 410 € at 50,05 % → 205,21 €", [sharePrice({ base: 11000, sharePct: 45.55 }, 1), sharePrice({ base: 41000, sharePct: 50.05 }, 1)], [5011, 20521]);
t("…exact over many prices and shares (whole-number arithmetic)", (() => { for (let full = 1; full <= 20000; full += 7) for (const sh of [33.33, 45.55, 50.05, 12.5, 66.67, 99.99]) { const bp = Math.round(sh * 100); const exact = Math.floor((full * bp + 5000) / 10000); if (sharePrice({ base: full, sharePct: sh }, 1) !== exact || (full * bp) % 10000 === 5000 && exact * 10000 !== full * bp + 5000) return false; } return true; })());
t("«запълнена» at the maximum — a label (never a closing, Реш. 120)", isFull({ maxParticipants: 12 }, 12) && !isFull({ maxParticipants: 12 }, 11) && !isFull(undefined, 999));

// ── the form ───────────────────────────────────────────────────────────────
const form = (o: Record<string, string>) => (n: string) => (n in o ? o[n] : null);
const all = readCommercial(form({ com_base: "100", com_step: "40,50", com_share: "40", com_addon: "25", com_pickupBg: "ул. „Планински изглед“", com_pickupEn: "", com_max: "12", minParticipants: "5" }), undefined, 5);
eq("every field read", all, { ok: true, commercial: { base: 10000, step: 4050, sharePct: 40, addOnMtCyIe: 2500, pickupBg: "ул. „Планински изглед“", maxParticipants: 12 }, minParticipants: 5 });
const prev: Commercial = { base: 10000, sharePct: 40, maxParticipants: 12 };
eq("a field the form did not carry keeps its value", readCommercial(form({}), prev, 5), { ok: true, commercial: prev, minParticipants: 5 });
eq("…a blank one clears it (the share back to its default)", readCommercial(form({ com_base: "", com_share: "", com_max: "" }), prev, 5), { ok: true, commercial: undefined, minParticipants: 5 });
eq("…the minimum is never left blank — a cleared one is refused, not quietly put back (review)", readCommercial(form({ minParticipants: "" }), undefined, 5), { ok: false, problem: "count" });
const p = (o: Record<string, string>) => { const r = readCommercial(form(o), undefined, 5); return r.ok ? null : r.problem; };
eq("a share is above 0 and at most 100", [p({ com_share: "0" }), p({ com_share: "101" }), p({ com_share: "abc" }), p({ com_share: "-5" }), p({ com_share: "100" }), p({ com_share: "33,33" }), p({ com_share: "40%" }), p({ com_share: "40 %" })], ["share", "share", "share", "share", null, null, null, null]);
eq("an amount that does not read, or a typo of a million — named which (review)", [p({ com_base: "сто" }), p({ com_step: "-1" }), p({ com_addon: "2000000" })], ["money-base", "money-step", "money-addon"]);
eq("participant numbers are whole, 1 to 999; the maximum not below the minimum", [p({ com_max: "0" }), p({ minParticipants: "5 лаб." }), p({ com_max: "4" }), p({ com_max: "5" })], ["count", "count", "min-max", null]);
eq("…a lower minimum makes room for the maximum", readCommercial(form({ com_max: "4", minParticipants: "3" }), undefined, 5).ok, true);
eq("a long address refused", p({ com_pickupBg: "а".repeat(301) }), "pickup");
t("every problem has its words", Object.values(COMMERCIAL_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));
const diff = commercialDiff({ base: 10000 }, { base: 12000, sharePct: 40, maxParticipants: 10 }, 5, 6);
eq("the journal names each change, money as it reads", diff, ["base price: 100.00 € → 120.00 €", "share paid by a 2nd+ participation: 50 % → 40 %", "maximum participants: — → 10", "minimum participants: 5 → 6"]);
eq("…nothing when nothing changed (the share's default is no change)", commercialDiff(undefined, { sharePct: 50 }, 5, 5), []);
eq("…the pickup address with both texts (it will be printed; review)", commercialDiff({}, { pickupBg: "ул. „Планински изглед“" }, 5, 5), ["own-courier pickup address: «—» / «—» → «ул. „Планински изглед“» / «—»"]);

// ── no document changes; no laboratory sees it ─────────────────────────────
const s0 = structuredClone(pavingBlocks);
t("the commercial fields change no document (fingerprint)", ["plan", "invitation", "instruction", "results"].every((d) => fingerprint(s0, d) === fingerprint({ ...s0, commercial: { base: 1, maxParticipants: 3 } }, d)));
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const x = join(dir, f); return statSync(x).isDirectory() ? walk(x) : [x]; });
const labFiles = [...walk(fileURLToPath(new URL("../src/app/lab", import.meta.url))), fileURLToPath(new URL("../src/app/apply/page.tsx", import.meta.url))];
t("no laboratory page or route reads the commercial fields or the maximum", labFiles.every((f) => !/\.commercial\b|maxParticipants/.test(readFileSync(f, "utf8"))), labFiles.filter((f) => /\.commercial\b|maxParticipants/.test(readFileSync(f, "utf8"))).join(", "));

// ── the action and the screens ─────────────────────────────────────────────
const actions = read("../src/lib/actions.ts");
const edit = actions.slice(actions.indexOf("export async function updateSchemeAction"));
t("read from the form; one that does not read keeps them all, the rest saved", /const com = readCommercial\(/.test(edit) && /const comNow = com\.ok \? com\.commercial : current\.commercial;/.test(edit) && /minParticipants: minNow,\s*commercial: comNow,/.test(edit));
t("…its own notice, carried with any other", /const comQ = com\.ok \? "" : `com=\$\{encodeURIComponent\(com\.problem\)\}`;/.test(edit) && /\[q, chars, comQ, lstQ/.test(edit));
t("each change on record, compared with the fresh state", /comChanges = commercialDiff\(current\.commercial, comNow, current\.minParticipants, minNow\);/.test(edit) && /logActivity\("scheme\.commercial"/.test(edit));
const editor = read("../src/components/SchemeEditor.tsx");
t("the editor posts every field", ["com_base", "com_step", "com_share", "com_addon", "com_pickupBg", "com_pickupEn", "com_max", "minParticipants"].every((n) => editor.includes(`name="${n}"`)));
t("…with the prices it makes, the share shown as the sum and the discount it means", /data-price-preview/.test(editor) && /sharePrice\(withShare, n\)/.test(editor) && /отстъпка \$\{\+\(100 - sh\)/.test(editor));
t("…the preview reads the share exactly as the save does (review)", /parseShare\(share\)/.test(editor) && !/Number\(share\.replace/.test(editor));
t("…after a refusal the editor starts again from what was saved; the section opens (review)", /key=\{t \?\? "form"\}/.test(read("../src/app/schemes/[id]/edit/page.tsx")) && /`t=\$\{Date\.now\(\)\.toString\(36\)\}`/.test(edit) && /open=\{init\.openAdvanced \|\| undefined\}/.test(editor));
t("…two places for prices: a warning while both are filled (review)", /data-two-price-sources/.test(editor));
const part = read("../src/app/schemes/[id]/participants/page.tsx");
const fullNotice = read("../src/components/SchemeFullNotice.tsx");
const appsPage = read("../src/app/schemes/[id]/applications/page.tsx");
t("«запълнена» on the staff pages: participants and pending applications against the maximum — a warning", /isFull\(commercial, taken\)/.test(fullNotice) && /data-scheme-full/.test(fullNotice) && /a\.status === "pending"/.test(part) && /<SchemeFullNotice /.test(part));
t("…on the applications page too, where PTS approves; the header shows the same count (review)", /<SchemeFullNotice /.test(appsPage) && /pending\.length/.test(appsPage) && /\{taken\} \/ \{max\}/.test(part));

console.log(`commercial.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
