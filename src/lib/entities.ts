// The legal entities (plan part 4.1) — in the identity store (migration 0031), the
// ONLY way in: every opening names who opens it, for what and WHICH entities, and the
// database records it in identity.openings before it returns a row. In memory,
// locally, the same rules and the same record. The role is checked by the caller's
// gate (labs.manage — lib/access).
import { getDb } from "./supabase";
import { checkOpener, recordMemOpening, identityWarn, type Opener } from "./identity-store";
import { eikKey, UUID_RE, type LegalEntity } from "./entities-model";

type Row = {
  id: string; name: string; country: string; eik: string; vat: string; correspondence_address: string; mol: string; language: string;
  state: string; vies: LegalEntity["vies"] | null; proof_path: string | null; proof_history: LegalEntity["proofHistory"] | null;
  manual_check: LegalEntity["manualCheck"] | null; origin: string; created_at: string; created_by: string;
  official_email?: string; confirmed_at?: string | null; confirmed_by?: string | null; erased_at?: string | null;
  erase_request_no?: string | null; erase_request_date?: string | null; has_participations?: boolean;
};
const fromRow = (r: Row): LegalEntity => ({
  id: r.id, name: r.name, country: r.country, eik: r.eik, vat: r.vat ?? "", correspondenceAddress: r.correspondence_address, mol: r.mol ?? "",
  language: r.language === "en" ? "en" : "bg", state: (r.state as LegalEntity["state"]) ?? "pending",
  vies: r.vies ?? undefined, proofPath: r.proof_path ?? undefined, proofHistory: r.proof_history ?? [], manualCheck: r.manual_check ?? undefined,
  origin: r.origin === "portal" ? "portal" : "pdf", createdAt: r.created_at, createdBy: r.created_by,
  officialEmail: r.official_email ?? "", confirmedAt: r.confirmed_at ?? undefined, confirmedBy: r.confirmed_by ?? undefined,
  erasedAt: r.erased_at ?? undefined, eraseRequestNo: r.erase_request_no ?? undefined, eraseRequestDate: r.erase_request_date ?? undefined,
  hasParticipations: r.has_participations === true,
});
const COLS: [keyof LegalEntity, string][] = [
  ["name", "name"], ["country", "country"], ["eik", "eik"], ["vat", "vat"], ["correspondenceAddress", "correspondence_address"], ["officialEmail", "official_email"], ["mol", "mol"],
  ["language", "language"], ["state", "state"], ["vies", "vies"], ["proofPath", "proof_path"], ["proofHistory", "proof_history"], ["manualCheck", "manual_check"], ["origin", "origin"],
];
const toFields = (patch: Partial<LegalEntity>) => ({
  ...Object.fromEntries(COLS.filter(([k]) => k in patch).map(([k, col]) => [col, patch[k] ?? null])),
  ...("eik" in patch && patch.eik ? { eik_key: eikKey(patch.eik) } : {}),
});

const memStore = globalThis as unknown as { __ptsEntitiesMem?: LegalEntity[] };
const mem: LegalEntity[] = memStore.__ptsEntitiesMem ?? (memStore.__ptsEntitiesMem = []);
/** Memory only — an entity's state, as the database's rules read it (no opening: the
 *  database reads it inside its own triggers, not through an opening). */
export const memEntityState = (id: string | undefined): string | undefined => (id ? mem.find((e) => e.id === id)?.state : undefined);

/** The entities — all (no id), or the one asked for — recorded as an opening first. An
 *  id that is no id opens nothing (4.1 review). */
