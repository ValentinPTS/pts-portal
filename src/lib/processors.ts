// Every outside service the portal uses (plan part 1.12): for PTS's privacy section
// (M4 §7, which today names only hosting) and the supplier file of П 6.4. Pure data.
//
// role:
//   processor    — processes personal data on PTS's behalf (a DPA is needed)
//   independent  — receives data as its own controller (a public register, a translation service)
//   no-personal  — no personal data reach it
//
// scripts/processors.test.ts fails when a host written in the code is in no entry, or
// an entry's host is no longer in the code. It sees the hosts the code names; a host
// a person types (a link in a document) is not one — and pictures may come only
// from the portal's own places (lib/image-hosts.ts). The facts on contracts
// and locations were read from each supplier's own pages on 03.11.2026; Ivaylo
// collects the documents themselves (docs/participant-portal/SUPPLIER-FILE-BG.md).

export type ServiceRole = "processor" | "independent" | "no-personal";

export interface ExternalService {
  key: string;
  name: string;
  company: string;
  role: ServiceRole;
  purpose: string;        // what the portal uses it for
  personalData: string;   // which personal data reach it
  location: string;       // where it processes / stores them
  contract: string;       // the basis: a DPA, standard clauses, a public service
  hosts: string[];        // the hosts the code contacts ("env:…" = from configuration)
  note?: string;          // a recommendation, if any
}

export const EXTERNAL_SERVICES: ExternalService[] = [
  {
    key: "supabase", name: "Supabase", company: "Supabase Pte. Ltd. (Singapore)", role: "processor",
    purpose: "Database, sign-in (accounts, 2FA), file storage, the account e-mails it sends (invitations, new passwords) until the portal's own mail is set",
    personalData: "All the portal holds: laboratory contacts and accounts, PTS's people, results by code, the journal, uploaded files",
    location: "The project's region (Supabase → Settings → General); an EU-region project keeps the database in the EU",
    contract: "DPA (supabase.com/legal/dpa) part of the terms, with the EU standard contractual clauses; breach notice within 48 h where feasible; sub-processors: supabase.com/legal/customer-resources/subprocessor-list",
    hosts: ["env:NEXT_PUBLIC_SUPABASE_URL"],
    note: "Files in Storage are NOT in Supabase's backups; daily backups only from the Pro plan — the round export (1.10) is the full copy",
  },
  {
    key: "vercel", name: "Vercel", company: "Vercel Inc. (USA)", role: "processor",
    purpose: "Runs the portal (web pages, server functions, the daily job), its logs",
    personalData: "Everything passing through a request: addresses, IP addresses, what is entered; the logs",
    location: "The functions' region (Vercel → Settings → Functions): a new project's default is iad1 (Washington, USA) — recommended an EU region next to the database (e.g. fra1); the edge network that receives the requests is worldwide",
    contract: "DPA (vercel.com/legal/dpa) part of the terms, with the EU standard clauses; SOC 2 Type 2 and ISO 27001 in the Trust Center (security.vercel.com), sub-processors there",
    hosts: ["env:VERCEL"],
  },
  {
    key: "resend", name: "Resend", company: "Plus Five Five, Inc. (USA)", role: "processor",
    purpose: "The portal's e-mail (recommended): invitations, notices, reminders, test e-mails; the Supabase account e-mails through its SMTP",
    personalData: "Recipients' addresses and the e-mails' text: codes and scheme numbers, the words of notices PTS writes, and the sign-in links of invitations and new passwords",
    location: "Sends from the region chosen for the domain (EU possible); STORES the data in the USA",
    contract: "DPA pre-signed at sign-up (resend.com/legal/dpa; signed copy in Settings → Documents), EU standard clauses + EU-US Data Privacy Framework; SOC 2 Type II; sub-processors: resend.com/legal/subprocessors",
    hosts: ["api.resend.com"],
  },
  {
    key: "sendgrid", name: "SendGrid", company: "Twilio Inc. (USA)", role: "processor",
    purpose: "The fallback e-mail (one verified sender) while the domain's records wait",
    personalData: "As Resend: recipients' addresses and the e-mails' text",
    location: "USA",
    contract: "Twilio's DPA, with the EU standard clauses — only if it is used",
    hosts: ["api.sendgrid.com"],
    note: "Only while Resend's records are not ready; not needed afterwards",
  },
  {
    key: "mymemory", name: "MyMemory", company: "Translated srl (Italy)", role: "independent",
    purpose: "The editor's «translate» buttons: library snippets, and a whole document BG → EN",
    personalData: "The text of the document translated — PTS's own documents; a document naming laboratories is refused (the lists, the certificate, a code-and-laboratory table)",
    location: "A company in Italy; where it processes is not stated",
    contract: "None: a free public service, no DPA; by its terms it keeps what is sent and uses it for itself (a public translation memory)",
    hosts: ["api.mymemory.translated.net"],
    note: "Better a contracted EU service (e.g. DeepL API Pro), or switch the buttons off",
  },
  {
    key: "vies", name: "VIES", company: "European Commission", role: "independent",
    purpose: "Checks a laboratory's VAT number when it applies for an account",
    personalData: "The VAT number (a company's; a sole trader's is personal)",
    location: "EU",
    contract: "A public EU service — not a processor",
    hosts: ["ec.europa.eu"],
  },
  {
    key: "google-fonts", name: "Google Fonts", company: "Google Ireland Ltd. / Google LLC", role: "no-personal",
    purpose: "Where the documents' typefaces come from: copied once into the portal (public/fonts, by scripts/mirror-fonts.mjs) and served by the portal itself — opening a document, the editor or a PDF never contacts Google",
    personalData: "None: no viewer's browser goes to Google (until 05.11.2026 every document opening sent the viewer's IP address there)",
    location: "—",
    contract: "The SIL Open Font License 1.1, which allows serving the fonts from the portal; each family's licence lies beside its files (public/fonts/<family>/OFL.txt)",
    hosts: [],
  },
  {
    key: "github", name: "GitHub", company: "GitHub, Inc. (USA)", role: "no-personal",
    purpose: "The source code and the gates (CI) — the tests run in memory, with no data",
    personalData: "None",
    location: "USA", contract: "GitHub's terms", hosts: [],
  },
  {
    key: "cloudflare", name: "Cloudflare", company: "Cloudflare, Inc. (USA)", role: "no-personal",
    purpose: "DNS of ptsbg.eu; portal.ptsbg.eu will be «DNS only» (1.7) — the portal's traffic will not pass through it",
    personalData: "None (DNS only)",
    location: "—", contract: "The contract of ptsbg.eu's maintainer (Webface / Creativiso)", hosts: [],
  },
];

/** The service a host belongs to, or undefined. */
export const serviceForHost = (host: string): ExternalService | undefined =>
  EXTERNAL_SERVICES.find((s) => s.hosts.some((h) => !h.startsWith("env:") && (host === h || host.endsWith(`.${h}`))));
