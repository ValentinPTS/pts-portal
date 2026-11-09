import Link from "next/link";
import { isProvisional } from "@/lib/coding-model";
import { inFinalRound } from "@/lib/announcement-model";
import { writtenInstructions } from "@/lib/docs/instruction-common";
import { requireLab } from "@/lib/lab-auth";
import { isStarted, listVisibleParticipations } from "@/lib/visibility";
import { ONLINE_APPLICATIONS_OPEN, PDF_APPLICATION_URL } from "@/lib/online-applications";
import { listCaseEvents } from "@/lib/case-events";
import { listSchemes } from "@/lib/store";
import { statusChip } from "@/lib/folders";
import { computeLabPhases, fmtPhaseDate, canLabUploadNow, LAB_UPLOAD_SLOTS } from "@/lib/lab-phases";
import { amendmentLine } from "@/lib/amendments-model";
import { LAB_DOC_SLOTS } from "@/lib/doc-release";
import { docsFor } from "@/lib/release-model";
import { labState, positionOf, nextStopFor, estimatedWaitDays, describeWait, isIncomingFor } from "@/lib/chain";
import { listParticipants, withIdentities } from "@/lib/participants";
import { actorNow } from "@/lib/identities";
import DeviceChainCard from "@/components/DeviceChainCard";
import type { Scheme } from "@/lib/types";
import { DATE_LABELS, fmtSchemeDate, setDates, isPast } from "@/lib/scheme-dates";
import { resultsDeadline, deadlineState, chainWindow, resultsSubmittedAt } from "@/lib/deadlines-model";
import { holidaySet } from "@/lib/holidays";
import { getDoc } from "@/lib/documents";
import { labUploadDocAction } from "@/lib/actions";
import { signOutLabAction } from "@/lib/auth-actions";
import { listForLab, withReadState, readerKey } from "@/lib/notifications";
import { EmptyState } from "@/components/States";
import LabSchemeTabs from "@/components/LabSchemeTabs";
import LanguageToggle from "@/components/LanguageToggle";
import NotificationBell from "@/components/NotificationBell";
import { getServerT } from "@/lib/i18n-server";
import { labCertificate } from "@/lib/cert-number";
import { schemeNowMs } from "@/lib/clock";

export const dynamic = "force-dynamic";

// ── The calibration chain, resolved for ONE laboratory ───────────────────────
// §4.2 lives here. A laboratory may learn the name and address of exactly ONE
// other participant — the stop it must ship to — and only once the device is in
// its hands. So this resolves a single code, and only in the "holding" state.
// Everything else it returns is position and timing, which name nobody.
async function chainViewFor(scheme: Scheme, code: string, lang: "bg" | "en") {
  const chain = scheme.chain;
  if (scheme.type !== "C" || !chain?.stops?.length) return null;
  const state = labState(chain, code);
  if (state === "not-in-chain") return null;

  let next: { kind: "lab" | "ref" | "pts"; name?: string; address?: string; contact?: string; phone?: string } | null = null;
  if (state === "holding") {
    const idx = chain.stops.findIndex((s) => s.kind === "lab" && s.code === code && !!s.receivedAt && !s.sentAt);
    const ns = nextStopFor(chain, idx);
    if (!ns) {
      next = { kind: "pts" }; // last stop — it goes home
    } else if (ns.kind === "ref") {
      next = {
        kind: "ref",
        name: lang === "bg" ? scheme.calibration?.referenceLabBg : scheme.calibration?.referenceLabEn,
        address: lang === "bg" ? scheme.calibration?.referenceLabLocBg : scheme.calibration?.referenceLabLocEn,
      };
    } else {
      // ONE lookup, for ONE code — never the whole participant list into the view
      // names travel, codes don't: the holder sees where the device goes next — an
      // opening for dispatch by this laboratory, on record (2.3)
      const one = (await listParticipants(scheme.id)).filter((x) => x.code === ns.code);
      const np = one.length ? (await withIdentities(one, scheme.id, { actor: await actorNow(), purpose: "dispatch" }))[0] : undefined;
      next = { kind: "lab", name: np?.labName, address: np?.deliveryAddress, contact: np?.contact, phone: np?.phone };
    }
  }
  // its own window while it holds the instrument (3.4)
  let handOnBy: { dueText: string; days: number; orderNo?: string; overdue: boolean } | undefined;
  if (state === "holding") {
    const stop = chain.stops.find((s) => s.kind === "lab" && s.code === code && !!s.receivedAt && !s.sentAt);
    const w = stop ? chainWindow(scheme, stop, await holidaySet()) : null;
    if (w) handOnBy = { dueText: fmtSchemeDate(w.due), days: w.days, orderNo: w.ext?.orderNo, overdue: isPast(w.due, schemeNowMs(scheme)) };
  }
  return {
    handOnBy,
    state,
    position: positionOf(chain, code),
    wait: describeWait(estimatedWaitDays(chain, code), lang),
    started: !!chain.dispatchedAt,
    closed: !!chain.returnedAt,
    incoming: isIncomingFor(chain, code),
    next,
  };
}


