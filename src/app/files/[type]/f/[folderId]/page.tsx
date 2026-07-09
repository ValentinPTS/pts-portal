import { notFound } from "next/navigation";
import { listSchemeSummaries, listSchemesInFolder } from "@/lib/store";
import { getFolder, listChildFolders, listFolders, ancestry } from "@/lib/folder-tree";
import ExplorerShell from "@/components/ExplorerShell";
import { FolderTile } from "@/components/Tiles";
import SchemeGroups from "@/components/SchemeGroups";
import NewProjectDialog from "@/components/NewProjectDialog";
import NewFolderDialog from "@/components/NewFolderDialog";
import FolderToolbar from "@/components/FolderToolbar";
import { typeFromSlug, typeLabel, ACCENT, nextProject } from "@/lib/folders";
import { samplesForType } from "@/lib/sample-schemes";
import { getServerT } from "@/lib/i18n-server";
import { plural } from "@/lib/i18n";

// A folder → its subfolders + schemes, with New folder / New scheme (created inside
// this folder) and rename/delete. Breadcrumb follows the real folder ancestry.
export const dynamic = "force-dynamic";

export default async function FolderPage({ params, searchParams }: { params: Promise<{ type: string; folderId: string }>; searchParams: Promise<{ dupNumber?: string }> }) {
  const { type: slug, folderId } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();
  const dupNumber = (await searchParams).dupNumber;
  const folder = await getFolder(folderId);
  if (!folder || folder.type !== type) notFound();

  const [chain, childFolders, allFolders, summaries, schemes] = await Promise.all([
    ancestry(type, folderId),
    listChildFolders(type, folderId),
    listFolders(type),
    listSchemeSummaries(),
    listSchemesInFolder(type, folderId),
  ]);
  const ac = ACCENT[type];
  const curYear = String(new Date().getFullYear());
  const next = nextProject(summaries.filter((s) => s.type === type), type, curYear);
  const { lang, tr } = await getServerT();
  const samples = samplesForType(type).map((s) => ({ key: s.key, label: lang === "bg" ? s.labelBg : s.labelEn }));

  const schemeCount = (fid: string) => summaries.filter((s) => s.type === type && s.folderId === fid).length;
  const subCount = (fid: string) => allFolders.filter((f) => f.parentId === fid).length;
  const parentHref = folder.parentId ? `/files/${slug}/f/${folder.parentId}` : `/files/${slug}`;

  const breadcrumb = [
    { label: tr("common.home"), href: "/" },
    { label: typeLabel(type, lang), href: `/files/${slug}` },
    ...chain.map((f, i) => ({ label: f.name, href: i < chain.length - 1 ? `/files/${slug}/f/${f.id}` : undefined })),
  ];

  return (
    <ExplorerShell active={{ type, folderId }} breadcrumb={breadcrumb}>
      {dupNumber && (
        <div style={{ background: "#fdecec", border: "1px solid var(--red)", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
          {tr("files.dupNumber")} <strong>{dupNumber}</strong>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, color: ac.accent }}>{folder.name}</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>
            {plural(lang, childFolders.length, "folder")} · {plural(lang, schemes.length, "scheme")}
          </div>
        </div>
        <NewFolderDialog variant="button" type={type} parentId={folderId} accent={ac.accent} soft={ac.soft} line={ac.line} />
        <NewProjectDialog variant="button" type={type} typeLabel={typeLabel(type, lang)} year={curYear} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} folderId={folderId} samples={samples} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <FolderToolbar folderId={folderId} name={folder.name} parentHref={parentHref} />
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", margin: "4px 0 10px", letterSpacing: ".04em", textTransform: "uppercase" }}>{tr("folder.subfolders")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 18 }}>
        {childFolders.map((f) => (
          <FolderTile key={f.id} type={type} href={`/files/${slug}/f/${f.id}`} label={f.name}
            sub={`${plural(lang, schemeCount(f.id), "scheme")}${subCount(f.id) ? ` · ${subCount(f.id)}` : ""}`} />
        ))}
        <NewFolderDialog variant="tile" type={type} parentId={folderId} accent={ac.accent} soft={ac.soft} line={ac.line} />
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", margin: "26px 0 0", letterSpacing: ".04em", textTransform: "uppercase" }}>{tr("folder.schemes")}</div>
      <SchemeGroups schemes={schemes} lang={lang}
        extraTile={<NewProjectDialog variant="tile" type={type} typeLabel={typeLabel(type, lang)} year={curYear} nextNumber={next.number} accent={ac.accent} soft={ac.soft} line={ac.line} folderId={folderId} samples={samples} />} />

    </ExplorerShell>
  );
}
