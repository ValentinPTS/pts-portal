"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapAnywhere } from "./access";
import { getRoleContext } from "./roles";
import { logActivity } from "./activity";
import { sofiaDay } from "./chain";
import { readCriteriaForm, sniffMime } from "./validation-model";
import { recordCriteria, voidCriteria } from "./validation-criteria";

// «Валидиране» (plan part 8.1; Реш. 134): record a signed edition of the acceptance criteria, or
// void one recorded by mistake. The head and the quality manager (validation.record) — never the
// software administrator, whose work is what is validated (П 7.4.1 т. 3). The journal names the
// edition, the day signed and the levels — never the file.

const back = (answer: string) => redirect(`/validation?v=${encodeURIComponent(answer)}#criteria`);

export async function recordCriteriaAction(formData: FormData): Promise<void> {
  await requireCapAnywhere("validation.record");
  const by = (await getRoleContext()).email ?? "build";
  const read = readCriteriaForm({ edition: formData.get("edition"), signedOn: formData.get("signedOn"), signedBy: formData.get("signedBy"), levels: formData.getAll("level"), note: formData.get("note") }, sofiaDay(new Date().toISOString()));
  if (!read.ok) back(read.problem);
  const v = read as Extract<typeof read, { ok: true }>;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back("file");
  const f = file as File;
  const bytes = new Uint8Array(await f.arrayBuffer());
  // the type the file IS, by its bytes — not the one the browser named (8.1 review)
  const r = await recordCriteria({ edition: v.edition, signedOn: v.signedOn, signedBy: v.signedBy, levels: v.levels, note: v.note, file: { bytes, mime: sniffMime(bytes) ?? f.type, name: f.name }, by });
  if (!r.ok) back(r.error);
  const e = (r as Extract<typeof r, { ok: true }>).entry;
  // a journal line that cannot be written: the edition stays (it is PTS's signed paper, on
  // record), and the page says the line is missing — never a record silently unjournalled
  const logged = await logActivity("validation.criteria_recorded", {
    subject: `validation_criteria:${e.id}`,
    after: { edition: e.edition, signedOn: e.signedOn, levels: e.levels, sha256: e.fileSha256, size: e.fileSize, mime: e.fileMime },
    summary: `Acceptance criteria edition ${e.edition}, signed ${e.signedOn}, levels ${e.levels.join(", ")} — recorded with the signed document`,
  });
  revalidatePath("/validation");
  back(logged ? "recorded" : "recorded-unlogged");
}

export async function voidCriteriaAction(formData: FormData): Promise<void> {
  await requireCapAnywhere("validation.record");
  const by = (await getRoleContext()).email ?? "build";
  const id = String(formData.get("id") ?? "");
  const r = await voidCriteria({ id, reason: String(formData.get("reason") ?? ""), by });
  if (!r.ok) back(r.error);
  const e = (r as Extract<typeof r, { ok: true }>).entry;
  const logged = await logActivity("validation.criteria_voided", {
    subject: `validation_criteria:${e.id}`,
    before: { edition: e.edition, signedOn: e.signedOn, levels: e.levels },
    after: { voided: true, reason: e.voided?.reason },
    summary: `Acceptance criteria edition ${e.edition} (signed ${e.signedOn}) voided: ${e.voided?.reason}`,
  });
  revalidatePath("/validation");
  back(logged ? "voided" : "voided-unlogged");
}
