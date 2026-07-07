import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { getDoc, isFormDoc } from "@/lib/documents";
import { DOC_STAGES } from "@/lib/doc-stages";
import ExplorerShell from "@/components/ExplorerShell";
import SchemeDocuments, { type DocStageView, type DocSource } from "@/components/SchemeDocuments";
import SkinPicker from "@/components/SkinPicker";
import ManageMenu from "@/components/ManageMenu";
import FolderActions from "@/components/FolderActions";
import { skinsForTypeAsync } from "@/skins";
import { TYPE_SLUG, typeLabel, schemeName, statusChip, ACCENT } from "@/lib/folders";
import { ancestry } from "@/lib/folder-tree";
import { getServerT } from "@/lib/i18n-server";

// A scheme folder → its 14 documents grouped by workflow stage. Every document can be
// built in the app OR filled with an uploaded ready-made file (PDF/image) — see
// SchemeDocuments. The header shows the primary tools; the rest tuck under "Управление".
export default async function SchemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();

  const { lang, tr } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const type = s.type;
  const slug = TYPE_SLUG[type];
  const ac = ACCENT[type];
  const st = statusChip(s.status, lang);
  const skins = await skinsForTypeAsync(type);
  const chain = s.folderId ? await ancestry(type, s.folderId) : [];

  // Resolve each document's state: is there an app-built version, an uploaded file,
  // and which one is active/official (uploaded wins when present unless switched).
  const formLabel = (f: string) => (f === "internal" ? L("вътрешен", "internal") : f === "proposed" ? L("предложен", "proposed") : f);
  const stages: DocStageView[] = DOC_STAGES.map((stage) => ({
    key: stage.key,
    label: lang === "bg" ? stage.bg : stage.en,
    docs: stage.docs.map((key) => {
      const def = getDoc(key)!;
      const isForm = isFormDoc(key);
      const hasUpload = !!s.uploads?.[key];
      const hasBuilt = isForm
        ? !!s.formData?.[key] && Object.values(s.formData[key]).some(Boolean)
        : !!(s.docs?.[key]?.bg || s.docs?.[key]?.en);
      const pref = s.docActive?.[key];
      let active: DocSource = "none";
      if (hasUpload && pref !== "built") active = "uploaded";
      else if (hasBuilt) active = "built";
      else if (hasUpload) active = "uploaded";
      return {
        key,
        name: lang === "bg" ? def.nameBg : def.nameEn,
        form: formLabel(def.formNumber),
        isForm,
        hasBuilt,
        hasUpload,
        active,
        uploadName: s.uploads?.[key]?.name,
        buildHref: isForm ? `/schemes/${id}/fill/${key}` : `/schemes/${id}/build/${key}`,
      };
    }),
  }));

  const allDocs = stages.flatMap((x) => x.docs);
  const ready = allDocs.filter((d) => d.active !== "none").length;
  const uploaded = allDocs.filter((d) => d.active === "uploaded").length;
  const built = allDocs.filter((d) => d.active === "built").length;
  const total = allDocs.length;
  const pct = Math.round((ready / total) * 100);

  const menuRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)", textDecoration: "none" };

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
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 26, color: ac.accent, letterSpacing: "-.01em", lineHeight: 1.12 }}>{schemeName(s)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>{s.number}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/schemes/${id}/edit`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.editData")}</Link>
          <Link href={`/schemes/${id}/participants`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.participants")}</Link>
          <Link href={`/schemes/${id}/results`} className="btn" style={{ fontSize: 13 }}>{tr("scheme.results")}</Link>
          <SkinPicker schemeId={id} current={s.skin ?? "classic"} skins={skins.map((k) => ({ id: k.meta.id, name: k.meta.name }))} />
          <ManageMenu label={L("Управление", "Manage")}>
            <Link href={`/schemes/${id}/applications`} className="hoverrow" style={menuRow}>📥 {tr("scheme.applications")}</Link>
            <Link href={`/activity?scheme=${id}`} className="hoverrow" style={menuRow}>🕑 {tr("activity.viewForScheme")}</Link>
            <a href={`/schemes/${id}/audit-pack?lang=${lang}`} target="_blank" rel="noopener" className="hoverrow" style={menuRow}>⇩ {tr("activity.auditPack")}</a>
            <div style={{ height: 1, background: "var(--line)", margin: "4px 2px" }} />
            <div style={{ padding: "2px 4px" }}><FolderActions schemeId={id} name={s.name?.trim() || schemeName(s)} /></div>
          </ManageMenu>
        </div>
      </div>

      {/* progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", margin: "16px 0 6px", flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{L("Готови:", "Ready:")} <b style={{ color: "#3d6b47", fontVariantNumeric: "tabular-nums" }}>{ready} / {total}</b></div>
        <div style={{ flex: 1, minWidth: 120, height: 8, borderRadius: 999, background: "var(--surface-2,#f1f4ee)", overflow: "hidden", border: "1px solid var(--line)" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#2b6744,#234f36)", borderRadius: 999 }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: "#57823c", marginRight: 5 }} />{L("създадени", "built")} {built}</span>
          <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: "#2f6f8f", marginRight: 5 }} />{L("качени", "uploaded")} {uploaded}</span>
          <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: "var(--line)", marginRight: 5 }} />{L("предстоят", "pending")} {total - ready}</span>
        </div>
      </div>

      <SchemeDocuments schemeId={id} lang={lang} stages={stages} />
    </ExplorerShell>
  );
}
