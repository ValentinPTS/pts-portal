"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { updateSchemeAction } from "@/lib/actions";
import CoverPhotoField from "@/components/CoverPhotoField";
import { useLang } from "@/components/LangProvider";
import { calibrationSlotsBroken, effectiveDirections } from "@/lib/param-remap";
import { ONLINE_APPLICATIONS_OPEN } from "@/lib/online-applications";
import type { CalibrationData, Parameter, PriceRow, ScheduleItem, SchemeStatus } from "@/lib/types";
import { markerLabels, readSchemeNumber, schemeMarkers, statedByNumber, type Activity, type SchemeKind } from "@/lib/scheme-number";
import { STATE_LABEL } from "@/lib/lifecycle-model";
import { ENGINE_FIELDS, characteristicLabel } from "@/lib/characteristics-model";
import { DEFAULT_SHARE_PCT, fmtEur, fullPrice, parseCents, parseShare, sharePrice, type Commercial } from "@/lib/commercial-model";
import { SHIPMENT_SUGGESTIONS, MAX_ITEMS, type SchemeLists } from "@/lib/scheme-lists-model";
import { markState } from "@/lib/accreditation-mark";
import type { M1Block } from "@/lib/m1-render";
import { META_GAP_TEXT, type ExternalProvider } from "@/lib/scheme-meta";

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
  /** the save count the form was opened at (UM-2) */
  editRev?: number;
  /** who may read it but not save it (an auditor, the quality manager…): no save offered (UR-1) */
  readOnly?: boolean;
  number: string;
  type: "T" | "C";
  // what the number carries, as kept (Реш. 102, 3.1)
  kind?: SchemeKind;
  activity?: Activity;
  accredited?: boolean;
  titleEn: string;
  titleBg: string;
  objectEn: string;
  objectBg: string;
  status: SchemeStatus;
  coverImage?: string;
  coverImageWidth?: number;
  coverImageAlign?: "left" | "center" | "right";
  minParticipants: number;
  schedule: ScheduleItem[];
  parameters: Parameter[];
  prices: PriceRow[];
  calibration?: CalibrationData;
  // Which "<dir>:<point>" slots currently hold entered results. Passed in so the
  // editor can WARN before submitting — the server would otherwise have to refuse
  // the save and send him back here with every other edit on this form lost.
  calDataSlots?: [number, number][];
  staticReminder?: { bg: string; en: string };
  commercial?: Commercial;
  /** the lists in force (a calibration scheme's Instruction checks until it saves its own) */
  lists?: SchemeLists;
  /** a refusal came back for a field in «Разширени настройки» — open it (3.7 review) */
  openAdvanced?: boolean;
  /** certificates are issued: the number and its status stay (3.9 review) */
  certsIssued?: boolean;
  /** a calibration scheme on M1: its own texts for the documents, with what they hold (3.10) */
  m1Blocks?: (M1Block & { bg: string; en: string })[];
  /** the design data and the external providers (3.13) */
  period?: string;
  externalProviders?: ExternalProvider[];
  designApproved?: string;
  reportDate?: string;
  /** what the plan's point 3 names with no list kept (3.13 review) */
  legacyProviders?: Omit<ExternalProvider, "id">[];
  /** what 2.0 still needs, or holds in a way that proves nothing */
  metaGaps?: string[];
  /** the plan is saved in the document editor — a list added here is not in it */
  planSaved?: boolean;
}

type SchedRow = ScheduleItem & { uid: number };
// sigma is kept as the RAW STRING while editing (parsed only on the server):
// parsing per keystroke through a controlled input eats decimal separators —
// typing "0,5" would collapse to 5.
// the 3.6 numbers too (step, guard limits, determinations) — raw strings while editing
type ParamRow = Omit<Parameter, "sigmaMin"> & { uid: number; orig: number | null; sigma: string; stepS: string; gminS: string; gmaxS: string; detS: string };
const numS = (n: number | undefined) => (n === undefined || n === null ? "" : String(n));

