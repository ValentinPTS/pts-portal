import SkinEditor from "@/components/SkinEditor";
import { newSkinData } from "@/skins/custom";
import { requireStaff } from "@/lib/roles";

// Create a new custom skin. Starts from the Classic base; "Start from" in the
// editor switches the base. Saving persists to the DB (custom_skins).
export default async function NewSkinPage() {
  await requireStaff(); // read gate: manager/staff/auditor only
  return <SkinEditor mode="new" initial={newSkinData("classic")} />;
}
