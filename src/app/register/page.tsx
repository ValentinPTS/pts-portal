import RegisterForm from "@/components/RegisterForm";
import { privacyUrl } from "@/lib/profile-confirm-model";

// The public registration (plan part 9.1): the legal entity, its first laboratory and the person
// registering — who becomes the profile's administrator. The proxy excludes /register, so it is
// reachable signed-out. Nothing is made here: a PENDING registration (or a request to join an existing
// entity) that PTS — or the entity's administrator — decides. A mistake in the form comes back to the
// form with what was typed; every other outcome is the same neutral page.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  return <RegisterForm privacy={privacyUrl()} />;
}
