"use client";

import { useEffect, useRef, useState } from "react";
import type { CoverEl, CoverElKey, Align, ElSize } from "@/skins/custom";
import { useLang } from "@/components/LangProvider";

// On-canvas cover editing. Renders the faithful live-preview iframe (same-origin
// srcDoc) and an interactive overlay measured from the rendered document: click an
// element to select it (floating toolbar = align · size · hide), drag to reorder.
// The side panel edits the same data, so this is an enhancement, not the only way.

type Box = { key: CoverElKey; dataIndex: number; top: number; left: number; width: number; height: number };

export default function CoverCanvas({
  srcDoc,
  elements,
  label,
  selected,
  onSelect,
  onReorder,
  onSetEl,
  scale = 0.7,
  width = 820,
  height = 1130, // fits the full simulated A4 sheet (297mm ≈ 1123px)
}: {
  srcDoc: string;
  elements: CoverEl[];
  label: (k: CoverElKey) => string;
  selected: CoverElKey | null;
  onSelect: (k: CoverElKey | null) => void;
  onReorder: (from: number, to: number) => void; // data indices
  onSetEl: (k: CoverElKey, patch: Partial<{ align: Align; size: ElSize; shown: boolean }>) => void;
  scale?: number;
  width?: number;
  height?: number;
}) {
  const { lang: uiLang } = useLang();
  const L = (bg: string, en: string) => (uiLang === "bg" ? bg : en);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const drag = useRef<{ key: CoverElKey; from: number; startY: number; moved: boolean } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Measure the rendered cover rows (.crow[data-key]) and project them, scaled,
  // onto the overlay. Re-runs on every srcDoc/elements change + after fonts settle.
  useEffect(() => {
    const ifr = iframeRef.current;
    if (!ifr) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const measure = () => {
      const doc = ifr.contentDocument;
      if (!doc) return;
      const next: Box[] = [];
      elements.forEach((el, dataIndex) => {
        if (!el.shown) return;
        const node = doc.querySelector(`.crow[data-key="${el.key}"]`) as HTMLElement | null;
        if (!node) return;
        const r = node.getBoundingClientRect();
        next.push({ key: el.key, dataIndex, top: r.top * scale, left: r.left * scale, width: r.width * scale, height: r.height * scale });
      });
      setBoxes(next);
    };
    const onLoad = () => { measure(); timers.push(setTimeout(measure, 250), setTimeout(measure, 800)); };
    ifr.addEventListener("load", onLoad);
    onLoad(); // in case it's already loaded
    return () => { ifr.removeEventListener("load", onLoad); timers.forEach(clearTimeout); };
  }, [srcDoc, elements, scale]);

  // Drag handling lives on the window so the pointer can leave a box mid-drag.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.abs(e.clientY - d.startY) < 4) return;
      d.moved = true;
      // nearest box centre to the pointer → its data index becomes the drop target
      let best: Box | null = null, bestDist = Infinity;
      const host = iframeRef.current?.getBoundingClientRect();
      if (!host) return;
      for (const b of boxes) {
        const centre = host.top + b.top + b.height / 2;
        const dist = Math.abs(e.clientY - centre);
        if (dist < bestDist) { bestDist = dist; best = b; }
      }
      setDropIndex(best ? best.dataIndex : null);
    };
    const onUp = () => {
      const d = drag.current;
      if (d && d.moved && dropIndex !== null && dropIndex !== d.from) onReorder(d.from, dropIndex);
      else if (d && !d.moved) onSelect(d.key);
      drag.current = null;
      setDropIndex(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [boxes, dropIndex, onReorder, onSelect]);

  const sel = boxes.find((b) => b.key === selected) ?? null;
  const selEl = elements.find((e) => e.key === selected) ?? null;

  return (
    <div
      style={{ position: "relative", width: width * scale, height: height * scale }}
      onPointerDown={() => onSelect(null)} // click empty area → deselect
    >
      <iframe
        ref={iframeRef}
        title={L("Преглед на облика", "Skin preview")}
        srcDoc={srcDoc}
        style={{ width, height, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
      />

      {/* element hotspots */}
      {boxes.map((b) => {
        const isSel = b.key === selected;
        const isDrop = dropIndex === b.dataIndex && drag.current?.from !== b.dataIndex;
        return (
          <div
            key={b.key}
            title={label(b.key)}
            onPointerDown={(e) => { e.stopPropagation(); drag.current = { key: b.key, from: b.dataIndex, startY: e.clientY, moved: false }; }}
            style={{
              position: "absolute", top: b.top - 2, left: b.left - 2, width: b.width + 4, height: b.height + 4,
              border: isSel ? "2px solid var(--green-dark)" : isDrop ? "2px dashed var(--green)" : "1px solid transparent",
              borderRadius: 4, cursor: "grab",
              background: isSel ? "rgba(43,103,68,0.06)" : "transparent",
              boxShadow: isSel ? "0 0 0 1px #fff" : "none",
            }}
            onMouseEnter={(e) => { if (!isSel) (e.currentTarget.style.borderColor = "var(--green-light)"); }}
            onMouseLeave={(e) => { if (!isSel) (e.currentTarget.style.borderColor = "transparent"); }}
          />
        );
      })}

      {/* floating toolbar for the selected element */}
      {sel && selEl && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute", left: Math.max(0, sel.left), top: Math.max(0, sel.top - 42),
            display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderRadius: 8,
            background: "var(--green-dark)", color: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,0.18)", zIndex: 5, whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>{label(sel.key)}</span>
          <Bar />
          {(["left", "center", "right"] as Align[]).map((a) => (
            <TBtn key={a} on={selEl.align === a} onClick={() => onSetEl(sel.key, { align: a })}>{a[0].toUpperCase()}</TBtn>
          ))}
          <Bar />
          {(["s", "m", "l"] as ElSize[]).map((s) => (
            <TBtn key={s} on={selEl.size === s} onClick={() => onSetEl(sel.key, { size: s })}>{s.toUpperCase()}</TBtn>
          ))}
          <Bar />
          <TBtn onClick={() => { onSetEl(sel.key, { shown: false }); onSelect(null); }}>{L("Скрий", "Hide")}</TBtn>
        </div>
      )}
    </div>
  );
}

function Bar() {
  return <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.3)" }} />;
}
function TBtn({ on, onClick, children }: { on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none", cursor: "pointer", borderRadius: 5, padding: "3px 7px", fontSize: 11, fontWeight: 700,
        background: on ? "#fff" : "rgba(255,255,255,0.16)", color: on ? "var(--green-dark)" : "#fff",
      }}
    >
      {children}
    </button>
  );
}
