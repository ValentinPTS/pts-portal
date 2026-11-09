import type { Scheme, Lang, DocOptions } from "./types";
import { renderPlan } from "./docs/plan";
import { renderInvitation } from "./docs/invitation";
import { renderApplication } from "./docs/application";
import { renderDeclaration, DEC_CSS } from "./docs/declaration";
import { renderProtocol } from "./docs/protocol";
import { renderInstruction } from "./docs/instruction";
import { renderResults, RS_CSS } from "./docs/results";
import { renderCodesAndResults, EXTRA_CSS as RSCODED_CSS } from "./docs/results-coded";
import { renderReport, REPORT_CSS } from "./docs/report";
import { renderCertificate, EXTRA_CSS as CERT_CSS } from "./docs/certificate";
import { renderRegistered, renderNamesToCodes, EXTRA_CSS as REG_CSS } from "./docs/registered";
import { renderOrder, EXTRA_CSS as ORDER_CSS } from "./docs/order";
import { renderStatProject, renderStatProjectC, EXTRA_CSS as STAT_CSS } from "./docs/stat-project";
import { renderFeedback, EXTRA_CSS as FB_CSS } from "./docs/feedback";
// calibration variants
import { renderPlanC } from "./docs/plan-c";
import { renderInvitationC } from "./docs/invitation-c";
import { renderApplicationC } from "./docs/application-c";
import { renderProtocolC } from "./docs/protocol-c";
import { renderInstructionC } from "./docs/instruction-c";
import { renderResultsC, RS_CSS as RS_C_CSS } from "./docs/results-c";
import { renderReportC, REPORT_C_CSS } from "./docs/report-c";
import { renderCertificateC, EXTRA_CSS as CERT_C_CSS } from "./docs/certificate-c";

export type DocRenderer = (s: Scheme, lang: Lang, opts?: DocOptions) => string;

export interface DocDef {
  key: string;
  nameEn: string;
  nameBg: string;
  formNumber: string;
  render?: DocRenderer; // present = the document is live
  // The document's print-only extra stylesheet (per scheme type). The editor
  // injects the SAME css (scoped) so editing looks exactly like the locked doc.
  editorCss?: { t?: string; c?: string };
}

// Picks the testing or calibration renderer based on the scheme type. Forwards
// opts (e.g. the per-participant context the Certificate needs).
const byType =
  (testing: DocRenderer, calibration: DocRenderer): DocRenderer =>
  (s, lang, opts) =>
    s.type === "C" ? calibration(s, lang, opts) : testing(s, lang, opts);

export const DOCUMENTS: DocDef[] = [
  { key: "order", nameEn: "Order", nameBg: "Заповед", formNumber: "internal", render: renderOrder, editorCss: { t: ORDER_CSS, c: ORDER_CSS } },
  { key: "plan", nameEn: "Proficiency Testing Plan", nameBg: "План за изпитване за пригодност", formNumber: "F 7.2.1-1", render: byType(renderPlan, renderPlanC) },
  { key: "stat-project", nameEn: "Statistical Project", nameBg: "Статистически проект", formNumber: "F 7.2.2-1", render: byType(renderStatProject, renderStatProjectC), editorCss: { t: STAT_CSS, c: STAT_CSS } },
  { key: "invitation", nameEn: "Invitation", nameBg: "Покана", formNumber: "F 7.2.1-2", render: byType(renderInvitation, renderInvitationC) },
  { key: "application", nameEn: "Application for Participation", nameBg: "Заявка за участие", formNumber: "F 7.2.1-3", render: byType(renderApplication, renderApplicationC) },
  { key: "registered", nameEn: "List of Applied Participants", nameBg: "Списък на заявилите участие", formNumber: "F 7.2.1-4", render: renderRegistered, editorCss: { t: REG_CSS, c: REG_CSS } },
  // F 7.2.1-5 / -6: PTS's titles are swapped against their content and the content
  // governs (assignment of 31.10.2026, §4; plan part 0.2). The keys stay with their
  // form numbers — uploads and edits filed under a form stay with it — and -5 now
  // renders codes and results (no names), -6 the name↔code mapping (manager only).
  { key: "registered-coded", nameEn: "Encrypted List of Participants", nameBg: "Кодиран списък на участниците", formNumber: "F 7.2.1-5", render: renderCodesAndResults, editorCss: { t: RSCODED_CSS, c: RSCODED_CSS } },
  { key: "declaration", nameEn: "Confidentiality Declaration", nameBg: "Декларация за конфиденциалност", formNumber: "F 4.2-2", render: renderDeclaration, editorCss: { t: DEC_CSS, c: DEC_CSS } },
  { key: "protocol", nameEn: "Protocol for PT Item Receipt", nameBg: "Протокол за получаване на обект", formNumber: "F 7.3.4-1", render: byType(renderProtocol, renderProtocolC) },
  { key: "instruction", nameEn: "Instruction for Participants", nameBg: "Инструкция за участниците", formNumber: "F 7.3.5-1", render: byType(renderInstruction, renderInstructionC) },
  { key: "results", nameEn: "Results Sheet", nameBg: "Лист с резултати", formNumber: "F 7.2.1-7", render: byType(renderResults, renderResultsC), editorCss: { t: RS_CSS, c: RS_C_CSS } },
  { key: "results-coded", nameEn: "Encrypted List of Results", nameBg: "Кодиран списък на резултатите", formNumber: "F 7.2.1-6", render: renderNamesToCodes, editorCss: { t: REG_CSS, c: REG_CSS } },
  { key: "report", nameEn: "Final Report", nameBg: "Окончателен доклад", formNumber: "F 7.4.3-1", render: byType(renderReport, renderReportC), editorCss: { t: REPORT_CSS, c: REPORT_C_CSS } },
  { key: "certificate", nameEn: "Certificate of Participation", nameBg: "Сертификат за участие", formNumber: "", render: byType(renderCertificate, renderCertificateC), editorCss: { t: CERT_CSS, c: CERT_C_CSS } },
  { key: "feedback", nameEn: "Feedback Sheet", nameBg: "Лист за обратна връзка", formNumber: "F 8.6-2", render: renderFeedback, editorCss: { t: FB_CSS, c: FB_CSS } },
];

