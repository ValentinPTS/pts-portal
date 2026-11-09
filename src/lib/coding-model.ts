// The coding act (plan part 5.3; Zadanie «Кодиране», stage 9; А2; Реш. 124; D17). Pure.
//
// «След затваряне на заявяването, на случаен принцип. Не при одобряване на заявката.»
// An application entered gets a PROVISIONAL reference — «Z001», never shaped like a
// laboratory code — so it can be told of a refusal or an announcement before it has a
// code. At the coding act, every participation on the final list (5.2) still under its
// provisional reference draws, AT RANDOM, a laboratory number not given before in the
// scheme; its code is then the scheme's prefix and that number (А2). Its objects are
// drawn too, at random, from the batch's objects for participants. Once, on record —
// which reference became which code (coded data: no name). A code is never given
// again; a participation off the list or out of the round keeps its reference.
//
// A SEQUENTIAL calibration scheme keeps D17: its code at admission, drawn at random
// (3.12) — nothing for the act to do.

import { labCode, numbersTaken, codeMoment, MAX_LAB_NUMBER } from "./code-rule";
import type { Scheme } from "./types";
import type { Standing } from "./application-model";
import type { Lifecycle } from "./lifecycle-model";
import { currentFinalList, inFinalRound } from "./announcement-model";

export const PROVISIONAL_PREFIX = "Z";
const PROVISIONAL = /^Z\d{3}$/;

/** Is this a provisional reference (an application not yet coded)? */
export const isProvisional = (code: string): boolean => PROVISIONAL.test(code);

/** Every provisional reference the scheme has given — those held now and those coded
 *  (the records keep them): none is given twice, so the journal and the messages, which
 *  keep a reference, never mean two applications by one (5.3 review). */
export const refsEverGiven = (held: readonly string[], records: readonly CodingRecord[] | undefined): string[] =>
  [...held, ...(records ?? []).flatMap((r) => Object.keys(r.codes))];

/** The next provisional reference of the scheme — Z001 … Z999 (never one given before:
 *  pass `refsEverGiven`). */
export function nextProvisional(taken: readonly string[]): string | null {
  const used = new Set(taken.filter(isProvisional).map((c) => parseInt(c.slice(1), 10)));
  const next = used.size ? Math.max(...used) + 1 : 1;
  return next <= 999 ? `${PROVISIONAL_PREFIX}${String(next).padStart(3, "0")}` : null;
}

/** `count` laboratory numbers drawn at random, without repeats, from those never given
 *  in the scheme (`taken`: every code it has held). `below(n)` is a fair whole number
 *  in [0, n) — lib/random.uniformBelow. Null when too few are left. */
export function drawCodes(prefix: string, taken: readonly string[], count: number, below: (n: number) => number): string[] | null {
  const used = numbersTaken(prefix, taken);
  const free = Array.from({ length: MAX_LAB_NUMBER }, (_, i) => i + 1).filter((n) => !used.has(n));
  if (free.length < count) return null;
  // a partial Fisher–Yates: the first `count` of a random order
  for (let i = 0; i < count; i++) { const j = i + below(free.length - i); [free[i], free[j]] = [free[j], free[i]]; }
  return free.slice(0, count).map((n) => labCode(prefix, n));
}

/** `need[i]` objects for the i-th participation, drawn at random from `pool` without
 *  repeats; null when the pool is too small. */
export function drawObjects(pool: readonly string[], need: readonly number[], below: (n: number) => number): string[][] | null {
  const total = need.reduce((a, b) => a + b, 0);
  if (total > pool.length) return null;
  const order = [...pool];
  for (let i = 0; i < total; i++) { const j = i + below(order.length - i); [order[i], order[j]] = [order[j], order[i]]; }
  let k = 0;
  return need.map((n) => order.slice(k, (k += n)));
}

