// M1 — the provider's texts for the calibration documents (31.10.2026), as data (plan part 3.10).
import { gateB, P7, P17_M1, P16_M1 } from "./gate-texts";

export type M1Kind = "constant" | "fields" | "specific";
export interface M1Point {
  no: number;
  titleBg: string;            // M1's heading, verbatim (complete it where M1's table cut it off, using the full heading from the M1 text or the obvious completion)
  titleEn: string;            // faithful formal English
  kind: M1Kind;               // M1's classification: «постоянно» = constant, «постоянно с полета» = fields, «специфично за схемата» = specific
  bg?: string[];              // constant/fields: the text, one paragraph or bullet per entry, VERBATIM from M1
  en?: string[];              // the same entries in faithful formal English, entry for entry
  guideBg?: string;           // specific points only: one or two sentences saying what the point must contain (based on ISO/IEC 17043:2023, 7.2 — the PT plan's contents), for the person writing it; never printed
  guideEn?: string;
  notes?: string[];           // see «Conflicts» below — in English
}

// ---------------------------------------------------------------------------
// Blocks shared by more than one document (identical wording in M1).
// ---------------------------------------------------------------------------

// Plan item 10 = Invitation item 4 (the schedule).
const SCHEDULE_BG: string[] = [
  "**В случай на промени във времевия график на настоящата РТ схема или при настъпване на други съществени обстоятелства всички участници ще бъдат уведомени своевременно по електронна поща.** Подробна информация относно получаването, съхранението, манипулирането, калибрирането, докладването на резултатите и последващото изпращане на обекта на РТ схемата се предоставя на участниците чрез **Инструкция за участниците (Ф 7.3.5-1)**, която се изпраща по електронна поща.",
  "Общата продължителност на РТ схемата зависи от броя на участниците, времето за транспортиране, срока за калибриране при всеки участник и необходимото време за първоначално и повторно референтно калибриране.",
  "Поради последователния характер на настоящата РТ схема изпращането на обекта на РТ схемата до първия участник може да започне преди изтичане на крайния срок за приемане на заявки, при наличие на най-малко една валидно подадена и приета заявка за участие.",
  "Крайният срок за приемане на заявки определя последната дата, до която лаборатории могат да заявят участие в схемата. Лаборатории, заявили участие след започване на разпространението на обекта на РТ схемата, могат да бъдат включени в последователността на участниците, когато това е технически възможно и не застрашава валидността, графика и организацията на РТ схемата.",
  "Точната последователност на участниците, адресите за изпращане и индивидуалните срокове за калибриране и последващо изпращане на обекта на РТ схемата се определят от РТ провайдъра в **Списъка на заявилите участие (С 7.2.1-4)** и се съобщават на участниците **по електронна поща.**",
  "Резултатите се подават от участника в срока, определен от РТ провайдъра, чрез предоставения **Лист с резултати (Ф 7.2.1-7)**.",
  "Окончателният доклад и сертификатите за участие се изготвят и изпращат до 20 работни дни след приключване на повторното референтно калибриране и окончателната обработка на резултатите.",
];
const SCHEDULE_EN: string[] = [
  "**In the event of changes to the time schedule of this PT scheme or other significant circumstances, all participants will be notified promptly by e-mail.** Detailed information on the receipt, storage, handling, calibration, reporting of results and subsequent dispatch of the PT item is provided to participants through the **Instructions for participants (F 7.3.5-1)**, which is sent by e-mail.",
  "The overall duration of the PT scheme depends on the number of participants, the transport time, the calibration period at each participant, and the time required for the initial and repeat reference calibration.",
  "Owing to the sequential nature of this PT scheme, dispatch of the PT item to the first participant may begin before the deadline for accepting applications expires, provided that at least one validly submitted and accepted application form has been received.",
  "The deadline for accepting applications is the last date by which laboratories may apply to take part in the scheme. Laboratories that apply after distribution of the PT item has begun may be included in the participant sequence where this is technically feasible and does not jeopardise the validity, schedule or organisation of the PT scheme.",
  "The exact sequence of participants, the dispatch addresses, and the individual deadlines for calibration and subsequent dispatch of the PT item are determined by the PT provider in the **List of registered participants (C 7.2.1-4)** and are communicated to participants **by e-mail.**",
  "Participants submit their results by the deadline set by the PT provider, using the **Results Sheet (F 7.2.1-7)** provided.",
  "The Final Report and the certificates of participation are prepared and sent within 20 working days after completion of the repeat reference calibration and the final processing of the results.",
];
const SCHEDULE_NOTES: string[] = [
  "D17 — M1 says: «Поради последователния характер на настоящата РТ схема изпращането на обекта на РТ схемата до първия участник може да започне преди изтичане на крайния срок за приемане на заявки, при наличие на най-малко една валидно подадена и приета заявка за участие.» and «Лаборатории, заявили участие след започване на разпространението на обекта на РТ схемата, могат да бъдат включени в последователността на участниците…». Decision D17: in a sequential scheme each laboratory gets its code at admission, so the portal's admission step (not the application deadline) governs when the item may leave and who is in the sequence.",
  "D16 — M1 says: «Точната последователност на участниците, адресите за изпращане и индивидуалните срокове за калибриране и последващо изпращане на обекта на РТ схемата се определят от РТ провайдъра в Списъка на заявилите участие (С 7.2.1-4) и се съобщават на участниците по електронна поща.» Decision D16: communication runs through the portal as well as by e-mail (same for the other «по електронна поща» sentences in this item).",
];

