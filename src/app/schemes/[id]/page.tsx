import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { DOCUMENTS, isFormDoc } from "@/lib/documents";
import ExplorerShell from "@/components/ExplorerShell";
import { DocTile } from "@/components/Tiles";
import SkinPicker from "@/components/SkinPicker";
import { skinsForTypeAsync } from "@/skins";
import { TYPE_SLUG, typeLabel, schemeYear, schemeName, statusChip, ACCENT } from "@/lib/folders";

// A scheme folder → its 14 documents as files, plus the scheme tools.
export default async function SchemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();

  const type = s.type;
  const year = schemeYear(s);
  const slug = TYPE_SLUG[type];
  const ac = ACCENT[type];
  const st = statusChip(s.status);
  const skins = await skinsForTypeAsync(type);

  return (
    <ExplorerShell
      active={{ type, year, schemeId: id }}
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: typeLabel(type), href: `/files/${slug}` },
        { label: year, href: `/files/${slug}/${year}` },
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
          <Link href={`/schemes/${id}/edit`} className="btn" style={{ fontSize: 13 }}>Edit data</Link>
          <Link href={`/schemes/${id}/participants`} className="btn" style={{ fontSize: 13 }}>Participants</Link>
          <Link href={`/schemes/${id}/applications`} className="btn" style={{ fontSize: 13 }}>Applications</Link>
          <Link href={`/schemes/${id}/results`} className="btn" style={{ fontSize: 13 }}>Results</Link>
          <SkinPicker schemeId={id} current={s.skin ?? "classic"} skins={skins.map((k) => ({ id: k.meta.id, name: k.meta.name }))} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 16 }}>
        {DOCUMENTS.map((d) => {
          const formDoc = isFormDoc(d.key);
          if (formDoc) {
            const filled = !!s.formData?.[d.key] && Object.values(s.formData[d.key]).some(Boolean);
            return <DocTile key={d.key} href={`/schemes/${id}/fill/${d.key}`} name={d.nameEn} form={d.formNumber} built={filled} action="Fill ✎" builtLabel="Filled ✓" emptyLabel="To fill" />;
          }
          const saved = s.docs?.[d.key];
          const built = !!(saved && (saved.bg || saved.en));
          return <DocTile key={d.key} href={`/schemes/${id}/build/${d.key}`} name={d.nameEn} form={d.formNumber} built={built} />;
        })}
      </div>
    </ExplorerShell>
  );
}