const inputCls = "w-full rounded px-2 py-1 text-sm";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;
// This page opens a scheme or takes it back to draft; every later state is an act on
// the scheme page (part 3.2, lib/lifecycle-model) — the first announcement, the start
// of processing, the report, closing the records.
const STATUSES: { value: SchemeStatus; bg: string; en: string }[] = [
  { value: "draft", bg: "Чернова", en: "Draft" },
  { value: "open", bg: "Отворена", en: "Open" },
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
    init.parameters.map((p, i) => ({ ...p, sigma: p.sigmaMin != null ? String(p.sigmaMin) : "", stepS: numS(p.step), gminS: numS(p.guardMin), gmaxS: numS(p.guardMax), detS: numS(p.determinations), uid: i, orig: i }))
  );
  const [status, setStatus] = useState<SchemeStatus>(init.status);
  const [copied, setCopied] = useState(false);
  // the number as typed: what it states is shown as the number's, the rest is chosen
  const [num, setNum] = useState(init.number);

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
    refTolerance: init.calibration?.refTolerance ?? "",
    tempMin: init.calibration?.tempMin ?? "",
    tempMax: init.calibration?.tempMax ?? "",
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
      uid: nextUid(), orig: null, sigma: "", stepS: "", gminS: "", gmaxS: "", detS: "",
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

  // Editing a calibration point that already carries results cannot silently move
  // those results onto another load point. Rather than refusing the save (which
  // would throw away every other edit on this form), warn here, name exactly which
  // results go, and post the confirmation with the save.
  const confirmRef = useRef<HTMLInputElement>(null);
  function guardCalibrationEdit(e: React.FormEvent<HTMLFormElement>) {
    if (confirmRef.current) confirmRef.current.value = "";
    const oldCal = init.calibration;
    if (!isCal || !oldCal || !init.calDataSlots?.length) return;
    const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const broken = calibrationSlotsBroken(
      init.calDataSlots,
      oldCal.points, split(cal.points),
      oldCal.directionsEn, split(cal.dirEn),
    );
    if (!broken.length) return;
    const dirs = effectiveDirections(oldCal.directionsEn);
    const list = [...new Set(broken.map(([d, p]) =>
      `${dirs[d] ?? `#${d + 1}`} @ ${oldCal.points[p] ?? `#${p + 1}`}${oldCal.unit ? ` ${oldCal.unit}` : ""}`,
    ))].join("\n  • ");
    const okToGo = window.confirm(L(
      `Променяте точки/посоки на калибриране, за които ВЕЧЕ има въведени резултати:\n\n  • ${list}\n\n`
      + "Тези резултати ще бъдат ИЗЧИСТЕНИ — оценките Eₙ не могат да се прехвърлят върху друга точка на натоварване.\n\n"
      + "Да продължа ли?",
      `You are changing calibration points/directions that ALREADY carry entered results:\n\n  • ${list}\n\n`
      + "Those results will be CLEARED — an Eₙ score cannot be carried over to a different load point.\n\n"
      + "Go ahead?",
    ));
    if (!okToGo) { e.preventDefault(); return; }
    if (confirmRef.current) confirmRef.current.value = "1";
  }

  return (
    <form action={updateSchemeAction} onSubmit={guardCalibrationEdit}>
      <input type="hidden" name="id" value={init.id} />
      <input type="hidden" name="editRev" value={init.editRev ?? 0} />
      <input ref={confirmRef} type="hidden" name="calslotsConfirm" defaultValue="" />

      {/* ── Essentials ─────────────────────────────────────────────── */}
      <SectionTitle>{L("Основни данни", "Basics")}</SectionTitle>
      <label className="block mb-3">
        <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>
          {L("Официален номер (PTS №) — на всеки документ; определя и папката по година", "Official number (PTS №) — on every document; also sets the year folder")}
        </span>
        <input
          name="number"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          className="rounded px-3 py-2 text-sm font-bold"
          style={{ border: "1px solid var(--green-line)", background: "var(--green-soft)", color: "var(--green-dark)", maxWidth: 320, fontFamily: "var(--font-sans)" }}
        />
      </label>
      <NumberMarkers number={num} init={init} L={L} lang={lang === "bg" ? "bg" : "en"} />
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
      <input type="hidden" name="statusFrom" value={init.status} />
      {init.status !== "draft" && init.status !== "open" ? (
        <div className="card p-4" data-state-elsewhere>
          <p className="text-sm">
            {L("Състояние: ", "State: ")}<b>{L(STATE_LABEL[init.status].bg, STATE_LABEL[init.status].en)}</b>.{" "}
            {L("Оттук нататък състоянието се сменя с актовете в «Етапи» на страницата на схемата.", "From here on the state changes by the acts under «Stages» on the scheme page.")}{" "}
            <Link href={`/schemes/${init.id}#stages`} style={{ color: "var(--green-dark)", fontWeight: 700 }}>{L("Към етапите →", "To the stages →")}</Link>
          </p>
        </div>
      ) : (
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
        {status === "open" && !ONLINE_APPLICATIONS_OPEN ? (
          // part 0.4: open = accepting PDF applications; the portal form is off
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            {L("Отворена: лабораториите кандидатстват с PDF формуляра, а Вие ги добавяте от «Участници». Онлайн заявките в портала засега са изключени.",
               "Open: laboratories apply with the PDF form and you add them under «Participants». Online applications in the portal are switched off for now.")}
          </p>
        ) : status === "open" ? (
          <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
            <span style={{ color: "var(--green-dark)", fontWeight: 700 }}>
              {L("Схемата приема заявки:", "The scheme is accepting applications:")}
            </span>
            <code className="rounded px-2 py-1" style={{ background: "#fff", border: "1px solid var(--green-line)" }}>/apply/{init.id}</code>
            <button type="button" className="btn" style={{ fontSize: 12.5, height: 30, padding: "0 10px" }} onClick={copyLink}>
              {copied ? L("Копирано ✓", "Copied ✓") : L("Копирай линка", "Copy link")}
            </button>
          </div>
        ) : status === "draft" ? (
          // Реш. 147: a scheme that has not started is invisible to labs and the
          // public — there is no "announce while draft" any more (part 0.3).
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            {L("Докато е чернова, схемата не се вижда от лабораториите и от публиката — нито в списък, нито на адрес.",
               "While a draft, the scheme is invisible to laboratories and the public — in no list and at no address.")}
          </p>
        ) : null}
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          {L("Следващите състояния — първото обявяване, обработката, докладът — са актове в «Етапи» на страницата на схемата.", "The later states — the first announcement, processing, the report — are acts under «Stages» on the scheme page.")}
        </p>
      </div>
      )}

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
            <DestGroup title={L("Критерии за прегледа след срока (по избор) → 6.7", "Criteria for the review after the deadline (optional) → 6.7")}>
              <FieldS label={L("Допуск на реализираната референтна стойност (±, в единицата)", "Tolerance of the realised reference value (±, in the unit)")} value={cal.refTolerance} placeholder="0,5" onChange={(v) => setCal((c) => ({ ...c, refTolerance: v }))} />
              <FieldS label={L("Температура в измервателния обем — от (°C)", "Temperature in the measurement volume — from (°C)")} value={cal.tempMin} placeholder="20" onChange={(v) => setCal((c) => ({ ...c, tempMin: v }))} />
              <FieldS label={L("Температура в измервателния обем — до (°C)", "Temperature in the measurement volume — to (°C)")} value={cal.tempMax} placeholder="25" onChange={(v) => setCal((c) => ({ ...c, tempMax: v }))} />
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
            <input type="hidden" name="cal_refTolerance" value={cal.refTolerance} />
            <input type="hidden" name="cal_tempMin" value={cal.tempMin} />
            <input type="hidden" name="cal_tempMax" value={cal.tempMax} />
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
              <div key={p.uid} data-char-row={i} className="card p-3" style={p.orig === null ? { borderColor: "var(--green-line)", background: "var(--green-soft)" } : {}}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: "#e7f0e6", color: "#3d6b47", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{i + 1}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--green-dark)" }}>
                    {p.standardBg || p.standardEn || L("Нов стандарт", "New standard")}
                  </span>
                  {p.orig === null && (
                    <span className="text-xs rounded-full px-2" style={{ background: "#e3eeda", color: "#456b2c", fontWeight: 700 }}>{L("нов", "new")}</span>
                  )}
                  {p.id && <span className="text-xs font-mono" data-char-id={p.id} title={L("Постоянен идентификатор — не се сменя", "Stable id — it never changes")} style={{ color: "var(--muted)" }}>{p.id}</span>}
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
                {/* 3.6: for the processing — what a lab is shown, and what only 2.0 reads */}
                <DestGroup title={L("За обработката — единица, стъпка, защитни граници, U, група, определяния", "For the processing — unit, step, guard limits, U, group, determinations")} cols="repeat(auto-fit, minmax(130px, 1fr))">
                  <FieldS label={L("Мерна единица", "Unit")} value={p.unit ?? ""} placeholder="%" onChange={(v) => setParams((s) => patchRow(s, i, { unit: v }))} />
                  <FieldS label={L("Стъпка на докладване", "Reporting step")} value={p.stepS} placeholder="0,1" onChange={(v) => setParams((s) => patchRow(s, i, { stepS: v }))} />
                  <FieldS label={L("Долна защитна граница", "Lower guard limit")} value={p.gminS} placeholder="0" onChange={(v) => setParams((s) => patchRow(s, i, { gminS: v }))} />
                  <FieldS label={L("Горна защитна граница", "Upper guard limit")} value={p.gmaxS} placeholder="10" onChange={(v) => setParams((s) => patchRow(s, i, { gmaxS: v }))} />
                  <label className="block">
                    <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Брой определяния (до 3)", "Determinations (up to 3)")}</span>
                    <select value={p.detS} onChange={(e) => setParams((s) => patchRow(s, i, { detS: e.target.value }))} className={inputCls} style={inputStyle}>
                      <option value="">—</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
                    </select>
                  </label>
                  <FieldS label={L("Статистическа група (БГ)", "Statistical group (BG)")} value={p.group ?? ""} onChange={(v) => setParams((s) => patchRow(s, i, { group: v }))} />
                  <FieldS label={L("Статистическа група (EN)", "Statistical group (EN)")} value={p.groupEn ?? ""} onChange={(v) => setParams((s) => patchRow(s, i, { groupEn: v }))} />
                  <label className="flex items-center gap-2 text-sm" style={{ paddingTop: 16 }}>
                    <input type="checkbox" checked={!!p.uRequired} onChange={(e) => setParams((s) => patchRow(s, i, { uRequired: e.target.checked }))} />
                    {L("U е задължителна", "U is required")}
                  </label>
                </DestGroup>
                <details className="mb-2" data-engine-fields>
                  <summary className="text-xs font-bold cursor-pointer" style={{ color: "var(--green-dark)" }}>{L("Полета за PTS_Analysis 2.0 — пазят се както са въведени и не се показват на лабораториите", "Fields for PTS_Analysis 2.0 — kept as entered, never shown to laboratories")}</summary>
                  <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                    {ENGINE_FIELDS.map((k) => (
                      <FieldS key={k} label={k} value={p.engine?.[k] ?? ""} onChange={(v) => setParams((s) => patchRow(s, i, { engine: { ...(s[i].engine ?? {}), [k]: v } }))} />
                    ))}
                  </div>
                </details>
                <div className="text-xs mb-2" data-lab-view style={{ color: "var(--muted)" }}>
                  {L("Лабораторията вижда: ", "The laboratory sees: ")}
                  <b style={{ color: "var(--ink)" }}>{characteristicLabel(p, lang === "bg" ? "bg" : "en")}</b>
                  {p.unit ? ` · ${p.unit}` : ""}
                  {p.detS ? ` · ${L(`${p.detS} определяния`, `${p.detS} determinations`)}` : ""}
                  {p.uRequired ? ` · ${L("U задължителна", "U required")}` : ""}
                </div>
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
                {/* the stable id: the save matches the row by it, not by its place (3.6 review) */}
                <input type="hidden" name={`param_${i}_id`} value={p.id ?? ""} />
                <input type="hidden" name={`param_${i}_stdBg`} value={p.standardBg} />
                <input type="hidden" name={`param_${i}_stdEn`} value={p.standardEn} />
                <input type="hidden" name={`param_${i}_chBg`} value={p.characteristicBg} />
                <input type="hidden" name={`param_${i}_chEn`} value={p.characteristicEn} />
                <input type="hidden" name={`param_${i}_rgBg`} value={p.rangeBg} />
                <input type="hidden" name={`param_${i}_rgEn`} value={p.rangeEn} />
                <input type="hidden" name={`param_${i}_spBg`} value={p.specimensBg} />
                <input type="hidden" name={`param_${i}_spEn`} value={p.specimensEn} />
                <input type="hidden" name={`param_${i}_sigmaMin`} value={p.sigma} />
                <input type="hidden" name={`param_${i}_unit`} value={p.unit ?? ""} />
                <input type="hidden" name={`param_${i}_step`} value={p.stepS} />
                <input type="hidden" name={`param_${i}_gmin`} value={p.gminS} />
                <input type="hidden" name={`param_${i}_gmax`} value={p.gmaxS} />
                <input type="hidden" name={`param_${i}_det`} value={p.detS} />
                <input type="hidden" name={`param_${i}_group`} value={p.group ?? ""} />
                <input type="hidden" name={`param_${i}_groupEn`} value={p.groupEn ?? ""} />
                <input type="hidden" name={`param_${i}_ureq`} value={p.uRequired ? "on" : ""} />
                {ENGINE_FIELDS.map((k) => <input key={k} type="hidden" name={`param_${i}_eng_${k}`} value={p.engine?.[k] ?? ""} />)}
              </div>
            ))}
          </div>
          <button type="button" className="btn mt-3" onClick={addParam} style={{ borderColor: "var(--green-line)", color: "var(--green-dark)" }}>
            ＋ {L("Добави стандарт", "Add standard")}
          </button>
        </>
      )}

      {/* ── Advanced (the calibration fields live in the MAIN section above) ── */}
      <details className="mt-8" open={init.openAdvanced || undefined}>
        <summary className="cursor-pointer text-sm font-bold py-2" style={{ color: "var(--green-dark)" }}>
          {init.prices.length
            ? L("Разширени настройки (мин. участници · цени)", "Advanced settings (min. participants · prices)")
            : L("Разширени настройки (мин. участници)", "Advanced settings (min. participants)")}
        </summary>

        <CommercialFields init={init.commercial} min={init.minParticipants} characteristics={params.length} L={L} lang={lang === "bg" ? "bg" : "en"} />
        <ListsFields init={init.lists} L={L} />
        {init.m1Blocks && <M1Texts blocks={init.m1Blocks} L={L} />}
        <MetaFields init={init} L={L} />
        {/* ONE static reminder per scheme (А3, 3.6) — shown to the participants */}
        <div className="grid gap-3 mb-4" data-static-reminder style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Напомняне към участниците (БГ) — едно за схемата", "Reminder to the participants (BG) — one per scheme")}</span>
            <textarea name="staticReminderBg" defaultValue={init.staticReminder?.bg ?? ""} maxLength={600} rows={2} className={inputCls} style={inputStyle} /></label>
          <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Напомняне (EN)", "Reminder (EN)")}</span>
            <textarea name="staticReminderEn" defaultValue={init.staticReminder?.en ?? ""} maxLength={600} rows={2} className={inputCls} style={inputStyle} /></label>
        </div>

        {init.prices.length > 0 && (
          <>
            <SectionTitle>{L("Цени (§21)", "Prices (§21)")}</SectionTitle>
            <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>{L("Тази таблица се печата в документите така, както е написана. Изчислението на цените ползва полетата «Цени и участници» по-горе.", "This table is printed in the documents as written. The price calculation uses the «Prices and participants» fields above.")}</p>
            {init.commercial?.base !== undefined && (
              <p className="text-xs mb-2" data-two-price-sources style={{ background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12", borderRadius: 6, padding: "4px 8px" }}>
                {L("Цените са на две места: тази таблица (в документите) и «Цени и участници» (за изчислението). Проверете, че казват едно и също.", "The prices are in two places: this table (in the documents) and «Prices and participants» (for the calculation). Check that they say the same.")}
              </p>
            )}
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

      {init.readOnly
        ? <div data-read-only className="card p-3 mt-7 text-sm" style={{ color: "var(--muted)" }}>{L("Само за четене: вашата роля не записва данните на схемата.", "Read only: your role does not save the scheme's data.")}</div>
        : <SaveBar id={init.id} label={L("Запази промените", "Save changes")} cancel={L("Отказ", "Cancel")} />}
    </form>
  );
}

// The design data and the external providers (part 3.13): what PTS_Analysis 2.0's
// Scheme_meta and External_providers need. The dates come from the lifecycle (stage 4,
// the report act) and are shown, not typed; the period is written as the report
// writes it; the providers are who supplies what — the plan's point 3 when listed.
type ProvRow = ExternalProvider & { key: number };
let provKey = 0;
function MetaFields({ init, L }: { init: SchemeEditorInit; L: (bg: string, en: string) => string }) {
  const [rows, setRows] = useState<ProvRow[]>(() => (init.externalProviders ?? []).map((p) => ({ ...p, key: ++provKey })));
  const set = (key: number, k: keyof ExternalProvider, v: string) => setRows((x) => x.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
  const shown = (v?: string) => (v ? v.split("-").reverse().join(".") : L("— още няма —", "— not yet —"));
  return (
    <div className="mt-2 mb-4" data-meta>
      <input type="hidden" name="metaPosted" value="1" />
      <SectionTitle hint={L("Каквото PTS_Analysis 2.0 чете за схемата (Scheme_meta, External_providers).", "What PTS_Analysis 2.0 reads about the scheme (Scheme_meta, External_providers).")}>{L("Данни за проекта и външни доставчици", "Design data and external providers")}</SectionTitle>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="text-sm" data-design-approved><span className="block text-xs" style={{ color: "var(--muted)" }}>{L("Статистическият проект утвърден (етап 4)", "Statistical design approved (stage 4)")}</span>{shown(init.designApproved)}</div>
        <div className="text-sm" data-report-date><span className="block text-xs" style={{ color: "var(--muted)" }}>{L("Дата на окончателния доклад", "Date of the final report")}</span>{shown(init.reportDate)}</div>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Период на провеждане — както се изписва в доклада", "Period — as the report writes it")}</span>
          <input name="period" defaultValue={init.period ?? ""} maxLength={120} placeholder={L("напр. март – май 2026", "e.g. March – May 2026")} className={inputCls} style={inputStyle} /></label>
      </div>
      {!!init.metaGaps?.length && (
        <p className="text-xs mt-2" data-meta-gaps style={{ background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12", borderRadius: 6, padding: "4px 8px" }}>
          {L("За PTS_Analysis 2.0 още липсва или не доказва: ", "PTS_Analysis 2.0 still lacks, or holds without proof: ")}{init.metaGaps.map((g) => (META_GAP_TEXT[g] ? L(META_GAP_TEXT[g].bg, META_GAP_TEXT[g].en) : g)).join("; ")}.
        </p>
      )}
      <div className="text-sm font-bold mt-3" style={{ color: "var(--green-dark)" }}>{L("Външни доставчици", "External providers")}</div>
      <p className="text-xs" data-providers-hint style={{ color: "var(--muted)" }}>
        {L("Списъкът е т. 3 на плана и на заповедта — той замества това, което т. 3 показва сега. Без списък т. 3 и листът за 2.0 показват ", "The list is the plan's and the Order's point 3 — it replaces what point 3 shows now. With no list, point 3 and the 2.0 sheet show ")}
        {init.legacyProviders?.length ? init.legacyProviders.map((p) => p.name).join(", ") : L("никого", "nobody")}.
        {init.planSaved && <b> {L("Планът е редактиран в редактора на документи: впишете промяната и там.", "The plan was edited in the document editor: make the change there too.")}</b>}
      </p>
      <input type="hidden" name="provCount" value={rows.length} />
      <div className="grid gap-2 mt-1">
        {rows.map((r, i) => (
          <div key={r.key} className="grid gap-2 items-end" data-provider-row={i} style={{ gridTemplateColumns: "1.2fr 1.2fr 1.3fr 1.3fr auto" }}>
            <input type="hidden" name={`prov_${i}_id`} value={r.id} />
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Наименование", "Name")}</span><input name={`prov_${i}_name`} value={r.name} maxLength={200} onChange={(e) => set(r.key, "name", e.target.value)} className={inputCls} style={inputStyle} /></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Адрес", "Address")}</span><input name={`prov_${i}_address`} value={r.address} maxLength={300} onChange={(e) => set(r.key, "address", e.target.value)} className={inputCls} style={inputStyle} /></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Услуги (БГ)", "Services (BG)")}</span><input name={`prov_${i}_svcBg`} value={r.servicesBg} maxLength={500} onChange={(e) => set(r.key, "servicesBg", e.target.value)} className={inputCls} style={inputStyle} /></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Услуги (EN)", "Services (EN)")}</span><input name={`prov_${i}_svcEn`} value={r.servicesEn} maxLength={500} onChange={(e) => set(r.key, "servicesEn", e.target.value)} className={inputCls} style={inputStyle} /></label>
            <button type="button" className="btn btn-sm" aria-label={L("Премахни доставчика", "Remove the provider")} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn btn-sm" onClick={() => setRows((x) => (x.length >= 20 ? x : [...x, { key: ++provKey, id: "", name: "", address: "", servicesBg: "", servicesEn: "" }]))}>＋ {L("Добави доставчик", "Add a provider")}</button>
        {!rows.length && !!init.legacyProviders?.length && (
          <button type="button" className="btn btn-sm" data-take-legacy onClick={() => setRows(init.legacyProviders!.map((p) => ({ ...p, id: "", key: ++provKey })))}>{L("Вземи от т. 3", "Take from point 3")}</button>
        )}
      </div>
    </div>
  );
}

// A calibration scheme's own texts for its documents on M1 (part 3.10): the points M1
// leaves to each scheme, written here once — the plan, the instruction take them; an
// empty one is a mark «за попълване» there, and the document is not issued until it is
// filled.
function M1Texts({ blocks, L }: { blocks: (M1Block & { bg: string; en: string })[]; L: (bg: string, en: string) => string }) {
  return (
    <div className="mt-2 mb-4" data-m1-texts>
      <input type="hidden" name="m1BlocksPosted" value="1" />
      <SectionTitle hint={L("Точките, които M1 оставя на всяка схема. Празна точка излиза в документа като «[за попълване]» и документът не се издава, докато не е попълнена. Ако документът вече е редактиран в редактора на документи, впишете промяната и там.", "The points M1 leaves to each scheme. An empty one shows in the document as «[to be filled in]», and the document is not issued until it is filled. If the document was already edited in the document editor, make the change there too.")}>{L("Текстове за документите (M1)", "Texts for the documents (M1)")}</SectionTitle>
      <div className="grid gap-3">
        {blocks.map((b) => (
          <div key={b.key} data-m1-block={b.key} className="grid gap-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}><b>{L(b.where.bg, b.where.en)} — {L(b.titleBg, b.titleEn)}</b>{b.guideBg ? <> · {L(b.guideBg, b.guideEn)}</> : null}</span>
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {b.short ? (
                <>
                  <input name={`m1c_${b.key}_bg`} defaultValue={b.bg} maxLength={4000} placeholder="БГ" className={inputCls} style={inputStyle} />
                  <input name={`m1c_${b.key}_en`} defaultValue={b.en} maxLength={4000} placeholder="EN" className={inputCls} style={inputStyle} />
                </>
              ) : (
                <>
                  <textarea name={`m1c_${b.key}_bg`} defaultValue={b.bg} maxLength={4000} rows={3} placeholder="БГ" className={inputCls} style={inputStyle} />
                  <textarea name={`m1c_${b.key}_en`} defaultValue={b.en} maxLength={4000} rows={3} placeholder="EN" className={inputCls} style={inputStyle} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The per-scheme lists (part 3.8): what travels with the objects, what the participant
// checks on receipt (the online Ф 7.3.4-1, 5.6), and «accreditation required» — it
// warns, never refuses (Реш. 108). Rows in both languages; each keeps its id.
type ListRow = { key: number; id: string; bg: string; en: string };
let listKey = 0;
const toRows = (items?: { id: string; bg: string; en: string }[]): ListRow[] => (items ?? []).map((i) => ({ key: ++listKey, ...i }));
function ListEditor({ pfx, title, hint, rows, setRows, suggestions, L }: {
  pfx: "ship" | "rcpt"; title: string; hint: string; rows: ListRow[]; setRows: (f: (r: ListRow[]) => ListRow[]) => void;
  suggestions?: { bg: string; en: string }[]; L: (bg: string, en: string) => string;
}) {
  const add = (bg = "", en = "") => setRows((r) => (r.length >= MAX_ITEMS ? r : [...r, { key: ++listKey, id: "", bg, en }]));
  return (
    <div className="mb-4" data-list={pfx}>
      <div className="text-sm font-bold" style={{ color: "var(--green-dark)" }}>{title}</div>
      <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>{hint}</p>
      <input type="hidden" name={`${pfx}Count`} value={rows.length} />
      <div className="grid gap-2">
        {rows.map((r, i) => (
          <div key={r.key} className="grid gap-2 items-end" data-list-row={i} style={{ gridTemplateColumns: "1fr 1fr auto" }}>
            <input type="hidden" name={`${pfx}_${i}_id`} value={r.id} />
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>БГ</span>
              <input name={`${pfx}_${i}_bg`} value={r.bg} maxLength={200} onChange={(e) => { const v = e.target.value; setRows((x) => x.map((y) => (y.key === r.key ? { ...y, bg: v } : y))); }} className={inputCls} style={inputStyle} /></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>EN</span>
              <input name={`${pfx}_${i}_en`} value={r.en} maxLength={200} onChange={(e) => { const v = e.target.value; setRows((x) => x.map((y) => (y.key === r.key ? { ...y, en: v } : y))); }} className={inputCls} style={inputStyle} /></label>
            <button type="button" className="btn btn-sm" aria-label={L("Премахни реда", "Remove the row")} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn btn-sm" onClick={() => add()} disabled={rows.length >= MAX_ITEMS}>＋ {L("Добави ред", "Add a row")}</button>
        {suggestions?.filter((x) => !rows.some((r) => r.bg === x.bg)).map((x) => (
          <button key={x.bg} type="button" className="btn btn-sm" data-suggest={x.en} onClick={() => add(x.bg, x.en)} style={{ color: "var(--muted)" }}>＋ {L(x.bg, x.en)}</button>
        ))}
      </div>
    </div>
  );
}
function ListsFields({ init, L }: { init?: SchemeLists; L: (bg: string, en: string) => string }) {
  const [ship, setShip] = useState<ListRow[]>(() => toRows(init?.shipmentDocs));
  const [rcpt, setRcpt] = useState<ListRow[]>(() => toRows(init?.receiptChecks));
  return (
    <div className="mt-2 mb-4" data-scheme-lists>
      <input type="hidden" name="listsPosted" value="1" />
      <SectionTitle hint={L("За тази схема. Ползват се при изпращането и в протокола за получаване (Ф 7.3.4-1).", "For this scheme. Used at dispatch and in the receipt protocol (F 7.3.4-1).")}>{L("Списъци на схемата", "Scheme lists")}</SectionTitle>
      <ListEditor pfx="ship" rows={ship} setRows={setShip} suggestions={SHIPMENT_SUGGESTIONS} L={L}
        title={L("Документи към пратката", "Shipment documents")}
        hint={L("Какво пътува с обектите. Изпращащият ги вижда като списък за проверка.", "What travels with the objects. The sender sees them as a checklist.")} />
      <ListEditor pfx="rcpt" rows={rcpt} setRows={setRcpt} L={L}
        title={L("Проверки при получаване", "Receipt checks")}
        hint={L("Какво проверява участникът при получаване, в протокола Ф 7.3.4-1. При калибриране започва с проверките от Инструкцията.", "What the participant checks on receipt, on the F 7.3.4-1 protocol. A calibration scheme starts with its Instruction's checks.")} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="accreditationRequired" defaultChecked={!!init?.accreditationRequired} />
        {L("Изисква се акредитация — само предупреждава, не отказва заявка (Реш. 108)", "Accreditation required — warns only, never refuses an application (Реш. 108)")}
      </label>
    </div>
  );
}

// The scheme's commercial fields (Реш. 153, part 3.7) and its participant numbers, with
// what they make: the full price for 1 and for all the characteristics, and what a
// second and later participation pays — the share OF the full price, shown as a sum
// next to the discount it means, so 40 can never be read as «40 % off».
const centsToInput = (c: number | undefined) => c === undefined ? "" : c % 100 === 0 ? String(c / 100) : `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;
function CommercialFields({ init, min, characteristics, L, lang }: {
  init?: Commercial; min: number; characteristics: number; L: (bg: string, en: string) => string; lang: "bg" | "en";
}) {
  const [base, setBase] = useState(centsToInput(init?.base));
  const [step, setStep] = useState(centsToInput(init?.step));
  const [share, setShare] = useState(init?.sharePct === undefined ? "" : String(init.sharePct).replace(".", ","));
  const c: Commercial = { base: parseCents(base) ?? undefined, step: parseCents(step) ?? undefined };
  // the same reading as the save (3.7 review) — a preview never promises what is refused
  const shRead = share.trim() === "" ? DEFAULT_SHARE_PCT : parseShare(share);
  const shareOk = shRead !== null;
  const sh = shRead ?? DEFAULT_SHARE_PCT;
  const withShare: Commercial = { ...c, sharePct: shareOk ? sh : undefined };
  const ns = [...new Set([1, Math.max(1, characteristics)])];
  const eur = (x: number | null) => (x === null ? "—" : fmtEur(x, lang));
  return (
    <div className="mt-2 mb-4" data-commercial>
      <SectionTitle hint={L("Цените са на схемата, не общи (Реш. 153). Суми в евро.", "Prices belong to the scheme, not a global setting (Реш. 153). Amounts in euro.")}>{L("Цени и участници", "Prices and participants")}</SectionTitle>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Базова цена — за една характеристика, €", "Base price — for one characteristic, €")}</span>
          <input name="com_base" value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Стъпка — за всяка следваща характеристика, €", "Step — for each further characteristic, €")}</span>
          <input name="com_step" value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L(`Второ и следващо участие плаща … % от пълната цена (празно = ${DEFAULT_SHARE_PCT})`, `A 2nd and later participation pays … % of the full price (blank = ${DEFAULT_SHARE_PCT})`)}</span>
          <input name="com_share" value={share} onChange={(e) => setShare(e.target.value)} inputMode="decimal" placeholder={String(DEFAULT_SHARE_PCT)} className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Добавка за доставка до Малта, Кипър и Ирландия, €", "Delivery add-on for Malta, Cyprus and Ireland, €")}</span>
          <input name="com_addon" defaultValue={centsToInput(init?.addOnMtCyIe)} inputMode="decimal" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Минимален брой участници", "Minimum participants")}</span>
          <input name="minParticipants" defaultValue={String(min)} inputMode="numeric" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Максимален брой участници — лабораториите не го виждат", "Maximum participants — not shown to laboratories")}</span>
          <input name="com_max" defaultValue={init?.maxParticipants === undefined ? "" : String(init.maxParticipants)} inputMode="numeric" className={inputCls} style={inputStyle} /></label>
      </div>
      <div className="text-xs mt-2" data-price-preview style={{ color: "var(--muted)" }}>
        {c.base === undefined ? L("Въведете базова цена, за да видите цените.", "Enter a base price to see the prices.") : (
          <>
            {ns.map((n) => (
              <div key={n}>
                {L(`${n} ${n === 1 ? "характеристика" : "характеристики"}: пълна цена ${eur(fullPrice(c, n))}`, `${n} characteristic${n === 1 ? "" : "s"}: full price ${eur(fullPrice(c, n))}`)}
                {shareOk && L(` · второ и следващо участие — ${sh} % от нея = ${eur(sharePrice(withShare, n))} (отстъпка ${+(100 - sh).toFixed(2)} %)`, ` · a 2nd and later participation — ${sh} % of it = ${eur(sharePrice(withShare, n))} (a discount of ${+(100 - sh).toFixed(2)} %)`)}
              </div>
            ))}
            {!shareOk && <div style={{ color: "#8f2f2f" }}>{L("Делът е число над 0 и до 100.", "The share is a number above 0 and up to 100.")}</div>}
          </>
        )}
        <div>{L("Доставката в ЕС (без Малта, Кипър и Ирландия) и на Балканите не се плаща; за другите държави — оферти. При собствен куриер се фактурира само участието.", "Delivery in the EU (without Malta, Cyprus and Ireland) and the Balkans is not charged; other countries — offers. With the participant's own courier only the participation is invoiced.")}</div>
      </div>
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Адрес за собствен куриер (БГ) — празен, докато не се уточни градът", "Own-courier pickup address (BG) — empty until the city is settled")}</span>
          <input name="com_pickupBg" defaultValue={init?.pickupBg ?? ""} maxLength={300} className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{L("Адрес за собствен куриер (EN)", "Own-courier pickup address (EN)")}</span>
          <input name="com_pickupEn" defaultValue={init?.pickupEn ?? ""} maxLength={300} className={inputCls} style={inputStyle} /></label>
      </div>
    </div>
  );
}

// The kind, the activity and the accreditation status (Реш. 102, part 3.1). What the
// number states is the number's — shown, not chosen; the rest PTS chooses here: an
// archive number such as «PTS 23/01» states none of them, a «SIM» one not its kind.
function NumberMarkers({ number, init, L, lang }: { number: string; init: SchemeEditorInit; L: (bg: string, en: string) => string; lang: "bg" | "en" }) {
  const reading = readSchemeNumber(number);
  const stated = statedByNumber(number, init.type);
  // the number's markers over the kept ones; the kept ones where it says nothing
  const fromNumber = schemeMarkers({ number, type: init.type });
  const labels = markerLabels(fromNumber, lang);
  const sel = "rounded px-2 py-1 text-sm";
  // the choices as they stand on the form — the preview below follows them (3.9 review)
  const [kindNow, setKindNow] = useState(init.kind ?? "");
  const [accNow, setAccNow] = useState(init.accredited === undefined ? "" : init.accredited ? "yes" : "NA");
  const box = (key: "kind" | "activity" | "accredited", title: string, control: React.ReactNode) => (
    <label className="block" data-marker={key} data-stated={stated[key] ? "number" : "chosen"}>
      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{title}</span>
      {stated[key] ? (
        <span className="text-sm">
          <b>{labels[key]}</b>{" "}
          <span style={{ color: "var(--muted)" }}>
            {key === "activity" && init.type === "C" && !reading?.activity ? L("— схема за калибриране", "— a calibration scheme") : L("— от номера", "— from the number")}
          </span>
        </span>
      ) : control}
    </label>
  );
  return (
    <div className="card p-3 mb-3" data-number-markers style={{ background: "#fff" }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {box("kind", L("Вид", "Kind"),
          <select name="kind" value={kindNow} onChange={(e) => setKindNow(e.target.value)} className={sel} style={inputStyle}>
            <option value="">{L("— не е посочено —", "— not stated —")}</option>
            <option value="PTS">{L("Изпитване за пригодност (PTS)", "Proficiency testing (PTS)")}</option>
            <option value="ILC">{L("Междулабораторно сравнение (ILC)", "Interlaboratory comparison (ILC)")}</option>
          </select>)}
        {box("activity", L("Дейност", "Activity"),
          <select name="activity" defaultValue={init.activity ?? ""} className={sel} style={inputStyle}>
            <option value="">{L("— не е посочено —", "— not stated —")}</option>
            <option value="T">{L("Изпитване (T)", "Testing (T)")}</option>
            <option value="S">{L("Вземане на проби (S)", "Sampling (S)")}</option>
          </select>)}
        {box("accredited", L("Акредитация", "Accreditation"),
          <select name="accredited" value={accNow} onChange={(e) => setAccNow(e.target.value)} className={sel} style={inputStyle}>
            <option value="">{L("— не е посочено —", "— not stated —")}</option>
            <option value="yes">{L("В обхвата на акредитацията", "Within the accredited scope")}</option>
            <option value="NA">{L("Извън обхвата на акредитацията (NA)", "Outside the accredited scope (NA)")}</option>
          </select>)}
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        {reading
          ? reading.form === "old"
            ? L("Стар номер от архива — приема се както е написан. Каквото номерът не казва, изберете тук.", "An archive number — accepted as written. What the number does not say, choose here.")
            : L("Видът, дейността и NA се вземат от номера и се пазят като отделни полета.", "The kind, the activity and NA are taken from the number and kept as fields of their own.")
          : L("Порталът не разчита този номер: PTS|ILC ГГ/ММ[-NA]-T|S|C-пореден, или стара форма от архива.", "The portal cannot read this number: PTS|ILC YY/MM[-NA]-T|S|C-sequence, or an old archive form.")}
      </p>
      {/* what the documents carry (3.9): the number's status, else the one chosen and saved */}
      {(() => {
        const st = init.certsIssued
          ? markState({ number: init.number, type: init.type, kind: init.kind, accredited: init.accredited })
          : markState({ number, type: init.type, kind: kindNow === "PTS" || kindNow === "ILC" ? kindNow : undefined, accredited: accNow === "" ? undefined : accNow === "yes" });
        if (st === "sim") return <p className="text-xs mt-1" data-mark-state="sim" style={{ color: "var(--muted)" }}>{L("Симулационен кръг: документите не носят знак за акредитация.", "A simulation round: the documents carry no accreditation mark.")}</p>;
        return st === "unset" ? (
          <p className="text-xs mt-1" data-mark-state="unset" style={{ background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12", borderRadius: 6, padding: "4px 8px" }}>
            {L("Статутът на акредитация не е посочен: докладът и сертификатът няма да носят знак за акредитация, докато не го изберете и запазите.", "The accreditation status is not stated: the report and the certificate carry no accreditation mark until you choose it and save.")}
          </p>
        ) : (
          <p className="text-xs mt-1" data-mark-state={st} style={{ color: "var(--muted)" }}>
            {st === "mark"
              ? L("Докладът и сертификатът носят знаците на ILAC-MRA и SNAS с регистрационния номер на акредитацията.", "The report and the certificate carry the ILAC-MRA and SNAS marks with the accreditation's registration number.")
              : L("Без знак за акредитация: докладът и сертификатът казват изрично, че схемата е извън обхвата (NA). Междулабораторното сравнение (ILC) е извън обхвата по определение.", "No accreditation mark: the report and the certificate say explicitly that the scheme is outside the scope (NA). An interlaboratory comparison (ILC) is outside the scope by definition.")}
            {init.certsIssued && <> {L("Издадени са сертификати: номерът и статутът остават такива.", "Certificates are issued: the number and the status stay as they are.")}</>}
          </p>
        );
      })()}
    </div>
  );
}
