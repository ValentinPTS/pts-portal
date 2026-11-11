// Plan part 10.1 — the catalogue: every started scheme with its state in words, never a draft, a count,
// free places or the maximum (Реш. 147; К1; К19, Реш. 120; 3.7); the announced price for an approved
// organisation (never the maximum); «Уведоми ме при следваща» — the subject (activity + object), one wish
// per organisation, told once at the next start, by a notice held for release (К25, 1.8).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogueState, catalogueRows, groupOf, wishOffered, STATE_TEXT, announcedPrice, priceLines, subjectOf, wishOf, wishProblem, wishesToTell, type CatalogueWish } from "../src/lib/catalogue-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

const NOW = Date.parse("2026-11-11T10:00:00Z");
type S = { id: string; number: string; status: string; dates?: { applicationsDue?: string }; lifecycle?: unknown; applicationsClosed?: unknown };
const sc = (id: string, status: string, extra: Partial<S> = {}): S => ({ id, number: id, status, ...extra });
const st = (s: S, full = false) => catalogueState(s as never, NOW, full);

// ── the state in words ──
t("a draft has no state — never listed (Реш. 147)", st(sc("d", "draft")) === null);
t("open, taking applications: «Приема заявки»; full: «Запълнена» — a label, still taking them (К19)", st(sc("o", "open", { dates: { applicationsDue: "2026-12-01" } })) === "accepting" && st(sc("o", "open", { dates: { applicationsDue: "2026-12-01" } }), true) === "full" && groupOf("full") === "taking");
t("open, the deadline passed: «Срокът за заявки изтече» — even when full", st(sc("o", "open", { dates: { applicationsDue: "2026-11-01" } })) === "deadline" && st(sc("o", "open", { dates: { applicationsDue: "2026-11-01" } }), true) === "deadline");
t("open, closed by PTS's hand (9.3): «Заявяването е затворено»", st(sc("o", "open", { applicationsClosed: { at: "x", by: "y" } })) === "closed" && groupOf("closed") === "current");
t("each later status its words; finished ones together", st(sc("r", "running")) === "running" && st(sc("p", "processing")) === "processing" && st(sc("rp", "report")) === "report" && st(sc("c", "closed")) === "finished" && st(sc("n", "not_held")) === "not_held" && groupOf("report") === "finished" && groupOf("not_held") === "finished" && groupOf("running") === "current");
t("the words: both languages, never a number", Object.values(STATE_TEXT).every((x) => x.bg && x.en && !/\d/.test(x.bg + x.en)));
t("«Уведоми ме при следваща» — wherever a scheme does not simply take an application now", !wishOffered("accepting") && wishOffered("full") && wishOffered("deadline") && wishOffered("finished"));

const rows = catalogueRows([sc("26/02-T-1", "open", { dates: { applicationsDue: "2026-12-10" } }), sc("26/01-T-1", "open", { dates: { applicationsDue: "2026-12-01" } }), sc("draft", "draft"), sc("25/10-T-2", "closed"), sc("26/03-T-1", "closed"), sc("26/01-C-1", "running")] as never[], () => NOW, (s: S) => s.id === "26/02-T-1");
t("the rows: no draft; taking by the nearest deadline; the rest the newest first", JSON.stringify(rows.taking.map((r) => [(r.scheme as S).id, r.state])) === JSON.stringify([["26/01-T-1", "accepting"], ["26/02-T-1", "full"]]) && rows.finished.map((r) => (r.scheme as S).id).join() === "26/03-T-1,25/10-T-2" && rows.current.map((r) => (r.scheme as S).id).join() === "26/01-C-1" && ![...rows.taking, ...rows.current, ...rows.finished].some((r) => (r.scheme as S).id === "draft"));
t("…«full» asked only of an open scheme", catalogueRows([sc("x", "running")] as never[], () => NOW, () => true).current[0].state === "running");

