import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { participantViewer, participationViews } from "@/lib/participation-view";
import { canLabUploadNow } from "@/lib/lab-phases";
import { resultRows, draftFor, fieldName, rowsHaveIds, calRows, calRowsReady, calDraftFor, calField, genField, orphansOf, GENERAL_FIELDS } from "@/lib/results-model";
import { getDraft } from "@/lib/submissions";
import { isProvisional } from "@/lib/coding-model";
import { getServerT } from "@/lib/i18n-server";
import { signOutLabAction } from "@/lib/auth-actions";
import ParticipantNav from "@/components/ParticipantNav";
import LanguageToggle from "@/components/LanguageToggle";
import ResultsForm from "@/components/ResultsForm";
import CalibrationResultsForm from "@/components/CalibrationResultsForm";
import { resultsDeadline, chainWindow } from "@/lib/deadlines-model";
import { holidaySet } from "@/lib/holidays";

export const dynamic = "force-dynamic";

// The results form of ONE participation — testing (plan part 6.1; Zadanie §5, §7). For its
// laboratory's account and for a user of its legal entity — each only its own. The draft is
// kept as typed and is the participation's own: PTS sees what is SUBMITTED (6.4), never a draft.
export default async function ResultsFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await participantViewer();
  if (!viewer) redirect("/lab/login");
  const row = viewer.rows.find((r) => r.participantId === id);
  if (!row) notFound();
  const v = (await participationViews([row], { userId: viewer.userId }))[0];
  if (!v) notFound(); // a scheme that has not started is not shown (Реш. 147)
  const { lang: l } = await getServerT();
  const lang: "bg" | "en" = l === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const { scheme: s, part: p } = v;
  const self = `/lab/p/${encodeURIComponent(v.participantId)}`;
  const rows = s.type === "T" ? resultRows(s, p) : [];
  // a calibration (6.2): the points × the directions, by the points' lasting ids
  const cRows = s.type === "C" && s.calibration ? calRows(s.calibration) : [];
  // a draft that cannot be read is never shown as none: the form then waits, read-only — one
  // keystroke would otherwise write an empty draft over the real one (6.1 review)
  let readFailed = false;
  const stored = rows.length || cRows.length ? await getDraft(v.participantId, s.id).catch(() => { readFailed = true; return null; }) : null;
  const cInitial: Record<string, string> = {};
  if (cRows.length) {
    const cd = calDraftFor(stored?.data, cRows);
    for (const f of GENERAL_FIELDS) cInitial[genField(f)] = cd.general[f];
    for (const r of cRows) { const x = cd.points[r.key]; cInitial[calField("ref", r.key)] = x.ref; cInitial[calField("meas", r.key)] = x.meas; cInitial[calField("U", r.key)] = x.U; cInitial[calField("cmc", r.key)] = x.cmc; cInitial[calField("na", r.key)] = x.na ? "on" : ""; }
  }
  const cReady = s.type === "C" && calRowsReady(s.calibration);
  const cEditable = s.type === "C" && (s.status === "open" || s.status === "running") && !v.finished && canLabUploadNow(p.status) && !readFailed && cReady;
  const reminder = lang === "bg" ? s.staticReminder?.bg : s.staticReminder?.en;
  // 6.3: the dates the checks hold the lab's dates against — testing: from the dispatch to the results
  // deadline in force (its extension included); calibration: the lab's window with the device
  const deadline = resultsDeadline(s, p.code).at;
  // the start: the participation's own first shipment (5.6) — else the planned dispatch, a working
  // date that gates nothing (review)
  const shipped = (s.deliveries?.[v.participantId]?.shipments ?? []).map((x) => x.day).filter(Boolean).sort()[0];
  const period = { from: shipped ?? s.dates?.dispatch?.slice(0, 10), to: deadline ? deadline.slice(0, 10) : undefined };
  // calibration: each of the lab's windows with the device (a chain may visit it twice). The holiday
  // calendar not read: no upper limit rather than an empty calendar's early one (review)
  const myStops = s.type === "C" ? (s.chain?.stops ?? []).filter((x) => x.kind === "lab" && x.code === p.code && !!x.receivedAt) : [];
  let off: Set<string> | null = null;
  if (myStops.length) { try { off = await holidaySet(); } catch { off = null; } }
  const calWindows = myStops.map((st) => { const w = off ? chainWindow(s, st, off) : null; return w ? { from: w.received, to: w.due.slice(0, 10) } : { from: st.receivedAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(st.receivedAt)) : undefined }; });
  // what the draft keeps for points or characteristics no longer in the scheme — shown, never dropped (6.2 review)
  const orphans = Object.entries(orphansOf(stored?.data, s.type === "C" ? cRows.map((r) => r.key) : rows.map((r) => r.key)));
  const orphanText = (v: unknown) => Object.entries((v ?? {}) as Record<string, unknown>).filter(([, x]) => (typeof x === "string" && x) || (Array.isArray(x) && x.some(Boolean)) || x === true).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.filter(Boolean).join(" / ") : x === true ? "N/A" : x}`).join(" · ");
  const orphanBox = orphans.length ? (
    <section className="card" data-orphans={orphans.length} style={{ padding: "10px 14px", fontSize: 12.5, background: "#f7f6f2" }}>
      <b>{L("Вече не са в схемата", "No longer in the scheme")}</b>
      <span style={{ color: "var(--muted)" }}>{L(" — PTS е променил точките или характеристиките. Написаното за тях се пази в черновата и не се губи; за подаване важат редовете по-горе.", " — PTS changed the points or characteristics. What was typed for them is kept in the draft and never lost; the rows above are what is submitted.")}</span>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{orphans.map(([k, v]) => <li key={k} data-orphan={k}>{k} — {orphanText(v) || "—"}</li>)}</ul>
    </section>
  ) : null;
  const draft = draftFor(stored?.data, rows);
  // the form as its fields: what the draft holds, as typed
  const initial: Record<string, string> = {};
  for (const r of rows) {
    const x = draft.rows[r.key];
    x.d.forEach((val, j) => { initial[fieldName("d", r.key, j)] = val; });
    initial[fieldName("mean", r.key)] = x.mean;
    initial[fieldName("U", r.key)] = x.U;
    initial[fieldName("k", r.key)] = x.k;
    initial[`nr_${r.key}`] = x.nr ? "on" : "";
  }
  // the test period (6.3), as typed
  initial.p_from = draft.period?.from ?? "";
  initial.p_to = draft.period?.to ?? "";
  const idsReady = rowsHaveIds(rows);
  const editable = s.type === "T" && s.status === "running" && !v.finished && canLabUploadNow(p.status) && !readFailed && idsReady;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      {viewer.kind === "entity" && viewer.user ? (
        <ParticipantNav lang={lang} active="overview" name={viewer.user.name} role={viewer.user.role} persona={viewer.user.persona} />
      ) : (
        <header className="flex items-center gap-3 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
          <span className="font-bold text-lg tracking-tight"><span style={{ color: "var(--green-dark)" }}>PTS</span> Bulgaria</span>
          <span className="ml-auto text-sm" style={{ fontWeight: 700 }}>{viewer.lab?.name}</span>
          <LanguageToggle />
          <form action={signOutLabAction}><button type="submit" className="btn btn-sm">{L("Изход", "Sign out")}</button></form>
        </header>
      )}
      <main data-results-page={v.participantId} style={{ maxWidth: 980, margin: "0 auto", padding: "22px 24px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
        <nav style={{ fontSize: 12.5, color: "var(--muted)" }}><Link href={self}>← {L("Към участието", "Back to the participation")}</Link> · {s.number}{!isProvisional(p.code) ? ` · ${L("код", "code")} ${p.code}` : ""}</nav>
        <h1 className="section-title" style={{ fontSize: 24, margin: 0 }}>{L("Резултати", "Results")}</h1>
        {/* the scheme's static reminder (3.6) — «one decimal place», «U to two significant figures» … */}
        {reminder ? <p role="note" data-static-reminder className="card" style={{ padding: "10px 14px", margin: 0, fontSize: 13, background: "#faf2e0", border: "1px solid #ecd9ae" }}>{reminder}</p> : null}
        {s.type === "C" ? (
          cRows.length === 0 ? (
            <p data-results-none className="card" style={{ padding: 14, margin: 0, fontSize: 13.5, color: "var(--muted)" }}>{L("Схемата още няма точки на калибриране.", "The scheme has no calibration points yet.")}</p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", maxWidth: 820 }}>
                {L("Резултати от калибрирането по Листа с резултати (Ф 7.2.1-7): общата информация, после за всяка точка — референтната и измерената стойност; грешката се изчислява от формуляра. Всичко се пази, както е написано; проверява се само дали полетата са попълнени и дали са числа, никога стойността.",
                  "Calibration results per the Results Sheet (F 7.2.1-7): the general info, then for each point — the reference and the measured value; the form computes the error. Everything is kept as typed; only whether the fields are filled and are numbers is checked, never the value.")}
              </p>
              {readFailed ? <p role="alert" data-results-unread style={{ margin: 0, fontSize: 13, color: "#8f2f2f" }}>{L("Черновата не можа да се прочете — формулярът изчаква, за да не я запише отгоре празна. Презаредете страницата след малко.", "The draft could not be read — the form waits, so as not to write an empty one over it. Reload the page in a moment.")}</p>
                : !cReady ? <p role="note" data-results-ids style={{ margin: 0, fontSize: 13, color: "#7a5416" }}>{L("Точките на калибриране още нямат постоянни идентификатори — PTS трябва да запише схемата веднъж. Дотогава формулярът не приема данни.", "The calibration points have no lasting ids yet — PTS needs to save the scheme once. Until then the form takes no data.")}</p>
                : !cEditable ? <p role="note" data-results-closed style={{ margin: 0, fontSize: 13, color: "#7a5416" }}>{L("Формулярът не приема промени: схемата не е в ход или участието е приключило.", "The form takes no changes: the scheme is not running, or the participation is finished.")}</p> : null}
              <CalibrationResultsForm schemeId={s.id} participantId={v.participantId} lang={lang} editable={cEditable} savedAt={stored?.updatedAt} rev={stored?.rev ?? 0}
                unit={s.calibration?.unit ?? ""} quantity={lang === "bg" ? s.calibration?.quantityBg ?? "" : s.calibration?.quantityEn ?? ""} code={isProvisional(p.code) ? undefined : p.code}
                rows={cRows.map((r) => ({ key: r.key, nominal: r.nominal, direction: r.direction ? (lang === "bg" ? r.direction.bg : r.direction.en) : undefined }))} windows={calWindows}
                initial={cInitial} />
              {orphanBox}
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>{L("Това е чернова — вижда я само участието. Подаването (с потвърждение на грешките и разписка) идва в следващата част.", "This is a draft — only the participation sees it. Submission (with the errors confirmed and a receipt) comes in the next part.")}</p>
            </>
          )
        ) : rows.length === 0 ? (
          <p data-results-none className="card" style={{ padding: 14, margin: 0, fontSize: 13.5, color: "var(--muted)" }}>{L("За това участие няма характеристики за докладване.", "This participation has no characteristics to report.")}</p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", maxWidth: 820 }}>
              {L("За всяка характеристика: единичните определяния, средната стойност — въвеждате я вие, порталът не я изчислява — разширената неопределеност U и коефициентът на покритие k (по подразбиране 2). Всичко се пази, както е написано; формулярът проверява само дали полетата са попълнени и дали са числа, никога стойността.",
                "For each characteristic: the single determinations, the mean — you type it; the portal does not compute it — the expanded uncertainty U and the coverage factor k (2 by default). Everything is kept as typed; the form only checks that the fields are filled and are numbers, never the value.")}
            </p>
            {readFailed ? <p role="alert" data-results-unread style={{ margin: 0, fontSize: 13, color: "#8f2f2f" }}>{L("Черновата не можа да се прочете — формулярът изчаква, за да не я запише отгоре празна. Презаредете страницата след малко.", "The draft could not be read — the form waits, so as not to write an empty one over it. Reload the page in a moment.")}</p>
              : !idsReady ? <p role="note" data-results-ids style={{ margin: 0, fontSize: 13, color: "#7a5416" }}>{L("Характеристиките на схемата още нямат постоянни идентификатори — PTS трябва да запише схемата веднъж. Дотогава формулярът не приема данни.", "The scheme's characteristics have no lasting ids yet — PTS needs to save the scheme once. Until then the form takes no data.")}</p>
              : !editable ? <p role="note" data-results-closed style={{ margin: 0, fontSize: 13, color: "#7a5416" }}>{L("Формулярът не приема промени: схемата не е в ход или участието е приключило.", "The form takes no changes: the scheme is not running, or the participation is finished.")}</p> : null}
            <ResultsForm schemeId={s.id} participantId={v.participantId} lang={lang} editable={editable} savedAt={stored?.updatedAt} rev={stored?.rev ?? 0}
              rows={rows.map((r) => ({ key: r.key, name: lang === "bg" ? r.name.bg : r.name.en, method: lang === "bg" ? r.method.bg : r.method.en, unit: r.unit, determinations: r.determinations, uRequired: r.uRequired, guardMin: r.guardMin, guardMax: r.guardMax }))} period={period}
              initial={initial} />
            {orphanBox}
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>{L("Това е чернова — вижда я само участието. Подаването (с потвърждение и разписка) идва в следващата част; дотогава резултатите се изпращат, както казва Инструкцията.", "This is a draft — only the participation sees it. Submission (with a confirmation and a receipt) comes in the next part; until then, results are sent as the Instruction says.")}</p>
          </>
        )}
      </main>
    </div>
  );
}
