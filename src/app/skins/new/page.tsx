import SkinEditor from "@/components/SkinEditor";
import { requireCapAnywhere } from "@/lib/access";
import { newSkinData } from "@/skins/custom";

// Create a new custom skin. Starts from the Classic base; "Start from" in the
// editor switches the base. Saving persists to the DB (custom_skins).
export default async function NewSkinPage() {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  return <SkinEditor mode="new" initial={newSkinData("classic")} />;
}
