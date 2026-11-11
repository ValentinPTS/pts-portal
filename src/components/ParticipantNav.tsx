import Link from "next/link";
import { signOutLabAction } from "@/lib/auth-actions";
import { ROLE_LABEL, type EntityUserRole } from "@/lib/entity-users-model";
import LanguageToggle from "@/components/LanguageToggle";

// The header of a participant's user's pages (plan parts 4.4–4.6, 5.5): who is signed in,
// its pages — «Начало» (the home, with each participation's own page under it), the
// organisation's data and, for its administrator, the requests to join (9.1) — the language, sign-out.
export default function ParticipantNav({ lang, active, name, role, persona }: { lang: "bg" | "en"; active: "overview" | "apply" | "catalogue" | "confirm" | "joins"; name: string; role: EntityUserRole; persona: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const tab = (href: string, on: boolean, label: string) => (
    <Link href={href} aria-current={on ? "page" : undefined} className="text-sm" style={{ fontWeight: on ? 700 : 400, color: on ? "var(--green-dark)" : "var(--muted)", borderBottom: on ? "2px solid var(--green-dark)" : "2px solid transparent", paddingBottom: 2 }}>{label}</Link>
  );
  return (
    <header className="flex items-center gap-4 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)", flexWrap: "wrap" }}>
      <span className="font-bold text-lg tracking-tight"><span style={{ color: "var(--green-dark)" }}>PTS</span> Bulgaria</span>
      {/* wraps on a phone — at 390 px «Заявки за присъединяване» was off the screen (the security sweep, UL-5) */}
      <nav className="flex gap-x-4 gap-y-1" style={{ flexWrap: "wrap", minWidth: 0 }} aria-label={L("Портал за участници", "Participant portal")} data-participant-nav>
        {tab("/lab/overview", active === "overview", L("Начало", "Home"))}
        {/* 9.2: the schemes open for applications — every user of the entity */}
        {tab("/lab/apply", active === "apply", L("Заявяване", "Apply"))}
        {tab("/lab/catalogue", active === "catalogue", L("Каталог", "Catalogue"))}
        {tab("/lab/confirm", active === "confirm", L("Данните на организацията", "The organisation's data"))}
        {/* 9.1: the requests to join the organisation — its administrator's to decide */}
        {role === "admin" && tab("/lab/joins", active === "joins", L("Заявки за присъединяване", "Requests to join"))}
      </nav>
      <span className="text-sm" style={{ marginLeft: "auto", color: "var(--muted)" }}>{name} · {L(ROLE_LABEL[role].bg, ROLE_LABEL[role].en)}</span>
      <LanguageToggle />
      {!persona && <form action={signOutLabAction}><button type="submit" className="btn btn-sm">{L("Изход", "Sign out")}</button></form>}
    </header>
  );
}
