// Batches and their objects (plan part 3.5; Реш. 151 / А18; Zadanie §5; D3). Pure.
//
// «Партида е съвкупността от обекти на изпитване за пригодност, приготвени от един
// материал в един процес на подготовка и опаковане за една РТ схема или за един неин
// кръг.» An object belongs to exactly one batch; a batch to exactly one scheme; a
// scheme of more than one material has more than one batch. The homogeneity,
// stability, participant and reserve objects are chosen AT RANDOM from the batch —
// drawn once, by the portal, on record. **A calibration scheme has no batch** — there
// one instrument travels, and its records are its own (the chain).
//
// The homogeneity values feed the 2.0 contract's `Homogeneity` sheet (D3): `series`
// (e.g. H1), `sample_code` (the object), `characteristic_id`, `replicate_number`,
// `value`. A value names its characteristic by its stable id (3.6) — and by its place
// in the list, kept in step when the list is reordered, with its name alongside.

export type ObjectRole = "homogeneity" | "stability" | "participant" | "reserve";
export const OBJECT_ROLES: readonly ObjectRole[] = ["homogeneity", "stability", "participant", "reserve"];
export const ROLE_LABEL: Record<ObjectRole, { bg: string; en: string }> = {
  homogeneity: { bg: "за хомогенност", en: "homogeneity" },
  stability: { bg: "за стабилност", en: "stability" },
  participant: { bg: "за участници", en: "participants" },
  reserve: { bg: "резерва", en: "reserve" },
};

export interface BatchObject { code: string; role?: ObjectRole }

export interface HomogeneityValue {
  series: string;
  sampleCode: string;
  /** the characteristic's place in the scheme's list (0-based), null once it was removed */
  characteristic: number | null;
  /** its name when the value was entered — kept should the characteristic go */
  characteristicName: string;
  /** its stable id (3.6) — what 2.0's characteristic_id is */
  characteristicId?: string;
  replicate: number;
  value: number;
  /** who entered it, and when — a later value of the same series, object,
   *  characteristic and replicate is its correction; this one stays on record (3.5 review) */
  at?: string;
  by?: string;
}

/** The identity of a homogeneity value in the contract: series, object, characteristic, replicate. */
export const homogeneityKey = (h: Pick<HomogeneityValue, "series" | "sampleCode" | "characteristic" | "replicate" | "characteristicId" | "characteristicName">) =>
  // the characteristic by its stable id (3.6); a value from before it, by its place —
  // a removed one by its name, so two removed characteristics never meet (3.6 review)
  `${h.series}|${h.sampleCode}|${h.characteristicId ?? (h.characteristic !== null ? `#${h.characteristic}` : `name:${h.characteristicName}`)}|${h.replicate}`;

/** The values that count — the latest of each key; the others are corrected. */
export function currentHomogeneity(rows: readonly HomogeneityValue[] | undefined): HomogeneityValue[] {
  const last = new Map<string, HomogeneityValue>();
  for (const h of rows ?? []) last.set(homogeneityKey(h), h);
  return [...last.values()];
}

/** Of pasted rows, what is new: a value already in force under the same key is not
 *  added again (a second press, a double paste); a different one is its correction. */
export function newHomogeneityRows(existing: readonly HomogeneityValue[] | undefined, rows: readonly HomogeneityValue[]): { add: HomogeneityValue[]; same: number } {
  const now = new Map(currentHomogeneity(existing).map((h) => [homogeneityKey(h), h.value]));
  const add: HomogeneityValue[] = [];
  let same = 0;
  for (const r of rows) {
    const k = homogeneityKey(r);
    if (now.get(k) === r.value) { same++; continue; }
    now.set(k, r.value);
    add.push(r);
  }
  return { add, same };
}

export interface Batch {
  id: string;
  /** идентификация на партидата */
  label: string;
  /** материал и произход */
  material: string;
  /** дата на подготовка и опаковане (yyyy-mm-dd) */
  preparedOn: string;
  /** условия на съхранение */
  storage: string;
  /** the objects' codes are the prefix and their number */
  prefix: string;
  objects: BatchObject[];
  /** the random draw of the objects' roles — once, by the portal */
  draw?: { counts: Record<ObjectRole, number>; at: string; by: string; day: string };
  /** връзка към записа от оценяването на хомогенността и стабилността */
  hsRecord?: string;
  homogeneity?: HomogeneityValue[];
  createdAt: string;
  createdBy: string;
}

