import { notFound } from "next/navigation";
import { getViewer, schemesFor, mayAnywhereNow } from "@/lib/access";
import { listSchemeSummaries, listSchemesInFolder } from "@/lib/store";
import { sofiaYearMonth } from "@/lib/scheme-number";
import { isTestEnvironment } from "@/lib/environment";
import { listChildFolders, listFolders } from "@/lib/folder-tree";
import ExplorerShell from "@/components/ExplorerShell";
import { FolderTile } from "@/components/Tiles";
import SchemeGroups from "@/components/SchemeGroups";
import NewProjectDialog from "@/components/NewProjectDialog";
import NewFolderDialog from "@/components/NewFolderDialog";
import { typeFromSlug, typeLabel, ACCENT, dialogNumbering } from "@/lib/folders";
import { samplesForType } from "@/lib/sample-schemes";
import { getServerT } from "@/lib/i18n-server";
import { plural } from "@/lib/i18n";
import { requireStaff } from "@/lib/roles";

// A type root (Testing / Calibration): the folders and schemes directly inside it,
// with two create options — New folder (name only) and New scheme (full dialog).
export const dynamic = "force-dynamic";

export default async function TypePage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ dupNumber?: string; simNumber?: string; badNumber?: string; numberActivity?: string }> }) {
  await requireStaff(); // read gate: manager/staff/auditor only
  const { type: slug } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();
  const { dupNumber, simNumber, badNumber, numberActivity } = await searchParams;

  const [childFolders, allFolders, summaries, everyNumber, rootSchemes] = await Promise.all([
    listChildFolders(type, null),
    listFolders(type),
    listSchemeSummaries(),
    listSchemeSummaries({ includeArchived: true }), // the next number skips archived ones too
    listSchemesInFolder(type, null),
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

  return (
    <ExplorerShell active={{ type }} breadcrumb={[{ label: tr("common.home"), href: "/" }, { label: typeLabel(type, lang) }]}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, color: ac.accent }}>{typeLabel(type, lang)}</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>{plural(lang, childFolders.length, "folder")}</div>
        </div>
        {canCreate && <NewFolderDialog variant="button" type={type} parentId={null} accent={ac.accent} soft={ac.soft} line={ac.line} />}
        {canCreate && <NewProjectDialog variant="button" type={type} typeLabel={typeLabel(type, lang)} year={curYear} numbering={numbering} accent={ac.accent} soft={ac.soft} line={ac.line} folderId={null} samples={samples} />}
      </div>

      {/* folders */}
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", margin: "4px 0 10px", letterSpacing: ".04em", textTransform: "uppercase" }}>{tr("folder.subfolders")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 18 }}>
        {childFolders.map((f) => (
          <FolderTile key={f.id} type={type} href={`/files/${slug}/f/${f.id}`} label={f.name}
            sub={`${plural(lang, schemeCount(f.id), "scheme")}${subCount(f.id) ? ` · ${subCount(f.id)}` : ""}`} />
        ))}
        {canCreate && <NewFolderDialog variant="tile" type={type} parentId={null} accent={ac.accent} soft={ac.soft} line={ac.line} />}
      </div>

      {/* schemes directly under the root — grouped by lifecycle */}
      {seen(rootSchemes).length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", margin: "26px 0 0", letterSpacing: ".04em", textTransform: "uppercase" }}>{tr("folder.schemes")}</div>
          <SchemeGroups schemes={seen(rootSchemes)} lang={lang} />
        </>
      )}
    </ExplorerShell>
  );
}
