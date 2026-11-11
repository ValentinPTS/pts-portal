import { requireCapAnywhere, mayAnywhereNow } from "@/lib/access";
import { listStartedSchemes } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { schemeFull } from "@/lib/waitlist-model";
import { schemeNowMs } from "@/lib/clock";
import { buildFeed } from "@/lib/website-feed-model";
import { listPublications, feedDigest, feedBase, feedBaseMissing, type Publication } from "@/lib/website-feed";
import { publishWebsiteFeedAction } from "@/lib/actions";
import PendingSubmit from "@/components/PendingSubmit";
import { getServerT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

// «Сайт» (plan part 10.2): the website's feed — what would be published now, exactly, and «Публикувай за
// сайта» (the head: what goes out in PTS's name, 1.8). The public address serves the last publication.
export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ published?: string; refused?: string }> }) {
  await requireCapAnywhere("journal.read");
  const mayPublish = await mayAnywhereNow("texts.approve");
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const sp = await searchParams;
  const started = await listStartedSchemes();
  const full = new Set((await Promise.all(started.filter((s) => s.status === "open").map(async (s) => (schemeFull(s, await listParticipants(s.id)) ? [s.id] : []) as string[]))).flat());
  const base = feedBase();
  const feed = buildFeed(started, schemeNowMs, (s) => full.has(s.id), base);
  const json = JSON.stringify(feed, null, 2);
  const digest = feedDigest(feed);
  // a read that fails (before migration 0052) is said — never taken for «nothing published» (10.2 review)
  let pubs: Publication[] = [];
  let unreadable = false;
  try { pubs = await listPublications(10); } catch { unreadable = true; }
  const last = pubs[0] ?? null;
  const startedIds = new Set(started.map((s) => s.id));
  const dropped = last ? last.feed.schemes.filter((x) => !startedIds.has(x.id)).length : 0;
  // the fingerprints compared — never the stored JSON, whose key order is the database's (10.2 review)
  const stale = !!last && last.digest !== digest;
  const fmt = (iso: string) => new Date(iso).toLocaleString(lg === "bg" ? "bg-BG" : "en-GB", { timeZone: "Europe/Sofia" });
  return (
    <div data-website>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Сайт — данните за схемите", "Website — the schemes' data")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 760 }}>
        {L("Сайтът ptsbg.eu взема от портала започналите и приключилите схеми — само когато тук се натисне «Публикувай за сайта». Без чернови, без брой участници и места, без цени. Форматът е предложение на портала (версия 1), още не е съгласуван с Creativiso.",
          "The ptsbg.eu website takes the started and finished schemes from the portal — only when «Publish to the website» is pressed here. No drafts, no counts or places, no prices. The format is the portal's proposal (version 1), not yet agreed with Creativiso.")}
      </p>
      {sp.published && <div role="status" data-website-published className="card p-3 mt-3" style={{ background: "var(--green-soft)" }}>{L(`Публикувано — версия ${sp.published}.`, `Published — version ${sp.published}.`)}</div>}
      {sp.refused === "changed" && <div role="alert" data-website-refused className="card p-3 mt-3" style={{ borderLeft: "4px solid var(--red)" }}>{L("Не е публикувано: данните се промениха, докато гледахте — вижте ги отново.", "Not published: the data changed while you looked — look again.")}</div>}
      {sp.refused === "failed" && <div role="alert" data-website-refused className="card p-3 mt-3" style={{ borderLeft: "4px solid var(--red)" }}>{L("Не е публикувано — опитайте отново.", "Not published — try again.")}</div>}
      {sp.refused === "conflict" && <div role="alert" data-website-refused className="card p-3 mt-3" style={{ borderLeft: "4px solid var(--red)" }}>{L("Не е публикувано: някой друг публикува в същия момент — вижте отново.", "Not published: someone else published at the same moment — look again.")}</div>}
      {sp.refused === "unchanged" && <div role="status" data-website-unchanged className="card p-3 mt-3">{L("Няма промяна от последното публикуване — нищо ново не е публикувано.", "Nothing changed since the last publication — nothing new was published.")}</div>}
      {sp.refused === "no-address" && <div role="alert" data-website-refused className="card p-3 mt-3" style={{ borderLeft: "4px solid var(--red)" }}>{L("Не е публикувано: адресът на портала (NEXT_PUBLIC_SITE_URL) не е зададен — връзките към сайта трябва да са пълни.", "Not published: the portal's address (NEXT_PUBLIC_SITE_URL) is not set — the links for the website must be whole.")}</div>}
      {unreadable && <div role="alert" data-website-unreadable className="card p-3 mt-3" style={{ borderLeft: "4px solid var(--red)" }}>{L("Публикуванията не могат да се прочетат (приложена ли е миграция 0052?) — адресът за сайта отговаря «unavailable».", "The publications cannot be read (is migration 0052 applied?) — the website's address answers «unavailable».")}</div>}
      {!base && <div role="note" data-website-no-base className="card p-3 mt-3" style={{ background: "#fff8e6" }}>{L(`Адресът на портала (NEXT_PUBLIC_SITE_URL) не е зададен — връзките са относителни${feedBaseMissing() ? "; публикуването е спряно, докато не се зададе" : " (тук, локално, е позволено)"}.`, `The portal's address (NEXT_PUBLIC_SITE_URL) is not set — the links are relative${feedBaseMissing() ? "; publishing waits until it is set" : " (allowed here, locally)"}.`)}</div>}
      <section className="card p-4 mt-4" data-website-state={last ? (stale ? "stale" : "current") : "never"}>
        {last
          ? <div>{L(`Публикувано: версия ${last.version}, ${fmt(last.at)}, ${last.schemes} схеми.`, `Published: version ${last.version}, ${fmt(last.at)}, ${last.schemes} schemes.`)}{stale && <b style={{ color: "var(--red)", marginLeft: 8 }} data-website-stale>{L("Сайтът показва остарели данни — публикувайте отново.", "The website shows stale data — publish again.")}</b>}{dropped > 0 && <span style={{ marginLeft: 8 }}>{L(`(${dropped} вече не са започнали — не се показват)`, `(${dropped} no longer started — not shown)`)}</span>}</div>
          : unreadable ? null : <div>{L("Още нищо не е публикувано — адресът отговаря «not published».", "Nothing published yet — the address answers «not published».")}</div>}
        <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>{L("Адрес за сайта:", "The address for the website:")} <code data-website-address>{`${base}/feed/schemes.json`}</code></div>
        {mayPublish && (
          <form action={publishWebsiteFeedAction} className="mt-3">
            <input type="hidden" name="digest" value={digest} />
            <PendingSubmit mark="data-website-publish" label={L(`Публикувай за сайта (${feed.schemes.length} схеми)`, `Publish to the website (${feed.schemes.length} schemes)`)} />
          </form>
        )}
      </section>
      <h2 className="text-lg font-bold mt-6">{L("Какво ще бъде публикувано", "What will be published")}</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="w-full text-sm mt-2" data-website-preview>
          <thead><tr><th className="text-left">{L("Номер", "Number")}</th><th className="text-left">{L("Наименование", "Title")}</th><th className="text-left">{L("Състояние", "State")}</th><th className="text-left">{L("Заявки до", "Applications by")}</th><th className="text-left">{L("План / покана", "Plan / invitation")}</th></tr></thead>
          <tbody>
            {feed.schemes.map((x) => (
              <tr key={x.id} data-website-row={x.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td>{x.number}</td><td>{L(x.title.bg || x.title.en, x.title.en || x.title.bg)}</td><td>{x.state[lg]}</td><td>{x.applicationsDue ?? "—"}</td><td>{x.links.plan ? "✓" : "—"} / {x.links.invitation ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-4"><summary className="cursor-pointer">{L("Точно какво получава сайтът (JSON)", "Exactly what the website gets (JSON)")}</summary><pre data-website-json className="text-xs p-3 mt-2" style={{ background: "var(--green-soft)", borderRadius: 6, overflowX: "auto" }}>{json}</pre></details>
      {pubs.length > 0 && (
        <section className="mt-6" data-website-history>
          <h2 className="text-lg font-bold">{L("Публикувания", "Publications")}</h2>
          <ul className="text-sm mt-1">{pubs.map((p) => <li key={p.version}>{L(`Версия ${p.version} — ${fmt(p.at)}, ${p.by}, ${p.schemes} схеми`, `Version ${p.version} — ${fmt(p.at)}, ${p.by}, ${p.schemes} schemes`)}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
