import { requireSection } from "@/lib/access";
import EntityForms from "@/components/EntityForms";
import LaboratoryForms from "@/components/LaboratoryForms";
import EntityUserForms from "@/components/EntityUserForms";
import { openEntityUsers } from "@/lib/entity-users";
import { openLaboratories } from "@/lib/laboratories";
import { getServerT } from "@/lib/i18n-server";
import { actorNow } from "@/lib/identities";
import { openEntities } from "@/lib/entities";
import { entityChecked, STATE_LABEL } from "@/lib/entities-model";
import { invitePreview, officialNoticePreviews, ADMIN_CHANGED_KEY } from "@/lib/fixed-texts";
import { testSubject } from "@/lib/environment";
import { confirmDate } from "@/lib/profile-confirm-model";
import { latestOutcomeByEntity, failedLatestByEntity } from "@/lib/sent-messages";
import ResendNoticeButton, { ResendOfficialNoticeButton } from "@/components/ResendNoticeButton";
import { OFFICIAL_NOTICE_KINDS_91, OFFICIAL_NOTICE_LABEL } from "@/lib/registration-model";
import EraseEntityForm from "@/components/EraseEntityForm";
import { canManagePeople } from "@/lib/roles";
import MessageComposer from "@/components/MessageComposer";
import { sendEntityMessageAction } from "@/lib/actions";
import { listEntityMessages } from "@/lib/notifications";
import { fmtMoment } from "@/lib/scheme-dates";
import { messageBody } from "@/lib/messages-model";