/** What the act recorded — kept on the scheme, never changed. */
export interface CodingRecord {
  /** the act's own id — the database refuses one recorded twice */
  id: string;
  at: string;
  by: string;
  day: string;
  /** provisional reference → its code */
  codes: Record<string, string>;
  /** provisional reference → the participation (its id) */
  ids?: Record<string, string>;
  /** code → its objects */
  objects?: Record<string, string[]>;
  /** dev only: a laboratory persona coded at once (no act) */
  dev?: true;
}

// ── the re-keying of the scheme's own records (JSONB) ──
type Recodable = Pick<Scheme, "labDocs" | "labUploads" | "paidAt" | "remindedAt" | "certificates" | "scoring" | "extensions" | "chain" | "supersededFiles">;

/** The scheme's records kept by participation code, under the new codes — each one
 *  moved, none dropped, none merged (a code is never given twice). Only what changes is
 *  returned. `map`: provisional reference → code. */
export function recodeScheme(s: Recodable, map: Readonly<Record<string, string>>): Partial<Recodable> {
  const has = (c: string) => Object.hasOwn(map, c); // never a key up the prototype chain
  const to = (c: string) => (has(c) ? map[c] : c);
  // moved — and should the code already hold something (never, unless an act was
  // completed twice), the two are merged, the reference's on top: nothing is lost
  const keys = <V,>(rec: Record<string, V> | undefined): Record<string, V> | undefined => {
    if (!rec) return rec;
    const out: Record<string, V> = {};
    for (const [k, v] of Object.entries(rec)) if (!has(k)) out[k] = v;
    for (const [k, v] of Object.entries(rec)) {
      if (!has(k)) continue;
      const t = to(k), was = out[t];
      out[t] = was && typeof was === "object" && v && typeof v === "object" && !Array.isArray(v) ? ({ ...was, ...v } as V) : v;
    }
    return out;
  };
  const touches = (rec: Record<string, unknown> | undefined) => !!rec && Object.keys(rec).some(has);
  const out: Partial<Recodable> = {};
  if (touches(s.labDocs)) out.labDocs = keys(s.labDocs);
  if (touches(s.labUploads)) out.labUploads = keys(s.labUploads);
  if (touches(s.paidAt)) out.paidAt = keys(s.paidAt);
  if (touches(s.certificates)) out.certificates = keys(s.certificates);
  if (s.scoring && touches(s.scoring.results)) out.scoring = { ...s.scoring, results: keys(s.scoring.results)! };
  // a reminder of an extended deadline is stamped «resultsDue@<code>:<date>»
  const stampTo = (k: string) => k.replace(/^([A-Za-z]+@)([^:]+)(:.*)$/, (m, a: string, c: string, b: string) => (has(c) ? `${a}${map[c]}${b}` : m));
  if (s.remindedAt && Object.keys(s.remindedAt).some((k) => stampTo(k) !== k)) out.remindedAt = Object.fromEntries(Object.entries(s.remindedAt).map(([k, v]) => [stampTo(k), v]));
  if (s.extensions?.some((e) => has(e.code))) out.extensions = s.extensions.map((e) => (has(e.code) ? { ...e, code: map[e.code] } : e));
  if (s.chain?.stops?.some((x) => !!x.code && has(x.code))) out.chain = { ...s.chain, stops: s.chain.stops.map((x) => (x.code && has(x.code) ? { ...x, code: map[x.code] } : x)) };
  // a replaced file is kept by «labdoc:<code>:<slot>» / «labupload:<code>:<slot>»
  const whereTo = (w: string) => w.replace(/^(lab(?:doc|upload):)([^:]+)(:.*)$/, (m, a: string, c: string, b: string) => (has(c) ? `${a}${map[c]}${b}` : m));
  if (s.supersededFiles?.some((f) => whereTo(f.where) !== f.where)) out.supersededFiles = s.supersededFiles.map((f) => ({ ...f, where: whereTo(f.where) }));
  return out;
}

// ── when the act may be done, and for whom ──
export type CodingProblem = "state" | "no-list" | "admission" | "none" | "prefix" | "numbers" | "objects" | "twice" | "failed" | "uncoded";

