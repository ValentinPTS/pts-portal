import Link from "next/link";
import { listSchemeSummaries } from "@/lib/store";
import { skinsForTypeAsync, getDefaultSkinIdAsync, SKINS } from "@/skins";
import { setDefaultSkinAction } from "@/lib/actions";
import { getDefaultCoverImage } from "@/lib/custom-skins";
import DeleteSkinButton from "@/components/DeleteSkinButton";
import DefaultCoverCard from "@/components/DefaultCoverCard";
import { getServerT } from "@/lib/i18n-server";

const BUILTIN = new Set(SKINS.map((s) => s.meta.id));

// Skins gallery — choose how the documents look, per scheme type. Built-in skins
// + your own custom skins, each with a live preview. Create new skins with the
// visual editor; set a per-type default.
export default async function SkinsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: t } = await searchParams;
  const type: "T" | "C" = t === "C" ? "C" : "T";
  const skins = await skinsForTypeAsync(type);
  const defId = await getDefaultSkinIdAsync(type);
  const sample = (await listSchemeSummaries()).find((s) => s.type === type);
  const defaultCover = await getDefaultCoverImage();
  const { tr } = await getServerT();

  const tab = (val: "T" | "C", label: string) => (
    <Link
      href={`/skins?type=${val}`}
      className="no-underline"
      style={{
        padding: "11px 18px", borderRadius: 10, fontWeight: type === val ? 700 : 500, fontSize: 15,
        color: type === val ? "var(--green-dark)" : "var(--muted)",
        background: type === val ? "var(--green-soft)" : "transparent",
        border: type === val ? "1px solid var(--green-light)" : "1px solid transparent",
      }}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="text-3xl font-bold" style={{ color: "var(--green-dark)", letterSpacing: "-0.01em" }}>{tr("skins.title")}</h1>
          <p style={{ color: "var(--muted)" }}>{tr("skins.subtitle")}</p>
        </div>
        <Link href="/skins/new" className="btn btn-primary" style={{ fontSize: 14 }}>{tr("skins.new")}</Link>
      </div>

      <DefaultCoverCard current={defaultCover} />

      <div className="flex gap-2 mt-4 mb-5">{tab("T", tr("skins.tabTesting"))}{tab("C", tr("skins.tabCalibration"))}</div>

      {!sample && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>{tr("skins.noSample")}</p>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
        {skins.map((sk) => {
          const isDefault = sk.meta.id === defId;
          const isCustom = !BUILTIN.has(sk.meta.id);
          const previewUrl = sample ? `/schemes/${sample.id}/doc/plan/print?lang=bg&skin=${sk.meta.id}` : "";
          return (
            <div key={sk.meta.id} className="card" style={{ overflow: "hidden", borderColor: isDefault ? "var(--green-light)" : "var(--line)", borderWidth: isDefault ? 2 : 1 }}>
              {/* live preview thumbnail */}
              <div style={{ height: 250, overflow: "hidden", background: "var(--bg)", borderBottom: "1px solid var(--line)", position: "relative" }}>
                {sample ? (
                  <iframe
                    src={previewUrl}
                    title={sk.meta.name}
                    scrolling="no"
                    style={{ width: 820, height: 1080, border: 0, transform: "scale(0.31)", transformOrigin: "top left", pointerEvents: "none", position: "absolute", top: 12, left: "50%", marginLeft: -127 }}
                  />
                ) : (
                  <div className="flex items-center justify-center" style={{ height: "100%", color: "var(--muted)", fontSize: 13 }}>{tr("skins.noPreview")}</div>
                )}
              </div>
              {/* info */}
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold" style={{ fontSize: 16 }}>{sk.meta.name}</span>
                  {isDefault && <span className="chip" style={{ background: "var(--green-dark)" }}>{tr("skins.default")}</span>}
                  {isCustom && <span className="chip" style={{ background: "var(--muted)" }}>{tr("skins.custom")}</span>}
                </div>
                <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{sk.meta.description}</p>
                <div className="flex gap-2 mt-3" style={{ flexWrap: "wrap" }}>
                  {!isDefault && (
                    <form action={setDefaultSkinAction}>
                      <input type="hidden" name="type" value={type} />
                      <input type="hidden" name="skinId" value={sk.meta.id} />
                      <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>{tr("skins.setDefault")}</button>
                    </form>
                  )}
                  {isCustom && <Link href={`/skins/${sk.meta.id}/edit`} className="btn" style={{ fontSize: 13 }}>{tr("common.edit")}</Link>}
                  {sample && (
                    <a href={previewUrl} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: 13 }}>{tr("skins.preview")}</a>
                  )}
                  {isCustom && <DeleteSkinButton id={sk.meta.id} name={sk.meta.name} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs mt-6" style={{ color: "var(--muted)" }}>{tr("skins.footer")}</p>
    </div>
  );
}
