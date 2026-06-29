import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { DOCUMENTS, isFormDoc } from "@/lib/documents";
import ExplorerShell from "@/components/ExplorerShell";
import { DocTile } from "@/components/Tiles";
import SkinPicker from "@/components/SkinPicker";
import FolderActions from "@/components/FolderActions";
import { skinsForTypeAsync } from "@/skins";
import { TYPE_SLUG, typeLabel, schemeName, statusChip, ACCENT } from "@/lib/folders";
import { ancestry } from "@/lib/folder-tree";
import { getServerT } from "@/lib/i18n-server";

// A scheme folder → its 14 documents as files, plus the scheme tools.
export default async function SchemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();

  const { lang, tr } = await getServerT();
  const type = s.type;
  const slug = TYPE_SLUG[type];
  const ac = ACCENT[type];
  const st = statusChip(s.status, lang);
  const skins = await skinsForTypeAsync(type);
  // breadcrumb follows the real folder the scheme lives in (if any)
  const chain = s.folderId ? await ancestry(type, s.folderId) : [];

  return (
    <ExplorerShell
      active={{ type, folderId: s.folderId, schemeId: id }}
      breadcrumb={[
        { label: tr("common.home"), href: "/" },
        { label: typeLabel(type, lang), href: `/files/${slug}` },
        ...chain.map((f) => ({ label: f.name, href: `/files/${slug}/f/${f.id}` })),
        { label: schemeName(s) },
      ]}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 27, color: ac.accent }}>{schemeName(s)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>{s.number}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/schemes/${id}/edit`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.editData")}</Link>
          <Link href={`/schemes/${id}/participants`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.participants")}</Link>
          <Link href={`/schemes/${id}/applications`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.applications")}</Link>
          <Link href={`/schemes/${id}/results`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.results")}</Link>
          <Link href={`/activity?scheme=${id}`} className="btn" style={{ fontSize: 13 }}>{tr("activity.viewForScheme")}</Link>
          <a href={`/schemes/${id}/audit-pack?lang=bg`} target="_blank" rel="noopener" className="btn" style={{ fontSize: 13 }}>{tr("activity.auditPack")}</a>
          <SkinPicker schemeId={id} current={s.skin ?? "classic"} skins={skins.map((k) => ({ id: k.meta.id, name: k.meta.name }))} />
          <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 2px" }} />
          <FolderActions schemeId={id} name={s.name?.trim() || schemeName(s)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 16 }}>
        {DOCUMENTS.map((d) => {
          const name = lang === "bg" ? d.nameBg : d.nameEn;
          const formDoc = isFormDoc(d.key);
          if (formDoc) {
            const filled = !!s.formData?.[d.key] && Object.values(s.formData[d.key]).some(Boolean);
            return <DocTile key={d.key} href={`/schemes/${id}/fill/${d.key}`} name={name} form={d.formNumber} built={filled} action={tr("tile.fill")} builtLabel={tr("tile.filled")} emptyLabel={tr("tile.toFill")} />;
          }
          const saved = s.docs?.[d.key];
          const built = !!(saved && (saved.bg || saved.en));
          return <DocTile key={d.key} href={`/schemes/${id}/build/${d.key}`} name={name} form={d.formNumber} built={built} action={tr("tile.open")} builtLabel={tr("tile.built")} emptyLabel={tr("tile.notStarted")} />;
        })}
      </div>
    </ExplorerShell>
  );
}
