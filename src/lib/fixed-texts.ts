import { createHash } from "crypto";

// Fixed texts kept in the code (plan part 1.8, Реш. 138), for PTS to approve like
// every text (А14):
//   • the invitation — provider-initiated: shown in full before «Изпрати»;
//   • what a person asks for themself — a new password, the e-mail confirmation,
//     a changed address. Supabase sends these; the template to paste into its
//     dashboard is HERE, so the words are on record and reviewable in one place
//     (docs/participant-portal/AUTH-EMAILS-SETUP-BG.md says where they go).
// textKey() fingerprints a text: the invitation's «Изпрати» names the key of the
// text the person saw, and a text changed since is refused rather than sent.
//
// Approval by PTS: null until PTS approves; then the date, set here by a commit.
export const FIXED_TEXTS_APPROVED_AT: string | null = null;

export const textKey = (...parts: string[]): string =>
  createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 12);

// ── the invitation (sent by the portal's own mailer) ──────────────────────────
export const INVITE_SUBJECT = "Покана за портала на PTS Bulgaria · Invitation to the PTS Bulgaria portal";
export const LINK_PLACEHOLDER = "‹връзката · the link›";

export function inviteText(link: string): string {
  return [
    "Здравейте,",
    "",
    "PTS Bulgaria ви кани в своя портал. Отворете връзката, за да зададете парола:",
    link,
    "",
    "Връзката важи ограничено време и е само за вас — не я препращайте. Ако не очаквате тази покана, просто не я отваряйте.",
    "",
    "—",
    "",
    "Hello,",
    "",
    "PTS Bulgaria invites you to its portal. Open the link to set a password:",
    link,
    "",
    "The link is valid for a limited time and is for you alone — do not forward it. If you did not expect this invitation, simply do not open it.",
    "",
    "PTS Bulgaria · office@ptsbg.eu",
  ].join("\n");
}

/** The invitation as the person sees it before «Изпрати», and its key. */
export const invitePreview = () => {
  const body = inviteText(LINK_PLACEHOLDER);
  return { subject: INVITE_SUBJECT, body, key: textKey(INVITE_SUBJECT, body) };
};

// ── the notice to the official address when a profile is confirmed (4.4) ──────
// К23: the organisation learns it in time — at its official e-mail, whoever confirmed;
// Реш. 152: with the link to the privacy section M4. Sent by the portal's own mailer
// on the administrator's own action (class «triggered»: a fixed text kept here).
export const PROFILE_CONFIRMED_SUBJECT = "Профилът ви в портала на PTS Bulgaria е потвърден · Your profile in the PTS Bulgaria portal is confirmed";
export const PROFILE_CONFIRMED_KEY = "profile-confirmed";
export function profileConfirmedText(v: { entity: string; date: string; by: string; privacy: string }): string {
  return [
    "Здравейте,",
    "",
    `Данните на ${v.entity} в портала на PTS Bulgaria бяха прегледани и потвърдени на ${v.date} от ${v.by}, администратор на профила. От тази дата те са ваши: поддържате ги вие, в портала.`,
    "",
    `Как обработваме личните данни (раздел М4): ${v.privacy}`,
    "",
    "Ако не очаквате това потвърждение, пишете веднага на office@ptsbg.eu.",
    "",
    "—",
    "",
    "Hello,",
    "",
    `The data of ${v.entity} in the PTS Bulgaria portal was reviewed and confirmed on ${v.date} by ${v.by}, the profile's administrator. From that date it is yours: you keep it up to date, in the portal.`,
    "",
    `How we process personal data (section M4): ${v.privacy}`,
    "",
    "If you did not expect this confirmation, write to office@ptsbg.eu at once.",
    "",
    "PTS Bulgaria · office@ptsbg.eu",
  ].join("\n");
}
/** The notice as PTS approves it — its words with the places the data goes. */
export const profileConfirmedPreview = () => {
  const body = profileConfirmedText({ entity: "‹юридическото лице · the legal entity›", date: "‹дата · date›", by: "‹име · name›", privacy: "‹връзката към М4 · the link to M4›" });
  return { subject: PROFILE_CONFIRMED_SUBJECT, body, key: textKey(PROFILE_CONFIRMED_SUBJECT, body) };
};

