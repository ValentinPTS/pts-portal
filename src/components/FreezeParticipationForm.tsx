"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { freezeOptionsAction, freezeParticipationAction } from "@/lib/actions";

// Link a participation to its laboratory and keep the frozen copy of the entity's and
// the laboratory's data (plan part 4.5, J12) — or correct a wrong link: a new version,
// with its reason, the earlier one kept. The choices are opened only when the person
// opens this (each opening on record); what will be copied is shown, and confirmed,
// before it is taken (4.5 review).

type Lab = { id: string; entityId: string; label: string; entityName: string; eik: string; deliveryAddress: string };
type User = { id: string; entityId: string; label: string };

export default function FreezeParticipationForm({ lang, schemeId, participantId, correcting }: { lang: "bg" | "en"; schemeId: string; participantId: string; correcting: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opts, setOpts] = useState<{ labs: Lab[]; users: User[] } | null>(null);
  const [labId, setLabId] = useState("");
  const chosen = opts?.labs.find((l) => l.id === labId);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" } as const;
  if (!opts) {
    return (
      <span data-freeze-open={participantId}>
        <button type="button" className="btn btn-sm" disabled={pending}
          onClick={() => start(async () => { setError(null); const r = await freezeOptionsAction(schemeId); if ("error" in r) setError(r.error); else setOpts(r); })}>
          {correcting ? L("Поправи връзката", "Correct the link") : L("Свържи с лабораторията", "Link to the laboratory")}
        </button>
        {error && <span role="alert" className="text-xs" style={{ color: "#8f2f2f", marginLeft: 6 }}>{error}</span>}
      </span>
    );
  }
  if (!opts.labs.length) return <p className="text-xs" style={{ color: "var(--muted)" }}>{L("Няма активна лаборатория в «Организации» — въведете я там.", "No active laboratory in «Organisations» — enter it there.")}</p>;
  return (
    <form data-freeze-form={participantId} style={{ display: "grid", gap: 6, maxWidth: 720 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const r = await freezeParticipationAction({ schemeId, participantId, laboratoryId: String(fd.get("laboratoryId") ?? ""), contactUserId: String(fd.get("contactUserId") ?? ""), reason: String(fd.get("reason") ?? "") });
          if ("error" in r) { setError(r.error); return; }
          setOpts(null);
          router.refresh();
        });
      }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Лаборатория (юридическо лице)", "Laboratory (legal entity)")}</span>
          <select name="laboratoryId" required value={labId} onChange={(e) => setLabId(e.target.value)} style={field}>
            <option value="">—</option>
            {opts.labs.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select></label>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Лице за контакт (по желание)", "Contact (optional)")}</span>
          <select name="contactUserId" defaultValue="" disabled={!chosen} style={field}>
            <option value="">—</option>
            {opts.users.filter((u) => u.entityId === chosen?.entityId).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select></label>
      </div>
      {chosen && (
        <div data-freeze-preview className="text-xs" style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px" }}>
          {L("Ще се запази копие към днешна дата:", "A copy as of today will be kept:")} <b>{chosen.entityName}</b> · {L("ЕИК", "Reg. no.")} {chosen.eik} — <b>{chosen.label.split(" — ").slice(1).join(" — ")}</b> · {chosen.deliveryAddress}
        </div>
      )}
      {correcting && (
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Причина за поправката *", "Reason for the correction *")}</span>
          <input name="reason" required maxLength={300} style={field} /></label>
      )}
      <label className="text-xs" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" required data-freeze-confirm /> {L("Проверих — това е лабораторията от заявката.", "Checked — this is the laboratory of the application.")}
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending || !labId}>{correcting ? L("Запази поправката", "Keep the correction") : L("Свържи и запази копие", "Link and keep a copy")}</button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => setOpts(null)}>{L("Откажи", "Cancel")}</button>
        {error && <span role="alert" data-freeze-error className="text-xs" style={{ color: "#8f2f2f" }}>{error}</span>}
      </div>
    </form>
  );
}
