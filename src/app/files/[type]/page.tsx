import { notFound } from "next/navigation";
import { listSchemeSummaries, listSchemesInFolder } from "@/lib/store";
import { listChildFolders, listFolders } from "@/lib/folder-tree";
import ExplorerShell from "@/components/ExplorerShell";
import { FolderTile } from "@/components/Tiles";
import SchemeGroups from "@/components/SchemeGroups";
import NewProjectDialog from "@/components/NewProjectDialog";
import NewFolderDialog from "@/components/NewFolderDialog";
import { typeFromSlug, typeLabel, ACCENT, nextProject } from "@/lib/folders";
import { samplesForType } from "@/lib/sample-schemes";
import { getServerT } from "@/lib/i18n-server";
import { plural } from "@/lib/i18n";

// A type root (Testing / Calibration): the folders and schemes directly inside it,
// with two create options — New folder (name only) and New scheme (full dialog).
export const dynamic = "force-dynamic";

export default async function TypePage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ dupNumber?: string }> }) {
  const { type: slug } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();
  const dupNumber = (await searchParams).dupNumber;

  const [childFolders, allFolders, summaries, rootSchemes] = await Promise.all([
    listChildFolders(type, null),
    listFolders(type),
    listSchemeSummaries(),
    listSchemesInFolder(type, null),
  ]);
  const ac = ACCENT[type];
  const curYear = String(new Date().getFullYear());
  const next = nextProject(summaries.filter((s) => s.type === type), type, curYear);
  const { lang, tr } = await getServerT();
  const samples = samplesForType(type).map((s) => ({ key: s.key, label: lang === "bg" ? s.labelBg : s.labelEn }));

  const schemeCount = (fid: string) => summaries.filter((s) => s.type === type && s.folderId === fid).length;
  const subCount = (fid: string) => allFolders.filter((f) => f.parentId === fid).length;

  return (
    <ExplorerShell active={{ type }} breadcrumb={[{ label: tr("common.home"), href: "/" }, { label: typeLabel(type, lang) }]}>
      {dupNumber && (
        <div style={{ background: "#fdecec", border: "1px solid var(--red)", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
          {tr("files.dupNumber")} <strong>{dupNumber}</strong>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, color: ac.accent }}>{typeLabel(type, lang)}</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>{plural(lang, childFolders.length, "folder")}</div>
        </div>
        <NewFolderDialog variant="button" type={type} parentId={null} accent={ac.accent} soft={ac.soft} line={ac.line} />
        <NewProjectDialog variant="button" type={type} typeLabel={typeLabel(type, lang)} year={curYear} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} folderId={null} samples={samples} />
      </div>

      {/* folders */}
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", margin: "4px 0 10px", letterSpacing: ".04em", textTransform: "uppercase" }}>{tr("folder.subfolders")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 18 }}>
        {childFolders.map((f) => (
          <FolderTile key={f.id} type={type} href={`/files/${slug}/f/${f.id}`} label={f.name}
            sub={`${plural(lang, schemeCount(f.id), "scheme")}${subCount(f.id) ? ` · ${subCount(f.id)}` : ""}`} />
        ))}
        <NewFolderDialog variant="tile" type={type} parentId={null} accent={ac.accent} soft={ac.soft} line={ac.line} />
      </div>

      {/* schemes directly under the root — grouped by lifecycle */}
      {rootSchemes.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", margin: "26px 0 0", letterSpacing: ".04em", textTransform: "uppercase" }}>{tr("folder.schemes")}</div>
          <SchemeGroups schemes={rootSchemes} lang={lang} />
        </>
      )}
    </ExplorerShell>
  );
}
