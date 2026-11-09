"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEntityAction, checkEntityViesAction, setEntityManualCheckAction, setEntityStateAction, attachEntityProofAction } from "@/lib/actions";
import type { LegalEntity, EntityState } from "@/lib/entities-model";

// The legal entity's forms (plan part 4.1): enter or correct one; check it — VIES, PTS's
// own tick; set its state. onSubmit — a refusal keeps what was typed; the server
// checks every rule again.

type View = Pick<LegalEntity, "id" | "name" | "country" | "eik" | "vat" | "correspondenceAddress" | "officialEmail" | "mol" | "language" | "state"> & { viesStatus?: string; manual: boolean; registry: boolean; hasProof: boolean };

export default function EntityForms({ lang, entity }: { lang: "bg" | "en"; entity?: View }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" } as const;
  const run = (fn: () => Promise<{ ok: true } | { ok: true; id: string } | { ok: true; status: string } | { error: string }>, done?: string, after?: () => void) =>
    start(async () => {
      setError(null); setNote(null);
      const r = await fn();
      if ("error" in r) { setError(r.error); return; }
      if (done) setNote(done);
      after?.();
      router.refresh();
    });
  const lbl = (bg: string, en: string, el: React.ReactNode, wide = false) => (
    <label style={{ display: "grid", gap: 3, ...(wide ? { gridColumn: "1 / -1" } : {}) }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L(bg, en)}</span>{el}</label>
  );
  const form = (
    <form data-entity-form={entity ? entity.id : "new"} style={{ display: "grid", gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        run(() => saveEntityAction({ id: entity?.id, name: fd.get("name"), country: fd.get("country"), eik: fd.get("eik"), vat: fd.get("vat"), correspondenceAddress: fd.get("address"), officialEmail: fd.get("officialEmail"), mol: fd.get("mol"), language: fd.get("language"),
          // what the form showed: only what is changed is written (4.4 review)
          shown: entity ? { name: entity.name, country: entity.country, eik: entity.eik, vat: entity.vat, correspondenceAddress: entity.correspondenceAddress, officialEmail: entity.officialEmail, mol: entity.mol, language: entity.language } : undefined }),
          entity ? L("Записано.", "Saved.") : L("Въведено.", "Entered."), () => { if (!entity) formEl.reset(); });
      }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {lbl("Наименование *", "Name *", <input name="name" required maxLength={200} defaultValue={entity?.name} style={field} />, true)}
        {lbl("Държава (код)", "Country (code)", <input name="country" maxLength={2} defaultValue={entity?.country ?? "BG"} style={{ ...field, textTransform: "uppercase" }} />)}
        {lbl("ЕИК / рег. номер *", "ЕИК / reg. no. *", <input name="eik" required maxLength={20} defaultValue={entity?.eik} style={field} />)}
        {lbl("Номер по ДДС", "VAT number", <input name="vat" maxLength={20} defaultValue={entity?.vat} style={field} />)}
        {lbl("МОЛ", "МОЛ (responsible person)", <input name="mol" maxLength={120} defaultValue={entity?.mol} style={field} />)}
        {lbl("Език", "Language", <select name="language" defaultValue={entity?.language ?? "bg"} style={field}><option value="bg">{L("български", "Bulgarian")}</option><option value="en">{L("английски", "English")}</option></select>)}
        {lbl("Адрес за кореспонденция *", "Address for correspondence *", <input name="address" required maxLength={300} defaultValue={entity?.correspondenceAddress} style={field} />, true)}
        {lbl("Официален e-mail (уведомленията до организацията — К23)", "Official e-mail (the notices to the organisation — К23)", <input name="officialEmail" type="email" maxLength={254} defaultValue={entity?.officialEmail} style={field} />, true)}
      </div>
      <div><button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{entity ? L("Запази", "Save") : L("Въведи юридическото лице", "Enter the legal entity")}</button></div>
    </form>
  );
  const errorBox = error && <div role="alert" data-entity-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>{error}</div>;
  const noteBox = note && <div role="status" style={{ color: "var(--green-dark)", fontSize: 13, fontWeight: 700 }}>✓ {note}</div>;

  if (!entity) return <div className="card p-4 mt-4" data-entity-new><div className="font-bold mb-2" style={{ color: "var(--green-dark)" }}>{L("Ново юридическо лице (от заявка в PDF)", "New legal entity (from a PDF application)")}</div>{form}{errorBox}{noteBox}</div>;

  const toState = (to: EntityState, ask: string) => { if (window.confirm(ask)) run(() => setEntityStateAction(entity.id, to), L("Записано.", "Saved.")); };
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-sm" disabled={pending || !entity.vat} data-vies onClick={() => run(() => checkEntityViesAction(entity.id), L("VIES провери номера.", "VIES checked the number."))}>{L("Провери в VIES", "Check in VIES")}</button>
        <label className="text-sm" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" data-manual-check checked={entity.manual} disabled={pending || (!entity.manual && !entity.registry)}
            onChange={(e) => { const on = e.target.checked; const n = on ? window.prompt(L("Бележка към проверката (по желание):", "A note to the check (optional):")) ?? "" : ""; run(() => setEntityManualCheckAction(entity.id, on, n)); }} />
          {L("Проверено от PTS", "Checked by PTS")}{!entity.registry && <span style={{ color: "var(--muted)" }}> — {L("първо VIES или документ", "first VIES or a document")}</span>}
        </label>
        {entity.state !== "active" && <button type="button" className="btn btn-sm" data-state-to="active" disabled={pending || !entity.manual} onClick={() => toState("active", L("Да стане ли юридическото лице активно?", "Make the legal entity active?"))}>{L("Активирай", "Activate")}</button>}
        {entity.state !== "inactive" && <button type="button" className="btn btn-sm" data-state-to="inactive" disabled={pending} onClick={() => toState("inactive", L("Да стане ли неактивно? Нищо не се изтрива.", "Make it inactive? Nothing is deleted."))}>{L("Направи неактивно", "Make inactive")}</button>}
      </div>
      <form data-entity-proof style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("entityId", entity.id); const formEl = e.currentTarget; run(() => attachEntityProofAction(fd), L("Документът е приложен.", "The document is attached."), () => formEl.reset()); }}>
        <span className="text-sm">{L("Документ, когато VIES не може да каже (извън ЕС):", "A document where VIES cannot say (outside the EU):")}</span>
        <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" className="text-sm" />
        <button type="submit" className="btn btn-sm" disabled={pending}>{entity.hasProof ? L("Замени документа", "Replace the document") : L("Приложи", "Attach")}</button>
        {entity.hasProof && <a href={`/organizations/proof/${entity.id}`} target="_blank" rel="noopener" className="text-sm" data-proof-link>{L("Виж приложения", "See the attached one")}</a>}
      </form>
      <details data-entity-edit><summary className="text-sm" style={{ cursor: "pointer", fontWeight: 700 }}>{L("Поправи данните", "Correct the data")}</summary><div className="mt-2">{form}</div></details>
      {errorBox}{noteBox}
    </div>
  );
}