// Plan item 20 = Invitation item 6 (applying to take part).
const APPLY_BG: string[] = [
  "За участие в РТ схемата лабораторията попълва **Заявка за участие (Ф 7.2.1-3)** и я изпраща на електронния адрес, посочен във формуляра. Заявката може да бъде подадена и електронно чрез официалния уебсайт на РТ провайдъра.",
  "С подаването на **Заявка за участие (Ф 7.2.1-3)** по електронен път лабораторията потвърждава, че е запозната с РТ плана, Поканата за участие и условията за участие в настоящата РТ схема и ги приема.",
  "Приемането на условията за участие се потвърждава чрез попълване и изпращане на **Заявка за участие (Ф 7.2.1-3)** от посочения електронен адрес и чрез отбелязване на съответното поле за потвърждение във формуляра, когато такова поле е предвидено.",
  "В Заявката за участие лабораторията посочва точките на калибриране, за които заявява участие. Лабораторията може да заяви участие за всички или само за част от зададените точки на калибриране.",
  "С подаването на Заявката за участие лабораторията потвърждава, че приема определения дизайн на РТ схемата, включително последователния начин на провеждане, начина за разпространение на обекта на РТ схемата, правилата за получаване, съхранение, манипулиране, калибриране и последващо изпращане на обекта, както и изискванията за докладване на резултатите.",
  "С подаването на Заявката за участие лабораторията потвърждава, че приема отговорността за правилното получаване, съхранение, манипулиране, използване, опаковане и последващо изпращане на обекта на РТ схемата за периода, през който обектът се намира в нейно владение, фактическо държане или под неин контрол.",
  "Участникът е отговорен за изпращането на обекта на РТ схемата до следващия участник или до РТ провайдъра в срока и по начина, определени от РТ провайдъра. Участникът предоставя на РТ провайдъра потвърждение за изпращането по електронна поща.",
  "При загуба, повреда, функционална неизправност, трайно замърсяване, неправомерно задържане или друго действие или бездействие, настъпило през периода, в който обектът на РТ схемата е във владение, фактическо държане или под контрол на участника, участникът възстановява на РТ провайдъра действително направените и документално обосновани преки разходи, необходими за отстраняване на последиците.",
  "Тези разходи могат да включват, когато е приложимо, разходи за проверка, ремонт, подмяна на обекта на РТ схемата, транспорт, допълнително или повторно референтно калибриране, оценка на стабилността, актуализиране на приписани стойности и други преки разходи, необходими за запазване или възстановяване на валидността на РТ схемата.",
  "РТ провайдърът уведомява участника писмено за установения проблем, оцененото влияние върху РТ схемата и размера на дължимите разходи, когато такива са приложими.",
  "С подаването на Заявката за участие лабораторията приема начина за определяне на приписаните стойности за всяка точка на калибриране, начина за оценяване на свързаните с тях неопределености и критерия за оценяване на представянето, определени в настоящия РТ план.",
  "РТ провайдърът присвоява уникален лабораторен код на всяко участие за административни цели, обработване на резултатите, оценяване на представянето и докладване.",
  "Една лаборатория може да участва в РТ схемата повече от веднъж, например при участие на различни оператори, използване на различни еталони, различни процедури или за други вътрешни цели на лабораторията. В такива случаи всяко участие се разглежда като самостоятелно участие и за него се присвоява отделен лабораторен код.",
  "За всяко участие лабораторията представя резултати за заявените точки на калибриране. За точки, за които лабораторията не е заявила участие или не е докладвала резултат, оценяване на представянето не се извършва.",
  "Лабораторните кодове се вписват предварително в **Листа с резултати (Ф 7.2.1-7)** от Ръководителя на РТ схемата или от определен член на екипа на РТ провайдъра.",
  "**Окончателен доклад (Ф 7.4.3-1)** се изготвя след приключване на статистическата обработка, оценяването на представянето и проверката на резултатите. Докладът се изпраща на всеки участник по електронна поща.",
  "На всеки участник се издава сертификат за участие, който се изпраща на електронния адрес, посочен в **Заявката за участие (Ф 7.2.1-3)**.",
  "Информация относно издадените сертификати за участие може да бъде публикувана в раздел **„Регистър“** на официалния уебсайт на РТ провайдъра. Резултати, En-оценки или друга информация, позволяваща идентифициране на представянето на участниците, не се публикуват.",
];
const APPLY_EN: string[] = [
  "To participate in the PT scheme, the laboratory completes the **Application form (F 7.2.1-3)** and sends it to the e-mail address indicated on the form. The application may also be submitted electronically through the PT provider's official website.",
  "By submitting the **Application form (F 7.2.1-3)** electronically, the laboratory confirms that it is familiar with the PT plan, the Invitation for participation and the conditions of participation in this PT scheme, and accepts them.",
  "Acceptance of the conditions of participation is confirmed by completing and sending the **Application form (F 7.2.1-3)** from the e-mail address indicated and by ticking the relevant confirmation field on the form, where such a field is provided.",
  "In the Application form the laboratory indicates the calibration points for which it applies to participate. The laboratory may apply for all or only some of the calibration points set.",
  "By submitting the Application form, the laboratory confirms that it accepts the defined design of the PT scheme, including the sequential mode of conduct, the manner of distribution of the PT item, the rules for receipt, storage, handling, calibration and subsequent dispatch of the item, and the requirements for reporting of results.",
  "By submitting the Application form, the laboratory confirms that it accepts responsibility for the correct receipt, storage, handling, use, packaging and subsequent dispatch of the PT item for the period during which the item is in its possession, actual custody or under its control.",
  "The participant is responsible for dispatching the PT item to the next participant or to the PT provider within the time and in the manner specified by the PT provider. The participant provides the PT provider with confirmation of dispatch by e-mail.",
  "In the event of loss, damage, functional malfunction, permanent contamination, wrongful retention or any other act or omission occurring during the period in which the PT item is in the possession, actual custody or under the control of the participant, the participant reimburses the PT provider for the direct costs actually incurred, substantiated by documents and necessary to remedy the consequences.",
  "These costs may include, where applicable, costs of inspection, repair, replacement of the PT item, transport, additional or repeat reference calibration, stability assessment, updating of assigned values and other direct costs necessary to preserve or restore the validity of the PT scheme.",
  "The PT provider notifies the participant in writing of the problem identified, the assessed impact on the PT scheme and the amount of costs due, where such are applicable.",
  "By submitting the Application form, the laboratory accepts the manner of determining the assigned values for each calibration point, the manner of evaluating the associated uncertainties and the criterion for performance evaluation, as defined in this PT plan.",
  "The PT provider assigns a unique laboratory code to each participation for administrative purposes, processing of results, performance evaluation and reporting.",
  "A laboratory may participate in the PT scheme more than once, for example with different operators, different standards, different procedures or for other internal purposes of the laboratory. In such cases each participation is treated as a separate participation and is assigned a separate laboratory code.",
  "For each participation the laboratory submits results for the calibration points applied for. For points for which the laboratory has not applied to participate or has not reported a result, no performance evaluation is carried out.",
  "Laboratory codes are entered in advance in the **Results Sheet (F 7.2.1-7)** by the PT scheme manager or by a designated member of the PT provider's team.",
  "The **Final Report (F 7.4.3-1)** is prepared after completion of the statistical processing, the performance evaluation and the verification of the results. The report is sent to each participant by e-mail.",
  "A certificate of participation is issued to each participant and sent to the e-mail address indicated in the **Application form (F 7.2.1-3)**.",
  "Information on the certificates of participation issued may be published in the **“Register”** section of the PT provider's official website. Results, En scores or other information allowing the performance of participants to be identified are not published.",
];
const APPLY_NOTES: string[] = [
  "D17 — M1 says: «Лабораторните кодове се вписват предварително в Листа с резултати (Ф 7.2.1-7) от Ръководителя на РТ схемата или от определен член на екипа на РТ провайдъра.» Decision D17: in a sequential scheme each laboratory gets its code at admission (part 3.12), so its code can be entered in the Results Sheet before the device reaches it — consistent with M1; no change.",
  "D16 — M1 says: «Докладът се изпраща на всеки участник по електронна поща.» Decision D16: communication and delivery of documents (Final Report, certificate, dispatch confirmation) run through the portal as well as by e-mail.",
];

