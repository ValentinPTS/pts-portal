import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";

const FORM = "F 7.2.2-1";

// Statistical project (СТАТИСТИЧЕСКИ ПРОЕКТ) — the provider's INTERNAL technical
// document that defines the statistical model used to evaluate results. It is
// NOT given to participants. Faithful to Documents\Testing|Calibration\4 -
// Статистически проект - BG.pdf (Ф 7.2.2-1). BG primary; EN provided for the
// app's bilingual toggle. Scheme-specific bits (number, object, characteristics,
// σpt,min floors, calibration points/directions) are filled from the scheme.
const EXTRA_CSS = `
  .internal{border:1px dashed var(--green-dark);background:var(--green-soft);border-radius:6px;padding:9px 12px;margin:8px 0 4px;color:var(--green-dark);font-family:var(--sans);font-size:10pt;}
  .formula{background:var(--green-soft);border-left:3px solid var(--green);padding:7px 12px;font-family:var(--sans);margin:7px 0;}
  ul.tight{margin:4px 0;padding-left:20px;} ul.tight li{margin:3px 0;}
`;

function intro(lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  return `<div class="internal">${L(
    "This statistical project is an INTERNAL technical document of the PT provider. It is used to plan, apply and justify the statistical model for evaluating the results and is NOT provided to the scheme's participants. The information participants need is in the Plan and the Instruction for Participants.",
    "Настоящият статистически проект представлява ВЪТРЕШЕН технически документ на РТ провайдъра. Документът се използва за планиране, прилагане и обосновка на статистическия модел за оценяване на резултатите и не се предоставя на участниците в схемата. Информацията, необходима за участниците, се съдържа в Плана на схемата и в Инструкцията за участниците."
  )}</div>`;
}

function nondiscrim(lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  return `<h3 class="sub">${L("Principle of non-discriminatory evaluation", "Принцип на недискриминиращо оценяване")}</h3>
    <p>${L(
      "All participants are evaluated under identical statistical criteria, assigned values and standard deviations for evaluation, defined in advance in this statistical project. The statistical models and protective rules apply equally to all participants and do not advantage or disadvantage any individual participant.",
      "Всички участници се оценяват при еднакви статистически критерии, приписани стойности и стандартни отклонения за оценяване, предварително дефинирани в настоящия статистически проект. Използваните статистически модели и защитни правила се прилагат еднакво към всички участници и не водят до предимство или неблагоприятно третиране на отделни участници."
    )}</p>`;
}

function signature(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const mgr = s.team[0];
  return `<div class="sig">
    <div class="col">${esc(s.orderDate ?? s.revisionDate)}<br>${L("Date", "Дата")}</div>
    <div class="col">${mgr ? esc(mgr.name) : "&nbsp;"}<br>${L("PT Scheme Manager", "Ръководител на схемата за изпитване за пригодност")}</div>
  </div>`;
}

