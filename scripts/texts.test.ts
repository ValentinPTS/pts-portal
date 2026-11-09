// The texts PTS decided (plan part 0.11): each new wording is in the rendered
// document, and the old one is gone — in Bulgarian and English, for testing and
// calibration. The texts themselves wait for PTS's approval («Какво да пробвате»).
import { readFileSync } from "node:fs";
import { getDoc } from "../src/lib/documents.ts";
import { withSkin } from "../src/lib/doc-shell.ts";
import { getSkin } from "../src/skins/index.ts";
import { footerLine } from "../src/lib/doc-css.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import { blankScheme } from "../src/lib/new-scheme.ts";
import type { Scheme, Lang, DocOptions } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const T: Scheme = structuredClone(pavingBlocks);
const C: Scheme = structuredClone(forceCalibration);
const opts: DocOptions = { revealNames: false, participants: [] };
const html = (s: Scheme, doc: string, lang: Lang) => getDoc(doc)!.render!(s, lang, opts);
// the document's text with tags dropped, so a sentence split by markup still matches
const text = (s: Scheme, doc: string, lang: Lang) => html(s, doc, lang).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ── the footer helper ──────────────────────────────────────────────────────
t("footer: all three parts", footerLine("Rev. 1", "F 7.2.1-1", "06.01.2025") === "Rev. 1 · F 7.2.1-1 · 06.01.2025");
t("footer: an empty form number leaves no gap", footerLine("Rev. 1", "", "06.01.2025") === "Rev. 1 · 06.01.2025");
t("footer: escaped", footerLine("<b>", "", "x") === "&lt;b&gt; · x");

for (const lang of ["bg", "en"] as const) {
  const bg = lang === "bg";

  // Q22 — the Order heading
  const order = text(T, "order", lang);
  t(`${lang}: Order heading`, bg ? order.includes("Относно: Планиране на изпитване за пригодност") : order.includes("Regarding: Planning of proficiency testing"));
  if (bg) t("bg: Order heading has no «на пригодност»", !order.includes("изпитване на пригодност"));

  // Q23 — the certificate carries no form number and no «proposed»
  for (const s of [T, C]) {
    const cert = html(s, "certificate", lang);
    t(`${lang}/${s.type}: certificate has no «proposed»`, !cert.includes("proposed"));
    t(`${lang}/${s.type}: certificate footer = revision · date`, cert.includes(`<div class="docfooter">${s.revision} · ${s.revisionDate}</div>`));
  }
  t("the catalogue lists no form number for the certificate", getDoc("certificate")!.formNumber === "");
  // …in every skin, not only the classic one
  for (const skin of ["modern", "minimal"]) {
    const cert = withSkin(getSkin(skin), () => html(T, "certificate", lang));
    t(`${lang}/${skin}: certificate footer = revision · date`, cert.includes(`<div class="docfooter">${T.revision} · ${T.revisionDate}</div>`) && !cert.includes("proposed"));
  }

  // E2, П3, Реш. 96, Реш. 154 — the testing Invitation
  const inv = text(T, "invitation", lang);
  t(`${lang}: no «illustrative» note`, !/илюстратив|illustrative/i.test(inv));
  t(`${lang}: П3 names both paths`, bg
    ? inv.includes("във формат PDF, изпратена по имейл, или през портала за участници") && !inv.includes("онлайн системата")
    : inv.includes("in PDF format sent by e-mail, or through the participant portal") && !inv.includes("online system"));
  const pay = bg
    ? "Плащането не е условие за изпращане: обектът се изпраща по графика. Окончателният доклад и сертификатът за участие се предоставят след постъпване на плащането по съответната заявка."
    : "Payment is not a condition for dispatch: the item is sent according to the schedule. The final report and the certificate of participation are provided once payment for the application has been received.";
  t(`${lang}: testing Invitation — the payment sentence`, inv.includes(pay));
  t(`${lang}: testing Invitation — no «only the paid»`, !inv.includes("Само участници, за които е постъпило плащане") && !inv.includes("Only participants who have paid"));
  // PTS's own Bulgarian, word for word (Реш. 154), the city a blank (D12)
  const risk = bg
    ? "Обектът се предава в ____________. Когато превозвачът е избран и платен от провайдъра, рискът при превоз е за провайдъра до приемането на обекта от участника. Когато превозвачът е избран от участника, включително при собствен куриер, рискът при превоз е за участника от момента на предаването. Мита, данъци и такси при внос в държави извън Европейския съюз са за сметка на участника. Закъснение на превозвача не удължава срока за подаване на резултати."
    : "The item is handed over in ____________. Where the carrier is chosen and paid by the provider, the risk in transit lies with the provider until the participant accepts the item. Where the carrier is chosen by the participant, including the participant's own courier, the risk in transit lies with the participant from the moment of handover. Customs duties, taxes and charges on import into countries outside the European Union are borne by the participant. A carrier's delay does not extend the deadline for submitting results.";
  t(`${lang}: testing Invitation — the risk paragraph`, inv.includes(risk));

  // Реш. 96, Реш. 154 — the calibration Invitation
  const invC = text(C, "invitation", lang);
  t(`${lang}: calibration Invitation — the same payment sentence`, invC.includes(pay));
  t(`${lang}: calibration Invitation — no «only the paid»`, !invC.includes("Включват се само платилите") && !invC.includes("Only participants who have paid"));
  t(`${lang}: calibration Invitation — the risk paragraph`, invC.includes(risk));

  // Реш. 154 in both Plans; §20 names both paths and no automatic certificate
  for (const s of [T, C]) {
    const plan = text(s, "plan", lang);
    t(`${lang}/${s.type}: Plan — the risk paragraph`, plan.includes(risk));
    t(`${lang}/${s.type}: Plan §20 — both paths`, bg ? plan.includes("или през портала за участници") : plan.includes("or through the participant portal"));
    t(`${lang}/${s.type}: Plan §20 — certificate after the approved report`, bg
      ? plan.includes("се издава от PTS след одобряване на окончателния доклад") && !plan.includes("генерира автоматично")
      : plan.includes("is issued by PTS after the final report is approved") && !plan.includes("generated automatically"));
  }

  // П14 — the calibration Instruction
  const instC = text(C, "instruction", lang);
  t(`${lang}: Instruction — the next address in the portal or by e-mail`, bg
    ? instC.includes("адресът му се вижда в портала за участници или се изпраща по имейл")
    : instC.includes("whose address is shown in the participant portal or sent by e-mail"));
  t(`${lang}: Instruction keeps its 3 working days`, bg ? instC.includes("максимум 3 работни дни") : instC.includes("maximum of 3 working days"));

  // П18 — both Applications
  for (const s of [T, C]) {
    const app = text(s, "application", lang);
    t(`${lang}/${s.type}: Application — the date by e-mail or in the portal`, bg
      ? app.includes("е получена на посочения по-горе имейл адрес или е подадена през портала за участници")
      : app.includes("is received at the e-mail address above or submitted through the participant portal"));
  }

  // П19–П22 — the Feedback sheet
  const fb = text(T, "feedback", lang);
  t(`${lang}: Feedback — no «did you receive it by e-mail»`, bg
    ? !fb.includes("Получихте ли по имейл") && !fb.includes("в случай че не сте получили")
    : !fb.includes("Did you receive") && !fb.includes("in case you have not received"));
  t(`${lang}: Feedback — five questions, numbered 1 to 5`, fb.includes(" 5. ") && !fb.includes(" 6. ") && !fb.includes(" 7. "));
  t(`${lang}: Feedback — answer fields q6/q7 kept`, /data-ff="\w:q6[:"]/.test(html(T, "feedback", lang)) && /data-ff="\w:q7[:"]/.test(html(T, "feedback", lang)));

  // D22 — u_stab / (2·√3) in Ф 7.2.2-1 and in the Plan's formula line
  const stat = html(C, "stat-project", lang);
  t(`${lang}: Ф 7.2.2-1 — u_stab / (2·√3)`, stat.includes("|X_REF1 − X_REF2| / (2·√3)") && !stat.includes("X_REF2| / √3"));
  t(`${lang}: calibration Plan — u_stab / (2·√3)`, html(C, "plan", lang).includes("/ (2·√3)"));
}

