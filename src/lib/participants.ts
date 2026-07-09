import { randomInt, randomUUID } from "crypto";
import type { Participant, ParticipantStatus } from "./types";
import { getDb } from "./supabase";
import { getScheme } from "./store";

// Participant code format YYMNNLL (per the project's notepad spec):
//   YY = 2-digit year, M = month (no leading zero), N = project sequence in the
//   month, LL = participating-lab sequence (2-digit). e.g. PTS 25/07-T-1 → 257101.
function schemePrefix(number: string): string {
  const m = number.match(/(\d{2})\/(\d{2})-[A-Za-zА-Яа-я]-(\d+)/);
  if (!m) return "";
  return `${m[1]}${parseInt(m[2], 10)}${parseInt(m[3], 10)}`;
}
const pad2 = (n: number) => String(n).padStart(2, "0");

// Participant store — Supabase when configured, else in-memory (same as the
// scheme store). Each participant gets a random, unique-per-scheme secret code.

// Shared across all server entry points + HMR (see store.ts) so RSC pages, route
// handlers and server actions see the same list in the no-DB dev fallback.
const memStore = globalThis as unknown as { __ptsParticipantMem?: Participant[] };
const mem: Participant[] = memStore.__ptsParticipantMem ?? (memStore.__ptsParticipantMem = []);
let warned = false;
function warn(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[participants] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(p: Participant) {
  return {
    id: p.id, scheme_id: p.schemeId, code: p.code, lab_name: p.labName,
    contact: p.contact, email: p.email, phone: p.phone, country: p.country,
    delivery_address: p.deliveryAddress, participations: p.participations, status: p.status,
    lab_id: p.labId ?? null,
    courier: p.courier ?? null, sample_code: p.sampleCode ?? null,
    characteristics: p.characteristics ?? null,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): Participant {
  return {
    id: r.id, schemeId: r.scheme_id, code: r.code, labName: r.lab_name,
    contact: r.contact ?? "", email: r.email ?? "", phone: r.phone ?? "", country: r.country ?? "",
    deliveryAddress: r.delivery_address ?? "", participations: r.participations ?? 1,
    status: r.status as ParticipantStatus,
    labId: r.lab_id ?? undefined,
    courier: r.courier ?? undefined, sampleCode: r.sample_code ?? undefined,
    characteristics: Array.isArray(r.characteristics) ? (r.characteristics as number[]) : undefined,
  };
}

// Next code for the scheme: prefix + the next 2-digit lab sequence.
// Falls back to a random 6-digit code only if the scheme number can't be parsed.
function nextCode(prefix: string, taken: string[]): string {
  if (!prefix) {
    const set = new Set(taken);
    for (let i = 0; i < 10000; i++) {
      const c = String(randomInt(100000, 1000000));
      if (!set.has(c)) return c;
    }
    return String(Date.now()).slice(-6);
  }
  const used = taken
    .filter((c) => c.startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = used.length ? Math.max(...used) + 1 : 1;
  return `${prefix}${pad2(next)}`;
}

export async function listParticipants(schemeId: string): Promise<Participant[]> {
  const db = getDb();
  if (!db) return mem.filter((p) => p.schemeId === schemeId);
  try {
    const { data, error } = await db.from("participants").select("*").eq("scheme_id", schemeId).order("code");
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return mem.filter((p) => p.schemeId === schemeId);
  }
}

// All participations belonging to one permanent lab account, across every scheme
// (Phase 2b — the lab portal's "My schemes"). One indexed query on lab_id.
export async function listParticipationsForLab(labId: string): Promise<Participant[]> {
  if (!labId) return [];
  const db = getDb();
  if (!db) return mem.filter((p) => p.labId === labId);
  try {
    const { data, error } = await db.from("participants").select("*").eq("lab_id", labId).order("scheme_id");
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return mem.filter((p) => p.labId === labId);
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
}): Promise<Participant> {
  const [existing, scheme] = await Promise.all([
    listParticipants(input.schemeId),
    getScheme(input.schemeId),
  ]);
  const prefix = scheme ? schemePrefix(scheme.number) : "";
  const p: Participant = {
    id: randomUUID(),
    schemeId: input.schemeId,
    code: nextCode(prefix, existing.map((x) => x.code)),
    labName: input.labName,
    contact: input.contact ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    country: input.country ?? "",
    deliveryAddress: input.deliveryAddress ?? "",
    participations: input.participations && input.participations > 0 ? input.participations : 1,
    status: "applied",
    labId: input.labId,
    courier: input.courier || undefined,
    sampleCode: input.sampleCode || undefined,
    characteristics: input.characteristics?.length ? input.characteristics : undefined,
  };
  const db = getDb();
  if (!db) {
    mem.push(p);
    return p;
  }
  try {
    const { error } = await db.from("participants").insert(toRow(p));
    if (error) throw error;
  } catch (e) {
    warn(e);
    mem.push(p);
  }
  return p;
}

// Patch one participation (edit form; Phase-4 status transitions). The code and
// scheme are immutable — the code is the confidential identity everywhere.
export type ParticipantPatch = Partial<
  Pick<Participant, "labName" | "contact" | "email" | "phone" | "country" |
    "deliveryAddress" | "participations" | "courier" | "sampleCode" | "characteristics" | "status">
>;
export async function updateParticipant(id: string, patch: ParticipantPatch): Promise<Participant | null> {
  const apply = (p: Participant): Participant => ({ ...p, ...patch });
  const db = getDb();
  if (!db) {
    const i = mem.findIndex((x) => x.id === id);
    if (i === -1) return null;
    mem[i] = apply(mem[i]);
    return mem[i];
  }
  try {
    const row: Partial<Row> = {};
    if (patch.labName !== undefined) row.lab_name = patch.labName;
    if (patch.contact !== undefined) row.contact = patch.contact;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.country !== undefined) row.country = patch.country;
    if (patch.deliveryAddress !== undefined) row.delivery_address = patch.deliveryAddress;
    if (patch.participations !== undefined) row.participations = patch.participations;
    if (patch.courier !== undefined) row.courier = patch.courier || null;
    if (patch.sampleCode !== undefined) row.sample_code = patch.sampleCode || null;
    if (patch.characteristics !== undefined) row.characteristics = patch.characteristics?.length ? patch.characteristics : null;
    if (patch.status !== undefined) row.status = patch.status;
    const { data, error } = await db.from("participants").update(row).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    const i = mem.findIndex((x) => x.id === id);
    if (i === -1) return null;
    mem[i] = apply(mem[i]);
    return mem[i];
  }
}
