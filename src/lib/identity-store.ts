import { getDb, noMemoryFallback } from "./supabase";
import type { ParticipantIdentity } from "./types";

// The identity store (plan part 2.3; Н1, D4, Реш. 93 and 142). Who is behind a code
// — a participant's laboratory name, contact, e-mail, phone, country, delivery address
// and the link to its laboratory account — lives apart from the coded data, in a
// database schema closed to the API (migration 0024). This module is the ONLY way in:
// every opening names who opens it and for what, and the database records it in
// identity.openings before it returns a row; a read that bypasses the portal is
// recorded by Postgres audit logging (0025). No request-only imports: the role is
// checked by the caller's gate (lib/identities.ts for a person at PTS).

export type { ParticipantIdentity };

export const NO_IDENTITY: ParticipantIdentity = { labName: "", contact: "", email: "", phone: "", country: "", deliveryAddress: "" };

// what an opening is for — the database refuses any other (identity_purpose_ok)
export const IDENTITY_PURPOSES = [
  "names.view", // a page or document shows names against codes, to someone allowed to see them
  "export", // «Изнеси целия кръг», the identity part (1.10)
  "send", // a message to the laboratory, at a person's action
  "dispatch", // shipments and the chain, with addresses (D18)
  "lab.own", // the laboratory itself, in its own portal
  "write", // adding or editing a participant
  "system", // a job of the portal itself (reminders)
] as const;
export type IdentityPurpose = (typeof IDENTITY_PURPOSES)[number];
export type Opener = { actor: string; purpose: IdentityPurpose };

export interface Opening { at: string; actor: string; purpose: string; schemeId?: string; participantId?: string; participantIds?: string[]; labId?: string; entityId?: string; entityIds?: string[]; laboratoryId?: string; laboratoryIds?: string[]; userId?: string; userIds?: string[]; rows: number; dbUser?: string; loginUser?: string }

type Row = { participant_id: string; lab_name: string; contact: string; email: string; phone: string; country: string; delivery_address: string; lab_id: string | null };
const fromRow = (r: Row): ParticipantIdentity => ({
  labName: r.lab_name ?? "", contact: r.contact ?? "", email: r.email ?? "", phone: r.phone ?? "", country: r.country ?? "",
  deliveryAddress: r.delivery_address ?? "", labId: r.lab_id ?? undefined,
});
const KEYS: [keyof ParticipantIdentity, string][] = [
  ["labName", "lab_name"], ["contact", "contact"], ["email", "email"], ["phone", "phone"],
  ["country", "country"], ["deliveryAddress", "delivery_address"], ["labId", "lab_id"],
];
const toFields = (patch: Partial<ParticipantIdentity>) =>
  Object.fromEntries(KEYS.filter(([k]) => k in patch).map(([k, col]) => [col, patch[k] ?? ""]));

// memory (no database, locally): the same rules, the same record
type Mem = { ids: Map<string, ParticipantIdentity & { schemeId: string }>; openings: Opening[] };
const memStore = globalThis as unknown as { __ptsIdentityMem?: Mem };
const mem: Mem = memStore.__ptsIdentityMem ?? (memStore.__ptsIdentityMem = { ids: new Map(), openings: [] });

function check(who: Opener) {
  if (!who.actor?.trim()) throw new Error("identity: who opens it?");
  if (!(IDENTITY_PURPOSES as readonly string[]).includes(who.purpose)) throw new Error("identity: for what?");
}

/** For the other parts of the identity store (lib/entities, 4.1): its checks, and the
 *  memory record of an opening, the same as this module keeps. */
export const checkOpener = (who: Opener) => check(who);
export const recordMemOpening = (o: Omit<Opening, "at">) => { mem.openings.push({ at: new Date().toISOString(), ...o }); };
export const identityWarn = (e: unknown) => warn(e);
/** The memory record of the openings — for the tests of the parts that open it. */
export const memOpenings = (): readonly Opening[] => mem.openings;
/** Memory only — the scheme of a participation, as the database's own checks read it
 *  (lib/participation-snapshots, 4.5). */
export const memParticipantScheme = (id: string): string | undefined => mem.ids.get(id)?.schemeId;
/** Memory only — set a participation's identity fields as the database's own function
 *  does inside it (lib/participation-snapshots, 4.5): no opening of its own. */
export const memSetIdentityFields = (id: string, patch: Partial<ParticipantIdentity>): boolean => {
  const cur = mem.ids.get(id);
  if (!cur) return false;
  mem.ids.set(id, { ...cur, ...patch });
  return true;
};
/** Memory only — a participation with a copy (4.5): its laboratory name and delivery
 *  address are the copy's in force, as the database's trigger holds them. */
function frozenRefusal(participantId: string, next: Partial<ParticipantIdentity>, cur: Partial<ParticipantIdentity>): void {
  const snaps = (globalThis as unknown as { __ptsSnapshotsMem?: { participantId: string; version: number; laboratory: { name: string; deliveryAddress: string } }[] }).__ptsSnapshotsMem ?? [];
  const latest = snaps.filter((x) => x.participantId === participantId).sort((a, b) => b.version - a.version)[0];
  if (!latest) return;
  const changes = (k: "labName" | "deliveryAddress") => k in next && next[k] !== cur[k];
  if ((changes("labName") && next.labName !== latest.laboratory.name) || (changes("deliveryAddress") && next.deliveryAddress !== latest.laboratory.deliveryAddress)) {
    throw new Error("The participant's identity could not be saved: identity: the participation's laboratory is frozen — correct its link instead");
  }
}