export async function openEntities(who: Opener, entityId?: string): Promise<LegalEntity[]> {
  checkOpener(who);
  if (entityId !== undefined && !UUID_RE.test(entityId)) return [];
  const fromMem = () => {
    const copies = (globalThis as unknown as { __ptsSnapshotsMem?: { entityId: string }[] }).__ptsSnapshotsMem ?? [];
    const out = mem.filter((e) => entityId === undefined || e.id === entityId).map((e) => ({ ...e, hasParticipations: copies.some((c) => c.entityId === e.id) })).sort((a, b) => a.name.localeCompare(b.name, "bg"));
    recordMemOpening({ actor: who.actor.trim(), purpose: who.purpose, entityId, entityIds: out.map((e) => e.id), rows: out.length });
    return out;
  };
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.rpc("identity_entities", { p_actor: who.actor.trim(), p_purpose: who.purpose, p_entity: entityId ?? null });
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    identityWarn(e);
    return fromMem();
  }
}

/** Is this registration number (its normal form) already another entity's? The question
 *  only — not every entity opened for it (4.1 review); recorded with the one matched. */
export async function entityKeyTaken(actor: string, country: string, eik: string, except?: string): Promise<boolean> {
  checkOpener({ actor, purpose: "write" });
  const key = eikKey(eik);
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_entity_key_taken", { p_actor: actor.trim(), p_country: country, p_key: key, p_except: except ?? null });
    if (error) throw new Error(`The registration number could not be checked: ${error.message}`, { cause: error });
    return data === true;
  }
  const hit = mem.find((e) => e.country === country && eikKey(e.eik) === key && e.id !== except);
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityIds: hit ? [hit.id] : undefined, rows: hit ? 1 : 0 });
  return !!hit;
}

/** Which entity this registration number (its normal form) is — the question only, not
 *  the entities opened; recorded with the one matched (9.1: a repeated ЕИК is a request
 *  to join, never a second entity). Throws when it cannot say. */
export async function entityIdByKey(actor: string, country: string, eik: string): Promise<string | null> {
  checkOpener({ actor, purpose: "write" });
  const key = eikKey(eik);
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_entity_by_key", { p_actor: actor.trim(), p_country: country, p_key: key });
    if (error) throw new Error(`The registration number could not be checked: ${error.message}`, { cause: error });
    return typeof data === "string" && UUID_RE.test(data) ? data : null;
  }
  const hit = mem.find((e) => e.country === country && eikKey(e.eik) === key);
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityIds: hit ? [hit.id] : undefined, rows: hit ? 1 : 0 });
  return hit?.id ?? null;
}

/** A new entity, or some fields of one — recorded as a write. A new one needs every
 *  required field (lib/entities-model.readEntity checked them); never its origin,
 *  maker or creation changed after. */
export async function putEntity(id: string, patch: Partial<LegalEntity>, actor: string): Promise<void> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(id)) throw new Error("The legal entity could not be saved: no such entity");
  const db = getDb();
  if (db) {
    const { error } = await db.rpc("identity_entity_put", { p_actor: actor.trim(), p_entity: id, p_fields: toFields(patch) });
    if (error) throw new Error(`The legal entity could not be saved: ${error.message}`, { cause: error });
    return;
  }
  // memory: the database's own rules — one company once; active only with PTS's check;
  // an erased profile never changed (0037)
  const i = mem.findIndex((e) => e.id === id);
  if (i >= 0 && mem[i].erasedAt) throw new Error("The legal entity could not be saved: identity: an erased profile is never changed");
  // never the confirmation (4.4) — it is the laboratory's, made once by confirmEntity
  const { confirmedAt: _ca, confirmedBy: _cb, ...p } = patch; void _ca; void _cb;
  const wasState = i >= 0 ? mem[i].state : undefined;
  const next = i >= 0 ? { ...mem[i], ...p, origin: mem[i].origin, createdAt: mem[i].createdAt, createdBy: mem[i].createdBy } : { state: "pending", origin: "pdf", vat: "", officialEmail: "", mol: "", language: "bg", country: "BG", proofHistory: [], ...p, id, createdAt: new Date().toISOString(), createdBy: actor.trim() } as LegalEntity;
  if (next.officialEmail) next.officialEmail = next.officialEmail.trim().toLowerCase();
  if (mem.some((e) => e.id !== id && e.country === next.country && eikKey(e.eik) === eikKey(next.eik))) throw new Error("The legal entity could not be saved: duplicate key (country, eik_key)");
  if (next.state === "active" && !next.manualCheck) throw new Error("The legal entity could not be saved: violates check constraint legal_entities_active_checked");
  if (i >= 0) mem[i] = next; else mem.push(next);
  // an entity MADE inactive takes its laboratories and users with it (the database's
  // triggers, 0032/0033 — on the change, not on every save of an inactive one)
  if (next.state === "inactive" && wasState !== "inactive") {
    const g = globalThis as unknown as { __ptsLaboratoriesMem?: { entityId: string; state: string }[]; __ptsEntityUsersMem?: { entityId: string; state: string }[] };
    for (const l of g.__ptsLaboratoriesMem ?? []) if (l.entityId === id) l.state = "inactive";
    for (const u of g.__ptsEntityUsersMem ?? []) if (u.entityId === id) u.state = "inactive";
  }
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityId: id, entityIds: [id], rows: 1 });
}

