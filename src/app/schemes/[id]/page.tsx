import Link from "next/link";
import { markState } from "@/lib/accreditation-mark";
import { mayNow, requireCap, mayViewDoc, getViewer } from "@/lib/access";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { getDoc, isFormDoc, isListDoc, isRestrictedDoc, isDocDone, hasDocContent, ORDER_DOC } from "@/lib/documents";
import { DOC_STAGES } from "@/lib/doc-stages";
import { isSendableDoc, SENDABLE_DOCS } from "@/lib/doc-release";
import AckPanel from "@/components/AckPanel";
import MessageComposer from "@/components/MessageComposer";
import { sendSchemeMessageAction } from "@/lib/actions";
import { messageTargetLabel } from "@/lib/messages-model";
import { ackRequiredFor, ackSettable, ackCounts, personalAcks, ackMoment } from "@/lib/ack-model";
import { releaseFor } from "@/lib/release-model";
import { isStarted } from "@/lib/visibility";
import { fmtPhaseDate } from "@/lib/lab-phases";
import ExplorerShell from "@/components/ExplorerShell";
import SchemeDocuments, { type DocStageView, type DocSource, type DocRow } from "@/components/SchemeDocuments";
import SchemeDates from "@/components/SchemeDates";
import SchemeChainPanel from "@/components/SchemeChainPanel";
import { pointKeys, currentRows, missingFor2 } from "@/lib/reference-values-model";
import SchemeProcessing, { type DesignationView } from "@/components/SchemeProcessing";
import { designationStatus, listDesignations, processingCandidates, type ProcessingDesignation } from "@/lib/processing-roles";
import { listStaff } from "@/lib/staff";
import { listEditions } from "@/lib/editions";
import { hasEditions, fmtDay } from "@/lib/editions-model";
import SchemeTestClock from "@/components/SchemeTestClock";
import { isTestEnvironment } from "@/lib/environment";
import { clockOffsetMs } from "@/lib/clock";
import { listParticipants } from "@/lib/participants";
import SkinPicker from "@/components/SkinPicker";
import ManageMenu from "@/components/ManageMenu";
import FolderActions from "@/components/FolderActions";
import { skinsForTypeAsync } from "@/skins";
import { TYPE_SLUG, typeLabel, schemeName, statusChip, ACCENT } from "@/lib/folders";
import { markerLabels, schemeMarkers } from "@/lib/scheme-number";
import SchemeLifecycle, { type ActButton, type StageRow } from "@/components/SchemeLifecycle";
import { listSubmissions, submittedParticipantIds, listCorrections } from "@/lib/submissions";
import { listActivity } from "@/lib/activity-store";
import { listNoticesForScheme } from "@/lib/notifications";
import { processingRecord, schemeTransferState, stageEventOf, reportInForce, RECORD_STAGES, type RecordEvent, type StageEvent } from "@/lib/transfer-check-model";
import { metaGaps, META_GAP_TEXT } from "@/lib/scheme-meta";
import { lockEntries, lockCounts, isNR, resultsOutsideForm, lockInForce } from "@/lib/submission-lock-model";
import { analysisGaps } from "@/lib/analysis-export";
import AnalysisImportPanel from "@/components/AnalysisImportPanel";
import ProcessingRecordCard from "@/components/ProcessingRecordCard";
import ReportIssueCard from "@/components/ReportIssueCard";
import { transferProblem, correctionProblem, recipients, type IssueProblem, type RecipientRow } from "@/lib/report-issue-model";
import { activeUnlock, submissionOpen } from "@/lib/submission-model";
import { needsAmendment } from "@/lib/amendments-model";
import { chainWindow, deadlineState, windowDays, resultsDeadline } from "@/lib/deadlines-model";
import { holidaySet } from "@/lib/holidays";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import { schemeNowMs, sofiaToday } from "@/lib/clock";
import { ACTS, BACK_TO, STAGES, STATE_LABEL, actProblem, stageViews, tickProblem, untickProblem, tickerLabel, currentSecondAnnouncement, TICK_PROBLEM_TEXT, ACT_PROBLEM_TEXT, type ActKey } from "@/lib/lifecycle-model";
import SecondAnnouncementForm from "@/components/SecondAnnouncementForm";
import CodingPanel from "@/components/CodingPanel";
import { toCode, codingProblem, unfinished, objectsGiven, isProvisional, CODING_PROBLEM_TEXT } from "@/lib/coding-model";
import { listCaseEventsForScheme } from "@/lib/case-events";
import { codeMoment } from "@/lib/code-rule";
import { countsPerCharacteristic, currentFinalList, inFinalRound, MIN_PER_CHARACTERISTIC } from "@/lib/announcement-model";
import { inRound, characteristicsOf, selectionsOf } from "@/lib/application-model";
import { characteristicLabel } from "@/lib/characteristics-model";
import { ancestry } from "@/lib/folder-tree";
import { getServerT } from "@/lib/i18n-server";
import { requireStaff, getRoleContext, canManagePeople } from "@/lib/roles";

