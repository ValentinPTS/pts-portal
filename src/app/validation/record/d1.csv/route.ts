import { requireSection } from "@/lib/access";
import { d1Csv } from "@/lib/d1-check";

// The D1 set as a CSV (plan part 8.6; П 7.4.1 т. 4.6.2): the pairs as typed, the portal's result and
// the other method's, for the checker to repeat with an independent tool (e.g. Excel) before signing the
// validation record. No participant in it. Through the «Валидиране» section's gate.
export async function GET() {
  await requireSection("validation");
  return new Response(d1Csv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="validation-D1-set.csv"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const HEAD = () => new Response(null, { status: 405, headers: { allow: "GET" } });
