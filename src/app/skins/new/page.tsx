import SkinEditor from "@/components/SkinEditor";
import { newSkinData } from "@/skins/custom";

// Create a new custom skin. Starts from the Classic base; "Start from" in the
// editor switches the base. Saving persists to the DB (custom_skins).
export default function NewSkinPage() {
  return <SkinEditor mode="new" initial={newSkinData("classic")} />;
}
