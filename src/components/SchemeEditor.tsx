"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { updateSchemeAction } from "@/lib/actions";
import CoverPhotoField from "@/components/CoverPhotoField";
import { useLang } from "@/components/LangProvider";
import type { CalibrationData, Parameter, PriceRow, ScheduleItem, SchemeStatus } from "@/lib/types";

// The reworked "Edit scheme data" view. Focused on what the owner actually
// manages per round: the essentials (number, name, photo), OPENING the scheme,
// the schedule dates labs will see (Invitation §3 / Plan §10 calendars) and the
// standards they participate in (the apply wizard's step-3 boxes) — with full
// add / remove / reorder. Everything else lives in a collapsed Advanced section.
//
// Rows are CONTROLLED state with stable uid keys: reordering moves values with
// their row (uncontrolled inputs would keep stale DOM values). Each surviving
// standard posts its ORIGINAL index (param_i_orig), so the server can remap the
// position-based references (applications, participants, scoring) — see
// lib/param-remap.ts.

export interface SchemeEditorInit {
  id: string;
  number: string;
  titleEn: string;
  titleBg: string;
  objectEn: string;
  objectBg: string;
  status: SchemeStatus;
  announced: boolean;
  coverImage?: string;
  coverImageWidth?: number;
  coverImageAlign?: "left" | "center" | "right";
  minParticipants: number;
  schedule: ScheduleItem[];
  parameters: Parameter[];
  prices: PriceRow[];
  calibration?: CalibrationData;
}

type SchedRow = ScheduleItem & { uid: number };
// sigma is kept as the RAW STRING while editing (parsed only on the server):
// parsing per keystroke through a controlled input eats decimal separators —
// typing "0,5" would collapse to 5.
type ParamRow = Omit<Parameter, "sigmaMin"> & { uid: number; orig: number | null; sigma: string };

const inputCls = "w-full rounded px-2 py-1 text-sm";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;
const STATUSES: { value: SchemeStatus; bg: string; en: string }[] = [
  { value: "draft", bg: "Чернова", en: "Draft" },
  { value: "open", bg: "Отворена", en: "Open" },
  { value: "running", bg: "Провежда се", en: "Running" },
  { value: "report", bg: "Докладване", en: "Reporting" },
  { value: "closed", bg: "Затворена", en: "Closed" },
];

// Text pasted from Word/PDF often drags in invisible junk (control chars,
// zero-width marks, private-use glyphs, BOM, U+FFFD). Strip those on input so
// they never reach the documents; visible characters are left untouched.
const cleanPaste = (v: string) =>
  v.replace(/[\u2028\u2029]/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\uE000-\uF8FF\uFEFF\uFFFD]/g, "");

function FieldS({ label, value, onChange, placeholder, id }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; id?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{label}</span>
      <input id={id} value={value} onChange={(e) => onChange(cleanPaste(e.target.value))} placeholder={placeholder} className={inputCls} style={inputStyle} />
    </label>
  );
}

function AreaS({ label, value, onChange, placeholder, id, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; id?: string; rows?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{label}</span>
      <textarea id={id} value={value} onChange={(e) => onChange(cleanPaste(e.target.value))} placeholder={placeholder} rows={rows} className={inputCls} style={{ ...inputStyle, resize: "vertical" }} />
    </label>
  );
}

// A small labelled sub-group inside a card: tells the owner WHERE these fields
// end up (the заявка, the Plan, internal docs) — the map that was missing.
function DestGroup({ title, children, cols = "1fr 1fr" }: { title: string; children: React.ReactNode; cols?: string }) {
  return (
    <div className="rounded-lg p-2 mb-2" style={{ border: "1px dashed var(--line)", background: "#fcfdfb" }}>
      <div className="text-xs font-bold mb-1.5" style={{ color: "var(--green-dark)" }}>{title}</div>
      <div className="grid gap-2" style={{ gridTemplateColumns: cols }}>{children}</div>
    </div>
  );
}

