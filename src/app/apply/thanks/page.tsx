import Link from "next/link";

export default function ApplyThanks() {
  return (
    <div className="text-center" style={{ paddingTop: 40 }}>
      <div style={{ fontSize: "3rem" }}>✅</div>
      <h1 className="text-3xl font-bold mt-3">Благодарим Ви! / Thank you!</h1>
      <p className="mt-3" style={{ color: "#cdd6c2", maxWidth: 560, margin: "12px auto 0" }}>
        Заявката Ви е получена. Ще се свържем с Вас по имейл с потвърждение и проформа фактура.
      </p>
      <p className="mt-2" style={{ color: "#aab59c", maxWidth: 560, margin: "0 auto" }}>
        Your application has been received. We will contact you by e-mail with a confirmation and a proforma invoice.
      </p>
      <Link href="/apply" className="btn btn-primary mt-7 inline-flex">
        ← Към отворените схеми / Open schemes
      </Link>
    </div>
  );
}
