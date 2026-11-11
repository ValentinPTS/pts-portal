// Anonymous feedback — one record per scheme: the counters, the words, «given» (plan part 10.3; migration
// 0053). In memory locally. Not a server action module: nothing here is callable from a browser. NOTHING
// here writes a time, an account or the journal (Реш. 92, 122; К21) — and every give rewrites the scheme's
// whole record, the words reshuffled and «given» sorted, so nothing in it belongs to one give (10.3 review).
import { getDb, noMemoryFallback } from "./supabase";
import { sortedWords } from "./feedback-model";

type Words = { q: "q3" | "q4" | "q5"; text: string };
type Rec = { counts: Record<string, number>; words: Words[]; given: string[] };
const g = globalThis as unknown as { __ptsSchemeFeedback?: Map<string, Rec> };
const mem = g.__ptsSchemeFeedback ?? (g.__ptsSchemeFeedback = new Map());

const shuffled = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** One participation's feedback, whole: «given», the counters, the words — "already" when it gave. */
export async function giveFeedback(schemeId: string, participantId: string, keys: string[], words: Words[]): Promise<"given" | "already" | "failed"> {
  const db = getDb();
  if (!db) {
    const r: Rec = mem.get(schemeId) ?? { counts: {}, words: [], given: [] };
    if (r.given.includes(participantId)) return "already";
    const counts = { ...r.counts };
    for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
    mem.set(schemeId, { counts, words: shuffled([...r.words, ...words.map((w) => ({ ...w }))]), given: [...r.given, participantId].sort() });
    return "given";
  }
  try {
    const { data, error } = await db.rpc("feedback_give", { p_scheme: schemeId, p_participant: participantId, p_keys: keys, p_words: words });
    if (error) throw error;
    return data === true ? "given" : "already";
  } catch (e) {
    console.error("[feedback] give:", (e as Error)?.message ?? e);
    return "failed";
  }
}

/** Has this participation given its feedback? (no time — only that; asked in a call's body, 10.3 review) */
export async function feedbackGiven(schemeId: string, participantId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return !!mem.get(schemeId)?.given.includes(participantId);
  try {
    const { data, error } = await db.rpc("feedback_is_given", { p_scheme: schemeId, p_participant: participantId });
    if (error) throw error;
    return data === true;
  } catch (e) {
    noMemoryFallback("feedback", e);
    return !!mem.get(schemeId)?.given.includes(participantId);
  }
}

/** A scheme's feedback: the counters and the words (sorted — never the order they came in); never who gave. */
export async function feedbackOf(schemeId: string): Promise<{ counts: Record<string, number>; words: Words[] }> {
  const fromMem = () => { const r = mem.get(schemeId); return { counts: { ...(r?.counts ?? {}) }, words: sortedWords<Words>(r?.words ?? []) }; };
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.from("scheme_feedback").select("counts, words").eq("scheme_id", schemeId).maybeSingle();
    if (error) throw error;
    const row = data as { counts: Record<string, number>; words: Words[] } | null;
    return { counts: row?.counts ?? {}, words: sortedWords<Words>(row?.words ?? []) };
  } catch (e) {
    noMemoryFallback("feedback", e);
    return fromMem();
  }
}