// ---------------------------------------------------------------------------
// Plan of proficiency testing, F 7.2.1-1 — 22 points.
// ---------------------------------------------------------------------------
export const M1_PLAN: M1Point[] = [
  {
    no: 1,
    titleBg: "Вид на схемата за изпитване за пригодност",
    titleEn: "Type of proficiency testing scheme",
    kind: "constant",
    bg: [
      "Едновременна схема за PT - подпроби от един източник на материал, които се разпространяват едновременно до участниците за едновременно изпитване. (т. А.2.2 от Приложение А на ISO/IEC 17043:2023 )",
      "Последователна схема за PT - обект на изпитване за пригодност, който се разпространява последователно от един участник към следващия, или понякога се връща обратно към организатора на изпитването за пригодност за повторна проверка. (т. А.2.3 от Приложение А на ISO/IEC 17043:2023 )",
    ],
    en: [
      "Simultaneous PT scheme – sub-samples from a single source of material that are distributed simultaneously to participants for simultaneous testing. (cl. A.2.2 of Annex A of ISO/IEC 17043:2023 )",
      "Sequential PT scheme – a proficiency testing item that is distributed sequentially from one participant to the next, or sometimes returned to the organiser of the proficiency testing for re-checking. (cl. A.2.3 of Annex A of ISO/IEC 17043:2023 )",
    ],
  },
  {
    no: 2,
    titleBg: "Персонал, участващ в схемата за изпитване за пригодност",
    titleEn: "Personnel involved in the proficiency testing scheme",
    kind: "constant",
    bg: [
      "{{team}}",
      "Разпределението на отговорностите и функциите на персонала, участващ в разработването, организирането, провеждането, обработването на резултатите и докладването на настоящата РТ схема, се извършва в съответствие с вътрешните процедури на РТ провайдъра и изискванията на ISO/IEC 17043:2023.",
    ],
    en: [
      "{{team}}",
      "The allocation of responsibilities and functions of the personnel involved in the development, organisation, conduct, processing of results and reporting of this PT scheme is carried out in accordance with the PT provider's internal procedures and the requirements of ISO/IEC 17043:2023.",
    ],
  },
  {
    no: 3,
    titleBg: "Информация за услуги, доставени от външни доставчици",
    titleEn: "Information on services provided by external providers",
    kind: "specific",
    guideBg: "Посочват се услугите, доставени от външни доставчици за тази схема (напр. референтно калибриране, оценка на стабилността, транспорт), кой ги извършва и как е осигурена компетентността на доставчика.",
    guideEn: "State the services supplied by external providers for this scheme (e.g. reference calibration, stability assessment, transport), who performs them, and how the provider's competence is ensured.",
  },
  {
    no: 4,
    titleBg: "Критерии за участие в настоящата схема за изпитване за пригодност",
    titleEn: "Criteria for participation in this proficiency testing scheme",
    kind: "specific",
    guideBg: "Описват се критериите, на които трябва да отговаря една лаборатория, за да участва в схемата (вид дейност, обхват, технически възможности за конкретния обект), и как провайдърът преценява допустимостта.",
    guideEn: "Describe the criteria a laboratory must meet to take part in the scheme (type of activity, scope, technical capability for this particular item) and how the provider judges eligibility.",
  },
  {
    no: 5,
    titleBg: "Брой и вид на очакваните участници в схемата за изпитване за пригодност",
    titleEn: "Number and type of expected participants in the proficiency testing scheme",
    kind: "fields",
    bg: [
      "Настоящата схема за изпитване за пригодност се организира като последователно междулабораторно сравнение.",
      "Очакваните участници са лаборатории за калибриране, които извършват или желаят да оценят своето представяне при калибриране на {{deviceKind}}.",
      "Очакваният брой участници е от {{minParticipants}} до {{maxParticipants}} лаборатории за калибриране.",
      "Когато в схемата участва само една лаборатория, оценяването на представянето се извършва чрез сравнение на резултатите на участника с независимо определените приписани стойности, установени чрез референтните калибрирания. В този случай валидността на оценяването не зависи от консенсус между участници.",
      "РТ провайдърът организира, координира и контролира провеждането на схемата. РТ провайдърът не участва като участник в схемата и не представя резултати за оценяване на представянето.",
    ],
    en: [
      "This proficiency testing scheme is organised as a sequential interlaboratory comparison.",
      "The expected participants are calibration laboratories that perform, or wish to evaluate their performance in, the calibration of {{deviceKind}}.",
      "The expected number of participants is from {{minParticipants}} to {{maxParticipants}} calibration laboratories.",
      "Where only one laboratory takes part in the scheme, performance is evaluated by comparing the participant's results with the independently determined assigned values established through the reference calibrations. In this case the validity of the evaluation does not depend on consensus among participants.",
      "The PT provider organises, coordinates and controls the conduct of the scheme. The PT provider does not take part in the scheme as a participant and does not submit results for performance evaluation.",
    ],
  },
  {
    no: 6,
    titleBg: "Избор на метод и определяна величина",
    titleEn: "Selection of method and measurand",
    kind: "specific",
    guideBg: "Определят се определяната величина, диапазонът и точките на калибриране и методът (или допустимите методи) на измерване, както и обосновката на избора.",
    guideEn: "Define the measurand, the range and calibration points, and the measurement method (or permitted methods), together with the rationale for the choice.",
  },
  {
    no: 7,
    titleBg: "Потенциални основни източници на грешки",
    titleEn: "Potential major sources of error",
    kind: "specific",
    guideBg: "Изброяват се основните потенциални източници на грешки, свързани с обекта, условията на средата и процедурата на участниците, и как се ограничава влиянието им.",
    guideEn: "List the main potential sources of error related to the item, the environmental conditions and the participants' procedure, and how their influence is limited.",
  },
  {
    no: 8,
    titleBg: "Изисквания относно контрола на качеството, съхранението и разпространението на обекта на РТ схемата",
    titleEn: "Requirements regarding quality control, storage and distribution of the PT item",
    kind: "specific",
    guideBg: "Описват се изискванията за контрол на качеството на обекта, неговото съхранение и разпространение до участниците (опаковане, условия, ред на изпращане).",
    guideEn: "Describe the requirements for quality control of the item, its storage and its distribution to participants (packaging, conditions, dispatch order).",
  },
  {
    no: 9,
    titleBg: "Конфиденциалност",
    titleEn: "Confidentiality",
    kind: "specific",
    guideBg: "Описват се правилата и мерките за опазване на конфиденциалността на данните и самоличността на участниците, специфични за тази схема.",
    guideEn: "Describe the rules and measures that protect the confidentiality of participants' data and identity, as they apply to this scheme.",
  },
  {
    no: 10,
    titleBg: "График на схемата за изпитване за пригодност и информация за участниците",
    titleEn: "Schedule of the proficiency testing scheme and information for participants",
    kind: "constant",
    bg: SCHEDULE_BG,
    en: SCHEDULE_EN,
    notes: SCHEDULE_NOTES,
  },
  {
    no: 11,
    titleBg: "Методи и процедури за съхранение, манипулиране, транспортиране и връщане на обекта на РТ схемата",
    titleEn: "Methods and procedures for storage, handling, transport and return of the PT item",
    kind: "specific",
    guideBg: "Описват се методите и процедурите за съхранение, манипулиране, транспортиране и връщане на обекта, специфични за този обект.",
    guideEn: "Describe the methods and procedures for storage, handling, transport and return of the item, specific to this item.",
  },
  {
    no: 12,
    titleBg: "Методи, които ще се използват за определяне на стабилността на обекта на РТ схемата",
    titleEn: "Methods to be used to determine the stability of the PT item",
    kind: "specific",
    guideBg: "Описват се методите и критериите, с които се оценява стабилността на обекта по време на схемата (напр. повторно референтно калибриране и допустим дрейф).",
    guideEn: "Describe the methods and criteria used to assess the stability of the item during the scheme (e.g. repeat reference calibration and permitted drift).",
  },
  {
    no: 13,
    titleBg: "Докладване на резултатите",
    titleEn: "Reporting of results",
    kind: "fields",
    bg: [
      "Резултатите се докладват от участниците до крайния срок, посочен в т. 10 от настоящия РТ план, чрез използване на предоставения документ **Лист с резултати (Ф 7.2.1-7).**",
      "Резултатите се предоставят по електронна поща във формат Excel, като се използва единствено предоставеният формуляр, без да се променя неговата структура, форматът на клетките, заложените полета или предварително въведените лабораторни кодове.",
      "Всеки участник докладва резултатите от калибрирането в съответствие с изискванията, посочени в **Инструкцията за участниците (Ф 7.3.5-1)** и в **Листа с резултати (Ф 7.2.1-7)**.",
      "Участникът докладва резултати за точките на калибриране, за които е заявил участие и за които е извършил калибриране. За точки, за които участникът не е заявил участие или не е докладвал резултат, оценяване на представянето не се извършва.",
      "За всяка заявена и докладвана точка на калибриране участникът предоставя приложимите данни, изисквани в **Листа с резултати (Ф 7.2.1-7)**, включително реално реализираната стойност на {{quantity}}, докладвания резултат от калибрирането във формата, определен от РТ провайдъра, и съответната разширена неопределеност на измерване при фактор на покритие k = 2.",
      "Докладваният резултат трябва да бъде представен в същия вид и единица, които са определени в **Листа с резултати**, за да може да бъде сравнен с приписаната стойност за съответната точка на калибриране при изчисляване на En.",
      "Участникът носи отговорност за коректното попълване на Листа с резултати, включително за правилното прехвърляне на данни, закръгляване, посочване на единици, заявяване на неопределеността и спазване на определения формат за докладване.",
      "След изтичане на крайния срок за докладване на резултатите не се приемат корекции или допълнителни резултати, освен в случаи на техническа грешка при въвеждането или прехвърлянето на данните, за която РТ провайдърът е уведомен своевременно.",
      "Когато докладван резултат е непълен, неясен, представен в несъгласуван формат или не позволява технически коректно сравнение с приписаната стойност, РТ провайдърът оценява приложимостта му преди статистическата обработка. Ако резултатът не е технически съпоставим или не позволява надеждно изчисляване на En, той не се използва за оценяване на представянето за съответната точка.",
    ],
    en: [
      "Participants report their results by the deadline stated in item 10 of this PT plan, using the provided document **Results Sheet (F 7.2.1-7).**",
      "Results are submitted by e-mail in Excel format, using only the form provided, without changing its structure, the cell format, the fields provided or the pre-entered laboratory codes.",
      "Each participant reports the calibration results in accordance with the requirements set out in the **Instructions for participants (F 7.3.5-1)** and in the **Results Sheet (F 7.2.1-7)**.",
      "The participant reports results for the calibration points for which it has applied to participate and which it has calibrated. For points for which the participant has not applied to participate or has not reported a result, no performance evaluation is carried out.",
      "For each applied-for and reported calibration point, the participant provides the applicable data required in the **Results Sheet (F 7.2.1-7)**, including the actually realised value of {{quantity}}, the reported calibration result in the format specified by the PT provider, and the corresponding expanded measurement uncertainty at a coverage factor k = 2.",
      "The reported result must be presented in the same form and unit as specified in the **Results Sheet**, so that it can be compared with the assigned value for the respective calibration point when calculating En.",
      "The participant is responsible for correctly completing the Results Sheet, including the correct transfer of data, rounding, indication of units, statement of uncertainty and compliance with the specified reporting format.",
      "After the deadline for reporting results has passed, no corrections or additional results are accepted, except in the case of a technical error in entering or transferring the data of which the PT provider has been notified promptly.",
      "Where a reported result is incomplete, unclear, presented in a non-conforming format or does not allow a technically correct comparison with the assigned value, the PT provider assesses its applicability before the statistical processing. If the result is not technically comparable or does not allow reliable calculation of En, it is not used for performance evaluation for the respective point.",
    ],
    notes: [
      "Реш. 111 — M1 says: «След изтичане на крайния срок за докладване на резултатите не се приемат корекции или допълнителни резултати, освен в случаи на техническа грешка при въвеждането или прехвърлянето на данните, за която РТ провайдърът е уведомен своевременно.» Decision 111: after the deadline a result is accepted only through the provider, on record.",
      "D17 — M1 says: «Резултатите се предоставят по електронна поща във формат Excel, като се използва единствено предоставеният формуляр, без да се променя неговата структура, форматът на клетките, заложените полета или предварително въведените лабораторни кодове.» Decision D17: in a sequential scheme each laboratory gets its code at admission (part 3.12), so the code can be pre-entered in its Results Sheet — consistent with M1; no change.",
      "D16 — same sentence as above: «Резултатите се предоставят по електронна поща…» names e-mail as the only channel for submitting results. Decision D16: communication runs through the portal as well as e-mail.",
    ],
  },
  {
    no: 14,
    titleBg: "Детайлно описание на използвания статистически анализ и критериите за оценка на представянето",
    titleEn: "Detailed description of the statistical analysis used and the criteria for performance evaluation",
    kind: "specific",
    guideBg: "Описва се подробно статистическият анализ (определяне на приписаните стойности, статистика за оценяване като En, третиране на отклоняващите се резултати) и критериите, по които се оценява представянето.",
    guideEn: "Describe in detail the statistical analysis (determination of assigned values, performance statistic such as En, treatment of outliers) and the criteria by which performance is evaluated.",
  },
  {
    no: 15,
    titleBg: "Произход, метрологична проследимост и неопределеност на приписаните стойности",
    titleEn: "Origin, metrological traceability and uncertainty of the assigned values",
    kind: "specific",
    guideBg: "Посочва се откъде идват приписаните стойности, как е осигурена метрологичната им проследимост (еталони, референтна лаборатория) и как е оценена неопределеността им.",
    guideEn: "State where the assigned values come from, how their metrological traceability is ensured (standards, reference laboratory) and how their uncertainty is evaluated.",
  },
  {
    no: 16,
    titleBg: "Обработване на резултатите от различни методи за измерване, когато се позволява",
    titleEn: "Treatment of results from different measurement methods, where permitted",
    kind: "specific",
    guideBg: "Описва се дали се допускат различни методи за измерване и как се обработват и сравняват резултатите от тях; ако се допуска само един метод, това се посочва.",
    guideEn: "Describe whether different measurement methods are permitted and how results obtained with them are processed and compared; if only one method is permitted, say so.",
  },
  {
    no: 17,
    titleBg: "Публичност на информацията, получена от участниците, и окончателния доклад",
    titleEn: "Disclosure of information obtained from participants and of the final report",
    kind: "constant",
    bg: [
      "Информацията, получена от участниците в рамките на РТ схемата, се третира като конфиденциална в съответствие с т. 9 от настоящия РТ план.",
      "Всеки участник получава **Окончателен доклад (Ф 7.4.3-1)**. В доклада участниците се идентифицират единствено чрез присвоените им лабораторни кодове.",
      "Окончателният доклад съдържа информация за организацията и провеждането на РТ схемата, използвания статистически подход, приписаните стойности, неопределеностите, En-оценките и оценяването на представянето на участниците.",
      "Индивидуалните резултати и идентичността на участниците не се разкриват на други участници или на трети страни, освен когато това се изисква от акредитиращ орган, регулаторен орган или приложимо законодателство.",
      "Всички членове на екипа на РТ провайдъра, които имат достъп до информация, свързана с планирането, провеждането, обработването на резултатите и докладването на настоящата РТ схема, са задължени да спазват конфиденциалност.",
      "**Окончателният доклад (Ф 7.4.3-1)** може да бъде предоставен на акредитиращия орган на РТ провайдъра при поискване.",
      "Когато РТ провайдърът е задължен да предостави информация на акредитиращ орган, регулаторен орган или друг компетентен орган, засегнатият участник се уведомява писмено, освен ако това е забранено от приложимо законодателство или от съответния орган.",
      "РТ провайдърът може да публикува или предоставя само обобщена и анонимизирана информация, при условие че идентичността на участниците не може да бъде установена.",
      "Информация относно издадените сертификати за участие може да бъде публикувана в раздел **„Регистър“** на официалния уебсайт на РТ провайдъра. При публикуване не се разкриват резултати, En-оценки или друга информация, позволяваща идентифициране на представянето на участниците.",
    ],
    en: [
      "Information obtained from participants in the course of the PT scheme is treated as confidential in accordance with item 9 of this PT plan.",
      "Each participant receives a **Final Report (F 7.4.3-1)**. In the report, participants are identified solely by the laboratory codes assigned to them.",
      "The Final Report contains information on the organisation and conduct of the PT scheme, the statistical approach used, the assigned values, the uncertainties, the En scores and the evaluation of participant performance.",
      "Individual results and the identity of participants are not disclosed to other participants or to third parties, except where required by an accreditation body, a regulatory body or applicable legislation.",
      "All members of the PT provider's team who have access to information related to the planning, conduct, processing of results and reporting of this PT scheme are obliged to maintain confidentiality.",
      "The **Final Report (F 7.4.3-1)** may be provided to the PT provider's accreditation body upon request.",
      "Where the PT provider is obliged to provide information to an accreditation body, a regulatory body or another competent authority, the participant concerned is notified in writing, unless this is prohibited by applicable legislation or by the authority concerned.",
      "The PT provider may publish or provide only summarised and anonymised information, provided that the identity of participants cannot be established.",
      "Information on the certificates of participation issued may be published in the **“Register”** section of the PT provider's official website. When published, no results, En scores or other information that would allow the performance of participants to be identified are disclosed.",
    ],
  },
  {
    no: 18,
    titleBg: "Действия при загубен, повреден или забавен при транспортирането обект на РТ схема",
    titleEn: "Actions in the event of a PT item that is lost, damaged or delayed in transport",
    kind: "constant",
    bg: [
      "При загуба, повреда, функционална неизправност, трайно замърсяване, конденз или съмнение за изменение на метрологичните характеристики на обекта на РТ схемата участникът незабавно уведомява Ръководителя на РТ схемата.",
      "При получаване на обекта на РТ схемата участникът проверява състоянието му за видими механични повреди, функционална изправност, трайно замърсяване, конденз или други признаци, които могат да повлияят върху годността му за калибриране. Получаването се документира чрез **Протокол за получаване на обект на изпитване за пригодност (Ф 7.3.4-1)**.",
      "При установена повреда, функционална неизправност или съмнение за непригодност на обекта на РТ схемата участникът не започва или не продължава калибрирането без писмени указания от РТ провайдъра.",
      "При необходимост РТ провайдърът временно преустановява разпространението на обекта на РТ схемата до изясняване на състоянието му и оценяване на влиянието върху валидността на схемата.",
      "РТ провайдърът оценява влиянието на установения проблем върху валидността на РТ схемата, включително върху стабилността на обекта, приписаните стойности, неопределеностите, техническата съпоставимост на резултатите и оценяването на представянето на участниците.",
      "При необходимост обектът на РТ схемата се връща на РТ провайдъра за проверка. Когато е технически възможно и обосновано, обектът може да бъде ремонтиран. Когато ремонтът не е възможен, не е подходящ или би компрометирал валидността на схемата, РТ провайдърът може да осигури заместващ обект.",
      "При използване на ремонтиран или заместващ обект на РТ схемата РТ провайдърът оценява необходимостта от ново референтно калибриране, нова оценка на стабилността, нови приписани стойности, повторно калибриране от участници и актуализиране на графика на РТ схемата.",
      "Когато установеният проблем може да повлияе върху вече получени резултати, РТ провайдърът оценява валидността им и определя дали те могат да бъдат използвани за оценяване на представянето или е необходимо повторно калибриране от съответните участници.",
      "При забавяне на транспортирането на обекта на РТ схемата участникът уведомява РТ провайдъра без неоправдано забавяне. РТ провайдърът координира необходимите действия, актуализира графика, когато е необходимо, и уведомява засегнатите участници по електронна поща.",
      "Всички решения и предприети действия при загубен, повреден, забавен, ремонтиран или заменен обект на РТ схемата се документират като записи към досието на РТ схемата.",
    ],
    en: [
      "In the event of loss, damage, functional malfunction, permanent contamination, condensation or suspected change in the metrological characteristics of the PT item, the participant immediately notifies the PT scheme manager.",
      "On receipt of the PT item, the participant checks its condition for visible mechanical damage, functional integrity, permanent contamination, condensation or other signs that may affect its fitness for calibration. Receipt is documented by means of the **Protocol for PT item receipt (F 7.3.4-1)**.",
      "If damage, functional malfunction or suspected unsuitability of the PT item is found, the participant does not begin or continue the calibration without written instructions from the PT provider.",
      "Where necessary, the PT provider temporarily suspends distribution of the PT item until its condition has been clarified and the impact on the validity of the scheme has been assessed.",
      "The PT provider assesses the impact of the problem identified on the validity of the PT scheme, including the stability of the item, the assigned values, the uncertainties, the technical comparability of the results and the evaluation of participant performance.",
      "Where necessary, the PT item is returned to the PT provider for checking. Where technically possible and justified, the item may be repaired. Where repair is not possible, not appropriate or would compromise the validity of the scheme, the PT provider may supply a replacement item.",
      "When a repaired or replacement PT item is used, the PT provider assesses the need for a new reference calibration, a new stability assessment, new assigned values, repeat calibration by participants and updating of the PT scheme schedule.",
      "Where the problem identified may affect results already received, the PT provider assesses their validity and determines whether they can be used for performance evaluation or whether repeat calibration by the participants concerned is necessary.",
      "In the event of a delay in transporting the PT item, the participant notifies the PT provider without undue delay. The PT provider coordinates the necessary actions, updates the schedule where necessary and notifies the participants concerned by e-mail.",
      "All decisions and actions taken in the event of a lost, damaged, delayed, repaired or replaced PT item are documented as records in the PT scheme file.",
    ],
    notes: [
      "D16 — M1 says: «РТ провайдърът координира необходимите действия, актуализира графика, когато е необходимо, и уведомява засегнатите участници по електронна поща.» Decision D16: notices also go through the portal, not by e-mail alone.",
      "Реш. 154 / 3.4 — the same sentence: a carrier's delay does not extend a deadline (the risk lies with the party that chose the carrier), and deadlines move only by the head's order (an extension) — «актуализира графика» must be read so. A question for PTS.",
    ],
  },
  {
    no: 19,
    titleBg: "Обратна връзка и комуникация с участниците",
    titleEn: "Feedback and communication with participants",
    kind: "constant",
    bg: [
      "Комуникацията с участниците се осъществява от Ръководителя на РТ схемата или от определен член на екипа на РТ провайдъра по електронна поща, телефон или чрез писмена кореспонденция, когато е необходимо.",
      "По време на провеждане на РТ схемата участниците могат да отправят въпроси, свързани с организацията, получаването, съхранението, манипулирането, калибрирането, докладването на резултатите и последващото изпращане на обекта на РТ схемата.",
      "Указанията към участниците се предоставят чрез **Инструкция за участниците (Ф 7.3.5-1)**.",
      "Преди получаване на обекта на РТ схемата на участниците се изпращат по електронна поща приложимите документи и формуляри, включително:",
      "**Инструкция за участниците** (Ф 7.3.5-1);",
      "**Протокол за получаване на обект на изпитване за пригодност** (Ф7.3.4-1);",
      "**Лист с резултати** (Ф 7.2.1-7);",
      "**Декларация за конфиденциалност** (Ф 4.2-2).",
      "При необходимост РТ провайдърът може да организира технически срещи с участниците. Срещите могат да се провеждат дистанционно или в друг предварително договорен формат.",
      "Техническите срещи могат да обхващат организационни и технически въпроси, свързани с изпълнението на РТ схемата, включително графика, получаването, манипулирането, съхранението и изпращането на обекта на РТ схемата, условията за калибриране, използването на Листа с резултати и изискванията за докладване.",
      "Преди издаване на **Окончателен доклад (Ф 7.4.3-1)** не се обсъждат и не се разкриват индивидуални резултати, приписани стойности, En-оценки, междинни заключения или информация, която може да повлияе върху независимостта на резултатите на участниците.",
      "Обратната връзка от участниците се събира чрез **Лист за обратна връзка (Ф 8.6-2)**. Попълненият формуляр се връща на РТ провайдъра в определения срок.",
      "Получената обратна връзка се използва за оценяване на удовлетвореността на участниците, идентифициране на възможности за подобрение и планиране на бъдещи РТ схеми.",
    ],
    en: [
      "Communication with participants is carried out by the PT scheme manager or by a designated member of the PT provider's team by e-mail, telephone or, where necessary, written correspondence.",
      "While the PT scheme is being conducted, participants may ask questions relating to the organisation, receipt, storage, handling, calibration, reporting of results and subsequent dispatch of the PT item.",
      "Instructions to participants are provided through the **Instructions for participants (F 7.3.5-1)**.",
      "Before the PT item is received, the applicable documents and forms are sent to participants by e-mail, including:",
      "**Instructions for participants** (F 7.3.5-1);",
      "**Protocol for PT item receipt** (F7.3.4-1);",
      "**Results Sheet** (F 7.2.1-7);",
      "**Confidentiality declaration** (F 4.2-2).",
      "Where necessary, the PT provider may organise technical meetings with participants. Meetings may be held remotely or in another format agreed in advance.",
      "Technical meetings may cover organisational and technical issues related to the implementation of the PT scheme, including the schedule, receipt, handling, storage and dispatch of the PT item, the calibration conditions, the use of the Results Sheet and the reporting requirements.",
      "Before the **Final Report (F 7.4.3-1)** is issued, individual results, assigned values, En scores, interim conclusions or information that could affect the independence of participants' results are neither discussed nor disclosed.",
      "Feedback from participants is collected through the **Feedback form (F 8.6-2)**. The completed form is returned to the PT provider within the specified period.",
      "The feedback received is used to evaluate participant satisfaction, identify opportunities for improvement and plan future PT schemes.",
    ],
    notes: [
      "D16 — M1 says: «Преди получаване на обекта на РТ схемата на участниците се изпращат по електронна поща приложимите документи и формуляри, включително:» Decision D16: documents and forms are also made available through the portal, not by e-mail alone.",
    ],
  },
  {
    no: 20,
    titleBg: "Заявяване на участие в РТ схемата",
    titleEn: "Applying to participate in the PT scheme",
    kind: "fields",
    bg: APPLY_BG,
    en: APPLY_EN,
    notes: APPLY_NOTES,
  },
  {
    no: 21,
    titleBg: "Финансови условия",
    titleEn: "Financial conditions",
    kind: "constant",
    bg: [
      "Финансовите условия са посочени в **“Поканата за изпитване за пригодност” /Ф 7.2.1-2/**.",
    ],
    en: [
      "The financial conditions are set out in the **“Invitation for proficiency testing” /F 7.2.1-2/**.",
    ],
  },
  {
    no: 22,
    titleBg: "Контакти",
    titleEn: "Contacts",
    kind: "constant",
    bg: ["{{contact}}"],
    en: ["{{contact}}"],
  },
];

