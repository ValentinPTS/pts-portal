"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBatchAction, drawBatchAction, addHomogeneityAction, setBatchRecordAction, updateBatchAction } from "@/lib/actions";

// The forms of «Обекти и партиди» (plan part 3.5): a new batch; for a batch, the random
// draw of its objects' roles (once), the homogeneity values pasted in the contract's
// columns, and the link to the homogeneity and stability record. onSubmit — a
// refusal keeps what was typed; the server re-checks every rule.

export default function BatchForms({
  schemeId, lang, mode, batchId, drawn = false, objects = 0, canEdit, canValues, characteristics, record = "", fields,
}: {
  /** the batch's fields, for its correction */
  fields?: { label: string; material: string; preparedOn: string; storage: string; prefix: string; count: number };
  schemeId: string;
  lang: "bg" | "en";
  mode: "new" | "batch";
  batchId?: string;
  drawn?: boolean;
  objects?: number;
  canEdit: boolean;
  canValues: boolean;
  characteristics: string[];
  record?: string;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" } as const;
  const run = (fn: () => Promise<{ ok: true } | { ok: true; id: string } | { ok: true; added: number; same: number } | { error: string }>, done?: string | ((r: never) => string), after?: () => void) =>
    start(async () => {
      setError(null); setNote(null);
      const r = await fn();
      if ("error" in r) { setError(r.error); return; }
      if (done) setNote(typeof done === "function" ? done(r as never) : done);
      after?.();
      router.refresh();
    });
  const errorBox = error && <div role="alert" data-batch-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>{error}</div>;

  if (mode === "new") {
    return (
      <form data-batch-new className="card p-4 mt-4" style={{ display: "grid", gap: 10 }}
        onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => createBatchAction(schemeId, {
          label: fd.get("label"), material: fd.get("material"), preparedOn: fd.get("preparedOn"), storage: fd.get("storage"), count: fd.get("count"), prefix: fd.get("prefix"), hsRecord: fd.get("hsRecord"),
        })); }}>
        <div className="font-bold" style={{ color: "var(--green-dark)" }}>{L("Нова партида", "New batch")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Идентификация на партидата *", "Batch identification *")}</span><input name="label" required maxLength={40} style={field} /></label>
          <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Дата на подготовка и опаковане *", "Date prepared and packed *")}</span><input type="date" name="preparedOn" required style={field} /></label>
          <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Брой приготвени обекти *", "Objects prepared *")}</span><input type="number" name="count" min={1} max={999} required style={field} /></label>
          <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Начало на кода на обекта", "Object code prefix")}</span><input name="prefix" maxLength={20} placeholder="12603" style={field} /></label>
        </div>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Материал и произход *", "Material and origin *")}</span><input name="material" required maxLength={500} style={field} /></label>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Условия на съхранение", "Storage conditions")}</span><input name="storage" maxLength={500} style={field} /></label>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Връзка към записа от оценяването на хомогенността и стабилността", "Link to the record of the homogeneity and stability assessment")}</span><input name="hsRecord" maxLength={500} style={field} /></label>
        <p className="text-xs" style={{ color: "var(--muted)", margin: 0 }}>{L("Кодовете на обектите са началото и поредният номер: с начало «12603» и 40 обекта — 1260301 … 1260340.", "The objects' codes are the prefix and the number: with the prefix «12603» and 40 objects — 1260301 … 1260340.")}</p>
        {errorBox}
        <div><button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{L("Запиши партидата", "Record the batch")}</button></div>
      </form>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      {canEdit && !drawn && (
        <form data-batch-draw style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (!window.confirm(L("Ролите на обектите се теглят на случаен принцип — веднъж. Продължаваме?", "The objects' roles are drawn at random — once. Go ahead?"))) return;
            run(() => drawBatchAction(schemeId, batchId!, { homogeneity: fd.get("homogeneity"), stability: fd.get("stability"), participant: fd.get("participant"), reserve: fd.get("reserve") }));
          }}>
          <span className="text-sm font-bold" style={{ width: "100%" }}>{L(`Изтегли ролите на ${objects} обекта`, `Draw the roles of ${objects} objects`)}</span>
          {([["homogeneity", L("за хомогенност", "homogeneity")], ["stability", L("за стабилност", "stability")], ["participant", L("за участници", "participants")], ["reserve", L("резерва", "reserve")]] as const).map(([k, label]) => (
            <label key={k} style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span><input type="number" name={k} min={0} max={999} defaultValue={0} style={{ ...field, width: 90 }} /></label>
          ))}
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{L("Изтегли", "Draw")}</button>
        </form>
      )}
      {canValues && drawn && (
        <form data-batch-values style={{ display: "grid", gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            // the box is cleared once they are in — a second press adds nothing twice
            run(() => addHomogeneityAction(schemeId, batchId!, String(fd.get("rows") ?? "")),
              ((r: { added: number; same: number }) => L(`Добавени: ${r.added}${r.same ? `; вече ги имаше: ${r.same}` : ""}.`, `Added: ${r.added}${r.same ? `; already there: ${r.same}` : ""}.`)) as never,
              () => form.reset());
          }}>
          <span className="text-sm font-bold">{L("Добави стойности за хомогенност и стабилност", "Add homogeneity and stability values")}</span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {L("Един ред на стойност: серия; код на обекта; № на характеристиката; повторение; стойност (табулация, «;» или «,» между тях). Например: H1;1260302;1;1;12,4", "One row per value: series; object code; characteristic no.; replicate; value (a tab, «;» or «,» between them). E.g.: H1;1260302;1;1;12.4")}
            {characteristics.length > 0 && <> {L("Характеристики", "Characteristics")}: {characteristics.join(" · ")}</>}
          </span>
          <textarea name="rows" rows={4} style={{ ...field, fontFamily: "var(--font-mono, monospace)" }} />
          <div><button type="submit" className="btn btn-sm" disabled={pending}>{L("Добави", "Add")}</button></div>
        </form>
      )}
      {canEdit && fields && (
        <details data-batch-edit>
          <summary className="text-sm" style={{ cursor: "pointer", fontWeight: 700 }}>{L("Поправи партидата", "Correct the batch")}</summary>
          <form style={{ display: "grid", gap: 8, marginTop: 8 }}
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => updateBatchAction(schemeId, batchId!, {
              label: fd.get("label"), material: fd.get("material"), preparedOn: fd.get("preparedOn"), storage: fd.get("storage"),
              prefix: drawn ? fields.prefix : fd.get("prefix"), count: drawn ? String(fields.count) : fd.get("count"),
            }), L("Поправено.", "Corrected.")); }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Идентификация", "Identification")}</span><input name="label" defaultValue={fields.label} maxLength={40} style={field} /></label>
              <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Дата на подготовка", "Date prepared")}</span><input type="date" name="preparedOn" defaultValue={fields.preparedOn} style={field} /></label>
              <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Брой обекти", "Objects")}</span><input type="number" name="count" min={1} max={999} defaultValue={fields.count} disabled={drawn} title={drawn ? L("Обектите са изтеглени", "The objects are drawn") : undefined} style={field} /></label>
              <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Начало на кода", "Code prefix")}</span><input name="prefix" defaultValue={fields.prefix} maxLength={20} disabled={drawn} style={field} /></label>
            </div>
            <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Материал и произход", "Material and origin")}</span><input name="material" defaultValue={fields.material} maxLength={500} style={field} /></label>
            <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Условия на съхранение", "Storage conditions")}</span><input name="storage" defaultValue={fields.storage} maxLength={500} style={field} /></label>
            <div><button type="submit" className="btn btn-sm" disabled={pending}>{L("Запази поправката", "Save the correction")}</button></div>
          </form>
        </details>
      )}
      {canEdit && (
        <form data-batch-record-form style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
          onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => setBatchRecordAction(schemeId, batchId!, String(fd.get("record") ?? "")), L("Записано.", "Saved.")); }}>
          <label style={{ display: "grid", gap: 3, flex: 1, minWidth: 240 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Запис от оценяването на хомогенността и стабилността", "Record of the homogeneity and stability assessment")}</span>
            <input name="record" defaultValue={record} maxLength={500} style={field} /></label>
          <button type="submit" className="btn btn-sm" disabled={pending}>{L("Запази", "Save")}</button>
        </form>
      )}
      {errorBox}
      {note && <div role="status" style={{ color: "var(--green-dark)", fontSize: 13, fontWeight: 700 }}>✓ {note}</div>}
    </div>
  );
}
