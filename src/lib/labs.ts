import { randomUUID } from "crypto";
import type { Lab, LabStatus } from "./types";
import { getDb, noMemoryFallback } from "./supabase";

// Laboratory accounts (Phase 2b). Permanent, one per lab, identified by email.
// Supabase when configured, else in-memory — same graceful fallback as the rest.
// Email is always stored + queried lower-cased so it's a stable identity key.

// Shared across every server entry point (RSC pages, route handlers, actions), as
// the scheme and participant stores are: a module-local map gave a route handler
// its own empty copy in dev — a lab made there was unknown to the pages (1.4).
const memStore = globalThis as unknown as { __ptsLabMem?: Map<string, Lab> };
const mem: Map<string, Lab> = memStore.__ptsLabMem ?? (memStore.__ptsLabMem = new Map());
let warned = false;
function warn(e: unknown) {
  noMemoryFallback("labs", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[labs] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

const norm = (email: string) => email.trim().toLowerCase();

function toRow(l: Lab) {
  return {
    id: l.id, email: l.email, name: l.name, accreditation_cert: l.accreditationCert,
    contact_person: l.contactPerson, phone: l.phone, registered_address: l.registeredAddress,
    eik: l.eik, vat: l.vat, mol: l.mol, status: l.status, auth_user_id: l.authUserId ?? null,
    created_at: l.createdAt,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): Lab {
  return {
    id: r.id, email: r.email ?? "", name: r.name ?? "", accreditationCert: r.accreditation_cert ?? "",
    contactPerson: r.contact_person ?? "", phone: r.phone ?? "", registeredAddress: r.registered_address ?? "",
    eik: r.eik ?? "", vat: r.vat ?? "", mol: r.mol ?? "", status: (r.status as LabStatus) ?? "active",
    authUserId: r.auth_user_id ?? undefined, createdAt: r.created_at ?? "",
  };
}

export async function listLabs(): Promise<Lab[]> {
  const db = getDb();
  if (!db) return [...mem.values()];
  try {
    const { data, error } = await db.from("labs").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return [...mem.values()];
  }
}

export async function getLab(id: string): Promise<Lab | null> {
  if (!id) return null;
  const db = getDb();
  if (!db) return mem.get(id) ?? null;
  try {
    const { data, error } = await db.from("labs").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    return mem.get(id) ?? null;
  }
}

// The identity lookup used by lab auth: find the active lab for a login email.
export async function getLabByEmail(email: string): Promise<Lab | null> {
  const key = norm(email);
  if (!key) return null;
  const db = getDb();
  if (!db) return [...mem.values()].find((l) => l.email === key) ?? null;
  try {
    const { data, error } = await db.from("labs").select("*").eq("email", key).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    return [...mem.values()].find((l) => l.email === key) ?? null;
  }
}

// Fail-CLOSED twins for the approval guard (part 0.5): getLabByEmail and addLab
// fall back to memory on a database error, which is right for reading pages but
// would let a guard pass on a transient error, or report an account that was never
// written. These throw instead.
export async function labEmailInUse(email: string): Promise<boolean> {
  const key = norm(email);
  const db = getDb();
  if (!db) return [...mem.values()].some((l) => l.email === key);
  const { data, error } = await db.from("labs").select("id").eq("email", key).maybeSingle();
  if (error) throw error;
  return !!data;
}
export async function addLabOrThrow(input: Parameters<typeof addLab>[0]): Promise<Lab> {
  const db = getDb();
  if (!db) return addLab(input);
  const lab = buildLab(input);
  const { error } = await db.from("labs").insert(toRow(lab));
  if (error) throw error;
  return lab;
}
function buildLab(input: Parameters<typeof addLab>[0]): Lab {
  return {
    id: randomUUID(),
    email: norm(input.email),
    name: input.name,
    accreditationCert: input.accreditationCert ?? "",
    contactPerson: input.contactPerson ?? "",
    phone: input.phone ?? "",
    registeredAddress: input.registeredAddress ?? "",
    eik: input.eik ?? "",
    vat: input.vat ?? "",
    mol: input.mol ?? "",
    status: "active",
    authUserId: input.authUserId,
    createdAt: new Date().toISOString(),
  };
}

export async function addLab(input: {
  email: string; name: string; accreditationCert?: string; contactPerson?: string; phone?: string;
  registeredAddress?: string; eik?: string; vat?: string; mol?: string; authUserId?: string;
}): Promise<Lab> {
  const lab = buildLab(input);
  const db = getDb();
  if (!db) {
    mem.set(lab.id, lab);
    return lab;
  }
  try {
    const { error } = await db.from("labs").insert(toRow(lab));
    if (error) throw error;
  } catch (e) {
    warn(e);
    mem.set(lab.id, lab);
  }
  return lab;
}

export async function updateLab(id: string, patch: Partial<Omit<Lab, "id" | "createdAt">>): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.email !== undefined) row.email = norm(patch.email);
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.accreditationCert !== undefined) row.accreditation_cert = patch.accreditationCert;
      if (patch.contactPerson !== undefined) row.contact_person = patch.contactPerson;
      if (patch.phone !== undefined) row.phone = patch.phone;
      if (patch.registeredAddress !== undefined) row.registered_address = patch.registeredAddress;
      if (patch.eik !== undefined) row.eik = patch.eik;
      if (patch.vat !== undefined) row.vat = patch.vat;
      if (patch.mol !== undefined) row.mol = patch.mol;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.authUserId !== undefined) row.auth_user_id = patch.authUserId;
      const { error } = await db.from("labs").update(row).eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const cur = mem.get(id);
  if (cur) mem.set(id, { ...cur, ...patch, email: patch.email ? norm(patch.email) : cur.email });
}
