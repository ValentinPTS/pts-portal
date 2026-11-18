import Link from "next/link";
import { signOutLabAction } from "@/lib/auth-actions";
import { ROLE_LABEL, type EntityUserRole } from "@/lib/entity-users-model";
import LanguageToggle from "@/components/LanguageToggle";
import HelpLink from "@/components/ui/HelpLink";
import Icon from "@/components/ui/Icon";
import type { IconName } from "@/lib/ui-icons";

// The header of a participant's user's pages (plan parts 4.4–4.6, 5.5): who is signed in,
// its pages — «Начало» (the home, with each participation's own page under it), the
// organisation's data and, for its administrator, the requests to join (9.1) — the language, sign-out.
// The redesign (R1, direction A): big tabs, an icon beside each name, «Помощ» always there.
export default function ParticipantNav({ lang, active, name, role, persona }: { lang: "bg" | "en"; active: "overview" | "apply" | "catalogue" | "confirm" | "joins" | "help"; name: string; role: EntityUserRole; persona: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const tab = (href: string, on: boolean, label: string, icon: IconName) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={`ui-tab${on ? " is-on" : ""}`}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </Link>
  );
  return (
    <header className="ui-topbar ui-labbar" data-lab-header>
      <Link href="/lab/overview" className="ui-brand no-underline">
        <span className="ui-brand-name">PTS</span>
        <span className="ui-brand-sub">{L("Портал за лаборатории", "Laboratory portal")}</span>
      </Link>
      {/* wraps on a phone — at 390 px «Заявки за присъединяване» was off the screen (the security sweep, UL-5) */}
      <nav className="ui-tabs" aria-label={L("Портал за участници", "Participant portal")} data-participant-nav>
        {tab("/lab/overview", active === "overview", L("Начало", "Home"), "home")}
        {/* 9.2: the schemes open for applications — every user of the entity */}
        {tab("/lab/apply", active === "apply", L("Заявяване", "Apply"), "plus")}
        {tab("/lab/catalogue", active === "catalogue", L("Каталог", "Catalogue"), "list")}
        {tab("/lab/confirm", active === "confirm", L("Данните на организацията", "The organisation's data"), "building")}
        {/* 9.1: the requests to join the organisation — its administrator's to decide */}
        {role === "admin" && tab("/lab/joins", active === "joins", L("Заявки за присъединяване", "Requests to join"), "people")}
      </nav>
      <div className="ui-topbar-end">
        <HelpLink href="/lab/help" label={L("Помощ", "Help")} />
        <span className="ui-who"><Icon name="user" size={20} />{name} · {L(ROLE_LABEL[role].bg, ROLE_LABEL[role].en)}</span>
        <LanguageToggle />
        {!persona && <form action={signOutLabAction}><button type="submit" className="ui-btn ui-btn-sm">{L("Изход", "Sign out")}</button></form>}
      </div>
    </header>
  );
}
