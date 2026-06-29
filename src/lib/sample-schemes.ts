import type { Scheme } from "./types";
import { pavingBlocks } from "./seed-paving-blocks";
import { forceCalibration } from "./seed-force";

// Ready-made "starter" schemes the user can instantiate from the New-scheme dialog
// ("Start from a sample"). Each carries the FULL data model, so all 14 documents
// render fully — same shape/page-count as the two real seeds, different subjects.
// The generic clauses are reused from the seeds; only the subject-specific clauses
// (criteria / production / errors / reporting) are overridden. id/number/folderId
// are placeholders — createProjectAction assigns the real ones on create.

// ── Testing sample A — Coarse aggregate (shaped like Concrete Paving Blocks) ──
const aggregates: Scheme = {
  id: "sample-aggregates", number: "PTS 00/00-T-0", type: "T", status: "open",
  titleEn: "Testing of Coarse Aggregate 4/8 mm",
  titleBg: "Изпитване на едър добавъчен материал 4/8 mm",
  objectEn: "Crushed limestone coarse aggregate 4/8 mm",
  objectBg: "Трошен варовиков едър добавъчен материал 4/8 mm",
  distribution: "simultaneous",
  formNumber: "F 7.2.1-1", revision: "Revision 1", revisionDate: "06.01.2025",
  standard: "ISO/IEC 17043:2023", regNo: "752/T-008", minParticipants: 5,
  team: pavingBlocks.team,
  partner: {
    nameEn: "GROMA HOLD LTD — Construction Testing Laboratory",
    nameBg: "ГРОМА ХОЛД ЕООД — Строителна изпитвателна лаборатория",
    locationEn: "Belo Pole, Bulgaria", locationBg: "с. Бели поле",
    servicesEn: ["Sampling", "Reduction & splitting of samples", "Homogeneity testing", "Stability testing"],
    servicesBg: ["Вземане на проби", "Редуциране и разделяне на пробите", "Изпитвания за хомогенност", "Изпитвания за стабилност"],
  },
  parameters: [
    { standardEn: "EN 933-1", standardBg: "БДС EN 933-1", characteristicEn: "Particle size distribution — sieving method", characteristicBg: "Зърнометричен състав — метод чрез пресяване", rangeEn: "4/8 mm grading", rangeBg: "клас 4/8 mm", specimensEn: "2 kg", specimensBg: "2 kg" },
    { standardEn: "EN 1097-2", standardBg: "БДС EN 1097-2", characteristicEn: "Resistance to fragmentation (Los Angeles)", characteristicBg: "Устойчивост на раздробяване (Лос Анджелис)", rangeEn: "LA (15 to 40)", rangeBg: "LA (15 ÷ 40)", specimensEn: "10 kg", specimensBg: "10 kg" },
    { standardEn: "EN 1097-6", standardBg: "БДС EN 1097-6", characteristicEn: "Particle density & water absorption", characteristicBg: "Плътност на зърната и водопоглъщане", rangeEn: "(2.0 to 3.0) Mg/m³", rangeBg: "(2,0 ÷ 3,0) Mg/m³", specimensEn: "2 kg", specimensBg: "2 kg" },
  ],
  resultTables: [
    { nameEn: "Passing 8 mm sieve", nameBg: "Преминало през сито 8 mm", standardEn: "EN 933-1", standardBg: "БДС EN 933-1", specimens: 2, unit: "%" },
    { nameEn: "Passing 4 mm sieve", nameBg: "Преминало през сито 4 mm", standardEn: "EN 933-1", standardBg: "БДС EN 933-1", specimens: 2, unit: "%" },
    { nameEn: "Los Angeles coefficient", nameBg: "Коефициент Лос Анджелис", standardEn: "EN 1097-2", standardBg: "БДС EN 1097-2", specimens: 2, unit: "%" },
    { nameEn: "Particle density", nameBg: "Плътност на зърната", standardEn: "EN 1097-6", standardBg: "БДС EN 1097-6", specimens: 2, unit: "Mg/m³" },
    { nameEn: "Water absorption", nameBg: "Водопоглъщане", standardEn: "EN 1097-6", standardBg: "БДС EN 1097-6", specimens: 2, unit: "%" },
  ],
  schedule: pavingBlocks.schedule,
  prices: [
    { characteristicEn: "Particle size distribution", characteristicBg: "Зърнометричен състав", first: "120 €", additional: "60 €" },
    { characteristicEn: "Resistance to fragmentation (LA)", characteristicBg: "Устойчивост на раздробяване (LA)", first: "160 €", additional: "80 €" },
    { characteristicEn: "Particle density & water absorption", characteristicBg: "Плътност и водопоглъщане", first: "140 €", additional: "70 €" },
  ],
  assignedValueMethodEn: pavingBlocks.assignedValueMethodEn,
  assignedValueMethodBg: pavingBlocks.assignedValueMethodBg,
  scoresEn: pavingBlocks.scoresEn, scoresBg: pavingBlocks.scoresBg,
  clauses: {
    ...pavingBlocks.clauses,
    criteria: { en: "Testing laboratories — accredited, in the process of accreditation, or not accredited — that test aggregates for construction may participate.", bg: "Могат да участват изпитвателни лаборатории — акредитирани, в процес на акредитация или неакредитирани — които изпитват добавъчни материали за строителството." },
    errors: { en: "Potential major sources of error include sample reduction/splitting, oven drying, sieve condition, the Los Angeles machine and charge, and operator technique.", bg: "Потенциални основни източници на грешки са редуцирането/разделянето на пробите, сушенето, състоянието на ситата, машината и сачмения товар по Лос Анджелис и техниката на оператора." },
    production: { en: "Each participant receives a homogenised sample of the aggregate (approx. 14 kg full scope), reduced from a single bulk lot by riffle splitting, plus a reserve portion.", bg: "Всеки участник получава хомогенизирана проба от добавъчния материал (около 14 kg при пълен обхват), редуцирана от единична партида чрез делител, плюс резервно количество." },
  },
};