let warned = false;
function warn(e: unknown) {
  noMemoryFallback("identity", e); // on a deployment: an error, never memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[identity] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

export type IdentityQuery = { schemeId: string; participantIds?: string[] } | { labId: string };

/** The identities asked for, by participant id — recorded as an opening first. */
export async function openIdentities(q: IdentityQuery, who: Opener): Promise<Map<string, ParticipantIdentity>> {
  check(who);
  const fromMem = () => {
    const out = new Map<string, ParticipantIdentity>();
    for (const [id, v] of mem.ids) {
      const hit = "labId" in q ? v.labId === q.labId : v.schemeId === q.schemeId && (!q.participantIds || q.participantIds.includes(id));
      if (hit) { const { schemeId: _s, ...identity } = v; void _s; out.set(id, identity); }
    }
    mem.openings.push({
      at: new Date().toISOString(), actor: who.actor.trim(), purpose: who.purpose, rows: out.size, participantIds: [...out.keys()],
      schemeId: "schemeId" in q ? q.schemeId : undefined, labId: "labId" in q ? q.labId : undefined,
    });
    return out;
  };
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.rpc("identity_open", {
      p_actor: who.actor.trim(), p_purpose: who.purpose,
      p_scheme: "schemeId" in q ? q.schemeId : null,
      p_participants: "schemeId" in q && q.participantIds ? q.participantIds : null,
      p_lab: "labId" in q ? q.labId : null,
    });
    if (error) throw error;
    return new Map(((data ?? []) as Row[]).map((r) => [r.participant_id, fromRow(r)]));
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

/** Set some of a participant's identity (only the keys given) — recorded. */
export async function putIdentity(participantId: string, schemeId: string, patch: Partial<ParticipantIdentity>, actor: string): Promise<void> {
  check({ actor, purpose: "write" });
  const db = getDb();
  if (db) {
    const { error } = await db.rpc("identity_put", { p_actor: actor.trim(), p_participant: participantId, p_fields: toFields(patch) });
    if (error) throw new Error(`The participant's identity could not be saved: ${error.message}`, { cause: error });
    return;
  }
  const cur = mem.ids.get(participantId) ?? { ...NO_IDENTITY, schemeId };
  frozenRefusal(participantId, patch, cur);
  mem.ids.set(participantId, { ...cur, ...patch, schemeId });
  mem.openings.push({ at: new Date().toISOString(), actor: actor.trim(), purpose: "write", participantId, rows: 1 });
}

/** A participation's coded part and its identity changed together, or neither (N14).
 *  Only the keys given are set; returns the coded row as it is now (null: no such). */
export async function updateWithIdentity(participantId: string, coded: Record<string, unknown>, patch: Partial<ParticipantIdentity>, actor: string): Promise<Record<string, unknown> | null> {
  const fields = toFields(patch);
  if (Object.keys(fields).length) check({ actor, purpose: "write" });
  const db = getDb();
  if (!db) throw new Error("updateWithIdentity: the memory store updates in participants.ts");
  const { data, error } = await db.rpc("identity_update_participant", { p_actor: actor.trim() || "system", p_participant: participantId, p_coded: coded, p_fields: fields });
  if (error) throw new Error(`The participant could not be saved: ${error.message}`, { cause: error });
  return ((data ?? []) as Record<string, unknown>[])[0] ?? null;
}

/** A new participant: its coded row and its identity together, or neither (N14). */
export async function addWithIdentity(row: Record<string, unknown> & { id: string; scheme_id: string }, identity: ParticipantIdentity, actor: string): Promise<void> {
  check({ actor, purpose: "write" });
  const db = getDb();
  if (!db) return putIdentity(row.id, row.scheme_id, identity, actor);
  const { error } = await db.rpc("identity_add_participant", { p_actor: actor.trim(), p_row: row, p_fields: toFields(identity) });
  if (error) throw new Error(`The participant could not be saved: ${error.message}`, { cause: error });
}

/** Every opening of a round's identities, for its export (1.10). */
export async function listOpenings(schemeId: string, participantIds: string[]): Promise<Opening[]> {
  const db = getDb();
  // the laboratory's own and the chain's openings name participants, not the scheme
  if (!db) return mem.openings.filter((o) => o.schemeId === schemeId || (o.participantId && participantIds.includes(o.participantId)) || (o.participantIds ?? []).some((id) => participantIds.includes(id)));
  const { data, error } = await db.rpc("identity_openings_for", { p_scheme: schemeId });
  if (error) throw error;
  return ((data ?? []) as { at: string; actor: string; purpose: string; participant_id: string | null; participant_ids: string[] | null; lab_id: string | null; rows: number; db_user: string; login_user: string }[])
    .map((o) => ({ at: o.at, actor: o.actor, purpose: o.purpose, schemeId, participantId: o.participant_id ?? undefined, participantIds: o.participant_ids ?? undefined, labId: o.lab_id ?? undefined, rows: o.rows, dbUser: o.db_user, loginUser: o.login_user }));
}

export type IdentityHealth = { store: boolean; moved: boolean; pgaudit: boolean; audited: string[]; session: string } | { missing: true };

/** Is the store in place, and the audit on? For «Проверка на системата» (0025).
 *  null: no database; `missing`: the database has no 0025 yet. */
export async function identityHealth(): Promise<IdentityHealth | null> {
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.rpc("identity_health");
  if (error) return { missing: true };
  return data as IdentityHealth;
}
