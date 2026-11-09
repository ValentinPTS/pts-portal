// The frozen copy per participation (plan part 4.5; J12) — in the identity store
// (migration 0035), the ONLY way in. When PTS links a participation to the laboratory
// it is for, the database takes the legal entity's and the laboratory's data as they
// are then and keeps that copy with the participation, never changed after. A wrong
// link is corrected by a NEW version with its reason — the earlier one kept (4.5
// review). The person by reference only; the МОЛ and the official e-mail, which may
// name one, apart — for the anonymisation after six years. Every opening on record.
// In memory, locally, the same rules and the same record.
import { getDb } from "./supabase";
import { checkOpener, recordMemOpening, identityWarn, memParticipantScheme, memSetIdentityFields, type Opener } from "./identity-store";
import { UUID_RE } from "./entities-model";

export interface FrozenEntity { name: string; country: string; eik: string; vat: string; correspondenceAddress: string; language: string; state: string; origin: string; confirmedAt?: string }
export interface FrozenLaboratory { name: string; deliveryAddress: string; mobileOffice: boolean; accreditationNo: string; accreditationBody: string }
export interface ParticipationSnapshot {
  participantId: string;
  /** 1, then each correction */
  version: number;
  entityId: string;
  laboratoryId: string;
  /** the person — a reference to the entity's user, never a copy */
  contactUserId?: string;
  entity: FrozenEntity;
  laboratory: FrozenLaboratory;
  /** the fields that may name a person — blanked by the anonymisation */
  mol: string;
  officialEmail: string;
  anonymisedAt?: string;
  /** the participation's own laboratory fields this copy replaced */
  replaced: { labName: string; deliveryAddress: string };
  /** a correction: the version it supersedes, and why */
  supersedes?: number;
  reason: string;
  takenAt: string;
  takenBy: string;
}
export const REASON_MAX = 300;

type J = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const entityOf = (j: J): FrozenEntity => ({
  name: str(j.name), country: str(j.country), eik: str(j.eik), vat: str(j.vat), correspondenceAddress: str(j.correspondence_address),
  language: str(j.language), state: str(j.state), origin: str(j.origin), confirmedAt: str(j.confirmed_at) || undefined,
});
const laboratoryOf = (j: J): FrozenLaboratory => ({ name: str(j.name), deliveryAddress: str(j.delivery_address), mobileOffice: j.mobile_office === true, accreditationNo: str(j.accreditation_no), accreditationBody: str(j.accreditation_body) });
type Row = {
  participant_id: string; version: number; entity_id: string; laboratory_id: string; contact_user_id: string | null; entity: J; laboratory: J;
  mol: string; official_email: string; anonymised_at: string | null; replaced: J; supersedes: number | null; reason: string; taken_at: string; taken_by: string;
};
const fromRow = (r: Row): ParticipationSnapshot => ({
  participantId: r.participant_id, version: Number(r.version), entityId: r.entity_id, laboratoryId: r.laboratory_id, contactUserId: r.contact_user_id ?? undefined,
  entity: entityOf(r.entity ?? {}), laboratory: laboratoryOf(r.laboratory ?? {}), mol: r.mol ?? "", officialEmail: r.official_email ?? "",
  anonymisedAt: r.anonymised_at ?? undefined, replaced: { labName: str(r.replaced?.lab_name), deliveryAddress: str(r.replaced?.delivery_address) },
  supersedes: r.supersedes ?? undefined, reason: r.reason ?? "", takenAt: r.taken_at, takenBy: r.taken_by,
});

const memStore = globalThis as unknown as { __ptsSnapshotsMem?: ParticipationSnapshot[] };
const mem: ParticipationSnapshot[] = memStore.__ptsSnapshotsMem ?? (memStore.__ptsSnapshotsMem = []);

/** The copy in force — the newest version — of each participation. */
export function inForce(snaps: readonly ParticipationSnapshot[]): Map<string, ParticipationSnapshot> {
  const out = new Map<string, ParticipationSnapshot>();
  for (const s of snaps) if ((out.get(s.participantId)?.version ?? 0) < s.version) out.set(s.participantId, s);
  return out;
}

