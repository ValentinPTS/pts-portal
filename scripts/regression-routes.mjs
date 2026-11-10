// The §4.2 regression's inventory (plan part 2.9): EVERY page and route of the app,
// with what it may show of a laboratory's identity. scripts/regression-inventory.test.ts
// fails when a page or route exists that is not listed here — so a new one is placed
// before it ships — and scripts/verify-confidentiality.mjs opens every one of them as
// every role.
//
//   names: "scheme"  — may show who is behind a code, to who sees names IN THAT SCHEME
//                      (names.view: its scheme manager and coding expert; the local
//                      build); to anyone else, never
//          "never"   — never shows a laboratory's identity, to anyone
//          "own"     — the laboratory's portal: its own data only — and, in a
//                      calibration chain, the next laboratory's delivery details, by
//                      design («names travel, codes don't»); never another participant
//          "dev"     — the development personas themselves; not a page of the portal
//
// `paths(ctx)` gives the addresses to open: ctx = { S, OTHER, code, pid, docs, forms,
// folderPath, skinId, editions }.

const DOCS = ["order", "plan", "stat-project", "invitation", "application", "registered", "registered-coded", "results-coded", "declaration", "protocol", "instruction", "results", "report", "certificate", "feedback"];
// the pages that render a document's editor are heavy: the ones that matter for §4.2
// (the lists, those with identities, the Order) and one plain one
const PAGE_DOCS = ["registered", "registered-coded", "results-coded", "certificate", "order", "report", "invitation"];

