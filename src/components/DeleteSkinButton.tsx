"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomSkinAction } from "@/lib/actions";

// Delete a custom skin (gallery card). Confirms first; schemes using it fall back
// to Classic automatically, and a per-type default pointing at it is reset.
export default function DeleteSkinButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn"
      style={{ fontSize: 13 }}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete the skin “${name}”? Schemes using it fall back to Classic.`)) return;
        start(async () => {
          await deleteCustomSkinAction(id);
          router.refresh();
        });
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