export function getDoc(key: string): DocDef | undefined {
  return DOCUMENTS.find((d) => d.key === key);
}

// The extra stylesheet the print pass uses for this document — the editor injects
// the same rules (scoped to its page) so WYSIWYG matches the locked/printed look.
export function docEditorCss(key: string, type: "T" | "C"): string {
  const e = getDoc(key)?.editorCss;
  return (type === "C" ? e?.c ?? e?.t : e?.t) ?? "";
}

// Documents whose controls (checkboxes, options, ratings, blanks) are fillable
// form fields (lib/form-fields.ts). These get a "Fill" action on the scheme page
// and persist their values to scheme.formData. Grows as renderers are converted.
export const FORM_DOCS = new Set<string>(["feedback", "declaration", "application", "protocol", "results"]);
export const isFormDoc = (key: string): boolean => FORM_DOCS.has(key);

// The participant/results REGISTERS (F 7.2.1-4 / -5 / -6): data-driven documents
// generated live from the scheme's participants and results. They always exist —
// no started/ready lifecycle, no progress contribution — and may only be visually
// customized in the editor (a manager's saved customization is honoured per the
// §4.2 name guard; everyone else always gets the fresh, masked auto version).
export const LIST_DOCS = new Set<string>(["registered", "registered-coded", "results-coded"]);
export const isListDoc = (key: string): boolean => LIST_DOCS.has(key);

// F 7.2.1-6 lists names against codes (§4.2): a manager's alone. Every route,
// page and action that serves or changes it refuses everyone else outright —
// masking is not enough for a document whose whole content is the link.
export const RESTRICTED_DOCS = new Set<string>(["results-coded"]);
export const isRestrictedDoc = (key: string): boolean => RESTRICTED_DOCS.has(key);

// The Order (Заповед) that starts a scheme and assigns its roles: internal — only the
// staff it assigns roles to, and the head who issues it (Реш. 149; lib/access.ts
// mayViewDoc). Never sendable to a participant (lib/doc-release SENDABLE_DOCS).
export const ORDER_DOC = "order";

// The documents that put a laboratory's NAME against its CODE — F 7.2.1-6 and the
// certificate. Every opening of one, with names, is in the journal (part 1.9).
export const NAME_CODE_DOCS = new Set<string>(["results-coded", "certificate"]);
export const pairsNamesWithCodes = (key: string): boolean => NAME_CODE_DOCS.has(key);
// The documents that show who is behind a code at all — F 7.2.1-4 (names), F 7.2.1-6
// (the mapping) and the certificate. Only for these is the identity store opened
// (part 2.3); every other document is rendered from the codes alone.
export const IDENTITY_DOCS = new Set<string>(["registered", "results-coded", "certificate"]);
export const showsIdentities = (key: string): boolean => IDENTITY_DOCS.has(key);

// The two coded lists swapped content in part 0.2. Anything saved for either one
// before — a body, a revision, a whole-document template — was written for the
// other list, so it is never used. What is saved from now on carries this mark at
// the start of its HTML, added on the server at every save (it renders as nothing),
// and only marked content counts. Exact, with no date to get wrong.
export const CODED_LISTS = new Set<string>(["registered-coded", "results-coded"]);
export const CODED_LIST_MARK = "<!--pts:coded-list-v2-->";
export function markCodedList(key: string, html: string): string {
  if (!CODED_LISTS.has(key) || !html || html.startsWith(CODED_LIST_MARK)) return html;
  return CODED_LIST_MARK + html;
}
export function usableForDoc(key: string, body: { bg?: string; en?: string }): boolean {
  if (!CODED_LISTS.has(key)) return true;
  return !!(body.bg?.startsWith(CODED_LIST_MARK) || body.en?.startsWith(CODED_LIST_MARK));
}
export function savedDocBody(s: Scheme, key: string): { bg: string; en: string } | undefined {
  const d = s.docs?.[key];
  return d && usableForDoc(key, d) ? d : undefined;
}

// Has this document got any content yet (started)? A form document counts both
// ways it can be worked on: fill-saved values AND/OR an editor-built body.
export function hasDocContent(s: Scheme, key: string): boolean {
  const d = savedDocBody(s, key);
  const built = !!(d?.bg || d?.en);
  const filled = !!s.formData?.[key] && Object.values(s.formData[key]).some(Boolean);
  return isFormDoc(key) ? built || filled : built;
}

// Is this document DONE for progress purposes? One rule everywhere (scheme tiles,
// the documents page, stage progress): an active uploaded file is done (it's a
// final external document); anything the owner BUILT in the editor counts only
// when explicitly marked ready (scheme.docReady — the editor's "Готов" button).
// A fill-only form document (no editor body) keeps the older rule: filled = done.
export function isDocDone(s: Scheme, key: string): boolean {
  const hasUpload = !!s.uploads?.[key];
  const started = hasDocContent(s, key);
  if (hasUpload && (s.docActive?.[key] !== "built" || !started)) return true;
  if (!started) return false;
  const d = savedDocBody(s, key);
  const built = !!(d?.bg || d?.en);
  if (isFormDoc(key) && !built) return true;
  return !!s.docReady?.[key];
}
