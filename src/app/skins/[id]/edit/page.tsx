import { notFound } from "next/navigation";
import SkinEditor from "@/components/SkinEditor";
import { getCustomSkin } from "@/lib/custom-skins";

// Edit an existing custom skin. Built-in skins (classic/modern/minimal) aren't
// editable — only user-created ones live in the DB.
export default async function EditSkinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skin = await getCustomSkin(id);
  if (!skin) notFound();
  const { id: _id, ...rest } = skin;
  return <SkinEditor mode="edit" skinId={id} initial={rest} />;
}