// ── Testing sample B — Cement (shaped like Concrete Paving Blocks) ──
const cement: Scheme = {
  id: "sample-cement", number: "PTS 00/00-T-0", type: "T", status: "open",
  titleEn: "Testing of Cement CEM II/A-S 42,5 N",
  titleBg: "Изпитване на цимент CEM II/A-S 42,5 N",
  objectEn: "Cement CEM II/A-S 42,5 N",
  objectBg: "Цимент CEM II/A-S 42,5 N",
  distribution: "simultaneous",
  formNumber: "F 7.2.1-1", revision: "Revision 1", revisionDate: "06.01.2025",
  standard: "ISO/IEC 17043:2023", regNo: "752/T-008", minParticipants: 5,
  team: pavingBlocks.team,
  partner: {
    nameEn: "GROMA HOLD LTD — Construction Testing Laboratory",
    nameBg: "ГРОМА ХОЛД ЕООД — Строителна изпитвателна лаборатория",
    locationEn: "Belo Pole, Bulgaria", locationBg: "с. Бели поле",
    servicesEn: ["Sampling", "Packaging of samples", "Homogeneity testing", "Stability testing"],
    servicesBg: ["Вземане на проби", "Опаковане на пробите", "Изпитвания за хомогенност", "Изпитвания за стабилност"],
  },
  parameters: [
    { standardEn: "EN 196-1", standardBg: "БДС EN 196-1", characteristicEn: "Compressive strength (2 and 28 days)", characteristicBg: "Якост на натиск (2 и 28 дни)", rangeEn: "(10 to 60) MPa", rangeBg: "(10 ÷ 60) MPa", specimensEn: "mortar prisms 40×40×160 mm", specimensBg: "разтворни призми 40×40×160 mm" },
    { standardEn: "EN 196-3", standardBg: "БДС EN 196-3", characteristicEn: "Setting time (initial and final)", characteristicBg: "Срок на свързване (начало и край)", rangeEn: "(45 to 600) min", rangeBg: "(45 ÷ 600) min", specimensEn: "standard paste", specimensBg: "тесто с нормална гъстота" },
    { standardEn: "EN 196-3", standardBg: "БДС EN 196-3", characteristicEn: "Soundness (Le Chatelier)", characteristicBg: "Равномерност на изменение на обема (Льо Шателие)", rangeEn: "(0 to 10) mm", rangeBg: "(0 ÷ 10) mm", specimensEn: "standard paste", specimensBg: "тесто с нормална гъстота" },
  ],
  resultTables: [
    { nameEn: "Compressive strength — 2 days", nameBg: "Якост на натиск — 2 дни", standardEn: "EN 196-1", standardBg: "БДС EN 196-1", specimens: 6, unit: "MPa" },
    { nameEn: "Compressive strength — 28 days", nameBg: "Якост на натиск — 28 дни", standardEn: "EN 196-1", standardBg: "БДС EN 196-1", specimens: 6, unit: "MPa" },
    { nameEn: "Initial setting time", nameBg: "Начало на свързване", standardEn: "EN 196-3", standardBg: "БДС EN 196-3", specimens: 3, unit: "min" },
    { nameEn: "Final setting time", nameBg: "Край на свързване", standardEn: "EN 196-3", standardBg: "БДС EN 196-3", specimens: 3, unit: "min" },
    { nameEn: "Soundness", nameBg: "Равномерност на изменение на обема", standardEn: "EN 196-3", standardBg: "БДС EN 196-3", specimens: 3, unit: "mm" },
  ],
  schedule: pavingBlocks.schedule,
  prices: [
    { characteristicEn: "Compressive strength", characteristicBg: "Якост на натиск", first: "160 €", additional: "80 €" },
    { characteristicEn: "Setting time", characteristicBg: "Срок на свързване", first: "120 €", additional: "60 €" },
    { characteristicEn: "Soundness", characteristicBg: "Равномерност на изменение на обема", first: "110 €", additional: "55 €" },
  ],
  assignedValueMethodEn: pavingBlocks.assignedValueMethodEn,
  assignedValueMethodBg: pavingBlocks.assignedValueMethodBg,
  scoresEn: pavingBlocks.scoresEn, scoresBg: pavingBlocks.scoresBg,
  clauses: {
    ...pavingBlocks.clauses,
    criteria: { en: "Testing laboratories — accredited, in the process of accreditation, or not accredited — that test cement may participate.", bg: "Могат да участват изпитвателни лаборатории — акредитирани, в процес на акредитация или неакредитирани — които изпитват цимент." },
    errors: { en: "Potential major sources of error include sub-sampling, water/cement ratio, mixing and compaction, curing temperature and humidity, and the testing machine.", bg: "Потенциални основни източници на грешки са разделянето на пробата, водо-циментовото отношение, смесването и уплътняването, температурата и влажността при съхранение и изпитвателната машина." },
    production: { en: "Each participant receives a sealed sample of cement (approx. 6 kg) from a single homogenised lot, plus a reserve portion. The sample is protected from moisture during transport and storage.", bg: "Всеки участник получава запечатана проба цимент (около 6 kg) от единична хомогенизирана партида, плюс резервно количество. Пробата се предпазва от влага при транспорт и съхранение." },
  },
};

