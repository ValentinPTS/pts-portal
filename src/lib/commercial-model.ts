// The commercial fields of a scheme (plan part 3.7; Zadanie §16; Реш. 153). Pure.
//
// Prices are NOT a global setting: each scheme carries its own
//   - base price — for ONE characteristic;
//   - step — for each further characteristic, the same whichever it is;
//   - the share paid by a second and later participation — a number, 50 by default.
//     It is the SHARE OF THE FULL PRICE that is paid, NOT the size of the discount
//     (PTS: at 50 both readings agree, at 40 they do not — the case that passes the
//     tests unnoticed and shows at the first scheme with another share);
//   - the add-on for delivery to Malta, Cyprus and Ireland — the same for the three,
//     different per scheme (the rest of the EU and the Balkans: delivery not charged;
//     other countries: offers the participant picks, never computed — 9.5);
//   - the address where a participant's own courier collects (then participation is
//     invoiced, delivery is not) — EMPTY until PTS gives the city (D12: the street is
//     «Планински изглед»; Смолян or Хасково to be settled before it enters a document);
//   - the maximum number of participants — HIDDEN from laboratories; reaching it is
//     a label and a warning to PTS, never a closing (Реш. 120 / К19): applications stay
//     open for the waiting list (9.3) and close by date or by hand only;
//   - the minimum number of participants (below it the scheme is «не се състои», Реш. 129).
//
// Money is kept in euro CENTS (whole numbers) — no float ever adds up a price. The
// calculation over a round's applications (by ЕИК, after the application deadline)
// is part 9.4; the two prices it needs are here so the editor can show them.

export interface Commercial {
  /** price for one characteristic, euro cents */
  base?: number;
  /** each further characteristic, euro cents */
  step?: number;
  /** % of the FULL price a second and later participation pays (default 50) */
  sharePct?: number;
  /** delivery add-on for MT, CY and IE, euro cents */
  addOnMtCyIe?: number;
  /** where the participant's own courier collects — empty until PTS fills it (D12) */
  pickupBg?: string;
  pickupEn?: string;
  /** hidden from laboratories (Реш. 120) */
  maxParticipants?: number;
}

export const DEFAULT_SHARE_PCT = 50;
export const MAX_CENTS = 100_000_000; // 1 000 000 € — a typo, not a price
export const MAX_PARTICIPANTS = 999;
export const MAX_PICKUP = 300;

export const shareOf = (c: Commercial | undefined) => c?.sharePct ?? DEFAULT_SHARE_PCT;

/** «1 200,50» / «1200.5» / «120» → cents; null when it does not read as an amount.
 *  A space only between groups of three digits — «12 50» is no amount (3.7 review). */
export function parseCents(raw: string): number | null {
  const t = raw.trim().replace(/^€\s*/, "").replace(/\s*€$/, "");
  if (!/^(?:\d{1,7}|\d{1,3}(?:[ \u00A0\u202F]\d{3}){1,2})(?:[.,]\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.replace(/[ \u00A0\u202F]/g, "").split(/[.,]/);
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** The share as typed — «40», «40,5», «40 %» — more than 0, at most 100, up to two
 *  decimals; null when it does not read. ONE reading for the preview and the save
 *  (3.7 review). */
export function parseShare(raw: string): number | null {
  const t = raw.trim().replace(/\s*%$/, "").replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(t)) return null;
  const x = Number(t);
  return x > 0 && x <= 100 ? x : null;
}

/** cents → «1 200,50 €» (BG) / «1,200.50 €» (EN). */
export function fmtEur(cents: number, lang: "bg" | "en"): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "bg" ? " " : ",");
  return `${cents < 0 ? "−" : ""}${grouped}${lang === "bg" ? "," : "."}${frac} €`;
}

/** The FULL price of a participation with n characteristics: base + step × (n − 1).
 *  Null when the scheme has no base price yet, or n is not a count. */
export function fullPrice(c: Commercial | undefined, n: number): number | null {
  if (c?.base === undefined || !Number.isInteger(n) || n < 1) return null;
  return c.base + (c.step ?? 0) * (n - 1);
}

/** What a second and later participation pays: the share OF the full price —
 *  at 40 %, 40 % of it (not 60 %). Rounded to the cent, half up — in whole numbers
 *  (the share in hundredths of a per cent): a float share such as 45.55 would put a
 *  true half-cent just below it (3.7 review). */
export function sharePrice(c: Commercial | undefined, n: number): number | null {
  const full = fullPrice(c, n);
  if (full === null) return null;
  const hundredths = Math.round(shareOf(c) * 100);
  return Math.floor((full * hundredths + 5000) / 10000);
}

/** «Запълнена»: a label and a warning, never a closing (Реш. 120). */
export const isFull = (c: Commercial | undefined, taken: number) => c?.maxParticipants !== undefined && taken >= c.maxParticipants;

export type CommercialProblem = "money-base" | "money-step" | "money-addon" | "share" | "count" | "min-max" | "pickup";

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g, "").trim();

/** The commercial fields as posted — `get(name)` reads one field, null when the form
 *  did not carry it (the field keeps what it had). The minimum participants is read
 *  here too: it is checked against the maximum. */
