import Link from "next/link";
import { requireCap } from "@/lib/access";
import { getServerT } from "@/lib/i18n-server";
import { systemCheck } from "@/lib/system-check";
import { AUTH_ENABLED, REQUIRE_2FA } from "@/lib/auth";
import { ONLINE_APPLICATIONS_OPEN } from "@/lib/online-applications";
import { mailSetup } from "@/lib/mail";
import { portalEnvironment } from "@/lib/environment";
import SystemTestMail from "@/components/SystemTestMail";
import { journalHealth } from "@/lib/activity";
import { releaseFor, registerHealth } from "@/lib/change-register";
import { EXTERNAL_SERVICES } from "@/lib/processors";

export const dynamic = "force-dynamic";

// «Проверка на системата» (part 1.1) — manager only, read-only. Is the database
// there, does it have every migration this code expects, do the storage buckets
// exist, which switches are on. Secrets are never shown — only whether one is set.
export default async function SystemPage() {
  await requireCap("system.technical"); // the software administrator and the head (2.4)
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const c = await systemCheck({
    authEnabled: AUTH_ENABLED,
    require2fa: REQUIRE_2FA,
    internalToken: !!process.env.INTERNAL_TOKEN, // set or not — never the value
    onlineApplications: ONLINE_APPLICATIONS_OPEN,
  });

  const chip = (ok: boolean | null, yes: string, no: string, neutral = L("няма данни", "no data")) => (
    <span
      className="text-xs font-bold rounded px-2 py-0.5"
      style={ok === null
        ? { background: "#eef1ee", color: "#666" }
        : ok ? { background: "#e3eeda", color: "#456b2c" } : { background: "#fbeeee", color: "#8f2f2f" }}
    >
      {ok === null ? neutral : ok ? yes : no}
    </span>
  );
  const row = (label: string, value: React.ReactNode, note?: string) => (
    <tr key={label} style={{ borderTop: "1px solid var(--line)" }}>
      <td className="p-2" style={{ width: "38%" }}>{label}</td>
      <td className="p-2">{value}{note && <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{note}</div>}</td>
    </tr>
  );
  const local = !c.db.configured && !c.db.production;
  // the portal's mail and address (part 1.7) — the key never, only whether it is set
  const mail = mailSetup();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  const realPortal = portalEnvironment() === "production";
  const PORTAL = "https://portal.ptsbg.eu";
  const journal = journalHealth();
  const register = registerHealth();
  // where the server runs (part 1.12): Vercel names the region of this function
  const region = (process.env.VERCEL_REGION ?? "").trim();
  const euRegion = /^(fra|cdg|arn|dub)\d/.test(region); // Frankfurt, Paris, Stockholm, Dublin — London (lhr1) is not the EU
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").toLowerCase();
  const release = sha ? await releaseFor(sha).catch(() => null) : null;

  return (
    <div className="max-w-3xl">
      <Link href="/users" className="text-sm" style={{ color: "var(--muted)" }}>← {L("Потребители", "Users")}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>{L("Проверка на системата", "System check")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {L("Само за четене. Тайните ключове не се показват — само дали са зададени.", "Read-only. Secret keys are never shown — only whether they are set.")}
      </p>

      <section className="card mt-4 overflow-hidden" data-system="db">
        <h2 className="p-2 font-bold" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{L("База данни", "Database")}</h2>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><tbody>
          {row(L("За коя среда е кодът", "Which portal the code is for"),
            c.environment.code === "production"
              ? chip(true, L("истинският портал", "the real portal"), "")
              : <span className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#fbe9dc", color: "#7a2e0e" }}>{L("ТЕСТОВА СРЕДА", "TEST ENVIRONMENT")}</span>)}
          {row(L("Какво казва базата", "What the database says"),
            c.environment.database === null
              ? chip(null, "", "", c.db.configured ? L("не казва (миграция 0019)", "says nothing (migration 0019)") : L("няма база", "no database"))
              : chip(c.environment.database === c.environment.code, c.environment.database, L(`${c.environment.database} — не съвпада!`, `${c.environment.database} — does not match!`)),
            L("Ако не съвпадат, ключовете сочат към чужда база: на Vercel публикуването спира, а тестовият сървър не тръгва.", "If they differ, the keys point at the other portal's database: on Vercel deploying stops, and a test server does not start."))}
          {row(L("Свързана", "Connected"), chip(c.db.error ? false : c.db.configured, L("да", "yes"), L("не", "no")),
            c.db.error ?? (local ? L("Локално, в паметта — всичко изчезва при рестарт.", "Local, in memory — everything goes on a restart.") : undefined))}
          {row(L("Резервна памет при грешка", "Memory fallback on an error"),
            !c.db.configured
              ? chip(false, "", L("работи изцяло в паметта", "running entirely in memory"))
              : chip(!c.db.strict, L("позволена (локално)", "allowed (local)"), L("изключена", "off")),
            !c.db.configured
              ? L("Няма база данни — всичко е в паметта и изчезва при рестарт.", "No database — everything is in memory and goes on a restart.")
              : c.db.strict ? L("На сървъра грешка в базата е грешка — нищо не се пази «временно» в паметта.", "On the server a database error is an error — nothing is kept «for now» in memory.") : undefined)}
        </tbody></table>
      </section>

      <section className="card mt-4 overflow-hidden" data-system="migrations">
        <h2 className="p-2 font-bold" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{L("Миграции", "Migrations")}</h2>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><tbody>
          {row(L("Очаквани от кода", "Expected by the code"), <b>{c.migrations.expected}</b>)}
          {row(L("Записани в базата", "Recorded in the database"),
            c.migrations.applied === null ? chip(null, "", "", c.migrations.error ?? L("няма база", "no database")) : <b>{c.migrations.applied}</b>)}
          {row(L("Липсват", "Missing"),
            c.migrations.applied === null && !c.migrations.error
              ? chip(null, "", "")
              : c.migrations.missing.length
                ? <span data-missing>{chip(false, "", L(`${c.migrations.missing.length} — пуснете ги по ред`, `${c.migrations.missing.length} — apply them in order`))}<ul className="mt-1 font-mono text-xs">{c.migrations.missing.map((m) => <li key={m}>{m}.sql</li>)}</ul></span>
                : chip(true, L("няма", "none"), ""),
            L("Ако липсва миграция, публикуването на сайта спира, докато не я пуснете в Supabase.", "If a migration is missing, deploying stops until you apply it in Supabase."))}
        </tbody></table>
      </section>

      <section className="card mt-4 overflow-hidden" data-system="buckets">
        <h2 className="p-2 font-bold" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{L("Хранилища за файлове", "File buckets")}</h2>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><tbody>
          {c.buckets.map((b) => row(b.name,
            b.exposed
              ? <span data-bucket-public={b.name}>{chip(false, "", L("ПУБЛИЧЕН — направете го частен в Supabase", "PUBLIC — make it private in Supabase"))}</span>
              : chip(b.exists, L("има го", "exists"), L("още го няма", "not yet")),
            b.name === "doc-editions" && b.exists === false ? L("Създава се при първата издадена редакция.", "Created when the first edition is issued.")
              : b.name === "analysis-exports" && b.exists === false ? L("Създава се при първото изнасяне към 2.0 по време на обработката.", "Created at the first export to 2.0 during processing.")
              : b.name === "validation-docs" && b.exists === false ? L("Създава се при първите записани критерии за приемане.", "Created when the first acceptance criteria are recorded.") : undefined))}
        </tbody></table>
      </section>

      <section className="card mt-4 overflow-hidden" data-system="flags">
        <h2 className="p-2 font-bold" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{L("Настройки", "Switches")}</h2>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><tbody>
          {row(L("Вход с парола", "Sign-in required"), chip(c.flags.authEnabled, L("включен", "on"), L("изключен", "off")))}
          {row(L("Двуфакторна защита", "Two-factor"), chip(c.flags.require2fa, L("задължителна", "required"), L("по избор", "optional")))}
          {row("INTERNAL_TOKEN", chip(c.flags.internalToken, L("зададен", "set"), L("не е зададен", "not set")),
            L("Нужен е за PDF на сървъра.", "Needed for PDFs on the server."))}
          {row(L("Онлайн заявки", "Online applications"), chip(!c.flags.onlineApplications, L("затворени (по PDF)", "closed (by PDF)"), L("отворени", "open")))}
          {row(L("Версия на портала", "The portal's release"),
            sha
              ? <span data-release><span className="font-mono text-xs">{sha.slice(0, 12)}</span> {chip(!!release, L("в регистъра", "in the register"), L("НЕ е в регистъра", "NOT in the register"))}</span>
              : chip(null, "", "", L("локално — без commit", "local — no commit")),
            L("Всяка версия, обновяване и настройка — в «Регистър на промените» (Реш. 67).", "Every release, update and setting — in the change register (Decision 67)."))}
          {row(L("Регистър на промените", "Change register"), <span data-register-health><Link href="/changes" className="text-sm" style={{ color: "var(--green-dark)", fontWeight: 700 }}>{L("Отвори", "Open")} →</Link> {register.failures ? chip(false, "", L(`${register.failures} настройки НЕ са записани — последната: ${register.last ?? ""}`, `${register.failures} settings NOT recorded — the last: ${register.last ?? ""}`)) : null}</span>)}
          {row(L("Неуспешни записи в дневника", "Journal entries that failed"),
            <span data-journal-health>{chip(journal.failures === 0, L("няма", "none"), L(`${journal.failures} — последният: ${journal.lastAction ?? ""}`, `${journal.failures} — the last: ${journal.lastAction ?? ""}`))}</span>,
            L("Само на тази инстанция на сървъра, от пускането ѝ — на Vercel инстанциите са много. Всеки неуспешен запис е и в логовете на Vercel: търсете «journal entry NOT written» (1.9).", "This server instance only, since it started — on Vercel there are many. Every failed entry is also in Vercel's logs: search for «journal entry NOT written» (1.9)."))}
        </tbody></table>
      </section>

      <section className="card mt-4 overflow-hidden" data-system="mail">
        <h2 className="p-2 font-bold" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{L("Поща и адрес", "Mail and address")}</h2>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><tbody>
          {row(L("Доставчик на пощата", "Mail provider"),
            mail.provider && !mail.provider.startsWith("unknown")
              ? chip(mail.keySet, mail.provider, L(`${mail.provider} — няма ключ`, `${mail.provider} — no key`))
              : chip(false, "", mail.provider ? L("непознат — нищо не се праща (само resend или sendgrid)", "unknown — nothing is sent (resend or sendgrid only)") : L("няма — нищо не се праща", "none — nothing is sent")),
            L("Ключът не се показва — само дали е зададен.", "The key is never shown — only whether it is set."))}
          {row(L("Подател", "Sender"),
            mail.from
              ? <span data-mail-from><span className="font-mono text-xs">{mail.from}</span> {chip(mail.fromOnPtsbg, L("на ptsbg.eu", "on ptsbg.eu"), L("друг домейн — само временно", "another domain — temporary only"))}</span>
              : chip(false, "", L("не е зададен", "not set")),
            L("Подписан от ptsbg.eu след записите, които Антон добавя (1.7). Дотогава — един потвърден адрес (SendGrid).", "Signed by ptsbg.eu once Антон adds the records (1.7). Until then — one verified address (SendGrid)."))}
          {row(L("Отговорите отиват до", "Replies go to"),
            !mail.replyTo
              ? chip(null, "", "", L("до подателя", "to the sender"))
              : mail.replyToValid
                ? <span className="font-mono text-xs">{mail.replyTo}</span>
                : chip(false, "", L("невалиден адрес — отговорите отиват до подателя", "not a valid address — replies go to the sender")))}
          {row(L("Известия за PTS", "Notices for PTS"),
            mail.notifyInbox ? <span className="font-mono text-xs">{mail.notifyInbox}</span> : chip(false, "", L("не е зададен — PTS не получава имейл", "not set — PTS gets no e-mail")))}
          {row(L("Адрес на портала", "The portal's address"),
            siteUrl
              ? <span data-site-url><span className="font-mono text-xs">{siteUrl}</span> {realPortal ? chip(siteUrl === PORTAL, L("окончателният", "the final one"), L(`засега — окончателният е ${PORTAL}`, `for now — the final one is ${PORTAL}`)) : null}</span>
              : chip(local ? null : false, "", L("не е зададен", "not set"), L("локално — от заявката", "local — from the request")),
            L("От него се правят връзките в имейлите (NEXT_PUBLIC_SITE_URL). Смяната към portal.ptsbg.eu е при Gate B.", "Links in e-mails are made from it (NEXT_PUBLIC_SITE_URL). The switch to portal.ptsbg.eu is at Gate B."))}
          {row(L("Пробно писмо", "Test e-mail"),
            <SystemTestMail lang={lang} enabled={c.flags.authEnabled} />,
            L("Отива само до вашия адрес. Записва се в дневника.", "Goes to your own address only. Journalled."))}
        </tbody></table>
      </section>

      <section className="card mt-4 overflow-hidden" data-system="processors">
        <h2 className="p-2 font-bold" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{L("Обработващи данни (M4 §7)", "Processors (M4 §7)")}</h2>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><tbody>
          {row(L("Къде работи сървърът", "Where the server runs"),
            region ? chip(euRegion, region, L(`${region} — извън ЕС`, `${region} — outside the EU`)) : chip(null, "", "", L("локално", "local")),
            L("Регионът на функциите във Vercel. Препоръчително в ЕС, до базата (напр. fra1).", "The functions' region on Vercel. Recommended in the EU, next to the database (e.g. fra1)."))}
          {EXTERNAL_SERVICES.map((sv) => row(sv.name,
            <span data-processor={sv.key}>
              {chip(sv.role === "processor" ? null : true, sv.role === "independent" ? L("самостоятелен", "independent") : L("без лични данни", "no personal data"), "", L("обработващ", "processor"))}
              <span className="text-xs"> {sv.purpose}</span>
            </span>,
            `${sv.location}${sv.note ? ` — ${sv.note}` : ""}`))}
        </tbody></table>
      </section>

      <section className="card mt-4 overflow-hidden" data-system="identity">
        <h2 className="p-2 font-bold" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{L("Хранилище на самоличността", "The identity store")}</h2>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><tbody>
          {(() => {
            const h = c.identity;
            const noDb = chip(null, "", "", L("без база", "no database"));
            if (h && "missing" in h) {
              return row(L("Хранилището", "The store"), <span data-identity-missing>{chip(false, "", L("няма — пуснете 0024 и 0025", "missing — apply 0024 and 0025"))}</span>);
            }
            const auditOn = !!h && h.pgaudit && ["authenticator", "postgres"].every((r) => h.audited.includes(r)) && h.session === "identity_auditor";
            return <>
              {row(L("Имената — отделно от кодовете", "Names apart from the codes"),
                !h ? noDb : <span data-identity-store>{
                  !h.store ? chip(false, "", L("не — пуснете 0024", "no — apply 0024"))
                  : h.moved ? chip(true, L("да", "yes"), "")
                  // expanded, not yet contracted: the old columns still hold a copy
                  : chip(false, "", L("копирани; старите колони още са там — пуснете 0027 СЛЕД качването", "copied; the old columns are still there — apply 0027 AFTER the deployment"))}</span>,
                L("Кой стои зад кода е в схема, затворена за API; порталът я отваря само през функции, които записват всяко отваряне (Н1).", "Who is behind a code is in a schema closed to the API; the portal opens it only through functions that record every opening (Н1)."))}
              {row(L("Одит на базата (pgaudit)", "Database audit (pgaudit)"),
                !h ? noDb : <span data-pgaudit>{chip(auditOn, L("включен", "on"), L("не — пуснете 0025 (или изчакайте нова връзка)", "no — apply 0025 (or wait for a new connection)"))}{h.audited.length ? <span className="font-mono text-xs"> {h.audited.join(", ")}</span> : null}</span>,
                L("Четене през SQL редактора или API оставя запис в лога на базата (Реш. 142). Логът се пази ограничено време — сваляйте го редовно (IDENTITY-STORE-BG.md).", "A read through the SQL editor or the API leaves a record in the database log (Реш. 142). The log is kept for a limited time — download it regularly (IDENTITY-STORE-BG.md)."))}
            </>;
          })()}
        </tbody></table>
      </section>

      <section className="card mt-4 overflow-hidden" data-system="people">
        <h2 className="p-2 font-bold" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{L("Хора", "People")}</h2>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><tbody>
          {row(L("Ръководител на доставчика", "Head of the PT provider"),
            c.people.heads.length
              ? <span data-heads>{chip(c.people.headsNamed, L("посочен", "named"), L("не е посочен — засега основателите", "not named — the founders for now"))}<ul className="mt-1 font-mono text-xs">{c.people.heads.map((h) => <li key={h}>{h}</li>)}</ul></span>
              : chip(false, "", L("няма", "nobody")),
            L("Само той нулира двуфакторната защита на друг човек (Реш. 95). Задава се в PROVIDER_HEAD_EMAILS.", "Only the head resets another person's two-factor sign-in (Реш. 95). Set in PROVIDER_HEAD_EMAILS."))}
          {row(L("Общ адрес сред основателите", "A shared address among the founders"),
            c.people.sharedInOwners.length
              ? <span data-shared-owner>{chip(false, "", L("да — не дава достъп, махнете го", "yes — it grants nothing, remove it"))}<ul className="mt-1 font-mono text-xs">{c.people.sharedInOwners.map((h) => <li key={h}>{h}</li>)}</ul></span>
              : chip(true, L("няма", "none"), ""),
            L("Всеки влиза с личния си адрес; общият (office@) не е човек и не влиза (Реш. 139).", "Everyone signs in with a personal address; the shared one (office@) is not a person and cannot sign in (Реш. 139)."))}
          {row(L("Общ адрес като служител или лаборатория", "A shared address as a team member or laboratory"),
            c.people.sharedAccounts.length
              ? <span data-shared-account>{chip(false, "", L("да — деактивирайте го в «Потребители»", "yes — deactivate it in «Users»"))}<ul className="mt-1 font-mono text-xs">{c.people.sharedAccounts.map((h, i) => <li key={`${h}-${i}`}>{h}</li>)}</ul></span>
              : chip(true, L("няма", "none"), ""),
            L("Създаден преди правилото; с него вече не се влиза.", "Made before the rule; it can no longer sign in."))}
          {row(L("Администратор на софтуера", "Software administrator"),
            c.people.softwareAdmins === null ? chip(null, "", "")
              : c.people.softwareAdmins.length
                ? <span data-software-admin>{chip(true, L("посочен", "named"), "")}<ul className="mt-1 font-mono text-xs">{c.people.softwareAdmins.map((h) => <li key={h}>{h}</li>)}</ul></span>
                : <span data-no-software-admin>{chip(false, "", L("няма — никой не може да предложи версия", "none — nobody can propose a release"))}</span>,
            L("Той предлага промяна, ръководителят я разрешава (1.11). Задава се в «Потребители» на член на екипа, не на основател.", "They propose a change, the head authorises it (1.11). Set in «Users» on a team member, not a founder."))}
          {row(L("Схеми без Заповед (без ръководител на схемата)", "Schemes with no Order (no scheme manager)"),
            c.people.schemesWithoutOrder.length
              ? <span data-no-order>{chip(false, "", L("да — възложете ролите в «Потребители»", "yes — assign the roles in «Users»"))}<ul className="mt-1 font-mono text-xs">{c.people.schemesWithoutOrder.map((n) => <li key={n}>{n}</li>)}</ul></span>
              : chip(true, L("няма", "none"), ""),
            L("Схемата се работи от ролите в нейната Заповед: без ръководител на схемата никой не я редактира, не изпраща документи и не одобрява (2.4).", "A scheme is worked on by the roles of its Order: with no scheme manager nobody edits it, sends its documents or approves (2.4)."))}
          {row(L("Схеми без определени обработка, преглед и одобряване", "Schemes with no one designated to process, review and approve"),
            c.people.schemesWithoutProcessing.length
              ? <span data-no-processing>{chip(false, "", L("да — определете ги на страницата на схемата", "yes — designate them on the scheme's page"))}<ul className="mt-1 font-mono text-xs">{c.people.schemesWithoutProcessing.map((n) => <li key={n}>{n}</li>)}</ul></span>
              : chip(true, L("няма", "none"), ""),
            L("По П 7.4.1, т. 3: обработва експертът по статистика или технически експерт, преглежда отговорникът по качеството или упълномощено лице, одобрява ръководителят на схемата (Реш. 140).", "Per П 7.4.1 т. 3: the statistics or a technical expert processes, the quality manager or an authorised person reviews, the scheme manager approves (Реш. 140)."))}
          {row(L("Определяния, които вече не важат", "Designations that no longer hold"),
            c.people.processingStale.length
              ? <span data-processing-stale>{chip(false, "", L("да — някой от тримата вече няма ролята; определете отново", "yes — one of the three no longer holds the role; designate again"))}<ul className="mt-1 font-mono text-xs">{c.people.processingStale.map((n) => <li key={n}>{n}</li>)}</ul></span>
              : chip(true, L("няма", "none"), ""),
            L("Роля от Заповедта е прекратена след определянето — например човекът е деактивиран.", "A role from the Order ended after the designation — for example, the person was deactivated."))}
          {row(L("С роля, без декларация Ф 4.2-1", "With a role, no declaration Ф 4.2-1"),
            c.people.rolesWithoutDeclaration.length
              ? <span data-no-declaration>{chip(false, "", L("да — запишете я в «Потребители»", "yes — record it in «Users»"))}<ul className="mt-1 font-mono text-xs">{c.people.rolesWithoutDeclaration.map((h) => <li key={h}>{h}</li>)}</ul></span>
              : chip(true, L("няма", "none"), ""),
            L("Всеки, който работи с данните на PTS, е подписал декларацията за конфиденциалност (ISO/IEC 17043, т. 4.2; Ф 4.2-1).", "Everyone who works with PTS's data has signed the confidentiality declaration (ISO/IEC 17043 §4.2; Ф 4.2-1)."))}
          {row(L("Ръководителят и администраторът — един човек", "The head and the software administrator — one person"),
            c.people.headAdmins.length
              ? <span data-head-admin>{chip(false, "", L("да — махнете едната роля", "yes — remove one of the roles"))}<ul className="mt-1 font-mono text-xs">{c.people.headAdmins.map((h) => <li key={h}>{h}</li>)}</ul></span>
              : chip(true, L("не", "no"), ""),
            L("Администраторът предлага промяна, ръководителят я разрешава — не един и същ човек (П 7.4.1 т. 3). Докато е така, този човек няма правата на ръководителя.", "The administrator proposes a change, the head authorises it — never the same person (П 7.4.1 т. 3). Until fixed, that person does not have the head's rights."))}
        </tbody></table>
      </section>
    </div>
  );
}