// ---------------------------------------------------------------------------
// Invitation for proficiency testing, F 7.2.1-2 — 7 points.
// ---------------------------------------------------------------------------
export const M1_INVITATION: M1Point[] = [
  {
    no: 1,
    titleBg: "Номер и име на схемата за изпитване за пригодност",
    titleEn: "Number and name of the proficiency testing scheme",
    kind: "fields",
    bg: ["**Номер:** {{number}}", "**Име:** {{title}}"],
    en: ["**Number:** {{number}}", "**Name:** {{title}}"],
  },
  {
    no: 2,
    titleBg: "Избор на метод и определяна величина",
    titleEn: "Selection of method and measurand",
    kind: "specific",
    guideBg: "Накратко се посочват определяната величина, диапазонът и точките на калибриране и методът на измерване, за да може лабораторията да прецени дали да участва.",
    guideEn: "State briefly the measurand, the range and calibration points and the measurement method, so the laboratory can decide whether to take part.",
  },
  {
    no: 3,
    titleBg: "Информация за услуги, доставени от външни доставчици",
    titleEn: "Information on services provided by external providers",
    kind: "specific",
    guideBg: "Посочват се услугите, доставени от външни доставчици за тази схема, и кой ги извършва.",
    guideEn: "State the services supplied by external providers for this scheme and who performs them.",
  },
  {
    no: 4,
    titleBg: "График на схемата на изпитване за пригодност",
    titleEn: "Schedule of the proficiency testing scheme",
    kind: "constant",
    bg: SCHEDULE_BG,
    en: SCHEDULE_EN,
    notes: SCHEDULE_NOTES,
  },
  {
    no: 5,
    titleBg: "Финансови условия",
    titleEn: "Financial conditions",
    kind: "constant",
    bg: [
      "**ВАЖНО!!!** - Посочените цени са нето и подлежат на облагане с **20 % ДДС!**",
      "Таксата за участие не зависи от броя точки, които ще бъдат калибрирани.",
      // П7 from Gate B (5.8, D16): the portal holds the proforma and the invoice; e-mail only tells.
      // Read when the module loads — the deployment's setting, fixed until the next deploy, as
      // the edition fingerprint reads it (lib/editions GATE_DOCS)
      ...(gateB() ? [P7.bg] : [
        "Първоначално се издава проформа фактура, която се изпраща на посочената електронна поща в **Заявка за участие (Ф7.2.1-3)**.",
        "След извършване на плащането, се издава електронна фактура на платилите участници, която изпраща на посочената електронна поща в **Заявка за участие (F 7.2.1-3)**.",
      ]),
      "Само участниците, които са платили такса за участие ще бъдат включени в изпитването за пригодност!",
      "Второ и всяко следващо участие на лабораторията с отделен лабораторен код се заплаща {{sharePct}} % от обявената цена.",
      "Ще бъдете информирани посредством имейл, когато обектът на изпитването за пригодност е изпратен към Вас.",
      "Всеки участник се съгласява и задължава да използва надеждна и бърза (от 3 до 7 работни дни) куриерска фирма. Това се потвърждава чрез попълването и изпращането/подаването на заявката за участие.",
    ],
    en: [
      "**IMPORTANT!!!** - The prices stated are net and are subject to **20 % VAT!**",
      "The participation fee does not depend on the number of points to be calibrated.",
      ...(gateB() ? [P7.en] : [
        "A pro forma invoice is issued first and sent to the e-mail address indicated in the **Application form (F7.2.1-3)**.",
        "After payment has been made, an electronic invoice is issued to the participants who have paid and is sent to the e-mail address indicated in the **Application form (F 7.2.1-3)**.",
      ]),
      "Only participants who have paid the participation fee will be included in the proficiency testing!",
      "The second and each subsequent participation of a laboratory with a separate laboratory code is paid at {{sharePct}} % of the announced price.",
      "You will be informed by e-mail when the proficiency testing item has been dispatched to you.",
      "Each participant agrees and undertakes to use a reliable and fast (3 to 7 working days) courier company. This is confirmed by completing and sending/submitting the application form.",
    ],
    notes: [
      "Реш. 1, 96 (0.11) — M1 says: «Само участниците, които са платили такса за участие ще бъдат включени в изпитването за пригодност!» Decision: payment is not a condition for dispatch of the item.",
      "Реш. 153 — M1 says: «Второ и всяко следващо участие на лабораторията с отделен лабораторен код се заплаща 50 % от обявената цена.» Decision 153: the share for a second participation is a per-scheme field, not a hard 50 % (the text here uses {{sharePct}}).",
      "D16 — M1 says: «Първоначално се издава проформа фактура, която се изпраща на посочената електронна поща в Заявка за участие (Ф7.2.1-3).» Decision D16: communication and documents also run through the portal, not by e-mail alone.",
    ],
  },
  {
    no: 6,
    titleBg: "Заявяване на участие в РТ схемата",
    titleEn: "Applying to participate in the PT scheme",
    kind: "fields",
    bg: APPLY_BG,
    en: APPLY_EN,
    notes: APPLY_NOTES,
  },
  {
    no: 7,
    titleBg: "Контакти",
    titleEn: "Contacts",
    kind: "specific",
    guideBg: "Посочват се лицата за контакт по схемата: име, длъжност, телефон и електронна поща.",
    guideEn: "State the contact persons for the scheme: name, role, telephone and e-mail.",
  },
];

