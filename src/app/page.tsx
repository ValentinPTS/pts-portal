import { listSchemeSummaries } from "@/lib/store";
import { FolderTile } from "@/components/Tiles";
import { TYPE_SLUG, typeLabel } from "@/lib/folders";

// Render per-request so the scheme counts reflect live data (not frozen at build)
// and the build doesn't call Supabase while compiling.
export const dynamic = "force-dynamic";

// Home = the two top-level folders (Testing / Calibration). New schemes are
// created inside, organised by year. Only needs counts → scheme summaries.
export default async function Home() {
  const schemes = await listSchemeSummaries();
  const count = (t: "T" | "C") => schemes.filter((s) => s.type === t).length;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px", width: "100%" }}>
      <h1 className="text-3xl font-bold" style={{ color: "var(--green-dark)", letterSpacing: "-0.01em" }}>Your schemes</h1>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>Open a workspace — new schemes are created inside, organised by year.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24, marginTop: 24 }}>
        <FolderTile type="T" href={`/files/${TYPE_SLUG.T}`} label={typeLabel("T")} sub={`${count("T")} scheme${count("T") === 1 ? "" : "s"}`} />
        <FolderTile type="C" href={`/files/${TYPE_SLUG.C}`} label={typeLabel("C")} sub={`${count("C")} scheme${count("C") === 1 ? "" : "s"}`} />
      </div>
    </div>
  );
}