// ── the announced price ──
const price = announcedPrice({ commercial: { base: 12000, step: 4050, sharePct: 40, addOnMtCyIe: 2500, maxParticipants: 12, pickupBg: "ул. X" } });
t("the price: the base, the step, the share, the add-on — never the maximum or the pickup", JSON.stringify(price) === JSON.stringify({ base: 12000, step: 4050, sharePct: 40, addOn: 2500 }) && !("maxParticipants" in (price ?? {})));
t("…none until a base price; the share's default", announcedPrice({ commercial: { maxParticipants: 9 } }) === null && announcedPrice({}) === null && announcedPrice({ commercial: { base: 100 } })?.sharePct === 50);
const linesBg = priceLines(price!, false, "bg"), linesC = priceLines({ base: 30000, sharePct: 50 }, true, "en");
t("the price in words — testing: one characteristic and each further; the share; the delivery", /Една характеристика: 120,00 €; всяка следваща: 40,50 €/.test(linesBg[0]) && /40 % от пълната цена/.test(linesBg[1]) && /Малта, Кипър и Ирландия: \+ 25,00 €/.test(linesBg[2]) && /по оферта/.test(linesBg[2]));
t("…calibration: a participation (one item); 10.1 review: Malta, Cyprus and Ireland always named — the add-on «to be announced» until set", /A participation: 300\.00 €/.test(linesC[0]) && /Malta, Cyprus and Ireland: an add-on, to be announced/.test(linesC[2]));
t("10.1 review: no step — the participation's price whatever its characteristics; the share in the scheme, the most characteristics in full", /Участие: 120,00 €, колкото и характеристики/.test(priceLines({ base: 12000, sharePct: 50 }, false, "bg")[0]) && /в схемата/.test(linesBg[1]) && /най-много характеристики/.test(linesBg[1]));

// ── «Уведоми ме при следваща» ──
const subj = subjectOf({ type: "T", activity: "T", objectBg: " Керамични  плочки. " });
t("the subject: the activity and the object, folded (case, spaces, quotes, a final stop)", subj === "T|керамични плочки" && subjectOf({ type: "T", objectBg: "«Керамични плочки»" }) === subj && subjectOf({ type: "C", activity: "C", objectBg: "Керамични плочки" }) !== subj && subjectOf({ type: "T", objectBg: "  " }) === null);
const W = (id: string, entityId: string, schemeId: string, subject: string, at: string, more: Partial<CatalogueWish> = {}): CatalogueWish => ({ id, entityId, schemeId, subject, objectBg: "о", objectEn: "o", by: "entityuser:u", at, ...more });
const wishes = [W("w1", "E1", "s-old", subj!, "2026-11-01T00:00:00Z"), W("w2", "E2", "s-old", subj!, "2026-11-02T00:00:00Z"), W("w3", "E1", "s-old2", subj!, "2026-11-03T00:00:00Z", { cancelledAt: "x" }), W("w4", "E3", "s-new", subj!, "2026-11-04T00:00:00Z"), W("w5", "E4", "s-old", subj!, "2026-11-05T00:00:00Z", { notified: { schemeId: "s-x", at: "y" } }), W("w6", "E5", "s-old", "C|друго", "2026-11-06T00:00:00Z")];
t("one standing wish per organisation and subject — a cancelled or a used one is no wish", wishOf(wishes, "E1", subj)?.id === "w1" && !wishOf(wishes, "E4", subj) && !wishOf(wishes, "E1", null));
t("a wish refused: a scheme taking applications (apply), no object, one already — offered on full and finished", wishProblem("accepting", subj, wishes, "E9") === "accepting" && wishProblem("full", null, wishes, "E9") === "no-subject" && wishProblem("finished", subj, wishes, "E1") === "already" && wishProblem("full", subj, wishes, "E9") === null && wishProblem(null, subj, wishes, "E9") === "not-started");
const told = wishesToTell(wishes, { id: "s-new", type: "T", activity: "T", objectBg: "Керамични плочки" });
t("at the next start: the standing wishes of its subject, made on another scheme — by organisation; never a cancelled, a used or another subject's", [...told.keys()].sort().join() === "E1,E2" && told.get("E1")!.map((w) => w.id).join() === "w1");
t("…a scheme of another subject or with no object tells no one", wishesToTell(wishes, { id: "z", type: "C", activity: "C", objectBg: "Керамични плочки" }).size === 0 && wishesToTell(wishes, { id: "z", type: "T", objectBg: "" }).size === 0);