// ── Live previews: exactly what the typed values produce ────────────────────
// The dark заявка item (ApplyWizard step 3 look). Clicking a part focuses the
// field it comes from, so the preview doubles as a "what goes where" map.
function PreviewApply({ standard, characteristic, onStd, onChar, label }: {
  standard: string; characteristic: string; onStd?: () => void; onChar?: () => void; label: string;
}) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="flex items-start gap-3 rounded-lg p-3" style={{ background: "#1b2016", border: "1px solid #36422c" }}>
        <span style={{ width: 46, flex: "0 0 auto", background: "#e9eef0", border: "1px solid #2b3422", borderRadius: 8, padding: "6px 0", color: "#10140d", textAlign: "center", fontSize: 13 }}>0</span>
        <div style={{ fontSize: "0.9rem", minWidth: 0 }}>
          <div data-prev="std" onClick={onStd} style={{ color: "var(--green-light, #9dc088)", fontWeight: 700, cursor: onStd ? "pointer" : undefined, overflowWrap: "anywhere" }}>{standard || "…"}</div>
          <div data-prev="char" onClick={onChar} style={{ color: "#cdd6c2", cursor: onChar ? "pointer" : undefined, overflowWrap: "anywhere" }}>{characteristic || "…"}</div>
        </div>
      </div>
    </div>
  );
}

