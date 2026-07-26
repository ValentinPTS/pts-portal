"use client";

import { useMemo, useState } from "react";
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

function FieldS({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={inputStyle} />
    </label>
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

  const uidSeq = useMemo(() => ({ n: 0 }), []);
  const nextUid = () => ++uidSeq.n;

  const [sched, setSched] = useState<SchedRow[]>(() => init.schedule.map((s) => ({ ...s, uid: nextUid() })));
  const [params, setParams] = useState<ParamRow[]>(() =>
    init.parameters.map((p, i) => ({ ...p, sigma: p.sigmaMin != null ? String(p.sigmaMin) : "", uid: nextUid(), orig: i }))
  );
  const [status, setStatus] = useState<SchemeStatus>(init.status);
  // controlled (not defaultChecked): the checkbox unmounts while status is
  // "open", and an uncontrolled remount would silently revert the owner's toggle
  const [announced, setAnnounced] = useState(init.announced);
  const [copied, setCopied] = useState(false);

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

      {/* ── Object + standards ────────────────────────────────────── */}
      <SectionTitle hint={L("Обектът е заглавието над стандартите в заявката; всеки стандарт става поле „брой участия“ в стъпка 3 на заявката.",
                            "The object is the heading above the standards in the apply wizard; every standard becomes a “participations” box in its step 3.")}>
        {L("Обект и стандарти за участие", "Object & standards for participation")}
      </SectionTitle>
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label={L("Обект (БГ)", "Object (BG)")} name="objectBg" def={init.objectBg} />
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
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <FieldS label={L("Стандарт (БГ)", "Standard (BG)")} value={p.standardBg} onChange={(v) => setParams((s) => patchRow(s, i, { standardBg: v }))} />
              <FieldS label={L("Стандарт (EN)", "Standard (EN)")} value={p.standardEn} onChange={(v) => setParams((s) => patchRow(s, i, { standardEn: v }))} />
              <FieldS label={L("Характеристика (БГ)", "Characteristic (BG)")} value={p.characteristicBg} onChange={(v) => setParams((s) => patchRow(s, i, { characteristicBg: v }))} />
              <FieldS label={L("Характеристика (EN)", "Characteristic (EN)")} value={p.characteristicEn} onChange={(v) => setParams((s) => patchRow(s, i, { characteristicEn: v }))} />
              <FieldS label={L("Обхват (БГ)", "Range (BG)")} value={p.rangeBg} onChange={(v) => setParams((s) => patchRow(s, i, { rangeBg: v }))} />
              <FieldS label={L("Обхват (EN)", "Range (EN)")} value={p.rangeEn} onChange={(v) => setParams((s) => patchRow(s, i, { rangeEn: v }))} />
              <FieldS label={L("Проби (БГ)", "Specimens (BG)")} value={p.specimensBg} onChange={(v) => setParams((s) => patchRow(s, i, { specimensBg: v }))} />
              <FieldS label={L("Проби (EN)", "Specimens (EN)")} value={p.specimensEn} onChange={(v) => setParams((s) => patchRow(s, i, { specimensEn: v }))} />
              <FieldS label={L("σpt,min — долен праг за σ (по избор)", "σpt,min — proficiency-SD floor (optional)")} value={p.sigma} onChange={(v) => setParams((s) => patchRow(s, i, { sigma: v }))} />
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

      {/* ── Advanced ──────────────────────────────────────────────── */}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-bold py-2" style={{ color: "var(--green-dark)" }}>
          {L("Разширени настройки (мин. участници · цени", "Advanced settings (min. participants · prices")}
          {init.calibration ? L(" · калибриране)", " · calibration)") : ")"}
        </summary>

        <div className="mt-2 mb-4" style={{ maxWidth: 240 }}>
          <Field label={L("Минимален брой участници", "Minimum participants")} name="minParticipants" def={String(init.minParticipants)} />
        </div>

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

        {init.calibration && (
          <>
            <SectionTitle>{L("Калибриране", "Calibration")}</SectionTitle>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <Field label={L("Величина (БГ)", "Quantity (BG)")} name="cal_quantityBg" def={init.calibration.quantityBg} />
              <Field label={L("Величина (EN)", "Quantity (EN)")} name="cal_quantityEn" def={init.calibration.quantityEn} />
              <Field label={L("Единица", "Unit")} name="cal_unit" def={init.calibration.unit} />
            </div>
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label={L("Устройство (БГ)", "Device (BG)")} name="cal_deviceBg" def={init.calibration.deviceBg} />
              <Field label={L("Устройство (EN)", "Device (EN)")} name="cal_deviceEn" def={init.calibration.deviceEn} />
            </div>
            <div className="grid gap-3 mt-3">
              <Field label={L("Точки на калибриране (със запетая)", "Calibration points (comma-separated)")} name="cal_points" def={init.calibration.points.join(", ")} />
            </div>
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label={L("Посоки БГ (със запетая)", "Directions BG (comma-separated)")} name="cal_dirBg" def={init.calibration.directionsBg.join(", ")} />
              <Field label={L("Посоки EN (със запетая)", "Directions EN (comma-separated)")} name="cal_dirEn" def={init.calibration.directionsEn.join(", ")} />
              <Field label={L("Референтна лаборатория (БГ)", "Reference lab (BG)")} name="cal_refLabBg" def={init.calibration.referenceLabBg} />
              <Field label={L("Референтна лаборатория (EN)", "Reference lab (EN)")} name="cal_refLabEn" def={init.calibration.referenceLabEn} />
              <Field label={L("Местоположение (БГ)", "Location (BG)")} name="cal_refLocBg" def={init.calibration.referenceLabLocBg} />
              <Field label={L("Location (EN)", "Reference lab location (EN)")} name="cal_refLocEn" def={init.calibration.referenceLabLocEn} />
              <Field label={L("Метод (БГ)", "Method (BG)")} name="cal_methodBg" def={init.calibration.methodBg} />
              <Field label={L("Метод (EN)", "Method (EN)")} name="cal_methodEn" def={init.calibration.methodEn} />
            </div>
          </>
        )}
      </details>

      <SaveBar id={init.id} label={L("Запази промените", "Save changes")} cancel={L("Отказ", "Cancel")} />
    </form>
  );
}
