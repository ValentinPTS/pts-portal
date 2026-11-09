// The laboratories (plan part 4.2) — in the identity store (migration 0032), the ONLY
// way in: every opening names who opens it, for what and WHICH laboratories, recorded
// in identity.openings before a row returns. In memory, locally, the same rules and the
// same record. The role is checked by the caller's gate (labs.manage — lib/access).
import { getDb } from "./supabase";
import { checkOpener, recordMemOpening, identityWarn, type Opener } from "./identity-store";
import { UUID_RE } from "./entities-model";
import { memEntityState, memEntityErased } from "./entities";
import type { Laboratory } from "./laboratories-model";

type Row = { id: string; entity_id: string; name: string; delivery_address: string; mobile_office: boolean; accreditation_no: string; accreditation_body?: string; state: string; created_at: string; created_by: string };
const fromRow = (r: Row): Laboratory => ({
  id: r.id, entityId: r.entity_id, name: r.name, deliveryAddress: r.delivery_address, mobileOffice: !!r.mobile_office,
  accreditationNo: r.accreditation_no ?? "", accreditationBody: r.accreditation_body ?? "", state: r.state === "inactive" ? "inactive" : "active", createdAt: r.created_at, createdBy: r.created_by,
});
const COLS: [keyof Laboratory, string][] = [["entityId", "entity_id"], ["name", "name"], ["deliveryAddress", "delivery_address"], ["mobileOffice", "mobile_office"], ["accreditationNo", "accreditation_no"], ["accreditationBody", "accreditation_body"], ["state", "state"]];
const toFields = (patch: Partial<Laboratory>) => Object.fromEntries(COLS.filter(([k]) => k in patch).map(([k, col]) => [col, patch[k] ?? null]));

const memStore = globalThis as unknown as { __ptsLaboratoriesMem?: Laboratory[] };
const mem: Laboratory[] = memStore.__ptsLaboratoriesMem ?? (memStore.__ptsLaboratoriesMem = []);

/** The laboratories — of one entity, one laboratory, or all — recorded as an opening
 *  first. An id that is no id opens nothing. */
export async function openLaboratories(who: Opener, q: { entityId?: string; laboratoryId?: string } = {}): Promise<Laboratory[]> {
  checkOpener(who);
  if ((q.entityId !== undefined && !UUID_RE.test(q.entityId)) || (q.laboratoryId !== undefined && !UUID_RE.test(q.laboratoryId))) return [];
  const fromMem = () => {
    const out = mem.filter((l) => (q.entityId === undefined || l.entityId === q.entityId) && (q.laboratoryId === undefined || l.id === q.laboratoryId))
      .map((l) => ({ ...l })).sort((a, b) => a.name.localeCompare(b.name, "bg"));
    recordMemOpening({ actor: who.actor.trim(), purpose: who.purpose, entityId: q.entityId, laboratoryIds: out.map((l) => l.id), rows: out.length });
    return out;
  };
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.rpc("identity_laboratories", { p_actor: who.actor.trim(), p_purpose: who.purpose, p_entity: q.entityId ?? null, p_laboratory: q.laboratoryId ?? null });
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    identityWarn(e);
    return fromMem();
  }
}

/** A new laboratory of an entity (not inactive), or some fields of one — recorded as a
 *  write; never its entity, maker or creation changed after. */
export async function putLaboratory(id: string, patch: Partial<Laboratory>, actor: string): Promise<void> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(id)) throw new Error("The laboratory could not be saved: no such laboratory");
  const db = getDb();
  if (db) {
    const { error } = await db.rpc("identity_laboratory_put", { p_actor: actor.trim(), p_laboratory: id, p_fields: toFields(patch) });
    if (error) throw new Error(`The laboratory could not be saved: ${error.message}`, { cause: error });
    return;
  }
  // memory: the database's own rules (0032) — never its id, maker, creation or entity
  // changed; required fields; active only under an entity that is not inactive
  const { id: _i, createdAt: _c, createdBy: _b, entityId: _e, ...rest } = patch; void _i; void _c; void _b; void _e;
  const i = mem.findIndex((l) => l.id === id);
  if (memEntityErased(i >= 0 ? mem[i].entityId : patch.entityId)) throw new Error("The laboratory could not be saved: identity: an erased profile is never changed");
  const next: Laboratory = i >= 0 ? { ...mem[i], ...rest } : { mobileOffice: false, accreditationNo: "", accreditationBody: "", state: "active", ...rest, entityId: patch.entityId ?? "", id, createdAt: new Date().toISOString(), createdBy: actor.trim() } as Laboratory;
  if (!next.name?.trim() || !next.deliveryAddress?.trim()) throw new Error("The laboratory could not be saved: violates not-null or check constraint");
  if (next.state === "active" && !["pending", "active"].includes(memEntityState(next.entityId) ?? "")) throw new Error("The laboratory could not be saved: identity: no such entity, or it is inactive");
  if (i >= 0) mem[i] = next; else mem.push(next);
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityId: next.entityId, laboratoryIds: [id], rows: 1 });
}
