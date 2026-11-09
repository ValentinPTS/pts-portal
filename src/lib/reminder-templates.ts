import { getDb, noMemoryFallback } from "./supabase";

// The texts of the automatic reminders (plan part 1.8, Реш. 138; Zadanie §12 lets
// only reminders be automatic). PTS approves each on «Текстове на напомнянията».
// An APPROVED template's reminder goes out by itself, its approval on record; an
// unapproved one is raised held and waits for a person, like any other notice.
//
// A template is approved when approvedVersion === version. Saving a changed text
// raises the version, so it sends nothing by itself until approved again. Both the
// edit and the approval name the version the person saw — a text changed by
// someone else in between is never approved, or overwritten, unseen.
//
// §4.2: the placeholders are the scheme number and the date — never a laboratory
// name; there is no placeholder that could carry one.

export type ReminderKind = "results.due" | "receipt.due";
// «receipt.due» (part 5.6; the spec's notices: «Напомняне за протокол за получаване»)
export const REMINDER_KINDS: readonly ReminderKind[] = ["results.due", "receipt.due"];
export const PLACEHOLDERS = ["{scheme}", "{date}"] as const;
/** What each reminder is, as «Текстове на напомнянията» names it */
export const REMINDER_LABEL: Record<ReminderKind, { bg: string; en: string }> = {
  "results.due": { bg: "Ден преди срока за резултати", en: "The day before results are due" },
  "receipt.due": { bg: "Протокол за получаване — 3 работни дни след изпращането, ако още не е подаден", en: "Receipt protocol — 3 working days after dispatch, if not in yet" },
};

export interface ReminderTemplate {
  kind: ReminderKind;
  bg: string;
  en: string;
  version: number;
  updatedBy?: string;
  updatedAt?: string;
  approvedVersion?: number;
  approvedBy?: string;
  approvedAt?: string;
}

// the text the reminder had in code before 1.8 — the starting point, not approved
export const DEFAULT_TEMPLATES: Record<ReminderKind, { bg: string; en: string }> = {
  "results.due": {
    bg: "Напомняне: срокът за резултати по схема {scheme} е утре, {date}.",
    en: "Reminder: results for scheme {scheme} are due tomorrow, {date}.",
  },
  // {date}: the day the object was sent
  "receipt.due": {
    bg: "Напомняне: обектът по схема {scheme} е изпратен на {date}. Когато пристигне, попълнете протокола за получаване в портала.",
    en: "Reminder: the object of scheme {scheme} was sent on {date}. When it arrives, fill in the receipt protocol in the portal.",
  },
};

export const MAX_TEMPLATE_LENGTH = 600;

export const isTemplateApproved = (t: Pick<ReminderTemplate, "version" | "approvedVersion">): boolean =>
  typeof t.approvedVersion === "number" && t.approvedVersion === t.version;

/** What a released reminder records as its approval. */
export const templateApproval = (t: ReminderTemplate): string =>
  `template:${t.kind}@v${t.version} (approved by ${t.approvedBy ?? "?"})`;

/** Fill in the placeholders. Every occurrence; nothing else is touched. */
export function renderTemplate(t: Pick<ReminderTemplate, "bg" | "en">, vars: { scheme: string; date: string }): { bg: string; en: string } {
  const fill = (s: string) => s.split("{scheme}").join(vars.scheme).split("{date}").join(vars.date);
  return { bg: fill(t.bg), en: fill(t.en) };
}

/** Why a text cannot be saved, or null. Both languages, both placeholders, nothing unknown. */
export function templateProblem(bg: string, en: string): "empty" | "too-long" | "unknown-placeholder" | "missing-placeholder" | null {
  for (const s of [bg, en]) {
    if (!s.trim()) return "empty";
    if (s.length > MAX_TEMPLATE_LENGTH) return "too-long";
    const used = s.match(/\{[^{}]*\}/g) ?? [];
    if (used.some((p) => !(PLACEHOLDERS as readonly string[]).includes(p))) return "unknown-placeholder";
    if (PLACEHOLDERS.some((p) => !s.includes(p))) return "missing-placeholder";
  }
  return null;
}

const memStore = globalThis as unknown as { __ptsReminderTplMem?: Partial<Record<ReminderKind, ReminderTemplate>> };
const mem = memStore.__ptsReminderTplMem ?? (memStore.__ptsReminderTplMem = {});

const fresh = (kind: ReminderKind): ReminderTemplate => ({ kind, ...DEFAULT_TEMPLATES[kind], version: 1 });

