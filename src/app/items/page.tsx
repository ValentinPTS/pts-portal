import { listLibraryItems } from "@/lib/library-store";
import ItemsManager from "@/components/ItemsManager";
import { getServerT } from "@/lib/i18n-server";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

// "My items" — manage the owner's reusable snippet library (the MY ITEMS group in
// the document editor). Owner-gated (proxy + requireOwner).
export default async function ItemsPage() {
  await requireOwner();
  const items = await listLibraryItems();
  const { tr } = await getServerT();

  return (
    <div>
      <h1 className="text-3xl font-bold" style={{ color: "var(--green-dark)", letterSpacing: "-0.01em" }}>{tr("items.title")}</h1>
      <p style={{ color: "var(--muted)", marginTop: 4, marginBottom: 18 }}>{tr("items.subtitle")}</p>
      <ItemsManager initial={items} />
    </div>
  );
}
