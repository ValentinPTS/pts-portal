import { notFound } from "next/navigation";
import { listSchemesByYear } from "@/lib/store";
import ExplorerShell from "@/components/ExplorerShell";
import { SchemeTile } from "@/components/Tiles";
import NewProjectDialog from "@/components/NewProjectDialog";
import { typeFromSlug, typeLabel, ACCENT, nextProject } from "@/lib/folders";

// A year folder → the scheme folders inside, plus "New project". The tiles show
// each scheme's built-count + date, so this page loads just THIS year's schemes.
export default async function YearPage({ params }: { params: Promise<{ type: string; year: string }> }) {
  const { type: slug, year } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();

  const list = await listSchemesByYear(type, year);
  const ac = ACCENT[type];
  const next = nextProject(list, type, year);

  return (
    <ExplorerShell
      active={{ type, year }}
      breadcrumb={[{ label: "Home", href: "/" }, { label: typeLabel(type), href: `/files/${slug}` }, { label: year }]}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, color: ac.accent }}>{typeLabel(type)} · {year}</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>{list.length} scheme{list.length === 1 ? "" : "s"}</div>
        </div>
        <NewProjectDialog variant="button" type={type} typeLabel={typeLabel(type)} year={year} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 18 }}>
        {list.map((s) => <SchemeTile key={s.id} s={s} />)}
        <NewProjectDialog variant="tile" type={type} typeLabel={typeLabel(type)} year={year} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} />
      </div>
    </ExplorerShell>
  );
}