/** Freeze a participation's copy — the first, or with a reason a correction that
 *  supersedes the one in force; the laboratory active, its entity not inactive; the
 *  contact, if named, a user of that entity. Returns the version. Recorded. */
export async function freezeParticipation(participantId: string, laboratoryId: string, contactUserId: string | undefined, actor: string, reason?: string): Promise<number> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(participantId) || !UUID_RE.test(laboratoryId) || (contactUserId !== undefined && !UUID_RE.test(contactUserId))) throw new Error("The copy could not be taken: identity: no such participant");
  const why = (reason ?? "").trim().slice(0, REASON_MAX);
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_participation_freeze", { p_actor: actor.trim(), p_participant: participantId, p_laboratory: laboratoryId, p_contact: contactUserId ?? null, p_reason: why || null });
    if (error) throw new Error(`The copy could not be taken: ${error.message}`, { cause: error });
    return Number(data ?? 0);
  }
  // memory: the database's own rules (0035), from the stores' own rows
  const g = globalThis as unknown as {
    __ptsLaboratoriesMem?: { id: string; entityId: string; name: string; deliveryAddress: string; mobileOffice: boolean; accreditationNo: string; accreditationBody?: string; state: string }[];
    __ptsEntitiesMem?: { id: string; name: string; country: string; eik: string; vat: string; correspondenceAddress: string; officialEmail?: string; mol: string; language: string; state: string; origin: string; confirmedAt?: string }[];
    __ptsEntityUsersMem?: { id: string; entityId: string; state: string }[];
    __ptsIdentityMem?: { ids: Map<string, { labName: string; deliveryAddress: string }> };
  };
  if (!memParticipantScheme(participantId)) throw new Error("The copy could not be taken: identity: no such participant");
  const prev = Math.max(0, ...mem.filter((s) => s.participantId === participantId).map((s) => s.version));
  if (prev && !why) throw new Error("The copy could not be taken: identity: the participation is frozen already — a correction needs its reason");
  const l = (g.__ptsLaboratoriesMem ?? []).find((x) => x.id === laboratoryId);
  if (!l) throw new Error("The copy could not be taken: identity: no such laboratory, or it is inactive");
  const e = (g.__ptsEntitiesMem ?? []).find((x) => x.id === l.entityId);
  if (!e || e.state === "inactive") throw new Error("The copy could not be taken: identity: no such entity, or it is inactive");
  if (l.state !== "active") throw new Error("The copy could not be taken: identity: no such laboratory, or it is inactive");
  if (contactUserId && !(g.__ptsEntityUsersMem ?? []).some((u) => u.id === contactUserId && u.entityId === e.id && u.state !== "inactive")) throw new Error("The copy could not be taken: identity: the contact is not a user of that entity");
  const was = g.__ptsIdentityMem?.ids.get(participantId);
  const snap: ParticipationSnapshot = {
    participantId, version: prev + 1, entityId: e.id, laboratoryId: l.id, contactUserId,
    entity: { name: e.name, country: e.country, eik: e.eik, vat: e.vat, correspondenceAddress: e.correspondenceAddress, language: e.language, state: e.state, origin: e.origin, confirmedAt: e.confirmedAt },
    laboratory: { name: l.name, deliveryAddress: l.deliveryAddress, mobileOffice: l.mobileOffice, accreditationNo: l.accreditationNo, accreditationBody: l.accreditationBody ?? "" },
    mol: e.mol ?? "", officialEmail: e.officialEmail ?? "",
    replaced: { labName: was?.labName ?? "", deliveryAddress: was?.deliveryAddress ?? "" },
    supersedes: prev || undefined, reason: why, takenAt: new Date().toISOString(), takenBy: actor.trim(),
  };
  mem.push(snap);
  memSetIdentityFields(participantId, { labName: l.name, deliveryAddress: l.deliveryAddress });
  recordMemOpening({ actor: actor.trim(), purpose: "write", participantId, entityId: e.id, laboratoryId: l.id, userId: contactUserId, rows: 1 });
  return snap.version;
}