export function readCommercial(get: (name: string) => string | null, prev: Commercial | undefined, prevMin: number):
  { ok: true; commercial: Commercial | undefined; minParticipants: number } | { ok: false; problem: CommercialProblem } {
  const has = (n: string) => get(n) !== null;
  const val = (n: string) => clean(get(n));
  const money = (n: string, keep: number | undefined): number | undefined | false => {
    if (!has(n)) return keep;
    const s = val(n);
    if (!s) return undefined;
    const c = parseCents(s);
    return c === null || c > MAX_CENTS ? false : c;
  };
  // each amount named when it does not read (3.7 review)
  const base = money("com_base", prev?.base);
  if (base === false) return { ok: false, problem: "money-base" };
  const step = money("com_step", prev?.step);
  if (step === false) return { ok: false, problem: "money-step" };
  const addOn = money("com_addon", prev?.addOnMtCyIe);
  if (addOn === false) return { ok: false, problem: "money-addon" };
  let sharePct = prev?.sharePct;
  if (has("com_share")) {
    const s = val("com_share");
    if (!s) sharePct = undefined;
    else {
      const x = parseShare(s);
      if (x === null) return { ok: false, problem: "share" };
      sharePct = x;
    }
  }
  const count = (n: string, keep: number | undefined): number | undefined | false => {
    if (!has(n)) return keep;
    const s = val(n);
    if (!s) return undefined;
    if (!/^\d{1,3}$/.test(s)) return false;
    const x = Number(s);
    return x >= 1 && x <= MAX_PARTICIPANTS ? x : false;
  };
  const max = count("com_max", prev?.maxParticipants);
  const minRead = count("minParticipants", prevMin);
  // the minimum is never blank — a cleared one is refused, not quietly put back (3.7 review)
  if (max === false || minRead === false || minRead === undefined) return { ok: false, problem: "count" };
  const minParticipants = minRead;
  if (max !== undefined && max < minParticipants) return { ok: false, problem: "min-max" };
  const pickupBg = has("com_pickupBg") ? val("com_pickupBg") : prev?.pickupBg ?? "";
  const pickupEn = has("com_pickupEn") ? val("com_pickupEn") : prev?.pickupEn ?? "";
  if ([...pickupBg].length > MAX_PICKUP || [...pickupEn].length > MAX_PICKUP) return { ok: false, problem: "pickup" };
  const out: Commercial = {
    ...(base !== undefined ? { base } : {}),
    ...(step !== undefined ? { step } : {}),
    ...(sharePct !== undefined ? { sharePct } : {}),
    ...(addOn !== undefined ? { addOnMtCyIe: addOn } : {}),
    ...(pickupBg ? { pickupBg } : {}),
    ...(pickupEn ? { pickupEn } : {}),
    ...(max !== undefined ? { maxParticipants: max } : {}),
  };
  return { ok: true, commercial: Object.keys(out).length ? out : undefined, minParticipants };
}

export const COMMERCIAL_PROBLEM_TEXT: Record<CommercialProblem, { bg: string; en: string }> = {
  "money-base": { bg: "базовата цена се пише като «120» или «120,50» (евро), до 1 000 000", en: "the base price reads «120» or «120.50» (euro), up to 1 000 000" },
  "money-step": { bg: "стъпката се пише като «40» или «40,50» (евро), до 1 000 000", en: "the step reads «40» or «40.50» (euro), up to 1 000 000" },
  "money-addon": { bg: "добавката за Малта, Кипър и Ирландия се пише като «25» или «25,50» (евро), до 1 000 000", en: "the Malta, Cyprus and Ireland add-on reads «25» or «25.50» (euro), up to 1 000 000" },
  share: { bg: "делът е число над 0 и до 100 — колко от пълната цена се плаща", en: "the share is a number above 0 and up to 100 — how much of the full price is paid" },
  count: { bg: `броят участници е цяло число от 1 до ${MAX_PARTICIPANTS}; минималният не остава празен`, en: `a number of participants is a whole number from 1 to ${MAX_PARTICIPANTS}; the minimum is never blank` },
  "min-max": { bg: "максималният брой участници не е под минималния", en: "the maximum number of participants is not below the minimum" },
  pickup: { bg: `адресът е до ${MAX_PICKUP} знака`, en: `the address is ${MAX_PICKUP} characters at most` },
};

/** What changed, for the journal — the fields by name, money as it reads. */
export function commercialDiff(before: Commercial | undefined, after: Commercial | undefined, minBefore: number, minAfter: number): string[] {
  const b = before ?? {}, a = after ?? {};
  const out: string[] = [];
  const money = (k: "base" | "step" | "addOnMtCyIe", label: string) => {
    if (b[k] !== a[k]) out.push(`${label}: ${b[k] === undefined ? "—" : fmtEur(b[k]!, "en")} → ${a[k] === undefined ? "—" : fmtEur(a[k]!, "en")}`);
  };
  money("base", "base price");
  money("step", "step");
  if (shareOf(b) !== shareOf(a)) out.push(`share paid by a 2nd+ participation: ${shareOf(b)} % → ${shareOf(a)} %`);
  money("addOnMtCyIe", "MT/CY/IE add-on");
  // the address will be printed — both texts on record (3.7 review)
  if ((b.pickupBg ?? "") !== (a.pickupBg ?? "") || (b.pickupEn ?? "") !== (a.pickupEn ?? "")) out.push(`own-courier pickup address: «${b.pickupBg || "—"}» / «${b.pickupEn || "—"}» → «${a.pickupBg || "—"}» / «${a.pickupEn || "—"}»`);
  if (b.maxParticipants !== a.maxParticipants) out.push(`maximum participants: ${b.maxParticipants ?? "—"} → ${a.maxParticipants ?? "—"}`);
  if (minBefore !== minAfter) out.push(`minimum participants: ${minBefore} → ${minAfter}`);
  return out;
}
