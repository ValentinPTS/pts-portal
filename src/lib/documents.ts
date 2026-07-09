import type { Scheme, Lang, DocOptions } from "./types";
import { renderPlan } from "./docs/plan";
import { renderInvitation } from "./docs/invitation";
import { renderApplication } from "./docs/application";
import { renderDeclaration } from "./docs/declaration";
import { renderProtocol } from "./docs/protocol";
import { renderInstruction } from "./docs/instruction";
import { renderResults } from "./docs/results";
import { renderResultsCoded } from "./docs/results-coded";
import { renderReport } from "./docs/report";
import { renderCertificate } from "./docs/certificate";
import { renderRegistered, renderRegisteredCoded } from "./docs/registered";
import { renderOrder } from "./docs/order";
import { renderStatProject, renderStatProjectC } from "./docs/stat-project";
import { renderFeedback } from "./docs/feedback";
// calibration variants
import { renderPlanC } from "./docs/plan-c";
import { renderInvitationC } from "./docs/invitation-c";
import { renderApplicationC } from "./docs/application-c";
import { renderProtocolC } from "./docs/protocol-c";
import { renderInstructionC } from "./docs/instruction-c";
import { renderResultsC } from "./docs/results-c";
import { renderReportC } from "./docs/report-c";
import { renderCertificateC } from "./docs/certificate-c";

export type DocRenderer = (s: Scheme, lang: Lang, opts?: DocOptions) => string;

export interface DocDef {
  key: string;
  nameEn: string;
  nameBg: string;
  formNumber: string;
  render?: DocRenderer; // present = the document is live
}

// Picks the testing or calibration renderer based on the scheme type. Forwards
// opts (e.g. the per-participant context the Certificate needs).
const byType =
  (testing: DocRenderer, calibration: DocRenderer): DocRenderer =>
  (s, lang, opts) =>
    s.type === "C" ? calibration(s, lang, opts) : testing(s, lang, opts);

export const DOCUMENTS: DocDef[] = [
  { key: "order", nameEn: "Order", nameBg: "Заповед", formNumber: "internal", render: renderOrder },
  { key: "plan", nameEn: "Proficiency Testing Plan", nameBg: "План за изпитване за пригодност", formNumber: "F 7.2.1-1", render: byType(renderPlan, renderPlanC) },
  { key: "stat-project", nameEn: "Statistical Project", nameBg: "Статистически проект", formNumber: "F 7.2.2-1", render: byType(renderStatProject, renderStatProjectC) },
  { key: "invitation", nameEn: "Invitation", nameBg: "Покана", formNumber: "F 7.2.1-2", render: byType(renderInvitation, renderInvitationC) },
  { key: "application", nameEn: "Application for Participation", nameBg: "Заявка за участие", formNumber: "F 7.2.1-3", render: byType(renderApplication, renderApplicationC) },
  { key: "registered", nameEn: "List of Applied Participants", nameBg: "Списък на заявилите участие", formNumber: "F 7.2.1-4", render: renderRegistered },
  { key: "registered-coded", nameEn: "Encrypted List of Participants", nameBg: "Кодиран списък на участниците", formNumber: "F 7.2.1-5", render: renderRegisteredCoded },
  { key: "declaration", nameEn: "Confidentiality Declaration", nameBg: "Декларация за конфиденциалност", formNumber: "F 4.2-2", render: renderDeclaration },
  { key: "protocol", nameEn: "Protocol for PT Item Receipt", nameBg: "Протокол за получаване на обект", formNumber: "F 7.3.4-1", render: byType(renderProtocol, renderProtocolC) },
  { key: "instruction", nameEn: "Instruction for Participants", nameBg: "Инструкция за участниците", formNumber: "F 7.3.5-1", render: byType(renderInstruction, renderInstructionC) },
  { key: "results", nameEn: "Results Sheet", nameBg: "Лист с резултати", formNumber: "F 7.2.1-7", render: byType(renderResults, renderResultsC) },
  { key: "results-coded", nameEn: "Encrypted List of Results", nameBg: "Кодиран списък на резултатите", formNumber: "F 7.2.1-6", render: renderResultsCoded },
  { key: "report", nameEn: "Final Report", nameBg: "Окончателен доклад", formNumber: "F 7.4.3-1", render: byType(renderReport, renderReportC) },
  { key: "certificate", nameEn: "Certificate of Participation", nameBg: "Сертификат за участие", formNumber: "proposed", render: byType(renderCertificate, renderCertificateC) },
  { key: "feedback", nameEn: "Feedback Sheet", nameBg: "Лист за обратна връзка", formNumber: "F 8.6-2", render: renderFeedback },
];

export function getDoc(key: string): DocDef | undefined {
  return DOCUMENTS.find((d) => d.key === key);
}

// Documents whose controls (checkboxes, options, ratings, blanks) are fillable
// form fields (lib/form-fields.ts). These get a "Fill" action on the scheme page
// and persist their values to scheme.formData. Grows as renderers are converted.
export const FORM_DOCS = new Set<string>(["feedback", "declaration", "application", "protocol", "results"]);
export const isFormDoc = (key: string): boolean => FORM_DOCS.has(key);
