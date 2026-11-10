import Link from "next/link";
import { notFound } from "next/navigation";
import { mayNow, mayViewDoc, requireCap } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { DOCUMENTS } from "@/lib/documents";
import { freezeNow, listEditions, sameAs, amendmentStampFor, type DocEdition } from "@/lib/editions";
import { hasEditions, fmtDay, nextEditionNo } from "@/lib/editions-model";
import { getServerT } from "@/lib/i18n-server";
import { requireStaff } from "@/lib/roles";
import IssueEdition, { type IssuableDoc } from "@/components/IssueEdition";
import ReleaseToOne, { WithdrawRelease, type TargetOption } from "@/components/ReleaseToOne";
import { isSendableDoc } from "@/lib/doc-release";
import { RELEASE_LEVEL_LABEL } from "@/lib/release-model";
import { listParticipants } from "@/lib/participants";
import { inFinalRound } from "@/lib/announcement-model";
import { isProvisional } from "@/lib/coding-model";
import { openEntityUsers } from "@/lib/entity-users";
import { listActivity } from "@/lib/activity";
import { actorNow } from "@/lib/identities";

export const dynamic = "force-dynamic";

// «Редакции» (plan part 3.0; Реш. 50; Задание §4): every edition of every document of
// the scheme — its number, date, note, who issued it, its frozen file in each language
// — the one the participants hold marked; and, for who edits the scheme, the next
// edition issued from here. The lists and the certificate have none (they are drawn
// from live data, and name laboratories); the Order is shown only to the staff it is for.
export default async function EditionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  await requireStaff();
  const { id } = await params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const s = await getScheme(id);
  if (!s) notFound();
  const { doc: initial } = await searchParams;
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);

  const docs: (typeof DOCUMENTS)[number][] = [];
  for (const d of DOCUMENTS) if (hasEditions(d.key) && (await mayViewDoc(d.key, id))) docs.push(d);
  const all = await listEditions(id);
  const canIssue = await mayNow("scheme.edit", id);
  const rows = await Promise.all(docs.map(async (d) => {
    const eds = all.filter((e) => e.docKey === d.key);
    // has the document changed since its latest edition? (rendered as the participants would get it)
    let changed: boolean | null = null;
    if (eds[0]) {
      try {
        const now = await freezeNow(s, d.key);
        changed = now ? !sameAs(now, eds[0], amendmentStampFor(s, eds[0])) : null;
      } catch { changed = null; }
    }
    return { d, eds, changed };
  }));
  // once issued (R1, 7.4) the report goes out only by its acts — not offered here
  const issuable: IssuableDoc[] = rows.filter(({ d }) => !(d.key === "report" && s.reportIssues?.length)).map(({ d, eds }) => ({ key: d.key, name: lang === "bg" ? d.nameBg : d.nameEn, next: nextEditionNo(eds[0]) }));
  // what the participants hold: the edition a document was sent as; for the final
  // report, the R in force (7.4) — before 7.4, once issued to them, its latest edition
  const reported = (s.status === "report" || s.status === "closed") && !!s.uploads?.report;
  const rInForce = s.reportIssues?.at(-1);
  const held = (e: DocEdition) => e.docKey === "report"
    ? (rInForce ? rInForce.editionId === e.id : reported && all.find((x) => x.docKey === "report")?.id === e.id)
    : !!s.sentToParticipants?.[e.docKey] && s.releasedEditions?.[e.docKey]?.id === e.id;
  const file = (e: DocEdition, l: "bg" | "en") => `/schemes/${id}/editions/${e.id}?lang=${l}`;

  // who got which edition, and who downloaded it (5.4; Реш. 50): the releases — to every
  // participant, to one participation, to one user — and the laboratories' openings
  const canRelease = await mayNow("docs.release", id);
  const canNames = await mayNow("names.view", id);
  const going = (await listParticipants(id)).filter((p) => inFinalRound(s, p));
  const codeOf = new Map(going.map((p) => [p.id, p.code]));
  const partOptions: TargetOption[] = going.map((p) => ({ value: p.id, label: isProvisional(p.code) ? `${p.code} (${L("без код", "no code")})` : p.code }));
  // a release to one user shows that user's name — only to who may see names (§4.2), and
  // only the users the releases name are opened, on record (never the whole entity, 5.4 review)
  const userName = new Map<string, string>();
  const namedUsers = [...new Set((s.releases ?? []).filter((r) => r.level === "user" && r.userId).map((r) => r.userId!))];
  if (canNames && namedUsers.length) {
    try {
      const actor = await actorNow();
      for (const uid of namedUsers) for (const u of await openEntityUsers({ actor, purpose: "names.view" }, { userId: uid })) userName.set(u.id, u.name);
    } catch { /* names not shown — the release stays */ }
  }
  const downloads = new Map<string, { code?: string; at: string }[]>();
  for (const ev of await listActivity({ schemeId: id, action: "file.downloaded", actorRole: "lab", limit: 1000 }).catch(() => [])) {
    if (!ev.subject?.startsWith("edition:") || ev.actorRole !== "lab") continue;
    const k = ev.subject.slice("edition:".length);
    downloads.set(k, [...(downloads.get(k) ?? []), { code: ev.targetCode, at: ev.at }]);
  }
  // the history of every release of each document, from the journal (sent and withdrawn, to all and to one)
  const history = new Map<string, { at: string; summary: string }[]>();
  for (const action of ["doc.sent", "doc.unsent"]) {
    for (const ev of await listActivity({ schemeId: id, action, limit: 500 }).catch(() => [])) {
      const m = /Document “([^”]+)”/.exec(ev.summary ?? "");
      if (m) history.set(m[1], [...(history.get(m[1]) ?? []), { at: ev.at, summary: ev.summary }]);
    }
  }
  for (const [k, v] of history) history.set(k, v.sort((a, b) => b.at.localeCompare(a.at)));
  const releasesOf = (e: DocEdition) => [
    ...(s.sentToParticipants?.[e.docKey] && s.releasedEditions?.[e.docKey]?.id === e.id ? [{ id: "", level: "all" as const, target: "", at: s.sentToParticipants[e.docKey], withdrawnAt: undefined as string | undefined }] : []),
    ...(s.releases ?? []).filter((r) => r.editionId === e.id).map((r) => ({
      id: r.id, level: r.level, at: r.at, withdrawnAt: r.withdrawnAt,
      target: r.level === "participation" ? (codeOf.get(r.participantId ?? "") ?? L("участие извън кръга", "a participation out of the round")) : (userName.get(r.userId ?? "") ?? L("потребител", "a user")),
    })),
  ];

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>← {s.number}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {L("Редакции на документите", "Document editions")}{" "}
        <span className="text-base font-normal" style={{ color: "var(--muted)" }}>· {all.filter((e) => docs.some((d) => d.key === e.docKey)).length}</span>
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)", maxWidth: 760 }}>
        {L("Всяка редакция е замразен файл с номер, дата и бележка какво и защо е променено. Не се променя и не се изтрива: промяната е следващата редакция. Участниците получават редакция.",
          "Each edition is a frozen file with a number, a date and a note of what changed and why. It is never changed or removed: a change is the next edition. The participants receive an edition.")}
      </p>

      {canIssue && <IssueEdition schemeId={id} docs={issuable} initial={initial} />}

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {rows.map(({ d, eds, changed }) => (
          <section key={d.key} id={d.key} className="card p-4" data-edition-doc={d.key}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <h2 className="font-bold" style={{ fontSize: 15 }}>{lang === "bg" ? d.nameBg : d.nameEn}</h2>
              <span className="text-sm" style={{ color: "var(--muted)" }}>{d.formNumber}</span>
              {changed && <span data-changed-since={eds[0].no} className="text-sm" style={{ color: "#9a6b22", fontWeight: 700 }}>{L(`променен след редакция № ${eds[0].no}`, `changed since edition No. ${eds[0].no}`)}</span>}
            </div>
            {canRelease && isSendableDoc(d.key) && partOptions.length > 0 && <ReleaseToOne lang={lang === "bg" ? "bg" : "en"} schemeId={id} docKey={d.key} participations={partOptions} usersAllowed={canNames} />}
            {/* every send and withdrawal of it, to all and to one, from the journal — the history stays (5.4 review) */}
            {(history.get(d.key)?.length ?? 0) > 0 && (
              <details data-release-history={d.key} style={{ marginTop: 6, fontSize: 13 }}>
                <summary style={{ cursor: "pointer", color: "var(--muted)" }}>{L(`История на изпращанията (${history.get(d.key)!.length})`, `History of releases (${history.get(d.key)!.length})`)}</summary>
                <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                  {history.get(d.key)!.map((h, k) => <li key={k}>{h.at.slice(0, 16).replace("T", " ")} · {h.summary}</li>)}
                </ul>
              </details>
            )}
            {eds.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)", marginTop: 6 }}>{L("Още няма редакция.", "No edition yet.")}</p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
                      <th className="text-left p-2">№</th>
                      <th className="text-left p-2">{L("Дата", "Date")}</th>
                      <th className="text-left p-2">{L("Причина и обхват", "Reason and scope")}</th>
                      <th className="text-left p-2">{L("Издал", "Issued by")}</th>
                      <th className="text-left p-2">{L("Файл", "File")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eds.map((e) => (
                      <tr key={e.id} data-edition={`${e.docKey}:${e.no}`} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                        <td className="p-2 font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>{e.no}</td>
                        <td className="p-2" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDay(e.issuedOn)}</td>
                        <td className="p-2">
                          <div>{e.reason}</div>
                          {e.scope && <div style={{ color: "var(--muted)" }}>{L("Обхват: ", "Scope: ")}{e.scope}</div>}
                          {held(e) && <div data-held style={{ color: "#3d6b47", fontWeight: 700, marginTop: 2 }}>📨 {L("при участниците", "with the participants")}</div>}
                          {releasesOf(e).map((r, k) => (
                            <div key={r.id || `all-${k}`} data-release={r.level} data-release-to={r.target || undefined} data-release-withdrawn={r.withdrawnAt ? "1" : undefined} style={{ marginTop: 2, color: r.withdrawnAt ? "var(--muted)" : "#3d6b47", textDecoration: r.withdrawnAt ? "line-through" : undefined }}>
                              ↗ {lang === "bg" ? RELEASE_LEVEL_LABEL[r.level].bg : RELEASE_LEVEL_LABEL[r.level].en}{r.target ? ` — ${r.target}` : ""} · {fmtDay(r.at.slice(0, 10))}
                              {r.withdrawnAt ? ` · ${L("оттеглено", "withdrawn")} ${fmtDay(r.withdrawnAt.slice(0, 10))}` : ""}
                              {canRelease && r.id && !r.withdrawnAt && <> <WithdrawRelease lang={lang === "bg" ? "bg" : "en"} schemeId={id} releaseId={r.id} /></>}
                            </div>
                          ))}
                          {(downloads.get(e.id)?.length ?? 0) > 0 && (
                            <details data-downloads={downloads.get(e.id)!.length} style={{ marginTop: 2 }}>
                              <summary style={{ cursor: "pointer", color: "var(--muted)" }}>{L(`свален ${downloads.get(e.id)!.length} пъти`, `downloaded ${downloads.get(e.id)!.length} times`)}</summary>
                              <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                                {downloads.get(e.id)!.map((x, k) => <li key={k} data-download-by={x.code}>{x.code ?? "—"} · {x.at.slice(0, 16).replace("T", " ")}</li>)}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td className="p-2" style={{ wordBreak: "break-all" }}>{e.issuedBy}</td>
                        <td className="p-2" style={{ whiteSpace: "nowrap" }}>
                          {e.source === "uploaded"
                            ? <a href={file(e, "bg")} target="_blank" rel="noreferrer">{L("качен файл", "uploaded file")} ↗</a>
                            : <><a href={file(e, "bg")} target="_blank" rel="noreferrer">BG ↗</a>{" · "}<a href={file(e, "en")} target="_blank" rel="noreferrer">EN ↗</a></>}
                          <div title="SHA-256" style={{ color: "var(--muted)", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{(e.sha.file ?? e.sha.bg ?? "").slice(0, 12)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
