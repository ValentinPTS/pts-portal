import { notFound } from "next/navigation";
import { getViewer, schemesFor, mayAnywhereNow } from "@/lib/access";
import { listSchemeSummaries, listSchemesInFolder } from "@/lib/store";
import { sofiaYearMonth } from "@/lib/scheme-number";
import { isTestEnvironment } from "@/lib/environment";
import { getFolder, listChildFolders, listFolders, ancestry } from "@/lib/folder-tree";
import ExplorerShell from "@/components/ExplorerShell";
import { FolderTile } from "@/components/Tiles";
import SchemeGroups from "@/components/SchemeGroups";
import NewProjectDialog from "@/components/NewProjectDialog";
import NewFolderDialog from "@/components/NewFolderDialog";
import FolderToolbar from "@/components/FolderToolbar";
import { typeFromSlug, typeLabel, ACCENT, dialogNumbering } from "@/lib/folders";
import { samplesForType } from "@/lib/sample-schemes";
import { getServerT } from "@/lib/i18n-server";
import { plural } from "@/lib/i18n";
import { requireStaff } from "@/lib/roles";

// A folder → its subfolders + schemes, with New folder / New scheme (created inside
// this folder) and rename/delete. Breadcrumb follows the real folder ancestry.
export const dynamic = "force-dynamic";

export default async function FolderPage({ params, searchParams }: { params: Promise<{ type: string; folderId: string }>; searchParams: Promise<{ dupNumber?: string; simNumber?: string; badNumber?: string; numberActivity?: string }> }) {
  await requireStaff(); // read gate: manager/staff/auditor only
  const { type: slug, folderId } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();
  const { dupNumber, simNumber, badNumber, numberActivity } = await searchParams;
  const folder = await getFolder(folderId);
  if (!folder || folder.type !== type) notFound();

  const [chain, childFolders, allFolders, summaries, everyNumber, schemes] = await Promise.all([
    ancestry(type, folderId),
    listChildFolders(type, folderId),
    listFolders(type),
    listSchemeSummaries(),
    listSchemeSummaries({ includeArchived: true }), // the next number skips archived ones too
    listSchemesInFolder(type, folderId),
  ]);
  // only the schemes this person works in, by the role model (2.4)
  const scope = schemesFor(await getViewer(), "codes.view");
  // a new folder or scheme: the head's — the Order starts a scheme (2.4); the dialog also
  // shows the next free number, which counts every scheme
  const canCreate = await mayAnywhereNow("scheme.create");
  const seen = <T extends { id: string }>(xs: T[]) => xs.filter((x) => scope === "all" || scope.includes(x.id));
  const ac = ACCENT[type];
  const { year: curYear, month: curMonth } = sofiaYearMonth();
  // the test environment numbers its simulation rounds «SIM …» (Реш. 130, 1.2)
  const numbering = dialogNumbering(everyNumber, type, curYear, curMonth, isTestEnvironment());
  const { lang, tr } = await getServerT();
  const samples = samplesForType(type).map((s) => ({ key: s.key, label: lang === "bg" ? s.labelBg : s.labelEn }));

  const schemeCount = (fid: string) => seen(summaries).filter((s) => s.type === type && s.folderId === fid).length;
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
      {simNumber && (
        <div style={{ background: "#fdecec", border: "1px solid var(--red)", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
          {tr("files.simOnly")} <strong>{simNumber}</strong>
        </div>
      )}
      {badNumber && (
        <div data-number-refused style={{ background: "#fdecec", border: "1px solid var(--red)", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
          {tr("files.badNumber")} <strong>{badNumber}</strong>
        </div>
      )}
      {numberActivity && (
        <div data-number-refused style={{ background: "#fdecec", border: "1px solid var(--red)", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
          {tr("files.numberActivity")} <strong>{numberActivity}</strong>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, color: ac.accent }}>{folder.name}</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>
            {plural(lang, childFolders.length, "folder")} · {plural(lang, seen(schemes).length, "scheme")}
          </div>
        </div>
        {canCreate && <NewFolderDialog variant="button" type={type} parentId={folderId} accent={ac.accent} soft={ac.soft} line={ac.line} />}
        {canCreate && <NewProjectDialog variant="button" type={type} typeLabel={typeLabel(type, lang)} year={curYear} numbering={numbering} accent={ac.accent} soft={ac.soft} line={ac.line} folderId={folderId} samples={samples} />}
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
        {canCreate && <NewFolderDialog variant="tile" type={type} parentId={folderId} accent={ac.accent} soft={ac.soft} line={ac.line} />}
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", margin: "26px 0 0", letterSpacing: ".04em", textTransform: "uppercase" }}>{tr("folder.schemes")}</div>
      <SchemeGroups schemes={seen(schemes)} lang={lang}
        extraTile={canCreate ? <NewProjectDialog variant="tile" type={type} typeLabel={typeLabel(type, lang)} year={curYear} numbering={numbering} accent={ac.accent} soft={ac.soft} line={ac.line} folderId={folderId} samples={samples} /> : undefined} />

    </ExplorerShell>
  );
}
