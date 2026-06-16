import type { Scheme, Lang } from "../types";
import { pick, wrapDoc, cover, sec, footer } from "../doc-shell";

const FORM = "F 7.3.5-1";

export function renderInstruction(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => pick(lang, en, bg);
  const li = (en: string, bg: string) => `<li>${L(en, bg)}</li>`;

  // Dynamic bits from the scheme (single source of truth).
  const number = s.number;
  const name = L(s.titleEn, s.titleBg);
  const standard = s.standard;
  // Results deadline: the "results" item in the schedule (Deadline for testing & results).
  const resultsItem =
    s.schedule.find((it) => /result/i.test(it.labelEn) || /резултат/i.test(it.labelBg)) ??
    s.schedule[s.schedule.length - 1];
  const deadline = resultsItem ? resultsItem.date : "";

  const s1 = `<div class="kv"><b>${L("Number:", "Номер:")}</b> ${number} &nbsp; <b>${L("Name:", "Наименование:")}</b> ${name}</div>
    <div class="lead">${L(
      `The PT scheme is conducted in accordance with the requirements of ${standard}.`,
      `Схемата се провежда в съответствие с изискванията на ${standard}.`
    )}</div>`;

  const s2 = `<ul>
    ${li(
      "Items are dispatched within the timeframes in the Plan (F 7.2.1-1) and Invitation (F 7.2.1-2), and no later than 7 working days after the stated deadline.",
      "Обектите се изпращат в сроковете по Плана (F 7.2.1-1) и Поканата (F 7.2.1-2), но не по-късно от 7 работни дни след посочения срок."
    )}
    ${li(
      "Each participant is notified by e-mail and/or courier. On receipt, immediately check the packaging and the physical condition of the item.",
      "Всеки участник се уведомява по имейл и/или чрез куриер. При получаване проверете незабавно опаковката и физическото състояние на обекта."
    )}
    ${li(
      "In case of loss, delay or damage, notify PTS Bulgaria by e-mail and complete the Protocol for PT Item Receipt (F 7.3.4-1). Replacements are provided from the reserve stock.",
      "При загуба, забавяне или повреда уведомете PTS Bulgaria по имейл и попълнете Протокол за получаване на обект на изпитване за пригодност (F 7.3.4-1). Резервни обекти се осигуряват от запаса."
    )}
  </ul>`;

  const s3 = `<ul>
    ${li(
      "Handle per the laboratory's internal procedures, ensuring identification, traceability and prevention of contamination and mechanical damage.",
      "Манипулирането с обекта на изпитване за пригодност се извършва съгласно вътрешните процедури на лабораторията, осигурявайки идентификация, проследимост и предотвратяване на замърсяване и механични повреди."
    )}
    ${li(
      "The blocks are pre-selected by the PT provider and must be used as supplied — no selection, substitution or exclusion of blocks by the participant.",
      "Блокчетата са предварително подбрани от организатора и се използват както са доставени — без подбор, замяна или изключване на блокчета от участника."
    )}
    ${li(
      "Store in the original packaging until testing. No mechanical treatment, cleaning or wetting unless explicitly required by the method.",
      "Съхранявайте в оригиналната опаковка до изпитване. Без механична обработка, почистване или навлажняване, освен ако методът изрично го изисква."
    )}
  </ul>`;

  const s4 = `<h3 class="sub">${L("4.1 Description of the item", "4.1 Описание на обекта на изпитване за пригодност")}</h3>
    <ul>
    ${li(
      "Concrete paving blocks, nominal 200×100×60 mm, tested per EN 1338:2003, for the characteristics in the Plan (F 7.2.1-1).",
      "Бетонни блокчета за настилки с номинален размер 200×100×60 mm, изпитвани по БДС EN 1338:2005, за характеристиките в Плана (F 7.2.1-1)."
    )}
    ${li(
      "Block set by scope: full scope — 8 blocks (tensile splitting) + 3 blocks (water absorption) + 1 spare; dimensions and/or water absorption only — 3 blocks + 1 spare.",
      "Комплект блокчета според обхвата: пълен обхват — 8 блокчета (якост на разцепване) + 3 блокчета (абсорбция на вода) + 1 резервно; само размери и/или абсорбция на вода — 3 блокчета + 1 резервно."
    )}
    ${li(
      "Blocks used for dimensions may subsequently be used for water absorption.",
      "Блокчетата, използвани за размери, могат след това да се използват и за абсорбция на вода."
    )}
    </ul>
    <h3 class="sub">${L("4.2 Preparation and conditioning", "4.2 Подготовка и кондициониране")}</h3>
    <ul>
    ${li(
      "Dimensions — per Annex C; remove dirt and loose particles without affecting geometry. Water absorption — per Annex E; condition to (20±5) °C, immerse to constant mass, then dry to constant mass at (105±5) °C. Tensile splitting — per Annex F; condition in water at (20±5) °C.",
      "Размери — по Прил. C; отстранете замърсявания и свободни частици, без да се засяга геометрията. Абсорбция на вода — по Прил. E; кондициониране до (20±5) °C, потапяне до постоянна маса, след това сушене до постоянна маса при (105±5) °C. Якост на разцепване — по Прил. F; кондициониране във вода при (20±5) °C."
    )}
    </ul>`;

  const s5 = `<ul>
    ${li(
      "Ensure and document storage and testing conditions per the lab's procedures and ISO/IEC 17025:2017. Store the blocks dry, protected from moisture, contamination and damage.",
      "Осигурете и документирайте условията на заобикалящата среда за съхранение и изпитване съгласно процедурите на лабораторията и БДС EN ISO/IEC 17025:2018. Съхранявайте бетонните блокчета сухи, защитени от влага, замърсяване и повреди."
    )}
    ${li(
      "Where the method requires controlled conditions (e.g. water temperature during conditioning), maintain and document them.",
      "Където методът изисква контролирани условия (напр. температура на водата при кондициониране), поддържайте и документирайте ги."
    )}
  </ul>`;

  const s6 = `<ul>
    ${li(
      "Test per the methods in the Plan (F 7.2.1-1) and the relevant annexes of EN 1338:2003. Where more blocks are provided than needed, select the required number at random — no selection by appearance. Exclusion of results is not permitted except for documented technical malfunction/error.",
      "Изпитвайте по методите от Плана (F 7.2.1-1) и съответните приложения на БДС EN 1338:2005. Когато са предоставени повече блокчета от необходимото, изберете нужния брой на случаен принцип — без подбор по външен вид. Изключване на резултати не се допуска, освен при документирана техническа неизправност/грешка."
    )}
    </ul>
    <h3 class="sub">${L(
      "6.1 Dimensions — length, width, thickness (Annex C, C.2 & C.3)",
      "6.1 Размери — дължина, широчина, дебелина (Прил. C, т. C.2 и C.3)"
    )}</h3>
    <ul>
    ${li(
      "On 3 blocks (random). Equipment accuracy ≤ 0.5 mm. Plan dimensions measured in two places; thickness from four points ≥ 20 mm from edges. Report 3 mean values per dimension, one final mean per dimension, and U (k=2). Results in mm, rounded to 1 mm.",
      "Върху 3 блокчета (на случаен принцип). Точност на уреда ≤ 0,5 mm. Размерите в план се измерват на две места; дебелината — от четири точки на ≥ 20 mm от ръбовете. Докладвайте 3 средни стойности на размер, една крайна средна на размер и U (k=2). Резултати в mm, закръглени до 1 mm."
    )}
    </ul>
    <h3 class="sub">${L("6.2 Water absorption (Annex E)", "6.2 Абсорбция на вода (Прил. E)")}</h3>
    <ul>
    ${li(
      "On the same 3 blocks. Immerse in potable water at (20±5) °C to constant mass M1 (min 3 days; ΔM < 0.1 % over 24 h), then dry at (105±5) °C to constant mass M2. Report 3 individual values, one final mean, and U (k=2). Results in %, rounded to 0.1 %.",
      "Върху същите 3 блокчета. Потапяне в питейна вода при (20±5) °C до постоянна маса M1 (мин. 3 дни; ΔM < 0,1 % за 24 h), след това сушене при (105±5) °C до постоянна маса M2. Докладвайте 3 единични стойности, една крайна средна и U (k=2). Резултати в %, закръглени до 0,1 %."
    )}
    </ul>
    <h3 class="sub">${L(
      "6.3 Tensile splitting strength (Annex F)",
      "6.3 Якост на опън при разцепване (Прил. F)"
    )}</h3>
    <ul>
    ${li(
      "On 8 whole blocks. Immerse in water at (20±5) °C for (24±3) h, wipe dry, test immediately. Apply load at (0.05±0.01) MPa/s until failure along the longest splitting section. Report 8 individual values, one final mean, and U (k=2). Results in MPa, rounded to 0.1 MPa.",
      "Върху 8 цели блокчета. Потапяне във вода при (20±5) °C за (24±3) h, подсушаване, изпитване веднага. Натоварване (0,05±0,01) MPa/s до разрушаване по най-дългото сечение на разцепване. Докладвайте 8 единични стойности, една крайна средна и U (k=2). Резултати в MPa, закръглени до 0,1 MPa."
    )}
    </ul>`;

  const s7 = `<ul>
    ${li(
      "Unsuitable storage (moisture, contamination, impact, temperature changes) and failure to follow preparation/conditioning can produce non-comparable results.",
      "Неподходящо съхранение (влага, замърсяване, удар, температурни промени) и неспазване на подготовката/кондиционирането водят до несравними резултати."
    )}
    ${li(
      "Measuring-equipment accuracy (dimensions), the soaking/drying conditions and constant mass (water absorption), and the conditioning and load rate (tensile splitting) all significantly affect results. Uncalibrated equipment causes systematic deviations.",
      "Точността на измервателното оборудване (размери), условията на накисване/сушене и постоянната маса (абсорбция на вода), както и кондиционирането и скоростта на натоварване (разцепване) влияят значително върху резултатите. Некалибрирано оборудване води до систематични отклонения."
    )}
  </ul>`;

  const s8 = `<ul>
    ${li(
      "Observe standard laboratory health & safety. Use safe manual-handling techniques (the blocks are heavy/hard). Handle water carefully and clean spills; avoid hot surfaces when drying at (105±5) °C.",
      "Спазвайте стандартните изисквания за здраве и безопасност. Прилагайте безопасни техники за ръчно пренасяне (блокчетата са тежки/твърди). Боравете внимателно с вода и почиствайте разливите; избягвайте горещи повърхности при сушене при (105±5) °C."
    )}
    ${li(
      "During splitting tests, keep clear of the failure zone (sudden splitting / fragments). Use PPE: lab clothing, safety glasses, gloves, protective footwear. Follow internal and national H&S rules.",
      "При изпитване на разцепване стойте далеч от зоната на разрушаване (внезапно разцепване / фрагменти). Използвайте ЛПС: работно облекло, предпазни очила, ръкавици, защитни обувки. Спазвайте вътрешните и националните правила за БЗР."
    )}
  </ul>`;

  const s9 = `<ul>
    ${li(
      "Report on the Results Sheet (F 7.2.1-7): for each characteristic, the individual results, the final mean value, and the expanded uncertainty U (k=2, P≈95%), expressed and rounded per Clause 6.",
      "Докладвайте в Листа с резултати (F 7.2.1-7): за всяка характеристика — единичните резултати, крайната средна стойност и разширената неопределеност U (k=2, P≈95%), изразени и закръглени съгласно т. 6."
    )}
    ${li(
      "If U is not reported for a result, no ζ-score is calculated for it. Send the completed Results Sheet by e-mail within the deadline.",
      "Ако U не е докладвана за даден резултат, за него не се изчислява ζ-оценка. Изпратете попълнения Лист с резултати по имейл в срока."
    )}
  </ul>`;

  const s10 = `<ul>
    ${li(
      `All results by e-mail no later than ${deadline}, using the Results Sheet (F 7.2.1-7). Late results are normally not included in the final report.`,
      `Всички резултати по имейл не по-късно от ${deadline}, чрез Листа с резултати (F 7.2.1-7). Закъснелите резултати обикновено не се включват в окончателния доклад.`
    )}
    ${li(
      "Also submit by e-mail: the Protocol for PT Item Receipt (F 7.3.4-1) immediately after receipt, and the Confidentiality Declaration (F 4.2-2) together with it. A Feedback Sheet (F 8.6-2) link is sent within 7 working days after the final report.",
      "По имейл изпратете също: Протокол за получаване на обект на изпитване за пригодност (F 7.3.4-1) веднага след получаване на обекта и Декларацията за конфиденциалност (F 4.2-2) заедно с него. Връзка към Лист за обратна връзка (F 8.6-2) се изпраща до 7 работни дни след окончателния доклад."
    )}
  </ul>`;

  const s11 = `<div class="contacts">
    <div class="person"><div class="nm">Eng. Valentin Belovski</div><div class="ro">${L(
      "PT Scheme Manager",
      "Ръководител на схемата"
    )}</div></div>
    <div class="cline">📞 0897 50 39 80</div>
    <div class="cline">✉ office@ptsbg.eu</div>
  </div>`;

  const body = [
    cover(s, lang, "INSTRUCTION FOR PARTICIPANTS", "ИНСТРУКЦИЯ ЗА УЧАСТНИЦИТЕ", { withImage: false }),
    sec(1, "Number and name of the PT scheme", "Номер и наименование на схемата", lang, s1),
    sec(2, "Dispatch of the proficiency testing items", "Информация относно изпращането на обекта", lang, s2),
    sec(3, "Handling of the proficiency testing item", "Манипулиране с обекта", lang, s3),
    sec(
      4,
      "Preparation or conditioning of the item",
      "Подготовка или кондициониране на обекта на изпитване за пригодност",
      lang,
      s4
    ),
    sec(5, "Environmental conditions", "Условия на заобикалящата среда", lang, s5),
    sec(6, "Test methods", "Методи за изпитване", lang, s6),
    sec(7, "Factors influencing the tests", "Фактори, влияещи върху изпитванията", lang, s7),
    sec(8, "Safety instructions", "Инструкции за безопасност", lang, s8),
    sec(
      9,
      "Reporting of results and measurement uncertainty",
      "Докладване на резултатите и неопределеността",
      lang,
      s9
    ),
    sec(10, "Deadline for submission of results", "Краен срок за подаване на резултатите", lang, s10),
    sec(11, "Contacts", "Контакти", lang, s11),
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Instruction`, body);
}
