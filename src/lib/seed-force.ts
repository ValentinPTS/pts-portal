import type { Scheme } from "./types";

// Faithful seed of the real Calibration scheme PTS 25/06-C-1 (Force transducer).
// Demonstrates the calibration variant of the document engine.
export const forceCalibration: Scheme = {
  id: "25-06-C-1",
  number: "PTS 25/06-C-1",
  type: "C",
  status: "closed",
  titleEn: "Calibration of Force Transducer",
  titleBg: "Калибриране на силомер",
  objectEn: "Force gauge — load: tension and compression",
  objectBg: "Силомер — вид на натоварване: опън и натиск",
  coverImage: "/brand/cover-force-transducer.png", // the calibrated device shown on the title page
  distribution: "sequential",
  formNumber: "F 7.2.1-1",
  revision: "Revision 1",
  revisionDate: "06.01.2025",
  standard: "ISO/IEC 17043:2023",
  regNo: "752/T-008",
  minParticipants: 1,

  team: [
    { roleEn: "PT Scheme Manager", roleBg: "Ръководител на схемата за изпитване за пригодност", name: "eng. V. Belovski" },
    { roleEn: "Technical Expert", roleBg: "Технически експерт", name: "eng. N. Vladimirova" },
    { roleEn: "Statistical Processing Expert", roleBg: "Експерт статистическа обработка", name: "eng. A. Atanasov" },
    { roleEn: "Data Collection & Coding Expert", roleBg: "Експерт събиране и кодиране на данни", name: "T. Kasabova" },
  ],

  // partner slot unused for calibration (the reference lab is in `calibration`)
  partner: { nameEn: "", nameBg: "", locationEn: "", locationBg: "", servicesEn: [], servicesBg: [] },
  parameters: [],

  calibration: {
    quantityEn: "Force",
    quantityBg: "Сила",
    unit: "kN",
    deviceEn: "Force transducer, class 00, HBM, type Z4, No. 85235, range 200 kN (2.0000 mV/V), resolution 0.01 kN (0.0001 mV/V)",
    deviceBg: "Силомер клас 00, HBM, тип Z4, ф.№ 85235, обхват 200 kN (2.0000 mV/V), разделителна способност 0,01 kN (0.0001 mV/V)",
    points: ["20", "40", "60", "80", "100", "120", "140", "160", "180", "200"],
    directionsEn: ["Tension", "Compression"],
    directionsBg: ["Опън", "Натиск"],
    referenceLabEn: "Technický skúšobný ústav Piešťany, a.s.",
    referenceLabBg: "Technický skúšobný ústav Piešťany, a.s.",
    referenceLabLocEn: "Krajinská cesta 2929/9, 921 01 Piešťany, Slovakia",
    referenceLabLocBg: "Krajinská cesta 2929/9, 921 01 Piešťany, Словакия",
    methodEn: "ISO 376 — direct comparison method (tension and compression)",
    methodBg: "ISO 376 — метод на пряко сравнение (опън и натиск)",
    feeEn: "Flat fee per scheme, independent of the number of calibration points; 50% of the price for each additional laboratory code. Prices are net; +20% VAT for Bulgarian participants.",
    feeBg: "Единна такса за схема, независимо от броя точки на калибриране; 50% от цената за всеки допълнителен лабораторен код. Цените са нето; за български участници +20% ДДС.",
    stabilityFormula: "u_stab = |X_ref1 − X_ref2| / √3",
    enCriterionEn: "Eₙ = (X_lab − X_ref) / √(U_lab² + U_ref²); satisfactory (A) when |Eₙ| ≤ 1.00, otherwise unsatisfactory (N).",
    enCriterionBg: "Eₙ = (X_lab − X_ref) / √(U_lab² + U_ref²); удовлетворително (A) при |Eₙ| ≤ 1,00, в противен случай неудовлетворително (N).",
  },

  schedule: [
    { date: "09.06.2025", labelEn: "Start of the scheme", labelBg: "Старт на схемата" },
    { date: "04.07.2025", labelEn: "Deadline for applications", labelBg: "Краен срок за заявления" },
    { date: "07.07.2025", labelEn: "Dispatch to first participant", labelBg: "Изпращане до първия участник" },
    { date: "15.08.2025", labelEn: "Deadline for results", labelBg: "Краен срок за резултати" },
    { date: "31.08.2025", labelEn: "Final Report & Certificate", labelBg: "Окончателен доклад и сертификат" },
  ],
  prices: [],

  assignedValueMethodEn: "Reference (assigned) values are provided by the reference laboratory (mean of two calibrations of the device, before and after circulation).",
  assignedValueMethodBg: "Референтните (приети) стойности се предоставят от референтната лаборатория (средно от две калибрирания на устройството — преди и след обиколката).",
  scoresEn: "Eₙ score vs the reference laboratory; satisfactory when |Eₙ| ≤ 1.00. Tension and compression are scored separately.",
  scoresBg: "Оценка Eₙ спрямо референтната лаборатория; удовлетворително при |Eₙ| ≤ 1,00. Опън и натиск се оценяват поотделно.",

  clauses: {
    criteria: {
      en: "Calibration laboratories — accredited, in the process of accreditation, or not accredited — that calibrate force-measuring instruments may participate.",
      bg: "Могат да участват калибровъчни лаборатории — акредитирани, в процес на акредитация или неакредитирани — които калибрират силоизмервателни уреди.",
    },
    expected: {
      en: "Minimum 1, maximum 5 participants — the reference laboratory provides the assigned value, so the scheme can run with a single participant.",
      bg: "Минимум 1, максимум 5 участници — референтната лаборатория предоставя приетата стойност, така че схемата може да се проведе и с един участник.",
    },
    errors: {
      en: "Potential major sources of error include the laboratory's reference standard, environmental conditions, conditioning of the device, loading procedure and reading of the indicator.",
      bg: "Потенциални основни източници на грешки са еталонът на лабораторията, условията на околната среда, кондиционирането на устройството, процедурата на натоварване и отчитането на индикатора.",
    },
    production: {
      en: "A single device circulates sequentially from one participant to the next; each participant calibrates it and forwards it to the next, in the order recorded in the List of Registered Participants (F 7.2.1-4).",
      bg: "Едно устройство се разпространява последователно от един участник към следващия; всеки участник го калибрира и го препраща към следващия, по реда в Списъка на регистрираните участници (Ф 7.2.1-4).",
    },
    confidentiality: {
      en: "Each participant is assigned a unique random laboratory code. The identity of participants is known only to PTS Bulgaria staff. Participants sign a Confidentiality Declaration (F 4.2-2).",
      bg: "На всеки участник се присвоява уникален случаен лабораторен код. Самоличността на участниците е известна само на служителите на PTS Bulgaria. Участниците подписват Декларация за конфиденциалност (Ф 4.2-2).",
    },
    storage: {
      en: "The device is transported by the participants in suitable packaging using a reliable, fast courier (3–7 business days). Each participant confirms receipt with the Protocol for PT Item Receipt (F 7.3.4-1).",
      bg: "Устройството се транспортира от участниците в подходяща опаковка чрез надеждна и бърза куриерска фирма (3–7 работни дни). Всеки участник потвърждава получаването с Протокол за получаване на обект (Ф 7.3.4-1).",
    },
    homogeneity: {
      en: "Stability of the travelling device is assessed by the reference laboratory by calibrating it before and after circulation; u_stab = |X_ref1 − X_ref2| / √3 (rectangular distribution).",
      bg: "Стабилността на пътуващото устройство се оценява от референтната лаборатория чрез калибриране преди и след обиколката; u_stab = |X_ref1 − X_ref2| / √3 (правоъгълно разпределение).",
    },
    reporting: {
      en: "Results are reported by the deadline in clause 10 via the Results Sheet (F 7.2.1-7), in mV/V and kN.",
      bg: "Резултатите се докладват до срока в т. 10 чрез Лист с резултати (Ф 7.2.1-7), в mV/V и kN.",
    },
    traceability: {
      en: "The assigned value is traceable to national/international standards through the reference laboratory's calibration.",
      bg: "Приетата стойност е проследима до национални/международни еталони чрез калибрирането на референтната лаборатория.",
    },
    differentMethods: {
      en: "All participants apply the direct comparison method (ISO 376); treatment of results from different methods is not applicable.",
      bg: "Всички участници прилагат метода на пряко сравнение (ISO 376); обработването на резултати по различни методи е неприложимо.",
    },
    publicity: {
      en: "Participant identities and performance are confidential. Information on issued certificates is published in the Register section of www.ptsbg.eu.",
      bg: "Самоличността и представянето на участниците са конфиденциални. Информация за издадените сертификати се публикува в раздел „Регистър“ на www.ptsbg.eu.",
    },
    lostDamaged: {
      en: "If the device is lost, delayed or damaged, the participant notifies the provider immediately; the provider decides on repair, re-calibration by the reference lab, or termination.",
      bg: "При загубено, забавено или повредено устройство участникът незабавно уведомява организатора; организаторът решава за ремонт, повторно калибриране от референтната лаборатория или прекратяване.",
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
      en: "Financial conditions are specified in the Invitation (F 7.2.1-2). A flat fee applies regardless of the number of calibration points; 50% for each additional laboratory code. Prices are net; 20% VAT is added for Bulgarian participants.",
      bg: "Финансовите условия са посочени в Поканата (Ф 7.2.1-2). Прилага се единна такса независимо от броя точки на калибриране; 50% за всеки допълнителен лабораторен код. Цените са нето; за български участници се начислява 20% ДДС.",
    },
    contacts: {
      en: "PT Provider PTS Bulgaria · office@ptsbg.eu · www.ptsbg.eu · +359 897 50 39 80",
      bg: "РТ Провайдър PTS Bulgaria · office@ptsbg.eu · www.ptsbg.eu · +359 897 50 39 80",
    },
  },
};
