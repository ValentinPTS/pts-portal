import Link from "next/link";
import { requireCap, mayNow, getViewer, authorize, requireDocView } from "@/lib/access";
import { notFound } from "next/navigation";
import { getScheme, getSchemesByIds, listSchemeSummaries } from "@/lib/store";
import { getDoc, isFormDoc, isListDoc, isRestrictedDoc, savedDocBody, usableForDoc, docEditorCss, pairsNamesWithCodes, showsIdentities, ORDER_DOC } from "@/lib/documents";
import { listParticipants, withoutIdentity } from "@/lib/participants";
import { inRound } from "@/lib/application-model";
import { namesFor } from "@/lib/identities";
import { listLibraryItems } from "@/lib/library-store";
import { listSavedTemplates } from "@/lib/saved-templates";
import { esc } from "@/lib/doc-shell";
import { defaultDocHtml, coverDocHtml, insertableSnippets, insertableFields, insertableFormElements } from "@/lib/doc-html";
import { retagFormBody } from "@/lib/form-hydrate";
import { hasDocTemplate } from "@/lib/doc-template";
import { resolveSkinAsync } from "@/skins";
import WordEditor from "@/components/WordEditor";
import { requireStaff } from "@/lib/roles";
import { logActivity } from "@/lib/activity";
import { getServerT } from "@/lib/i18n-server";
import { isSendableDoc } from "@/lib/doc-release";

export default async function BuildDocPage({
  params,
}: {
  params: Promise<{ id: string; doc: string }>;
}) {
  await requireStaff(); // read gate: manager/staff/auditor only
  const { id, doc } = await params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  if (isRestrictedDoc(doc)) await requireCap("names.view", id); // F 7.2.1-6 = names ↔ codes (part 0.2)
  await requireDocView(doc, id); // the Order: the staff it assigns roles to (Реш. 149, 2.6)
  const s = await getScheme(id);
  const def = getDoc(doc);
  // only real document keys — an invented one must not reach templates or saves
  if (!s || !def) notFound();
  // the round's documents list the participations in it — never one refused, annulled or withdrawn (5.1)
  const coded = (await listParticipants(id)).filter(inRound);
  const { lang, tr } = await getServerT();

  // Name guard (§4.2): only a manager sees real names on the participant lists.
  // A manager's saved list CUSTOMIZATION is honoured; anyone else always starts
  // from the fresh (masked-per-role) data-driven default — a saved list body may
  // carry real names, so it never reaches a role that can't reveal them.
  const reveal = await mayNow("names.view", id);
  // who is behind the codes only for a document that shows it, to a manager (2.3)
  const participants = reveal && showsIdentities(doc) ? await namesFor(id, coded) : coded.map(withoutIdentity);
  const isList = isListDoc(doc);
  if (reveal && pairsNamesWithCodes(doc) && participants.length) await logActivity("names.viewed", { schemeId: id, subject: `doc:${doc}`, summary: `Laboratory names shown with their codes — the document ${doc}` });
  const saved0 = (isList || showsIdentities(doc)) && !reveal ? { bg: "", en: "" } : (savedDocBody(s, doc) ?? { bg: "", en: "" });
  const dft = defaultDocHtml(s, doc, participants, reveal);
  // A form-doc body saved before data-ff existed gets its control identity
  // re-attached from the template here, so the owner's next save persists it
  // and the Fill view stays fillable (fresh copy — never mutate the store's).
  const saved = isFormDoc(doc)
    ? { bg: retagFormBody(saved0.bg ?? "", dft.bg), en: retagFormBody(saved0.en ?? "", dft.en) }
    : saved0;
  // the editable title page (cover) for this document in the scheme's skin
  const skin = await resolveSkinAsync(s);
  const cov = coverDocHtml(s, doc, participants, skin);
  // the owner's saved snippets → insertable items (wrap plain text as a paragraph)
  const custom = (await listLibraryItems()).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    bg: `<p>${esc(c.bg)}</p>`,
    en: `<p>${esc(c.en || c.bg)}</p>`,
  }));
  // a built-in snippet the owner has customized (a same-name library item exists) shows
  // as their editable "My item" instead — so drop it from the built-in Snippets group.
  const customNames = new Set(custom.map((c) => c.name.trim().toLowerCase()));
  const snippets = insertableSnippets().filter((sn) => !customNames.has(sn.name.trim().toLowerCase()));

  // A document that shows who is behind a code — the lists, F 7.2.1-6, the
  // certificate — may carry names in a saved body. Since names are per scheme (2.4):
  // no shared whole-document template of one is offered (nor saved), and another
  // scheme's saved body only from a scheme where this person sees names too.
  const identityDoc = isList || showsIdentities(doc);
  const viewer = await getViewer();
  // …and no shared template of the Order: one scheme's, for the staff it assigns (Реш. 149)
  const savedTemplates = identityDoc || doc === ORDER_DOC ? [] : (await listSavedTemplates(doc, s.type))
    .filter((t) => usableForDoc(doc, t)) // a coded-list template from before the swap is the other list's
    .map((t) => ({ id: t.id, name: t.name, bg: t.bg, en: t.en }));

  // other schemes (same type) that already have THIS document built → copy from.
  // Narrow to same-type ids via the cheap scalar-column summary first, then batch-load
  // only those full rows (not every scheme's JSONB) to check which built the doc.
  const sameTypeIds = (await listSchemeSummaries())
    .filter((o) => o.id !== s.id && o.type === s.type)
    // the Order of another scheme: only where one is among the staff it assigns (Реш. 149)
    .filter((o) => authorize(viewer, identityDoc ? "names.view" : doc === ORDER_DOC ? "order.view" : "codes.view", o.id))
    .map((o) => o.id);
  const copyFrom = (await getSchemesByIds(sameTypeIds))
    .map((o) => ({ o, d: savedDocBody(o, doc) }))
    .filter(({ d }) => d?.bg || d?.en)
    .slice(0, 25)
    .map(({ o, d }) => ({
      id: o.id, number: o.number, title: o.titleEn || o.titleBg || o.number,
      bg: d?.bg ?? "", en: d?.en ?? "",
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
        initialReady={!!s.docReady?.[doc]}
        initialBg={saved.bg}
        initialEn={saved.en}
        defaultBg={dft.bg}
        defaultEn={dft.en}
        coverBg={cov.bg}
        coverEn={cov.en}
        hasDefault={hasDocTemplate(doc)}
        schemeType={s.type}
        isForm={isFormDoc(doc)}
        isList={isList}
        extraCss={docEditorCss(doc, s.type)}
        snippets={snippets}
        // a document labs receive never offers the engine's «scores» (Реш. 135)
        fields={insertableFields(s, participants).filter((f) => !(isSendableDoc(doc) && f.key === "scores"))}
        formElements={insertableFormElements()}
        customItems={custom}
        savedTemplates={savedTemplates}
        copyFrom={copyFrom}
        canEdit={await mayNow("scheme.edit", s.id)}
      />
    </div>
  );
}
