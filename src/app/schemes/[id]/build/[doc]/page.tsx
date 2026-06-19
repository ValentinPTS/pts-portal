import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme, listSchemes } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { listParticipants } from "@/lib/participants";
import { listLibraryItems } from "@/lib/library-store";
import { listSavedTemplates } from "@/lib/saved-templates";
import { esc } from "@/lib/doc-shell";
import { defaultDocHtml, insertableSnippets, insertableFields } from "@/lib/doc-html";
import { hasDocTemplate } from "@/lib/doc-template";
import WordEditor from "@/components/WordEditor";
import { getServerT } from "@/lib/i18n-server";

export default async function BuildDocPage({
  params,
}: {
  params: Promise<{ id: string; doc: string }>;
}) {
  const { id, doc } = await params;
  const s = await getScheme(id);
  if (!s) notFound();
  const def = getDoc(doc);
  const participants = await listParticipants(id);
  const { lang, tr } = await getServerT();

  const saved = s.docs?.[doc] ?? { bg: "", en: "" };
  const dft = defaultDocHtml(s, doc, participants);
  // the owner's saved snippets → insertable items (wrap plain text as a paragraph)
  const custom = (await listLibraryItems()).map((c) => ({
    id: c.id,
    name: c.name,
    bg: `<p>${esc(c.bg)}</p>`,
    en: `<p>${esc(c.en || c.bg)}</p>`,
  }));

  // saved whole-document templates for THIS document + scheme type
  const savedTemplates = (await listSavedTemplates(doc, s.type)).map((t) => ({
    id: t.id, name: t.name, bg: t.bg, en: t.en,
  }));

  // other schemes (same type) that already have THIS document built → copy from
  const copyFrom = (await listSchemes())
    .filter((o) => o.id !== s.id && o.type === s.type && (o.docs?.[doc]?.bg || o.docs?.[doc]?.en))
    .slice(0, 25)
    .map((o) => ({
      id: o.id, number: o.number, title: o.titleEn || o.titleBg || o.number,
      bg: o.docs?.[doc]?.bg ?? "", en: o.docs?.[doc]?.en ?? "",
    }));

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number} · {tr("build.documentsWord")}
      </Link>
      <h1 className="text-3xl font-bold mt-1 mb-4" style={{ color: "var(--green-dark)", letterSpacing: "-0.01em" }}>
        {tr("build.prefix")}: {(lang === "bg" ? def?.nameBg : def?.nameEn) ?? doc}
      </h1>
      <WordEditor
        schemeId={s.id}
        docKey={doc}
        docNameEn={def?.nameEn ?? "Document"}
        initialBg={saved.bg}
        initialEn={saved.en}
        defaultBg={dft.bg}
        defaultEn={dft.en}
        hasDefault={hasDocTemplate(doc)}
        schemeType={s.type}
        snippets={insertableSnippets()}
        fields={insertableFields(s, participants)}
        customItems={custom}
        savedTemplates={savedTemplates}
        copyFrom={copyFrom}
      />
    </div>
  );
}
