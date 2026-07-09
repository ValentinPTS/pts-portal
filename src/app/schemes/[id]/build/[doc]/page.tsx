import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme, getSchemesByIds, listSchemeSummaries } from "@/lib/store";
import { getDoc, isFormDoc } from "@/lib/documents";
import { listParticipants } from "@/lib/participants";
import { listLibraryItems } from "@/lib/library-store";
import { listSavedTemplates } from "@/lib/saved-templates";
import { esc } from "@/lib/doc-shell";
import { defaultDocHtml, coverDocHtml, insertableSnippets, insertableFields, insertableFormElements } from "@/lib/doc-html";
import { hasDocTemplate } from "@/lib/doc-template";
import { resolveSkinAsync } from "@/skins";
import WordEditor from "@/components/WordEditor";
import { canRevealNames, getCurrentRole } from "@/lib/roles";
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

  // Name guard (§4.2): only a manager sees real names on the participant lists.
  // Those lists are data-driven, so we always start the editor from the fresh
  // (masked-per-role) default rather than any saved HTML.
  const reveal = canRevealNames(await getCurrentRole());
  const isList = doc === "registered" || doc === "registered-coded" || doc === "results-coded";
  const saved = isList ? { bg: "", en: "" } : (s.docs?.[doc] ?? { bg: "", en: "" });
  const dft = defaultDocHtml(s, doc, participants, reveal);
  // the editable title page (cover) for this document in the scheme's skin
  const skin = await resolveSkinAsync(s);
  const cov = coverDocHtml(s, doc, participants, skin);
  // the owner's saved snippets → insertable items (wrap plain text as a paragraph)
  const custom = (await listLibraryItems()).map((c) => ({
    id: c.id,
    name: c.name,
    bg: `<p>${esc(c.bg)}</p>`,
    en: `<p>${esc(c.en || c.bg)}</p>`,
  }));
  // a built-in snippet the owner has customized (a same-name library item exists) shows
  // as their editable "My item" instead — so drop it from the built-in Snippets group.
  const customNames = new Set(custom.map((c) => c.name.trim().toLowerCase()));
  const snippets = insertableSnippets().filter((sn) => !customNames.has(sn.name.trim().toLowerCase()));

  // saved whole-document templates for THIS document + scheme type
  const savedTemplates = (await listSavedTemplates(doc, s.type)).map((t) => ({
    id: t.id, name: t.name, bg: t.bg, en: t.en,
  }));

  // other schemes (same type) that already have THIS document built → copy from.
  // Narrow to same-type ids via the cheap scalar-column summary first, then batch-load
  // only those full rows (not every scheme's JSONB) to check which built the doc.
  const sameTypeIds = (await listSchemeSummaries())
    .filter((o) => o.id !== s.id && o.type === s.type)
    .map((o) => o.id);
  const copyFrom = (await getSchemesByIds(sameTypeIds))
    .filter((o) => o.docs?.[doc]?.bg || o.docs?.[doc]?.en)
    .slice(0, 25)
    .map((o) => ({
      id: o.id, number: o.number, title: o.titleEn || o.titleBg || o.number,
      bg: o.docs?.[doc]?.bg ?? "", en: o.docs?.[doc]?.en ?? "",
    }));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
          ← {s.number} · {tr("build.documentsWord")}
        </Link>
        <Link href={`/schemes/${id}/build/${encodeURIComponent(doc)}/history`} className="btn btn-sm" style={{ fontSize: 12 }}>
          {tr("hist.link")}
        </Link>
      </div>
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
        coverBg={cov.bg}
        coverEn={cov.en}
        hasDefault={hasDocTemplate(doc)}
        schemeType={s.type}
        isForm={isFormDoc(doc)}
        snippets={snippets}
        fields={insertableFields(s, participants)}
        formElements={insertableFormElements()}
        customItems={custom}
        savedTemplates={savedTemplates}
        copyFrom={copyFrom}
      />
    </div>
  );
}