export const MAX_OBJECTS = 999;
const chars = (x: string) => [...x].length;
const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏﻿�]/g, "").trim();

/** The codes of `count` objects: the prefix and the number, zero-padded to at least two
 *  digits (prefix «12603», 40 objects → 1260301 … 1260340). */
export function objectCodes(prefix: string, count: number): string[] {
  const width = Math.max(2, String(count).length);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(width, "0")}`);
}

export type BatchProblem = "calibration" | "label" | "material" | "prepared" | "count" | "prefix" | "taken" | "too-long";

export interface BatchInput { label: unknown; material: unknown; preparedOn: unknown; storage: unknown; count: unknown; prefix: unknown; hsRecord?: unknown }

/** A new batch as it may be recorded — or why not. Its object codes must not be the
 *  codes of another batch's objects in the scheme (an object is in exactly one). */
/** A real yyyy-mm-dd — «2026-02-31» is not one. */
const realDay = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (!m) return false; const x = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return x.getUTCFullYear() === +m[1] && x.getUTCMonth() === +m[2] - 1 && x.getUTCDate() === +m[3]; };
/** A code's prefix: begins with a letter or a digit; never one a spreadsheet reads as a
 *  number in another form (an exponent «1e», a sign) — the codes go to 2.0's sheets. */
const prefixOk = (p: string) => /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(p) && !/^\d*[eE]\d*$/.test(p);

export function checkBatch(s: { type: "T" | "C"; batches?: Batch[] }, inputIn: BatchInput | null | undefined, except?: string):
  { ok: true; value: { label: string; material: string; preparedOn: string; storage: string; prefix: string; count: number; hsRecord: string } } | { ok: false; problem: BatchProblem } {
  if (s.type === "C") return { ok: false, problem: "calibration" };
  const input = inputIn ?? ({} as BatchInput);
  const label = clean(input.label), material = clean(input.material), storage = clean(input.storage), prefix = clean(input.prefix), hsRecord = clean(input.hsRecord);
  const preparedOn = clean(input.preparedOn);
  if ([label, prefix].some((x) => chars(x) > 40) || [material, storage, hsRecord].some((x) => chars(x) > 500)) return { ok: false, problem: "too-long" };
  if (!label) return { ok: false, problem: "label" };
  if (!material) return { ok: false, problem: "material" };
  if (!realDay(preparedOn)) return { ok: false, problem: "prepared" };
  const count = Number(clean(input.count));
  if (!Number.isInteger(count) || count < 1 || count > MAX_OBJECTS) return { ok: false, problem: "count" };
  if (!prefixOk(prefix)) return { ok: false, problem: "prefix" };
  const codes = new Set(objectCodes(prefix, count).map((c) => c.toLowerCase()));
  if ((s.batches ?? []).some((b) => b.id !== except && (b.label.toLowerCase() === label.toLowerCase() || b.objects.some((o) => codes.has(o.code.toLowerCase()))))) return { ok: false, problem: "taken" };
  return { ok: true, value: { label, material, preparedOn, storage, prefix, count, hsRecord } };
}

export const BATCH_PROBLEM_TEXT: Record<BatchProblem, { bg: string; en: string }> = {
  calibration: { bg: "При схема за калибриране партида няма — уредът обикаля, записите са на веригата (Реш. 151).", en: "A calibration scheme has no batch — the instrument travels, its records are the chain's (Реш. 151)." },
  label: { bg: "Идентификацията на партидата е задължителна.", en: "The batch's identification is required." },
  material: { bg: "Материалът и произходът са задължителни.", en: "The material and its origin are required." },
  prepared: { bg: "Датата на подготовка и опаковане е задължителна.", en: "The date of preparation and packing is required." },
  count: { bg: `Броят обекти е цяло число от 1 до ${MAX_OBJECTS}.`, en: `The number of objects is a whole number from 1 to ${MAX_OBJECTS}.` },
  prefix: { bg: "Началото на кода е задължително: букви, цифри и тире (до 20), започва с буква или цифра — и не като число с експонента («1e»).", en: "The code's prefix is required: letters, digits and a dash (20 at most), starting with a letter or digit — and not like a number with an exponent («1e»)." },
  taken: { bg: "Партида с тази идентификация или обекти с тези кодове вече има в схемата.", en: "A batch with this identification, or objects with these codes, already exist in the scheme." },
  "too-long": { bg: "Текстът е твърде дълъг.", en: "The text is too long." },
};

export type DrawProblem = "drawn" | "counts" | "too-many";

/** The roles drawn at random: `counts` of each, from the batch's objects; the rest
 *  stay unassigned. `rand(n)` gives a whole number in [0, n) — the server's
 *  crypto.randomInt. A batch is drawn once. */
export function drawRoles(b: Pick<Batch, "objects" | "draw">, countsArg: Partial<Record<ObjectRole, unknown>> | null | undefined, rand: (n: number) => number):
  { ok: true; objects: BatchObject[]; counts: Record<ObjectRole, number> } | { ok: false; problem: DrawProblem } {
  if (b.draw) return { ok: false, problem: "drawn" };
  const countsIn = countsArg ?? {};
  const counts = Object.fromEntries(OBJECT_ROLES.map((r) => [r, Number(countsIn[r] ?? 0)])) as Record<ObjectRole, number>;
  if (OBJECT_ROLES.some((r) => !Number.isInteger(counts[r]) || counts[r] < 0) || OBJECT_ROLES.every((r) => counts[r] === 0)) return { ok: false, problem: "counts" };
  if (OBJECT_ROLES.reduce((a, r) => a + counts[r], 0) > b.objects.length) return { ok: false, problem: "too-many" };
  // Fisher–Yates over the codes, then the roles in turn
  const order = b.objects.map((o) => o.code);
  for (let i = order.length - 1; i > 0; i--) { const j = rand(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const roleOf = new Map<string, ObjectRole>();
  let k = 0;
  for (const r of OBJECT_ROLES) for (let n = 0; n < counts[r]; n++) roleOf.set(order[k++], r);
  return { ok: true, objects: b.objects.map((o) => ({ code: o.code, ...(roleOf.has(o.code) ? { role: roleOf.get(o.code) } : {}) })), counts };
}

export const DRAW_PROBLEM_TEXT: Record<DrawProblem, { bg: string; en: string }> = {
  drawn: { bg: "Обектите на тази партида вече са изтеглени.", en: "This batch's objects have been drawn already." },
  counts: { bg: "Посочете колко обекта от всеки вид (цели числа, поне един).", en: "Say how many objects of each kind (whole numbers, at least one)." },
  "too-many": { bg: "Повече обекти, отколкото има в партидата.", en: "More objects than the batch has." },
};

/** The homogeneity values pasted as rows «series; sample_code; characteristic no.;
 *  replicate; value» (the contract's columns; a tab, «;» or «,» between them; a
 *  decimal comma or point). The characteristic is its number in the scheme's list
 *  (1, 2 …). Each object must be the batch's homogeneity or stability object. */
export function parseHomogeneity(text: string, b: Pick<Batch, "objects">, characteristics: readonly string[], ids?: readonly (string | undefined)[]):
  { ok: true; rows: HomogeneityValue[] } | { ok: false; line: number; problem: "columns" | "series" | "object" | "characteristic" | "replicate" | "value" | "empty" } {
  // each line keeps its own number — a blank line still counts (3.5 review)
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim());
  if (!lines.some(Boolean)) return { ok: false, line: 0, problem: "empty" };
  const testing = new Set(b.objects.filter((o) => o.role === "homogeneity" || o.role === "stability").map((o) => o.code));
  const rows: HomogeneityValue[] = [];
  const firstUsed = lines.findIndex(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    // a header line of the contract's names is skipped
    if (i === firstUsed && /series/i.test(lines[i]) && /sample/i.test(lines[i])) continue;
    const cells = lines[i].includes("\t") ? lines[i].split("\t") : lines[i].includes(";") ? lines[i].split(";") : lines[i].split(",");
    if (cells.length !== 5) return { ok: false, line: i + 1, problem: "columns" };
    const [series, sample, ch, rep, val] = cells.map((c) => c.trim());
    if (!/^[A-Za-z0-9-]{1,10}$/.test(series)) return { ok: false, line: i + 1, problem: "series" };
    if (!testing.has(sample)) return { ok: false, line: i + 1, problem: "object" };
    const c = Number(ch);
    if (!Number.isInteger(c) || c < 1 || c > characteristics.length) return { ok: false, line: i + 1, problem: "characteristic" };
    const r = Number(rep);
    if (!Number.isInteger(r) || r < 1 || r > 99) return { ok: false, line: i + 1, problem: "replicate" };
    // a plain decimal — a comma or a point, a sign, an exponent; never «0x1A», never a
    // thousands separator read as a decimal one twice over
    const t = val.replace(/\s/g, "");
    if (!/^[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/.test(t)) return { ok: false, line: i + 1, problem: "value" };
    const v = Number(t.replace(",", "."));
    if (!Number.isFinite(v)) return { ok: false, line: i + 1, problem: "value" };
    rows.push({ series, sampleCode: sample, characteristic: c - 1, characteristicName: characteristics[c - 1], ...(ids?.[c - 1] ? { characteristicId: ids[c - 1] } : {}), replicate: r, value: v });
  }
  if (!rows.length) return { ok: false, line: 0, problem: "empty" };
  return { ok: true, rows };
}

export const HOMOGENEITY_PROBLEM_TEXT: Record<"columns" | "series" | "object" | "characteristic" | "replicate" | "value" | "empty", { bg: string; en: string }> = {
  columns: { bg: "очакват се 5 колони: серия; код на обекта; № на характеристиката; повторение; стойност", en: "5 columns are expected: series; object code; characteristic no.; replicate; value" },
  series: { bg: "серията е кратко означение като H1", en: "the series is a short mark such as H1" },
  object: { bg: "обектът не е обект за хомогенност или стабилност на тази партида", en: "the object is not one of this batch's homogeneity or stability objects" },
  characteristic: { bg: "няма характеристика с този номер", en: "no characteristic has this number" },
  replicate: { bg: "повторението е цяло число от 1 до 99", en: "the replicate is a whole number from 1 to 99" },
  value: { bg: "стойността не е число", en: "the value is not a number" },
  empty: { bg: "няма редове", en: "no rows" },
};

/** The values kept in step with a reordered characteristic list (lib/param-remap's map:
 *  old place → new place, or null for one removed — the value is kept with its name). */
export function remapHomogeneity(batches: Batch[] | undefined, map: (old: number) => number | null): Batch[] | undefined {
  if (!batches) return batches;
  return batches.map((b) => !b.homogeneity?.length ? b : { ...b, homogeneity: b.homogeneity.map((h) => ({ ...h, characteristic: h.characteristic === null ? null : map(h.characteristic) })) });
}

/** Values from before the characteristics had ids get their characteristic's id (3.6) —
 *  so a value entered later, with the id, is recognised as the same or its correction. */
export function withCharacteristicIds(rows: HomogeneityValue[] | undefined, ids: readonly (string | undefined)[]): HomogeneityValue[] | undefined {
  if (!rows?.some((h) => !h.characteristicId && h.characteristic !== null && ids[h.characteristic])) return rows;
  return rows.map((h) => h.characteristicId || h.characteristic === null || !ids[h.characteristic] ? h : { ...h, characteristicId: ids[h.characteristic] });
}
export function backfillCharacteristicIds(batches: Batch[] | undefined, ids: readonly (string | undefined)[]): Batch[] | undefined {
  if (!batches?.some((b) => withCharacteristicIds(b.homogeneity, ids) !== b.homogeneity)) return batches;
  return batches.map((b) => { const h = withCharacteristicIds(b.homogeneity, ids); return h === b.homogeneity ? b : { ...b, homogeneity: h }; });
}
