import { notFound } from "next/navigation";
import { listSchemesByYear } from "@/lib/store";
import ExplorerShell from "@/components/ExplorerShell";
import { SchemeTile } from "@/components/Tiles";
import NewProjectDialog from "@/components/NewProjectDialog";
import { typeFromSlug, typeLabel, ACCENT, nextProject } from "@/lib/folders";
import { getServerT } from "@/lib/i18n-server";
import { plural } from "@/lib/i18n";

// A year folder → the scheme folders inside, plus "New project". The tiles show
// each scheme's built-count + date, so this page loads just THIS year's schemes.
export default async function YearPage({ params }: { params: Promise<{ type: string; year: string }> }) {
  const { type: slug, year } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();

  const list = await listSchemesByYear(type, year);
  const ac = ACCENT[type];
  const next = nextProject(list, type, year);
  const { lang, tr } = await getServerT();

  return (
    <ExplorerShell
      active={{ type, year }}
      breadcrumb={[{ label: tr("common.home"), href: "/" }, { label: typeLabel(type, lang), href: `/files/${slug}` }, { label: year }]}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, color: ac.accent }}>{typeLabel(type, lang)} · {year}</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>{plural(lang, list.length, "scheme")}</div>
        </div>
        <NewProjectDialog variant="button" type={type} typeLabel={typeLabel(type, lang)} year={year} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 18 }}>
        {list.map((s) => <SchemeTile key={s.id} s={s} lang={lang} />)}
        <NewProjectDialog variant="tile" type={type} typeLabel={typeLabel(type, lang)} year={year} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} />
      </div>
    </ExplorerShell>
  );
}
