import { notFound } from "next/navigation";
import { listSchemeSummaries } from "@/lib/store";
import ExplorerShell from "@/components/ExplorerShell";
import { FolderTile } from "@/components/Tiles";
import NewProjectDialog from "@/components/NewProjectDialog";
import { typeFromSlug, typeLabel, ACCENT, yearsForType, schemesIn, nextProject } from "@/lib/folders";
import { getServerT } from "@/lib/i18n-server";
import { plural } from "@/lib/i18n";

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
  const { lang, tr } = await getServerT();

  return (
    <ExplorerShell active={{ type }} breadcrumb={[{ label: tr("common.home"), href: "/" }, { label: typeLabel(type, lang) }]}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, color: ac.accent }}>{typeLabel(type, lang)}</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>{plural(lang, years.length, "year")}</div>
        </div>
        <NewProjectDialog variant="button" type={type} typeLabel={typeLabel(type, lang)} year={curYear} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 18 }}>
        {years.map((y) => (
          <FolderTile key={y} type={type} href={`/files/${slug}/${y}`} label={y} sub={plural(lang, schemesIn(schemes, type, y).length, "scheme")} />
        ))}
        {years.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>{tr("files.emptyYears")}</div>
        )}
      </div>
    </ExplorerShell>
  );
}