/** The copies of a scheme's participations, every version — recorded as an opening first. */
export async function openParticipationSnapshots(who: Opener, schemeId: string): Promise<ParticipationSnapshot[]> {
  checkOpener(who);
  const fromMem = () => {
    const out = mem.filter((s) => memParticipantScheme(s.participantId) === schemeId).map((s) => ({ ...s, entity: { ...s.entity }, laboratory: { ...s.laboratory }, replaced: { ...s.replaced } }));
    recordMemOpening({ actor: who.actor.trim(), purpose: who.purpose, schemeId, participantIds: [...new Set(out.map((s) => s.participantId))], rows: out.length });
    return out;
  };
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.rpc("identity_participation_snapshots", { p_actor: who.actor.trim(), p_purpose: who.purpose, p_scheme: schemeId });
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    identityWarn(e);
    return fromMem();
  }
}

/** The anonymisation of a participation's copies (Zadanie §10, after six years): the
 *  МОЛ and the official e-mail blanked — the one change a copy allows. Returns how many. */
export async function anonymiseParticipationSnapshots(participantId: string, actor: string): Promise<number> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(participantId)) return 0;
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_participation_anonymise", { p_actor: actor.trim(), p_participant: participantId });
    if (error) throw new Error(`The copies could not be anonymised: ${error.message}`, { cause: error });
    return Number(data ?? 0);
  }
  const at = new Date().toISOString();
  const hit = mem.filter((s) => s.participantId === participantId && !s.anonymisedAt);
  for (const s of hit) Object.assign(s, { mol: "", officialEmail: "", anonymisedAt: at });
  recordMemOpening({ actor: actor.trim(), purpose: "write", participantId, rows: hit.length });
  return hit.length;
}

// ── a participant's user's own participations, and a participation's recipients (4.6) ──

export interface OwnParticipation { participantId: string; schemeId: string; code: string; status: string; laboratoryId: string; version: number }

/** The participations of an entity's laboratories — the copies in force (the laboratory
 *  switcher, 4.6). The laboratory's own opening (lab.own), on record. */
export async function participationsOfEntity(entityId: string, actor: string): Promise<OwnParticipation[]> {
  checkOpener({ actor, purpose: "lab.own" });
  if (!UUID_RE.test(entityId)) return [];
  const db = getDb();
  if (db) {
    try {
      const { data, error } = await db.rpc("identity_participations_of_entity", { p_actor: actor.trim(), p_entity: entityId });
      if (error) throw error;
      return ((data ?? []) as { participant_id: string; scheme_id: string; code: string; status: string; laboratory_id: string; version: number }[])
        .map((r) => ({ participantId: r.participant_id, schemeId: r.scheme_id, code: r.code, status: r.status, laboratoryId: r.laboratory_id, version: Number(r.version) }));
    } catch (e) {
      identityWarn(e); // on a deployment: an error, never memory
    }
  }
  const { listParticipants } = await import("./participants");
  const mine = [...inForce(mem).values()].filter((s) => s.entityId === entityId);
  const out: OwnParticipation[] = [];
  for (const schemeId of new Set(mine.map((s) => memParticipantScheme(s.participantId)).filter(Boolean) as string[])) {
    const coded = new Map((await listParticipants(schemeId)).map((p) => [p.id, p]));
    for (const s of mine) { const p = coded.get(s.participantId); if (p) out.push({ participantId: p.id, schemeId, code: p.code, status: p.status, laboratoryId: s.laboratoryId, version: s.version }); }
  }
  recordMemOpening({ actor: actor.trim(), purpose: "lab.own", entityId, participantIds: out.map((p) => p.participantId), rows: out.length });
  return out;
}

