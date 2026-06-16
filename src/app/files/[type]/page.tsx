import { notFound } from "next/navigation";
import { listSchemeSummaries } from "@/lib/store";
import ExplorerShell from "@/components/ExplorerShell";
import { FolderTile } from "@/components/Tiles";
import NewProjectDialog from "@/components/NewProjectDialog";
import { typeFromSlug, typeLabel, ACCENT, yearsForType, schemesIn, nextProject } from "@/lib/folders";

// A type folder (Testing / Calibration) → its year folders. Only needs the year
// list + per-year counts → scheme summaries (no document payload).
export default async function TypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type: slug } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();

  const schemes = await listSchemeSummaries();
  const years = yearsForType(schemes, type);
  const ac = ACCENT[type];
  const curYear = String(new Date().getFullYear());
  const next = nextProject(schemes, type, curYear);

  return (
    <ExplorerShell active={{ type }} breadcrumb={[{ label: "Home", href: "/" }, { label: typeLabel(type) }]}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, color: ac.accent }}>{typeLabel(type)}</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>{years.length} year folder{years.length === 1 ? "" : "s"}</div>
        </div>
        <NewProjectDialog variant="button" type={type} typeLabel={typeLabel(type)} year={curYear} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 18 }}>
        {years.map((y) => (
          <FolderTile key={y} type={type} href={`/files/${slug}/${y}`} label={y} sub={`${schemesIn(schemes, type, y).length} scheme${schemesIn(schemes, type, y).length === 1 ? "" : "s"}`} />
        ))}
        {years.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>No {typeLabel(type).toLowerCase()} schemes yet — create your first project.</div>
        )}
      </div>
    </ExplorerShell>
  );
}
