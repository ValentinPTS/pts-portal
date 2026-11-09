// The provider's people (plan part 1.6, Реш. 139 and 95): a shared mailbox is never
// a person or a role; two-factor sign-in is reset by the head of the PT provider only.
import { readFileSync } from "node:fs";
import { isSharedMailbox, sharedMailboxes, providerHeadEmails, isProviderHead, mailboxKey } from "../src/lib/provider-people.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

t("office@ptsbg.eu is a shared mailbox", isSharedMailbox("office@ptsbg.eu", {}) && isSharedMailbox("  Office@PTSBG.eu ", {}));
t("…and portal@ptsbg.eu, the portal's sender (an alias of office@)", isSharedMailbox("portal@ptsbg.eu", {}));
t("a personal address is not", !isSharedMailbox("atanasov@ptsbg.eu", {}) && !isSharedMailbox("", {}) && !isSharedMailbox(null, {}));
// a sub-address lands in the same mailbox (review 1.6)
t("office+anything@ptsbg.eu is the shared mailbox too", isSharedMailbox("office+lab@ptsbg.eu", {}) && isSharedMailbox("OFFICE+x+y@ptsbg.eu", {}));
t("…and office@ptsbg.eu. with the trailing dot", isSharedMailbox("office@ptsbg.eu.", {}));
t("…but not another person's sub-address, nor another domain", !isSharedMailbox("officer@ptsbg.eu", {}) && !isSharedMailbox("office@ptsbg.eu.bg", {}) && !isSharedMailbox("office@other.eu", {}) && !isSharedMailbox("+x@ptsbg.eu", {}));
t("mailboxKey", mailboxKey(" A+b@X.eu. ") === "a@x.eu" && mailboxKey("no-at") === "no-at" && mailboxKey("") === "");
t("the head stays an exact match — no sub-address of the head is the head", !isProviderHead("head+x@ptsbg.eu", { PROVIDER_HEAD_EMAILS: "head@ptsbg.eu" }));
t("more shared mailboxes can be named", isSharedMailbox("info@ptsbg.eu", { PTS_SHARED_MAILBOXES: "info@ptsbg.eu, lab@ptsbg.eu" }) && sharedMailboxes({ PTS_SHARED_MAILBOXES: "info@ptsbg.eu" }).includes("office@ptsbg.eu"));

const env = { PROVIDER_HEAD_EMAILS: "Head@ptsbg.eu", OWNER_EMAILS: "founder@example.com" };
t("the head named in PROVIDER_HEAD_EMAILS", isProviderHead("head@ptsbg.eu", env) && !isProviderHead("founder@example.com", env));
t("until it is set, the founders", isProviderHead("founder@example.com", { OWNER_EMAILS: "founder@example.com" }) && providerHeadEmails({ OWNER_EMAILS: "a@x.bg,b@x.bg" }).length === 2);
t("a shared mailbox is never the head", !isProviderHead("office@ptsbg.eu", { PROVIDER_HEAD_EMAILS: "office@ptsbg.eu" }));
t("nobody is the head with nothing set", !isProviderHead("x@ptsbg.eu", {}) && !isProviderHead("", env) && !isProviderHead(null, env));

// the system check shows who the head is, and a shared address left among the founders
const { peopleCheck } = await import("../src/lib/system-check.ts");
let pc = peopleCheck({ OWNER_EMAILS: "office@ptsbg.eu, a@x.eu" });
t("system check: no head named → the founders, minus the shared one", !pc.headsNamed && pc.heads.join() === "a@x.eu", JSON.stringify(pc));
t("…and the shared address in OWNER_EMAILS is flagged", pc.sharedInOwners.join() === "office@ptsbg.eu");
pc = peopleCheck({ OWNER_EMAILS: "a@x.eu", PROVIDER_HEAD_EMAILS: " Head@X.eu " });
t("system check: the head named", pc.headsNamed && pc.heads.join() === "head@x.eu" && pc.sharedInOwners.length === 0, JSON.stringify(pc));
pc = peopleCheck({ OWNER_EMAILS: "a@x.eu", PROVIDER_HEAD_EMAILS: "office@ptsbg.eu" });
t("…a shared address as the head: nobody may reset (fails closed, no fallback)", !pc.headsNamed && pc.heads.length === 0, JSON.stringify(pc));

// a row made with a shared address before 1.6 (straight into the store — the actions refuse it now)
const { addStaff } = await import("../src/lib/staff.ts");
const { systemCheck } = await import("../src/lib/system-check.ts");
await addStaff({ email: "office+old@ptsbg.eu", name: "", role: "manager" });
const sc = await systemCheck({ authEnabled: true, require2fa: true, internalToken: false, onlineApplications: false });
t("system check: an old team-member row with a shared address is flagged", sc.people.sharedAccounts.join() === "office+old@ptsbg.eu", JSON.stringify(sc.people));