/** The laboratory's confirmation of its entity's data (4.4, Реш. 145): by the profile's
 *  ACTIVE administrator, once, with an official e-mail there to be told (К23). Returns
 *  when — and whether it is now (false: it was confirmed before). The database holds
 *  the same rules (0034); memory too. */
export async function confirmEntity(entityId: string, userId: string, actor: string): Promise<{ confirmedAt: string; nowConfirmed: boolean }> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(entityId) || !UUID_RE.test(userId)) throw new Error("The profile could not be confirmed: identity: no such entity, or it is inactive");
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_entity_confirm", { p_actor: actor.trim(), p_entity: entityId, p_user: userId });
    if (error) throw new Error(`The profile could not be confirmed: ${error.message}`, { cause: error });
    const row = (Array.isArray(data) ? data[0] : data) as { confirmed_at: string; now_confirmed: boolean } | undefined;
    if (!row?.confirmed_at) throw new Error("The profile could not be confirmed: no answer");
    return { confirmedAt: row.confirmed_at, nowConfirmed: !!row.now_confirmed };
  }
  const e = mem.find((x) => x.id === entityId);
  if (!e || e.state === "inactive") throw new Error("The profile could not be confirmed: identity: no such entity, or it is inactive");
  const users = (globalThis as unknown as { __ptsEntityUsersMem?: { id: string; entityId: string; role: string; state: string }[] }).__ptsEntityUsersMem ?? [];
  if (!users.some((u) => u.id === userId && u.entityId === entityId && u.role === "admin" && u.state === "active")) throw new Error("The profile could not be confirmed: identity: only the profile's active administrator confirms");
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityId, entityIds: [entityId], userIds: [userId], rows: 1 });
  if (e.confirmedAt) return { confirmedAt: e.confirmedAt, nowConfirmed: false };
  if (!e.officialEmail) throw new Error("The profile could not be confirmed: identity: the official e-mail is required to confirm");
  e.confirmedAt = new Date().toISOString();
  e.confirmedBy = userId;
  return { confirmedAt: e.confirmedAt, nowConfirmed: true };
}

/** Memory only — is this entity erased (its laboratories and users then never changed). */
export const memEntityErased = (id: string | undefined): boolean => !!(id && mem.find((e) => e.id === id)?.erasedAt);

/** Erase a profile on request (4.7, Zadanie §10): a legal entity with NO participation —
 *  it, its laboratories and its users anonymised in one step by the database (0037),
 *  and the messages the portal sent it; the request named by its incoming number and
 *  date. Returns the sign-in accounts to delete (every one it has had) and the
 *  documents to remove. */
