import { requireSection } from "@/lib/access";
import PlannedSection from "@/components/PlannedSection";

// «Фактури» (plan part 2.7; built in 5.8): a proforma or an invoice names the
// laboratory — who works with the participants (2.4).
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await requireSection("invoices");
  return (
    <PlannedSection section="invoices"
      will={{ bg: "Тук ще са проформите и фактурите на участниците по всички схеми и дали са платени.", en: "The participants' proformas and invoices across schemes, and whether they are paid." }}
      meanwhile={{ bg: "Дотогава проформата се изпраща от страницата на участника в схемата.", en: "Until then a proforma is sent from the participant's page in the scheme.", href: "/", link: { bg: "Към «Схеми»", en: "To «Schemes»" } }} />
  );
}
