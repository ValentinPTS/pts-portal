import type { Submission } from "@/lib/submissions";
import type { ResultRow, CalRow } from "@/lib/results-model";
import type { CharacteristicVersion } from "@/lib/characteristics-model";
import { GENERAL_IDENTITY, GENERAL_FIELDS } from "@/lib/results-model";
import PrintButton from "./PrintButton";
import { inSchemeOrder } from "@/lib/round-export-submissions";
import { sofiaZoneAt } from "@/lib/scheme-dates";

// «Запис на подадените резултати» (plan part 6.8): in the portal path the submitted version IS the
// record of the participant's results — what the Results Sheet Ф 7.2.1-7 was. Printable (A4), as
// submitted (0042 keeps it unchanged): the scheme, the code, the values per characteristic or point
// (N/R, N/A), U and k, the dates, who submitted and when, the receipt, the confirmations, an unlock.
// `showIdentity`: the laboratory's name and the person typed in calibration's general info, and the
// subcontracted part's words — to the laboratory itself and to who sees names in the scheme only.

type Draft = { rows?: Record<string, { d?: string[]; mean?: string; U?: string; k?: string; nr?: boolean }>; period?: { from?: string; to?: string }; general?: Record<string, string>; points?: Record<string, { ref?: string; meas?: string; U?: string; cmc?: string; na?: boolean }> };
type Payload = { kind?: "T" | "C"; draft?: Draft; values?: Record<string, { error?: string | null; nr?: boolean; na?: boolean }>; confirmations?: { truthful?: boolean; subcontracted?: boolean; subcontractedPart?: string; errorsConfirmed?: boolean }; unlock?: { reason?: string; at?: string }; notices?: unknown[] };

const GEN_LABEL: Record<string, [string, string]> = {
  labName: ["Наименование на лабораторията", "Laboratory name"], manufacturer: ["Производител", "Manufacturer"], model: ["Модел", "Model"], serial: ["Сериен номер", "Serial number"],
  dateFrom: ["Измервания от", "Measurements from"], dateTo: ["до", "to"], tempMin: ["Температура min (°C)", "Temperature min (°C)"], tempMax: ["Температура max (°C)", "Temperature max (°C)"],
  otherConditions: ["Други условия", "Other conditions"], method: ["Метод и еталон", "Method and reference equipment"], signedOn: ["Дата", "Date"], signedBy: ["Име", "Name"],
};

