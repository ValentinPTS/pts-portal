// The release gate (plan part 1.11; ISO/IEC 17043 §7.5.2, Реш. 67, ground rule 7):
// a release is authorised BEFORE it is put to use. On a PRODUCTION build on Vercel it
// reads the change register (migration 0022) and FAILS unless the commit being
// built — its whole 40-character hash, matched exactly — has an entry «authorised»
// (or already «deployed»), authorised by a head of the PT provider named in this
// deployment's own settings, who is not the person who proposed it.
//
// What it is, honestly: a guard against accidents and an audit trail. It travels
// with the commit, so a commit could remove it; the controls outside the code are
// in docs/participant-portal/CHANGE-CONTROL-BG.md (Vercel and GitHub settings), and
// a release running without an entry shows in red on «Проверка на системата».
//
// Previews and local builds are not gated: a preview is where a release is
// validated. It reads one table with the server key; it writes nothing.
const production = process.env.VERCEL_ENV === "production" || (!!process.env.VERCEL && !process.env.VERCEL_ENV);
if (!production) {
  console.log("release gate: not a production build — not gated.");
  process.exit(0);
}
const stop = (msg) => {
  console.error(`\n✗ release gate: ${msg}\n`);
  process.exit(1);
};
const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").toLowerCase();
if (!/^[0-9a-f]{40}$/.test(sha)) stop("no commit to check (VERCEL_GIT_COMMIT_SHA) — deploy from git, with Vercel's system variables exposed.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) stop("production has no database configured — the change register cannot be read.");

// the heads of the PT provider, as this deployment names them (as lib/provider-people.ts)
const list = (v) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const shared = new Set(["office@ptsbg.eu", "portal@ptsbg.eu", ...list(process.env.PTS_SHARED_MAILBOXES)]);
const named = list(process.env.PROVIDER_HEAD_EMAILS);
const heads = (named.length ? named : list(process.env.OWNER_EMAILS)).filter((e) => !shared.has(e));
if (!heads.length) stop("no head of the PT provider is named for this deployment (PROVIDER_HEAD_EMAILS, else OWNER_EMAILS) — nobody could have authorised a release.");

let rows;
try {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/change_register?select=ref,status,title,authorised_by,requested_by&kind=eq.release&ref=eq.${sha}&status=in.(authorised,deployed)`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  rows = await res.json();
} catch (e) {
  stop(`cannot read the change register (${e.message}) — the database must be reachable, with migration 0022, to deploy.`);
}
// exactly this commit; authorised by a head, who is not the one who proposed it
const exact = rows.filter((r) => r.ref === sha);
const mine = exact.find((r) => {
  const by = (r.authorised_by ?? "").toLowerCase();
  return heads.includes(by) && by !== (r.requested_by ?? "").toLowerCase();
});
if (!mine) {
  const why = exact.length ? " Its entry is not authorised by a head of the PT provider other than the person who proposed it." : "";
  stop(`commit ${sha} has no authorised release in the change register.${why} Propose it on «Регистър на промените» (what changed, how it was validated, the whole commit), have the head of the PT provider authorise it, then deploy again. (docs/participant-portal/CHANGE-CONTROL-BG.md)`);
}
console.log(`release gate: commit ${sha.slice(0, 12)} is authorised by ${mine.authorised_by} — «${mine.title}».`);
