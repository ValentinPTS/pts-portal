import type { Scheme } from "./types";

// Faithful seed of the real Testing scheme PTS 26/01-T-1 (Concrete Paving Blocks).
// Bulgarian text is stored verbatim (per the decision to store both languages
// exactly, never auto-translate). Clause bodies are editable in the app.
export const pavingBlocks: Scheme = {
  id: "26-01-T-1",
  number: "PTS 26/01-T-1",
  type: "T",
  status: "open",
  titleEn: "Testing of Concrete Paving Blocks 200 × 100 × 60 mm",
  titleBg: "Изпитване на бетонни блокчета за настилки 200 × 100 × 60 mm",
  objectEn: "Concrete paving blocks 200 × 100 × 60 mm",
  objectBg: "Бетонни блокчета за настилки 200 × 100 × 60 mm",
  coverImage: "/brand/cover-paving-blocks.png",
  distribution: "simultaneous",
  formNumber: "F 7.2.1-1",
  revision: "Revision 1",
  revisionDate: "06.01.2025",
  standard: "ISO/IEC 17043:2023",
  regNo: "752/T-008",
  minParticipants: 5,

  team: [
    { roleEn: "PT Scheme Manager", roleBg: "Ръководител на схемата за изпитване за пригодност", name: "eng. V. Belovski" },
    { roleEn: "Materials Engineer", roleBg: "Инженер материалознание", name: "I. Dobreva, PhD" },
    { roleEn: "Statistical Processing Expert", roleBg: "Експерт статистическа обработка", name: "eng. A. Atanasov" },
    { roleEn: "Data Collection & Coding Expert", roleBg: "Експерт събиране и кодиране на данни", name: "T. Kasabova" },
  ],

  partner: {
    nameEn: "GROMA HOLD LTD — Construction Testing Laboratory",
    nameBg: "ГРОМА ХОЛД ЕООД — Строителна изпитвателна лаборатория",
    logo: "/brand/partner-groma.png",
    locationEn: "Belo Pole, Bulgaria",
    locationBg: "с. Бели поле",
    servicesEn: ["Sampling", "Packaging of samples", "Homogeneity testing", "Stability testing"],
    servicesBg: ["Вземане на проби", "Опаковане на пробите", "Изпитвания за установяване на хомогенност", "Изпитвания за установяване на стабилност"],
  },

  parameters: [
    {
      standardEn: "EN 1338, Annex C, Clauses C.2 and C.3",
      standardBg: "БДС EN 1338, Приложение C, т. C.2 и т. C.3",
      characteristicEn: "Determination of the dimensions (Length; Width; Thickness)",
      characteristicBg: "Определяне на размерите (Дължина; Широчина; Дебелина)",
      rangeEn: "per manufacturer + EN 1338 Table 1",
      rangeBg: "по производител + БДС EN 1338, Таблица 1",
      specimensEn: "3 blocks",
      specimensBg: "3 блокчета",
    },
    {
      standardEn: "EN 1338, Annex E",
      standardBg: "БДС EN 1338, Приложение E",
      characteristicEn: "Water absorption",
      characteristicBg: "Абсорбция на вода",
      rangeEn: "(1.0 to 8.0) %",
      rangeBg: "(1,0 ÷ 8,0) %",
      specimensEn: "3 blocks",
      specimensBg: "3 блокчета",
    },
    {
      standardEn: "EN 1338, Annex F",
      standardBg: "БДС EN 1338, Приложение F",
      characteristicEn: "Tensile splitting strength",
      characteristicBg: "Якост на опън при разцепване",
      rangeEn: "(1.5 to 9.0) MPa",
      rangeBg: "(1,5 ÷ 9,0) MPa",
      specimensEn: "8 blocks",
      specimensBg: "8 блокчета",
    },
  ],

  schedule: [
    { date: "20.01.2026", labelEn: "Start of the scheme", labelBg: "Старт на схемата" },
    { date: "31.03.2026", labelEn: "Deadline for applications", labelBg: "Краен срок за заявления" },
    { date: "10.04.2026", labelEn: "Dispatch of PT items", labelBg: "Изпращане на обектите" },
    { date: "29.05.2026", labelEn: "Deadline for testing & results", labelBg: "Краен срок за изпитване и резултати" },
    { date: "26.06.2026", labelEn: "Final Report & Certificate", labelBg: "Окончателен доклад и сертификат" },
  ],

  prices: [
    { characteristicEn: "Determination of the dimensions", characteristicBg: "Определяне на размерите", first: "120 €", additional: "60 €" },
    { characteristicEn: "Water absorption", characteristicBg: "Абсорбция на вода", first: "120 €", additional: "60 €" },
    { characteristicEn: "Tensile splitting strength", characteristicBg: "Якост на опън при разцепване", first: "160 €", additional: "80 €" },
  ],

  assignedValueMethodEn: "Robust mean (Algorithm A, ISO 13528, Annex C.3.1)",
  assignedValueMethodBg: "Устойчива средна стойност (Алгоритъм A, ISO 13528, Приложение C.3.1)",
  scoresEn: "z-score and ζ-score (pass when |score| < 2). Outliers screened by Kolmogorov–Smirnov, 3σ, IQR and Grubbs.",
  scoresBg: "z-оценка и ζ-оценка (приема се при |оценка| < 2). Бегълци се откриват чрез Колмогоров–Смирнов, 3σ, IQR и Грабс.",

  clauses: {
    criteria: {
      en: "Testing laboratories — accredited, in the process of accreditation, or not accredited — that test concrete paving blocks may participate.",
      bg: "Могат да участват изпитвателни лаборатории — акредитирани, в процес на акредитация или неакредитирани — които изпитват бетонни блокчета за настилки.",
    },
    expected: {
      en: "At least 5 participating laboratories are expected for the scheme to be conducted.",
      bg: "Очакват се най-малко 5 участващи лаборатории, за да се проведе схемата.",
    },
    errors: {
      en: "Potential major sources of error include sampling, sample preparation, equipment calibration, environmental conditions and operator technique.",
      bg: "Потенциални основни източници на грешки са вземането на проби, подготовката на пробите, калибрирането на оборудването, условията на околната среда и техниката на оператора.",
    },
    production: {
      en: "Each participant receives 12 blocks (full scope), 8 blocks (tensile splitting strength) or 4 blocks (dimensions and/or water absorption), depending on the selected characteristics, plus a reserve block. Production, quality control, storage and distribution follow documented procedures.",
      bg: "Всеки участник получава 12 блокчета (пълен обхват), 8 блокчета (якост на опън при разцепване) или 4 блокчета (размери и/или абсорбция на вода) според заявените характеристики, плюс резервно блокче. Производството, контролът на качеството, съхранението и разпространението следват документирани процедури.",
    },
    confidentiality: {
      en: "Each participant is assigned a unique random laboratory code. The identity of participants is known only to PTS Bulgaria staff. Participants sign a Confidentiality Declaration (F 4.2-2).",
      bg: "На всеки участник се присвоява уникален случаен лабораторен код. Самоличността на участниците е известна само на служителите на PTS Bulgaria. Участниците подписват Декларация за конфиденциалност (Ф 4.2-2).",
    },
    storage: {
      en: "Items are stored, handled, prepared, dispatched and disposed of in accordance with documented procedures. Participants confirm receipt with the Protocol for PT Item Receipt (F 7.3.4-1).",
      bg: "Обектите се съхраняват, манипулират, подготвят, изпращат и изхвърлят съгласно документирани процедури. Участниците потвърждават получаването с Протокол за получаване на обект (Ф 7.3.4-1).",
    },
    homogeneity: {
      en: "Homogeneity and stability of the PT items are assessed by the provider in accordance with ISO 13528 before distribution.",
      bg: "Хомогенността и стабилността на обектите се оценяват от организатора съгласно ISO 13528 преди разпространението.",
    },
    reporting: {
      en: "Results are reported by the deadline in clause 10 via the Results Sheet (F 7.2.1-7).",
      bg: "Резултатите се докладват до срока в т. 10 чрез Лист с резултати (Ф 7.2.1-7).",
    },
    traceability: {
      en: "The assigned value and its uncertainty are determined from the participants' results; metrological traceability is ensured through the applied standard methods.",
      bg: "Приетата стойност и нейната неопределеност се определят от резултатите на участниците; метрологичната проследимост е осигурена чрез приложените стандартни методи.",
    },
    differentMethods: {
      en: "All participants apply the same standard method; treatment of results from different methods is not applicable.",
      bg: "Всички участници прилагат един и същ стандартен метод; обработването на резултати по различни методи е неприложимо.",
    },
    publicity: {
      en: "Participant identities and performance are confidential. Information on issued certificates is published in the Register section of www.ptsbg.eu.",
      bg: "Самоличността и представянето на участниците са конфиденциални. Информация за издадените сертификати се публикува в раздел „Регистър“ на www.ptsbg.eu.",
    },
    lostDamaged: {
      en: "If an item is lost, delayed or damaged, the participant notifies the provider, who sends a replacement from the reserve.",
      bg: "При загубен, забавен или повреден обект участникът уведомява организатора, който изпраща замяна от резерва.",
    },
    feedback: {
      en: "After the Final Report, participants receive a Feedback Sheet (F 8.6-2) to assess satisfaction, needs and expectations.",
      bg: "След окончателния доклад участниците получават Формуляр за обратна връзка (Ф 8.6-2) за оценка на удовлетвореност, потребности и очаквания.",
    },
    applying: {
      en: "Participation is requested via the Application for Participation (F 7.2.1-3). A participation certificate is generated automatically and published in the Register.",
      bg: "Участието се заявява чрез Заявка за участие (Ф 7.2.1-3). Сертификат за участие се генерира автоматично и се публикува в Регистъра.",
    },
    financial: {
      en: "Financial conditions are specified in the Invitation (F 7.2.1-2). Prices are net; 20% VAT is added for Bulgarian participants.",
      bg: "Финансовите условия са посочени в Поканата (Ф 7.2.1-2). Цените са нето; за български участници се начислява 20% ДДС.",
    },
    contacts: {
      en: "PT Provider PTS Bulgaria · office@ptsbg.eu · www.ptsbg.eu · +359 897 50 39 80",
      bg: "РТ Провайдър PTS Bulgaria · office@ptsbg.eu · www.ptsbg.eu · +359 897 50 39 80",
    },
  },
};
