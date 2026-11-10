"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { labApplyAction } from "@/lib/actions";

// The laboratory's application form (plan part 9.2). The accreditation warning shows for the chosen
// laboratory when the scheme asks for accreditation and it has none (Реш. 108) — never a block.
type Lab = { id: string; name: string; applied: "already" | "refused" | null; warning: boolean };
// (The scheme's commercial fields are never read by a laboratory's page (3.7): the address where an own
// courier collects is in the scheme's invitation.)
// `signature` — the characteristics as the form shows them, posted back: changed meanwhile, refused (9.2 review)
export default function LabApplyForm({ lang, schemeId, labs, characteristics, signature }: { lang: "bg" | "en"; schemeId: string; labs: Lab[]; characteristics: { i: number; label: string }[]; signature: string }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const free = labs.filter((l) => !l.applied);
  const [labId, setLabId] = useState(free[0]?.id ?? "");
  const [delivery, setDelivery] = useState<"pts" | "own">("pts");
  const lab = labs.find((l) => l.id === labId);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 14, background: "#fff", fontFamily: "inherit" } as const;
  if (!labs.length) return <div role="note" className="card" data-apply-no-lab style={{ padding: 14 }}>{L("Организацията няма активна лаборатория — пишете на PTS.", "The organisation has no active laboratory — write to PTS.")}</div>;
  return (
    <form className="card" data-apply-form={schemeId} style={{ padding: 16, display: "grid", gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("schemeId", schemeId);
        fd.set("paramSig", signature);
        start(async () => {
          setError(null);
          const r = await labApplyAction(fd);
          if ("error" in r) { setError(r.error); return; }
          router.push(`/lab/apply?done=${encodeURIComponent(schemeId)}${r.code ? `&code=${encodeURIComponent(r.code)}` : ""}${r.warning ? "&warn=1" : ""}`);
        });
      }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="text-sm" style={{ color: "var(--muted)" }}>{L("Лаборатория", "Laboratory")}</span>
        <select name="laboratoryId" value={labId} onChange={(e) => setLabId(e.target.value)} style={field} data-apply-lab>
          {labs.map((l) => <option key={l.id} value={l.id} disabled={!!l.applied}>{l.name}{l.applied === "already" ? L(" — вече е заявила", " — has applied already") : l.applied === "refused" ? L(" — заявката ѝ е отказана; пишете на PTS", " — its application was refused; write to PTS") : ""}</option>)}
        </select>
      </label>
      {lab?.warning && (
        <div role="note" data-apply-warning style={{ background: "#fff8e6", border: "1px solid #f0dcae", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          {L("Схемата изисква акредитация, а за тази лаборатория няма въведен номер на акредитация. Можете да заявите участие — акредитацията не е условие (Реш. 108); ако имате акредитация, допълнете я в «Данните на организацията».",
             "The scheme asks for accreditation and this laboratory has no accreditation number. You may apply — accreditation is no condition (Decision 108); if you have one, add it under «The organisation's data».")}
        </div>
      )}
      {characteristics.length ? (
        <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", display: "grid", gap: 6 }}>
          <legend className="text-sm" style={{ color: "var(--muted)" }}>{L("Брой участия по характеристика (0–10)", "Participations per characteristic (0–10)")}</legend>
          {characteristics.map((c) => (
            <label key={c.i} className="text-sm" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input name={`sel_${c.i}`} type="number" min={0} max={10} defaultValue={1} style={{ ...field, width: 64 }} data-apply-sel={c.i} /> {c.label}
            </label>
          ))}
        </fieldset>
      ) : (
        <label style={{ display: "grid", gap: 4 }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>{L("Брой участия (уреди за калибриране), 1–10", "Number of participations (devices to calibrate), 1–10")}</span>
          <input name="participations" type="number" min={1} max={10} defaultValue={1} style={{ ...field, width: 80 }} data-apply-participations />
        </label>
      )}
      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", display: "grid", gap: 6 }}>
        <legend className="text-sm" style={{ color: "var(--muted)" }}>{L("Доставка", "Delivery")}</legend>
        <label className="text-sm" style={{ display: "flex", gap: 8 }}><input type="radio" name="delivery" value="pts" checked={delivery === "pts"} onChange={() => setDelivery("pts")} /> {L("PTS изпраща обектите", "PTS sends the objects")}</label>
        <label className="text-sm" style={{ display: "flex", gap: 8 }}><input type="radio" name="delivery" value="own" checked={delivery === "own"} onChange={() => setDelivery("own")} data-apply-own /> {L("Собствен куриер — плаща се само участието", "Our own courier — only the participation is paid")}</label>
        {delivery === "own" && <div className="text-xs" style={{ color: "var(--muted)" }}>{L("Адресът, от който куриерът ви взима обектите, е в поканата на схемата.", "The address where your courier collects the objects is in the scheme's invitation.")}</div>}
      </fieldset>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending || !labId || !!lab?.applied} data-apply-submit>{L("Подай заявката", "Submit the application")}</button>
      </div>
      {error && <div role="alert" data-apply-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>{error}</div>}
    </form>
  );
}
