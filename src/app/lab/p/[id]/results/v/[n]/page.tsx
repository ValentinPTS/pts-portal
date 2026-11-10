import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { participantViewer, participationViews } from "@/lib/participation-view";
import { resultRows, calRows } from "@/lib/results-model";
import { listSubmissionsFor } from "@/lib/submissions";
import { getServerT } from "@/lib/i18n-server";
import { schemeName } from "@/lib/folders";
import ResultsRecord from "@/components/ResultsRecord";

export const dynamic = "force-dynamic";

// The laboratory's own record of a submitted version (plan part 6.8) — printable; it replaces the
// Results Sheet Ф 7.2.1-7 in the portal path. Its own participation only, as every lab page.
export default async function LabResultsRecordPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const viewer = await participantViewer();
  if (!viewer) redirect("/lab/login");
  const row = viewer.rows.find((r) => r.participantId === id);
  if (!row) notFound();
  const v = (await participationViews([row], { userId: viewer.userId }))[0];
  if (!v) notFound();
  const no = Number(n);
  if (!Number.isInteger(no) || no < 1) notFound();
  const { lang: l } = await getServerT();
  const lang: "bg" | "en" = l === "bg" ? "bg" : "en";
  const { scheme: s, part: p } = v;
  let versions: Awaited<ReturnType<typeof listSubmissionsFor>> | null = null;
  try { versions = await listSubmissionsFor(v.participantId, s.id); } catch { versions = null; }
  // a read that failed is said — never «not found» (6.4's rule; 6.8 review)
  if (!versions) return <p role="alert" data-record-unread style={{ padding: "16px 20px", color: "#8f2f2f" }}>{lang === "bg" ? "Подадените версии не можаха да се прочетат — презаредете страницата." : "The submitted versions could not be read — reload the page."}</p>;
  const version = versions.find((x) => x.version === no);
  if (!version) notFound();
  const snapshot = s.characteristicVersions?.find((x) => x.no === version!.configVersion);
  return (
    <div style={{ padding: "16px 20px" }}>
      <Link href={`/lab/p/${encodeURIComponent(v.participantId)}/results`} className="no-print text-sm" style={{ color: "var(--muted)" }}>← {lang === "bg" ? "Резултати" : "Results"}</Link>
      <div style={{ marginTop: 8 }}>
        <ResultsRecord lang={lang} scheme={{ number: s.number, name: schemeName(s), type: s.type }} code={p.code} version={version!}
          rows={s.type === "T" ? resultRows(s, p) : []} cRows={s.type === "C" && s.calibration ? calRows(s.calibration) : []} unit={s.calibration?.unit}
          snapshot={snapshot} showIdentity />
      </div>
    </div>
  );
}
