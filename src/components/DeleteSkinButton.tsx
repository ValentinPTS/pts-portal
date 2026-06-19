"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomSkinAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

// Delete a custom skin (gallery card). Confirms first; schemes using it fall back
// to Classic automatically, and a per-type default pointing at it is reset.
export default function DeleteSkinButton({ id, name }: { id: string; name: string }) {
  const { t } = useLang();
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn"
      style={{ fontSize: 13 }}
      disabled={pending}
      onClick={() => {
        if (!confirm(`${name} — ${t("skins.deleteConfirm")}`)) return;
        start(async () => {
          await deleteCustomSkinAction(id);
          router.refresh();
        });
      }}
    >
      {pending ? t("common.deleting") : t("common.delete")}
    </button>
  );
}
