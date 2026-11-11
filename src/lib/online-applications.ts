// Online applications (заявки through the portal) — plan part 0.4, Реш. 1.
//
// In the transition PTS keeps the PDF application form and enters participants
// itself (Реш. 145–146): a lab applies with the PDF from ptsbg.eu, and PTS adds it
// from the scheme's «Участници». The portal's own application wizard — public and
// signed-in alike — accepts nothing until part 9.2 switches this back on.
//
// The switch is read on the server by submitApplicationAction (the real boundary:
// a server action can be POSTed directly) and by the pages, which then show the
// PDF route instead of the form. No imports, so client components may read it.
export const ONLINE_APPLICATIONS_OPEN = false;

// Where a laboratory gets the PDF application form meanwhile.
export const PDF_APPLICATION_URL = "https://ptsbg.eu";

// Where a complaint or an appeal goes — the website's identified form (П 7.6), never the portal's anonymous
// feedback (10.3). The site's exact address for it is PTS's / Creativiso's to give: until then, the site.
export const COMPLAINTS_URL = "https://ptsbg.eu";
