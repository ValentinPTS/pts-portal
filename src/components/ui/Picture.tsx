import Image from "next/image";

// Redesign R5 — a picture that helps a person feel where they are (made with Higgsfield from generic scenes only —
// nothing of the portal's data was ever in a prompt). The files in public/brand/pictures are already sized and
// compressed (WebP), so they are served as they are (unoptimized: no optimiser round trip). They live under /brand/,
// a public path to the proxy — it refuses any picture asked for from a portal path (the security sweep, R3S-2).
// Decoration only — alt="": a screen reader skips it, the words beside it carry the meaning.
export type PictureName =
  | "welcome" | "nothing-to-do" | "no-participations" | "certificate-ready"
  | "step-preparation" | "step-registration" | "step-dispatch" | "step-results" | "step-evaluation";

export const PICTURE_SIZE: Record<PictureName, readonly [number, number]> = {
  welcome: [960, 720],
  "nothing-to-do": [960, 720],
  "no-participations": [960, 720],
  "certificate-ready": [960, 720],
  "step-preparation": [320, 320],
  "step-registration": [320, 320],
  "step-dispatch": [320, 320],
  "step-results": [320, 320],
  "step-evaluation": [320, 320],
};

export default function Picture({ name, className }: { name: PictureName; className?: string }) {
  const [w, h] = PICTURE_SIZE[name];
  return (
    <Image src={`/brand/pictures/${name}.webp`} alt="" width={w} height={h} unoptimized
      className={`ui-pic${className ? ` ${className}` : ""}`} data-picture={name} />
  );
}