// ---------------------------------------------------------------------------
// Instructions for participants, F 7.3.5-1 — 11 points.
// ---------------------------------------------------------------------------
export const M1_INSTRUCTION: M1Point[] = [
  {
    no: 1,
    titleBg: "Номер и име на схемата за изпитване за пригодност",
    titleEn: "Number and name of the proficiency testing scheme",
    kind: "fields",
    bg: ["**Номер:** {{number}}", "**Име:** {{title}}"],
    en: ["**Number:** {{number}}", "**Name:** {{title}}"],
  },
  {
    no: 2,
    titleBg: "Информация относно изпращането на обекта на схемата за изпитване за пригодност",
    titleEn: "Information on dispatch of the proficiency testing scheme item",
    kind: "fields",
    bg: [
      "Обектът на РТ схемата ({{device}}) се изпраща на участника в периода, посочен в т. 10 на **Плана за изпитване за пригодност (Ф 7.2.1-1)** и в **Поканата за изпитване за пригодност (Ф 7.2.1-2)**.",
      "Участникът се уведомява по електронна поща след изпращането на пратката. При необходимост информация за доставката може да бъде предоставена и от куриерската служба.",
      "Необходимо е да се осигури присъствие на отговорно лице на посочения адрес за доставка за приемане на обекта на РТ схемата.",
      "Участникът разполага с максимум {{windowDays}} работни дни от получаването на обекта на РТ схемата, за да извърши измерванията и да подготви изпращането му към следващия участник или обратно към РТ провайдъра, съгласно указанията, получени по електронна поща.",
      "**След приключване на измерванията обектът на РТ схемата се изпраща на адреса, посочен от РТ провайдъра по електронна поща.**",
      "Допълнителна информация е предоставена в т. 8, т. 11 и т. 18 от **Плана за изпитване за пригодност (Ф 7.2.1-1)**.",
    ],
    en: [
      "The PT item ({{device}}) is dispatched to the participant in the period stated in item 10 of the **Plan for proficiency testing (F 7.2.1-1)** and in the **Invitation for proficiency testing (F 7.2.1-2)**.",
      "The participant is notified by e-mail after the consignment has been dispatched. Where necessary, delivery information may also be provided by the courier service.",
      "A responsible person must be available at the delivery address indicated to receive the PT item.",
      "The participant has a maximum of {{windowDays}} working days from receipt of the PT item to carry out the measurements and prepare it for dispatch to the next participant or back to the PT provider, in accordance with the instructions received by e-mail.",
      "**After the measurements are completed, the PT item is dispatched to the address indicated by the PT provider by e-mail.**",
      "Additional information is given in items 8, 11 and 18 of the **Plan for proficiency testing (F 7.2.1-1)**.",
    ],
    notes: [
      "Chain window — M1 says: «Участникът разполага с максимум пет работни дни от получаването на обекта на РТ схемата…» (the text now carries {{windowDays}}). The portal's default calibration window is 3 working days per participant, per scheme.",
      "D16 — M1 says: «След приключване на измерванията обектът на РТ схемата се изпраща на адреса, посочен от РТ провайдъра по електронна поща.» Decision D16: instructions and addresses are also given in the portal, not by e-mail alone.",
    ],
  },
  {
    no: 3,
    titleBg: "Манипулиране с обекта на схемата за изпитване за пригодност",
    titleEn: "Handling of the proficiency testing scheme item",
    kind: "specific",
    guideBg: "Описва се как участникът разопакова, проверява и манипулира обекта (предпазни мерки, какво да се избягва) и как го опакова за изпращане.",
    guideEn: "Describe how the participant unpacks, inspects and handles the item (precautions, what to avoid) and how it is repacked for dispatch.",
  },
  {
    no: 4,
    titleBg: "Кондициониране",
    titleEn: "Conditioning",
    kind: "specific",
    guideBg: "Посочват се необходимото време и условия за кондициониране на обекта преди измерване.",
    guideEn: "State the time and conditions required for conditioning the item before measurement.",
  },
  {
    no: 5,
    titleBg: "Условия на заобикалящата среда",
    titleEn: "Ambient conditions",
    kind: "specific",
    guideBg: "Посочват се изискванията към условията на средата (напр. температура и влажност) при измерването и как се наблюдават.",
    guideEn: "State the requirements for the ambient conditions (e.g. temperature and humidity) during measurement and how they are monitored.",
  },
  {
    no: 6,
    titleBg: "Метод на измерване",
    titleEn: "Measurement method",
    kind: "specific",
    guideBg: "Описват се методът и редът на измерване: точките на калибриране, последователността, времето за стабилизиране и броят отчитания.",
    guideEn: "Describe the measurement method and sequence: the calibration points, their order, stabilisation time and the number of readings.",
  },
  {
    no: 7,
    titleBg: "Фактори, влияещи върху измерванията",
    titleEn: "Factors influencing the measurements",
    kind: "specific",
    guideBg: "Посочват се факторите, които могат да повлияят на измерванията, и как участникът трябва да ги контролира или отчита.",
    guideEn: "State the factors that may influence the measurements and how the participant must control or account for them.",
  },
  {
    no: 8,
    titleBg: "Инструкции за безопасност",
    titleEn: "Safety instructions",
    kind: "specific",
    guideBg: "Посочват се рисковете при работа с обекта и необходимите мерки за безопасност; ако няма специфични рискове, това се отбелязва.",
    guideEn: "State the hazards of working with the item and the required safety measures; if there are no specific hazards, say so.",
  },
  {
    no: 9,
    titleBg: "Докладване на резултатите и неопределеността на измерване",
    titleEn: "Reporting of results and measurement uncertainty",
    kind: "specific",
    guideBg: "Описва се как се попълва Листът с резултати: единици, закръгляване, форматът на резултата и как се заявява разширената неопределеност (фактор на покритие).",
    guideEn: "Describe how the Results Sheet is completed: units, rounding, the format of the result, and how the expanded uncertainty (coverage factor) is stated.",
  },
  {
    no: 10,
    titleBg: "Краен срок за представяне на резултатите",
    titleEn: "Deadline for submission of results",
    kind: "constant",
    bg: [
      // П16 from Gate B (6.8, D16): the results in the portal, the record replacing the sheet
      gateB() ? P16_M1.bg : "Всички резултати от измерванията се представят по електронна поща не по-късно от срока, посочен в т. 10 на **Плана за изпитване за пригодност (Ф 7.2.1-1)**, чрез предоставения **„Лист с резултати“ (Ф 7.2.1-7)**.",
      "Ако участникът не представи резултати в определения срок, неговите резултати няма да бъдат включени в статистическата обработка и лабораторията няма да бъде включена в Окончателния доклад.",
      // П17 from Gate B (5.11, D16): the arrival confirmed and the declaration signed in the portal —
      // read when the module loads, as П7 above (the deployment's setting, fixed until a deploy)
      ...(gateB() ? [P17_M1.bg] : [
        "Заедно с резултатите участникът представя:",
        "**Протокол за получаване на обект на изпитване за пригодност (Ф 7.3.4-1)** – изпраща се на РТ провайдъра непосредствено след получаване на обекта на РТ схемата и не по-късно от следващия работен ден;",
        "**Декларация за конфиденциалност (Ф 4.2-2)** – представя се заедно с протокола за получаване и във всички случаи преди започване на дейностите по калибриране.",
      ]),
      "**Лист за обратна връзка (Ф 8.6-2)** се предоставя под формата на електронна връзка към онлайн анкета в срок до 7 работни дни след изпращане на Окончателния доклад. Формулярът за обратна връзка се попълва в срок до 1 месец от получаването му.",
    ],
    en: [
      gateB() ? P16_M1.en : "All measurement results are submitted by e-mail no later than the deadline stated in item 10 of the **Plan for proficiency testing (F 7.2.1-1)**, using the provided **“Results Sheet” (F 7.2.1-7)**.",
      "If the participant does not submit results by the specified deadline, its results will not be included in the statistical processing and the laboratory will not be included in the Final Report.",
      ...(gateB() ? [P17_M1.en] : [
        "Together with the results, the participant submits:",
        "**Protocol for PT item receipt (F 7.3.4-1)** – sent to the PT provider immediately after receipt of the PT item and no later than the next working day;",
        "**Confidentiality declaration (F 4.2-2)** – submitted together with the receipt protocol and in all cases before the calibration activities begin.",
      ]),
      "**Feedback form (F 8.6-2)** is provided as a link to an online survey within 7 working days after the Final Report is sent. The feedback form is to be completed within 1 month of its receipt.",
    ],
    notes: [
      "Реш. 111 — M1 says: «Ако участникът не представи резултати в определения срок, неговите резултати няма да бъдат включени в статистическата обработка и лабораторията няма да бъде включена в Окончателния доклад.» Decision 111: after the deadline a result is accepted only through the provider, on record.",
      "D16 — M1 says: «Всички резултати от измерванията се представят по електронна поща не по-късно от срока…» Decision D16: results and the accompanying documents are also submitted through the portal, not by e-mail alone.",
    ],
  },
  {
    no: 11,
    titleBg: "Контакти",
    titleEn: "Contacts",
    kind: "constant",
    bg: ["{{contact}}"],
    en: ["{{contact}}"],
  },
];
