// Dark, full-bleed public chrome for the lab-facing application flow — mirrors the
// look of the public ptsbg.eu site (dark green/black, light input fields).
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#10140d", color: "#e7ece1" }}>
      <div className="mx-auto px-5 py-10" style={{ maxWidth: 940 }}>
        {children}
      </div>
    </div>
  );
}
