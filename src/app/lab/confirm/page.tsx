import { requireParticipant, participantActor } from "@/lib/participant-session";
import { openLaboratories } from "@/lib/laboratories";
import { getServerT } from "@/lib/i18n-server";
import ParticipantNav from "@/components/ParticipantNav";
import { privacyUrl, confirmDate } from "@/lib/profile-confirm-model";
import ProfileConfirmForm from "@/components/ProfileConfirmForm";
import PasswordForm from "@/components/PasswordForm";

export const dynamic = "force-dynamic";

// A profile from a PDF application (plan part 4.4, Реш. 145): the laboratory's own
// review of the data PTS entered — the legal entity, its laboratories, the user's own
// details. The profile's administrator completes and confirms it (once); a user
// completes their own details and sees the rest. At the confirmation the notice goes
// to the official e-mail (К23); the privacy section M4 is linked here (Реш. 152).
export default async function ProfileConfirmPage() {
  const { user, entity, persona } = await requireParticipant();
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const labs = await openLaboratories({ actor: participantActor(user.id), purpose: "lab.own" }, { entityId: entity.id });
  const privacy = privacyUrl();
  const admin = user.role === "admin";
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <ParticipantNav lang={lg} active="confirm" name={user.name} role={user.role} persona={persona} />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
        <h1 className="section-title" style={{ fontSize: 26, margin: "0 0 8px" }}>{L("Данните на вашата организация", "Your organisation's data")}</h1>
        {entity.confirmedAt ? (
          <div role="status" data-confirmed={entity.confirmedAt} className="card" style={{ padding: 14, marginBottom: 14, background: "var(--green-soft)" }}>
            {L(`Потвърдени на ${confirmDate(entity.confirmedAt)}${entity.confirmedBy === user.id ? " от вас" : " от администратора на профила"}. Оттогава данните са ваши — поддържате ги тук.`,
               `Confirmed on ${confirmDate(entity.confirmedAt)}${entity.confirmedBy === user.id ? " by you" : " by the profile's administrator"}. Since then the data is yours — you keep it up to date here.`)}
          </div>
        ) : (
          <div role="note" data-review-data className="card" style={{ padding: 14, marginBottom: 14, background: "#fff8e6" }}>
            {entity.origin === "pdf"
              ? L(`PTS въведе тези данни от заявката ви в PDF (${confirmDate(entity.createdAt)}). Прегледайте ги и допълнете липсващото. ${admin ? "Като администратор на профила ги потвърдете" : "Администраторът на профила ги потвърждава"} — от датата на потвърждението те са ваши.`,
                  `PTS entered this data from your PDF application (${confirmDate(entity.createdAt)}). Review it and complete what is missing. ${admin ? "As the profile's administrator, confirm it" : "The profile's administrator confirms it"} — from the date of the confirmation it is yours.`)
              : L("Прегледайте данните и допълнете липсващото.", "Review the data and complete what is missing.")}
          </div>
        )}
        <p className="text-sm" data-privacy style={{ marginBottom: 14 }}>
          {L("Как обработваме личните данни: ", "How we process personal data: ")}
          {privacy ? <a href={privacy} target="_blank" rel="noopener noreferrer">{L("раздел М4", "section M4")}</a> : <span style={{ color: "var(--muted)" }}>{L("раздел М4 (връзката предстои)", "section M4 (the link is to come)")}</span>}
        </p>
        <section className="card" style={{ padding: 20, marginBottom: 14 }} data-checked-identity>
          <h2 className="field-label" style={{ fontSize: 15 }}>{L("Юридическото лице", "The legal entity")}</h2>
          <dl className="text-sm grid gap-1" style={{ gridTemplateColumns: "minmax(140px, 200px) 1fr" }}>
            <dt style={{ color: "var(--muted)" }}>{L("Наименование", "Name")}</dt><dd>{entity.name}</dd>
            <dt style={{ color: "var(--muted)" }}>{L("ЕИК / държава", "Registration no. (ЕИК) / country")}</dt><dd>{entity.eik} · {entity.country}</dd>
            <dt style={{ color: "var(--muted)" }}>{L("ДДС", "VAT")}</dt><dd>{entity.vat || "—"}</dd>
          </dl>
          <p className="text-xs" style={{ color: "var(--muted)", marginTop: 8 }}>
            {L("Тези данни PTS проверява (VIES или документ). Ако има грешка, пишете на office@ptsbg.eu — поправката се проверява отново.",
               "PTS checks this data (VIES or a document). If something is wrong, write to office@ptsbg.eu — the correction is checked again.")}
          </p>
        </section>
        <ProfileConfirmForm lang={lg} admin={admin} confirmed={!!entity.confirmedAt}
          entity={{ correspondenceAddress: entity.correspondenceAddress, officialEmail: entity.officialEmail, mol: entity.mol, language: entity.language }}
          labs={labs.map((l) => ({ id: l.id, name: l.name, deliveryAddress: l.deliveryAddress, mobileOffice: l.mobileOffice, accreditationNo: l.accreditationNo, accreditationBody: l.accreditationBody, state: l.state }))}
          own={{ name: user.name, position: user.position, phone: user.phone, email: user.email, receivesNotices: user.receivesNotices }} />
        {!persona && (
          <div className="card" style={{ padding: 24, marginTop: 16 }} data-change-password>
            <h2 className="field-label" style={{ fontSize: 15 }}>{L("Смяна на паролата", "Change the password")}</h2>
            <PasswordForm mode="change" />
          </div>
        )}
      </main>
    </div>
  );
}
