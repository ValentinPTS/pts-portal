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
import { testPeriodLimits, calibrationWindows } from "@/lib/results-limits";
import { resultsDeadline } from "@/lib/deadlines-model";
import { activeUnlock, submissionOpen } from "@/lib/submission-model";
import { listSubmissionsFor, listCorrectionsFor } from "@/lib/submissions";
import { usedValues, FIELD_LABEL } from "@/lib/corrections-model";
import { lockInForce, lockEntryOf, lockWord } from "@/lib/submission-lock-model";
import { schemeNowMs, sofiaToday } from "@/lib/clock";
import { fmtMoment, fmtSchemeDate } from "@/lib/scheme-dates";

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
  // 6.4: the form takes a submission before the deadline in force — after it, only under PTS's
  // unlock (Реш. 111); closed, it takes no change at all
  const nowMs = schemeNowMs(s);
  const unlock = activeUnlock(s.resultUnlocks, v.participantId, sofiaToday(nowMs));
  const gate = submissionOpen(resultsDeadline(s, p.code).at, nowMs, unlock);
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
  const cEditable = s.type === "C" && (s.status === "open" || s.status === "running") && !v.finished && canLabUploadNow(p.status) && !readFailed && cReady && gate.open;
  const reminder = lang === "bg" ? s.staticReminder?.bg : s.staticReminder?.en;
  // 6.3: the dates the checks hold the lab's dates against — testing: from the dispatch to the results
  // deadline in force (its extension included); calibration: the lab's window with the device
  // the dates the checks hold the lab's dates against — the same helper the submission uses (6.4)
  const period = testPeriodLimits(s, v.participantId, p.code, gate.late ? unlock : null); // as the submission: an unlock widens only when late
  let versions: Awaited<ReturnType<typeof listSubmissionsFor>> = [];
  let versionsUnread = false; // a read that failed is said — never «nothing submitted» (6.4 review)
  try { versions = await listSubmissionsFor(v.participantId, s.id); } catch { versions = []; versionsUnread = true; }
  // 6.5: what PTS uses in the evaluation, next to what was submitted — the laboratory sees both,
  // with the reason (the version itself is never changed)
  const latestV = versions.at(-1);
  let usedNote: React.ReactNode = null;
  if (latestV) {
    let corr: Awaited<ReturnType<typeof listCorrectionsFor>> | null = null;
    try { corr = await listCorrectionsFor(v.participantId, s.id); } catch { corr = null; }
    const labelOf = (k: string) => s.type === "C"
      ? (() => { const r = cRows.find((x) => x.key === k); return r ? `${r.nominal}${r.direction ? ` · ${lang === "bg" ? r.direction.bg : r.direction.en}` : ""}` : k; })()
      : (() => { const r = rows.find((x) => x.key === k); return r ? `${r.index + 1}. ${lang === "bg" ? r.name.bg : r.name.en}` : k; })();
    // the calibration error as computed (a point) — a comma in Bulgarian, as on the form
    const shown = (f: string, v: string | null) => (v === null ? "—" : f === "error" && lang === "bg" ? v.replace(".", ",") : v);
    const changed = corr ? Object.entries(usedValues(latestV.data, corr, latestV.version)).flatMap(([k, fs]) => Object.entries(fs).filter(([, x]) => !!x.correction).map(([f, x]) => ({ k, f, x }))) : [];
    usedNote = corr === null
      ? <p role="alert" data-lab-corrections-unread className="card" style={{ margin: 0, padding: "10px 14px", fontSize: 13, color: "#8f2f2f" }}>{L("Не можа да се прочете дали PTS използва коригирани стойности. Презаредете страницата.", "Whether PTS uses corrected values could not be read. Reload the page.")}</p>
      : changed.length ? (
        <section className="card" data-lab-corrections={changed.length} style={{ padding: "10px 14px", fontSize: 13 }}>
          <b>{L(`Използвано при оценяването — версия ${latestV.version}`, `Used in the evaluation — version ${latestV.version}`)}</b>
          <p style={{ margin: "2px 0 6px", color: "var(--muted)", fontSize: 12.5 }}>{L("Подадената версия се пази непроменена. PTS е записал стойности, които използва вместо подадените:", "The submitted version is kept unchanged. PTS has recorded values it uses instead of the submitted ones:")}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {changed.map(({ k, f, x }) => (
              <li key={`${k}::${f}`} data-lab-correction={`${k}::${f}`}>{labelOf(k)} · {lang === "bg" ? FIELD_LABEL(f, x.k).bg : FIELD_LABEL(f, x.k).en}: {L("подадено", "submitted")} <b>{shown(f, x.reported)}</b> · {L("използвано", "used")} <b>{shown(f, x.used)}</b> — {L("основание", "reason")}: {x.correction!.reason}</li>
            ))}
          </ul>
        </section>
      ) : null;
  }
  const versionList = versionsUnread ? (
    <p role="alert" data-versions-unread className="card" style={{ margin: 0, padding: "10px 14px", fontSize: 13, color: "#8f2f2f" }}>{L("Подадените версии не можаха да се прочетат — не е ясно дали има такива. Презаредете страницата.", "The submitted versions could not be read — it is not known whether there are any. Reload the page.")}</p>
  ) : versions.length ? (
    <section className="card" data-submitted-versions={versions.length} style={{ padding: "10px 14px", fontSize: 13 }}>
      <b>{L("Подадени версии", "Submitted versions")}</b>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {[...versions].reverse().map((x) => (
          <li key={x.id} data-submitted-version={x.version}>
            {L("версия", "version")} {x.version} · {fmtMoment(x.submittedAt)} · {x.submittedBy.startsWith("entityuser:") ? L("потребител на организацията", "a user of the organisation") : L("акаунтът на лабораторията", "the laboratory's account")} · {L("разписка", "receipt")} <span style={{ fontFamily: "monospace" }}>{x.id.slice(0, 8)}</span>{x.configVersion ? ` · ${L("конфигурация", "configuration")} v.${x.configVersion}` : ""}{(x.data as { unlock?: unknown } | null)?.unlock ? ` · ${L("след срока, отключено от PTS", "after the deadline, unlocked by PTS")}` : ""}
            {" · "}<Link href={`/lab/p/${encodeURIComponent(v.participantId)}/results/v/${x.version}`} data-record-link={x.version}>{L("запис (за печат) →", "record (printable) →")}</Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
  // the deadline the form closes at, said — for calibration too: the plan's results deadline (M1 т. 13:
  // «до крайния срок, посочен в т. 10»), not the window with the device (6.4 review)
  const due = resultsDeadline(s, p.code);
  // 6.6 (Реш. 21): the submission locked at the start of processing — nothing comes in after it;
  // which version is processed, its results received outside the form, or N/R — said to this
  // participation. A scheme that reached processing before 6.6 has no lock: closed all the same.
  const afterStart = s.status === "processing" || s.status === "report" || s.status === "closed";
  const lock = afterStart ? lockInForce(s.submissionLocks) : null;
  const word = lockWord(lockEntryOf(lock, v.participantId));
  const lockNote = afterStart ? (
    <p role="note" data-results-locked={word} style={{ margin: 0, fontSize: 13, color: "#7a5416" }}>
      {L("Подаването е заключено — започна обработката (Реш. 21). След това резултат не се приема.", "The submission is locked — processing has started (Реш. 21). No result is accepted after it.")}{" "}
      {word === "nr" ? <b>{L("От вас не са получени резултати — участието е N/R.", "No results were received from you — the participation is N/R.")}</b>
        : word === "outside" ? L("Резултатите ви са получени извън онлайн формуляра (Лист с резултати) и се обработват.", "Your results were received outside the online form (the Results Sheet) and are processed.")
        : word ? L(`Обработва се версия ${word}.`, `Version ${word} is processed.`) : null}
    </p>
  ) : null;
  const closedNote = lockNote ? lockNote : !gate.late ? (due.at ? <p role="note" data-results-deadline={due.at} style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{L("Срок за подаване на резултатите", "Results deadline")}: <b>{fmtSchemeDate(due.at)}</b>{due.ext ? L(` (удължен${due.ext.orderNo ? ` със заповед № ${due.ext.orderNo}` : ""})`, ` (extended${due.ext.orderNo ? ` by order No. ${due.ext.orderNo}` : ""})`) : ""}{L(" — след него формулярът се затваря.", " — after it the form closes.")}</p> : null) : (
    unlock
      ? <p role="note" data-results-unlocked style={{ margin: 0, fontSize: 13, color: "#2e6b3a" }}>{L(`Срокът е изтекъл, но PTS е отключил формуляра до ${unlock.until.split("-").reverse().join(".")} включително.`, `The deadline has passed, but PTS has unlocked the form until ${unlock.until.split("-").reverse().join(".")} inclusive.`)}</p>
      : <p role="note" data-results-deadline-passed style={{ margin: 0, fontSize: 13, color: "#8f2f2f" }}>{L("Срокът за резултати е изтекъл — формулярът е затворен. След срока резултат се приема само чрез PTS (Реш. 111).", "The results deadline has passed — the form is closed. After the deadline a result comes in only through PTS (Реш. 111).")}</p>
  );
  const calWindows = s.type === "C" ? await calibrationWindows(s, p.code) : [];
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
  const editable = s.type === "T" && s.status === "running" && !v.finished && canLabUploadNow(p.status) && !readFailed && idsReady && gate.open;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      {viewer.kind === "entity" && viewer.user ? (
        <ParticipantNav lang={lang} active="overview" name={viewer.user.name} role={viewer.user.role} persona={viewer.user.persona} />
      ) : (
        <header className="flex items-center gap-3 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)", flexWrap: "wrap" }}>
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
        {closedNote}
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
                rows={cRows.map((r) => ({ key: r.key, nominal: r.nominal, direction: r.direction ? (lang === "bg" ? r.direction.bg : r.direction.en) : undefined }))} windows={calWindows} submitOpen={gate.open}
                initial={cInitial} />
              {orphanBox}
              {versionList}
              {usedNote}
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
              initial={initial} submitOpen={gate.open} />
            {orphanBox}
            {versionList}
            {usedNote}
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>{L("Черновата вижда само участието; PTS вижда подадените версии.", "Only the participation sees the draft; PTS sees the submitted versions.")}</p>
          </>
        )}
      </main>
    </div>
  );
}