type Row = {
  kind: string; bg: string; en: string; version: number; updated_by: string | null; updated_at: string | null;
  approved_version: number | null; approved_by: string | null; approved_at: string | null;
};
const fromRow = (r: Row): ReminderTemplate => ({
  kind: r.kind as ReminderKind, bg: r.bg, en: r.en, version: r.version,
  updatedBy: r.updated_by ?? undefined, updatedAt: r.updated_at ?? undefined,
  approvedVersion: r.approved_version ?? undefined, approvedBy: r.approved_by ?? undefined, approvedAt: r.approved_at ?? undefined,
});
const toRow = (t: ReminderTemplate): Row => ({
  kind: t.kind, bg: t.bg, en: t.en, version: t.version, updated_by: t.updatedBy ?? null, updated_at: t.updatedAt ?? null,
  approved_version: t.approvedVersion ?? null, approved_by: t.approvedBy ?? null, approved_at: t.approvedAt ?? null,
});

export async function getReminderTemplate(kind: ReminderKind): Promise<ReminderTemplate> {
  const db = getDb();
  if (!db) return mem[kind] ?? fresh(kind);
  try {
    const { data, error } = await db.from("reminder_templates").select("*").eq("kind", kind).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : fresh(kind);
  } catch (e) {
    noMemoryFallback("reminder-templates", e);
    return mem[kind] ?? fresh(kind);
  }
}

export async function listReminderTemplates(): Promise<ReminderTemplate[]> {
  return Promise.all(REMINDER_KINDS.map(getReminderTemplate));
}

// one write, only if the row is still at the version the person saw; `only` names
// the columns a save may touch (the words), so it never rewrites an approval
type Col = keyof Row;
const pick = (row: Row, only?: Col[]) => (only ? Object.fromEntries(only.map((k) => [k, row[k]])) : row);
async function writeIfAt(next: ReminderTemplate, seenVersion: number, only?: Col[]): Promise<boolean> {
  const db = getDb();
  if (!db) {
    const cur = mem[next.kind] ?? fresh(next.kind);
    if (cur.version !== seenVersion) return false;
    mem[next.kind] = only ? { ...cur, ...fromRow({ ...toRow(cur), ...pick(toRow(next), only) } as Row) } : next;
    return true;
  }
  const { data: cur, error: re } = await db.from("reminder_templates").select("version").eq("kind", next.kind).maybeSingle();
  if (re) throw re;
  if (!cur) {
    if (seenVersion !== 1) return false;
    const { error } = await db.from("reminder_templates").insert(toRow(next));
    if (error) { if ((error as { code?: string }).code === "23505") return false; throw error; }
    return true;
  }
  const { data, error } = await db.from("reminder_templates").update(pick(toRow(next), only)).eq("kind", next.kind).eq("version", seenVersion).select("kind");
  if (error) throw error;
  return (data ?? []).length === 1;
}

export type TemplateWrite = { ok: true; template: ReminderTemplate } | { ok: false; error: "changed" | NonNullable<ReturnType<typeof templateProblem>> | "unchanged" };

/** Save an edited text. A change raises the version — not approved until approved again. */
export async function saveReminderTemplate(kind: ReminderKind, bg: string, en: string, by: string, seenVersion: number): Promise<TemplateWrite> {
  const problem = templateProblem(bg, en);
  if (problem) return { ok: false, error: problem };
  const cur = await getReminderTemplate(kind);
  if (cur.version !== seenVersion) return { ok: false, error: "changed" };
  if (cur.bg === bg && cur.en === en) return { ok: false, error: "unchanged" };
  const next: ReminderTemplate = { ...cur, bg, en, version: cur.version + 1, updatedBy: by, updatedAt: new Date().toISOString() };
  return (await writeIfAt(next, seenVersion, ["bg", "en", "version", "updated_by", "updated_at"])) ? { ok: true, template: next } : { ok: false, error: "changed" };
}

/** Approve the version the person saw. */
export async function approveReminderTemplate(kind: ReminderKind, by: string, seenVersion: number): Promise<TemplateWrite> {
  const cur = await getReminderTemplate(kind);
  if (cur.version !== seenVersion) return { ok: false, error: "changed" };
  const problem = templateProblem(cur.bg, cur.en);
  if (problem) return { ok: false, error: problem };
  if (isTemplateApproved(cur)) return { ok: false, error: "unchanged" };
  const next: ReminderTemplate = { ...cur, approvedVersion: cur.version, approvedBy: by, approvedAt: new Date().toISOString() };
  return (await writeIfAt(next, seenVersion)) ? { ok: true, template: next } : { ok: false, error: "changed" };
}