// A scheme folder → its 14 documents grouped by workflow stage. Every document can be
// built in the app OR filled with an uploaded ready-made file (PDF/image) — see
// SchemeDocuments. The header shows the primary tools; the rest tuck under "Управление".
export default async function SchemePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ack?: string; msg?: string; n?: string; of?: string; imp?: string; tc?: string; ri?: string }> }) {
  await requireStaff(); // read gate: one of PTS's people
  const { id } = await params;
  const sp = await searchParams;
  const ackNotice = sp.ack; // 5.9: the setting's answer
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const s = await getScheme(id);
  if (!s) notFound();

  const { lang, tr } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const canManage = await mayNow("participants.manage", id); // the applications name the labs (§4.2, 2.4)
  const seesOrder = await mayViewDoc(ORDER_DOC, id);
  const type = s.type;
  const slug = TYPE_SLUG[type];
  const ac = ACCENT[type];
  const st = statusChip(s.status, lang);
  const marks = markerLabels(schemeMarkers(s), lang === "bg" ? "bg" : "en");
  const skins = await skinsForTypeAsync(type);
  const chain = s.folderId ? await ancestry(type, s.folderId) : [];

  // who processes, reviews and approves (2.5, Реш. 140): seen by all who open the
  // scheme — PTS's own people, never a laboratory's; designated by the head
  const canDesignate = await canManagePeople(await getRoleContext());
  const [processing, designations, staff] = await Promise.all([designationStatus(id), listDesignations({ schemeId: id, all: true }), listStaff()]);
  const candidates = canDesignate ? await processingCandidates(id) : { processors: [], reviewers: [], approvers: [] };
  const person = (email: string) => ({ email, name: staff.find((u) => u.email.toLowerCase() === email)?.name ?? "" });
  const view = (d: ProcessingDesignation): DesignationView => ({
    id: d.id, processor: person(d.processor), reviewer: { ...person(d.reviewer), basis: d.reviewerBasis }, approver: person(d.approver),
    coincide: d.coincide, justification: d.justification, setBy: d.setBy,
    setOn: fmtPhaseDate(d.setAt.slice(0, 10)), endedOn: d.endedAt ? fmtPhaseDate(d.endedAt.slice(0, 10)) : undefined,
  });

  // the holiday calendar, for a calibration chain's working-day windows (3.4)
  const offDays = type === "C" ? await holidaySet() : new Set<string>();

  // ── the 19 stages and the acts (part 3.2) ──
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const viewer = await getViewer();
  const participantsNow = await listParticipants(id);
  // the participations in the round — a refused, annulled or withdrawn one counts for nothing (5.1);
  // once the final list stands, only those on it go on (5.2) — the stages count those
  const inRoundNow = participantsNow.filter(inRound);
  const goingOn = participantsNow.filter((p) => inFinalRound(s, p));
  // processing waits for the coding (5.3)
  const uncodedOnList = codeMoment(s) === "coding-act" && goingOn.some((p) => isProvisional(p.code));
  const resultsOf = goingOn.map((p) => s.labUploads?.[p.code]?.results).filter((u): u is NonNullable<typeof u> => !!u);
  const withResults = goingOn.filter((p) => !!s.labUploads?.[p.code]?.results || p.status === "submitted" || p.status === "scored").length;
  const views = stageViews(s, {
    participants: goingOn.length, withResults,
    lastResultAt: resultsOf.map((u) => u.uploadedAt).sort().pop(),
    feedbackSentAt: s.sentToParticipants?.feedback,
  }, lg);
  const who = (by?: string) => (!by ? undefined : by.startsWith("system:") || by === "build" ? by : person(by.toLowerCase()).name || by);
  const stageRows: StageRow[] = await Promise.all(views.map(async (v) => {
    const def = STAGES.find((d) => d.no === v.no)!;
    let mayTick = false;
    if ("tick" in def.way) {
      const t = def.way.tick;
      mayTick = "cap" in t ? await mayNow(t.cap, id)
        : viewer.build || (!!processing.current && !processing.problems.length && !!viewer.email && processing.current[t.designated] === viewer.email.trim().toLowerCase());
    }
    const tp = "tick" in def.way ? tickProblem(s, v.no) : null;
    return {
      no: v.no, done: !!v.done, title: v.title, way: v.way, inPortal: v.inPortal,
      doneDay: v.done?.day ? fmtDay(v.done.day) : v.done?.at ? fmtDay(v.done.at.slice(0, 10)) : undefined,
      doneBy: who(v.done?.by), note: v.done?.note, afterResults: v.done?.afterResults, detail: v.detail,
      current: v.current, skipped: v.skipped, later: v.later,
      who: "tick" in def.way ? tickerLabel(def.way.tick, lg) : "",
      mayTick, tickBlocked: tp ? TICK_PROBLEM_TEXT[tp][lg] : undefined,
      mayUntick: mayTick && !untickProblem(s, v.no),
    };
  }));
  const canAct = await mayNow("scheme.edit", id);
  const mayReview = (await mayNow("results.read", id)) || (await mayNow("results.enter", id)) || (await mayNow("results.process", id));
  // 7.2: who may import 2.0's documents — while the scheme is in processing; once the report is
  // issued (R1, 7.4), a correction's file too (it reaches nobody until a correction R2… is issued)
  const mayImport = ((await mayNow("results.process", id)) || (await mayNow("scheme.edit", id))) && (s.status === "processing" || (s.status === "report" && !!s.reportIssues?.length));
  // 7.3: the processing record — every designation, the ticks and their withdrawals (the journal), the
  // exports, the imports, the checks — and the transfer check in force (the corrections read: one after
  // the export takes it out of force)
  let recordView: { record: RecordEvent[]; ticksFromJournal: boolean; transfer: ReturnType<typeof schemeTransferState> | null } | null = null;
  if ((mayReview || canAct) && ["processing", "report", "closed"].includes(s.status)) {
    const ticks = await listActivity({ schemeId: id, action: "scheme.stage", limit: 1000, strict: true }).then((es) => es.map(stageEventOf).filter((x): x is StageEvent => !!x)).catch(() => null);
    // a tick in force the journal does not show (it could not be read): the ticks in force instead
    const ticksFromJournal = !!ticks && RECORD_STAGES.every((no) => !s.lifecycle?.stages?.[no] || ticks.some((t) => t.stage === no && t.done));
    const transfer = await listCorrections(id).then((c) => schemeTransferState(s, c)).catch(() => null);
    recordView = {
      record: processingRecord({ designations, stageEvents: ticksFromJournal ? ticks : null, stages: s.lifecycle?.stages ?? {}, exports: s.analysisExports, imports: s.analysisImports, checks: s.transferChecks }),
      ticksFromJournal, transfer,
    };
  }
  // 7.4: issuing the report — what the act needs, the R editions, who received which (D7)
  let issueView: { ready: { approved: boolean; report: { version: string } | null; problem: IssueProblem | null }; rows: RecipientRow[] | null; correctable: { version: string; problem: IssueProblem | null } | null; showReasons: boolean } | null = null;
  if (recordView) {
    const issues = s.reportIssues ?? [];
    const inForceReport = reportInForce({ report: s.uploads?.report, active: s.docActive?.report ?? null, imports: s.analysisImports });
    const version = inForceReport ? s.uploads?.report?.analysisVersion ?? "" : "";
    let rows: RecipientRow[] | null = null;
    if (issues.length) {
      try {
        // the laboratories' openings (the journal, read strictly) and the notices raised (1.8)
        const [opened, notices] = await Promise.all([
          listActivity({ schemeId: id, action: "file.downloaded", subjects: issues.map((i) => `edition:${i.editionId}`), limit: 1000, strict: true }),
          listNoticesForScheme(id),
        ]);
        const openings = opened.filter((e) => !!e.targetCode).map((e) => ({ code: e.targetCode!, editionId: (e.subject ?? "").replace(/^edition:/, ""), at: e.at }));
        rows = recipients({
          codes: participantsNow.filter((p) => inFinalRound(s, p)).map((p) => p.code), access: s.reportAccess, issues, openings,
          notices: notices.filter((n) => n.kind === "report.issued" && n.audience === "lab").map((n) => ({ code: n.code, bg: n.bg, at: n.createdAt })),
        });
      } catch { rows = null; }
    }
    issueView = {
      ready: { approved: !!s.lifecycle?.stages?.["16"], report: inForceReport ? { version } : null, problem: transferProblem(recordView.transfer, !!inForceReport) },
      rows,
      correctable: s.status === "report" && issues.length ? { version, problem: correctionProblem(issues, recordView.transfer, !!inForceReport) } : null,
      showReasons: await mayNow("names.view", id),
    };
  }
  // 7.1: who may export to 2.0 — and what the file will lack (the codes whose results came by a sheet; the meta)
  const mayExport = ((await mayNow("results.process", id)) || (await mayNow("results.enter", id))) && (["running", "processing", "report", "closed"].includes(s.status) || (s.type === "C" && s.status === "open"));
  let analysisLink: { preliminary: boolean; outside: string[] | null; gaps: string[]; extra: ReturnType<typeof analysisGaps> } | null = null;
  if (mayExport) {
    const lk = lockInForce(s.submissionLocks);
    let outside: string[] | null;
    // from the lock's own entries once locked; before it, a light read of who submitted (ids only —
    // never every payload on every page load: 7.1 review); a read that fails: «could not check»
    if (lk) outside = lk.entries.filter((e) => e.version === null && e.via).map((e) => e.code);
    else {
      try { const ids = await submittedParticipantIds(id); outside = goingOn.filter((p) => !ids.has(p.id) && resultsOutsideForm(s.labUploads, p)).map((p) => p.code); } catch { outside = null; }
    }
    analysisLink = { preliminary: !lk, outside, gaps: metaGaps(s), extra: analysisGaps(s, goingOn) };
  }
  const ACTS_IN: Record<string, ActKey[]> = {
    draft: ["open"], open: ["announce", "not_held", "back"], running: ["announce2", "process", "back"],
    processing: ["report", "back"], report: ["close"], closed: ["back"], not_held: ["back"],
  };
  const CONFIRM: Record<ActKey, [string, string]> = {
    open: ["Схемата се отваря: лабораториите я виждат и заявяват участие. Продължаваме?", "The scheme opens: laboratories see it and apply. Go ahead?"],
    announce: ["Първо обявяване: схемата ще се проведе. Продължаваме?", "First announcement: the scheme will run. Go ahead?"],
    not_held: ["Схемата не се състои: всички участници се уведомяват и нищо не се фактурира. Продължаваме?", "The scheme is not held: every participant is told and nothing is invoiced. Go ahead?"],
    announce2: ["Второ обявяване: окончателният списък на участниците. Продължаваме?", "Second announcement: the final list of participants. Go ahead?"],
    process: ["Обработката започва — подаването се заключва за всички, включително отключените след срока. Продължаваме?", "Processing starts — the submission is locked for everyone, those unlocked after the deadline included. Go ahead?"],
    report: ["Окончателният доклад става достъпен за всички участници и те се уведомяват. Продължаваме?", "The final report becomes available to every participant, and they are told. Go ahead?"],
    close: ["Записите по схемата се приключват. Продължаваме?", "The scheme's records are closed. Go ahead?"],
    back: ["Схемата се връща към предишното състояние. Основанието се записва. Продължаваме?", "The scheme steps back to its previous state. The reason is recorded. Go ahead?"],
  };
  // the second announcement of the CURRENT run (a step back and a new first start a new one)
  const announced2 = !!currentSecondAnnouncement(s);
  // a calibration's reference values per point (5.7): what 2.0 still lacks; who may open them
  const refMissing = type === "C" ? missingFor2(pointKeys(s.calibration), currentRows(s.referenceValues)) : null;
  const refGap = refMissing && (refMissing.before || refMissing.after || refMissing.uCal) ? refMissing : null;
  const canReference = type === "C" && ((await mayNow("results.read", id)) || (await mayNow("scheme.edit", id)) || (await mayNow("results.process", id)));
  // the first announcement against the scheme's minimum — below it, a warning, and the
  // count kept with the act (5.2; Реш. 129: PTS decides — «не се състои» is its act)
  const belowMin = inRoundNow.length < s.minParticipants;
  const finalList = currentFinalList(s);
  const proformasSent = Object.values(s.labDocs ?? {}).filter((d) => !!d?.proforma).length;
  // the coding act (5.3): who may, who waits, what was drawn
  const codedAtAct = codeMoment(s) === "coding-act";
  const showCoding = codedAtAct && (s.status === "running" || !!s.coding?.length) && (await mayNow("codes.view", id));
  const canCode = showCoding && (await mayNow("results.enter", id));
  const codingWhy = codingProblem(s, participantsNow);
  // an act whose follow-up did not finish (no «code assigned» on a case file) — completed by pressing again
  const codingPending = showCoding && s.coding?.length
    ? unfinished(s.coding, participantsNow, new Set((await listCaseEventsForScheme(id)).filter((e) => e.kind === "code_assigned" && !e.voidedAt).map((e) => e.code))).length
    : 0;
  const givenObjects = objectsGiven(s.coding);
  const freeObjects = s.type === "T" ? (s.batches ?? []).reduce((a, b) => a + b.objects.filter((o) => o.role === "participant" && !givenObjects.has(o.code)).length, 0) : null;
  const finalAct = finalList ? currentSecondAnnouncement(s) : undefined;
  // 6.6 «Заключи подаването» (Реш. 21): what the lock will record — each participation on the final
  // list, its latest submitted version, its results received outside the form (a sheet — not N/R),
  // or none (N/R) — and whose deadline still runs (the act then needs its note); by code
  let lockPreview: ReturnType<typeof lockEntries> | null = null, lockStillOpen: string[] = [];
  if (canAct && s.status === "running") {
    try {
      const versionsNow = await listSubmissions(id);
      lockPreview = lockEntries(goingOn, versionsNow, new Set(goingOn.filter((p) => resultsOutsideForm(s.labUploads, p)).map((p) => p.id)));
      const nowL = schemeNowMs(s), todayL = sofiaToday(nowL);
      lockStillOpen = lockPreview.filter(isNR).filter((e) => submissionOpen(resultsDeadline(s, e.code).at, nowL, activeUnlock(s.resultUnlocks, e.participantId, todayL)).open).map((e) => e.code);
    } catch { lockPreview = null; }
  }
  const lockSay = lockPreview ? (() => {
    const n = lockCounts(lockPreview), nrCodes = lockPreview.filter(isNR).map((e) => e.code);
    return L(`Подаването се заключва: ${n.taken} с подадена версия, ${n.outside} получени извън формуляра (лист), ${n.nr} без резултат${n.nr ? ` — N/R: ${nrCodes.join(", ")}` : ""}.${lockStillOpen.length ? ` Формулярът още е отворен за ${lockStillOpen.join(", ")} (срокът не е изтекъл или не е зададен) — заключването иска основание.` : ""} След това резултат не се приема (Реш. 21).`,
      `The submission is locked: ${n.taken} with a submitted version, ${n.outside} received outside the form (a sheet), ${n.nr} without results${n.nr ? ` — N/R: ${nrCodes.join(", ")}` : ""}.${lockStillOpen.length ? ` The form is still open for ${lockStillOpen.join(", ")} (its deadline has not passed, or none is set) — locking needs a reason.` : ""} After it no result is accepted (Реш. 21).`);
  })() : L("Подадените версии не можаха да се прочетат — какво ще запише заключването не е известно.", "The submitted versions could not be read — what the lock will record is not known.");
  const acts: ActButton[] = !canAct ? [] : (ACTS_IN[s.status] ?? [])
    .filter((a) => a !== "announce2") // the second announcement has its own form (5.2)
    .map((a) => {
      const p = actProblem(s, a, "-----", s.type === "C" ? goingOn.map((x) => x.code) : undefined);
      const back = a === "back" ? BACK_TO[s.status] : undefined;
      return {
        act: a,
        label: a === "back" && back ? `${L("Върни към", "Back to")} «${STATE_LABEL[back][lg]}»` : ACTS[a][lg],
        note: ACTS[a].note,
        confirm: a === "back" && finalList
          ? L(`Схемата се връща към «Отворена». Окончателният списък отпада — участниците не се уведомяват автоматично${proformasSent ? `, а ${proformasSent} изпратени проформи остават при лабораториите` : ""}. Основанието се записва. Продължаваме?`, `The scheme steps back to «Open». The final list is undone — the participants are not told automatically${proformasSent ? `, and ${proformasSent} proformas sent stay with the laboratories` : ""}. The reason is recorded. Go ahead?`)
          : a === "announce" && belowMin
          ? L(`В кръга са ${inRoundNow.length} участия — под минималния брой на схемата (${s.minParticipants}). По Реш. 129 такава схема не се състои. Ако все пак се провежда, това се записва с броя. Продължаваме?`, `${inRoundNow.length} participations are in the round — below the scheme's minimum (${s.minParticipants}). By Реш. 129 such a scheme is not held. If it runs all the same, that is recorded with the count. Go ahead?`)
          : a === "process" ? `${lockSay} ${CONFIRM[a][lg === "bg" ? 0 : 1]}`
          : a === "back" && s.status === "processing" ? L("Обработката се връща към «В процес»: подаването се отваря отново — формулярът следва срока за резултати и отключванията, които още текат; записаните като N/R се уведомяват. Основанието се записва. Продължаваме?", "Processing steps back to «In progress»: the submission opens again — the form follows the results deadline and the unlocks still running; those recorded N/R are told. The reason is recorded. Go ahead?")
          : CONFIRM[a][lg === "bg" ? 0 : 1],
        warn: a === "announce" && belowMin ? L(`под минималния брой: ${inRoundNow.length} от ${s.minParticipants} участия в кръга`, `below the minimum: ${inRoundNow.length} of ${s.minParticipants} participations in the round`)
          // a calibration's reference values not all in for 2.0 (5.7) — a warning, PTS decides
          : a === "process" ? [lockSay, refGap ? L(`референтните стойности не са пълни за 2.0: преди — ${refGap.before}, след — ${refGap.after}, u (калибриране) — ${refGap.uCal} точки`, `the reference values are not complete for 2.0: before — ${refGap.before}, after — ${refGap.after}, u (calibration) — ${refGap.uCal} points`) : ""].filter(Boolean).join(" · ")
          : undefined,
        blocked: p ? ACT_PROBLEM_TEXT[p][lg] : a === "process" && uncodedOnList ? CODING_PROBLEM_TEXT.uncoded[lg] : undefined,
        danger: a === "not_held" || a === "back",
      };
    });
  const history = (s.lifecycle?.acts ?? []).slice().reverse().map((a) => ({
    label: `${ACTS[a.act][lg]}: ${STATE_LABEL[a.from][lg]} → ${STATE_LABEL[a.to][lg]}${a.final ? L(` — ${a.final.participants.length} в окончателния списък`, ` — ${a.final.participants.length} on the final list`) : ""}${a.count ? L(` — ${a.count.inRound} в кръга при минимум ${a.count.min}`, ` — ${a.count.inRound} in the round, minimum ${a.count.min}`) : ""}`, day: fmtDay(a.day), by: who(a.by) ?? "", note: a.note,
  }));

  // each document's latest edition (part 3.0) — the list is the scheme's, latest first
  const editions = await listEditions(id);
  const latestOf = (key: string) => editions.find((e) => e.docKey === key);

  // Resolve each document's state: is there an app-built version, an uploaded file,
  // and which one is active/official (uploaded wins when present unless switched).
  // the certificate is an issued document, not a form: no form number (Q23)
  const formLabel = (f: string) => (f === "internal" ? L("вътрешен", "internal") : f === "" ? L("без номер на формуляр", "no form number") : f);
  const rowFor = (key: string): DocRow => {
    const def = getDoc(key)!;
    const isForm = isFormDoc(key);
    const isList = isListDoc(key);
    const hasUpload = !!s.uploads?.[key];
    const hasBuilt = hasDocContent(s, key);
    const pref = s.docActive?.[key];
    let active: DocSource = "none";
    if (hasUpload && pref !== "built") active = "uploaded";
    else if (hasBuilt) active = "built";
    else if (hasUpload) active = "uploaded";
    return {
      key,
      name: lang === "bg" ? def.nameBg : def.nameEn,
      form: formLabel(def.formNumber),
      isForm,
      isList,
      hasBuilt,
      hasUpload,
      active,
      // a started editor-doc is only "Готов" when explicitly marked (lib/documents isDocDone)
      done: isDocDone(s, key),
      uploadName: s.uploads?.[key]?.name,
      // may this one go out to the participants, and has it? (lib/doc-release)
      sendable: isSendableDoc(key),
      sentAt: s.sentToParticipants?.[key] ? fmtPhaseDate(s.sentToParticipants[key].slice(0, 10)) : undefined,
      sentCopy: !!s.sentToParticipants?.[key] && !!s.releasedEditions?.[key],
      // its editions (3.0): the latest one, and the one the participants hold
      edition: hasEditions(key) && latestOf(key) ? { no: latestOf(key)!.no, date: fmtDay(latestOf(key)!.issuedOn) } : undefined,
      sentEdition: s.sentToParticipants?.[key] ? s.releasedEditions?.[key]?.no : undefined,
      editionsHref: hasEditions(key) ? `/schemes/${id}/editions?doc=${key}#${key}` : undefined,
      buildHref: isForm ? `/schemes/${id}/fill/${key}` : `/schemes/${id}/build/${key}`,
      // the lists open on their live auto view (DocViewer: preview + PDF)
      viewHref: isList ? `/schemes/${id}/doc/${key}` : undefined,
    };
  };
  // The three auto lists (F 7.2.1-4/-5/-6) live in their own section at the
  // bottom — they're generated from live data, not worked through stages.
  const stages: DocStageView[] = DOC_STAGES.map((stage) => ({
    key: stage.key,
    label: lang === "bg" ? stage.bg : stage.en,
    // the Order: only for the staff it assigns roles to (Реш. 149, 2.6)
    docs: stage.docs.filter((k) => !isListDoc(k) && (seesOrder || k !== ORDER_DOC)).map(rowFor),
  }));
  // F 7.2.1-6 (names ↔ codes) is listed for a manager only — it is refused to others
  const lists: DocRow[] = DOC_STAGES.flatMap((st) => st.docs)
    .filter((k) => isListDoc(k) && (canManage || !isRestrictedDoc(k)))
    .map(rowFor);

  // Progress counts only the worked documents — the auto lists always exist.
  const allDocs = stages.flatMap((x) => x.docs);
  const ready = allDocs.filter((d) => d.done).length;
  const uploaded = allDocs.filter((d) => d.active === "uploaded").length;
  const built = allDocs.filter((d) => d.active === "built").length;
  const total = allDocs.length;
  const pct = Math.round((ready / total) * 100);

  const menuRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)", textDecoration: "none" };

  return (
    <ExplorerShell
      active={{ type, folderId: s.folderId, schemeId: id }}
      breadcrumb={[
        { label: tr("common.home"), href: "/" },
        { label: typeLabel(type, lang), href: `/files/${slug}` },
        ...chain.map((f) => ({ label: f.name, href: `/files/${slug}/f/${f.id}` })),
        { label: schemeName(s) },
      ]}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 26, color: ac.accent, letterSpacing: "-.01em", lineHeight: 1.12 }}>{schemeName(s)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>{s.number}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
          </div>
          {/* what the number carries, kept as fields (Реш. 102, 3.1) */}
          <div data-scheme-markers style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            <span data-marker="kind">{marks.kind}</span> · <span data-marker="activity">{marks.activity}</span> · <span data-marker="accredited">{marks.accredited}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/schemes/${id}/edit`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.editData")}</Link>
          <Link href={`/schemes/${id}/participants`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.participants")}</Link>
          <Link href={`/schemes/${id}/traceability`} className="btn" style={{ fontSize: 13 }}>{tr("trace.title")}</Link>
          <Link href={`/schemes/${id}/editions`} className="btn" style={{ fontSize: 13 }}>{L("Редакции", "Editions")}</Link>
          <Link href={`/schemes/${id}/amendments`} className="btn" style={{ fontSize: 13 }}>{L("Изменения", "Amendments")}{s.amendments?.length ? ` (${s.amendments.length})` : ""}</Link>
          {type === "T" && <Link href={`/schemes/${id}/batches`} className="btn" style={{ fontSize: 13 }}>{L("Партиди", "Batches")}{s.batches?.length ? ` (${s.batches.length})` : ""}</Link>}
          <Link href={`/schemes/${id}/results`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.results")}</Link>
          <SkinPicker schemeId={id} current={s.skin ?? "classic"} skins={skins.map((k) => ({ id: k.meta.id, name: k.meta.name }))} />
          <ManageMenu label={L("Управление", "Manage")}>
            {canManage && <Link href={`/schemes/${id}/applications`} className="hoverrow" style={menuRow}>📥 {tr("scheme.applications")}</Link>}
            <Link href={`/activity?scheme=${id}`} className="hoverrow" style={menuRow}>🕑 {tr("activity.viewForScheme")}</Link>
            <a href={`/schemes/${id}/audit-pack?lang=${lang}`} target="_blank" rel="noopener" className="hoverrow" style={menuRow}>⇩ {tr("activity.auditPack")}</a>
            {/* the whole round (part 1.10, Реш. 136) — a manager's, journalled */}
            {canManage && <a href={`/schemes/${id}/export`} data-export="all" className="hoverrow" style={menuRow}>⇩ {tr("export.round")}</a>}
            {canManage && <a href={`/schemes/${id}/export?part=coded`} data-export="coded" className="hoverrow" style={menuRow}>⇩ {tr("export.coded")}</a>}
            <div style={{ height: 1, background: "var(--line)", margin: "4px 2px" }} />
            <div style={{ padding: "2px 4px" }}><FolderActions schemeId={id} name={s.name?.trim() || schemeName(s)} /></div>
          </ManageMenu>
        </div>
      </div>

      {/* progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", margin: "16px 0 6px", flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{L("Готови:", "Ready:")} <b style={{ color: "#3d6b47", fontVariantNumeric: "tabular-nums" }}>{ready} / {total}</b></div>
        <div style={{ flex: 1, minWidth: 120, height: 8, borderRadius: 999, background: "var(--surface-2,#f1f4ee)", overflow: "hidden", border: "1px solid var(--line)" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#2b6744,#234f36)", borderRadius: 999 }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: "#57823c", marginRight: 5 }} />{L("създадени", "built")} {built}</span>
          <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: "#2f6f8f", marginRight: 5 }} />{L("качени", "uploaded")} {uploaded}</span>
          <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: "var(--line)", marginRight: 5 }} />{L("предстоят", "pending")} {total - ready}</span>
        </div>
      </div>

      {/* the 19 stages and the scheme's state (3.2) */}
      <SchemeLifecycle schemeId={id} lang={lg} stateLabel={STATE_LABEL[s.status][lg]} stages={stageRows} acts={acts} history={history} />
      {/* 7.1: the export to PTS_Analysis 2.0 — the template's sheets, codes only */}
      {mayExport && analysisLink && (
        <div className="text-sm mt-2" data-analysis-export>
          <a href={`/schemes/${id}/export/analysis`} style={{ fontWeight: 700 }} data-analysis-export-link>{L("Изнеси към PTS_Analysis 2.0 (XLSX, schema 2.1) →", "Export to PTS_Analysis 2.0 (XLSX, schema 2.1) →")}</a>
          {analysisLink.preliminary && <span style={{ color: "#7a5416" }}> {L("— предварително: подаването още не е заключено", "— preliminary: the submission is not locked yet")}</span>}
          {analysisLink.outside === null ? <div data-analysis-outside-unread style={{ color: "#8f2f2f" }}>{L("Не можа да се провери кои резултати са дошли извън формуляра — презаредете.", "Which results came outside the form could not be checked — reload.")}</div>
            : analysisLink.outside.length > 0 && <div data-analysis-outside style={{ color: "#7a5416" }}>{L(`Резултатите на ${analysisLink.outside.join(", ")} са дошли извън формуляра (лист) — във файла няма редове за тях; попълват се ръчно.`, `The results of ${analysisLink.outside.join(", ")} came outside the form (a sheet) — the file has no rows for them; they are typed in by hand.`)}</div>}
          {analysisLink.extra.provisional.length > 0 && <div data-analysis-provisional style={{ color: "#8f2f2f" }}>{L(`Не се изнася: ${analysisLink.extra.provisional.join(", ")} са още с временен номер — първо кодирането (5.3).`, `Not exported: ${analysisLink.extra.provisional.join(", ")} still have a provisional reference — the coding act first (5.3).`)}</div>}
          {analysisLink.gaps.length > 0 && <div data-analysis-gaps style={{ color: "#7a5416" }}>{L("Липсва за 2.0: ", "Missing for 2.0: ")}{analysisLink.gaps.map((g) => META_GAP_TEXT[g]?.[lg] ?? g).join("; ")}</div>}
          {analysisLink.extra.sigmaMismatch.length > 0 && <div data-analysis-sigma style={{ color: "#7a5416" }}>{L(`σpt,min се различава между статистическия проект и полето за 2.0 при ${analysisLink.extra.sigmaMismatch.join(", ")} — във файла влиза полето за 2.0.`, `σpt,min differs between the statistical project and the 2.0 field for ${analysisLink.extra.sigmaMismatch.join(", ")} — the file carries the 2.0 field.`)}</div>}
          {analysisLink.extra.homogeneityDropped > 0 && <div data-analysis-homogeneity style={{ color: "#7a5416" }}>{L(`${analysisLink.extra.homogeneityDropped} стойности за хомогенност са на характеристики, които не са във файла — не влизат.`, `${analysisLink.extra.homogeneityDropped} homogeneity values are of characteristics not in the file — left out.`)}</div>}
        </div>
      )}
      {/* 7.2: what came back from PTS_Analysis 2.0 — the documents as files, with the module's version */}
      {(mayImport || ((mayReview || canAct) && (s.analysisImports?.length ?? 0) > 0)) && ["processing", "report", "closed"].includes(s.status) && (
        <AnalysisImportPanel schemeId={id} lang={lg === "bg" ? "bg" : "en"} imports={s.analysisImports ?? []} canImport={mayImport} answer={sp.imp} />
      )}
      {/* 7.3: the processing record and the transfer check */}
      {recordView && issueView && (
        <ReportIssueCard schemeId={id} lang={lg === "bg" ? "bg" : "en"} status={s.status} ready={issueView.ready} issues={s.reportIssues ?? []} rows={issueView.rows}
          canAct={canAct} correctable={issueView.correctable} answer={sp.ri} codesNotReached={(issueView.rows ?? []).filter((r) => !r.access).map((r) => r.code)} showReasons={issueView.showReasons} />
      )}
      {recordView && (
        <ProcessingRecordCard schemeId={id} lang={lg === "bg" ? "bg" : "en"} record={recordView.record} ticksFromJournal={recordView.ticksFromJournal}
          transfer={recordView.transfer} imports={s.analysisImports ?? []} canCheck={mayImport} answer={sp.tc} />
      )}
      {/* 6.7: PTS's review after the deadline — a staff page, never shown to a laboratory */}
      {mayReview && (["running", "processing", "report", "closed"].includes(s.status) || (s.type === "C" && s.status === "open")) && (
        <p className="text-sm mt-2" data-review-link><Link href={`/schemes/${id}/review`} style={{ fontWeight: 700 }}>{L("Преглед след срока — трите проверки и индивидуалните забележки →", "Review after the deadline — the three checks and the individual notes →")}</Link></p>
      )}
      {/* the second announcement (5.2): which characteristics run, and so the final list */}
      {canAct && s.status === "running" && !announced2 && (
        <SecondAnnouncementForm lang={lg} schemeId={id} min={MIN_PER_CHARACTERISTIC} inRound={inRoundNow.length}
          parts={inRoundNow.map((p) => characteristicsOf(selectionsOf(p, s.parameters.length)))}
          deadline={s.dates?.applicationsDue ? fmtSchemeDate(s.dates.applicationsDue) : undefined}
          deadlinePassed={!s.dates?.applicationsDue || s.dates.applicationsDue.slice(0, 10) < sofiaToday(schemeNowMs(s))}
          characteristics={s.parameters.map((x, i) => ({ i, label: characteristicLabel(x, lg), count: countsPerCharacteristic(inRoundNow, s.parameters.length)[i] ?? 0 }))} />
      )}
      {finalList && (
        <div data-final-list data-final-count={finalList.participants?.length ?? inRoundNow.length} className="card" style={{ padding: "10px 16px", margin: "0 0 14px", background: "#fff", fontSize: 13 }}>
          <b style={{ color: "var(--green-dark)" }}>{L("Окончателен списък", "Final list")}</b>{finalAct?.day ? ` (${fmtDay(finalAct.day)})` : ""}:{" "}
          {L(`${finalList.participants?.length ?? inRoundNow.length} участия`, `${finalList.participants?.length ?? inRoundNow.length} participations`)}
          {finalList.runs && finalList.runs.length > 0 && <> · {L("провеждат се", "running")}: <span data-final-runs>{finalList.runs.map((i) => s.parameters[i] ? characteristicLabel(s.parameters[i], lg) : `#${i + 1}`).join("; ")}</span></>}
          {finalAct?.final && finalAct.final.dropped.length > 0 && <> · {L("отпадат", "dropped")}: <span data-final-dropped>{finalAct.final.dropped.map((i) => s.parameters[i] ? characteristicLabel(s.parameters[i], lg) : `#${i + 1}`).join("; ")}</span></>}
          {" · "}<span style={{ color: "var(--muted)" }}>{L("проформите — само за участията в него (Реш. 65)", "proformas — only to the participations on it (Реш. 65)")}</span>
        </div>
      )}
      {showCoding && (
        <CodingPanel lang={lg} schemeId={id} canCode={canCode} waiting={toCode(s, participantsNow).length} pending={codingPending} pool={freeObjects}
          blocked={codingWhy && codingWhy !== "none" && codingWhy !== "admission" ? CODING_PROBLEM_TEXT[codingWhy][lg] : undefined}
          done={(s.coding ?? []).map((r) => ({ day: fmtDay(r.day), by: who(r.by) ?? "", rows: Object.entries(r.codes).map(([ref, code]) => ({ ref, code, objects: r.objects?.[code] ?? [] })) }))} />
      )}

      {/* the operational dates — separate from the Plan's printed schedule */}
      <SchemeDates schemeId={id} lang={lang} initial={s.dates ?? {}} byAmendment={needsAmendment(s)} />

      {/* the round's movable clock — the test environment only (1.3) */}
      {isTestEnvironment() && <SchemeTestClock schemeId={id} lang={lang} offsetMs={clockOffsetMs(s)} />}

      {/* the reference values per point, before and after the participants (5.7) */}
      {type === "C" && canReference && (
        <div className="mt-3 text-sm" data-reference-link>
          <Link href={`/schemes/${id}/reference`} className="btn btn-sm">{lang === "bg" ? "Референтни стойности по точки" : "Reference values per point"}{s.referenceValues?.versions?.length ? ` · ${lang === "bg" ? "версия" : "version"} ${s.referenceValues.versions.length}` : ""}</Link>
        </div>
      )}

      {/* the calibration chain — the only screen that sees the whole order */}
      {type === "C" && (
        <SchemeChainPanel
          schemeId={id}
          lang={lang}
          rows={(s.chain?.stops ?? []).map((st) => ({
            id: st.id, kind: st.kind, code: st.code,
            frozen: !!st.receivedAt, holding: !!st.receivedAt && !st.sentAt,
            receivedAt: st.receivedAt, sentAt: st.sentAt,
            // who recorded each step and how — never the PTS member's e-mail
            received: st.received ? { by: st.received.by, source: st.received.source, note: st.received.note } : undefined,
            sent: st.sent ? { by: st.sent.by, source: st.sent.source, note: st.sent.note } : undefined,
            // its window (3.4) — overdue a state, never a block
            due: (() => {
              const w = st.kind === "lab" ? chainWindow(s, st, offDays) : null;
              if (!w) return undefined;
              const state = deadlineState(w.due, st.sentAt, schemeNowMs(s));
              return { text: fmtSchemeDate(w.due), orderNo: w.ext?.orderNo, overdue: state === "overdue", late: state === "late" };
            })(),
          }))}
          windowDays={windowDays(s)}
          windowEditable={!needsAmendment(s)}
          participantCodes={participantsNow.map((p) => p.code)}
          refLabName={(lang === "bg" ? s.calibration?.referenceLabBg : s.calibration?.referenceLabEn) ?? ""}
          daysPerLab={s.chain?.daysPerLab}
          clockOffsetMs={clockOffsetMs(s)}
          dispatchedAt={s.chain?.dispatchedAt}
          returnedAt={s.chain?.returnedAt}
        />
      )}

      <SchemeProcessing schemeId={id} current={processing.current ? view(processing.current) : null} stale={processing.problems.length > 0}
        history={designations.filter((d) => d.endedAt).reverse().map(view)} candidates={candidates} canDesignate={canDesignate} />

      {/* the portal prints the mark by the status; a file PTS uploads it cannot read —
          so outside the scope, a reminder where the report is uploaded (3.9 review) */}
      {(() => {
        const st = markState(s);
        return st === "mark" ? null : (
          <div className="card p-3 mt-3 text-sm" data-mark-upload-note style={{ background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12" }}>
            {st === "na"
              ? (lang === "bg" ? "Схемата е извън обхвата на акредитацията (NA). Докладът и сертификатите, които качвате, не бива да носят знака на SNAS или ILAC-MRA — порталът не може да провери качен файл." : "The scheme is outside the accreditation (NA). The report and certificates you upload must not carry the SNAS or ILAC-MRA mark — the portal cannot check an uploaded file.")
              : st === "sim"
              ? (lang === "bg" ? "Симулационен кръг: качените документи не бива да носят знак за акредитация." : "A simulation round: uploaded documents must not carry an accreditation mark.")
              : (lang === "bg" ? "Статутът на акредитация не е посочен (в «Редактирай данните»): докато не е, качените доклад и сертификати не бива да носят знак за акредитация." : "The accreditation status is not stated (in «Edit data»): until it is, an uploaded report or certificate must not carry an accreditation mark.")}
          </div>
        );
      })()}
      <SchemeDocuments schemeId={id} lang={lang} stages={stages} lists={lists} />
      {/* 5.9: which documents ask to be acknowledged, and how many have — counts, no code named */}
      {(() => {
        const going = isStarted(s) ? participantsNow.filter((p) => inFinalRound(s, p)) : [];
        const rows = SENDABLE_DOCS.map((k) => {
          const reaching = going.flatMap((p) => { const r = releaseFor(s, k, { participantIds: [p.id] }); return r ? [{ participantId: p.id, editionId: r.editionId }] : []; });
          const d = getDoc(k);
          return { key: k, name: d ? (lang === "bg" ? d.nameBg : d.nameEn) : k, required: ackRequiredFor(s, k), settable: ackSettable(k), ...ackCounts(s, k, reaching), personal: personalAcks(s, k) };
        });
        return <AckPanel schemeId={id} lang={lang} rows={rows} canEdit={canAct} started={isStarted(s)} notice={ackNotice} />;
      })()}
      {/* 5.10: a one-way message to every participation going on (Реш. 116) — by who works with
          the participants here, once the scheme has started */}
      {canManage && isStarted(s) && (
        <MessageComposer action={sendSchemeMessageAction} hidden={{ schemeId: id }} lang={lang}
          title={lang === "bg" ? "Съобщение до всички участници" : "Message to every participant"}
          to={lang === "bg" ? "до всички участия в ход (в кръга и в окончателния списък)" : "to every participation going on (in the round and on the final list)"}
          answer={sp.msg} answerExtra={sp.n && sp.of ? (lang === "bg" ? `${sp.n} от ${sp.of}` : `${sp.n} of ${sp.of}`) : undefined}
          // the codes as they are now — the coding act re-keys them (5.3)
          history={[...(s.messages ?? [])].reverse().map((m) => ({ id: m.id, at: ackMoment(m.at), to: messageTargetLabel(m.to, lang, (pid) => participantsNow.find((p) => p.id === pid)?.code ?? "—"), bg: m.bg, en: m.en }))} />
      )}
    </ExplorerShell>
  );
}
