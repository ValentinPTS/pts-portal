"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { catalogueWishAction, cancelCatalogueWishAction } from "@/lib/actions";

// «Уведоми ме при следваща» (plan part 10.1; К25) — the organisation asks to be told when the next scheme of
// this one's subject starts, or cancels a standing wish BY ITS ID (10.1 review: never by a subject the scheme
// may no longer have). On the server: the user's own organisation, on record. The page refreshes after.
export default function CatalogueWishButton({ schemeId, wishId, lang, cancelOnly = false }: { schemeId?: string; wishId?: string; lang: "bg" | "en"; cancelOnly?: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [id, setId] = useState(wishId ?? "");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const press = () => start(async () => {
    if (id) {
      const r = await cancelCatalogueWishAction(id);
      if ("error" in r) { setErr(r.error); return; }
      setId("");
    } else if (schemeId) {
      const r = await catalogueWishAction(schemeId);
      if ("error" in r) { setErr(r.error); return; }
      setId(r.wishId);
    }
    setErr("");
    router.refresh();
  });
  if (cancelOnly && !id) return null;
  return (
    <span data-catalogue-wish={schemeId ?? `wish:${wishId}`} data-wished={id ? "1" : "0"} style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={press}>
        {id ? L("Не ме уведомявайте", "Do not tell me") : L("Уведоми ме при следваща", "Notify me of the next")}
      </button>
      {id && !cancelOnly && <span className="text-sm" style={{ color: "var(--muted)" }}>{L("Ще ви уведомим, когато започне следваща схема за същия обект.", "You will be told when the next scheme for the same object starts.")}</span>}
      {err && <span role="alert" className="text-sm" style={{ color: "#b42318" }}>{err}</span>}
    </span>
  );
}