// ── Calibration sample A — Compression testing machine (shaped like Force) ──
const compressionMachine: Scheme = {
  id: "sample-compression", number: "PTS 00/00-C-0", type: "C", status: "open",
  titleEn: "Calibration of a Compression Testing Machine",
  titleBg: "Калибриране на машина за изпитване на натиск",
  objectEn: "Compression testing machine — load: compression",
  objectBg: "Машина за изпитване на натиск — вид натоварване: натиск",
  distribution: "sequential",
  formNumber: "F 7.2.1-1", revision: "Revision 1", revisionDate: "06.01.2025",
  standard: "ISO/IEC 17043:2023", regNo: "752/T-008", minParticipants: 1,
  team: forceCalibration.team,
  partner: { nameEn: "", nameBg: "", locationEn: "", locationBg: "", servicesEn: [], servicesBg: [] },
  parameters: [],
  calibration: {
    quantityEn: "Force", quantityBg: "Сила", unit: "kN",
    deviceEn: "Reference force transducer, class 00, HBM type C6A, No. 41207, range 3000 kN, resolution 1 kN",
    deviceBg: "Еталонен силомер клас 00, HBM тип C6A, ф.№ 41207, обхват 3000 kN, разделителна способност 1 kN",
    points: ["300", "600", "900", "1200", "1800", "2400", "3000"],
    directionsEn: ["Compression"], directionsBg: ["Натиск"],
    referenceLabEn: "Technický skúšobný ústav Piešťany, a.s.", referenceLabBg: "Technický skúšobný ústav Piešťany, a.s.",
    referenceLabLocEn: "Krajinská cesta 2929/9, 921 01 Piešťany, Slovakia", referenceLabLocBg: "Krajinská cesta 2929/9, 921 01 Piešťany, Словакия",
    methodEn: "ISO 7500-1 — calibration of the force-measuring system (compression)", methodBg: "ISO 7500-1 — калибриране на силоизмервателната система (натиск)",
    feeEn: "Flat fee per scheme, independent of the number of calibration points; 50% of the price for each additional laboratory code. Prices are net; +20% VAT for Bulgarian participants.",
    feeBg: "Единна такса за схема, независимо от броя точки на калибриране; 50% от цената за всеки допълнителен лабораторен код. Цените са нето; за български участници +20% ДДС.",
    stabilityFormula: "u_stab = |X_ref1 − X_ref2| / √3",
    enCriterionEn: "Eₙ = (X_lab − X_ref) / √(U_lab² + U_ref²); satisfactory (A) when |Eₙ| ≤ 1.00, otherwise unsatisfactory (N).",
    enCriterionBg: "Eₙ = (X_lab − X_ref) / √(U_lab² + U_ref²); удовлетворително (A) при |Eₙ| ≤ 1,00, в противен случай неудовлетворително (N).",
  },
  schedule: forceCalibration.schedule, prices: [],
  assignedValueMethodEn: forceCalibration.assignedValueMethodEn,
  assignedValueMethodBg: forceCalibration.assignedValueMethodBg,
  scoresEn: forceCalibration.scoresEn, scoresBg: forceCalibration.scoresBg,
  clauses: {
    ...forceCalibration.clauses,
    criteria: { en: "Calibration laboratories that calibrate compression testing machines (force-measuring systems) may participate.", bg: "Могат да участват калибровъчни лаборатории, които калибрират машини за изпитване на натиск (силоизмервателни системи)." },
    reporting: { en: "Results are reported by the deadline in clause 10 via the Results Sheet (F 7.2.1-7), as indicated force and relative error at each force step.", bg: "Резултатите се докладват до срока в т. 10 чрез Лист с резултати (Ф 7.2.1-7), като показана сила и относителна грешка във всяка стъпка на натоварване." },
  },
};

