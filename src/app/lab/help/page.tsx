import { requireParticipant } from "@/lib/participant-session";
import { getServerT } from "@/lib/i18n-server";
import ParticipantNav from "@/components/ParticipantNav";
import HelpContent from "@/components/HelpContent";

// «Помощ» for a laboratory's user (the redesign, R1): how taking part works and how to reach PTS. Reads no data of the
// laboratory or of any scheme — only who is signed in, for the header.
export default async function LabHelpPage() {
  const { user, persona } = await requireParticipant();
  const { lang } = await getServerT();
  const lg = lang === "en" ? "en" : "bg";
  return (
    <>
      <ParticipantNav lang={lg} active="help" name={user.name} role={user.role} persona={persona} />
      <main id="content" style={{ padding: "32px 24px" }}>
        <HelpContent lang={lg} audience="lab" />
      </main>
    </>
  );
}
