import { listLibraryItems } from "@/lib/library-store";
import { LIBRARY } from "@/lib/blocks";
import ItemsManager from "@/components/ItemsManager";
import { getServerT } from "@/lib/i18n-server";
import { requireStaff } from "@/lib/roles";

export const dynamic = "force-dynamic";

// "My items" — manage the reusable snippet library (the MY ITEMS group in the
// document editor). Internal-staff page (proxy + requireStaff); the add/edit/delete
// actions are requireWriter, so auditors can view but not change. The app's built-in
// starter elements (LIBRARY) are offered here too, so they can be customized/edited.
export default async function ItemsPage() {
  await requireStaff();
  const items = await listLibraryItems();
  const { tr } = await getServerT();
  const builtins = LIBRARY.map((e) => ({ id: e.id, name: e.name, category: e.category, bg: e.bg, en: e.en }));

  return (
    <div>
      <h1 className="text-3xl font-bold" style={{ color: "var(--green-dark)", letterSpacing: "-0.01em" }}>{tr("items.title")}</h1>
      <p style={{ color: "var(--muted)", marginTop: 4, marginBottom: 18 }}>{tr("items.subtitle")}</p>
      <ItemsManager initial={items} builtins={builtins} />
    </div>
  );
}