export default function ResultsRecord({ lang, scheme, code, version, rows, cRows, unit, showIdentity, showReason = false, snapshot }: {
  lang: "bg" | "en";
  scheme: { number: string; name: string; type: "T" | "C" };
  code: string;
  version: Submission;
  rows: readonly ResultRow[];
  cRows: readonly CalRow[];
  unit?: string;
  showIdentity: boolean;
  /** the unlock's reason — PTS's own words, on PTS's view only (the lab's pages never show it, 6.4) */
  showReason?: boolean;
  /** the configuration the version was submitted against (its `configVersion`) — its rows' names */
  snapshot?: CharacteristicVersion;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const d = (version.data ?? {}) as Payload;
  const draft = d.draft ?? {};
  // the hour in Bulgaria and its zone as EET/EEST (6.4) — never the browser's «Гринуич+2» (UL-7)
  const when = (iso: string) => `${new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))} ${sofiaZoneAt(Date.parse(iso))}`;
  const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join(".") : v || "—");
  const cell = { padding: "4px 8px", borderTop: "1px solid #d9d9d9", verticalAlign: "top" as const };
  const hidden = L("— (вижда се само от лицата с достъп до имената)", "— (shown only to those who see the names)");
  // the rows AS SUBMITTED — the version's own, in their order (never today's configuration: a
  // characteristic or point added, or a determination count changed, after it is not in it — 6.8
  // review); named from the configuration it was submitted against, else today's, else the key
  // …in the scheme's order — the database keeps a version's keys in its own order (6.9 review)
  const rankOf = (k: string) => {
    const r = rows.findIndex((x) => x.key === k); if (r >= 0) return rows[r].index;
    const c = cRows.findIndex((x) => x.key === k); if (c >= 0) return c;
    const sn = (snapshot?.characteristics ?? []).findIndex((x, i) => (x.id ?? `#${i}`) === k); if (sn >= 0) return 10_000 + sn;
    return Number.MAX_SAFE_INTEGER;
  };
  const keys = inSchemeOrder(Object.keys(d.values ?? {}), rankOf);
  const now = new Map(rows.map((r) => [r.key, r] as const)), nowC = new Map(cRows.map((r) => [r.key, r] as const));
  const snapT = new Map((snapshot?.characteristics ?? []).map((c, i) => [c.id ?? `#${i}`, { c, i }] as const));
  const tLabel = (k: string) => {
    const r = now.get(k);
    if (r) return { no: String(r.index + 1), name: r.name[lang], method: r.method[lang], unit: r.unit ?? "" };
    const sn = snapT.get(k);
    if (sn) return { no: String(sn.i + 1), name: lang === "bg" ? sn.c.characteristicBg : sn.c.characteristicEn, method: lang === "bg" ? sn.c.standardBg : sn.c.standardEn, unit: sn.c.unit ?? "" };
    return { no: "", name: k, method: "", unit: "" };
  };
  const cLabel = (k: string) => {
    const r = nowC.get(k);
    if (r) return `${r.nominal} ${unit ?? ""}${r.direction ? ` · ${r.direction[lang]}` : ""}`;
    const id = k.split("|")[0], at = snapshot?.points?.ids?.indexOf(id) ?? -1;
    return at >= 0 ? `${snapshot!.points!.values[at]} ${unit ?? ""}` : k;
  };
  const maxDet = Math.max(1, ...keys.map((k) => (Array.isArray(draft.rows?.[k]?.d) ? draft.rows![k]!.d!.length : 0)));
  const orphans = Object.keys(scheme.type === "C" ? draft.points ?? {} : draft.rows ?? {}).filter((k) => !keys.includes(k));
  return (
    <article data-results-record={version.version} style={{ maxWidth: 980, fontSize: 13, color: "#1d1d1d" }}>
      <style>{`@media print { .no-print, .adminrail, .adminmain > header, .adminmain > div:not(#content), .skip-link { display: none !important; } .adminmain > main { margin: 0 !important; padding: 0 !important; max-width: none !important; } @page { size: A4; margin: 14mm; } body { background: #fff; } }`}</style>
      <div className="no-print" style={{ marginBottom: 10 }}><PrintButton label={L("Печат", "Print")} /></div>
      <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{L("Запис на подадените резултати", "Record of the submitted results")}</h1>
      <p style={{ margin: "2px 0 10px", color: "#555" }}>{L("В портала този запис заменя Лист с резултати (Ф 7.2.1-7). Подадената версия не се променя; корекциите на PTS (ако има) стоят до нея, не в нея.", "In the portal this record replaces the Results Sheet (F 7.2.1-7). The submitted version is never changed; PTS's corrections (if any) stand beside it, not in it.")}</p>
      <table style={{ borderCollapse: "collapse", marginBottom: 12 }}><tbody>
        <tr><td style={cell}>{L("Схема", "Scheme")}</td><td style={cell}><b>{scheme.number}</b> — {scheme.name}</td></tr>
        <tr><td style={cell}>{L("Код на участника", "Participant code")}</td><td style={cell}><b data-record-code style={{ fontFamily: "monospace" }}>{code}</b></td></tr>
        <tr><td style={cell}>{L("Версия", "Version")}</td><td style={cell} data-record-version>{version.version}</td></tr>
        <tr><td style={cell}>{L("Подадена", "Submitted")}</td><td style={cell}>{when(version.submittedAt)} · {version.submittedBy.startsWith("entityuser:") ? L("потребител на организацията", "a user of the organisation") : L("акаунтът на лабораторията", "the laboratory's account")}</td></tr>
        <tr><td style={cell}>{L("Разписка №", "Receipt No.")}</td><td style={{ ...cell, fontFamily: "monospace" }}>{version.id}</td></tr>
        {version.configVersion ? <tr><td style={cell}>{L("Версия на конфигурацията", "Configuration version")}</td><td style={cell}>v.{version.configVersion}</td></tr> : null}
        {d.unlock ? <tr><td style={cell}>{L("След срока", "After the deadline")}</td><td style={cell}>{L("отключено от PTS", "unlocked by PTS")}{showReason && d.unlock.reason ? ` — «${d.unlock.reason}»` : ""}</td></tr> : null}
        {scheme.type === "T" && draft.period?.from ? <tr><td style={cell}>{L("Период на изпитване", "Test period")}</td><td style={cell}>{day(draft.period.from)}{draft.period.to ? ` – ${day(draft.period.to)}` : ""}</td></tr> : null}
      </tbody></table>

      {scheme.type === "T" ? (
        <div style={{ overflowX: "auto" }}>
          <table data-record-rows style={{ borderCollapse: "collapse", width: "100%", fontVariantNumeric: "tabular-nums" }}>
            <thead><tr style={{ textAlign: "left", background: "#f1f3f1" }}>
              <th style={cell}>№</th><th style={cell}>{L("Характеристика (метод)", "Characteristic (method)")}</th><th style={cell}>{L("Ед.", "Unit")}</th>
              {Array.from({ length: maxDet }, (_, i) => <th key={i} style={cell}>{["I", "II", "III"][i]}</th>)}
              <th style={cell}>{L("Средна", "Mean")}</th><th style={cell}>U</th><th style={cell}>k</th>
            </tr></thead>
            <tbody>
              {keys.map((k) => {
                const x = draft.rows?.[k], lb = tLabel(k);
                const nr = !!x?.nr || !!d.values?.[k]?.nr;
                const nd = Array.isArray(x?.d) ? x!.d!.length : 0;
                return (
                  <tr key={k} data-record-row={k}>
                    <td style={cell}>{lb.no}</td>
                    <td style={cell}>{lb.name}{lb.method ? <span style={{ color: "#666" }}> ({lb.method})</span> : null}</td>
                    <td style={cell}>{lb.unit}</td>
                    {nr ? <td style={cell} colSpan={maxDet + 3}><b>N/R</b> — {L("не е докладвано", "not reported")}</td> : <>
                      {Array.from({ length: maxDet }, (_, i) => <td key={i} style={cell}>{i < nd ? (x?.d?.[i] || "N/R") : ""}</td>)}
                      <td style={cell}><b>{x?.mean || "—"}</b></td><td style={cell}>{x?.U || "—"}</td><td style={cell}>{x?.k || "—"}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <table data-record-general style={{ borderCollapse: "collapse", marginBottom: 10 }}><tbody>
            {GENERAL_FIELDS.map((f) => (
              <tr key={f}><td style={cell}>{GEN_LABEL[f]?.[lang === "bg" ? 0 : 1] ?? f}</td><td style={cell} data-record-general-field={f}>{GENERAL_IDENTITY.includes(f) && !showIdentity ? hidden : ["dateFrom", "dateTo", "signedOn"].includes(f) ? day(draft.general?.[f]) : draft.general?.[f] || "—"}</td></tr>
            ))}
          </tbody></table>
          <div style={{ overflowX: "auto" }}>
            <table data-record-points style={{ borderCollapse: "collapse", width: "100%", fontVariantNumeric: "tabular-nums" }}>
              <thead><tr style={{ textAlign: "left", background: "#f1f3f1" }}>
                <th style={cell}>{L("Точка", "Point")}</th><th style={cell}>{L("Референтна", "Reference")}</th><th style={cell}>{L("Измерена", "Measured")}</th><th style={cell}>{L("Грешка", "Error")}</th><th style={cell}>U (k = 2)</th><th style={cell}>CMC</th>
              </tr></thead>
              <tbody>
                {keys.map((k) => {
                  const x = draft.points?.[k], na = !x || !!x.na || !!d.values?.[k]?.na;
                  const err = d.values?.[k]?.error;
                  return (
                    <tr key={k} data-record-point={k}>
                      <td style={cell}>{cLabel(k)}</td>
                      {na ? <td style={cell} colSpan={5}><b>N/A</b> — {L("извън обхвата на лабораторията (обявено)", "outside the laboratory's range (declared)")}</td> : <>
                        <td style={cell}>{x?.ref || "—"}</td><td style={cell}>{x?.meas || "—"}</td><td style={cell}><b>{err ? (lang === "bg" ? err.replace(".", ",") : err) : "—"}</b></td><td style={cell}>{x?.U || "—"}</td><td style={cell}>{x?.cmc || "—"}</td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {orphans.length > 0 && <p style={{ color: "#666" }}>{L(`Черновата пазеше стойности за ${orphans.length} реда, които не бяха в схемата при подаването — те не са част от подадените стойности.`, `The draft held values for ${orphans.length} rows not in the scheme at submission — they are not part of the submitted values.`)}</p>}

      <h2 style={{ fontSize: 14, fontWeight: 800, margin: "14px 0 4px" }}>{L("Потвърждения при подаването", "Confirmations at submission")}</h2>
      <ul style={{ margin: 0, paddingLeft: 18 }} data-record-confirmations>
        <li>{d.confirmations?.truthful ? "✓ " : "— "}{L("Резултатите са получени от лабораторията и са въведени, както са получени.", "The results were obtained by the laboratory and are entered as obtained.")}</li>
        {scheme.type === "C" && <li>{d.confirmations?.errorsConfirmed ? "✓ " : "— "}{L("Изчислените грешки (измерена − референтна стойност) са потвърдени.", "The computed errors (measured − reference value) are confirmed.")}</li>}
        <li>{d.confirmations?.subcontracted ? <>{L("Част е възложена на подизпълнител", "Part is subcontracted")}: {showIdentity ? d.confirmations.subcontractedPart ?? "" : hidden}</> : L("Без подизпълнител.", "No subcontracting.")}</li>
      </ul>
      {Array.isArray(d.notices) && d.notices.length > 0 && <p style={{ color: "#666", marginTop: 6 }}>{L(`При подаването са отбелязани ${d.notices.length} бележки за сведение (напр. единично определяне N/R).`, `${d.notices.length} notices were said at submission (e.g. a single determination N/R).`)}</p>}
    </article>
  );
}
