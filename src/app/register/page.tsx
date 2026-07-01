import RegisterForm from "@/components/RegisterForm";

// Public lab-account application. The proxy excludes /register, so it's reachable
// signed-out. No account is created here — submitting stores a PENDING request that
// PTS staff review (Users & roles). `?e=` carries a server-side validation code.
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const sp = await searchParams;
  return <RegisterForm errorCode={sp.e ?? ""} />;
}
