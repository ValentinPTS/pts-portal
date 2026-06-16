import type { Scheme } from "./types";
import { pavingBlocks } from "./seed-paving-blocks";

// Builds a complete, editable new scheme from the identity fields.
// The reusable boilerplate (standard clauses, the PTS team, the scoring method)
// is seeded from the standard template so a new scheme is usable immediately;
// the scheme-specific data (parameters, schedule dates, prices, partner) starts
// blank with ready rows the admin fills in via "Edit scheme data".
export function blankScheme(opts: {
  id: string;
  number: string;
  type: "T" | "C";
  titleEn: string;
  titleBg: string;
  objectEn: string;
  objectBg: string;
  distribution: "simultaneous" | "sequential";
  minParticipants: number;
}): Scheme {
  return {
    id: opts.id,
    number: opts.number,
    type: opts.type,
    status: "draft",
    titleEn: opts.titleEn,
    titleBg: opts.titleBg,
    objectEn: opts.objectEn,
    objectBg: opts.objectBg,
    coverImage: undefined,
    distribution: opts.distribution,
    formNumber: "F 7.2.1-1",
    revision: "Revision 1",
    revisionDate: "06.01.2025",
    standard: "ISO/IEC 17043:2023",
    regNo: "752/T-008",
    minParticipants: opts.minParticipants,

    // reusable defaults (the team is constant; clauses & scoring are standard boilerplate)
    team: pavingBlocks.team.map((m) => ({ ...m })),
    assignedValueMethodEn: pavingBlocks.assignedValueMethodEn,
    assignedValueMethodBg: pavingBlocks.assignedValueMethodBg,
    scoresEn: pavingBlocks.scoresEn,
    scoresBg: pavingBlocks.scoresBg,
    clauses: JSON.parse(JSON.stringify(pavingBlocks.clauses)),

    // scheme-specific data — starts blank with ready rows to fill in
    partner: { nameEn: "", nameBg: "", locationEn: "", locationBg: "", servicesEn: [], servicesBg: [] },
    parameters: [0, 1, 2].map(() => ({
      standardEn: "", standardBg: "", characteristicEn: "", characteristicBg: "",
      rangeEn: "", rangeBg: "", specimensEn: "", specimensBg: "",
    })),
    schedule: [
      { date: "", labelEn: "Start of the scheme", labelBg: "Старт на схемата" },
      { date: "", labelEn: "Deadline for applications", labelBg: "Краен срок за заявления" },
      { date: "", labelEn: "Dispatch of PT items", labelBg: "Изпращане на обектите" },
      { date: "", labelEn: "Deadline for testing & results", labelBg: "Краен срок за изпитване и резултати" },
      { date: "", labelEn: "Final Report & Certificate", labelBg: "Окончателен доклад и сертификат" },
    ],
    prices: [0, 1, 2].map(() => ({ characteristicEn: "", characteristicBg: "", first: "", additional: "" })),

    calibration:
      opts.type === "C"
        ? {
            quantityEn: "", quantityBg: "", unit: "",
            deviceEn: "", deviceBg: "",
            points: ["", "", "", "", ""],
            directionsEn: [], directionsBg: [],
            referenceLabEn: "", referenceLabBg: "", referenceLabLocEn: "", referenceLabLocBg: "",
            methodEn: "ISO 376 — direct comparison method", methodBg: "ISO 376 — метод на пряко сравнение",
            feeEn: "Flat fee per scheme, independent of the number of calibration points; 50% for each additional laboratory code. Prices net; +20% VAT for Bulgarian participants.",
            feeBg: "Единна такса за схема, независимо от броя точки на калибриране; 50% за всеки допълнителен лабораторен код. Цените са нето; за български участници +20% ДДС.",
            stabilityFormula: "u_stab = |X_ref1 − X_ref2| / √3",
            enCriterionEn: "Eₙ = (X_lab − X_ref) / √(U_lab² + U_ref²); satisfactory (A) when |Eₙ| ≤ 1.00, otherwise unsatisfactory (N).",
            enCriterionBg: "Eₙ = (X_lab − X_ref) / √(U_lab² + U_ref²); удовлетворително (A) при |Eₙ| ≤ 1,00, в противен случай неудовлетворително (N).",
          }
        : undefined,
  };
}
