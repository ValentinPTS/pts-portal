// Portal UI translations (BG/EN). PURE module — no next/headers — so it is safe
// to import from both server and client components. The server reads the chosen
// language from a cookie (lib/i18n-server.ts → getUiLang); client components read
// it from the LangProvider context (components/LangProvider.tsx). Documents have
// their own bilingual rendering (lib/types.ts `Lang`); this is only the chrome.
//
// Default is Bulgarian (the audience). A value is entered once per key here and is
// identical everywhere it is used — the same single-source-of-truth idea the
// documents follow. Unknown keys fall back to the key text, so a missing string is
// visible (not a crash) and easy to spot.

export type UiLang = "bg" | "en";
export const UI_LANGS: UiLang[] = ["bg", "en"];
export const DEFAULT_LANG: UiLang = "bg";
export const LANG_COOKIE = "uiLang";

export function isUiLang(v: unknown): v is UiLang {
  return v === "bg" || v === "en";
}

type Entry = { bg: string; en: string };

const DICT: Record<string, Entry> = {
  // ── header / nav ──
  "header.providerPortal": { bg: "Портал на организатора", en: "Provider portal" },
  "header.labPortal": { bg: "Портал за лаборатории", en: "Laboratory portal" },
  "nav.files": { bg: "Файлове", en: "Files" },
  "nav.skins": { bg: "Облици", en: "Skins" },

  // ── common ──
  "common.back": { bg: "Назад", en: "Back" },
  "common.signOut": { bg: "Изход", en: "Sign out" },
  "common.save": { bg: "Запази", en: "Save" },
  "common.cancel": { bg: "Отказ", en: "Cancel" },
  "common.edit": { bg: "Редактирай", en: "Edit" },
  "common.open": { bg: "Отвори", en: "Open" },
  "common.manage": { bg: "Управление", en: "Manage" },
  "common.add": { bg: "Добави", en: "Add" },
  "common.home": { bg: "Начало", en: "Home" },

  // ── folder types & statuses (mirror lib/folders.ts) ──
  "type.testing": { bg: "Изпитване", en: "Testing" },
  "type.calibration": { bg: "Калибриране", en: "Calibration" },
  "status.draft": { bg: "Чернова", en: "Draft" },
  "status.open": { bg: "Отворена", en: "Open" },
  "status.running": { bg: "В процес", en: "In progress" },
  "status.report": { bg: "Докладване", en: "Reporting" },
  "status.closed": { bg: "Докладвана", en: "Reported" },

  // ── account menu / page ──
  "account.title": { bg: "Профил", en: "Account" },
  "account.andProfile": { bg: "Профил и настройки", en: "Account & profile" },
  "account.signedInAs": { bg: "Влезли сте като", en: "Signed in as" },
  "account.role": { bg: "Роля", en: "Role" },
  "account.role.owner": { bg: "Организатор", en: "Owner" },
  "account.role.notOwner": { bg: "Неоторизиран потребител", en: "Not an authorized owner" },
  "account.twoFactor": { bg: "Двуфакторна защита", en: "Two-factor" },
  "account.twoFactor.enabled": { bg: "включена ✓", en: "enabled ✓" },
  "account.twoFactor.thisSession": { bg: "включена ✓ (потвърдена сега)", en: "enabled ✓ (verified this session)" },
  "account.twoFactor.notSetUp": { bg: "не е настроена", en: "not set up" },
  "account.setup2faTitle": { bg: "Настройка на двуфакторна защита", en: "Set up two-factor authentication" },
  "account.setup2faHint": { bg: "Изисква се преди достъп до администрацията.", en: "Required before you can access the admin area." },

  // ── scheme page tools ──
  "scheme.editData": { bg: "Редактирай данните", en: "Edit data" },
  "scheme.participants": { bg: "Участници", en: "Participants" },
  "scheme.applications": { bg: "Заявки", en: "Applications" },
  "scheme.results": { bg: "Резултати", en: "Results" },
  "scheme.skin": { bg: "Облик", en: "Skin" },

  // ── document tile ──
  "tile.notStarted": { bg: "Не е започнат", en: "Not started" },
  "tile.built": { bg: "Готов ✓", en: "Built ✓" },
  "tile.open": { bg: "Отвори ↗", en: "Open ↗" },
  "tile.fill": { bg: "Попълни ✎", en: "Fill ✎" },
  "tile.filled": { bg: "Попълнен ✓", en: "Filled ✓" },
  "tile.toFill": { bg: "За попълване", en: "To fill" },
  "tile.builtSuffix": { bg: "готови", en: "built" },

  // ── home / files pages ──
  "home.title": { bg: "Вашите схеми", en: "Your schemes" },
  "home.subtitle": { bg: "Отворете работно пространство — новите схеми се създават вътре, подредени по година.", en: "Open a workspace — new schemes are created inside, organised by year." },
  "files.emptyYears": { bg: "Все още няма схеми — създайте първия си проект.", en: "No schemes yet — create your first project." },

  // ── login ──
  "login.ownerTitle": { bg: "Вход за организатор", en: "Owner sign in" },
  "login.labTitle": { bg: "Вход за лаборатория", en: "Laboratory sign in" },
  "login.totpTitle": { bg: "Двуфакторен код", en: "Two-factor code" },
  "login.ownerSub": { bg: "ПТС България — портал на организатора. Само за организатори.", en: "PTS Bulgaria — provider portal. Owners only." },
  "login.labSub": { bg: "ПТС България — портал за лаборатории. Вижте резултатите си и изтеглете документите си.", en: "PTS Bulgaria — laboratory portal. See your results and download your documents." },
  "login.totpSub": { bg: "Въведете 6-цифрения код от приложението за удостоверяване.", en: "Enter the 6-digit code from your authenticator app." },
  "login.denied": { bg: "Този профил не е оторизиран организатор.", en: "That account isn’t an authorized owner." },
  "login.email": { bg: "Имейл", en: "E-mail" },
  "login.password": { bg: "Парола", en: "Password" },
  "login.signIn": { bg: "Вход", en: "Sign in" },
  "login.verify": { bg: "Потвърди и продължи", en: "Verify & continue" },
  "login.codeLabel": { bg: "Код за удостоверяване", en: "Authenticator code" },

  // ── new project dialog ──
  "np.new": { bg: "Нов проект", en: "New project" },
  "np.createsSchemeShort": { bg: "създава нова схема", en: "creates a new scheme" },
  "np.inPrefix": { bg: "Нов проект —", en: "New project in" },
  "np.subtitle": { bg: "Създава папка с всичките 14 документа, готови за съставяне.", en: "Creates a folder with all 14 documents ready to build." },
  "np.name": { bg: "Име на проекта", en: "Project name" },
  "np.namePlaceholder": { bg: "напр. Бетонни павета 2026", en: "e.g. Concrete Paving Blocks 2026" },
  "np.officialNumber": { bg: "Официален номер", en: "Official number" },
  "np.autoAssigned": { bg: "присвоява се автоматично · може да се редактира по-късно", en: "assigned automatically · editable later" },
  "np.object": { bg: "Обект / обхват", en: "Object / scope" },
  "np.objectPlaceholder": { bg: "напр. Бетонни павета 200 × 100 × 60 мм", en: "e.g. Concrete paving blocks 200 × 100 × 60 mm" },
  "np.create": { bg: "Създай проект", en: "Create project" },

  // ── lab portal ──
  "lab.welcomePrefix": { bg: "Добре дошли,", en: "Welcome," },
  "lab.yourCode": { bg: "Вашият код", en: "Your code" },
  "lab.mySchemes": { bg: "Моите схеми", en: "My schemes" },
  "lab.applyOpen": { bg: "+ Кандидатствай за отворена схема", en: "+ Apply to an open scheme" },
  "lab.noSchemesTitle": { bg: "Все още няма схеми", en: "No schemes yet" },
  "lab.noSchemesBody": { bg: "Когато бъдете одобрени за схема за изпитване за пригодност, тя ще се появи тук — с резултатите и документите ви.", en: "When you’re approved for a proficiency testing scheme it appears here, with your results and documents." },
  "lab.browseOpen": { bg: "Разгледай отворените схеми ↗", en: "Browse open schemes ↗" },
  "lab.yourResult": { bg: "Вашият резултат", en: "Your result" },
  "lab.awaiting": { bg: "Очакват се резултати — докладването е в процес.", en: "Awaiting results — reporting in progress." },
  "lab.finalReport": { bg: "↓ Окончателен доклад", en: "↓ Final report" },
  "lab.certificate": { bg: "↓ Сертификат", en: "↓ Certificate" },
  "lab.docsAfter": { bg: "Документите са достъпни след докладване.", en: "Documents available after reporting." },
  "lab.profile": { bg: "Профил", en: "Profile" },
  "lab.accountSecurity": { bg: "Профил и сигурност", en: "Account & security" },
  "lab.twoFactorOptional": { bg: "Двуфакторната защита е по избор за лабораториите — можете да я включите за допълнителна сигурност.", en: "Two-factor authentication is optional for labs — you can enable it for extra protection." },
  "lab.field.laboratory": { bg: "Лаборатория", en: "Laboratory" },
  "lab.field.accreditationCert": { bg: "Сертификат за акредитация", en: "Accreditation certificate" },
  "lab.field.contactPerson": { bg: "Лице за контакт", en: "Contact person" },
  "lab.field.email": { bg: "Имейл", en: "Email" },
  "lab.field.phone": { bg: "Телефон", en: "Phone" },
  "lab.field.registeredAddress": { bg: "Адрес по регистрация", en: "Registered address" },
  "verdict.ok": { bg: "Задоволителен", en: "Satisfactory" },
  "verdict.warn": { bg: "Предупреждение", en: "Warning" },
  "verdict.action": { bg: "Действие", en: "Action" },

  // ── common (more) ──
  "common.saveChanges": { bg: "Запази промените", en: "Save changes" },

  // ── lab profile ──
  "lab.backToDashboard": { bg: "Назад към таблото", en: "Back to dashboard" },
  "lab.editProfile": { bg: "Редактиране на профила", en: "Edit profile" },
  "lab.emailLogin": { bg: "Имейл (за вход)", en: "Email (login)" },
  "lab.field.labName": { bg: "Име на лабораторията", en: "Laboratory name" },
  "lab.emailNote": { bg: "Имейлът ви е вашето потребителско име и не може да се променя тук — свържете се с ПТС България, за да го обновите.", en: "Your email is your login and can’t be changed here — contact PTS Bulgaria to update it." },

  // ── new scheme ──
  "new.allSchemes": { bg: "Всички схеми", en: "All schemes" },
  "new.title": { bg: "Нова схема", en: "New scheme" },
  "new.subtitle": { bg: "Задайте основното — параметрите, датите и цените се попълват на следващия екран, а всички документи се генерират от тях.", en: "Set the basics — you’ll fill the parameters, dates and prices on the next screen, and all documents generate from them." },
  "new.identity": { bg: "Идентичност", en: "Identity" },
  "new.type": { bg: "Тип", en: "Type" },
  "new.optTesting": { bg: "Изпитване (T)", en: "Testing (T)" },
  "new.optCalibration": { bg: "Калибриране (C)", en: "Calibration (C)" },
  "new.yearYY": { bg: "Година (ГГ)", en: "Year (YY)" },
  "new.monthMM": { bg: "Месец (ММ)", en: "Month (MM)" },
  "new.sequence": { bg: "Пореден №", en: "Sequence" },
  "new.numberNote": { bg: "Номерът става напр. PTS 26/01-T-1.", en: "Number becomes e.g. PTS 26/01-T-1." },
  "new.titleObject": { bg: "Заглавие и обект", en: "Title & object" },
  "new.settings": { bg: "Настройки", en: "Settings" },
  "new.distribution": { bg: "Разпределение", en: "Distribution" },
  "new.optSimultaneous": { bg: "Едновременно (изпитване)", en: "Simultaneous (Testing)" },
  "new.optSequential": { bg: "Последователно (калибриране)", en: "Sequential (Calibration)" },
  "new.minParticipants": { bg: "Минимум участници", en: "Minimum participants" },
  "new.create": { bg: "Създай схема →", en: "Create scheme →" },

  // ── skins gallery ──
  "skins.title": { bg: "Облици на документите", en: "Document skins" },
  "skins.subtitle": { bg: "Изберете как изглеждат документите ви. Всяка схема избира свой облик — задайте облик по подразбиране за изпитване и за калибриране.", en: "Choose how your documents look. Each scheme picks its own skin — set a default for testing and for calibration." },
  "skins.new": { bg: "+ Нов облик", en: "+ New skin" },
  "skins.tabTesting": { bg: "Схеми за изпитване", en: "Testing schemes" },
  "skins.tabCalibration": { bg: "Схеми за калибриране", en: "Calibration schemes" },
  "skins.noSample": { bg: "Все още няма схема за преглед — създайте, за да видите живи прегледи.", en: "No scheme yet to preview against — create one to see live previews." },
  "skins.default": { bg: "★ По подразбиране", en: "★ Default" },
  "skins.custom": { bg: "Персонализиран", en: "Custom" },
  "skins.setDefault": { bg: "Задай по подразбиране", en: "Set as default" },
  "skins.preview": { bg: "Преглед", en: "Preview" },
  "skins.noPreview": { bg: "няма преглед", en: "no preview" },
  "skins.footer": { bg: "Обликът е външният вид на документа (корица, шрифтове, цветове, оформление). Всяка схема избира свой на страницата с документи; обликът по подразбиране се прилага към новите схеми.", en: "A skin is the document’s look (cover, fonts, colours, layout). Each scheme chooses its own on its Documents page; the default seeds new schemes." },
  "common.delete": { bg: "Изтрий", en: "Delete" },
  "common.deleting": { bg: "Изтриване…", en: "Deleting…" },
  "skins.deleteConfirm": { bg: "Да се изтрие ли обликът? Схемите, които го ползват, се връщат към „Класически“.", en: "Delete this skin? Schemes using it fall back to Classic." },

  // ── shared table columns ──
  "col.code": { bg: "Код", en: "Code" },
  "col.laboratory": { bg: "Лаборатория", en: "Laboratory" },
  "col.country": { bg: "Държава", en: "Country" },
  "col.contact": { bg: "Контакт", en: "Contact" },
  "col.status": { bg: "Статус", en: "Status" },

  // ── results & scoring ──
  "results.title": { bg: "Резултати и оценяване", en: "Results & scoring" },
  "results.subtitleTest": { bg: "Въведете резултата и неопределеността на всеки участник, както и приетата стойност, σ и нейната неопределеност. Оценките (z и ζ) се изчисляват при запис (ISO 13528) и влизат директно в Окончателния доклад.", en: "Enter each participant’s result and uncertainty, plus the assigned value, σ and its uncertainty. Scores (z and ζ) are computed on Save (ISO 13528) and flow into the Final Report." },
  "results.subtitleCal": { bg: "Въведете резултата и неопределеността на всеки участник, както и приетата (референтна) стойност. Оценките (Eₙ) се изчисляват при запис (ISO 13528) и влизат директно в Окончателния доклад.", en: "Enter each participant’s result and uncertainty, plus the assigned (reference) value. Scores (Eₙ) are computed on Save (ISO 13528) and flow into the Final Report." },
  "results.noParticipants": { bg: "Все още няма участници — добавете ги, преди да въвеждате резултати.", en: "No participants yet — add them before entering results." },
  "results.goParticipants": { bg: "Към участниците", en: "Go to Participants" },
  "results.refValue": { bg: "Референтна стойност X_ref", en: "Reference value X_ref" },
  "results.assignedValue": { bg: "Приета стойност xₚₜ", en: "Assigned value xₚₜ" },
  "results.sigma": { bg: "σ (оценка на пригодността)", en: "σ (proficiency assessment)" },
  "results.uRef": { bg: "Разширена неопределеност U_ref", en: "Expanded uncertainty U_ref" },
  "results.uXpt": { bg: "Неопределеност u(xₚₜ)", en: "Uncertainty u(xₚₜ)" },
  "results.evaluation": { bg: "Оценка", en: "Evaluation" },
  "results.gradeA": { bg: "A · задоволителен", en: "A · satisfactory" },
  "results.gradeN": { bg: "N · незадоволителен", en: "N · unsatisfactory" },
  "results.save": { bg: "Запази и преизчисли оценките", en: "Save & recompute scores" },
  "results.autoCompute": { bg: "⚙ Запази и авт. изчисли приетата (робастно)", en: "⚙ Save & auto-compute assigned (robust)" },
  "results.viewReport": { bg: "Виж Окончателния доклад →", en: "View Final Report →" },
  "results.footnote": { bg: "Оставете клетка празна, за да я пропуснете. Десетична запетая (1,5) или точка (1.5) работят и двете. Оценките се преизчисляват при всеки запис.", en: "Leave a cell blank to skip it. Decimal comma (1,5) or dot (1.5) both work. Scores recompute on every Save." },

  // ── participants ──
  "part.subtitle": { bg: "Всяка лаборатория се показва на останалите само чрез случайния си код — имената остават конфиденциални (видими тук, за вас).", en: "Each laboratory is shown to others only by its random code — names stay confidential (visible here, to you)." },
  "part.portal": { bg: "Портал", en: "Portal" },
  "part.inviteToPortal": { bg: "Покани в портала", en: "Invite to portal" },
  "part.noneYet": { bg: "Все още няма участници — добавете първия по-долу.", en: "No participants yet — add the first below." },
  "part.addTitle": { bg: "Добавяне на участник", en: "Add a participant" },
  "part.labName": { bg: "Име на лабораторията *", en: "Laboratory name *" },
  "part.contactPerson": { bg: "Лице за контакт", en: "Contact person" },
  "part.phone": { bg: "Телефон", en: "Phone" },
  "part.email": { bg: "Имейл", en: "E-mail" },
  "part.deliveryAddress": { bg: "Адрес за доставка (на обектите)", en: "Delivery address (for PT items)" },
  "part.participations": { bg: "Брой участия", en: "No. of participations" },
  "part.addButton": { bg: "＋ Добави участник (авт. код)", en: "＋ Add participant (auto-code)" },
  "part.footnote": { bg: "При добавяне автоматично се присвоява уникален случаен код — единственият идентификатор, показван в документите и публичния регистър.", en: "A unique random code is assigned automatically on add — that’s the only identifier shown in documents and the public Register." },

  // ── applications ──
  "apps.title": { bg: "Заявки", en: "Applications" },
  "apps.pending": { bg: "чакащи", en: "pending" },
  "apps.total": { bg: "общо", en: "total" },
  "apps.subtitle": { bg: "Заявки от публичната форма. Одобряването на заявка създава участник с автоматично присвоен код.", en: "Self-service applications from the public form. Approving one creates a participant with an auto-assigned code." },
  "apps.noneTitle": { bg: "Все още няма заявки", en: "No applications yet" },
  "apps.noneBody": { bg: "Лабораториите подават заявка от публичната форма; одобрените стават участници тук.", en: "Labs submit an application from the public form; approved ones become participants here." },
  "apps.openForm": { bg: "Отвори формата за заявка ↗", en: "Open the application form ↗" },
  "apps.manager": { bg: "Ръководител", en: "Manager" },
  "apps.accreditation": { bg: "Акредитация", en: "Accreditation" },
  "apps.delivery": { bg: "Доставка", en: "Delivery" },
  "apps.company": { bg: "Фирма", en: "Company" },
  "apps.regAddress": { bg: "Адрес по регистрация", en: "Reg. address" },
  "apps.requestedChars": { bg: "Заявени характеристики:", en: "Requested characteristics:" },
  "apps.approve": { bg: "✓ Одобри → създай участник", en: "✓ Approve → create participant" },
  "apps.reject": { bg: "Отхвърли", en: "Reject" },
  "appstatus.pending": { bg: "чакаща", en: "pending" },
  "appstatus.approved": { bg: "одобрена", en: "approved" },
  "appstatus.rejected": { bg: "отхвърлена", en: "rejected" },

  // ── public apply flow ──
  "apply.title": { bg: "Изпитвания за пригодност", en: "Proficiency testing" },
  "apply.openSchemes": { bg: "Отворени схеми за заявки", en: "Open schemes for applications" },
  "apply.noneOpen": { bg: "В момента няма отворени схеми за заявки.", en: "No schemes are open for applications right now." },
  "apply.object": { bg: "Обект:", en: "Object:" },
  "apply.min": { bg: "мин.", en: "min." },
  "apply.participants": { bg: "участници", en: "participants" },
  "apply.applyCta": { bg: "Заяви участие →", en: "Apply →" },
  "apply.allOpen": { bg: "← Всички отворени схеми", en: "← All open schemes" },
  "apply.notAccepting": { bg: "Тази схема не приема заявки в момента.", en: "This scheme is not accepting applications right now." },
  "apply.toOpen": { bg: "← Към отворените схеми", en: "← Open schemes" },
  "apply.thanksTitle": { bg: "Благодарим Ви!", en: "Thank you!" },
  "apply.thanksBody": { bg: "Заявката Ви е получена. Ще се свържем с Вас по имейл с потвърждение и проформа фактура.", en: "Your application has been received. We will contact you by e-mail with a confirmation and a proforma invoice." },

  // ── participant statuses ──
  "pstatus.applied": { bg: "подадена", en: "applied" },
  "pstatus.approved": { bg: "одобрен", en: "approved" },
  "pstatus.invoiced": { bg: "фактуриран", en: "invoiced" },
  "pstatus.paid": { bg: "платен", en: "paid" },
  "pstatus.dispatched": { bg: "изпратен", en: "dispatched" },
  "pstatus.received": { bg: "получен", en: "received" },
  "pstatus.submitted": { bg: "предаден", en: "submitted" },
  "pstatus.scored": { bg: "оценен", en: "scored" },

  // ── error boundary ──
  "error.title": { bg: "Възникна грешка", en: "Something went wrong" },
  "error.body": { bg: "Страницата не можа да се зареди. Опитайте отново.", en: "We couldn’t load this page. Please try again." },
  "error.tryAgain": { bg: "Опитай отново", en: "Try again" },

  // ── 2FA enrolment ──
  "totp.setup": { bg: "Настрой приложение за удостоверяване (TOTP)", en: "Set up an authenticator (TOTP)" },
  "totp.preparing": { bg: "Подготовка…", en: "Preparing…" },
  "totp.step1": { bg: "1. Сканирайте този QR с Google Authenticator / Authy / 1Password или въведете ключа ръчно.", en: "1. Scan this QR with Google Authenticator / Authy / 1Password, or enter the key manually." },
  "totp.manualKey": { bg: "Ръчен ключ:", en: "Manual key:" },
  "totp.step2": { bg: "2. Въведете 6-цифрения код за потвърждение", en: "2. Enter the 6-digit code to confirm" },
  "totp.confirm": { bg: "Потвърди и включи 2FA", en: "Confirm & enable 2FA" },

  // ── skin picker ──
  "skinpicker.saving": { bg: "запис…", en: "saving…" },

  // ── document build / preview ──
  "build.title": { bg: "Съставяне на документи", en: "Build documents" },
  "build.subtitle": { bg: "Съставете всеки документ от блокове и от библиотеката с фрагменти. Автоматичните версии също работят — това е редакторът върху тях.", en: "Compose any document yourself from blocks + your snippet library. The auto-generated versions still work too — this is the editor on top." },
  "build.started": { bg: "✎ започнат — редактирай", en: "✎ started — edit" },
  "build.compose": { bg: "＋ състави", en: "＋ compose" },
  "build.documentsWord": { bg: "документи", en: "documents" },
  "build.prefix": { bg: "Съставяне", en: "Build" },
  "doc.notGenerated": { bg: "Този документ още не се генерира — предстои.", en: "This document isn’t generated yet — coming next." },
  "doc.editSchemeData": { bg: "✎ Редактирай данните на схемата", en: "✎ Edit scheme data" },
  "dv.generating": { bg: "Генериране…", en: "Generating…" },
  "dv.generatePdf": { bg: "⬇ Генерирай PDF", en: "⬇ Generate PDF" },
  "dv.blankTemplate": { bg: "— Празен шаблон —", en: "— Blank template —" },
  "dv.issueForLab": { bg: "Издаване за конкретна лаборатория", en: "Issue for a specific laboratory" },
  "dv.certNo": { bg: "Сертификат №:", en: "Certificate №:" },
  "dv.notIssued": { bg: "— още не е издаден —", en: "— not issued yet —" },
  "dv.issueDate": { bg: "Дата на издаване:", en: "Issue date:" },
  "dv.saveDate": { bg: "Запази датата", en: "Save date" },
  "dv.issueAuto": { bg: "Издай № (авт.)", en: "Issue № (auto)" },
  "dv.pdfFailed": { bg: "Генерирането на PDF не успя: ", en: "PDF generation failed: " },
};

// "{n} schemes" / "{n} схеми" with singular/plural agreement (BG: 1 → singular).
const PLURALS: Record<string, Record<UiLang, [string, string]>> = {
  scheme: { bg: ["схема", "схеми"], en: ["scheme", "schemes"] },
  year: { bg: ["година", "години"], en: ["year folder", "year folders"] },
};
export function plural(lang: UiLang, n: number, kind: keyof typeof PLURALS): string {
  const forms = PLURALS[kind][lang];
  return `${n} ${n === 1 ? forms[0] : forms[1]}`;
}

// Translate one key for a language. Unknown keys fall back to the key itself.
export function t(lang: UiLang, key: string): string {
  const e = DICT[key];
  return e ? e[lang] : key;
}

// A bound translator: const tr = makeT(lang); tr("nav.files").
export function makeT(lang: UiLang): (key: string) => string {
  return (key: string) => t(lang, key);
}
