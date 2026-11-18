import { PTS_CONTACTS } from "@/lib/doc-shell";
import Icon from "@/components/ui/Icon";
import PageTitle from "@/components/ui/PageTitle";
import type { IconName } from "@/lib/ui-icons";

// «Помощ» (the redesign, R1): how the portal works in a few plain steps, and how to reach PTS — the same contacts the
// documents print. Nothing of any scheme or laboratory: the page reads no data at all.
const LAB_STEPS: { icon: IconName; bg: [string, string]; en: [string, string] }[] = [
  { icon: "plus", bg: ["Записвате се за схема", "От «Заявяване» — изберете схемата и изпратете заявката."], en: ["You apply for a scheme", "From «Apply» — choose the scheme and send the application."] },
  { icon: "box", bg: ["Получавате обекта или уреда", "Когато пристигне, потвърдете в портала, че е при вас."], en: ["You receive the object or the device", "When it arrives, confirm in the portal that you have it."] },
  { icon: "pencil", bg: ["Въвеждате резултатите", "Изпитайте и въведете числата до срока. Можете да ги запазите и да продължите по-късно."], en: ["You enter the results", "Test, then enter the numbers by the due date. You can save them and continue later."] },
  { icon: "chart", bg: ["PTS оценява", "Не е нужно нищо от вас — ще ви пишем."], en: ["PTS scores them", "Nothing is needed from you — we will write to you."] },
  { icon: "award", bg: ["Доклад и сертификат", "Ще ги намерите в портала, при участието си."], en: ["Report and certificate", "You will find them in the portal, with your participation."] },
];
const STAFF_STEPS: { icon: IconName; bg: [string, string]; en: [string, string] }[] = [
  { icon: "doc", bg: ["Подготовка", "Схемата и документите ѝ — в «Схеми»."], en: ["Preparation", "The scheme and its documents — in «Schemes»."] },
  { icon: "people", bg: ["Записване", "Заявките на лабораториите — на страницата на схемата."], en: ["Applications", "The laboratories' applications — on the scheme's page."] },
  { icon: "truck", bg: ["Пробите изпратени", "Изпращането и получаването — в «Доставки»."], en: ["Samples sent", "Dispatch and receipt — in «Deliveries»."] },
  { icon: "pencil", bg: ["Резултати", "Лабораториите ги въвеждат; кой ги е изпратил — в «Резултати» на схемата."], en: ["Results", "The laboratories enter them; who has sent them — in the scheme's «Results»."] },
  { icon: "chart", bg: ["Оценка", "Анализът и прегледът на резултатите."], en: ["Scoring", "The analysis and the review of the results."] },
  { icon: "award", bg: ["Доклад и сертификати", "Издават се на страницата на схемата."], en: ["Report and certificates", "Issued on the scheme's page."] },
];

export default function HelpContent({ lang, audience }: { lang: "bg" | "en"; audience: "lab" | "staff" }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const steps = audience === "lab" ? LAB_STEPS : STAFF_STEPS;
  const tel = PTS_CONTACTS.phone.replace(/\s+/g, "");
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "8px 0 48px", display: "flex", flexDirection: "column", gap: 28 }} data-help>
      <PageTitle light={L("Как да ви", "How can we")} bold={L("помогнем?", "help?")} sub={L("Обадете ни се или ни пишете — или вижте по-долу как работи порталът.", "Call us or write to us — or see below how the portal works.")} />

      <section className="ui-card" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }} aria-label={L("Връзка с PTS", "Contact PTS")}>
        <a href={`tel:${tel}`} className="ui-btn ui-btn-main" data-help-phone><Icon name="phone" size={22} />{PTS_CONTACTS.phone}</a>
        <a href={`mailto:${PTS_CONTACTS.email}`} className="ui-btn" data-help-mail><Icon name="mail" size={22} />{PTS_CONTACTS.email}</a>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>{audience === "lab" ? L("Как работи участието", "How taking part works") : L("Как минава една схема", "How a scheme goes")}</h2>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {steps.map((s, i) => (
            <li key={s.icon + i} className="ui-card" style={{ display: "flex", gap: 18, alignItems: "center", padding: "18px 22px" }}>
              <span aria-hidden="true" style={{ width: 52, height: 52, flex: "0 0 52px", borderRadius: "50%", background: "var(--done-soft)", color: "var(--done-ink)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={s.icon} size={26} /></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{i + 1}. {lang === "bg" ? s.bg[0] : s.en[0]}</span>
                <span style={{ fontSize: 17, color: "#555" }}>{lang === "bg" ? s.bg[1] : s.en[1]}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>{L("Често питани", "Often asked")}</h2>
        <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 17 }}>
          <p style={{ margin: 0 }}><b>{L("Забравих паролата си.", "I forgot my password.")}</b> <a href={audience === "lab" ? "/auth/forgot?area=lab" : "/auth/forgot"}>{L("Нова парола", "A new password")}</a></p>
          <p style={{ margin: 0 }}><b>{L("Как сменям езика?", "How do I change the language?")}</b> {L("С бутоните БГ / EN горе вдясно.", "With the БГ / EN buttons at the top right.")}</p>
          <p style={{ margin: 0 }}><b>{L("Оранжевото — какво значи?", "What does orange mean?")}</b> {L("Ваш ред е. Зеленото е готово, а сивото — после, без нищо от вас.", "It is your turn. Green is done; grey is later, nothing needed from you.")}</p>
        </div>
      </section>
    </div>
  );
}