// a new scheme starts from the decided defaults
const fresh = blankScheme({ type: "C" } as Parameters<typeof blankScheme>[0]);
t("new calibration scheme: u_stab / (2·√3)", fresh.calibration?.stabilityFormula === "u_stab = |X_ref1 − X_ref2| / (2·√3)");
t("new scheme: §20 names both paths (bg)", !!fresh.clauses.applying?.bg.includes("през портала за участници"));
t("new scheme: §20 names both paths (en)", !!fresh.clauses.applying?.en.includes("through the participant portal"));
t("new scheme: §20 — certificate issued by PTS, in the Register", !!fresh.clauses.applying?.bg.includes("се издава от PTS след одобряване на окончателния доклад и се вписва в раздел „Регистър“ на www.ptsbg.eu")
  && !!fresh.clauses.applying?.en.includes("is issued by PTS after the final report is approved and is entered in the Register section of www.ptsbg.eu"));

// Q14 — the laboratory's chain card (a client component; its text is checked in the source)
const card = readFileSync(new URL("../src/components/DeviceChainCard.tsx", import.meta.url), "utf8");
// since 3.4 the card says the laboratory's OWN window — the scheme's working days from
// its receipt, the holiday calendar off (Q14) — and still that nothing is blocked
t("chain card: its own window from the receipt, the portal blocks nothing", card.includes("работни дни от получаването") && card.includes("working days from the receipt")
  && card.includes("Порталът не блокира нищо.") && card.includes("The portal blocks nothing."));
t("chain card: no «Няма срок»", !card.includes("Няма срок") && !card.includes("There is no deadline"));
// the PDF route builds its own footer line, through the same helper
const pdfRoute = readFileSync(new URL("../src/app/api/pdf/route.ts", import.meta.url), "utf8");
t("PDF footer goes through footerLine", pdfRoute.includes("footerLine(scheme.revision, def.formNumber, scheme.revisionDate)") && !pdfRoute.includes("${def.formNumber}"));

console.log(`texts.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
