import Link from "next/link";
import { gateB } from "@/lib/gate-texts";
import { isProvisional } from "@/lib/coding-model";
import { inFinalRound } from "@/lib/announcement-model";
import { writtenInstructions } from "@/lib/docs/instruction-common";
import { requireLab } from "@/lib/lab-auth";
import { isStarted, listVisibleParticipations } from "@/lib/visibility";
import { ONLINE_APPLICATIONS_OPEN, PDF_APPLICATION_URL } from "@/lib/online-applications";
import { listSchemes } from "@/lib/store";
import { statusChip } from "@/lib/folders";
import { fmtPhaseDate, canLabUploadNow, LAB_UPLOAD_SLOTS, type LabUploadSlot } from "@/lib/lab-phases";
import { participationViews } from "@/lib/participation-view";
import StageBar from "@/components/StageBar";
import { ActionItems } from "@/components/ParticipationLists";
import { amendmentLine } from "@/lib/amendments-model";
import { LAB_DOC_SLOTS } from "@/lib/doc-release";
import { docsFor } from "@/lib/release-model";
import { chainViewFor } from "@/lib/chain-view";
import { actorNow } from "@/lib/identities";
import DeviceChainCard from "@/components/DeviceChainCard";
import { DATE_LABELS, fmtSchemeDate, setDates, isPast } from "@/lib/scheme-dates";
import { resultsDeadline, deadlineState, resultsSubmittedAt } from "@/lib/deadlines-model";
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

