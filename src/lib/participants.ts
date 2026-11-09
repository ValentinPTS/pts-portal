import { randomInt, randomUUID } from "crypto";
import type { CodedParticipant, Participant, ParticipantIdentity, ParticipantStatus } from "./types";
import { openIdentities, putIdentity, addWithIdentity, updateWithIdentity, NO_IDENTITY, type Opener, type IdentityPurpose } from "./identity-store";
import { getDb, noMemoryFallback } from "./supabase";
import { getScheme } from "./store";
import { parseSchemeNumber } from "./scheme-number";
import { codeMoment, drawLabNumber, nextLabNumber, numbersTaken, labCode, MAX_LAB_NUMBER, type CodeMoment } from "./code-rule";
import { uniformBelow } from "./random";
import { sameStanding, standingShapeOk } from "./application-model";
import { nextProvisional, isProvisional, refsEverGiven } from "./coding-model";
import { recodeMemNotifications } from "./notifications";
import { recodeMemCaseEvents } from "./case-events";

// Participant code format YYMNNLL (per the project's notepad spec):
//   YY = 2-digit year, M = month (no leading zero), N = project sequence in the
//   month, LL = participating-lab sequence (2-digit). e.g. PTS 25/07-T-1 → 257101.
export function schemePrefix(number: string): string {
  const p = parseSchemeNumber(number); // Т/T, С/C, «26/3», any dash (0.14)
  return p ? `${p.yy}${parseInt(p.mm, 10)}${p.seq}` : "";
}

// Participant store — Supabase when configured, else in-memory (same as the scheme
// store). Each participant gets its code by the code rule (lib/code-rule, 3.12) —
// unique in the scheme, never given twice. Since part
// 2.3 this store holds the CODED participation only; who is behind the code is in
// the identity store (lib/identity-store.ts), opened only through it, on record.