// ── Calibration sample B — Weights, class M1 (shaped like Force) ──
const weights: Scheme = {
  id: "sample-weights", number: "PTS 00/00-C-0", type: "C", status: "open",
  titleEn: "Calibration of Weights (class M1)",
  titleBg: "Калибриране на теглилки (клас M1)",
  objectEn: "Set of weights class M1, 1 g – 10 kg",
  objectBg: "Комплект теглилки клас M1, 1 g – 10 kg",
  distribution: "sequential",
  formNumber: "F 7.2.1-1", revision: "Revision 1", revisionDate: "06.01.2025",
  standard: "ISO/IEC 17043:2023", regNo: "752/T-008", minParticipants: 1,
  team: forceCalibration.team,
  partner: { nameEn: "", nameBg: "", locationEn: "", locationBg: "", servicesEn: [], servicesBg: [] },
  parameters: [],
  calibration: {
    quantityEn: "Mass", quantityBg: "Маса", unit: "g",
    deviceEn: "Set of weights class M1 (OIML R 111): 1 g, 10 g, 100 g, 1 kg, 10 kg, in a fitted case",
    deviceBg: "Комплект теглилки клас M1 (OIML R 111): 1 g, 10 g, 100 g, 1 kg, 10 kg, в кутия",
    points: ["1", "10", "100", "1000", "10000"],
    directionsEn: [], directionsBg: [],
    referenceLabEn: "Slovak Institute of Metrology (SMU)", referenceLabBg: "Словашки институт по метрология (SMU)",
    referenceLabLocEn: "Karloveská 63, 842 55 Bratislava, Slovakia", referenceLabLocBg: "Karloveská 63, 842 55 Братислава, Словакия",
    methodEn: "OIML R 111 / EURAMET cg-18 — comparison against reference mass standards", methodBg: "OIML R 111 / EURAMET cg-18 — сравнение спрямо еталонни теглилки",
    feeEn: "Flat fee per scheme, independent of the number of nominal values; 50% of the price for each additional laboratory code. Prices are net; +20% VAT for Bulgarian participants.",
    feeBg: "Единна такса за схема, независимо от броя номинални стойности; 50% от цената за всеки допълнителен лабораторен код. Цените са нето; за български участници +20% ДДС.",
    stabilityFormula: "u_stab = |m_ref1 − m_ref2| / √3",
    enCriterionEn: "Eₙ = (m_lab − m_ref) / √(U_lab² + U_ref²); satisfactory (A) when |Eₙ| ≤ 1.00, otherwise unsatisfactory (N).",
    enCriterionBg: "Eₙ = (m_lab − m_ref) / √(U_lab² + U_ref²); удовлетворително (A) при |Eₙ| ≤ 1,00, в противен случай неудовлетворително (N).",
  },
  schedule: forceCalibration.schedule, prices: [],
  assignedValueMethodEn: forceCalibration.assignedValueMethodEn,
  assignedValueMethodBg: forceCalibration.assignedValueMethodBg,
  scoresEn: forceCalibration.scoresEn, scoresBg: forceCalibration.scoresBg,
  clauses: {
    ...forceCalibration.clauses,
    criteria: { en: "Calibration laboratories that calibrate weights / mass standards may participate.", bg: "Могат да участват калибровъчни лаборатории, които калибрират теглилки / еталони за маса." },
    reporting: { en: "Results are reported by the deadline in clause 10 via the Results Sheet (F 7.2.1-7), as conventional mass and its expanded uncertainty for each nominal value.", bg: "Резултатите се докладват до срока в т. 10 чрез Лист с резултати (Ф 7.2.1-7), като конвенционална маса и нейната разширена неопределеност за всяка номинална стойност." },
  },
};

export const SAMPLE_SCHEMES: Record<string, Scheme> = {
  aggregates, cement, "compression-machine": compressionMachine, "weights-m1": weights,
};

export interface SampleInfo { key: string; type: "T" | "C"; labelEn: string; labelBg: string }
export const SAMPLE_LIST: SampleInfo[] = [
  { key: "aggregates", type: "T", labelEn: "Coarse aggregate 4/8 mm", labelBg: "Едър добавъчен материал 4/8 mm" },
  { key: "cement", type: "T", labelEn: "Cement CEM II/A-S 42,5 N", labelBg: "Цимент CEM II/A-S 42,5 N" },
  { key: "compression-machine", type: "C", labelEn: "Compression testing machine", labelBg: "Машина за изпитване на натиск" },
  { key: "weights-m1", type: "C", labelEn: "Weights, class M1", labelBg: "Теглилки, клас M1" },
];

export function samplesForType(type: "T" | "C"): SampleInfo[] {
  return SAMPLE_LIST.filter((s) => s.type === type);
}
