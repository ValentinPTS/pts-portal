import { notFound } from "next/navigation";
import { AUTH_ENABLED } from "@/lib/auth";
import { getServerT } from "@/lib/i18n-server";
import { pathSteps } from "@/lib/ui-model";
import Icon from "@/components/ui/Icon";
import StepPath, { type PathStep } from "@/components/ui/StepPath";
import NextStep from "@/components/ui/NextStep";
import PageTitle from "@/components/ui/PageTitle";
import StatusPill from "@/components/ui/StatusPill";
import HelpLink from "@/components/ui/HelpLink";
import { ICONS, type IconName } from "@/lib/ui-icons";

// DEV ONLY — /dev/ui: the redesign's building blocks (R0, direction A «Пътека от стъпки») on one page, for Ivaylo's
// before/after look and for building the parts after it. Made-up data only. Not found in a production build or with
// login on — it never exists on the live portal.
export default async function UiPreview() {
  if (process.env.NODE_ENV !== "development" || AUTH_ENABLED) notFound();
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);

  const labSteps: PathStep[] = pathSteps<Omit<PathStep, "state">>([
    { key: "apply", label: L("Записахте се", "You applied"), icon: "check" },
    { key: "sample", label: L("Пробата е при вас", "The sample is with you"), icon: "box" },
    { key: "results", label: L("Въведете резултатите", "Enter the results"), icon: "pencil" },
    { key: "scoring", label: L("PTS оценява", "PTS scores"), icon: "chart" },
    { key: "cert", label: L("Сертификат", "Certificate"), icon: "award" },
  ], 2);
  const staffSteps: PathStep[] = pathSteps<Omit<PathStep, "state">>([
    { key: "prep", label: L("Подготовка", "Preparation"), icon: "doc" },
    { key: "open", label: L("Записване", "Applications"), icon: "people" },
    { key: "sent", label: L("Пробите изпратени", "Samples sent"), icon: "box" },
    { key: "results", label: L("Резултати", "Results"), icon: "pencil", note: "12/18" },
    { key: "scoring", label: L("Оценка", "Scoring"), icon: "chart" },
    { key: "report", label: L("Доклад и сертификати", "Report and certificates"), icon: "award" },
  ], 3);

  const section = (title: string) => <h2 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 600 }}>{title}</h2>;
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 64px", display: "flex", flexDirection: "column", gap: 28, fontSize: 17 }} data-ui-preview>
      <PageTitle eyebrow={L("Редизайн · част R0", "Redesign · part R0")} light={L("Градивните", "The building")} bold={L("елементи", "blocks")} sub={L("Посока A — «Пътека от стъпки». Още не са на страниците: R1 започва да ги слага.", "Direction A — a path of steps. Not on the pages yet: R1 starts putting them there.")} />

      {section(L("Цветове", "Colours"))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {[["--turn", L("Оранжево — ваш ред", "Orange — your turn")], ["--turn-ink", L("Оранжеви думи", "Orange words")], ["--done", L("Зелено — готово", "Green — done")], ["--done-ink", L("Зелени думи и бутон", "Green words and button")], ["--later-ink", L("Сиво — после", "Grey — later")], ["--ink", L("Текст", "Text")]].map(([v, name]) => (
          <div key={v} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: "var(--leaf-box)", background: "#fff" }}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: `var(${v})` }} aria-hidden="true" />
            <span><b>{name}</b><br /><code style={{ fontSize: 13 }}>{v}</code></span>
          </div>
        ))}
      </div>

      {section(L("Бутони", "Buttons"))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <a href="#" className="ui-btn ui-btn-next">{L("Въведете резултатите", "Enter the results")}<Icon name="arrowRight" size={24} strokeWidth={2.4} /></a>
        <button type="button" className="ui-btn ui-btn-main">{L("Запази", "Save")}</button>
        <button type="button" className="ui-btn">{L("Виж документите", "See the documents")}</button>
        <button type="button" className="ui-btn" disabled>{L("Не може сега", "Not now")}</button>
        <HelpLink href="#" label={L("Помощ", "Help")} />
      </div>

      {section(L("Пътеката — лаборатория", "The path — a laboratory"))}
      <div className="ui-card"><StepPath steps={labSteps} label={L("Докъде сте", "Where you are")} lang={lang} /></div>
      <StepPath steps={labSteps} label={L("Докъде сте", "Where you are")} lang={lang} compact />

      {section(L("Пътеката — екипът на PTS", "The path — the PTS team"))}
      <div className="ui-card"><StepPath steps={staffSteps} label={L("Етапи на схемата", "The scheme's stages")} lang={lang} /></div>

      {section(L("Какво следва", "What's next"))}
      <NextStep eyebrow={L("Сега", "Now")} title={L("Изпитайте пробата и въведете числата.", "Test the sample and enter the numbers.")} detail={<><Icon name="calendar" size={20} /> {L("Срок: 12 декември — остават 9 дни", "Due: 12 December — 9 days left")}</>}>
        <a href="#" className="ui-btn ui-btn-next">{L("Въведете резултатите", "Enter the results")}<Icon name="arrowRight" size={24} strokeWidth={2.4} /></a>
      </NextStep>
      <NextStep eyebrow={L("Какво следва", "What's next")} title={L("6 лаборатории още не са изпратили резултати.", "6 laboratories have not sent their results yet.")} detail={L("Срокът е 12 декември (след 9 дни).", "The due date is 12 December (in 9 days).")}>
        <a href="#" className="ui-btn">{L("Виж кои", "See which")}</a>
        <a href="#" className="ui-btn ui-btn-next">{L("Подготви напомняне", "Prepare a reminder")}</a>
      </NextStep>

      {section(L("Състояния", "States"))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <StatusPill state="turn">{L("Ваш ред: резултати", "Your turn: results")}</StatusPill>
        <StatusPill state="done">{L("Готово", "Done")}</StatusPill>
        <StatusPill state="later">{L("Чака PTS", "Waiting for PTS")}</StatusPill>
        <StatusPill state="info">{L("3 нови документа", "3 new documents")}</StatusPill>
      </div>

      {section(L("Карти", "Cards"))}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <div className="ui-card"><b style={{ fontSize: 20 }}>{L("Обикновена", "Plain")}</b><p style={{ margin: "6px 0 0", color: "#555" }}>{L("Документи, участници…", "Documents, participants…")}</p></div>
        <div className="ui-card ui-card-now"><b style={{ fontSize: 20 }}>{L("Ваш ред", "Your turn")}</b><p style={{ margin: "6px 0 0", color: "#555" }}>{L("Това чака вас.", "This waits for you.")}</p></div>
        <div className="ui-card ui-card-later"><b style={{ fontSize: 20 }}>{L("После", "Later")}</b><p style={{ margin: "6px 0 0", color: "#555" }}>{L("Не е нужно нищо от вас.", "Nothing needed from you.")}</p></div>
      </div>

      {section(L("Икони", "Icons"))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, color: "var(--done-ink)" }}>
        {(Object.keys(ICONS) as IconName[]).map((n) => (
          <span key={n} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4, width: 76, fontSize: 12, color: "#555" }}>
            <span style={{ color: "var(--done-ink)" }}><Icon name={n} size={30} /></span>{n}
          </span>
        ))}
      </div>
    </div>
  );
}