// ── Supabase's own e-mails (the dashboard templates) ──────────────────────────
// {{ .SiteURL }} and {{ .TokenHash }} are Supabase's; the links match the ones in
// AUTH-EMAILS-SETUP-BG.md (a test keeps them equal).
export interface SupabaseTemplate { key: string; dashboard: string; subject: string; link: string; html: string }

const para = (s: string) => `<p>${s}</p>`;
function supabaseTemplate(key: string, dashboard: string, subject: string, link: string, bg: string[], en: string[]): SupabaseTemplate {
  const a = link ? [para(`<a href="${link}">${link}</a>`)] : [];
  const html = [...bg.map(para), ...a, "<hr>", ...en.map(para), ...a, para("PTS Bulgaria · office@ptsbg.eu")].join("\n");
  return { key, dashboard, subject, link, html };
}

export const SUPABASE_TEMPLATES: SupabaseTemplate[] = [
  supabaseTemplate(
    "password-reset", "Reset password",
    "Нова парола за портала на PTS Bulgaria · A new password for the PTS Bulgaria portal",
    "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/set-password?from=recovery",
    ["Здравейте,", "Поискана е нова парола за вашия акаунт в портала на PTS Bulgaria. Отворете връзката, за да я зададете. Връзката важи ограничено време.", "Ако не сте я поискали вие, не правете нищо — паролата ви остава същата."],
    ["Hello,", "A new password was requested for your account on the PTS Bulgaria portal. Open the link to set it. The link is valid for a limited time.", "If you did not ask for it, do nothing — your password stays as it is."],
  ),
  supabaseTemplate(
    "email-confirm", "Confirm signup",
    "Потвърдете имейла си · Confirm your e-mail",
    "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/auth/confirmed",
    ["Здравейте,", "Отворете връзката, за да потвърдите този имейл за портала на PTS Bulgaria."],
    ["Hello,", "Open the link to confirm this e-mail address for the PTS Bulgaria portal."],
  ),
  supabaseTemplate(
    "email-change", "Change email address",
    "Потвърдете новия имейл · Confirm the new e-mail address",
    "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/auth/confirmed",
    ["Здравейте,", "Поискана е смяна на имейла на вашия акаунт в портала на PTS Bulgaria. Отворете връзката, за да я потвърдите.", "Ако не сте я поискали вие, не правете нищо и пишете на office@ptsbg.eu."],
    ["Hello,", "A change of the e-mail address of your PTS Bulgaria portal account was requested. Open the link to confirm it.", "If you did not ask for it, do nothing and write to office@ptsbg.eu."],
  ),
  // a security notification (Authentication → Emails → Security notifications):
  // after every new password, so a stolen account does not go unnoticed
  supabaseTemplate(
    "password-changed", "Password changed (security notification)",
    "Паролата ви е сменена · Your password was changed",
    "",
    ["Здравейте,", "Паролата на вашия акаунт в портала на PTS Bulgaria току-що беше сменена.", "Ако не сте я сменили вие, пишете веднага на office@ptsbg.eu."],
    ["Hello,", "The password of your PTS Bulgaria portal account was just changed.", "If you did not change it, write to office@ptsbg.eu at once."],
  ),
];

/** The approval a self-requested message carries: the fixed text's key. */
export const fixedApproval = (key: string) => {
  const t = SUPABASE_TEMPLATES.find((x) => x.key === key);
  const k = t ? textKey(t.subject, t.html) : key === PROFILE_CONFIRMED_KEY ? profileConfirmedPreview().key : "?";
  return { by: `fixed text in the code${FIXED_TEXTS_APPROVED_AT ? ` (approved by PTS ${FIXED_TEXTS_APPROVED_AT})` : " (PTS approval pending)"}`, ref: `fixed:${key}@${k}` };
};
