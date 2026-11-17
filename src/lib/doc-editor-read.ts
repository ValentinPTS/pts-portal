// The document as the editor's page gives it to the editor, read again (round 9, the editor's one save controller —
// T3 F1/F2): an editor opened again in the same tab (Back and Forward bring the page back from Next's cache with the
// props of its first opening; a reload drawn while a save of this tab was on its way) asks for the stored copy before
// it takes a keystroke — lib/actions readDocForEditorAction.
//
// The SAME gates and the SAME body as app/schemes/[id]/build/[doc]/page.tsx, line for line (the page keeps its own
// lines — the gate scripts read them there): a wiring check in scripts/security-sweep.test.ts («round 9, the editor's
// saves») holds the two to each other, gate by gate.
import { requireCap, mayNow, requireDocView } from "./access";
import { requireStaff } from "./roles";
import { getScheme } from "./store";
import { getDoc, isFormDoc, isListDoc, isRestrictedDoc, savedDocBody, pairsNamesWithCodes, showsIdentities } from "./documents";
import { listParticipants, withoutIdentity } from "./participants";
import { inRound } from "./application-model";
import { createHash } from "crypto";
import { namesFor, actorKeyNow } from "./identities";
import { defaultDocHtml } from "./doc-html";
import { retagFormBody } from "./form-hydrate";
import { logActivity } from "./activity";
import { refreshInstruction, refreshTeam } from "./docs/instruction-common";
import { refreshOrderHead } from "./docs/order";
import { getProviderHead } from "./custom-skins";

export type EditorDocNow = { bg: string; en: string; rev: number; sid: string | null };
export type EditorDocVersion = { rev: number; sid: string | null };

/** Who saves, as a one-way tag (round 9 attack, S2): a save's id is stored with it and named back to that person only.
 *  The peek handed every reader the last save's id; another person who sent it with a save of their own was taken, by
 *  the first person's editor, for its own echo — and their words saved over without a word. The login (in development
 *  without one, the persona — identities.actorKeyNow); no e-mail goes into the scheme's documents, a tag does. */
export async function saverTagNow(): Promise<string> {
  const who = await actorKeyNow();
  return who === "unknown" ? "" : createHash("sha256").update(`pts-doc-saver:${who}`).digest("base64url").slice(0, 22);
}
/** The stored save's id — for who made it; to anyone else, none (their editor then says a newer copy was saved). */
export const sidFor = (entry: { sid?: string; sidBy?: string } | undefined, tag: string): string | null =>
  entry?.sid && tag && entry.sidBy === tag ? entry.sid : null;

// the page's gates, in its order — for the body and for the version alike
async function editorGate(id: string, doc: string): Promise<void> {
  await requireStaff(); // read gate: manager/staff/auditor only
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  if (isRestrictedDoc(doc)) await requireCap("names.view", id); // F 7.2.1-6 = names ↔ codes (part 0.2)
  await requireDocView(doc, id); // the Order: the staff it assigns roles to (Реш. 149, 2.6)
}

/** The stored version and the save that stored it — no body: no names shown, nothing to journal. What an opening waiting
 *  for this tab's last save peeks at until it is that one; the body is read once after (review 3: each poll of a list or
 *  a certificate wrote a «names.viewed» line). null: no such scheme or document. */
export async function editorDocVersion(id: string, doc: string): Promise<EditorDocVersion | null> {
  await editorGate(id, doc);
  const s = await getScheme(id);
  if (!s || !getDoc(doc)) return null;
  return { rev: s.docs?.[doc]?.rev ?? 0, sid: sidFor(s.docs?.[doc], await saverTagNow()) };
}

/** null: no such scheme or document (the page's «not found») */
export async function editorDocNow(id: string, doc: string): Promise<EditorDocNow | null> {
  await editorGate(id, doc);
  const s = await getScheme(id);
  const def = getDoc(doc);
  if (!s || !def) return null;
  // the round's documents list the participations in it — never one refused, annulled or withdrawn (5.1)
  const coded = (await listParticipants(id)).filter(inRound);
  // Name guard (§4.2) — as the page
  const reveal = await mayNow("names.view", id);
  const participants = reveal && showsIdentities(doc) ? await namesFor(id, coded) : coded.map(withoutIdentity);
  const isList = isListDoc(doc);
  if (reveal && pairsNamesWithCodes(doc) && participants.length) await logActivity("names.viewed", { schemeId: id, subject: `doc:${doc}`, summary: `Laboratory names shown with their codes — the document ${doc}` });
  const saved0 = (isList || showsIdentities(doc)) && !reveal ? { bg: "", en: "" } : (savedDocBody(s, doc) ?? { bg: "", en: "" });
  const dft = defaultDocHtml(s, doc, participants, reveal);
  const saved1 = isFormDoc(doc)
    ? { bg: retagFormBody(saved0.bg ?? "", dft.bg), en: retagFormBody(saved0.en ?? "", dft.en) }
    : saved0;
  // …and the Order with the head of PTS as set now (review 5: the editor opened it with the old name, or none)
  const head = await getProviderHead();
  const refreshed = (body: string, l: "bg" | "en") => (body ? refreshOrderHead(refreshTeam(doc === "instruction" ? refreshInstruction(body, s, l) : body, s, l), doc, head, l) : body);
  return { bg: refreshed(saved1.bg ?? "", "bg"), en: refreshed(saved1.en ?? "", "en"), rev: s.docs?.[doc]?.rev ?? 0, sid: sidFor(s.docs?.[doc], await saverTagNow()) };
}