// «Организации и лаборатории» (plan part 2.7; the legal entities built in 4.1; the
// laboratories and their users come in 4.2–4.3). The people of the laboratories —
// labs.manage (2.4). Every opening of the entities is on record (lib/entities).
export const dynamic = "force-dynamic";

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ entity?: string; msg?: string }> }) {
  await requireSection("organizations");
  const sp = await searchParams;
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const actor = await actorNow();
  // the erasure on request is the head of the PT provider's (4.7)
  const managesPeople = await canManagePeople();
  const entities = await openEntities({ actor, purpose: "names.view" });
  // their laboratories (4.2) — opened on record too, at once
  const labs = entities.length ? await openLaboratories({ actor, purpose: "names.view" }) : [];
  // and their users (4.3)
  const users = entities.length ? await openEntityUsers({ actor, purpose: "names.view" }) : [];
  // the notice of each confirmation (К23) — did it go (4.4 review)
  const notices = entities.some((e) => e.confirmedAt) ? await latestOutcomeByEntity("profile.confirmed") : new Map<string, string>();
  // 9.1's notices to the official e-mail whose latest attempt did not go — a read that fails shows none
  const failedNotices = entities.length ? await failedLatestByEntity(OFFICIAL_NOTICE_KINDS_91).catch(() => new Map<string, { id: string; kind: string; sentAt: string }[]>()) : new Map<string, { id: string; kind: string; sentAt: string }[]>();
  // the invitation, as the person sees it before «Изпрати» (1.8; 4.4)
  const invite = (({ subject, body, key }) => ({ subject: testSubject(subject), body, key }))(invitePreview());
  // the notice of an administrator's appointment (9.1, К23) — its exact text before «Назначи» (1.8)
  const appoint = (({ subject, body, textKey }) => ({ subject: testSubject(subject), body, key: textKey }))(officialNoticePreviews().find((n) => n.key === ADMIN_CHANGED_KEY)!);
  // 5.10: the one-way messages to each organisation — its history (the notices that name it)
  const sentTo = new Map<string, Awaited<ReturnType<typeof listEntityMessages>>>();
  for (const n of entities.length ? await listEntityMessages().catch(() => []) : []) sentTo.set(n.entityId!, [...(sentTo.get(n.entityId!) ?? []), n]);
  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Юридически лица", "Legal entities")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 780 }}>
        {L("Първото от трите нива: юридическото лице (ЕИК, ДДС, адрес за кореспонденция, МОЛ), неговите лаборатории и техните потребители. Цената и отстъпката се смятат на ниво юридическо лице. Проверява се: ЕИК по контролната цифра, ДДС във VIES или с приложен документ, и проверка от PTS; активно става след нея. Нищо не се изтрива — освен профил без участия, по искане (Задание §10).",
           "The first of the three levels: the legal entity (ЕИК, VAT, address for correspondence, МОЛ), its laboratories and their users. The price and the discount are computed for the legal entity. Checked: the ЕИК by its check digit, the VAT in VIES or by an attached document, and PTS's own check; it becomes active after it. Nothing is deleted — but a profile with no participation, on request (Zadanie §10).")}
      </p>
      {entities.length === 0 && <div className="card p-4 mt-4" data-entities-none style={{ color: "var(--muted)" }}>{L("Няма въведени юридически лица.", "No legal entities entered.")}</div>}
      <div className="grid gap-4 mt-4">
        {entities.map((e) => {
          const ch = entityChecked(e);
          // erased on request (4.7): nothing of it left to show or change
          if (e.erasedAt) return (
            <div key={e.id} className="card p-3" data-entity={e.id} data-erased={e.erasedAt} style={{ color: "var(--muted)" }}>
              {L(`Изтрито по искане вх. № ${e.eraseRequestNo ?? "—"} от ${e.eraseRequestDate ? e.eraseRequestDate.split("-").reverse().join(".") : "—"}, на ${confirmDate(e.erasedAt)} — профил без участия (Задание §10).`, `Erased on request no. ${e.eraseRequestNo ?? "—"} of ${e.eraseRequestDate ? e.eraseRequestDate.split("-").reverse().join(".") : "—"}, on ${confirmDate(e.erasedAt)} — a profile with no participation (Zadanie §10).`)}
            </div>
          );
          return (
            <div key={e.id} className="card p-4" data-entity={e.id}>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                <span className="font-bold" style={{ color: "var(--green-dark)" }}>{e.name}</span>
                <span className="text-xs" data-entity-state={e.state} style={{ marginLeft: "auto", fontWeight: 700, color: e.state === "active" ? "var(--green-dark)" : "var(--muted)" }}>● {L(STATE_LABEL[e.state].bg, STATE_LABEL[e.state].en)}</span>
              </div>
              <dl className="text-sm mt-2 grid gap-1" style={{ gridTemplateColumns: "minmax(140px, 200px) 1fr" }}>
                <dt style={{ color: "var(--muted)" }}>{L("ЕИК / държава", "ЕИК / country")}</dt><dd>{e.eik} · {e.country}</dd>
                <dt style={{ color: "var(--muted)" }}>{L("ДДС", "VAT")}</dt><dd data-vies-status={e.vies?.status ?? ""}>{e.vat || "—"}{e.vies && <> · VIES: {e.vies.status === "valid" ? L("валиден", "valid") : e.vies.status === "invalid" ? L("невалиден", "invalid") : L("недостъпен", "unavailable")}{e.vies.name ? ` (${e.vies.name})` : ""}</>}</dd>
                <dt style={{ color: "var(--muted)" }}>{L("Адрес за кореспонденция", "Address for correspondence")}</dt><dd>{e.correspondenceAddress}</dd>
                <dt style={{ color: "var(--muted)" }}>{L("Официален e-mail", "Official e-mail")}</dt><dd data-official-email>{e.officialEmail || "—"}</dd>
                <dt style={{ color: "var(--muted)" }}>МОЛ</dt><dd>{e.mol || "—"}</dd>
                <dt style={{ color: "var(--muted)" }}>{L("Език", "Language")}</dt><dd>{e.language === "bg" ? L("български", "Bulgarian") : L("английски", "English")}</dd>
                {(e.proofHistory?.length ?? 0) > 1 && (<>
                  <dt style={{ color: "var(--muted)" }}>{L("Предишни документи", "Earlier documents")}</dt>
                  <dd data-proof-history>{e.proofHistory!.slice(0, -1).map((h, k) => <a key={k} href={`/organizations/proof/${e.id}?n=${k + 1}`} target="_blank" rel="noopener" style={{ marginRight: 8 }}>№ {k + 1} · {h.at.slice(0, 10).split("-").reverse().join(".")}</a>)}</dd>
                </>)}
                <dt style={{ color: "var(--muted)" }}>{L("Произход", "Origin")}</dt>
                <dd data-origin={e.origin} data-confirmed-at={e.confirmedAt ?? ""}>
                  {e.origin === "pdf" ? L("заявка в PDF (въведена от PTS)", "a PDF application (entered by PTS)") : L("регистрация в портала", "registered in the portal")}
                  {" · "}
                  {e.confirmedAt
                    ? <>
                        <b style={{ color: "var(--green-dark)" }}>{L(`потвърдено от лабораторията на ${confirmDate(e.confirmedAt)} — данните са нейни; поправка от PTS се отбелязва в журнала`, `confirmed by the laboratory on ${confirmDate(e.confirmedAt)} — the data is the laboratory's; a correction by PTS is marked in the journal`)}</b>
                        <span className="text-xs" data-notice-outcome={notices.get(e.id) ?? "none"} style={{ display: "block", marginTop: 2, color: notices.get(e.id) === "sent" ? "var(--green-dark)" : "#8f2f2f" }}>
                          {L("Уведомление до официалния e-mail (К23): ", "Notice to the official e-mail (К23): ")}
                          {notices.get(e.id) === "sent" ? L("изпратено", "sent") : notices.get(e.id) === "pending" ? L("чака отговор от пощата", "awaiting the mail's answer") : L("не е изпратено", "not sent")}
                          {notices.get(e.id) !== "sent" && e.state !== "inactive" && <> <ResendNoticeButton entityId={e.id} lang={lg} /></>}
                        </span>
                      </>
                    : e.origin === "portal"
                      ? <span style={{ color: "var(--muted)" }}>{L("данните са на лабораторията — регистрира се сама (9.1)", "the data is the laboratory's — it registered itself (9.1)")}</span>
                      : <span style={{ color: "var(--muted)" }}>{L("чака потвърждение от администратора на профила", "awaiting the confirmation of the profile's administrator")}</span>}
                  {/* 9.1: a notice to the official e-mail that did not go — sent again from here */}
                  {e.state !== "inactive" && (failedNotices.get(e.id) ?? []).map((n) => (
                    <span key={n.id} style={{ display: "block", marginTop: 2 }}><ResendOfficialNoticeButton messageId={n.id} lang={lg} label={L(`Уведомление до официалния e-mail (${OFFICIAL_NOTICE_LABEL[n.kind as keyof typeof OFFICIAL_NOTICE_LABEL]?.bg ?? n.kind}, ${confirmDate(n.sentAt)})`, `Notice to the official e-mail (${OFFICIAL_NOTICE_LABEL[n.kind as keyof typeof OFFICIAL_NOTICE_LABEL]?.en ?? n.kind}, ${confirmDate(n.sentAt)})`)} /></span>
                  ))}
                </dd>
                <dt style={{ color: "var(--muted)" }}>{L("Проверка от PTS", "PTS's check")}</dt><dd data-manual={ch.manual ? "1" : "0"}>{e.manualCheck ? `${e.manualCheck.at.slice(0, 10).split("-").reverse().join(".")} · ${e.manualCheck.by}${e.manualCheck.note ? ` — ${e.manualCheck.note}` : ""}` : "—"}</dd>
              </dl>
              <LaboratoryForms lang={lg} entityId={e.id} entityInactive={e.state === "inactive"}
                labs={labs.filter((l) => l.entityId === e.id).map((l) => ({ id: l.id, name: l.name, deliveryAddress: l.deliveryAddress, mobileOffice: l.mobileOffice, accreditationNo: l.accreditationNo, accreditationBody: l.accreditationBody, state: l.state }))} />
              <EntityUserForms lang={lg} entityId={e.id} entityInactive={e.state === "inactive"} invite={invite} appoint={appoint} labOwned={e.origin === "portal" || !!e.confirmedAt}
                users={users.filter((u) => u.entityId === e.id).map((u) => ({ id: u.id, email: u.email, name: u.name, position: u.position, phone: u.phone, role: u.role, twoFactorRequired: u.twoFactorRequired, receivesNotices: u.receivesNotices, state: u.state, linked: !!u.authUserId }))} />
              {e.hasParticipations
                ? <p className="text-xs mt-3" data-kept-for-rounds style={{ color: "var(--muted)" }}>{L("Има участия — профилът се пази: данните му са в записите на кръговете (Задание §10).", "It has participations — the profile is kept: its data is in its rounds' records (Zadanie §10).")}</p>
                : managesPeople && <EraseEntityForm lang={lg} entityId={e.id} />}
              {/* 5.10: a one-way message to this organisation (Реш. 116) — not to an inactive one */}
              {e.state !== "inactive" && (
                <details className="mt-3" data-entity-message={e.id} open={sp.entity === e.id || undefined}>
                  <summary className="text-sm" style={{ cursor: "pointer", fontWeight: 600 }}>{L("Съобщение до организацията", "Message to the organisation")}{sentTo.get(e.id)?.length ? ` (${sentTo.get(e.id)!.length})` : ""}</summary>
                  <MessageComposer action={sendEntityMessageAction} hidden={{ entityId: e.id }} lang={lg} anchor={`message-${e.id}`} warn={false}
                    title={L("Съобщение до организацията", "Message to the organisation")} to={L("до всички потребители на организацията, които получават известията", "to every user of the organisation who receives the notices")}
                    answer={sp.entity === e.id ? sp.msg : undefined}
                    history={(sentTo.get(e.id) ?? []).map((n) => ({ id: n.id, at: fmtMoment(n.createdAt), to: L("до организацията", "to the organisation"), bg: messageBody(n.bg, "bg"), en: messageBody(n.en, "en") }))} />
                </details>
              )}
              <EntityForms lang={lg} entity={{ id: e.id, name: e.name, country: e.country, eik: e.eik, vat: e.vat, correspondenceAddress: e.correspondenceAddress, officialEmail: e.officialEmail, mol: e.mol, language: e.language, state: e.state, viesStatus: e.vies?.status, manual: ch.manual, registry: ch.registry, hasProof: !!e.proofPath }} />
            </div>
          );
        })}
      </div>
      <EntityForms lang={lg} />
    </div>
  );
}