// wired
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const actions = src("lib/actions.ts");
t("no team member, laboratory, approval or invitation for a shared mailbox",
  (actions.match(/if \(isSharedMailbox\((email|app\.email)\)\) return \{ (ok: false, )?error: SHARED_MAILBOX_REFUSAL \}/g) ?? []).length === 4, String((actions.match(/isSharedMailbox\(/g) ?? []).length));
t("a shared mailbox signs in as nobody", /if \(isSharedMailbox\(email\)\) return null;/.test(src("lib/auth-actions.ts")));
t("…and is never a founder", /if \(isSharedMailbox\(email\)\) return false;/.test(src("lib/auth.ts")));
t("the 2FA reset: the head of the provider, by the role model AND the check", /export async function resetTwoFactorAction[\s\S]{0,200}await requireCap\("twofa\.reset"\);[^\n]*\n[\s\S]{0,120}if \(!\(await isEffectiveHead\(ctx\.email\)\)\) return/.test(actions));
const reset = actions.slice(actions.indexOf("export async function resetTwoFactorAction"), actions.indexOf("export async function setStaffRoleAction"));
t("…journalled by account id, never the address", /const who = `\$\{kind\} \$\{kind === "founder" \? userId : id\}`;/.test(reset) && (reset.match(/Two-factor sign-in reset for \$\{who\}/g) ?? []).length === 2);
t("…the arguments are checked (they come from the browser)", /kind !== "staff" && kind !== "lab" && kind !== "founder"\) \|\| typeof id !== "string"/.test(reset));
t("…a laboratory row never resets a founder's or team member's login", /if \(!userId && kind === "lab"\)[\s\S]{0,120}isOwnerEmail\(person\.email\) \|\| \(await staffEmailInUse\(person\.email\)\)/.test(reset));
t("…a founder only by an address in OWNER_EMAILS", /kind === "founder"\s*\? \(isOwnerEmail\(id\)/.test(reset));
t("…an authenticator that could not be removed is an error, journalled as such", /if \(removed < all\.length\)[\s\S]{0,200}FAILED IN PART[\s\S]{0,160}return \{ error:/.test(reset));
t("a laboratory account is never made with a team member's address, nor a team member with a laboratory's",
  /addLabAction[\s\S]{0,700}isOwnerEmail\(email\) \|\| \(await staffEmailInUse\(email\)\)/.test(actions) && /addStaffAction[\s\S]{0,900}await labEmailInUse\(email\)/.test(actions));
// no session at all for a shared mailbox, however it was made (review 1.6)
t("a shared mailbox has no session (every role and lab check reads it)", /if \(isSharedMailbox\(user\.email\)\) return null;/.test(src("lib/auth.ts")));
const proxy = src("proxy.ts");
t("…nor in the proxy: never a founder, team member or laboratory", /!isSharedMailbox\(e\) && ownerEmails\(\)\.includes\(e\)/.test(proxy) && (proxy.match(/if \(!e \|\| isSharedMailbox\(e\)\) return false;/g) ?? []).length === 2);
const aa = src("lib/auth-actions.ts");
t("…a link to it signs straight out", (aa.match(/if \(!error && isSharedMailbox\(data\.user\?\.email\)\) \{ await supabase\.auth\.signOut/g) ?? []).length === 2);
t("…no password-reset link for it (the same answer)", /mailAllowedHere\(email\) \|\| isSharedMailbox\(email\)\) return done;/.test(aa));
t("…no role after a new password → signed out, not left half in", /return REQUIRE_2FA \? "\/account\?enroll=1" : "\/";\s*\/\/[^\n]*\n\s*await \(await createServerSupabase\(\)\)\.auth\.signOut/.test(aa));
t("the Users page lists no shared address as a founder", /ownerEmails\(\)\.filter\(\(e\) => !isSharedMailbox\(e\)\)/.test(src("app/users/page.tsx")));
t("a founder's 2FA can be reset by the head too", /resetTwoFactorAction\("founder", r\.email\)/.test(src("components/UsersTable.tsx")));
t("the reset button only for the head", /canReset2fa=\{ctx\.authEnabled && \(await mayNow\("twofa\.reset"\)\) && \(await isEffectiveHead\(me\)\)\}/.test(src("app/users/page.tsx")));
t("2FA is required for the provider unless switched off for a test", /export const REQUIRE_2FA = process\.env\.REQUIRE_2FA !== "false";/.test(src("lib/auth.ts")));

console.log(`provider-people.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