export async function eraseEntity(entityId: string, request: { no: string; date: string }, actor: string): Promise<{ accounts: string[]; proofs: string[]; laboratories: number; users: number; messages: number }> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(entityId)) throw new Error("The profile could not be erased: identity: no such entity");
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_entity_erase", { p_actor: actor.trim(), p_entity: entityId, p_request_no: request.no, p_request_date: request.date });
    if (error) throw new Error(`The profile could not be erased: ${error.message}`, { cause: error });
    const r = (data ?? {}) as { accounts?: string[]; proofs?: string[]; laboratories?: number; users?: number; messages?: number };
    return { accounts: r.accounts ?? [], proofs: r.proofs ?? [], laboratories: Number(r.laboratories ?? 0), users: Number(r.users ?? 0), messages: Number(r.messages ?? 0) };
  }
  // memory: the database's own rules
  if (!/^[0-9A-Za-zА-Яа-я№/.-]{1,30}$/.test(request.no) || !/^\d{4}-\d{2}-\d{2}$/.test(request.date)) throw new Error("The profile could not be erased: identity: an erasure needs the request it answers — its incoming number and date");
  const e = mem.find((x) => x.id === entityId);
  if (!e) throw new Error("The profile could not be erased: identity: no such entity");
  if (e.erasedAt) throw new Error("The profile could not be erased: identity: the profile is erased already");
  const g = globalThis as unknown as {
    __ptsSnapshotsMem?: { entityId: string }[];
    __ptsLaboratoriesMem?: { id: string; entityId: string; name: string; deliveryAddress: string; mobileOffice: boolean; accreditationNo: string; accreditationBody?: string; state: string }[];
    __ptsEntityUsersMem?: { id: string; entityId: string; email: string; name: string; position: string; phone: string; authUserId?: string; pastAuthUserIds?: string[]; receivesNotices: boolean; state: string }[];
    __ptsSentMem?: { entityId?: string; to: string; subject: string; body: string; error?: string; outcome: string; anonymisedAt?: string }[];
  };
  if ((g.__ptsSnapshotsMem ?? []).some((s) => s.entityId === entityId)) throw new Error("The profile could not be erased: identity: a profile with a participation is kept — its data is in its rounds' records");
  const users = (g.__ptsEntityUsersMem ?? []).filter((u) => u.entityId === entityId);
  const labs = (g.__ptsLaboratoriesMem ?? []).filter((l) => l.entityId === entityId);
  const accounts = [...new Set(users.flatMap((u) => [u.authUserId, ...(u.pastAuthUserIds ?? [])]).filter(Boolean) as string[])];
  const proofs = [...new Set([e.proofPath, ...(e.proofHistory ?? []).map((h) => h.path)].filter(Boolean) as string[])];
  for (const u of users) Object.assign(u, { email: `erased-${u.id}@erased.invalid`, name: "‹изтрит›", position: "", phone: "", authUserId: undefined, pastAuthUserIds: [], receivesNotices: false, state: "inactive" });
  for (const l of labs) Object.assign(l, { name: "‹изтрита›", deliveryAddress: "—", mobileOffice: false, accreditationNo: "", accreditationBody: "", state: "inactive" });
  const msgs = (g.__ptsSentMem ?? []).filter((m) => m.entityId === entityId && !m.anonymisedAt && m.outcome !== "pending");
  for (const m of msgs) Object.assign(m, { to: "‹изтрито›", subject: "‹изтрито›", body: "‹изтрито›", error: undefined, anonymisedAt: new Date().toISOString() });
  Object.assign(e, {
    name: "‹изтрито по искане›", country: "XX", eik: `ERASED-${e.id.slice(0, 8)}`, vat: "", correspondenceAddress: "—", officialEmail: "", mol: "",
    vies: undefined, proofPath: undefined, proofHistory: [], manualCheck: undefined, state: "inactive", erasedAt: new Date().toISOString(),
    eraseRequestNo: request.no, eraseRequestDate: request.date,
  });
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityId, entityIds: [entityId], userIds: users.map((u) => u.id), laboratoryIds: labs.map((l) => l.id), rows: 1 + users.length + labs.length });
  return { accounts, proofs, laboratories: labs.length, users: users.length, messages: msgs.length };
}