// ───────────────────────── TESTING ─────────────────────────
export function renderStatProject(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const chars = s.parameters
    .map((p) => `<li>${L(p.characteristicEn, p.characteristicBg)} (${L(p.standardEn, p.standardBg)})</li>`)
    .join("");
  const floors = s.parameters
    .filter((p) => p.sigmaMin != null)
    .map((p) => `<li>${L(p.characteristicEn, p.characteristicBg)}: σ<sub>pt,min</sub> = ${esc(String(p.sigmaMin))}</li>`)
    .join("");

  const s1 = `<p>${L(
    `The aim of this scheme is the statistical evaluation of participants' competence in testing the characteristics defined in the Plan, by applying objective, pre-defined statistical criteria in accordance with ${s.standard} and ISO 13528:2022. The evaluation determines the degree of agreement of participants' results with the assigned value, expresses performance through quantitative indicators (z-score and/or ζ-score) based on a target standard deviation for evaluation (σpt), and ensures comparability and objectivity regardless of the number of participants.`,
    `Целта на настоящата схема за изпитване за пригодност е статистическото оценяване на компетентността на участниците при изпитване на характеристиките, определени в Плана на схемата, чрез прилагане на обективни и предварително дефинирани статистически критерии в съответствие с ${s.standard} и ISO 13528:2022. Оценяването определя степента на съгласуваност на резултатите спрямо приписаната стойност, изразява представянето чрез количествени показатели (z- и/или ζ-оценка) на базата на целево стандартно отклонение за оценяване (σpt) и осигурява съпоставимост и обективност независимо от броя на участниците.`
  )}</p>${nondiscrim(lang)}`;

  const s2 = `<p>${L(
    "The assigned value for each characteristic is, as the main approach and when enough valid results are available, the consensus value of participants' results obtained by robust statistical procedures (ISO 13528), after screening/treatment of outliers. Its standard uncertainty must be small relative to σpt so its contribution is statistically negligible or accounted for via the ζ-score. The assigned value and its uncertainty may be presented with higher numerical precision than the individual results, to increase the resolution of the performance scores.",
    "Приписаната стойност за всяка характеристика се определя, като основен подход и при наличие на достатъчен брой валидни резултати, като консенсусна стойност от резултатите на участниците чрез устойчиви статистически процедури (ISO 13528), след проверки/обработване на отклоняващи се резултати. Стандартната ѝ неопределеност трябва да е малка спрямо σpt, така че приносът ѝ да е статистически незначим или да се отчете чрез ζ-оценка. Приписаната стойност и нейната неопределеност могат да се представят с по-висока числова точност от индивидуалните резултати, за повишаване на разделителната способност на показателите."
  )}</p>`;

  const s3 = `<p>${L(
    `The scheme is conducted with a minimum of ${s.minParticipants} participants that have applied for the relevant characteristic. With enough results, xpt and the related parameters are estimated as consensus values via the robust procedures of ISO 13528:2022 (Annex C.3.1), after outlier screening. When the number/structure of data does not allow a reliable robust estimate, xpt and/or σpt are set in advance (reference value, expert measurements and/or method-precision data) so the evaluation stays traceable and non-discriminatory.`,
    `Схемата се реализира при минимум ${s.minParticipants} участника, заявили съответната характеристика. При достатъчен брой резултати xpt и свързаните параметри се оценяват като консенсусни стойности чрез устойчивите процедури на ISO 13528:2022 (Приложение C.3.1), след проверки за отклоняващи се стойности. Когато броят/структурата на данните не позволяват надеждна устойчива оценка, xpt и/или σpt се задават предварително (референтна стойност, експертни измервания и/или данни за прецизност на метода), така че оценяването да остане проследимо и недискриминиращо.`
  )}</p>`;

  const s4 = `<p>${L(
    "If, even with the minimum number of participants, the valid results after outlier screening are insufficient for a reliable consensus assigned value and/or robust SD, a pre-defined alternative approach applies: the assigned value is set in a pre-established way (reference value, expert measurements or another justified procedure), and σpt is not derived from participants' results but set in advance from method-precision information, prior schemes or other suitable sources. A mandatory lower bound of the expected robust SD (and an upper bound where applicable) is defined to prevent unrealistic under- or over-estimation of the dispersion.",
    "Ако дори при минималния брой участници валидните резултати след проверки за отклоняващи се стойности са недостатъчни за надеждна консенсусна приписана стойност и/или устойчиво стандартно отклонение, се прилага предварително дефиниран алтернативен подход: приписаната стойност се задава по предварително установен начин (референтна стойност, експертни измервания или друга обоснована процедура), а σpt не се извежда от резултатите на участниците, а се задава предварително от информация за прецизността на метода, предходни схеми или други подходящи източници. Задължително се дефинира долна граница на очакваното устойчиво стандартно отклонение (и горна при приложимост), за да се предотврати нереалистично подценяване или завишаване на разсейването."
  )}</p>`;

  const s5 = `<p>${L(
    "Requirements for numerical precision are an essential part of the design, since inappropriate rounding can artificially lower the variability and the robust SD. The required precision is aligned with the applied test methods and reflected in the Instruction for Participants. Single results and the mean are reported with the precision of the standard method; the expanded uncertainty U is reported with the same precision. No additional rounding of intermediate results is applied.",
    "Изискванията за числова точност са съществен елемент от дизайна, тъй като неподходящо закръгляване може да подцени вариабилността и устойчивото стандартно отклонение. Определените изисквания са съгласувани с прилаганите методи и са отразени в Инструкцията за участниците. Единичните резултати и средната стойност се докладват с точността на стандартния метод; разширената неопределеност U се докладва със същата точност. Не се прилага допълнително закръгляване на междинни резултати."
  )}</p>`;

  const s6 = `<p>${L(
    "For each characteristic, the prescribed number of determinations is performed (typically two; a third determination is made when |I − II| > 2·Sr, and the participant's result is taken as the mean of the two closest determinations). The participant reports the single values used for averaging, the mean, and the expanded uncertainty U (k = 2).",
    "За всяка характеристика се извършва предписаният брой определения (обикновено две; трето определяне се прави при |I − II| > 2·Sr, като резултатът на участника е средната стойност от двете най-близки определения). Участникът докладва единичните стойности, използвани при осредняването, средната стойност и разширената неопределеност U (k = 2)."
  )}</p>
    <p class="muted">${L(
      "Note: if a participant does not report U (k = 2, P ≈ 95%), the ζ-score is not calculated.",
      "Забележка: ако участникът не докладва U (k = 2, P ≈ 95%), ζ-оценката не се изчислява."
    )}</p>`;

  const s7 = `<h3 class="sub">${L("7.1 Assigned value xpt", "7.1 Приписана стойност xpt")}</h3>
    <p>${L(
      "The assigned value for each characteristic is the consensus value computed by a robust method per ISO 13528, Annex C, iterative Algorithm A. All valid participant results are treated equally; the robust mean x* is taken as the assigned value, i.e. xpt = x*.",
      "Приписаната стойност за всяка характеристика се определя като консенсусна стойност чрез устойчив (робастен) метод по ISO 13528, Приложение C, итеративен алгоритъм A. Всички валидни резултати се разглеждат равнопоставено; устойчивата средна стойност x* се приема като приписана стойност, т.е. xpt = x*."
    )}</p>
    <h3 class="sub">${L("7.2 Standard deviation for evaluation σpt", "7.2 Стандартно отклонение за оценяване σpt")}</h3>
    <p>${L(
      "By default σpt equals the robust standard deviation from the ISO 13528 processing: when s* > 0, σpt = s*.",
      "По подразбиране σpt се приема равно на устойчивото стандартно отклонение от обработката по ISO 13528: когато s* > 0, тогава σpt = s*."
    )}</p>
    <h3 class="sub">${L("7.3 Minimum lower bounds σpt,min", "7.3 Минимални долни граници σpt,min")}</h3>
    <p>${L(
      "To prevent unrealistically low values (incl. s* ≈ 0), per-characteristic lower bounds σpt,min apply as a protective rule: when s* > σpt,min → σpt = s*; when s* ≤ σpt,min → σpt = σpt,min. The bounds are aligned with the published precision of the method and the robust SD observed in the report.",
      "С цел предотвратяване на нереалистично ниски стойности (вкл. s* ≈ 0) се въвеждат минимални долни граници σpt,min, прилагани като защитно правило: когато s* > σpt,min → σpt = s*; когато s* ≤ σpt,min → σpt = σpt,min. Границите са съгласувани с публикуваната прецизност на метода и с устойчивото σpt от доклада."
    )}</p>
    ${floors ? `<ul class="tight">${floors}</ul>` : `<p class="muted">${L("σpt,min values are set per characteristic in the scheme data when applicable.", "Стойностите на σpt,min се задават по характеристика в данните на схемата, когато е приложимо.")}</p>`}
    <h3 class="sub">${L("7.4 Uncertainty of the assigned value and professional tolerance", "7.4 Неопределеност на приписаната стойност и професионален толеранс")}</h3>
    <p>${L(
      "The standard uncertainty of the assigned value u(xpt) is estimated per ISO 13528 and, where applicable, accounted for in the choice of score (e.g. ζ-score). The professional tolerance (maximum permissible error) is defined as δ = 2·σpt.",
      "Стандартната неопределеност на приписаната стойност u(xpt) се оценява съгласно ISO 13528 и, когато е приложимо, се отчита при избора на показателя (напр. ζ-оценка). Професионалният толеранс (максимално допустима грешка) е дефиниран като δ = 2·σpt."
    )}</p>`;

  const s8 = `<p>${L(
    "Different or non-equivalent test methods for the same characteristic are not allowed. A specific standardised method is defined in advance for each characteristic and must be applied by all participants. Results obtained by other methods are not included in the statistical processing or the evaluation. This ensures comparability and non-discriminatory evaluation.",
    "Не се допуска използването на различни или нееквивалентни изпитвателни методи за една и съща характеристика. За всяка характеристика е предварително определен конкретен стандартизиран метод, който се прилага от всички участници. Резултати по други методи не се включват в статистическата обработка и оценяването. Това осигурява съпоставимост и недискриминиращо оценяване."
  )}</p>`;

  const s9 = `<p>${L(
    "The z-score is the main, universally applicable score; it does not include the participant's measurement uncertainty. A ζ-score may be applied additionally only when the participant has reported a measurement uncertainty U (k = 2). Participants who did not report an uncertainty are not evaluated by ζ-score. Because reported uncertainties may be under- or over-estimated, ζ-scores (when computed) are used for analytical/informative purposes only and do not change the main conclusion based on the z-score.",
    "z-оценката е основният, универсално приложим показател; тя не включва неопределеността на измерването на участника. ζ-оценка може да се приложи допълнително само при наличие на докладвана неопределеност U (k = 2). Участници, които не са докладвали неопределеност, не се оценяват чрез ζ-оценка. Тъй като докладваните неопределености могат да са подценени или надценени, ζ-оценките (когато са изчислени) се използват само за аналитични/информативни цели и не променят основното заключение, базирано на z-оценката."
  )}</p>`;

  const s10 = `<p>${L(
    "A clear distinction is made between blunders (invalid results from obvious technical/administrative errors — wrong units, misplaced decimal point, impossible values) and outliers (statistically extreme but possibly valid measurements). The main protection against outliers is the use of robust methods per ISO 13528. Classical outlier tests (IQR, Grubbs, three-sigma) are used only as indicative tools and are not an automatic basis for exclusion; with robust methods, results are not excluded unless proven invalid (treated as a blunder). All actions are documented.",
    "Прави се ясно разграничение между груби грешки (невалидни резултати от очевидни технически/административни грешки — грешни единици, разместена десетична запетая, невъзможни стойности) и отклоняващи се резултати (статистически екстремни, но възможно валидни измервания). Основната защита срещу отклоняващи се резултати е използването на устойчиви методи по ISO 13528. Класическите тестове (IQR, Grubbs, „три сигма“) се използват само индикативно и не са автоматично основание за изключване; при устойчиви методи резултати не се изключват, освен при доказана невалидност (третирана като груба грешка). Всички действия се документират."
  )}</p>`;

  const s11 = `<p>${L(
    "Exclusion of results is an exceptional measure, applied only on clearly established and documented grounds (a proven blunder or non-compliance with the scheme's pre-defined requirements). Statistical extremity alone is not a ground for exclusion. Excluded results are not used to compute the assigned value, σpt, or the performance scores; they may be considered separately for analytical purposes only, without affecting the official evaluation. Every exclusion is documented (grounds, stage, impact) in the Final Report, preserving confidentiality.",
    "Изключването на резултати е изключителна мярка, прилагана само при ясно установени и документирани основания (доказана груба грешка или несъответствие с предварително дефинираните изисквания). Статистическата екстремност сама по себе си не е основание. Изключените резултати не се използват за изчисляване на приписаната стойност, σpt или показателите; могат да се разгледат отделно само аналитично, без влияние върху официалното оценяване. Всяко изключване се документира (основания, етап, влияние) в окончателния доклад, при запазване на конфиденциалността."
  )}</p>`;

  const s12 = `<p>${L(
    "This scheme is planned and conducted as a single round, per the Plan. The statistical model is applicable and adaptive both for a single round and for successive rounds. The periodicity of rounds is not fixed in advance; it depends on participant interest and number, technical complexity, the need to accumulate enough data, and item availability. When future rounds are organised, the statistical project may be reviewed and updated.",
    "Настоящата схема е планирана и проведена като еднократна, съгласно Плана. Статистическият модел е приложим и адаптивен както за единичен кръг, така и за последователни кръгове. Периодичността не е фиксирана предварително; зависи от интереса и броя на участниците, техническата сложност, необходимостта от натрупване на данни и наличието на обекти. При бъдещи кръгове статистическият проект може да бъде преразглеждан и актуализиран."
  )}</p>`;

  const body = [
    cover(s, lang, "STATISTICAL PROJECT", "СТАТИСТИЧЕСКИ ПРОЕКТ"),
    intro(lang),
    sec(1, "Objectives of the proficiency testing scheme", "Цели на схемата за изпитване за пригодност", lang, s1),
    sec(2, "Required precision and uncertainty of the assigned value", "Изисквана точност и неопределеност на приписаната стойност", lang, s2),
    sec(3, "Minimum number of participants for the statistical model", "Минимален брой участници за прилагане на статистическия модел", lang,
      `${s3}<ul class="tight">${chars}</ul>`),
    sec(4, "Approach with an insufficient number of participants", "Подход при недостатъчен брой участници", lang, s4),
    sec(5, "Significant figures and decimal places of reported results", "Значещи цифри и брой десетични знаци за докладваните резултати", lang, s5),
    sec(6, "Number of PT items and repeat determinations", "Брой обекти на РТ схемата и повторни изпитвания/определяния", lang, s6),
    sec(7, "Determining σpt and the assigned value(s)", "Процедури за определяне на σpt и приписаната(ите) стойност(и)", lang, s7),
    sec(8, "Results from different (non-equivalent) methods", "Третиране на резултати по различни (нееквивалентни) методи", lang, s8),
    sec(9, "Participant's measurement uncertainty and its use (ζ-score)", "Неопределеност на измерването на участника и нейното използване (ζ-оценка)", lang, s9),
    sec(10, "Identification and treatment of outliers", "Идентифициране и третиране на отклоняващи се резултати", lang, s10),
    sec(11, "Evaluation of excluded results (when applicable)", "Оценяване на изключени резултати (когато е приложимо)", lang, s11),
    sec(12, "PT rounds: objectives and periodicity", "РТ кръгове: цели и периодичност", lang, s12),
    signature(s, lang),
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Statistical Project`, body, EXTRA_CSS);
}

// ───────────────────────── CALIBRATION ─────────────────────────
export function renderStatProjectC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const c = s.calibration;
  const quantity = c ? pick(lang, c.quantityEn, c.quantityBg).toLowerCase() : pick(lang, "the measured quantity", "измерваната величина");
  const unit = c ? c.unit : "";
  const points = c && c.points.length ? c.points.join(", ") : "";
  const dirs = c ? (lang === "bg" ? c.directionsBg : c.directionsEn) : [];

  const s1 = `<p>${L(
    `The aim of this scheme is the statistical evaluation of participants' competence in the calibration of ${quantity}${dirs.length ? ` (${dirs.join(", ")})` : ""} at the points defined in the Plan, by objective, pre-defined statistical criteria in accordance with ${s.standard} and ISO 13528:2022. Results are assessed against the metrologically traceable reference value provided by the reference laboratory, which calibrates the item before and after the round. The main score for calibration results is the Eₙ number.`,
    `Целта на настоящата схема е статистическото оценяване на компетентността на участниците при калибриране на ${quantity}${dirs.length ? ` (${dirs.join(", ")})` : ""} в точките, посочени в Плана, чрез обективни и предварително дефинирани статистически критерии в съответствие с ${s.standard} и ISO 13528:2022. Резултатите се оценяват спрямо метрологично проследимата референтна стойност, предоставена от референтната лаборатория, която калибрира обекта преди и след рунда. Основният показател за калибрационни резултати е числото Eₙ.`
  )}</p>
    <div class="formula">X_REF = (X_REF1 + X_REF2) / 2 &nbsp;·&nbsp; u_STAB = |X_REF1 − X_REF2| / √3 &nbsp;·&nbsp; u(X_REF) = √((U_ref/2)² + u_STAB²) &nbsp;·&nbsp; U_REF = 2·u(X_REF)</div>
    ${nondiscrim(lang)}`;

  const s2 = `<p>${L(
    "The reference (assigned) value for each calibration point is the arithmetic mean of the two reference-laboratory calibrations (before and after the round). The item-stability component is evaluated from the absolute difference of the two calibrations as a rectangular distribution, u_STAB = |X_REF1 − X_REF2| / √3. The standard uncertainty u(X_REF) combines the reference laboratory's calibration uncertainty (U_ref/2, assuming k = 2; the higher of the two is used) with u_STAB, and the expanded uncertainty is U_REF = 2·u(X_REF). When u(X_REF) is significant relative to σpt (e.g. ≥ 0.3·σpt), it is accounted for via the Eₙ (or ζ) score.",
    "Референтната (приписаната) стойност за всяка точка е средноаритметична от двете калибрации на референтната лаборатория (преди и след рунда). Компонентът за нестабилност се оценява от абсолютната разлика на двете калибрации като правоъгълно разпределение, u_STAB = |X_REF1 − X_REF2| / √3. Стандартната неопределеност u(X_REF) комбинира неопределеността при калибриране на референтната лаборатория (U_ref/2, при k = 2; използва се по-високата стойност) с u_STAB, а разширената е U_REF = 2·u(X_REF). Когато u(X_REF) е значима спрямо σpt (напр. ≥ 0,3·σpt), тя се отчита чрез Eₙ (или ζ)."
  )}</p>`;

  const s3 = `<p>${L(
    `Per the Plan, the expected number of participants is minimum 1 – maximum 5 (for calibration a single participation is acceptable, since the reference laboratory provides the assigned value).`,
    `Според Плана очакваният брой участници е минимум 1 – максимум 5 (за калибриране е допустимо и едно участие, тъй като референтната лаборатория предоставя приписаната стойност).`
  )}</p>`;

  const s4 = `<p>${L(
    "If the number of valid results does not allow a reliable consensus assigned value/robust SD (e.g. N < 5 or a single participant), a pre-defined alternative applies: the assigned value is set independently of participants' results as X_REF = (X_REF1 + X_REF2)/2 with u_STAB included; σpt (if used) is set in advance from fitness-for-purpose, method-precision or historical/regulatory data, with a defined lower bound (and upper bound where applicable); the score uses indicators that account for the assigned value's uncertainty (Eₙ or ζ). With one or few participants, group outlier tests are not applied — instead a technical verification of methods, protocols and evidence is performed, and all choices are documented.",
    "Ако броят валидни резултати не позволява надеждна консенсусна приписана стойност/устойчиво стандартно отклонение (напр. N < 5 или един участник), се прилага предварително дефиниран алтернативен подход: приписаната стойност се задава независимо от резултатите на участниците като X_REF = (X_REF1 + X_REF2)/2 с включен u_STAB; σpt (ако се използва) се задава предварително от fitness-for-purpose, прецизност на метода или исторически/регулаторни данни, с дефинирана долна граница (и горна при приложимост); оценяването използва показатели, отчитащи неопределеността на приписаната стойност (Eₙ или ζ). При един или малък брой участници не се прилагат групови тестове за отклоняващи се стойности — вместо това се извършва техническа верификация на методиките, протоколите и доказателствата, като всички избори се документират."
  )}</p>`;

  const s5 = `<ul class="tight">
    <li>${L(`Results in ${unit} (means): two decimal places (e.g. 20.16 ${unit}); equivalent to a precision of 0.01 ${unit}.`, `Резултати в ${unit} (средни стойности): два десетични знака (напр. 20,16 ${unit}); съответства на точност 0,01 ${unit}.`)}</li>
    <li>${L("If submitted in mV/V: four decimal places (0.0001 mV/V); the provider converts/checks to the unit above.", "Ако се подава в mV/V: четири десетични знака (0,0001 mV/V); провайдърът преобразува/проверява към горната единица.")}</li>
    <li>${L("Expanded uncertainty U (k = 2): two significant figures, same units as the result.", "Разширена неопределеност U (k = 2): две значещи цифри, в същите единици като резултата.")}</li>
    <li>${L("D = X_lab − X_REF: two decimals (same format as the result). Eₙ, ζ or z′: two decimals.", "D = X_lab − X_REF: два десетични знака (същия формат като резултата). Eₙ, ζ или z′: два десетични знака.")}</li>
    <li>${L("No additional rounding of intermediate results; all intermediate calculations are done at full precision.", "Не се допуска допълнително закръгляване на междинни резултати; всички междинни изчисления са с пълна точност.")}</li>
  </ul>`;

  const s6 = `<p>${L(
    `The scheme uses one PT item — a single force transducer — delivered as a separately packaged set and circulated sequentially. The reference laboratory calibrates it before and after the round. For each calibration point${points ? ` (${points} ${unit})` : ""} and each direction${dirs.length ? ` (${dirs.join(", ")})` : " (tension and/or compression)"}, the participant performs repeat independent determinations; the recommended minimum is three (3) independent series per point and per direction. Before each series the participant zeroes the transducer and waits for the readings to settle; the item is conditioned to room temperature for at least 3 hours and powered on at least 30 minutes before measurements.`,
    `Схемата използва един обект — един силомер — доставен като отделно опакован комплект и разпространяван последователно. Референтната лаборатория го калибрира преди и след рунда. За всяка точка на калибриране${points ? ` (${points} ${unit})` : ""} и всяко направление${dirs.length ? ` (${dirs.join(", ")})` : " (опън и/или натиск)"} участникът извършва повторни независими определения; препоръчителният минимум е три (3) независими серии за всяка точка и направление. Преди всяка серия участникът нулира силомера и изчаква установяване на показанията; обектът се кондиционира към стайна температура поне 3 часа и се включва поне 30 минути преди измерванията.`
  )}</p>
    <p>${L(
      "For each point and direction the participant reports all single replicate results (in the unit and/or mV/V), the mean used for evaluation, the expanded uncertainty U (k = 2), and the standards used and measurement conditions. Directions (tension/compression) are treated separately.",
      "За всяка точка и направление участникът докладва всички единични резултати от репликатите (в единицата и/или mV/V), средната стойност за оценяване, разширената неопределеност U (k = 2), използваните еталони и условията на измерване. Направленията (опън/натиск) се третират отделно."
    )}</p>`;

  const s7 = `<ul class="tight">
    <li>${L("xpt (assigned value): with ≥5 valid results, the robust consensus value (Algorithm A, ISO 13528); with N < 5 or one participant, the reference value X_REF = (X_REF1 + X_REF2)/2.", "xpt (приписана стойност): при ≥5 валидни резултата — устойчива консенсусна стойност (алгоритъм A, ISO 13528); при N < 5 или един участник — референтната стойност X_REF = (X_REF1 + X_REF2)/2.")}</li>
    <li>${L("Preferred calibration score: Eₙ = (X_lab − X_REF) / √(U_lab² + U_REF²). If u(xpt) is significant (≈ ≥ 0.3·σpt) it is included in the normalising denominator (use Eₙ or ζ).", "Предпочитан критерий за калибриране: Eₙ = (X_lab − X_REF) / √(U_lab² + U_REF²). Ако u(xpt) е значима (≈ ≥ 0,3·σpt), тя се включва в нормализиращия знаменател (Eₙ или ζ).")}</li>
    <li>${L("All decisions on xpt, σpt, σ_min and the origin of pre-set values are documented in the Plan and the Final Report.", "Всички решения за xpt, σpt, σ_min и произхода на предварителните стойности се документират в Плана и в окончателния доклад.")}</li>
  </ul>`;

  const s8 = `<p>${L(
    "The measurement principle is direct comparison (calibration per ISO 376). Each laboratory uses its own standards and evaluates uncertainty per its own procedure, but the single measurement principle for the characteristic is mandatory. Results obtained by different or non-equivalent methods are not included in the processing or evaluation. Minor execution variants that do not change the measurement principle are allowed only if they do not affect equivalence and are declared in the Results Sheet.",
    "Принципът на измерване е пряко сравнение (калибриране по ISO 376). Всяка лаборатория използва собствени еталони и оценява неопределеността по своята методика, но единният измервателен принцип за характеристиката е задължителен. Резултати по различни или нееквивалентни методи не се включват в обработката и оценяването. Дребни варианти на изпълнение, които не променят принципа, са допустими само ако не засягат еквивалентността и са декларирани в „Лист с резултати“."
  )}</p>`;

  const s9 = `<p>${L(
    "Participants report, for each point, an expanded measurement uncertainty U_lab at k = 2 (≈95%); if a standard uncertainty u_lab is given, it is converted internally as U_lab = 2·u_lab. The main criterion is Eₙ = (X_lab − X_REF) / √(U_lab² + U_REF²), with |Eₙ| < 1 satisfactory (A) and |Eₙ| ≥ 1 unsatisfactory (N). Reported U_lab values are checked technically; obviously unrealistic values require justification or a detailed uncertainty budget. If a participant does not report U_lab, Eₙ cannot be computed and a technical check / justified alternative applies. All X_lab, U_lab, X_REF, U_REF and Eₙ values are documented per point.",
    "Участниците докладват за всяка точка разширена неопределеност U_lab при k = 2 (≈95%); ако е подадена стандартна неопределеност u_lab, тя се преобразува вътрешно като U_lab = 2·u_lab. Основният критерий е Eₙ = (X_lab − X_REF) / √(U_lab² + U_REF²), при |Eₙ| < 1 удовлетворително (A) и |Eₙ| ≥ 1 неудовлетворително (N). Докладваните U_lab се проверяват технически; очевидно нереалистични стойности изискват обосновка или подробен бюджет на неопределеността. Ако участник не подаде U_lab, Eₙ не може да се изчисли и се прилага техническа проверка/обоснован алтернативен начин. Всички стойности X_lab, U_lab, X_REF, U_REF и Eₙ се документират по точки."
  )}</p>`;

  const s10 = `<p>${L(
    "Periodic PT rounds maintain and verify calibration competence, confirm metrological traceability and CMC claims, monitor long-term stability (incl. with a travelling artefact and a reference-laboratory assigned value), and gather data to review σpt. The recommended periodicity is generally annual; every 2–3 years for lower risk (justified and documented); and event-driven extra rounds after significant changes. After an unsatisfactory result a follow-up round is organised within a reasonable period (e.g. 6–12 months). All periodicity decisions are documented in the Plan and the Final Report.",
    "Периодичните РТ кръгове поддържат и верифицират компетентността при калибриране, потвърждават метрологичната проследимост и декларираните възможности (CMC), наблюдават дългосрочната стабилност (вкл. при пътуващ артефакт и приписана стойност от референтна лаборатория) и събират данни за преглед на σpt. Препоръчителната периодичност е по правило ежегодна; на всеки 2–3 години при по-нисък риск (обосновано и документирано); и извънредни кръгове след значими промени. След неудовлетворително представяне се организира последваща схема в разумен срок (напр. 6–12 месеца). Всички решения за периодичност се документират в Плана и в окончателния доклад."
  )}</p>`;

  const body = [
    cover(s, lang, "STATISTICAL PROJECT", "СТАТИСТИЧЕСКИ ПРОЕКТ"),
    intro(lang),
    sec(1, "Objectives of the proficiency testing scheme", "Цели на схемата за изпитване за пригодност", lang, s1),
    sec(2, "Required precision and uncertainty of the reference value", "Изисквана точност и неопределеност на референтната стойност", lang, s2),
    sec(3, "Minimum number of participants for the statistical model", "Минимален брой участници за прилагане на статистическия модел", lang, s3),
    sec(4, "Approach with an insufficient number of participants", "Подход при недостатъчен брой участници", lang, s4),
    sec(5, "Significant figures and decimal places of reported results", "Значещи цифри и брой десетични знаци за докладваните резултати", lang, s5),
    sec(6, "Number of PT items and repeat determinations", "Брой обекти на РТ схемата и повторни определяния", lang, s6),
    sec(7, "Determining σpt and the assigned value(s)", "Процедури за определяне на σpt и приписаната(ите) стойност(и)", lang, s7),
    sec(8, "Results from different (non-equivalent) methods", "Третиране на резултати по различни (нееквивалентни) методи", lang, s8),
    sec(9, "Participant's measurement uncertainty and its use (Eₙ-score)", "Неопределеност на измерването на участника и нейното използване (Eₙ-оценка)", lang, s9),
    sec(10, "PT rounds: objectives and periodicity", "РТ кръгове: цели и периодичност", lang, s10),
    signature(s, lang),
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Statistical Project`, body, EXTRA_CSS);
}
