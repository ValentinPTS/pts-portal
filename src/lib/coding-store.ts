// The coding act's write (plan part 5.3): the record, the scheme's own records under the
// new codes, and each participation with its notices and case events — WHOLE, or not at
// all. In the database one transaction (0040 `code_participations`, the scheme's row
// locked: a second act at the same moment, on any server, is refused). In memory the
// same rules, inside the scheme's lock.

import type { Scheme } from "./types";
import { getDb } from "./supabase";
import { getScheme, updateSchemeWith } from "./store";
import { randomUUID } from "crypto";
import { listParticipants, recodeParticipations, schemePrefix } from "./participants";
import { drawCodes, isProvisional, recodeScheme, type CodingRecord } from "./coding-model";
import { uniformBelow } from "./random";

export type CommitProblem = "twice" | "gone" | "failed";

/** Record the act. `extra(cur)` adds to the scheme's patch (e.g. stage 9), from the
 *  scheme as it is at the write. */
export async function commitCoding(schemeId: string, record: CodingRecord, extra: (cur: Scheme) => Partial<Scheme>, actor: string): Promise<{ ok: true } | { ok: false; problem: CommitProblem; message?: string }> {
  const db = getDb();
  if (db) {
    const cur = await getScheme(schemeId);
    if (!cur) return { ok: false, problem: "gone" };
    const patch = { ...recodeScheme(cur, record.codes), ...extra(cur) };
    const { error } = await db.rpc("code_participations", { p_actor: actor, p_scheme: schemeId, p_record: record, p_patch: patch });
    if (!error) return { ok: true };
    return { ok: false, problem: /already coded|is taken|not a provisional|no participation/.test(error.message) ? "twice" : "failed", message: error.message };
  }
  // memory: the database's rules, checked first — then the scheme and the participations
  const parts = await listParticipants(schemeId);
  const held = new Set(parts.map((p) => p.code));
  const codes = Object.entries(record.codes);
  if (!codes.length || new Set(codes.map(([, c]) => c)).size !== codes.length) return { ok: false, problem: "failed", message: "coding: two references would get one code" };
  if (codes.some(([ref, code]) => !isProvisional(ref) || !held.has(ref) || !code || isProvisional(code) || held.has(code))) return { ok: false, problem: "twice" };
  let refused: CommitProblem | null = "gone";
  await updateSchemeWith(schemeId, (cur) => {
    if ((cur.coding ?? []).some((r) => r.id === record.id || Object.keys(r.codes).some((k) => Object.hasOwn(record.codes, k)))) { refused = "twice"; return {}; }
    refused = null;
    return { ...recodeScheme(cur, record.codes), ...extra(cur), coding: [...(cur.coding ?? []), record] };
  });
  if (refused) return { ok: false, problem: refused };
  await recodeParticipations(schemeId, record.codes, actor);
  return { ok: true };
}

/** DEV ONLY (memory, the dev routes): code these participations — or every one of the
 *  scheme still under a provisional reference — at once, on record as a dev coding. The
 *  coding act itself is checked by verify-coding. Never on a database. */
export async function devCodeNow(schemeId: string, ids?: readonly string[]): Promise<number> {
  if (getDb()) throw new Error("devCodeNow: memory only");
  const sch = await getScheme(schemeId);
  if (!sch) return 0;
  const parts = await listParticipants(schemeId);
  const todo = parts.filter((p) => isProvisional(p.code) && (!ids || ids.includes(p.id)));
  if (!todo.length) return 0;
  const codes = drawCodes(schemePrefix(sch.number) || "99", parts.map((p) => p.code), todo.length, uniformBelow);
  if (!codes) return 0;
  const now = new Date().toISOString();
  const record: CodingRecord = { id: randomUUID(), at: now, by: "build", day: now.slice(0, 10), dev: true,
    codes: Object.fromEntries(todo.map((p, i) => [p.code, codes[i]])), ids: Object.fromEntries(todo.map((p) => [p.code, p.id])) };
  const r = await commitCoding(schemeId, record, () => ({}), "build");
  return r.ok ? todo.length : 0;
}