// The Plan §6 row (Метод | Характеристика | Обхват | Проби), white-paper style.
function PreviewPlan({ standard, characteristic, range, specimens, label, heads, onCells }: {
  standard: string; characteristic: string; range: string; specimens: string; label: string;
  heads: [string, string, string, string]; onCells?: [() => void, () => void, () => void, () => void];
}) {
  const td = { border: "1px solid #dcdcdc", padding: "3px 7px", fontSize: 11.5, verticalAlign: "top" as const, overflowWrap: "anywhere" as const };
  const cells = [standard, characteristic, range, specimens];
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>{label}</div>
      <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
        <thead>
          <tr>{heads.map((h) => <th key={h} style={{ ...td, background: "#eef3ea", color: "#456b2c", fontWeight: 700 }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          <tr>{cells.map((c, i) => <td key={i} onClick={onCells?.[i]} style={{ ...td, cursor: onCells ? "pointer" : undefined }}>{c ? `${i === 0 ? "* " : ""}${c}` : "—"}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, name, def }: { label: string; name: string; def: string }) {
  return (
    <label className="block">
      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{label}</span>
      <input name={name} defaultValue={def} className={inputCls} style={inputStyle} />
    </label>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mt-8 mb-3 pb-1" style={{ borderBottom: "2px solid var(--red)" }}>
      <h2 className="text-lg font-bold" style={{ color: "var(--green-dark)" }}>{children}</h2>
      {hint && <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>{hint}</p>}
    </div>
  );
}

// ↑ / ↓ / ✕ row controls shared by both editors. The LAST remaining row can't be
// deleted (the documents need at least one date / one standard).
function RowCtl({ onUp, onDown, onDel, canUp, canDown, canDel, delTitle, lastTitle }: {
  onUp: () => void; onDown: () => void; onDel: () => void;
  canUp: boolean; canDown: boolean; canDel: boolean; delTitle: string; lastTitle: string;
}) {
  const b = { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1 } as const;
  return (
    <div className="flex gap-1" style={{ flex: "0 0 auto" }}>
      <button type="button" onClick={onUp} disabled={!canUp} style={{ ...b, opacity: canUp ? 1 : 0.35 }} aria-label="Move up">↑</button>
      <button type="button" onClick={onDown} disabled={!canDown} style={{ ...b, opacity: canDown ? 1 : 0.35 }} aria-label="Move down">↓</button>
      <button type="button" onClick={onDel} disabled={!canDel} title={canDel ? delTitle : lastTitle}
        style={{ ...b, color: "var(--red)", borderColor: "#e3c8c8", opacity: canDel ? 1 : 0.35, cursor: canDel ? "pointer" : "not-allowed" }} aria-label="Remove">✕</button>
    </div>
  );
}

// Submit disabled while the save is in flight: a double-clicked Save would post
// the pre-save orig indexes twice and re-apply the standards remap.
function SaveBar({ id, label, cancel }: { id: string; label: string; cancel: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-7 flex gap-3" style={{ position: "sticky", bottom: 0, background: "var(--canvas, #fff)", padding: "12px 0" }}>
      <button type="submit" className="btn btn-primary" disabled={pending} style={pending ? { opacity: 0.6 } : {}}>
        {pending ? "…" : label}
      </button>
      <Link href={`/schemes/${id}`} className="btn">{cancel}</Link>
    </div>
  );
}

export default function SchemeEditor({ init }: { init: SchemeEditorInit }) {
  const { lang } = useLang();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);

  // uids must be DETERMINISTIC across server render and hydration (they become
  // DOM ids the previews focus by): initial rows use their index; rows added
  // later draw from a ref-based counter that only advances in event handlers
  // (client-only), so SSR and client markup always match.
  const uidRef = useRef(1000);
  const nextUid = () => ++uidRef.current;

  const [sched, setSched] = useState<SchedRow[]>(() => init.schedule.map((s, i) => ({ ...s, uid: i })));
  const [params, setParams] = useState<ParamRow[]>(() =>
    init.parameters.map((p, i) => ({ ...p, sigma: p.sigmaMin != null ? String(p.sigmaMin) : "", uid: i, orig: i }))
  );
  const [status, setStatus] = useState<SchemeStatus>(init.status);
  // controlled (not defaultChecked): the checkbox unmounts while status is
  // "open", and an uncontrolled remount would silently revert the owner's toggle
  const [announced, setAnnounced] = useState(init.announced);
  const [copied, setCopied] = useState(false);

  // Calibration schemes have NO standards — the device/quantity/points ARE the
  // scheme (they feed all C documents and the заявка). Controlled so the live
  // preview mirrors typing; posted via hidden cal_* inputs (the names the save
  // action already reads). Lists are edited as comma-joined text.
  const isCal = !!init.calibration;
  const [cal, setCal] = useState(() => ({
    quantityBg: init.calibration?.quantityBg ?? "",
    quantityEn: init.calibration?.quantityEn ?? "",
    unit: init.calibration?.unit ?? "",
    deviceBg: init.calibration?.deviceBg ?? "",
    deviceEn: init.calibration?.deviceEn ?? "",
    // filter(Boolean): the New-project template used to seed blank point slots —
    // joining those would show a literal ", , , ," instead of the placeholder
    points: init.calibration?.points.filter(Boolean).join(", ") ?? "",
    dirBg: init.calibration?.directionsBg.filter(Boolean).join(", ") ?? "",
    dirEn: init.calibration?.directionsEn.filter(Boolean).join(", ") ?? "",
    refLabBg: init.calibration?.referenceLabBg ?? "",
    refLabEn: init.calibration?.referenceLabEn ?? "",
    refLocBg: init.calibration?.referenceLabLocBg ?? "",
    refLocEn: init.calibration?.referenceLabLocEn ?? "",
    methodBg: init.calibration?.methodBg ?? "",
    methodEn: init.calibration?.methodEn ?? "",
  }));

  const move = <T,>(arr: T[], i: number, d: -1 | 1): T[] => {
    const out = [...arr];
    const j = i + d;
    if (j < 0 || j >= out.length) return out;
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };
  const patchRow = <T,>(arr: T[], i: number, patch: Partial<T>): T[] =>
    arr.map((r, k) => (k === i ? { ...r, ...patch } : r));

  function addDate() {
    setSched((s) => [...s, { uid: nextUid(), date: "", labelEn: "", labelBg: "" }]);
  }
  function addParam() {
    setParams((p) => [...p, {
      uid: nextUid(), orig: null, sigma: "",
      standardEn: "", standardBg: "", characteristicEn: "", characteristicBg: "",
      rangeEn: "", rangeBg: "", specimensEn: "", specimensBg: "",
    }]);
  }
  function delParam(i: number) {
    const row = params[i];
    if (row.orig !== null) {
      const okMsg = L(
        "Премахване на този стандарт? Той изчезва от документите и от заявката — заявени участия и ВЪВЕДЕНИ РЕЗУЛТАТИ/ОЦЕНКИ по него се губят.",
        "Remove this standard? It disappears from the documents and the apply wizard — requested participations and any ENTERED RESULTS/SCORES for it are dropped."
      );
      if (!window.confirm(okMsg)) return;
    }
    setParams((p) => p.filter((_, k) => k !== i));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/apply/${init.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable — the link is visible to copy by hand */ }
  }

  return (
    <form action={updateSchemeAction}>
      <input type="hidden" name="id" value={init.id} />

      {/* ── Essentials ─────────────────────────────────────────────── */}
      <SectionTitle>{L("Основни данни", "Basics")}</SectionTitle>
      <label className="block mb-3">
        <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>
          {L("Официален номер (PTS №) — на всеки документ; определя и папката по година", "Official number (PTS №) — on every document; also sets the year folder")}
        </span>
        <input
          name="number"
          defaultValue={init.number}
          className="rounded px-3 py-2 text-sm font-bold"
          style={{ border: "1px solid var(--green-line)", background: "var(--green-soft)", color: "var(--green-dark)", maxWidth: 320, fontFamily: "var(--font-sans)" }}
        />
      </label>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label={L("Заглавие (БГ)", "Title (BG)")} name="titleBg" def={init.titleBg} />
        <Field label={L("Заглавие (EN)", "Title (EN)")} name="titleEn" def={init.titleEn} />
      </div>

      <SectionTitle hint={L("Показва се на заглавната страница на документите.", "Shown on the documents' title page.")}>
        {L("Снимка (заглавна страница)", "Cover photo (title page)")}
      </SectionTitle>
      <CoverPhotoField image={init.coverImage} width={init.coverImageWidth} align={init.coverImageAlign} />

      {/* ── Open for applications ─────────────────────────────────── */}
      <SectionTitle hint={L("Статусът определя какво виждат лабораториите.", "The status controls what laboratories see.")}>
        {L("Отваряне на схемата", "Opening the scheme")}
      </SectionTitle>
      <input type="hidden" name="status" value={status} />
      <div className="card p-4" style={{ background: status === "open" ? "var(--green-soft)" : "#fff" }}>
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((st) => {
            const active = status === st.value;
            const prominent = st.value === "open";
            return (
              <button
                key={st.value}
                type="button"
                onClick={() => setStatus(st.value)}
                className="btn"
                style={active
                  ? { background: "var(--green-dark)", color: "#fff", borderColor: "var(--green-dark)", fontWeight: 700 }
                  : prominent
                    ? { borderColor: "var(--green-dark)", color: "var(--green-dark)", fontWeight: 700 }
                    : {}}
              >
                {st.value === "open" && "✓ "}{L(st.bg, st.en)}
              </button>
            );
          })}
        </div>
        {status === "open" ? (
          <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
            <span style={{ color: "var(--green-dark)", fontWeight: 700 }}>
              {L("Схемата приема заявки:", "The scheme is accepting applications:")}
            </span>
            <code className="rounded px-2 py-1" style={{ background: "#fff", border: "1px solid var(--green-line)" }}>/apply/{init.id}</code>
            <button type="button" className="btn" style={{ fontSize: 12.5, height: 30, padding: "0 10px" }} onClick={copyLink}>
              {copied ? L("Копирано ✓", "Copied ✓") : L("Копирай линка", "Copy link")}
            </button>
          </div>
        ) : (
          <label className="flex items-start gap-2 mt-3">
            <input type="checkbox" checked={announced} onChange={(e) => setAnnounced(e.target.checked)} style={{ marginTop: 3 }} />
            <span className="text-sm" style={{ color: "var(--ink)" }}>
              {L("Обяви на лабораториите", "Announce to labs")}
              <span className="block text-xs" style={{ color: "var(--muted)" }}>
                {L("Схемата се показва в таб „Предстоящи“ на портала за лаборатории още докато е чернова. Заявки се приемат едва при статус „Отворена“.",
                   "Shows the scheme in the lab portal's “Upcoming” tab while still a draft. Applications are only accepted once the status is “Open”.")}
              </span>
            </span>
          </label>
        )}
        <input type="hidden" name="announced" value={announced ? "on" : ""} />
      </div>

      {/* ── Schedule ──────────────────────────────────────────────── */}
      <SectionTitle hint={L("Зелените календари, които участниците виждат в Поканата (§3) и Плана (§10) — в този ред.",
                            "The green calendars participants see in the Invitation (§3) and the Plan (§10) — in this order.")}>
        {L("График — дати на периодите", "Schedule — period dates")}
      </SectionTitle>
      <input type="hidden" name="schedCount" value={sched.length} />
      <div className="grid gap-2">
        {sched.map((row, i) => (
          <div key={row.uid} className="flex items-end gap-2">
            <div className="grid gap-2" style={{ gridTemplateColumns: "130px 1fr 1fr", flex: 1 }}>
              <FieldS label={L("Дата (дд.мм.гггг)", "Date (dd.mm.yyyy)")} value={row.date} onChange={(v) => setSched((s) => patchRow(s, i, { date: v }))} />
              <FieldS label={L("Етикет (БГ)", "Label (BG)")} value={row.labelBg} onChange={(v) => setSched((s) => patchRow(s, i, { labelBg: v }))} />
              <FieldS label={L("Етикет (EN)", "Label (EN)")} value={row.labelEn} onChange={(v) => setSched((s) => patchRow(s, i, { labelEn: v }))} />
            </div>
            <RowCtl
              onUp={() => setSched((s) => move(s, i, -1))}
              onDown={() => setSched((s) => move(s, i, 1))}
              onDel={() => setSched((s) => s.filter((_, k) => k !== i))}
              canUp={i > 0}
              canDown={i < sched.length - 1}
              canDel={sched.length > 1}
              delTitle={L("Премахни датата", "Remove the date")}
              lastTitle={L("Графикът трябва да има поне една дата", "The schedule needs at least one date")}
            />
            {/* posted values (controlled inputs above carry no name on purpose —
                names here follow the CURRENT position) */}
            <input type="hidden" name={`sched_${i}_date`} value={row.date} />
            <input type="hidden" name={`sched_${i}_bg`} value={row.labelBg} />
            <input type="hidden" name={`sched_${i}_en`} value={row.labelEn} />
          </div>
        ))}
      </div>
      <button type="button" className="btn mt-2" onClick={addDate} style={{ borderColor: "var(--green-line)", color: "var(--green-dark)" }}>
        ＋ {L("Добави дата", "Add date")}
      </button>

      {isCal ? (
        <>
          {/* ── CALIBRATION scheme: device + points ARE the scheme — no standards ── */}
          <SectionTitle hint={L("Устройството, величината и точките са това, което лабораториите виждат в заявката и в документите (Покана §2, План §6). Стандарти няма при калибриране.",
                                "The device, quantity and points are what labs see in the заявка and the documents (Invitation §2, Plan §6). Calibration schemes have no standards.")}>
            {L("Обект и калибриране", "Object & calibration")}
          </SectionTitle>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label={L("Обект (БГ) — заглавието в заявката", "Object (BG) — the заявка heading")} name="objectBg" def={init.objectBg} />
            <Field label={L("Обект (EN)", "Object (EN)")} name="objectEn" def={init.objectEn} />
          </div>
          <div className="card p-3">
            <DestGroup title={L("Устройство за калибриране → Покана §2 · План §6 · заявка стъпка 3", "Calibration device → Invitation §2 · Plan §6 · заявка step 3")}>
              <AreaS id="cal-devBg" label={L("Устройство (БГ)", "Device (BG)")} value={cal.deviceBg}
                placeholder={L("Цифров хигрометър ETI Ltd THERMA 6102, с външна сонда; обхват 0–100 %RH; разделителна способност 0,1 %RH", "Digital hygrometer ETI Ltd THERMA 6102 …")}
                onChange={(v) => setCal((c) => ({ ...c, deviceBg: v }))} />
              <AreaS label={L("Устройство (EN)", "Device (EN)")} value={cal.deviceEn}
                placeholder="Digital hygrometer ETI Ltd THERMA 6102, external probe; range 0–100 %RH; resolution 0.1 %RH"
                onChange={(v) => setCal((c) => ({ ...c, deviceEn: v }))} />
              <FieldS id="cal-qBg" label={L("Величина (БГ)", "Quantity (BG)")} value={cal.quantityBg} placeholder={L("Относителна влажност на въздуха", "…")} onChange={(v) => setCal((c) => ({ ...c, quantityBg: v }))} />
              <FieldS label={L("Величина (EN)", "Quantity (EN)")} value={cal.quantityEn} placeholder="Relative air humidity" onChange={(v) => setCal((c) => ({ ...c, quantityEn: v }))} />
              <FieldS id="cal-pts" label={L("Точки на калибриране (със запетая)", "Calibration points (comma-separated)")} value={cal.points} placeholder="10, 20, 30, 50, 70, 90" onChange={(v) => setCal((c) => ({ ...c, points: v }))} />
              <FieldS label={L("Единица", "Unit")} value={cal.unit} placeholder="%RH" onChange={(v) => setCal((c) => ({ ...c, unit: v }))} />
              <FieldS label={L("Посоки БГ (със запетая; празно ако няма)", "Directions BG (comma-sep.; empty if none)")} value={cal.dirBg} placeholder={L("Опън, Натиск", "…")} onChange={(v) => setCal((c) => ({ ...c, dirBg: v }))} />
              <FieldS label={L("Посоки EN (със запетая)", "Directions EN (comma-separated)")} value={cal.dirEn} placeholder="Tension, Compression" onChange={(v) => setCal((c) => ({ ...c, dirEn: v }))} />
            </DestGroup>
            <DestGroup title={L("Референтна лаборатория и метод → План §3 · §6", "Reference laboratory & method → Plan §3 · §6")}>
              <FieldS label={L("Референтна лаборатория (БГ)", "Reference lab (BG)")} value={cal.refLabBg} onChange={(v) => setCal((c) => ({ ...c, refLabBg: v }))} />
              <FieldS label={L("Референтна лаборатория (EN)", "Reference lab (EN)")} value={cal.refLabEn} onChange={(v) => setCal((c) => ({ ...c, refLabEn: v }))} />
              <FieldS label={L("Местоположение (БГ)", "Location (BG)")} value={cal.refLocBg} onChange={(v) => setCal((c) => ({ ...c, refLocBg: v }))} />
              <FieldS label={L("Местоположение (EN)", "Location (EN)")} value={cal.refLocEn} onChange={(v) => setCal((c) => ({ ...c, refLocEn: v }))} />
              <FieldS label={L("Метод (БГ)", "Method (BG)")} value={cal.methodBg} placeholder={L("ISO 376 — метод на пряко сравнение", "…")} onChange={(v) => setCal((c) => ({ ...c, methodBg: v }))} />
              <FieldS label={L("Метод (EN)", "Method (EN)")} value={cal.methodEn} placeholder="ISO 376 — direct comparison method" onChange={(v) => setCal((c) => ({ ...c, methodEn: v }))} />
            </DestGroup>
            {/* live preview: the заявка item labs will see, built from the fields above */}
            <PreviewApply
              label={L("Преглед — как ще го видят лабораториите в заявката:", "Preview — how labs will see it in the заявка:")}
              standard={cal.deviceBg}
              characteristic={`${cal.quantityBg}${cal.points.trim() ? ` (${cal.points.split(",").map((x) => x.trim()).filter(Boolean).join(" " + cal.unit + ", ")} ${cal.unit})` : ""}`}
              onStd={() => document.getElementById("cal-devBg")?.focus()}
              onChar={() => document.getElementById("cal-qBg")?.focus()}
            />
            {/* posted under the SAME names the save action already reads */}
            <input type="hidden" name="cal_quantityBg" value={cal.quantityBg} />
            <input type="hidden" name="cal_quantityEn" value={cal.quantityEn} />
            <input type="hidden" name="cal_unit" value={cal.unit} />
            <input type="hidden" name="cal_deviceBg" value={cal.deviceBg} />
            <input type="hidden" name="cal_deviceEn" value={cal.deviceEn} />
            <input type="hidden" name="cal_points" value={cal.points} />
            <input type="hidden" name="cal_dirBg" value={cal.dirBg} />
            <input type="hidden" name="cal_dirEn" value={cal.dirEn} />
            <input type="hidden" name="cal_refLabBg" value={cal.refLabBg} />
            <input type="hidden" name="cal_refLabEn" value={cal.refLabEn} />
            <input type="hidden" name="cal_refLocBg" value={cal.refLocBg} />
            <input type="hidden" name="cal_refLocEn" value={cal.refLocEn} />
            <input type="hidden" name="cal_methodBg" value={cal.methodBg} />
            <input type="hidden" name="cal_methodEn" value={cal.methodEn} />
          </div>
        </>
      ) : (
        <>
          {/* ── TESTING scheme: object + standards ───────────────────── */}
          <SectionTitle hint={L("Обектът е заглавието над стандартите в заявката; всеки стандарт става поле „брой участия“ в стъпка 3 на заявката.",
                                "The object is the heading above the standards in the apply wizard; every standard becomes a “participations” box in its step 3.")}>
            {L("Обект и стандарти за участие", "Object & standards for participation")}
          </SectionTitle>
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label={L("Обект (БГ) — заглавието в заявката", "Object (BG) — the заявка heading")} name="objectBg" def={init.objectBg} />
            <Field label={L("Обект (EN)", "Object (EN)")} name="objectEn" def={init.objectEn} />
          </div>
          <input type="hidden" name="paramCount" value={params.length} />
          <div className="grid gap-4">
            {params.map((p, i) => (
              <div key={p.uid} className="card p-3" style={p.orig === null ? { borderColor: "var(--green-line)", background: "var(--green-soft)" } : {}}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: "#e7f0e6", color: "#3d6b47", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{i + 1}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--green-dark)" }}>
                    {p.standardBg || p.standardEn || L("Нов стандарт", "New standard")}
                  </span>
                  {p.orig === null && (
                    <span className="text-xs rounded-full px-2" style={{ background: "#e3eeda", color: "#456b2c", fontWeight: 700 }}>{L("нов", "new")}</span>
                  )}
                  <div style={{ marginLeft: "auto" }}>
                    <RowCtl
                      onUp={() => setParams((s) => move(s, i, -1))}
                      onDown={() => setParams((s) => move(s, i, 1))}
                      onDel={() => delParam(i)}
                      canUp={i > 0}
                      canDown={i < params.length - 1}
                      canDel={params.length > 1}
                      delTitle={L("Премахни стандарта", "Remove the standard")}
                      lastTitle={L("Схемата трябва да има поне един стандарт", "The scheme needs at least one standard")}
                    />
                  </div>
                </div>
                {/* fields grouped by WHERE they end up — the map the old form lacked */}
                <DestGroup title={L("Какво виждат лабораториите → Покана §2 · заявка стъпка 3", "What labs see → Invitation §2 · заявка step 3")}>
                  <FieldS id={`p${p.uid}-stdBg`} label={L("Код на стандарта + метод (БГ)", "Standard code + method (BG)")} value={p.standardBg}
                    placeholder={L("БДС EN 1097-6, т. 7 (Метод с телена кошница)", "…")}
                    onChange={(v) => setParams((s) => patchRow(s, i, { standardBg: v }))} />
                  <FieldS label={L("Код на стандарта + метод (EN)", "Standard code + method (EN)")} value={p.standardEn}
                    placeholder="EN 1097-6, cl. 7 (Wire basket method)"
                    onChange={(v) => setParams((s) => patchRow(s, i, { standardEn: v }))} />
                  <FieldS id={`p${p.uid}-chBg`} label={L("Характеристика + бележка за определянията (БГ)", "Characteristic + determinations note (BG)")} value={p.characteristicBg}
                    placeholder={L("Абсорбция на вода, WA24 (три определяния)", "…")}
                    onChange={(v) => setParams((s) => patchRow(s, i, { characteristicBg: v }))} />
                  <FieldS label={L("Характеристика + бележка (EN)", "Characteristic + note (EN)")} value={p.characteristicEn}
                    placeholder="Water absorption, WA24 (three determinations)"
                    onChange={(v) => setParams((s) => patchRow(s, i, { characteristicEn: v }))} />
                </DestGroup>
                <DestGroup title={L("Само в Плана §6 и Доклада — лабораториите НЕ го виждат в заявката", "Plan §6 & Report only — labs do NOT see this in the заявка")}>
                  <FieldS id={`p${p.uid}-rgBg`} label={L("Обхват на очакваните стойности (БГ)", "Range of expected values (BG)")} value={p.rangeBg}
                    placeholder={L("(0,1 ÷ 3,0) %", "…")}
                    onChange={(v) => setParams((s) => patchRow(s, i, { rangeBg: v }))} />
                  <FieldS label={L("Обхват (EN)", "Range (EN)")} value={p.rangeEn} placeholder="(0.1 ÷ 3.0) %"
                    onChange={(v) => setParams((s) => patchRow(s, i, { rangeEn: v }))} />
                  <FieldS id={`p${p.uid}-spBg`} label={L("Проби (БГ)", "Specimens (BG)")} value={p.specimensBg} placeholder={L("3 блокчета", "…")}
                    onChange={(v) => setParams((s) => patchRow(s, i, { specimensBg: v }))} />
                  <FieldS label={L("Проби (EN)", "Specimens (EN)")} value={p.specimensEn} placeholder="3 blocks"
                    onChange={(v) => setParams((s) => patchRow(s, i, { specimensEn: v }))} />
                </DestGroup>
                <DestGroup title={L("Вътрешно — Статистически проект и оценките (z)", "Internal — Statistical project & the z-scores")} cols="240px">
                  <FieldS label={L("σpt,min — долен праг за σ (по избор)", "σpt,min — proficiency-SD floor (optional)")} value={p.sigma} placeholder={L("напр. 0,05", "e.g. 0.05")}
                    onChange={(v) => setParams((s) => patchRow(s, i, { sigma: v }))} />
                </DestGroup>
                {/* live previews — click a part to jump to its field */}
                <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <PreviewApply
                    label={L("Заявката (стъпка 3):", "The заявка (step 3):")}
                    standard={p.standardBg}
                    characteristic={p.characteristicBg}
                    onStd={() => document.getElementById(`p${p.uid}-stdBg`)?.focus()}
                    onChar={() => document.getElementById(`p${p.uid}-chBg`)?.focus()}
                  />
                  <PreviewPlan
                    label={L("Планът (§6):", "The Plan (§6):")}
                    heads={[L("Метод на изпитване", "Test method"), L("Характеристика", "Characteristic"), L("Обхват", "Range"), L("Проби", "Specimens")]}
                    standard={p.standardBg} characteristic={p.characteristicBg} range={p.rangeBg} specimens={p.specimensBg}
                    onCells={[
                      () => document.getElementById(`p${p.uid}-stdBg`)?.focus(),
                      () => document.getElementById(`p${p.uid}-chBg`)?.focus(),
                      () => document.getElementById(`p${p.uid}-rgBg`)?.focus(),
                      () => document.getElementById(`p${p.uid}-spBg`)?.focus(),
                    ]}
                  />
                </div>
                <input type="hidden" name={`param_${i}_orig`} value={p.orig === null ? "" : String(p.orig)} />
                <input type="hidden" name={`param_${i}_stdBg`} value={p.standardBg} />
                <input type="hidden" name={`param_${i}_stdEn`} value={p.standardEn} />
                <input type="hidden" name={`param_${i}_chBg`} value={p.characteristicBg} />
                <input type="hidden" name={`param_${i}_chEn`} value={p.characteristicEn} />
                <input type="hidden" name={`param_${i}_rgBg`} value={p.rangeBg} />
                <input type="hidden" name={`param_${i}_rgEn`} value={p.rangeEn} />
                <input type="hidden" name={`param_${i}_spBg`} value={p.specimensBg} />
                <input type="hidden" name={`param_${i}_spEn`} value={p.specimensEn} />
                <input type="hidden" name={`param_${i}_sigmaMin`} value={p.sigma} />
              </div>
            ))}
          </div>
          <button type="button" className="btn mt-3" onClick={addParam} style={{ borderColor: "var(--green-line)", color: "var(--green-dark)" }}>
            ＋ {L("Добави стандарт", "Add standard")}
          </button>
        </>
      )}

      {/* ── Advanced (the calibration fields live in the MAIN section above) ── */}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-bold py-2" style={{ color: "var(--green-dark)" }}>
          {init.prices.length
            ? L("Разширени настройки (мин. участници · цени)", "Advanced settings (min. participants · prices)")
            : L("Разширени настройки (мин. участници)", "Advanced settings (min. participants)")}
        </summary>

        <div className="mt-2 mb-4" style={{ maxWidth: 240 }}>
          <Field label={L("Минимален брой участници", "Minimum participants")} name="minParticipants" def={String(init.minParticipants)} />
        </div>

        {init.prices.length > 0 && (
          <>
            <SectionTitle>{L("Цени (§21)", "Prices (§21)")}</SectionTitle>
            <div className="grid gap-2">
              {init.prices.map((pr, i) => (
                <div key={i} className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 120px 120px" }}>
                  <Field label={L("Характеристика (БГ)", "Characteristic (BG)")} name={`price_${i}_chBg`} def={pr.characteristicBg} />
                  <Field label={L("Характеристика (EN)", "Characteristic (EN)")} name={`price_${i}_chEn`} def={pr.characteristicEn} />
                  <Field label={L("Първа проба", "First sample")} name={`price_${i}_first`} def={pr.first} />
                  <Field label={L("Всяка следваща", "Each additional")} name={`price_${i}_add`} def={pr.additional} />
                </div>
              ))}
            </div>
          </>
        )}
      </details>

      <SaveBar id={init.id} label={L("Запази промените", "Save changes")} cancel={L("Отказ", "Cancel")} />
    </form>
  );
}
