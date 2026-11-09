import Link from "next/link";
import { signOutLabAction } from "@/lib/auth-actions";
import { ROLE_LABEL, type EntityUserRole } from "@/lib/entity-users-model";

// The header of a participant's user's pages (plan part 4.4–4.6): who is signed in, the
// two pages it has for now, sign-out.
export default function ParticipantNav({ lang, active, name, role, persona }: { lang: "bg" | "en"; active: "overview" | "confirm"; name: string; role: EntityUserRole; persona: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const tab = (href: string, on: boolean, label: string) => (
    <Link href={href} aria-current={on ? "page" : undefined} className="text-sm" style={{ fontWeight: on ? 700 : 400, color: on ? "var(--green-dark)" : "var(--muted)", borderBottom: on ? "2px solid var(--green-dark)" : "2px solid transparent", paddingBottom: 2 }}>{label}</Link>
  );
  return (
    <header className="flex items-center gap-4 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)", flexWrap: "wrap" }}>
      <span className="font-bold text-lg tracking-tight"><span style={{ color: "var(--green-dark)" }}>PTS</span> Bulgaria</span>
      <nav className="flex gap-4" aria-label={L("Портал за участници", "Participant portal")} data-participant-nav>
        {tab("/lab/overview", active === "overview", L("Участия и известия", "Participations and notices"))}
        {tab("/lab/confirm", active === "confirm", L("Данните на организацията", "The organisation's data"))}
      </nav>
      <span className="text-sm" style={{ marginLeft: "auto", color: "var(--muted)" }}>{name} · {L(ROLE_LABEL[role].bg, ROLE_LABEL[role].en)}</span>
      {!persona && <form action={signOutLabAction}><button type="submit" className="btn btn-sm">{L("Изход", "Sign out")}</button></form>}
    </header>
  );
}
