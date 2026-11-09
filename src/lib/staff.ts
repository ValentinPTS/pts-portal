import { randomUUID } from "crypto";
import type { StaffUser, StaffRole, StaffStatus } from "./types";
import { getDb, noMemoryFallback } from "./supabase";

// Internal staff accounts (Phase RT1) — manager / staff / auditor. One row per
// internal user, identified by email. Supabase when configured, else in-memory —
// the same graceful fallback as labs.ts. Email is stored + queried lower-cased so
// it's a stable identity key. The confidential name↔code mapping is gated to the
// "manager" role (lib/roles.ts); see migrations/0008_roles.sql.

// shared across every server entry point, as the other stores are (see labs.ts)
const memStore = globalThis as unknown as { __ptsStaffMem?: Map<string, StaffUser> };
const mem: Map<string, StaffUser> = memStore.__ptsStaffMem ?? (memStore.__ptsStaffMem = new Map());
let warned = false;
function warn(e: unknown) {
  noMemoryFallback("staff", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[staff] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

const norm = (email: string) => email.trim().toLowerCase();

function toRow(u: StaffUser) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
    created_at: u.createdAt,
    // only when set: an older database (before 0023) still takes the row
    ...(u.permanentRole ? { permanent_role: u.permanentRole } : {}),
  } as { id: string; email: string; name: string; role: string; status: string; created_at: string; permanent_role?: string | null };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): StaffUser {
  return {
    id: r.id, email: r.email ?? "", name: r.name ?? "",
    role: (r.role as StaffRole) ?? "staff", status: (r.status as StaffStatus) ?? "active",
    createdAt: r.created_at ?? "",
    permanentRole: r.permanent_role === "quality" || r.permanent_role === "software_admin" ? r.permanent_role : undefined,
  };
}

export async function listStaff(): Promise<StaffUser[]> {
  const db = getDb();
  if (!db) return [...mem.values()];
  try {
    const { data, error } = await db.from("staff_users").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return [...mem.values()];
  }
}

// The identity lookup used by role resolution: find the staff user for a login email.
// Fail-CLOSED twin for the lab-account approval guard (part 0.5): throws on a
// database error rather than answering "no such staff member".
export async function staffEmailInUse(email: string): Promise<boolean> {
  const key = norm(email);
  const db = getDb();
  if (!db) return [...mem.values()].some((u) => u.email === key);
  const { data, error } = await db.from("staff_users").select("id").eq("email", key).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function getStaffByEmail(email: string): Promise<StaffUser | null> {
  const key = norm(email);
  if (!key) return null;
  const db = getDb();
  if (!db) return [...mem.values()].find((u) => u.email === key) ?? null;
  try {
    const { data, error } = await db.from("staff_users").select("*").eq("email", key).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    return [...mem.values()].find((u) => u.email === key) ?? null;
  }
}

export async function getStaff(id: string): Promise<StaffUser | null> {
  if (!id) return null;
  const db = getDb();
  if (!db) return mem.get(id) ?? null;
  try {
    const { data, error } = await db.from("staff_users").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    return mem.get(id) ?? null;
  }
}

export async function addStaff(input: {
  email: string; name?: string; role?: StaffRole;
}): Promise<StaffUser> {
  const u: StaffUser = {
    id: randomUUID(),
    email: norm(input.email),
    name: input.name ?? "",
    role: input.role ?? "staff",
    status: "active",
    createdAt: new Date().toISOString(),
  };
  const db = getDb();
  if (!db) {
    mem.set(u.id, u);
    return u;
  }
  try {
    const { error } = await db.from("staff_users").insert(toRow(u));
    if (error) throw error;
  } catch (e) {
    warn(e);
    mem.set(u.id, u);
  }
  return u;
}

export async function updateStaff(
  id: string,
  patch: Partial<Pick<StaffUser, "name" | "role" | "status">> & { permanentRole?: StaffUser["permanentRole"] | null },
): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.role !== undefined) row.role = patch.role;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.permanentRole !== undefined) row.permanent_role = patch.permanentRole;
      const { error } = await db.from("staff_users").update(row).eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const cur = mem.get(id);
  if (cur) mem.set(id, { ...cur, ...patch, permanentRole: patch.permanentRole === undefined ? cur.permanentRole : patch.permanentRole ?? undefined });
}
