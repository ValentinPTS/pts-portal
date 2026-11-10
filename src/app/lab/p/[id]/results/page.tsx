import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { participantViewer, participationViews } from "@/lib/participation-view";
import { canLabUploadNow } from "@/lib/lab-phases";
import { resultRows, draftFor, fieldName, rowsHaveIds } from "@/lib/results-model";
import { getDraft } from "@/lib/submissions";
import { isProvisional } from "@/lib/coding-model";
import { getServerT } from "@/lib/i18n-server";
import { signOutLabAction } from "@/lib/auth-actions";
import ParticipantNav from "@/components/ParticipantNav";
import LanguageToggle from "@/components/LanguageToggle";
import ResultsForm from "@/components/ResultsForm";

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
  // a draft that cannot be read is never shown as none: the form then waits, read-only — one
  // keystroke would otherwise write an empty draft over the real one (6.1 review)
  let readFailed = false;
  const stored = rows.length ? await getDraft(v.participantId, s.id).catch(() => { readFailed = true; return null; }) : null;
  const draft = draftFor(stored?.data, rows);
  // the form as its fields: what the draft holds, as typed
  const initial: Record<string, string> = {};
  for (const r of rows) {
    const x = draft.rows[r.key];
    x.d.forEach((val, j) => { initial[fieldName("d", r.key, j)] = val; });
    initial[fieldName("mean", r.key)] = x.mean;
    initial[fieldName("U", r.key)] = x.U;
    initial[fieldName("k", r.key)] = x.k;
  }
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
        {s.type !== "T" ? (
          <p data-results-calibration className="card" style={{ padding: 14, margin: 0, fontSize: 13.5 }}>
            {L("Онлайн формулярът за калибриране предстои (по Листа с резултати M2). Засега попълнете Листа с резултати и го изпратете, както казва Инструкцията.", "The online form for calibration is coming (after the M2 Results Sheet). For now, fill in the Results Sheet and send it as the Instruction says.")}
          </p>
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
              rows={rows.map((r) => ({ key: r.key, name: lang === "bg" ? r.name.bg : r.name.en, method: lang === "bg" ? r.method.bg : r.method.en, unit: r.unit, determinations: r.determinations, uRequired: r.uRequired }))}
              initial={initial} />
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>{L("Това е чернова — вижда я само участието. Подаването (с потвърждение и разписка) идва в следващата част; дотогава резултатите се изпращат, както казва Инструкцията.", "This is a draft — only the participation sees it. Submission (with a confirmation and a receipt) comes in the next part; until then, results are sent as the Instruction says.")}</p>
          </>
        )}
      </main>
    </div>
  );
}