/** The participations the act codes: on the final list (5.2), still under a provisional reference. */
export const toCode = <P extends { id: string; code: string; standing?: Standing | null }>(s: { status: string; lifecycle?: Lifecycle }, parts: readonly P[]): P[] =>
  parts.filter((p) => inFinalRound(s, p) && isProvisional(p.code));

/** Why the act cannot be done now — or null. */
export function codingProblem(s: { status: string; type: "T" | "C"; distribution?: string; lifecycle?: Lifecycle }, parts: readonly { id: string; code: string; standing?: Standing | null }[]): CodingProblem | null {
  if (codeMoment(s) === "admission") return "admission"; // D17: a sequential calibration scheme codes at admission
  if (s.status !== "running") return "state";
  if (!currentFinalList(s)) return "no-list";
  if (!toCode(s, parts).length) return "none";
  return null;
}

/** The objects given at earlier acts of the scheme — never given again. */
export const objectsGiven = (records: readonly CodingRecord[] | undefined): Set<string> =>
  new Set((records ?? []).flatMap((r) => Object.values(r.objects ?? {}).flat()));

/** The participations an act coded whose follow-up did not finish — no «code assigned»
 *  on their case file (`assigned`: the codes that have one): completed by pressing again,
 *  nothing drawn again. */
export function unfinished(records: readonly CodingRecord[] | undefined, parts: readonly { id: string; code: string }[], assigned: ReadonlySet<string>): { id: string; ref: string; code: string; objects: string[] }[] {
  const out: { id: string; ref: string; code: string; objects: string[] }[] = [];
  for (const r of records ?? []) {
    if (r.dev) continue;
    for (const [ref, code] of Object.entries(r.codes)) {
      const id = r.ids?.[ref];
      if (!id || assigned.has(code)) continue;
      if (parts.some((p) => p.id === id && p.code === code)) out.push({ id, ref, code, objects: r.objects?.[code] ?? [] });
    }
  }
  return out;
}

/** The text of an object list kept with the participation (sample code, ≤ 40 characters). */
export const sampleCodeOf = (objs: readonly string[]): string | undefined => {
  if (!objs.length) return undefined;
  const all = objs.join(", ");
  return all.length <= 40 ? all : `${objs[0]} … (${objs.length})`;
};

export const CODING_PROBLEM_TEXT: Record<CodingProblem, { bg: string; en: string }> = {
  state: { bg: "Кодирането е след първото обявяване, докато схемата е «В процес».", en: "Coding comes after the first announcement, while the scheme is «In progress»." },
  "no-list": { bg: "Първо второто обявяване — кодират се участията в окончателния списък.", en: "The second announcement first — the participations on the final list are coded." },
  admission: { bg: "Последователна схема за калибриране: всяко участие получава кода си при приемането (D17).", en: "A sequential calibration scheme: each participation gets its code at admission (D17)." },
  none: { bg: "Няма участие за кодиране — всички в окончателния списък вече имат код.", en: "No participation to code — everyone on the final list has a code already." },
  prefix: { bg: "Номерът на схемата не дава начало на кода (А2) — поправете номера.", en: "The scheme's number gives no code prefix (А2) — correct the number." },
  numbers: { bg: "Не остават достатъчно свободни номера на лаборатории (до 99).", en: "Not enough free laboratory numbers are left (99 at most)." },
  objects: { bg: "Обектите за участници в изтеглените партиди не стигат за участията.", en: "The participant objects of the drawn batches are too few for the participations." },
  twice: { bg: "Кодирането вече е направено.", en: "The coding has been done already." },
  failed: { bg: "Кодирането не беше записано — нищо не е променено. Опитайте отново; ако се повтаря, проверете дали миграция 0040 е приложена.", en: "The coding was not recorded — nothing changed. Try again; if it repeats, check that migration 0040 is applied." },
  uncoded: { bg: "Има участия в окончателния списък без код — първо кодирането (етап 9).", en: "Participations on the final list have no code yet — the coding first (stage 9)." },
};
