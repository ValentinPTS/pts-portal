import { requireSection } from "@/lib/access";
import PlannedSection from "@/components/PlannedSection";

// «Доставки» (plan part 2.7; built in 5.6): shipments go to a named laboratory —
// who dispatches (D18, 2.4).
export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  await requireSection("deliveries");
  return (
    <PlannedSection section="deliveries"
      will={{ bg: "Тук ще са изпращанията и получаванията на обектите по всички схеми: кой какво е изпратил, кога е получено и в какво състояние.", en: "The shipments and receipts of the items across schemes: what was sent, when it arrived and in what condition." }}
      meanwhile={{ bg: "Дотогава изпращането и получаването се записват в «Участници» на всяка схема, а при калибриране — във веригата на схемата.", en: "Until then dispatch and receipt are recorded under «Participants» of each scheme, and for calibration in the scheme's chain.", href: "/", link: { bg: "Към «Схеми»", en: "To «Schemes»" } }} />
  );
}