// The calibration chain, resolved for ONE laboratory, lives in lib/chain-view.ts (5.5).

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

  // each participation from the record: its state, stage, payment, deadline, actions (5.5)
  const views = await participationViews(parts.map((p) => ({ participantId: p.id, schemeId: p.schemeId, labName: p.labName, country: p.country })), {});
  const viewOf = new Map(views.map((v) => [v.participantId, v] as const));

  const items = (await Promise.all(parts
    .map(async (p) => {
      const scheme = byId.get(p.schemeId);
      if (!scheme) return null;
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
        p, scheme,
        // this participation's own proforma, if the provider has put one there — and, after the
        // payment, its original invoice (5.8; Реш. 35)
        invoice: scheme.labDocs?.[p.code]?.proforma,
        original: scheme.labDocs?.[p.code]?.invoice,
        // the calibration chain, resolved for THIS laboratory only
        chain: await chainViewFor(scheme, p.code, lang, await actorNow()),
        view: viewOf.get(p.id),
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

  // The laboratory's own upload slots — the signed receipt protocol once the object is on
  // its way, the results sheet once it is received — by the participation's state (5.5);
  // locked (read-only) once scored, or once the scheme no longer takes them (3.2).
  const uploads = (it: Item) => {
    const st = it.view?.state;
    if (!st) return null;
    const slots: LabUploadSlot[] = [
      ...(["dispatched", "received", "draft", "submitted", "scored", "nr"].includes(st) ? ["protocol" as const] : []),
      ...(["received", "draft", "submitted", "scored", "nr"].includes(st) ? ["results" as const] : []),
    ];
    if (!slots.length) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {slots.map((slot) => {
          const up = it.scheme.labUploads?.[it.p.code]?.[slot];
          const sst = it.scheme.status;
          const open = !it.view!.finished && canLabUploadNow(it.p.status) && sst !== "not_held" && sst !== "closed"
            && !(slot === "results" && (sst === "processing" || sst === "report"))
            // from Gate B the results are submitted online — the record replaces the sheet (6.8, П10)
            && !(slot === "results" && gateB());
          if (!open && !up) return null;
          return (
            <div key={slot} data-upload-slot={slot} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {up && (
                <a href={`/lab/upload/${it.scheme.id}/${slot}?p=${encodeURIComponent(it.p.id)}`} target="_blank" rel="noreferrer"
                  className="btn btn-sm" style={{ fontSize: 11.5, padding: "3px 9px", borderColor: "var(--green-line, #cbd9be)", background: "#eef3ea", color: "#456b2c", fontWeight: 700 }}>
                  📄 {up.name}
                </a>
              )}
              {up && <span style={{ fontSize: 11, color: "var(--muted)" }}>{(lang === "bg" ? "качен " : "uploaded ") + fmtPhaseDate(up.uploadedAt.slice(0, 10))}</span>}
              {open ? (
                <form action={labUploadDocAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="schemeId" value={it.scheme.id} />
                  <input type="hidden" name="participantId" value={it.p.id} />
                  <input type="hidden" name="slot" value={slot} />
                  <input type="file" name="file" required accept="application/pdf,image/png,image/jpeg" style={{ fontSize: 11.5, maxWidth: 210 }} />
                  <button type="submit" className="btn btn-sm" style={{ fontSize: 11.5, padding: "3px 9px", borderStyle: up ? "solid" : "dashed" }}>
                    ↑ {up ? (lang === "bg" ? "Замени файла" : "Replace file") : (lang === "bg" ? LAB_UPLOAD_SLOTS[slot].bg : LAB_UPLOAD_SLOTS[slot].en)}
                  </button>
                </form>
              ) : (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{lang === "bg" ? "заключен" : "locked"}</span>
              )}
            </div>
          );
        })}
      </div>
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
      ...(it.invoice ? [{ key: "proforma", label: (lang === "bg" ? LAB_DOC_SLOTS.proforma.bg : LAB_DOC_SLOTS.proforma.en) + (it.invoice.number ? ` № ${it.invoice.number}` : "") + (it.scheme.status === "not_held" ? (lang === "bg" ? " — схемата не се състои, нищо не се фактурира" : " — the scheme is not held, nothing is invoiced") : ""), at: it.invoice.uploadedAt.slice(0, 10), href: `/lab/labdoc/${it.scheme.id}/proforma?p=${encodeURIComponent(it.p.id)}` }] : []),
      ...(it.original ? [{ key: "invoice", label: (lang === "bg" ? LAB_DOC_SLOTS.invoice.bg : LAB_DOC_SLOTS.invoice.en) + (it.original.number ? ` № ${it.original.number}` : ""), at: it.original.uploadedAt.slice(0, 10), href: `/lab/labdoc/${it.scheme.id}/invoice?p=${encodeURIComponent(it.p.id)}` }] : []),
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
        {/* the participation's state on the bar, payment beside it (5.5; К26, К18) */}
        {it.view && <StageBar lang={lang} type={it.scheme.type} state={it.view.state} payment={it.view.finished ? undefined : it.view.payment} compact />}
        {uploads(it)}
        <Link href={`/lab/p/${encodeURIComponent(it.p.id)}`} data-open-participation={it.p.id} className="btn btn-sm" style={{ alignSelf: "flex-start", fontSize: 12.5 }}>
          {lang === "bg" ? "Отвори участието →" : "Open the participation →"}
        </Link>
        {/* the scheme's dates, its instructions sentence and its reminder — while the participation goes on (5.5) */}
        {!it.view?.finished && datesStrip(it)}
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
        {!it.view?.finished && (it.scheme.status === "open" || it.scheme.status === "running") && it.p.status !== "submitted" && it.p.status !== "scored" && (
          <div data-written-instructions style={{ fontSize: 13, color: "var(--muted)" }}>
            {lang === "bg" ? writtenInstructions(it.scheme.type).bg : writtenInstructions(it.scheme.type).en}
          </div>
        )}
        {/* the scheme's one static reminder (А3, 3.6) — while it is running */}
        {!it.view?.finished && (it.scheme.status === "open" || it.scheme.status === "running") && (lang === "bg" ? it.scheme.staticReminder?.bg : it.scheme.staticReminder?.en) && (
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
  // finished by the participation's own state (5.5) — scored, N/R, or ended — else by the scheme's
  const over = (it: Item) => it.view ? it.view.finished : isOver(it.scheme.status);
  const activeItems = items.filter((it) => !over(it));
  const doneItems = items.filter((it) => over(it));
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
        {/* what asks for action now — a deadline, a delivery, a document (5.5; design §4) */}
        {views.length > 0 && <div style={{ marginBottom: 20 }}><ActionItems lang={lang === "bg" ? "bg" : "en"} views={views.filter((v) => !v.finished)} /></div>}

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
