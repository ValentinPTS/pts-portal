"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDefaultCoverAction, clearDefaultCoverAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

// Manager card on the Skins page: upload ONE title-page photo that's used on every
// scheme's title page (unless a scheme sets its own). Upload once → everywhere.
export default function DefaultCoverCard({ current }: { current: string | null }) {
  const { t } = useLang();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setErr("");
    start(async () => {
      const res = await uploadDefaultCoverAction(fd);
      if (res?.error) setErr(res.error);
      else router.refresh();
      if (fileRef.current) fileRef.current.value = "";
    });
  }
  function remove() {
    setErr("");
    start(async () => { await clearDefaultCoverAction(); router.refresh(); });
  }

  return (
    <div className="card p-4 mb-5" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: 120, height: 80, flex: "0 0 auto", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {current
          ? <img src={current} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          : <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: 6 }}>{t("cover.none")}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div className="font-bold" style={{ fontSize: 16, color: "var(--green-dark)" }}>{t("cover.title")}</div>
        <p className="text-sm" style={{ color: "var(--muted)", marginTop: 2 }}>{t("cover.subtitle")}</p>
        {err && <p className="text-sm" style={{ color: "var(--red)", marginTop: 4 }}>{err}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPick} style={{ display: "none" }} />
        <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={pending} onClick={() => fileRef.current?.click()}>
          {pending ? t("cover.uploading") : current ? t("cover.replace") : t("cover.upload")}
        </button>
        {current && <button className="btn" style={{ fontSize: 13, borderColor: "var(--red)", color: "var(--red)" }} disabled={pending} onClick={remove}>{t("cover.remove")}</button>}
      </div>
    </div>
  );
}