// The lab-facing phase timeline logic lives in lib/lab-phases.ts (pure, tested);
// this page only renders it.

export default async function LabDashboard({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { lab, userId } = await requireLab();
  const { lang, tr } = await getServerT();
  const err = (await searchParams).e;
  const errText = err === "locked"
    ? (lang === "bg" ? "Файлът е заключен — резултатите за тази схема вече са оценени." : "The file is locked — this round has already been scored for you.")
    : err === "upload"
      ? (lang === "bg" ? "Качването не бе прието — използвайте PDF/PNG/JPG до 15 MB." : "Upload not accepted — use a PDF/PNG/JPG up to 15 MB.")
      : "";
  // only participations in schemes that have started (Реш. 147, part 0.3)
  const parts = await listVisibleParticipations(lab.id);
  const myIds = new Set(parts.map((p) => p.schemeId));
  // One fetch of all schemes serves BOTH the lab's own rounds (for its scores/docs)
  // and the public buckets it may browse — avoids a second targeted query for rows we
  // already have. Drafts are internal WIP and never shown to labs (confidentiality);
  // running/report rounds a lab isn't in are closed to new applicants, so not listed.
  const allSchemes = await listSchemes();
  // Nor a notice about a scheme that has not started — its number alone would tell.
  const unstarted = new Set(allSchemes.filter((s) => !isStarted(s)).map((s) => s.id));
  // a failed read of the feed shows none, logged — the lab's page still opens (1.1)
  // read as THIS sign-in read it (4.6, N28)
  const notifications = await withReadState((await listForLab(lab.id, 30).catch((e) => { console.error("[lab] notification feed:", (e as Error)?.message ?? e); return []; }))
    .filter((n) => !n.schemeId || !unstarted.has(n.schemeId)), readerKey.labAccount(userId)).catch(() => []);
  const schemes = allSchemes.filter((s) => myIds.has(s.id));
  const byId = new Map(schemes.map((s) => [s.id, s] as const));
  const openToJoin = allSchemes.filter((s) => s.status === "open" && !myIds.has(s.id));
  // No «upcoming» list: a scheme that has not started is not shown to labs at all
  // (Реш. 147) — the announced-draft tab is gone (part 0.3).
  const pastSchemes = allSchemes.filter((s) => s.status === "closed" && !myIds.has(s.id));

  const schemeName = (s: (typeof schemes)[number]) => s.name?.trim() || (lang === "bg" ? s.titleBg : s.titleEn) || s.number;

  const items = (await Promise.all(parts
    .map(async (p) => {
      const scheme = byId.get(p.schemeId);
      if (!scheme) return null;
      // the participation's own timeline — dates the phases below (auto + manual)
      const events = await listCaseEvents(p.schemeId, p.code);
      // No score of any kind is computed or shown here: the portal's engine never
      // reaches a participant (Реш. 135, part 0.6). The lab reads its scores in the
      // report PTS issues; from part 7.5 also from the values imported from 2.0.
      // The results deadline comes from the scheme's WORKING dates, not from the
      // schedule the owner prints into the Plan — that one is document content and
      // was never meant to drive the portal. Absent = not decided yet, shown as no
      // deadline rather than guessed at.
      // Its OWN deadline (3.4): its individual extension, else the scheme's — with the
      // hour and zone when it has one; overdue is said, never a block (Zadanie §9).
      const rd = resultsDeadline(scheme, p.code);
      const state = deadlineState(rd.at, resultsSubmittedAt(scheme, p.code, p.status), schemeNowMs(scheme));
      const deadline = rd.at
        ? fmtSchemeDate(rd.at)
          + (rd.ext ? (lang === "bg" ? ` — удължен по Заповед № ${rd.ext.orderNo}` : ` — extended by Order No. ${rd.ext.orderNo}`) : "")
          + (state === "overdue" ? (lang === "bg" ? " — срокът е изтекъл; свържете се с PTS" : " — the deadline has passed; contact PTS") : "")
        : "";
      return {
        p, scheme, events,
        // this participation's own proforma, if the provider has put one there
        invoice: scheme.labDocs?.[p.code]?.proforma,
        // the calibration chain, resolved for THIS laboratory only
        chain: await chainViewFor(scheme, p.code, lang),
        completed: scheme.status === "closed" || scheme.status === "not_held",
        reported: scheme.status === "report" || scheme.status === "closed",
        // the report reaches the lab only as the file PTS issued (Реш. 135)
        officialReport: !!scheme.uploads?.report,
        hasCert: !!labCertificate(scheme.certificates, p.code),
        deadline,
      };
    })))
    .filter((x): x is NonNullable<typeof x> => !!x);

  type Item = (typeof items)[number];

  const kv = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: "var(--ink)" }}>{value || "—"}</span>
    </div>
  );

  // The phase timeline: done phases with real dates from the case file, the
  // current phase highlighted (with "your move" when the lab must act), per-phase
  // document downloads. Collapsed for finished (closed) rounds via <details>.
  const Timeline = ({ it }: { it: Item }) => {
    const { phases, curIdx } = computeLabPhases(it.p.status, it.events, { reported: it.reported, hasCert: it.hasCert });
    return (
      <ol style={{ listStyle: "none", margin: "10px 0 2px", padding: 0 }}>
        {phases.map(({ ph, e, done }, i) => {
          const cur = i === curIdx;
          const dotStyle: React.CSSProperties = {
            position: "absolute", left: 0, top: 1, width: 18, height: 18, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700,
            background: done ? "#e3eeda" : cur ? "#faf2e0" : "#fff",
            color: done ? "#456b2c" : cur ? "#9a6b22" : "var(--muted)",
            border: `2px solid ${done ? "var(--green-dark)" : cur ? "#d9a53f" : "var(--line)"}`,
            boxShadow: cur ? "0 0 0 3px #faf2e0" : "none",
          };
          return (
            <li key={i} style={{ position: "relative", padding: "0 0 14px 30px" }}>
              {i < phases.length - 1 && (
                <span style={{ position: "absolute", left: 8, top: 20, bottom: -2, width: 2, background: done ? "var(--green-line, #cbd9be)" : "var(--line)" }} />
              )}
              <span style={dotStyle}>{done ? "✓" : i + 1}</span>
              <span style={{ fontSize: 13.5, fontWeight: done || cur ? 600 : 400, color: done || cur ? "var(--ink)" : "var(--muted)" }}>
                {lang === "bg" ? ph.bg : ph.en}
              </span>
              {e && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>
                  {fmtPhaseDate(e.at)}{e.ref ? ` · ${e.ref}` : ""}
                </span>
              )}
              {cur && ph.labMove && (
                <div style={{ margin: "6px 0 0", padding: "7px 10px", background: "#faf2e0", border: "1px solid #ecd9ae", borderRadius: 8, fontSize: 12.5, color: "#7a5416" }}>
                  <b>{lang === "bg" ? "Вашият ход:" : "Your move:"}</b> {lang === "bg" ? ph.labMove.bg : ph.labMove.en}
                  {it.deadline ? ` (${lang === "bg" ? "срок" : "deadline"}: ${it.deadline})` : ""}
                </div>
              )}
              {ph.uploadSlot && (done || cur) && (() => {
                // the lab's own upload slot for this phase: uploaded chip + replace,
                // or the upload form; locked (read-only) once the round is scored.
                const slot = ph.uploadSlot;
                const up = it.scheme.labUploads?.[it.p.code]?.[slot];
                // …and the scheme's state (3.2): no results from processing on, nothing
                // in a scheme closed or not held — the same rule the upload action keeps
                const st = it.scheme.status;
                const open = canLabUploadNow(it.p.status) && st !== "not_held" && st !== "closed"
                  && !(slot === "results" && (st === "processing" || st === "report"));
                return (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                    {up && (
                      <a href={`/lab/upload/${it.scheme.id}/${slot}`} target="_blank" rel="noreferrer"
                        className="btn btn-sm" style={{ fontSize: 11.5, padding: "3px 9px", borderColor: "var(--green-line, #cbd9be)", background: "#eef3ea", color: "#456b2c", fontWeight: 700 }}>
                        📄 {up.name}
                      </a>
                    )}
                    {up && (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        {(lang === "bg" ? "качен " : "uploaded ") + fmtPhaseDate(up.uploadedAt.slice(0, 10))}
                      </span>
                    )}
                    {open ? (
                      <form action={labUploadDocAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="schemeId" value={it.scheme.id} />
                        <input type="hidden" name="slot" value={slot} />
                        <input type="file" name="file" required accept="application/pdf,image/png,image/jpeg"
                          style={{ fontSize: 11.5, maxWidth: 210 }} />
                        <button type="submit" className="btn btn-sm" style={{ fontSize: 11.5, padding: "3px 9px", borderStyle: up ? "solid" : "dashed" }}>
                          ↑ {up
                            ? (lang === "bg" ? "Замени файла" : "Replace file")
                            : (lang === "bg" ? LAB_UPLOAD_SLOTS[slot].bg : LAB_UPLOAD_SLOTS[slot].en)}
                        </button>
                      </form>
                    ) : up ? (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{lang === "bg" ? "заключен след оценяване" : "locked after scoring"}</span>
                    ) : null}
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ol>
    );
  };

  // What the lab sees about its result: never a number or a verdict from the
  // portal (Реш. 135) — only where the official one is.
  const resultBlock = (it: Item, awaiting: string) => (
    <div style={{ background: "#f7faf8", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>
        {it.reported ? (it.officialReport ? tr("lab.resultInReport") : tr("lab.reportComing")) : awaiting}
      </span>
    </div>
  );

  // The scheme's working dates, as the laboratory sees them: what is coming and
  // when. A date that has passed is dimmed rather than flagged — the provider waits
  // for late results as a matter of course, and the portal must not nag about it.
  const datesStrip = (it: Item) => {
    const rows = setDates(it.scheme);
    if (!rows.length) return null;
    return (
      <div style={{ display: "flex", gap: "6px 18px", flexWrap: "wrap", padding: "8px 12px", background: "#f7faf8", borderRadius: 10 }}>
        {rows.map(({ key, at }) => {
          const past = isPast(at, schemeNowMs(it.scheme)); // its hour in Bulgaria, on the round's clock (1.3, 3.4)
          return (
            <span key={key} style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {lang === "bg" ? DATE_LABELS[key].bg : DATE_LABELS[key].en}:{" "}
              <b style={{ color: past ? "var(--muted)" : "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{fmtSchemeDate(at)}</b>
            </span>
          );
        })}
      </div>
    );
  };

  // Every document this participation has from the provider, in ONE place: the
  // ones he released with "Изпрати на участниците", plus the report and the
  // certificate, which are issued rather than sent. Nothing appears here that he
  // has not deliberately put out — an uploaded but unsent document stays his.
  const docsFromProvider = (it: Item) => {
    const docLabel = (key: string) => {
      const def = getDoc(key);
      return def ? (lang === "bg" ? def.nameBg : def.nameEn) : key;
    };
    const rows = [
      // each with the edition the laboratory holds (part 3.0)
      // what reaches THIS participation — to every participant, or to it alone (5.4) — with its edition
      ...docsFor(it.scheme, { participantIds: [it.p.id] }).map((r) => {
        const ed = r.editionNo ? { id: r.editionId, no: r.editionNo } : undefined;
        // an amendment's edition says so beside it — an uploaded PDF cannot be stamped (3.3)
        const am = ed ? (it.scheme.amendments ?? []).find((a) => a.editions?.[r.key as "plan" | "invitation"]?.id === ed.id) : undefined;
        const amLine = am ? ` — ${amendmentLine(lang === "bg" ? "bg" : "en", am, am.editions?.[r.key as "plan" | "invitation"]?.replaces)}` : "";
        const own = r.level === "participation" ? (lang === "bg" ? " — само за вашето участие" : " — for your participation alone") : "";
        return { key: r.key, label: docLabel(r.key) + (ed ? ` (${lang === "bg" ? "ред." : "ed."} № ${ed.no})` : "") + amLine + own, at: r.at.slice(0, 10), href: `/lab/doc/${it.scheme.id}/${r.key}?lang=${lang}&p=${encodeURIComponent(it.p.id)}` };
      }),
      ...(it.reported && it.officialReport ? [{ key: "report", label: tr("lab.finalReport"), at: "", href: `/lab/doc/${it.scheme.id}/report?lang=${lang}` }] : []),
      ...(it.hasCert ? [{ key: "certificate", label: tr("lab.certificate"), at: "", href: `/lab/doc/${it.scheme.id}/certificate?lang=${lang}` }] : []),
      // addressed to this laboratory alone, so it comes from its own route
      // ?p= names the participation: a lab that applied twice to one scheme has an
      // invoice per code, and the link must fetch the one this card is showing.
      // a proforma from before the scheme was declared not held is kept, and says so (О9)
      ...(it.invoice ? [{ key: "proforma", label: (lang === "bg" ? LAB_DOC_SLOTS.proforma.bg : LAB_DOC_SLOTS.proforma.en) + (it.scheme.status === "not_held" ? (lang === "bg" ? " — схемата не се състои, нищо не се фактурира" : " — the scheme is not held, nothing is invoiced") : ""), at: it.invoice.uploadedAt.slice(0, 10), href: `/lab/labdoc/${it.scheme.id}/proforma?p=${encodeURIComponent(it.p.id)}` }] : []),
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>
          {lang === "bg" ? "Документи от организатора" : "Documents from the provider"}
        </span>
        {rows.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{tr("lab.docsAfter")}</span>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {rows.map((d) => (
              <a key={d.key} href={d.href} target="_blank" rel="noreferrer"
                className="btn btn-sm" style={{ fontSize: 12 }}>
                ⇩ {d.label}{d.at ? ` · ${fmtPhaseDate(d.at)}` : ""}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const dateRange = (s: (typeof allSchemes)[number]) => {
    const ds = (s.schedule ?? []).map((x) => x.date).filter(Boolean);
    return ds.length > 1 ? `${ds[0]} – ${ds[ds.length - 1]}` : ds[0] ?? "";
  };

  // ── card renderers (one per bucket) ──────────────────────────────────────────
  const participCard = (it: Item) => {
    const st = statusChip(it.scheme.status, lang);
    const awaiting = it.deadline ? `${tr("lab.awaitingResults")} · ${tr("lab.deadline")} ${it.deadline}` : tr("lab.awaitingResults");
    return (
      <div key={it.p.id} data-lab-card={it.scheme.id} className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17 }}>{schemeName(it.scheme)}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{it.scheme.number}</span>
              {/* before the coding act (5.3) an application has no code — never its provisional reference */}
              {isProvisional(it.p.code)
                ? (inFinalRound(it.scheme, it.p)
                  ? <span className="chip" data-code-to-come style={{ background: "var(--muted)" }}>{lang === "bg" ? "Кодът предстои — тегли се след затваряне на заявяването" : "Your code is to come — drawn after applications close"}</span>
                  : <span className="chip" data-not-going-on style={{ background: "var(--muted)" }}>{lang === "bg" ? "Участието не продължава" : "The participation goes no further"}</span>)
                : <span className="chip" style={{ background: "var(--green-dark)" }}>{tr("lab.yourCode")} · {it.p.code}</span>}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
        </div>
        {it.completed ? (
          <details>
            <summary style={{ fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
              {lang === "bg" ? "Хронология на фазите" : "Phase timeline"}
            </summary>
            <Timeline it={it} />
          </details>
        ) : (
          <Timeline it={it} />
        )}
        {datesStrip(it)}
        {it.chain && (
          <DeviceChainCard
            schemeId={it.scheme.id}
            lang={lang}
            state={it.chain.state}
            position={it.chain.position?.position}
            total={it.chain.position?.total}
            wait={it.chain.wait}
            started={it.chain.started}
            closed={it.chain.closed}
            incoming={it.chain.incoming}
            next={it.chain.next}
            handOnBy={it.chain.handOnBy}
          />
        )}
        {/* Реш. 150 (3.11): information, never a block — the decided sentence, by the
            scheme's kind, while the scheme runs and until the laboratory's results are in */}
        {(it.scheme.status === "open" || it.scheme.status === "running") && it.p.status !== "submitted" && it.p.status !== "scored" && (
          <div data-written-instructions style={{ fontSize: 13, color: "var(--muted)" }}>
            {lang === "bg" ? writtenInstructions(it.scheme.type).bg : writtenInstructions(it.scheme.type).en}
          </div>
        )}
        {/* the scheme's one static reminder (А3, 3.6) — while it is running */}
        {(it.scheme.status === "open" || it.scheme.status === "running") && (lang === "bg" ? it.scheme.staticReminder?.bg : it.scheme.staticReminder?.en) && (
          <div data-static-reminder style={{ fontSize: 13, background: "#f7faf8", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px" }}>
            <b>{lang === "bg" ? "Напомняне: " : "Reminder: "}</b>{lang === "bg" ? it.scheme.staticReminder?.bg : it.scheme.staticReminder?.en}
          </div>
        )}
        {docsFromProvider(it)}
        {resultBlock(it, awaiting)}
      </div>
    );
  };

  const browseCard = (s: (typeof allSchemes)[number], mode: "open" | "past") => {
    const range = dateRange(s);
    const chip = statusChip(s.status, lang);
    return (
      <div key={s.id} className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17 }}>{s.name?.trim() || (lang === "bg" ? s.titleBg : s.titleEn) || s.number}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{s.number}{range ? ` · ${range}` : ""}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: chip.fg, background: chip.bg }}>{chip.label}</span>
        {mode === "open" && (ONLINE_APPLICATIONS_OPEN
          ? <Link href={`/apply/${s.id}`} className="btn btn-primary btn-sm">{tr("lab.applyToParticipate")}</Link>
          // part 0.4: applications go by the PDF form in the transition (Реш. 1)
          : <a href={PDF_APPLICATION_URL} target="_blank" rel="noopener" className="btn btn-sm">{tr("lab.applyWithPdf")}</a>)}
      </div>
    );
  };

  // ── tab contents (rendered server-side, toggled by the client tab shell) ──────
  // The lab's own rounds: active work first, finished (reported) ones grouped
  // after a divider and dimmed — mirrors the owner's lifecycle grouping.
  // a scheme that is not held is over for the laboratory too (О9, 3.2)
  const isOver = (st: string) => st === "closed" || st === "not_held";
  const activeItems = items.filter((it) => !isOver(it.scheme.status));
  const doneItems = items.filter((it) => isOver(it.scheme.status));
  const participatingContent = items.length === 0 ? (
    <EmptyState title={tr("lab.noSchemesTitle")} body={tr("lab.noSchemesBody")} />
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {activeItems.map(participCard)}
      {doneItems.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>{tr("lifecycle.finished")}</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: 0.85 }}>{doneItems.map(participCard)}</div>
        </>
      )}
    </div>
  );
  const openContent = openToJoin.length === 0 ? (
    <p style={{ fontSize: 13, color: "var(--muted)" }}>{tr("lab.noOpen")}</p>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{openToJoin.map((s) => browseCard(s, "open"))}</div>
  );
  const pastContent = pastSchemes.length === 0 ? (
    <p style={{ fontSize: 13, color: "var(--muted)" }}>{lang === "bg" ? "Няма минали схеми." : "No past schemes yet."}</p>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{pastSchemes.map((s) => browseCard(s, "past"))}</div>
  );

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <header className="flex items-center gap-3 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
        <span className="font-bold text-lg tracking-tight"><span style={{ color: "var(--green-dark)" }}>PTS</span> Bulgaria</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>· {tr("header.labPortal")}</span>
        <span className="ml-auto text-sm" style={{ fontWeight: 700 }}>{lab.name}</span>
        <NotificationBell items={notifications} />
        <LanguageToggle />
        <form action={signOutLabAction}>
          <button type="submit" className="btn btn-sm">{tr("common.signOut")}</button>
        </form>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        {errText && (
          <div style={{ background: "#fdecec", border: "1px solid #d9534f", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 16, fontSize: 13 }}>
            {errText}
          </div>
        )}
        {/* No single code in the header: a laboratory works under a DIFFERENT code
            in every scheme it joins, so the code belongs on the scheme's own card
            (below) where it can never be read as one code for everything. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          <h1 className="section-title" style={{ fontSize: 30 }}>{tr("lab.welcomePrefix")} {lab.name}</h1>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* left: tabbed scheme browser (participating · open · past) */}
          <div style={{ flex: 1, minWidth: 320 }}>
            <LabSchemeTabs
              tabs={[
                { key: "participating", label: tr("lab.participatingNow"), count: items.length, content: participatingContent },
                { key: "open", label: lang === "bg" ? "Отворени" : "Open", count: openToJoin.length, content: openContent },
                { key: "past", label: lang === "bg" ? "Минали" : "Past", count: pastSchemes.length, content: pastContent },
              ]}
            />
          </div>

          {/* right: profile + account */}
          <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 className="section-title" style={{ fontSize: 18, flex: 1 }}>{tr("lab.profile")}</h2>
                <Link href="/lab/profile" className="btn btn-sm">{tr("common.edit")}</Link>
              </div>
              {kv(tr("lab.field.laboratory"), lab.name)}
              {kv(tr("lab.field.accreditationCert"), lab.accreditationCert)}
              {kv(tr("lab.field.contactPerson"), lab.contactPerson)}
              {kv(tr("lab.field.email"), lab.email)}
              {kv(tr("lab.field.phone"), lab.phone)}
              {kv(tr("lab.field.registeredAddress"), lab.registeredAddress)}
            </section>
            <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="section-title" style={{ fontSize: 18 }}>{tr("lab.accountSecurity")}</h2>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>{tr("lab.twoFactorOptional")}</p>
              <form action={signOutLabAction}><button type="submit" className="btn btn-sm">{tr("common.signOut")}</button></form>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