/** Who receives a participation's notices by e-mail (4.6, N28): its entity's ACTIVE
 *  users who receive them, by the copy in force — each person, not one address per
 *  laboratory. `hasCopy`: the participation is linked by a copy — then its people are
 *  the only ones (none yet: the notice waits for one, review). Without a copy: the
 *  earlier laboratory account's address is the caller's. Recorded (purpose «send»).
 *  Throws when the database cannot say — but a database still without migration 0036
 *  answers «no copy» (review: the earlier accounts' notices go on as before). */
export async function noticeRecipients(schemeId: string, code: string, actor: string): Promise<{ hasCopy: boolean; people: { entityId: string; userId: string; email: string }[] }> {
  checkOpener({ actor, purpose: "send" });
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_notice_recipients", { p_actor: actor.trim(), p_scheme: schemeId, p_code: code });
    if (error) {
      if (missingFunction(error)) { identityMissingOnce("identity_notice_recipients"); return { hasCopy: false, people: [] }; }
      throw new Error(`The recipients could not be read: ${error.message}`, { cause: error });
    }
    const rows = (data ?? []) as { entity_id: string; user_id: string | null; email: string | null }[];
    return { hasCopy: rows.length > 0, people: rows.filter((r) => r.user_id && r.email).map((r) => ({ entityId: r.entity_id, userId: r.user_id!, email: r.email! })) };
  }
  const { listParticipants } = await import("./participants");
  const p = (await listParticipants(schemeId)).find((x) => x.code === code);
  const snap = p ? inForce(mem.filter((s) => s.participantId === p.id)).get(p.id) : undefined;
  const users = ((globalThis as unknown as { __ptsEntityUsersMem?: { id: string; entityId: string; email: string; state: string; receivesNotices?: boolean }[] }).__ptsEntityUsersMem ?? [])
    .filter((u) => !!snap && u.entityId === snap.entityId && u.state === "active" && u.receivesNotices !== false)
    .sort((a, b) => a.email.localeCompare(b.email));
  recordMemOpening({ actor: actor.trim(), purpose: "send", schemeId, participantId: p?.id, entityId: snap?.entityId, userIds: users.map((u) => u.id), rows: users.length });
  return { hasCopy: !!snap, people: users.map((u) => ({ entityId: u.entityId, userId: u.id, email: u.email })) };
}

/** The database does not have this function yet (a migration still to apply). */
const missingFunction = (e: { code?: string; message?: string }) => e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? "");
const warnedMissing = new Set<string>();
function identityMissingOnce(fn: string) {
  if (warnedMissing.has(fn)) return;
  warnedMissing.add(fn);
  console.warn(`[participation-snapshots] ${fn} is not in the database yet — apply migration 0036`);
}

/** The legal entity of a participation's copy in force — or null: none yet (4.6: is
 *  there anyone to tell?). Recorded (purpose «send»). Throws when the database cannot say. */
export async function participationEntity(schemeId: string, code: string, actor: string): Promise<string | null> {
  checkOpener({ actor, purpose: "send" });
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_participation_entity", { p_actor: actor.trim(), p_scheme: schemeId, p_code: code });
    if (error) {
      if (missingFunction(error)) { identityMissingOnce("identity_participation_entity"); return null; }
      throw new Error(`The participation could not be read: ${error.message}`, { cause: error });
    }
    return typeof data === "string" && UUID_RE.test(data) ? data : null;
  }
  const { listParticipants } = await import("./participants");
  const p = (await listParticipants(schemeId)).find((x) => x.code === code);
  const snap = p ? inForce(mem.filter((s) => s.participantId === p.id)).get(p.id) : undefined;
  recordMemOpening({ actor: actor.trim(), purpose: "send", schemeId, participantId: p?.id, entityId: snap?.entityId, rows: snap ? 1 : 0 });
  return snap?.entityId ?? null;
}

// ── the round's parties, for its export (4.8) ──────────────────────────────────────

