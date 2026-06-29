import type { Scheme, Lang } from "../types";
import { pick, wrapDoc, docHeader, sec, footer } from "../doc-shell";

const FORM = "F 7.3.5-1";

// Calibration variant of the participant Instruction. One device travels
// lab → lab (sequential); each lab forwards it to the next within ≤ 3 working
// days. Mirrors poc/calibration-instruction-preview.html (11 sections), with
// scheme number/title, device and method pulled from the scheme.
export function renderInstructionC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => pick(lang, en, bg);
  const li = (en: string, bg: string) => `<li>${L(en, bg)}</li>`;

  // Dynamic bits from the scheme (single source of truth).
  const number = s.number;
  const name = L(s.titleEn, s.titleBg);

  // `calibration` is optional in the type — guard so absent fields render blank.
  const c = s.calibration;
  const device = c ? L(c.deviceEn, c.deviceBg) : "";
  const method = c ? L(c.methodEn, c.methodBg) : "";
  const unit = c ? c.unit : "";
  const points = c ? c.points.join(", ") : "";

  // Results deadline: the "results" item in the schedule.
  const resultsItem =
    s.schedule.find((it) => /result/i.test(it.labelEn) || /резултат/i.test(it.labelBg)) ??
    s.schedule[s.schedule.length - 1];
  const deadline = resultsItem ? resultsItem.date : "";

  // 1 — Number and name
  const s1 = `<div class="kv"><b>${L("Number:", "Номер:")}</b> ${number} &nbsp; <b>${L(
    "Name:",
    "Наименование:"
  )}</b> ${name}</div>`;

  // 2 — Sending / forwarding the device to the NEXT participant
  const s2 = `<ul>
    ${li(
      "The PT item is sent to the first participant within the timeframes in the Plan (F 7.2.1-1) and Invitation (F 7.2.1-2). Each participant is notified by e-mail/courier — ensure someone is present to receive it.",
      "Обектът на изпитване за пригодност се изпраща на първия участник в сроковете по Плана (F 7.2.1-1) и Поканата (F 7.2.1-2). Всеки участник се уведомява по имейл/куриер — осигурете лице за получаване на обекта."
    )}
    ${li(
      "Each participant has a maximum of 3 working days to complete the measurements, then forwards the item to the next participant (address provided by e-mail), in suitable packaging via a reliable, fast courier.",
      "Всеки участник разполага с максимум 3 работни дни за измерванията, след което препраща обекта към следващия участник (адресът се изпраща по имейл), в подходяща опаковка чрез надеждна и бърза куриерска фирма."
    )}
    ${li(
      "On receipt, immediately check the packaging and the physical condition of the item, and complete the Protocol for PT Item Receipt (F 7.3.4-1). In case of loss, delay or damage, notify PTS Bulgaria by e-mail at once.",
      "При получаване проверете незабавно опаковката и физическото състояние на обекта и попълнете Протокола за получаване на обект (F 7.3.4-1). При загуба, забавяне или повреда уведомете незабавно PTS Bulgaria по имейл."
    )}
  </ul>`;

  // 3 — Handling
  const s3 = `<ul>
    ${li(
      "Handle per the laboratory's procedures, the same way as any other calibration object of this type, ensuring identification, traceability and prevention of mechanical damage.",
      "Манипулирайте обекта на изпитване за пригодност съгласно процедурите на лабораторията, по същия начин както с всеки друг обект за калибриране от този тип, осигурявайки идентификация, проследимост и предотвратяване на механични повреди."
    )}
  </ul>`;

  // 4 — Conditioning (acclimatise ≥ 3 h + warm-up ≥ 30 min)
  const s4 = `<ul>
    ${li(
      "Let the item acclimatize to room temperature for at least 3 hours; switch it on at least 30 minutes before measurements.",
      "Оставете обекта да се аклиматизира към стайна температура поне 3 часа; включете го поне 30 минути преди измерванията."
    )}
  </ul>`;

  // 5 — Environmental conditions
  const s5 = `<ul>
    ${li(
      "Monitor, control and record ambient conditions with your own calibrated instruments. Recommended limits: air temperature (15–25) °C; relative humidity (35–65) %RH.",
      "Наблюдавайте, контролирайте и записвайте условията със собствени калибрирани уреди. Препоръчителни граници: температура (15–25) °C; относителна влажност (35–65) %RH."
    )}
  </ul>`;

  // 6 — Measurement method (ISO 376, direct comparison; report mV/V + kN)
  const s6 = `<ul>
    ${li(
      `Each laboratory uses its own standards and performs the measurements, processing and uncertainty analysis according to its own calibration procedure${
        method ? ` — ${method}` : " — direct comparison method, based on the latest edition of ISO 376"
      }.`,
      `Всяка лаборатория използва собствени еталони и извършва измерванията, обработката и анализа на неопределеността по своя методика${
        method ? ` — ${method}` : " — метод на пряко сравнение, по последното издание на ISO 376"
      }.`
    )}
    ${li(
      `Record the measured values for each calibration point in mV/V and ${unit || "kN"}.`,
      `Записвайте измерените стойности за всяка точка на калибриране в mV/V и ${unit || "kN"}.`
    )}
  </ul>`;

  // 7 — Factors affecting the measurements
  const s7 = `<ul>
    ${
      device
        ? li(
            `PT item: ${device}.`,
            `Обект на изпитване за пригодност: ${device}.`
          )
        : ""
    }
    ${li(
      "Load type — tension and compression, per the lab's capability. The display is preset for the cell range; do NOT change the cell settings — use only the '0' button to reset readings before each series.",
      "Вид натоварване — опън и натиск, според възможностите на лабораторията. Дисплеят е настроен за обхвата на клетката; НЕ променяйте настройките на клетката — използвайте само бутона „0“ за нулиране преди всяка серия."
    )}
    ${li(
      "For tension, one bearing is supplied (a second may be used if available); for compression, the upper support from the kit is used. Calibration is by direct comparison against the standard.",
      "За опън е приложен един лагер (може и втори, ако има); за натиск се поставя горната опора от комплекта. Калибрирането е чрез пряко сравнение с еталона."
    )}
    ${li(
      "Read the unloaded readings between series after a few seconds (they settle slowly) — they affect only the measurement uncertainty.",
      "Отчитайте показанията при разтоварване между сериите след няколко секунди (стабилизират се бавно) — те влияят само на неопределеността."
    )}
  </ul>`;

  // 8 — Safety
  const s8 = `<ul>
    ${li(
      "Follow all standard precautions. Ensure the force transducer is properly secured in the compression machine.",
      "Спазвайте всички стандартни предпазни мерки. Уверете се, че силопреобразувателят е добре закрепен в пресата."
    )}
  </ul>`;

  // 9 — Reporting & uncertainty (k=2, P≈95%)
  const s9 = `<ul>
    ${li(
      `Report on the Results Sheet (F 7.2.1-7) the measured values for each tension/compression point in mV/V and ${
        unit || "kN"
      }; results are auto-calculated in ${unit || "kN"}.`,
      `Докладвайте в Листа с резултати (F 7.2.1-7) стойностите за всяка точка опън/натиск в mV/V и ${
        unit || "kN"
      }; резултатите се изчисляват автоматично в ${unit || "kN"}.`
    )}
    ${li(
      "Present the expanded uncertainty to two significant figures (k = 2, P ≈ 95%).",
      "Представяйте разширената неопределеност с две значещи цифри (k = 2, P ≈ 95%)."
    )}
  </ul>`;

  // 10 — Deadline for results (from the schedule)
  const s10 = `<ul>
    ${li(
      `All results by e-mail no later than ${deadline}, using the Results Sheet (F 7.2.1-7). Late results may not be included in the final report.`,
      `Всички резултати по имейл не по-късно от ${deadline}, чрез Листа с резултати (F 7.2.1-7). Закъснелите резултати може да не бъдат включени в окончателния доклад.`
    )}
    ${li(
      "Also send by e-mail: the Protocol for PT Item Receipt (F 7.3.4-1) and the Confidentiality Declaration (F 4.2-2). A Feedback Sheet (F 8.6-2) link follows within 7 working days after the final report.",
      "По имейл изпратете също: Протокола за получаване на обект (F 7.3.4-1) и Декларацията за конфиденциалност (F 4.2-2). Връзка към Лист за обратна връзка (F 8.6-2) се изпраща до 7 работни дни след окончателния доклад."
    )}
  </ul>`;

  // 11 — Contacts
  const s11 = `<div class="contacts">
    <div class="person"><div class="nm">eng. Valentin Belovski</div><div class="ro">${L(
      "PT Scheme Manager",
      "Ръководител на схемата"
    )}</div></div>
    <div class="person"><div class="nm">eng. Nadya Vladimirova</div><div class="ro">${L(
      "Technical Expert in Calibration",
      "Технически експерт по калибриране"
    )}</div></div>
    <div class="cline">📞 00359 897 50 39 80</div>
    <div class="cline">✉ office@ptsbg.eu</div>
  </div>`;

  // Note: 6 is intentionally near-empty when scheme data is present but points
  // are referenced in §9; keep `points` available for callers/templates.
  void points;

  const body = [
    docHeader(s, lang, "INSTRUCTION FOR THE PARTICIPANTS", "ИНСТРУКЦИЯ ЗА УЧАСТНИЦИТЕ"),
    sec(1, "Number and name of the PT scheme", "Номер и наименование на схемата", lang, s1),
    sec(
      2,
      "Sending the PT item",
      "Информация относно изпращането на обекта на изпитване за пригодност",
      lang,
      s2
    ),
    sec(3, "Handling the PT item", "Манипулиране с обекта на изпитване за пригодност", lang, s3),
    sec(4, "Conditioning", "Кондициониране", lang, s4),
    sec(5, "Environmental conditions", "Условия на околната среда", lang, s5),
    sec(6, "Measurement method", "Метод за измерване", lang, s6),
    sec(7, "Factors affecting the measurements", "Фактори, влияещи върху измерванията", lang, s7),
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

  return wrapDoc(lang, `${s.number} — Instruction (Calibration)`, body);
}