// Shared across all server entry points + HMR (see store.ts) so RSC pages, route
// handlers and server actions see the same list in the no-DB dev fallback. (A new
// key: the old one held identities too.)
const memStore = globalThis as unknown as { __ptsCodedParticipantMem?: CodedParticipant[] };
const mem: CodedParticipant[] = memStore.__ptsCodedParticipantMem ?? (memStore.__ptsCodedParticipantMem = []);
let warned = false;
function warn(e: unknown) {
  noMemoryFallback("participants", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[participants] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(p: CodedParticipant) {
  return {
    id: p.id, scheme_id: p.schemeId, code: p.code, participations: p.participations, status: p.status,
    courier: p.courier ?? null, sample_code: p.sampleCode ?? null,
    characteristics: p.characteristics ?? null,
    selections: p.selections ?? null, standing: p.standing ?? null,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): CodedParticipant {
  return {
    id: r.id, schemeId: r.scheme_id, code: r.code, participations: r.participations ?? 1,
    status: r.status as ParticipantStatus,
    courier: r.courier ?? undefined, sampleCode: r.sample_code ?? undefined,
    characteristics: Array.isArray(r.characteristics) ? (r.characteristics as number[]) : undefined,
    selections: r.selections && typeof r.selections === "object" ? (r.selections as Record<string, number>) : undefined,
    standing: r.standing && typeof r.standing === "object" ? (r.standing as CodedParticipant["standing"]) : undefined,
  };
}

// The code for a new participant (the code rule, lib/code-rule — 3.12): the prefix and a
// two-digit lab number — drawn at random from those not yet given in a sequential
// calibration scheme (at admission, D17); the next in turn elsewhere until the coding
// act of 5.3 draws them. A random 6-digit code only if the scheme number can't be parsed.
function nextCode(prefix: string, taken: string[], moment: CodeMoment = "coding-act"): { code: string; drawnFrom?: number } {
  // coded at the act after applications close (5.3; Zadanie «Кодиране»): until then a
  // provisional reference, never shaped like a laboratory code
  if (moment === "coding-act") {
    const ref = nextProvisional(taken);
    if (!ref) throw new NoLabNumberError();
    return { code: ref };
  }
  if (!prefix) {
    const set = new Set(taken);
    for (let i = 0; i < 10000; i++) {
      const c = String(randomInt(100000, 1000000));
      if (!set.has(c)) return { code: c };
    }
    return { code: String(Date.now()).slice(-6) };
  }
  if (moment === "admission") {
    const free = MAX_LAB_NUMBER - numbersTaken(prefix, taken).size;
    const n = drawLabNumber(prefix, taken, uniformBelow);
    if (n === null) throw new NoLabNumberError();
    return { code: labCode(prefix, n), drawnFrom: free };
  }
  const n = nextLabNumber(prefix, taken);
  if (n === null) throw new NoLabNumberError();
  return { code: labCode(prefix, n) };
}

/** Every laboratory number of the scheme is given (3.12) — its own message, never a
 *  plain «could not save» (review). */
export class NoLabNumberError extends Error {
  constructor() { super(`no laboratory number left in this scheme (${MAX_LAB_NUMBER} given)`); this.name = "NoLabNumberError"; }
}
const isDuplicateCode = (e: unknown) => {
  const c = (e as { cause?: { code?: string } })?.cause?.code;
  return c === "23505" || /duplicate key|unique/i.test(String((e as Error)?.message ?? ""));
};

/** The coded participations of a scheme — no identity (2.3). */
export async function listParticipants(schemeId: string): Promise<CodedParticipant[]> {
  const db = getDb();
  if (!db) return mem.filter((p) => p.schemeId === schemeId);
  try {
    const { data, error } = await db.from("participants").select("id,scheme_id,code,participations,status,courier,sample_code,characteristics,selections,standing").eq("scheme_id", schemeId).order("code");
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return mem.filter((p) => p.schemeId === schemeId);
  }
}

/** These participations WITH who is behind them — an opening of the identity store,
 *  on record, for this purpose. The caller has checked that the actor may (for a
 *  person at PTS: lib/identities.ts). A participant whose identity is missing keeps
 *  empty fields, never another's. */
export async function withIdentities(coded: CodedParticipant[], schemeId: string, who: Opener): Promise<Participant[]> {
  if (!coded.length) return [];
  const ids = await openIdentities({ schemeId, participantIds: coded.map((p) => p.id) }, who);
  return coded.map((p) => ({ ...p, ...(ids.get(p.id) ?? NO_IDENTITY) }));
}

/** The laboratory account behind each code — to reach it with a notice or a message:
 *  an opening for `send`, on record (2.3). */
export async function labIdsFor(schemeId: string, coded: CodedParticipant[], actor: string, purpose: IdentityPurpose = "send"): Promise<Map<string, string | undefined>> {
  const named = await withIdentities(coded, schemeId, { actor, purpose });
  return new Map(named.map((p) => [p.code, p.labId]));
}

export async function labIdOf(schemeId: string, code: string, actor: string): Promise<string | undefined> {
  const one = (await listParticipants(schemeId)).filter((p) => p.code === code);
  return one.length ? (await labIdsFor(schemeId, one, actor)).get(code) : undefined;
}

/** A coded participation with its identity left out — for a renderer that masks names. */
export function withoutIdentity(p: CodedParticipant): Participant {
  return { ...p, ...NO_IDENTITY };
}

// All participations belonging to one permanent lab account, across every scheme
// (Phase 2b — the lab portal's "My schemes"). Which participations are the lab's is
// the mapping itself, so it is an opening of the identity store (2.3), on record.
export async function listParticipationsForLab(labId: string, who: Opener): Promise<Participant[]> {
  if (!labId) return [];
  const ids = await openIdentities({ labId }, who);
  if (!ids.size) return [];
  const db = getDb();
  const keep = (rows: CodedParticipant[]) => rows.filter((p) => ids.has(p.id)).map((p) => ({ ...p, ...ids.get(p.id)! }));
  if (!db) return keep(mem);
  try {
    const { data, error } = await db.from("participants").select("id,scheme_id,code,participations,status,courier,sample_code,characteristics,selections,standing").in("id", [...ids.keys()]).order("scheme_id");
    if (error) throw error;
    return keep((data ?? []).map((r) => fromRow(r as Row)));
  } catch (e) {
    warn(e);
    return keep(mem);
  }
}

export async function addParticipant(input: {
  schemeId: string;
  labName: string;
  contact?: string;
  email?: string;
  phone?: string;
  country?: string;
  deliveryAddress?: string;
  participations?: number;
  labId?: string;
  courier?: string;
  sampleCode?: string;
  characteristics?: number[];
  selections?: Record<string, number>;
}, actor: string): Promise<Participant & { drawnFrom?: number }> {
  const identity: ParticipantIdentity = {
    labName: input.labName,
    contact: input.contact ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    country: input.country ?? "",
    deliveryAddress: input.deliveryAddress ?? "",
    labId: input.labId,
  };
  const db = getDb();
  // Two participants added at the same moment may draw the same number: the database
  // refuses the second (unique scheme + code), and it draws again from what is left —
  // never a plain «could not save» for that (3.12 review). Memory checks the same.
  for (let attempt = 0; ; attempt++) {
    const [existing, scheme] = await Promise.all([listParticipants(input.schemeId), getScheme(input.schemeId)]);
    const prefix = scheme ? schemePrefix(scheme.number) : "";
    // every reference the scheme ever gave — a coded one too — so none is given twice (5.3 review)
    const drawn = nextCode(prefix, refsEverGiven(existing.map((x) => x.code), scheme?.coding), scheme ? codeMoment(scheme) : "coding-act");
    const coded: CodedParticipant = {
      id: randomUUID(),
      schemeId: input.schemeId,
      code: drawn.code,
      participations: input.participations && input.participations > 0 ? input.participations : 1,
      status: "applied",
      courier: input.courier || undefined,
      sampleCode: input.sampleCode || undefined,
      characteristics: input.characteristics?.length ? input.characteristics : undefined,
      selections: input.selections && Object.keys(input.selections).length ? input.selections : undefined,
    };
    if (!db) {
      if (mem.some((x) => x.schemeId === coded.schemeId && x.code === coded.code)) { if (attempt < 3) continue; throw new Error("the participant's code is taken"); }
      await addWithIdentity(toRow(coded), identity, actor); // refused first (no actor), nothing kept
      mem.push(coded);
      return { ...coded, ...identity, drawnFrom: drawn.drawnFrom };
    }
    // A participant that cannot be written is an ERROR, not a quiet memory-only row
    // (finding N14, part 0.9): with a database configured a memory row vanishes on
    // the next cold start — and an approved application with it. The coded row and the
    // identity are written together by the database, or neither (2.3). The caller
    // shows the failure; nothing is half-done.
    try {
      await addWithIdentity(toRow(coded), identity, actor);
    } catch (e) {
      if (isDuplicateCode(e) && attempt < 3) continue;
      console.warn("[participants] insert failed:", (e as Error).message);
      throw e;
    }
    return { ...coded, ...identity, drawnFrom: drawn.drawnFrom };
  }
}

// Patch one participation (edit form; Phase-4 status transitions). The code and
// scheme are immutable — the code is the confidential identity everywhere. The
// identity part goes to the identity store, on record (2.3).
export type ParticipantPatch = Partial<
  Pick<Participant, "labName" | "contact" | "email" | "phone" | "country" |
    "deliveryAddress" | "participations" | "courier" | "sampleCode" | "characteristics" | "status" | "selections" | "standing">
>;
const IDENTITY_KEYS = ["labName", "contact", "email", "phone", "country", "deliveryAddress"] as const;

// `actor` is needed only when the patch touches the identity (it is then on record)
export async function updateParticipant(id: string, patch: ParticipantPatch, actor = ""): Promise<CodedParticipant | null> {
  const identity = Object.fromEntries(IDENTITY_KEYS.filter((k) => patch[k] !== undefined).map((k) => [k, patch[k]])) as Partial<ParticipantIdentity>;
  const coded: Partial<CodedParticipant> = {};
  if (patch.participations !== undefined) coded.participations = patch.participations;
  if (patch.courier !== undefined) coded.courier = patch.courier || undefined;
  if (patch.sampleCode !== undefined) coded.sampleCode = patch.sampleCode || undefined;
  if (patch.characteristics !== undefined) coded.characteristics = patch.characteristics?.length ? patch.characteristics : undefined;
  if (patch.status !== undefined) coded.status = patch.status;
  if (patch.selections !== undefined) coded.selections = patch.selections && Object.keys(patch.selections).length ? patch.selections : undefined;
  if (patch.standing !== undefined) coded.standing = patch.standing;

  const db = getDb();
  if (!db) {
    const i = mem.findIndex((x) => x.id === id);
    if (i === -1) return null;
    // the database's rules (0039): out of the round once — never changed; and its shape
    if (mem[i].standing && "standing" in coded && !sameStanding(coded.standing, mem[i].standing)) throw new Error("participants: a participation out of the round stays so — its refusal, annulment or withdrawal is never changed");
    if ("standing" in coded && !standingShapeOk(coded.standing)) throw new Error("participants_standing_shape: a refusal needs its category and reason; an annulment or a withdrawal its source");
    if (Object.keys(identity).length) await putIdentity(id, mem[i].schemeId, identity, actor);
    mem[i] = { ...mem[i], ...coded };
    return mem[i];
  }
  // the coded part and the identity together, by the database, or neither (N14)
  const row: Record<string, unknown> = {};
  if (coded.participations !== undefined) row.participations = coded.participations;
  if ("courier" in coded) row.courier = coded.courier ?? null;
  if ("sampleCode" in coded) row.sample_code = coded.sampleCode ?? null;
  if ("characteristics" in coded) row.characteristics = coded.characteristics ?? null;
  if (coded.status !== undefined) row.status = coded.status;
  if ("selections" in coded) row.selections = coded.selections ?? null;
  if ("standing" in coded) row.standing = coded.standing ?? null;
  const data = await updateWithIdentity(id, row, identity, actor);
  return data ? fromRow(data as Row) : null;
}

/** The coding act (5.3), in MEMORY: each provisional reference takes its code — the
 *  participation, its notices and its case events — with the database's rules. The
 *  database does it with the scheme in one transaction (lib/coding-store, 0040).
 *  `codes`: provisional reference → code. */
export async function recodeParticipations(schemeId: string, codes: Readonly<Record<string, string>>, actor: string): Promise<void> {
  void actor;
  const entries = Object.entries(codes);
  if (!entries.length) return;
  for (const [ref, code] of entries) if (!isProvisional(ref) || !code || isProvisional(code)) throw new Error(`coding: ${ref} → ${code} is no coding`);
  if (new Set(entries.map(([, c]) => c)).size !== entries.length) throw new Error("coding: two references would get one code");
  const db = getDb();
  if (!db) {
    const ofScheme = mem.filter((x) => x.schemeId === schemeId);
    for (const [ref, code] of entries) {
      if (!ofScheme.some((x) => x.code === ref)) throw new Error(`coding: no participation ${ref} in the scheme`);
      if (ofScheme.some((x) => x.code === code)) throw new Error(`coding: the code ${code} is taken`);
    }
    for (const x of ofScheme) if (Object.hasOwn(codes, x.code)) x.code = codes[x.code];
    recodeMemNotifications(schemeId, codes);
    recodeMemCaseEvents(schemeId, codes);
    return;
  }
  throw new Error("coding: in the database the act is recorded whole by lib/coding-store (0040)");
}
