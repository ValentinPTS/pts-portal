// The pages that act when opened — a line in the journal («names viewed», «exported», «opened»), a document
// marked opened, a file handed over. Opened from ANOTHER site they would act in the viewer's name: the proxy
// asks first (round 5, R5SB-3), and sign-in never lands on one by its «next» (round 6, Q3). Round 6 (R6S-5)
// added the pages that show names with codes: the participants, the results, the traceability, a
// participant's page and its versions, a document's view and editor, the deliveries. Round 7 (R7S-3): the
// organisations, the registrations, the invoices and a scheme's editions — every page that opens the
// identity store for anything but a laboratory's own data (a test holds it so). Its own module: the
// proxy imports it, and must not import next/headers.
export const ACTS_WHEN_OPENED = /^\/(?:open(?:\/|$)|registrations(?:\/|$)|invoices(?:\/|$)|users\/(?:declarations|applications)\/|organizations(?:\/|$)|deliveries(?:\/|$)|lab\/(?:labdoc|doc|upload)\/|schemes\/[^/]+\/(?:export(?:\/|$)|audit-pack(?:\/|$)|fill\/|editions(?:\/|$)|released\/|uploaded\/|lab-uploads\/|lab-docs\/|analysis-import\/|participants(?:\/|$)|results(?:\/|$)|traceability(?:\/|$)|doc\/|build\/))/;
