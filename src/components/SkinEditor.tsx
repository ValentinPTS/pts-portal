"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomSkinAction, updateCustomSkinAction, uploadSkinLogoAction } from "@/lib/actions";
import CoverCanvas from "@/components/CoverCanvas";
import {
  previewDocHtml, basePreset, COVER_LABEL,
  HEADING_FONTS, BODY_FONTS, BASES,
  type CustomSkinData, type SkinBase, type SkinScope, type Align, type CoverElKey,
  type ElSize, type Density, type BandColor,
} from "@/skins/custom";

type Data = Omit<CustomSkinData, "id">;

// The visual skin editor — colours, fonts, logo and a re-arrangeable cover, with a
// live preview that renders through the exact same code the PDF uses. Created from
// the approved Figma mock. The server re-validates everything on save, so the UI is
// free to be forgiving (the preview is defensive too).
export default function SkinEditor({
  mode,
  skinId,
  initial,
}: {
  mode: "new" | "edit";
  skinId?: string;
  initial: Data;
}) {
  const [data, setData] = useState<Data>(initial);
  const [lang, setLang] = useState<"bg" | "en">("bg");
  const [err, setErr] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<CoverElKey | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = <K extends keyof Data>(k: K, v: Data[K]) => setData((d) => ({ ...d, [k]: v }));
  const setColor = (k: keyof Data["colors"], v: string) => setData((d) => ({ ...d, colors: { ...d.colors, [k]: v } }));
  const setFont = (k: keyof Data["fonts"], v: string) => setData((d) => ({ ...d, fonts: { ...d.fonts, [k]: v } }));

  // "Start from" resets the look (colours/fonts/logo/cover) to a base; keeps name + scope.
  function applyBase(base: SkinBase) {
    setData((d) => ({ ...d, ...basePreset(base) }));
  }

  function setEl(key: CoverElKey, patch: Partial<{ shown: boolean; align: Align; size: ElSize }>) {
    setData((d) => ({ ...d, elements: d.elements.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
  }
  function reorder(from: number, to: number) {
    if (from === to) return;
    setData((d) => {
      const next = [...d.elements];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...d, elements: next };
    });
  }

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f) return;
    setLogoErr(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    uploadSkinLogoAction(fd)
      .then((res) => {
        setUploading(false);
        if (res.error) { setLogoErr(res.error); return; }
        if (res.url) set("logo", res.url);
      })
      .catch((e2) => { setUploading(false); setLogoErr(String(e2?.message ?? e2)); });
  }

  const srcDoc = useMemo(
    () => previewDocHtml({ ...data, id: skinId ?? "preview" } as CustomSkinData, lang),
    [data, lang, skinId]
  );

  function save() {
    setErr(null);
    if (!data.name.trim()) { setErr("A skin name is required."); return; }
    start(async () => {
      const res = mode === "edit"
        ? await updateCustomSkinAction(skinId!, data)
        : await createCustomSkinAction(data);
      if (res.error) { setErr(res.error); return; }
      router.push("/skins");
      router.refresh();
    });
  }

  return (
    <div>
      {/* header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            <Link href="/skins" style={{ color: "var(--muted)" }}>Skins</Link> › {mode === "edit" ? "Edit skin" : "New skin"}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--green-dark)", letterSpacing: "-0.01em", margin: "2px 0 0" }}>
            {data.name.trim() || (mode === "edit" ? "Edit skin" : "New skin")}
          </h1>
        </div>
        <Link href="/skins" className="btn" style={{ fontSize: 14 }}>Cancel</Link>
        <button type="button" className="btn btn-primary" style={{ fontSize: 14 }} onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save skin"}
        </button>
      </div>
      {err && (
        <div style={{ background: "var(--red-soft, #c46a5e)", color: "#fff", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 14 }}>{err}</div>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ── controls ── */}
        <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Basics */}
          <section className="card" style={{ padding: 16 }}>
            <Title>Basics</Title>
            <Field label="Skin name">
              <input
                value={data.name}
                onChange={(e) => set("name", e.target.value.slice(0, 60))}
                placeholder="e.g. Forest Pro"
                style={inputStyle}
              />
            </Field>
            <Field label="For">
              <Segmented
                value={data.scope}
                options={[["T", "Testing"], ["C", "Calibration"], ["both", "Both"]]}
                onChange={(v) => set("scope", v as SkinScope)}
              />
            </Field>
            <Field label="Start from">
              <select value={data.base} onChange={(e) => applyBase(e.target.value as SkinBase)} style={inputStyle}>
                {BASES.map((b) => <option key={b.id} value={b.id}>{b.label} — {b.description}</option>)}
              </select>
            </Field>
          </section>

          {/* Colours */}
          <section className="card" style={{ padding: 16 }}>
            <Title>Colours</Title>
            <ColorRow label="Primary" value={data.colors.primary} onChange={(v) => setColor("primary", v)} />
            <ColorRow label="Accent" value={data.colors.accent} onChange={(v) => setColor("accent", v)} />
            <ColorRow label="Headings" value={data.colors.heading} onChange={(v) => setColor("heading", v)} />
            <ColorRow label="Background" value={data.colors.bg} onChange={(v) => setColor("bg", v)} />
          </section>

          {/* Fonts */}
          <section className="card" style={{ padding: 16 }}>
            <Title>Fonts</Title>
            <Field label="Headings">
              <select value={data.fonts.heading} onChange={(e) => setFont("heading", e.target.value)} style={inputStyle}>
                {HEADING_FONTS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
              </select>
            </Field>
            <Field label="Body">
              <select value={data.fonts.body} onChange={(e) => setFont("body", e.target.value)} style={inputStyle}>
                {BODY_FONTS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
              </select>
            </Field>
          </section>

          {/* Logo */}
          <section className="card" style={{ padding: 16 }}>
            <Title>Logo</Title>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 6 }}>
              <input type="radio" checked={data.logo === "default"} onChange={() => set("logo", "default")} />
              PTS logo (default)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="radio" checked={data.logo !== "default"} onChange={() => set("logo", "https://")} />
              Custom image URL
            </label>
            {data.logo !== "default" && (
              <input
                value={data.logo}
                onChange={(e) => set("logo", e.target.value.slice(0, 400))}
                placeholder="https://…  (or /brand/your-logo.png)"
                style={{ ...inputStyle, marginTop: 6 }}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <label className="btn" style={{ fontSize: 13, cursor: uploading ? "default" : "pointer", display: "inline-flex" }}>
                {uploading ? "Uploading…" : "Upload image…"}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={onPickLogo} style={{ display: "none" }} />
              </label>
              {logoErr && <span style={{ color: "var(--red)", fontSize: 12 }}>{logoErr}</span>}
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>
              Upload a PNG/JPG/WEBP (max 1.5 MB), or paste an <code>https://</code> URL. SVG isn’t accepted for upload.
            </p>
          </section>

          {/* Cover layout */}
          <section className="card" style={{ padding: 16 }}>
            <Title>Cover layout</Title>

            <Field label="Density">
              <Segmented value={data.density} options={[["compact", "Compact"], ["normal", "Normal"], ["airy", "Airy"]]} onChange={(v) => set("density", v as Density)} small />
            </Field>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={data.band.on} onChange={(e) => setData((d) => ({ ...d, band: { ...d.band, on: e.target.checked } }))} />
                Header band (logo + title on a colour panel)
              </label>
              {data.band.on && (
                <div style={{ marginTop: 8 }}>
                  <Segmented
                    value={data.band.color}
                    options={[["primary", "Primary"], ["accent", "Accent"], ["heading", "Headings"]]}
                    onChange={(v) => setData((d) => ({ ...d, band: { ...d.band, color: v as BandColor } }))}
                    small
                  />
                </div>
              )}
            </div>

            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>Drag to reorder · toggle what shows · set align &amp; size.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.elements.map((el, i) => (
                <div
                  key={el.key}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); }}
                  style={{
                    display: "flex", flexDirection: "column", gap: 7, padding: "8px 9px", borderRadius: 8,
                    border: "1px solid var(--line)", background: el.shown ? "#fff" : "var(--bg)",
                    opacity: dragIdx === i ? 0.5 : 1, cursor: "grab",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1 }} aria-hidden>⋮⋮</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: el.shown ? "var(--ink)" : "var(--muted)" }}>
                      {COVER_LABEL[el.key]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEl(el.key, { shown: !el.shown })}
                      className="btn"
                      style={{ fontSize: 11, padding: "4px 9px", color: el.shown ? "var(--green-dark)" : "var(--muted)" }}
                    >
                      {el.shown ? "Shown" : "Hidden"}
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 24 }}>
                    <AlignToggle value={el.align} onChange={(a) => setEl(el.key, { align: a })} />
                    <MiniToggle<ElSize>
                      value={el.size}
                      options={[["s", "S"], ["m", "M"], ["l", "L"]]}
                      onChange={(s) => setEl(el.key, { size: s })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── live preview / on-canvas editing ── */}
        <div style={{ flex: 1, minWidth: 360, position: "sticky", top: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green-dark)" }}>Live preview</span>
            <Segmented value={lang} options={[["bg", "БГ"], ["en", "EN"]]} onChange={(v) => setLang(v as "bg" | "en")} small />
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>click an element · drag to reorder</span>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--bg)", height: 760, display: "flex", justifyContent: "center" }}>
            <CoverCanvas
              srcDoc={srcDoc}
              elements={data.elements}
              label={(k) => COVER_LABEL[k]}
              selected={selected}
              onSelect={setSelected}
              onReorder={reorder}
              onSetEl={setEl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── small presentational helpers ─────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px",
  fontSize: 14, color: "var(--ink)", background: "#fff",
};

function Title({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 12px" }}>{children}</h2>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5, color: "var(--ink)" }}>{label}</span>
      {children}
    </label>
  );
}
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <input type="color" value={/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)}
        style={{ width: 36, height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: 0, background: "none", cursor: "pointer" }} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value.slice(0, 7))}
        style={{ width: 92, border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "monospace" }} />
    </div>
  );
}
function Segmented<T extends string>({ value, options, onChange, small }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          style={{
            border: "none", cursor: "pointer", fontSize: small ? 12 : 13, fontWeight: value === v ? 700 : 500,
            padding: small ? "5px 10px" : "7px 14px",
            background: value === v ? "var(--green-soft)" : "transparent",
            color: value === v ? "var(--green-dark)" : "var(--muted)",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}
function AlignToggle({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  return <MiniToggle<Align> value={value} options={[["left", "L"], ["center", "C"], ["right", "R"]]} onChange={onChange} />;
}
// A compact square-button toggle (alignment, size, …).
function MiniToggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          style={{
            border: "none", cursor: "pointer", width: 24, height: 24, fontSize: 11, fontWeight: 700,
            background: value === v ? "var(--green-dark)" : "#fff",
            color: value === v ? "#fff" : "var(--muted)",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}
