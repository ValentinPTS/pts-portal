import { listSchemeSummaries } from "@/lib/store";
import { getViewer, schemesFor } from "@/lib/access";
import { FolderTile } from "@/components/Tiles";
import { LIFECYCLE_ORDER, TYPE_SLUG, lifecycleMeta, lifecycleOf, typeLabel } from "@/lib/folders";
import { getServerT } from "@/lib/i18n-server";
import { plural } from "@/lib/i18n";
import { requireStaff } from "@/lib/roles";
import { redirect } from "next/navigation";

// Render per-request so the scheme counts reflect live data (not frozen at build)
// and the build doesn't call Supabase while compiling.
export const dynamic = "force-dynamic";

// Home = the two top-level folders (Testing / Calibration). New schemes are
// created inside, organised by year. Only needs counts → scheme summaries.
export default async function Home() {
  await requireStaff(); // read gate: one of PTS's people
  // only the schemes this person works in, by the role model (2.4)
  const scope = schemesFor(await getViewer(), "codes.view");
  // nobody's schemes to show (the software administrator; someone with no role yet):
  // the dashboard says why (2.7)
  if (scope !== "all" && scope.length === 0) redirect("/dashboard");
  const schemes = (await listSchemeSummaries()).filter((s) => scope === "all" || scope.includes(s.id));
  const { lang, tr } = await getServerT();
  // e.g. "5 схеми — 3 текущи · 1 предстоящи · 1 приключени" (zero buckets hidden)
  const sub = (t: "T" | "C") => {
    const mine = schemes.filter((s) => s.type === t);
    const parts = LIFECYCLE_ORDER
      .map((lc) => ({ lc, n: mine.filter((s) => lifecycleOf(s.status) === lc).length }))
      .filter((x) => x.n > 0)
      .map((x) => `${x.n} ${lifecycleMeta(x.lc, lang).label.toLowerCase()}`);
    return plural(lang, mine.length, "scheme") + (parts.length ? ` — ${parts.join(" · ")}` : "");
  };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px", width: "100%" }}>
      <h1 className="text-3xl font-bold" style={{ color: "var(--green-dark)", letterSpacing: "-0.01em" }}>{tr("home.title")}</h1>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>{tr("home.subtitle")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24, marginTop: 24 }}>
        <FolderTile type="T" href={`/files/${TYPE_SLUG.T}`} label={typeLabel("T", lang)} sub={sub("T")} />
        <FolderTile type="C" href={`/files/${TYPE_SLUG.C}`} label={typeLabel("C", lang)} sub={sub("C")} />
      </div>
    </div>
  );
}
