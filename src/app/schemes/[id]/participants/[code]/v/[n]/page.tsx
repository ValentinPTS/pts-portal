import Link from "next/link";
import { notFound } from "next/navigation";
import { mayNow, requireOneOf } from "@/lib/access";
import { requireStaff } from "@/lib/roles";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { resultRows, calRows } from "@/lib/results-model";
import { listSubmissionsFor } from "@/lib/submissions";
import { logActivity } from "@/lib/activity";
import { getServerT } from "@/lib/i18n-server";
import { schemeName } from "@/lib/folders";
import ResultsRecord from "@/components/ResultsRecord";

export const dynamic = "force-dynamic";

// PTS's view of a submitted version's record (plan part 6.8) — by code; printable. The laboratory's
// name and the person typed in calibration's general info, and the subcontracted part's words: to
// who sees names in the scheme (names.view) only, and only when revealed — one opening, on record
// (2.3), as the case file does (6.8 review); to others «—».
export default async function StaffResultsRecordPage({ params, searchParams }: { params: Promise<{ id: string; code: string; n: string }>; searchParams: Promise<{ reveal?: string }> }) {
  await requireStaff();
  const { id, code: rawCode, n } = await params;
  await requireOneOf(["results.read", "results.enter", "results.process"], id);
  const sp = await searchParams;
  const code = decodeURIComponent(rawCode);
  const s = await getScheme(id);
  if (!s) notFound();
  const part = (await listParticipants(id)).find((x) => x.code === code);
  if (!part) notFound();
  const no = Number(n);
  if (!Number.isInteger(no) || no < 1) notFound();
  const { lang: l } = await getServerT();
  const lang: "bg" | "en" = l === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  let versions: Awaited<ReturnType<typeof listSubmissionsFor>> | null = null;
  try { versions = await listSubmissionsFor(part!.id, id); } catch { versions = null; }
  // a read that failed is said — never «not found» (6.4's rule; 6.8 review)
  if (!versions) return <p role="alert" data-record-unread style={{ color: "#8f2f2f" }}>{L("Подадените версии не можаха да се прочетат — презаредете страницата.", "The submitted versions could not be read — reload the page.")}</p>;
  const version = versions.find((x) => x.version === no);
  if (!version) notFound();
  const names = await mayNow("names.view", id);
  const revealed = names && sp.reveal === "1";
  if (revealed) await logActivity("names.viewed", { schemeId: id, targetCode: code, subject: `participant:${code}`, summary: `Names typed in a submitted version shown for one code — its record, version ${no}` });
  const snapshot = s!.characteristicVersions?.find((x) => x.no === version!.configVersion);
  return (
    <div>
      <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/schemes/${id}/participants/${encodeURIComponent(code)}#submissions`} className="text-sm" style={{ color: "var(--muted)" }}>← {code}</Link>
        {names && !revealed && <Link href={`?reveal=1`} className="text-sm" data-record-reveal>{L("Покажи имената, въведени във версията (записва се)", "Show the names typed in the version (recorded)")}</Link>}
      </div>
      <div style={{ marginTop: 8 }}>
        <ResultsRecord lang={lang} scheme={{ number: s!.number, name: schemeName(s!), type: s!.type }} code={code} version={version!}
          rows={s!.type === "T" ? resultRows(s!, part!) : []} cRows={s!.type === "C" && s!.calibration ? calRows(s!.calibration) : []} unit={s!.calibration?.unit}
          snapshot={snapshot} showIdentity={revealed} showReason />
      </div>
    </div>
  );
}
