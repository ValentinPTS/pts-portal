import { requireParticipant } from "@/lib/participant-session";
import { listJoinRequests } from "@/lib/lab-applications";
import { getServerT } from "@/lib/i18n-server";
import { confirmDate } from "@/lib/profile-confirm-model";
import ParticipantNav from "@/components/ParticipantNav";
import JoinDecision from "@/components/JoinDecision";
import { invitePreview } from "@/lib/fixed-texts";
import { testSubject } from "@/lib/environment";

export const dynamic = "force-dynamic";

// «Заявки за присъединяване» (plan part 9.1): a registration whose ЕИК is this organisation's is a
// request to join it — the profile's administrator decides it. Approved: the person becomes a user
// («поканен»), the invitation goes to their login e-mail and the official e-mail is told (К23). Refused:
// with the reason, kept six years. Only the requests to join this organisation are shown.
const DONE: Record<string, { bg: string; en: string }> = {
  "approved-sent": { bg: "Одобрено: лицето е потребител на профила — поканата за вход тръгна.", en: "Approved: the person is a user of the profile — the invitation to sign in went." },
  "approved-not-sent": { bg: "Одобрено: лицето е потребител на профила — поканата не тръгна; PTS я вижда и я изпраща.", en: "Approved: the person is a user of the profile — the invitation did not go; PTS sees it and sends it." },
  refused: { bg: "Заявката е отказана.", en: "The request is refused." },
};

export default async function JoinRequestsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { user, entity, persona } = await requireParticipant();
  const done = DONE[(await searchParams).done ?? ""];
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const admin = user.role === "admin" && user.state === "active";
  // the invitation, as it goes on «Одобри» (1.8)
  const invite = (({ subject, body, key }) => ({ subject: testSubject(subject), body, key }))(invitePreview());
  const requests = admin ? await listJoinRequests(entity.id).catch((e) => { console.error("[lab/joins]", (e as Error)?.message ?? e); return null; }) : [];
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <ParticipantNav lang={lg} active="joins" name={user.name} role={user.role} persona={persona} />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
        <h1 className="section-title" style={{ fontSize: 26, margin: "0 0 8px" }}>{L("Заявки за присъединяване", "Requests to join")}</h1>
        <p className="text-sm" style={{ color: "var(--muted)", marginBottom: 14 }}>
          {L(`Хора, които се регистрираха с ЕИК на ${entity.name}. Одобреният става потребител на профила — вижда всички лаборатории на организацията и може да подава резултати; поканата за вход тръгва към неговия e-mail, а официалният e-mail на организацията се уведомява.`,
             `People who registered with the ЕИК of ${entity.name}. An approved one becomes a user of the profile — sees all the organisation's laboratories and may submit results; the invitation goes to their e-mail, and the organisation's official e-mail is told.`)}
        </p>
        {admin && done && <div role="status" data-joins-done className="card" style={{ padding: 14, marginBottom: 12, background: "var(--green-soft)" }}>{L(done.bg, done.en)}</div>}
        {!admin && <div role="note" className="card" data-joins-admin-only style={{ padding: 14 }}>{L("Заявките решава администраторът на профила.", "The profile's administrator decides the requests.")}</div>}
        {admin && requests === null && <div role="alert" className="card" style={{ padding: 14 }}>{L("Заявките не могат да се прочетат сега — опитайте след малко.", "The requests cannot be read now — try again shortly.")}</div>}
        {admin && requests?.length === 0 && <div className="card" data-joins-none style={{ padding: 14, color: "var(--muted)" }}>{L("Няма чакащи заявки.", "No requests waiting.")}</div>}
        <div style={{ display: "grid", gap: 12 }}>
          {admin && requests?.map((a) => (
            <section key={a.id} className="card" data-join-request={a.id} style={{ padding: 14 }}>
              <div><b>{a.contactPerson}</b> · {a.email}</div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {[a.position, a.phone, a.labName && L(`лаборатория: ${a.labName}`, `laboratory: ${a.labName}`), L(`получена ${confirmDate(a.createdAt)}`, `received ${confirmDate(a.createdAt)}`)].filter(Boolean).join(" · ")}
              </div>
              <JoinDecision lang={lg} id={a.id} name={a.contactPerson} email={a.email} invite={invite} />
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
