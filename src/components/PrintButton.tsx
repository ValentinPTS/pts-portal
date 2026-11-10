"use client";

/** «Печат» — the browser's print dialog (A4); hidden on the printed page itself. */
export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-sm no-print" data-print onClick={() => window.print()}>
      🖨 {label}
    </button>
  );
}