export const ROUTES = [
  // ── the provider's pages ──
  { file: "page.tsx", names: "never", paths: () => ["/"] },
  { file: "dashboard/page.tsx", names: "never", paths: () => ["/dashboard"] },
  { file: "organizations/page.tsx", names: "never", paths: () => ["/organizations"] },
  { file: "organizations/proof/[id]/route.ts", names: "never", paths: () => ["/organizations/proof/00000000-0000-4000-8000-000000000000"] },
  { file: "batches/page.tsx", names: "never", paths: () => ["/batches"] },
  // the shipments by code; the addresses to who sees names in that scheme, for dispatch (5.6, D18)
  { file: "deliveries/page.tsx", names: "scheme", paths: (c) => ["/deliveries", `/deliveries?scheme=${c.S}`] },
  // the proformas and invoices by code and number (5.8) — no names on the page
  { file: "invoices/page.tsx", names: "never", paths: (c) => ["/invoices", `/invoices?scheme=${c.S}`] },
  // the billing export for accounting — it names who is behind each code (5.8, Реш. 98)
  { file: "invoices/export/route.ts", names: "scheme", paths: (c) => [`/invoices/export?scheme=${c.S}`, `/invoices/export?scheme=${c.OTHER}`] },
  { file: "files/[type]/page.tsx", names: "never", paths: () => ["/files/testing", "/files/calibration"] },
  { file: "files/[type]/f/[folderId]/page.tsx", names: "never", paths: (c) => (c.folderPath ? [c.folderPath] : []) },
  { file: "items/page.tsx", names: "never", paths: () => ["/items"] },
  { file: "skins/page.tsx", names: "never", paths: () => ["/skins", "/skins?type=C"] },
  { file: "skins/new/page.tsx", names: "never", paths: () => ["/skins/new"] },
  { file: "skins/[id]/edit/page.tsx", names: "never", paths: (c) => (c.skinId ? [`/skins/${c.skinId}/edit`] : []) },
  { file: "changes/page.tsx", names: "never", paths: () => ["/changes"] },
  { file: "system/page.tsx", names: "never", paths: () => ["/system"] },
  { file: "account/page.tsx", names: "never", paths: () => ["/account"] },
  { file: "activity/page.tsx", names: "scheme", paths: (c) => ["/activity", `/activity?scheme=${c.S}`] },
  { file: "notices/page.tsx", names: "scheme", paths: () => ["/notices"] },
  { file: "notices/texts/page.tsx", names: "never", paths: () => ["/notices/texts"] },
  // the laboratory ACCOUNTS (names, no codes) — not the participant's identity here
  { file: "users/page.tsx", names: "never", paths: () => ["/users"] },
  { file: "users/applications/[id]/[n]/route.ts", names: "never", paths: () => ["/users/applications/00000000-0000-4000-8000-000000000000/0"] },
  { file: "users/declarations/[id]/route.ts", names: "never", paths: () => ["/users/declarations/00000000-0000-4000-8000-000000000000"] },
  { file: "schemes/new/page.tsx", names: "never", paths: () => ["/schemes/new"] },

  // ── a scheme ──
  { file: "schemes/[id]/page.tsx", names: "scheme", paths: (c) => [`/schemes/${c.S}`] },
  { file: "schemes/[id]/edit/page.tsx", names: "never", paths: (c) => [`/schemes/${c.S}/edit`] },
  // the reference values per point (5.7) — the device's numbers, no participant's
  { file: "schemes/[id]/reference/page.tsx", names: "never", paths: (c) => [`/schemes/${c.S}/reference`] },
  { file: "schemes/[id]/participants/page.tsx", names: "scheme", paths: (c) => [`/schemes/${c.S}/participants`] },
  // …and with the reveal asked for: the case file shows names only on request (0.1)
  { file: "schemes/[id]/participants/[code]/page.tsx", names: "scheme", paths: (c) => [`/schemes/${c.S}/participants/${encodeURIComponent(c.code)}`, `/schemes/${c.S}/participants/${encodeURIComponent(c.code)}?reveal=1`] },
  { file: "schemes/[id]/applications/page.tsx", names: "scheme", paths: (c) => [`/schemes/${c.S}/applications`] },
  { file: "schemes/[id]/results/page.tsx", names: "scheme", paths: (c) => [`/schemes/${c.S}/results`] },
  { file: "schemes/[id]/traceability/page.tsx", names: "scheme", paths: (c) => [`/schemes/${c.S}/traceability`] },
  // PTS's review after the deadline (6.7): by code only — never a name, to anyone
  { file: "schemes/[id]/review/page.tsx", names: "never", paths: (c) => [`/schemes/${c.S}/review`] },
  { file: "schemes/[id]/audit-pack/route.ts", names: "scheme", paths: (c) => [`/schemes/${c.S}/audit-pack`, `/schemes/${c.S}/audit-pack?names=1`] },
  { file: "schemes/[id]/export/route.ts", names: "scheme", paths: (c) => [`/schemes/${c.S}/export`, `/schemes/${c.S}/export?part=coded`] },
  { file: "schemes/[id]/build/page.tsx", names: "never", paths: (c) => [`/schemes/${c.S}/build`] },
  { file: "schemes/[id]/build/[doc]/page.tsx", names: "scheme", paths: (c) => PAGE_DOCS.map((d) => `/schemes/${c.S}/build/${d}`) },
  { file: "schemes/[id]/build/[doc]/history/page.tsx", names: "scheme", paths: (c) => PAGE_DOCS.map((d) => `/schemes/${c.S}/build/${d}/history`) },
  { file: "schemes/[id]/build/[doc]/print/route.ts", names: "scheme", paths: (c) => [...DOCS.map((d) => `/schemes/${c.S}/build/${d}/print?lang=bg`), `/schemes/${c.S}/build/certificate/print?lang=bg&p=${encodeURIComponent(c.code)}`] },
  { file: "schemes/[id]/doc/[doc]/page.tsx", names: "scheme", paths: (c) => PAGE_DOCS.map((d) => `/schemes/${c.S}/doc/${d}`) },
  // …and one laboratory's certificate (?p=)
  { file: "schemes/[id]/doc/[doc]/print/route.ts", names: "scheme", paths: (c) => [...DOCS.map((d) => `/schemes/${c.S}/doc/${d}/print?lang=bg`), `/schemes/${c.S}/doc/certificate/print?lang=bg&p=${encodeURIComponent(c.code)}`] },
  { file: "schemes/[id]/fill/[doc]/route.ts", names: "scheme", paths: (c) => [...c.forms, "results-coded", "registered-coded"].map((d) => `/schemes/${c.S}/fill/${d}?lang=bg`) },
  { file: "schemes/[id]/uploaded/[doc]/route.ts", names: "scheme", paths: (c) => PAGE_DOCS.map((d) => `/schemes/${c.S}/uploaded/${d}`) },
  // the editions (3.0): the list, and each edition's file — the regression issues one
  // (c.editions) and sends it; an id that is no edition answers 404 for everyone
  { file: "holidays/page.tsx", names: "never", paths: () => ["/holidays", "/holidays?year=2027"] },
  { file: "schemes/[id]/batches/page.tsx", names: "never", paths: (c) => [`/schemes/${c.S}/batches`] },
  { file: "schemes/[id]/amendments/page.tsx", names: "never", paths: (c) => [`/schemes/${c.S}/amendments`] },
  { file: "schemes/[id]/editions/page.tsx", names: "never", paths: (c) => [`/schemes/${c.S}/editions`, `/schemes/${c.S}/editions?doc=invitation`] },
  { file: "schemes/[id]/editions/[edition]/route.ts", names: "never", paths: (c) => [...(c.editions ?? []).flatMap((e) => [`/schemes/${c.S}/editions/${e}?lang=bg`, `/schemes/${c.S}/editions/${e}?lang=en&download=1`]), `/schemes/${c.S}/editions/00000000-0000-4000-8000-000000000000`] },
  { file: "schemes/[id]/released/[doc]/route.ts", names: "scheme", paths: (c) => ["invitation", "results", "instruction"].map((d) => `/schemes/${c.S}/released/${d}`) },
  { file: "schemes/[id]/lab-docs/[code]/[slot]/route.ts", names: "scheme", paths: (c) => [`/schemes/${c.S}/lab-docs/${encodeURIComponent(c.code)}/declaration`] },
  { file: "schemes/[id]/lab-uploads/[code]/[slot]/route.ts", names: "scheme", paths: (c) => [`/schemes/${c.S}/lab-uploads/${encodeURIComponent(c.code)}/results`] },
  // POST only — the PDF of a document (scripts/verify-confidentiality.mjs posts it)
  { file: "api/pdf/route.ts", names: "scheme", paths: () => [], post: (c) => [...["registered", "results-coded", "certificate", "order", "registered-coded"].map((d) => ({ id: c.S, doc: d, lang: "bg" })), { id: c.S, doc: "certificate", lang: "bg", participant: c.code }] },
  { file: "api/cron/notify/route.ts", names: "never", paths: () => ["/api/cron/notify"] },

  // ── the laboratory's portal ──
  { file: "lab/page.tsx", names: "own", paths: () => ["/lab"] },
  { file: "lab/profile/page.tsx", names: "own", paths: () => ["/lab/profile"] },
  // a participant's user's review of its own entity's data (4.4)
  { file: "lab/confirm/page.tsx", names: "own", paths: () => ["/lab/confirm"] },
  // its two-step sign-in, where PTS requires it (4.4 review)
  { file: "lab/two-factor/page.tsx", names: "own", paths: () => ["/lab/two-factor"] },
  // its home: the laboratory switcher, its participations and notices (4.6)
  { file: "lab/overview/page.tsx", names: "own", paths: () => ["/lab/overview", "/lab/overview?view=archive"] },
  // one participation's own page (5.5): only one of the reader's own — any other id is not found
  { file: "lab/p/[id]/page.tsx", names: "own", paths: (c) => [...(c.pid ? [`/lab/p/${c.pid}`] : []), "/lab/p/00000000-0000-4000-8000-000000000000"] },
  // the results form (6.1): the participation's own, its draft as typed — never another's
  { file: "lab/p/[id]/results/page.tsx", names: "own", paths: (c) => [...(c.pid ? [`/lab/p/${c.pid}/results`] : []), "/lab/p/00000000-0000-4000-8000-000000000000/results"] },
  { file: "lab/login/page.tsx", names: "never", paths: () => ["/lab/login"] },
  { file: "lab/doc/[scheme]/[doc]/route.ts", names: "own", paths: (c) => ["invitation", "report", "certificate", "results"].flatMap((d) => [`/lab/doc/${c.S}/${d}`, `/lab/doc/${c.OTHER}/${d}`]) },
  { file: "lab/labdoc/[scheme]/[slot]/route.ts", names: "own", paths: (c) => [`/lab/labdoc/${c.S}/proforma`, `/lab/labdoc/${c.OTHER}/proforma`] },
  { file: "lab/upload/[scheme]/[slot]/route.ts", names: "own", paths: (c) => [`/lab/upload/${c.S}/results`, `/lab/upload/${c.OTHER}/results`] },

  // ── public: no account needed ──
  { file: "apply/page.tsx", names: "never", paths: () => ["/apply"] },
  { file: "apply/[id]/page.tsx", names: "never", paths: (c) => [`/apply/${c.S}`, `/apply/${c.OTHER}`] },
  { file: "apply/[id]/plan/route.ts", names: "never", paths: (c) => [`/apply/${c.S}/plan`, `/apply/${c.OTHER}/plan`] },
  { file: "apply/thanks/page.tsx", names: "never", paths: () => ["/apply/thanks"] },
  { file: "register/page.tsx", names: "never", paths: () => ["/register"] },
  { file: "register/thanks/page.tsx", names: "never", paths: () => ["/register/thanks"] },
  { file: "login/page.tsx", names: "never", paths: () => ["/login", "/login?denied=1"] },
  { file: "auth/confirm/page.tsx", names: "never", paths: () => ["/auth/confirm"] },
  { file: "auth/confirmed/page.tsx", names: "never", paths: () => ["/auth/confirmed"] },
  { file: "auth/forgot/page.tsx", names: "never", paths: () => ["/auth/forgot", "/auth/forgot?area=lab"] },
  { file: "auth/set-password/page.tsx", names: "never", paths: () => ["/auth/set-password"] },

  // ── development only ──
  { file: "dev/persona/route.ts", names: "dev", paths: () => [] },
  { file: "dev/code/route.ts", names: "dev", paths: () => [] },
];

export { DOCS, PAGE_DOCS };
