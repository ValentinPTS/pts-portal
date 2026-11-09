import { redirect } from "next/navigation";
import { requireCap } from "@/lib/access";

// The old new-scheme form, retired in part 3.1: it built «PTS YY/MM-X-N» from loose
// fields (an empty month made «26/00»), with no PTS/ILC, no S, no NA and no journal.
// A scheme is created from the folder explorer's dialog, where the number is read and
// its kind, activity and accreditation are kept (lib/scheme-number).
export default async function NewSchemePage() {
  await requireCap("scheme.create"); // the Order starts a scheme — the head (2.4)
  redirect("/files/testing");
}
