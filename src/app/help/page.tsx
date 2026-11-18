import { requireStaff } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";
import HelpContent from "@/components/HelpContent";

// «Помощ» for the PTS team (the redesign, R1): how a scheme goes and how to reach PTS. Reads no data.
export default async function TeamHelpPage() {
  await requireStaff();
  const { lang } = await getServerT();
  return <HelpContent lang={lang === "en" ? "en" : "bg"} audience="staff" />;
}
