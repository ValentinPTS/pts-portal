import type { Lang } from "../types";
import { esc, pick } from "../doc-css";

// Handover of the item and the risk in transit (Реш. 154, PTS 31.10.2026): Incoterms
// do not apply; the risk lies with the side that chose the carrier. The Bulgarian
// is PTS's own text, word for word; the English is ours, for PTS to approve. It goes
// into both Plans (§11) and both Invitations.
//
// The city stays a blank line until PTS names it (D12, Смолян or Хасково) — it can
// be filled in per document in the editor until the scheme has a field for it (3.7).
const CITY_BLANK = "____________";

export function transitRisk(lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  return `<h3 class="sub">${L("Handover of the item and risk in transit", "Предаване на обекта и риск при превоз")}</h3>
    <p>${L(
      `The item is handed over in ${CITY_BLANK}. Where the carrier is chosen and paid by the provider, the risk in transit lies with the provider until the participant accepts the item. Where the carrier is chosen by the participant, including the participant's own courier, the risk in transit lies with the participant from the moment of handover. Customs duties, taxes and charges on import into countries outside the European Union are borne by the participant. A carrier's delay does not extend the deadline for submitting results.`,
      `Обектът се предава в ${CITY_BLANK}. Когато превозвачът е избран и платен от провайдъра, рискът при превоз е за провайдъра до приемането на обекта от участника. Когато превозвачът е избран от участника, включително при собствен куриер, рискът при превоз е за участника от момента на предаването. Мита, данъци и такси при внос в държави извън Европейския съюз са за сметка на участника. Закъснение на превозвача не удължава срока за подаване на резултати.`,
    )}</p>`;
}