export interface RoundParties {
  entities: { id: string; name: string; country: string; eik: string; vat: string; correspondenceAddress: string; officialEmail: string; mol: string; language: string; state: string; origin: string; confirmedAt: string; erasedAt: string; viesStatus: string; viesName: string; manualCheckAt: string }[];
  laboratories: { id: string; entityId: string; name: string; deliveryAddress: string; mobileOffice: boolean; accreditationNo: string; accreditationBody: string; state: string }[];
  users: { id: string; entityId: string; name: string; position: string; email: string; phone: string; role: string; state: string; receivesNotices: boolean; twoFactorRequired: boolean }[];
}

/** The round's legal entities — those its participations' copies name — with all their
 *  laboratories and users, as they are today: ONE opening recorded against the round
 *  (0038). Only what the export writes — never a sign-in account, a stored document,
 *  PTS's check note or an erasure's request. Whole or not made: a database error throws. */
export async function openRoundParties(who: Opener, schemeId: string): Promise<RoundParties> {
  checkOpener(who);
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_round_parties", { p_actor: who.actor.trim(), p_purpose: who.purpose, p_scheme: schemeId });
    if (error) throw error;
    const r = (data ?? {}) as Partial<RoundParties>;
    const str = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null || v === undefined ? "" : v]));
    return {
      entities: (r.entities ?? []).map((e) => str(e as unknown as Record<string, unknown>)) as unknown as RoundParties["entities"],
      laboratories: r.laboratories ?? [],
      users: r.users ?? [],
    };
  }
  const g = globalThis as unknown as {
    __ptsEntitiesMem?: { id: string; name: string; country: string; eik: string; vat: string; correspondenceAddress: string; officialEmail?: string; mol: string; language: string; state: string; origin: string; confirmedAt?: string; erasedAt?: string; vies?: { status?: string; name?: string }; manualCheck?: { at?: string } }[];
    __ptsLaboratoriesMem?: { id: string; entityId: string; name: string; deliveryAddress: string; mobileOffice: boolean; accreditationNo: string; accreditationBody?: string; state: string }[];
    __ptsEntityUsersMem?: { id: string; entityId: string; name: string; position: string; email: string; phone: string; role: string; state: string; receivesNotices?: boolean; twoFactorRequired: boolean }[];
  };
  const ents = new Set(mem.filter((s) => memParticipantScheme(s.participantId) === schemeId).map((s) => s.entityId));
  const entities = (g.__ptsEntitiesMem ?? []).filter((e) => ents.has(e.id)).sort((a, b) => a.name.localeCompare(b.name, "bg")).map((e) => ({
    id: e.id, name: e.name, country: e.country, eik: e.eik, vat: e.vat, correspondenceAddress: e.correspondenceAddress, officialEmail: e.officialEmail ?? "", mol: e.mol,
    language: e.language, state: e.state, origin: e.origin, confirmedAt: e.confirmedAt ?? "", erasedAt: e.erasedAt ?? "", viesStatus: e.vies?.status ?? "", viesName: e.vies?.name ?? "", manualCheckAt: e.manualCheck?.at ?? "",
  }));
  const laboratories = (g.__ptsLaboratoriesMem ?? []).filter((l) => ents.has(l.entityId)).sort((a, b) => a.name.localeCompare(b.name, "bg")).map((l) => ({
    id: l.id, entityId: l.entityId, name: l.name, deliveryAddress: l.deliveryAddress, mobileOffice: l.mobileOffice, accreditationNo: l.accreditationNo, accreditationBody: l.accreditationBody ?? "", state: l.state,
  }));
  const users = (g.__ptsEntityUsersMem ?? []).filter((u) => ents.has(u.entityId)).sort((a, b) => a.name.localeCompare(b.name, "bg")).map((u) => ({
    id: u.id, entityId: u.entityId, name: u.name, position: u.position, email: u.email, phone: u.phone, role: u.role, state: u.state, receivesNotices: u.receivesNotices !== false, twoFactorRequired: u.twoFactorRequired,
  }));
  recordMemOpening({ actor: who.actor.trim(), purpose: who.purpose, schemeId, entityIds: [...ents], laboratoryIds: laboratories.map((l) => l.id), userIds: users.map((u) => u.id), rows: ents.size + laboratories.length + users.length });
  return { entities, laboratories, users };
}
