import Link from "next/link";
import { notFound } from "next/navigation";
import { mayNow, requireOneOf } from "@/lib/access";
import { requireStaff } from "@/lib/roles";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { listSubmissions, listCorrections } from "@/lib/submissions";
import { activeCorrections } from "@/lib/corrections-model";
import { inFinalRound } from "@/lib/announcement-model";
import { resultRows, calRows } from "@/lib/results-model";
import { lockInForce, lockEntryOf } from "@/lib/submission-lock-model";
import { reviewVersion, noteInForce, FINDING_TEXT, NOTE_MAX, type Finding } from "@/lib/review-model";
import { recordReviewNoteAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";
import { fmtMoment } from "@/lib/scheme-dates";

export const dynamic = "force-dynamic";

// PTS's review after the deadline (plan part 6.7; Реш. 88; the spec's «три проверки след крайния
// срок»). A STAFF page — never shown to a laboratory. Each participation on the final list, by
// code: the version the lock took (6.6), or before it the latest; the findings on the values AS
// SUBMITTED; the individual note PTS writes from them. It blocks nothing and changes nothing: the
// results are evaluated as declared.
export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string }> }) {
  await requireStaff();
  const { id } = await params;
  await requireOneOf(["results.read", "results.enter", "results.process"], id);
  const sp = await searchParams;
  const s = await getScheme(id);
  if (!s) notFound();
  const { lang } = await getServerT();
  const lg = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const canWrite = ((await mayNow("results.enter", id)) || (await mayNow("results.process", id))) && (s.status === "running" || s.status === "processing" || (s.type === "C" && s.status === "open"));

  let unread = false;
  let parts: Awaited<ReturnType<typeof listParticipants>> = [], versions: Awaited<ReturnType<typeof listSubmissions>> = [], corrected: Awaited<ReturnType<typeof listCorrections>> = [];
  try { parts = (await listParticipants(id)).filter((p) => inFinalRound(s, p)); versions = await listSubmissions(id); corrected = await listCorrections(id); } catch { unread = true; }
  const lock = lockInForce(s.submissionLocks);
  const cRows = s.type === "C" && s.calibration ? calRows(s.calibration) : [];
  const show = (v: string) => (lg === "bg" ? v.replace(/^(-?\d+)\.(\d+)$/, "$1,$2") : v);
  const rowsFor = (p: (typeof parts)[number]) => s.type === "C"
    ? cRows.map((r) => ({ key: r.key, nominal: r.nominal, label: `${r.nominal} ${s.calibration?.unit ?? ""}${r.direction ? ` · ${r.direction[lg]}` : ""}` }))
    : resultRows(s, p).map((r) => ({ key: r.key, step: s.parameters[r.index]?.step, label: `${r.index + 1}. ${r.name[lg]}` }));

  const items = parts.map((p) => {
    const mine = versions.filter((x) => x.participantId === p.id).sort((a, b) => a.version - b.version);
    const e = lockEntryOf(lock, p.id);
    // the version the lock took — else (no lock yet) the latest
    const v = e ? (e.version === null ? null : mine.find((x) => x.version === e.version) ?? null) : mine.at(-1) ?? null;
    const rows = v ? rowsFor(p) : [];
    const findings: Finding[] = v ? reviewVersion(v.data, s.type, rows, s.calibration) : [];
    // the corrections in force on the version reviewed (6.5) — the review is of what was declared;
    // what PTS uses instead is beside it, on the case file
    const usedCount = v ? activeCorrections(corrected.filter((c) => c.participantId === p.id), v.version).size : 0;
    return { p, v, e, rows, findings, usedCount, note: noteInForce(s.reviewNotes, p.id) };
  });
  const withFindings = items.filter((x) => x.findings.some((f) => f.level === "finding")).length;
  const valueLine = (f: Finding) => {
    const v = f.values;
    switch (f.kind) {
      case "mean-dets": return L(`декларирана ${v.declared} · средно от определянията ${show(v.determinationsMean)} (${v.determinations}) · допуск ±${show(v.tolerance)}`, `declared ${v.declared} · the determinations' mean ${v.determinationsMean} (${v.determinations}) · tolerance ±${v.tolerance}`);
      case "resolution": return L(`${v.declared} при стъпка ${show(v.step)}`, `${v.declared} with the step ${v.step}`);
      case "ref-nominal": return L(`номинална ${v.nominal} · реализирана ${v.reference} · отклонение ${show(v.deviation)}${v.tolerance ? ` · допуск ±${v.tolerance}` : " · допуск не е зададен"}`, `nominal ${v.nominal} · realised ${v.reference} · deviation ${v.deviation}${v.tolerance ? ` · tolerance ±${v.tolerance}` : " · no tolerance set"}`);
      case "u-sigfigs": return L(`U = ${v.declared} — ${v.figures} значещи цифри`, `U = ${v.declared} — ${v.figures} significant figures`);
      case "u-cmc": return L(`U = ${v.declared} < CMC = ${v.cmc}`, `U = ${v.declared} < CMC = ${v.cmc}`);
      case "orphan": return v.held ? L(`в черновата: ${v.held}`, `held: ${v.held}`) : "";
      case "env": return L(`отчетено ${v.reported} °C${v.declared ? ` · обявено от схемата ${v.declared} °C` : " · схемата не обявява диапазон"}`, `reported ${v.reported} °C${v.declared ? ` · the scheme declares ${v.declared} °C` : " · the scheme declares no range"}`);
      default: return "";
    }
  };

  return (
    <div data-review-page>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>← {s.number}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>{L("Преглед след срока", "Review after the deadline")}</h1>
      <p className="text-sm" style={{ color: "var(--muted)", maxWidth: 860 }}>
        {s.type === "T"
          ? L("Трите проверки (Реш. 88): декларираната средна стойност спрямо определянията, резолюцията на представяне, U спрямо CMC (при изпитване — неприложимо).", "The three checks (Реш. 88): the declared mean against the determinations, the reporting resolution, U against CMC (not applicable in testing).")
          : L("Калибриране (D1): точките, реализираната референтна стойност спрямо номиналната, U до две значещи цифри (както е въведена), U спрямо CMC, условията на средата. Грешката не се проверява отново.", "Calibration (D1): the points, the realised reference value against the nominal, U to two significant figures (as typed), U against CMC, the environment. The error is not re-checked.")}
        {" "}{L("Стойностите се оценяват както са декларирани — прегледът не спира и не променя нищо; констатациите влизат в доклада като индивидуална забележка. Нищо от тази страница не се показва на лабораториите.", "The values are evaluated as declared — the review blocks and changes nothing; the findings go into the report as an individual note. Nothing on this page is shown to the laboratories.")}
      </p>
      {unread ? <p role="alert" data-review-unread className="text-sm" style={{ color: "#8f2f2f" }}>{L("Участниците или подадените версии не можаха да се прочетат — презаредете страницата.", "The participants or the submitted versions could not be read — reload the page.")}</p> : (
        <p className="text-sm" data-review-summary={`${items.length}:${withFindings}`}>
          <b>{items.length}</b> {L("участия в окончателния списък", "participations on the final list")} · <b>{withFindings}</b> {L("с констатации", "with findings")}{lock ? L(` · заключено ${fmtMoment(lock.at)} — преглеждат се взетите версии`, ` · locked ${fmtMoment(lock.at)} — the versions taken are reviewed`) : L(" · още не е заключено — преглеждат се последните версии", " · not locked yet — the latest versions are reviewed")}
        </p>
      )}
      {sp.note && <p role={sp.note === "ok" ? "status" : "alert"} data-note-answer={sp.note} className="text-sm" style={{ color: sp.note === "ok" ? "var(--green-dark)" : "#8f2f2f" }}>{sp.note === "ok" ? L("Забележката е записана.", "The note is recorded.") : sp.note === "same" ? L("Забележката в сила вече е същата — нищо ново.", "The note in force says this already — nothing new.") : L("Не е записано — схемата вече не е в процес или обработка.", "Not recorded — the scheme is no longer in progress or processing.")}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {items.map(({ p, v, e, rows, findings, usedCount, note }) => {
          const labelOf = (k: string) => rows.find((r) => r.key === k)?.label ?? (k === "general" ? L("Обща информация", "General info") : k);
          const found = findings.filter((f) => f.level === "finding"), info = findings.filter((f) => f.level === "info");
          return (
            <section key={p.id} id={`p-${p.code}`} className="card p-4" data-review-item={p.code} data-review-findings={found.length}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-bold" style={{ color: "var(--green-dark)" }}>{p.code}</span>
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  {v ? L(`версия ${v.version}${e ? " (взета при заключването)" : " (последната)"}`, `version ${v.version}${e ? " (taken by the lock)" : " (the latest)"}`) : e?.via ? L("резултатите са получени извън формуляра (лист) — прегледът е по листа", "the results came outside the form (a sheet) — reviewed on the sheet") : L("няма подадена версия", "no version submitted")}
                </span>
                <Link href={`/schemes/${id}/participants/${encodeURIComponent(p.code)}#submissions`} className="text-sm">{L("досие →", "case file →")}</Link>
                {usedCount > 0 && <span className="text-sm" data-review-corrected={usedCount} style={{ color: "#7a5416" }}>{L(`${usedCount} използвани стойности вместо подадените (6.5) — в досието`, `${usedCount} used values instead of the submitted ones (6.5) — on the case file`)}</span>}
              </div>
              {v && (found.length === 0 ? <p className="text-sm mt-2" data-review-none style={{ color: "var(--green-dark)" }}>{L("Няма констатации.", "No findings.")}</p> : (
                <ul className="text-sm mt-2" style={{ paddingLeft: 18, margin: "6px 0 0" }}>
                  {found.map((f, i) => <li key={i} data-finding={f.kind} data-finding-key={f.key}><b>{FINDING_TEXT[f.kind][lg]}</b> — {labelOf(f.key)}{f.field && f.kind === "resolution" ? ` · ${f.field}` : ""}: {valueLine(f)}</li>)}
                </ul>
              ))}
              {info.length > 0 && (
                <details className="text-sm mt-1" style={{ color: "var(--muted)" }} data-review-info={info.length}>
                  <summary>{L(`За сведение (${info.length})`, `For information (${info.length})`)}</summary>
                  <ul style={{ paddingLeft: 18, margin: "4px 0" }}>
                    {info.map((f, i) => <li key={i} data-info={f.kind}>{FINDING_TEXT[f.kind][lg]} — {labelOf(f.key)}{valueLine(f) ? `: ${valueLine(f)}` : ""}</li>)}
                  </ul>
                </details>
              )}
              <div className="mt-2 text-sm" data-review-note={note ? "1" : "0"}>
                <b>{L("Индивидуална забележка", "Individual note")}</b>
                {note ? <span style={{ color: "var(--muted)" }}> — {note.by}, {fmtMoment(note.at)}</span> : null}
                {note && !canWrite ? <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{note.text}</p> : null}
                {!note && !canWrite ? <span style={{ color: "var(--muted)" }}> — {L("няма", "none")}</span> : null}
                {canWrite && (
                  <form action={recordReviewNoteAction} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }} data-note-form={p.code}>
                    <input type="hidden" name="schemeId" value={id} />
                    <input type="hidden" name="code" value={p.code} />
                    <textarea name="text" defaultValue={note?.text ?? ""} maxLength={NOTE_MAX} rows={3} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, maxWidth: 760 }} placeholder={L("Констатациите, които влизат в доклада за този код (празно — оттегля забележката)", "The findings that go into the report for this code (empty — withdraws the note)")} />
                    <div><button type="submit" className="btn btn-sm" data-note-submit>{L("Запиши забележката", "Record the note")}</button></div>
                  </form>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