// ── the wiring ──
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const pubFiles = [...walk(fileURLToPath(new URL("../src/app/catalogue", import.meta.url))), fileURLToPath(new URL("../src/app/apply/[id]/page.tsx", import.meta.url)), ...walk(fileURLToPath(new URL("../src/app/lab/catalogue", import.meta.url)))];
t("no catalogue page reads the commercial fields or the maximum (3.7) — the price through announcedPrice", pubFiles.every((f) => !/\.commercial\b|maxParticipants/.test(readFileSync(f, "utf8"))), pubFiles.filter((f) => /\.commercial\b|maxParticipants/.test(readFileSync(f, "utf8"))).join());
const pub = src("app/catalogue/page.tsx");
t("the public catalogue lists started schemes only (Реш. 147) and is public (the proxy)", /isStarted/.test(pub) && /catalogue\(\?:\/\|\$\)/.test(src("proxy.ts")));
const labCat = src("app/lab/catalogue/page.tsx");
t("the portal's catalogue: a signed-in user; the price to an approved organisation only", /requireParticipant\(\)/.test(labCat) && /approved && price/.test(labCat) && /announcedPrice\(/.test(labCat));
const act = src("lib/actions.ts");
t("the wish: the participant's session, its own organisation; on record", /export async function catalogueWishAction\(/.test(act) && /requireParticipant\(\)/.test(act.slice(act.indexOf("export async function catalogueWishAction("), act.indexOf("export async function catalogueWishAction(") + 1500)) && /"catalogue\.wish"/.test(act));
t("the start tells the wishes — in the scheme's save, on the act «open»", /moved\.act === "open"[\s\S]{0,200}tellCatalogueWishes\(/.test(act));
const ev = src("lib/notify-events.ts");
t("10.1 review: every start tells — the editor's save, the act «open» from a draft, a creation from a sample", /moved\.act === "open"[\s\S]{0,200}tellCatalogueWishes\(/.test(act) && /act === "open" && from === "draft"[\s\S]{0,120}tellCatalogueWishes\(/.test(act) && /\(created from a sample\)[\s\S]{0,300}tellCatalogueWishes\(scheme\)/.test(act));
t("10.1 review: a wish cancelled by its id, the organisation's own; nothing standing — said, never ok", /export async function cancelCatalogueWishAction\(wishId: string\)/.test(act) && /w\.entityId !== entity\.id\) return WISH_REFUSAL\("not-yours"\)/.test(act) && /!activeWish\(w\)\) return WISH_REFUSAL\("not-standing"\)/.test(act));
t("10.1 review: a notice of a scheme no longer started is never released — the action and the page", /notice\.kind === "catalogue\.next"[\s\S]{0,200}!isStarted\(sc\)\) redirect\("\/notices\?refused=not-started"\)/.test(act) && /releasable\(n\)/.test(src("app/notices/page.tsx")));
t("10.1 review: an inactive or erased organisation is not told — its wishes wait", /e\.state === "inactive" \|\| e\.erasedAt\) continue;/.test(act));
t("10.1 review: «Организации» counts PTS's messages only", /n\.kind === "message"/.test(src("lib/notifications.ts")) && /\.eq\("kind", "message"\)/.test(src("lib/notifications.ts")));
t("10.1 review: in the round export the organisation of a notice only in identity/", /schemeId: undefined, entityId: undefined \}\)\)/.test(src("lib/round-export.ts")));
const fnStart = ev.indexOf("export async function notifyCatalogueNext(");
t("the notice: to the organisation, OF the scheme that started (its manager releases it), held for a person (no writer's release) — never its name", fnStart > 0 && /entityId,\s*schemeId: s\.id,/.test(ev.slice(fnStart, fnStart + 1400)) && !/releasedByWriter/.test(ev.slice(fnStart, fnStart + 1400)));

console.log(`catalogue.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
