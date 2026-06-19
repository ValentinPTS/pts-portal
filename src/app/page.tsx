import { listSchemeSummaries } from "@/lib/store";
import { FolderTile } from "@/components/Tiles";
import { TYPE_SLUG, typeLabel } from "@/lib/folders";
import { getServerT } from "@/lib/i18n-server";
import { plural } from "@/lib/i18n";

// Render per-request so the scheme counts reflect live data (not frozen at build)
// and the build doesn't call Supabase while compiling.
export const dynamic = "force-dynamic";

// Home = the two top-level folders (Testing / Calibration). New schemes are
// created inside, organised by year. Only needs counts → scheme summaries.
export default async function Home() {
  const schemes = await listSchemeSummaries();
  const count = (t: "T" | "C") => schemes.filter((s) => s.type === t).length;
  const { lang, tr } = await getServerT();

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px", width: "100%" }}>
      <h1 className="text-3xl font-bold" style={{ color: "var(--green-dark)", letterSpacing: "-0.01em" }}>{tr("home.title")}</h1>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>{tr("home.subtitle")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24, marginTop: 24 }}>
        <FolderTile type="T" href={`/files/${TYPE_SLUG.T}`} label={typeLabel("T", lang)} sub={plural(lang, count("T"), "scheme")} />
        <FolderTile type="C" href={`/files/${TYPE_SLUG.C}`} label={typeLabel("C", lang)} sub={plural(lang, count("C"), "scheme")} />
      </div>
    </div>
  );
}
