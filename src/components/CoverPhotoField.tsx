"use client";

import { useState } from "react";
import { uploadCoverImageAction } from "@/lib/actions";

// Cover-photo control on the scheme Edit page: upload (→ Supabase Storage), choose
// size (% of page width) and placement (left/centre/right), with a live preview.
// Writes hidden fields that the Edit form submits to updateSchemeAction.
export default function CoverPhotoField({
  image, width, align,
}: {
  image?: string;
  width?: number;
  align?: "left" | "center" | "right";
}) {
  const [img, setImg] = useState(image ?? "");
  const [w, setW] = useState(width ?? 46);
  const [al, setAl] = useState<"left" | "center" | "right">(align ?? "center");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", f);
    const r = await uploadCoverImageAction(fd);
    setBusy(false);
    e.target.value = "";
    if (r.error) { setErr(r.error); return; }
    if (r.url) setImg(r.url);
  }

  const margin = al === "left" ? "0 auto 0 0" : al === "right" ? "0 0 0 auto" : "0 auto";
  const small = { fontSize: 13, padding: "6px 12px" } as const;
  const alignBtn = (v: "left" | "center" | "right", label: string) => (
    <button type="button" onClick={() => setAl(v)} className="btn" style={al === v ? { ...small, background: "var(--green-soft)", color: "var(--green-dark)", borderColor: "var(--green-line)" } : small}>{label}</button>
  );

  return (
    <div>
      {/* hidden fields submitted with the Edit form */}
      <input type="hidden" name="coverImage" value={img} />
      <input type="hidden" name="coverImageWidth" value={String(w)} />
      <input type="hidden" name="coverImageAlign" value={al} />

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", minWidth: 260, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label className="btn" style={{ cursor: "pointer" }}>
              {busy ? "Uploading…" : img ? "Replace photo" : "Upload photo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} disabled={busy} />
            </label>
            {img && <button type="button" className="btn" style={{ ...small, color: "var(--red)" }} onClick={() => setImg("")}>Remove</button>}
          </div>
          {err && <div style={{ color: "var(--red)", fontSize: 13 }}>{err}</div>}
          <div style={{ fontSize: 12, color: "var(--muted)" }}>PNG, JPG or WEBP, up to 2 MB. A white background works best.</div>

          <label className="block">
            <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>Size — {w}% of the page width</span>
            <input type="range" min={15} max={90} value={w} onChange={(e) => setW(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
          </label>

          <div>
            <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>Placement</span>
            <div style={{ display: "flex", gap: 6 }}>
              {alignBtn("left", "Left")}{alignBtn("center", "Centre")}{alignBtn("right", "Right")}
            </div>
          </div>
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 260 }}>
          <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>Preview (on the white page)</span>
          <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "#fff", padding: 14, minHeight: 150 }}>
            {img ? (
              <img src={img} alt="" style={{ maxWidth: w + "%", display: "block", margin, borderRadius: 6 }} />
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "48px 0" }}>No cover photo yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
