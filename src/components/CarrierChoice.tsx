"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chooseCarrierAction } from "@/lib/actions";

// The laboratory picks its carrier from PTS's offers (plan part 9.5; Реш. 128) — once; a change after
// it through PTS.
type Offer = { id: string; carrier: string; cents: number; days?: number; note?: string };
export default function CarrierChoice({ lang, participantId, offers }: { lang: "bg" | "en"; participantId: string; offers: Offer[] }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", lang === "bg" ? "," : ".")} €`;
  return (
    <div data-carrier-choice={participantId} style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {offers.map((o) => (
        <div key={o.id} data-carrier-option={o.id} className="flex gap-3 items-center" style={{ flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
          <div style={{ flex: "1 1 220px" }}><b>{o.carrier}</b> — {eur(o.cents)}{o.days ? L(` · ${o.days} дни`, ` · ${o.days} days`) : ""}{o.note ? <div className="text-xs" style={{ color: "var(--muted)" }}>{o.note}</div> : null}</div>
          <button type="button" className="btn btn-sm btn-primary" data-carrier-pick={o.id} disabled={pending}
            onClick={() => { if (window.confirm(L(`Да се избере ли ${o.carrier} за ${eur(o.cents)}? Изборът е еднократен — промяна след него чрез PTS.`, `Choose ${o.carrier} for ${eur(o.cents)}? The choice is once — a change after it through PTS.`))) start(async () => { setError(null); const r = await chooseCarrierAction(participantId, o.id); if ("error" in r) setError(r.error); else router.refresh(); }); }}>{L("Избери", "Choose")}</button>
        </div>
      ))}
      {error && <div role="alert" data-carrier-error style={{ color: "#8f2f2f", fontSize: 13 }}>{error}</div>}
    </div>
  );
}
