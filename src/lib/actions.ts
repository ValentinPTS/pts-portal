"use server";

import { randomInt, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getScheme, updateScheme, addScheme, deleteScheme, listSchemeSummaries } from "./store";
import { blankScheme } from "./new-scheme";
import { nextProject, schemeYear } from "./folders";
import { addParticipant, listParticipants } from "./participants";
import { addApplication, listApplications, setApplicationStatus } from "./applications";
import { metricsForScheme, buildScoring, computeAssigned } from "./scoring";
import { requireOwner } from "./auth";
import { addLibraryItem, updateLibraryItem, deleteLibraryItem, type LibraryItem } from "./library-store";
import { addSavedTemplate, deleteSavedTemplate, type SavedTemplate } from "./saved-templates";
import { getSkinAsync, setDefaultSkinAsync } from "../skins";
import { sanitizeSkinData } from "../skins/custom";
import {
  upsertCustomSkin, getCustomSkin, deleteCustomSkin, getDefaultSkinId, setDefaultSkinId,
} from "./custom-skins";
import { getDb } from "./supabase";
import { getLabByEmail, addLab, getLab, updateLab } from "./labs";
import { getLabSession } from "./lab-auth";
import type { Block } from "./types";

// Save a reusable snippet to the owner's global library ("+ Add your own").
// Returns the created item so the editor can show it immediately.
export async function addLibraryItemAction(name: string, bg: string, en: string, category?: string): Promise<{ item?: LibraryItem; error?: string }> {
  await requireOwner();
  if (!name.trim() || !bg.trim()) return { error: "A name and Bulgarian text are required." };
  const item = await addLibraryItem({ name: name.trim(), bg: bg.trim(), en: en.trim(), category: (category ?? "").trim() || undefined });
  revalidatePath("/items", "page");
  return { item };
}

// Edit an existing library item (the "My items" management page).
export async function updateLibraryItemAction(id: string, name: string, bg: string, en: string, category?: string): Promise<{ item?: LibraryItem; error?: string }> {
  await requireOwner();
  if (!id) return { error: "Missing id." };
  if (!name.trim() || !bg.trim()) return { error: "A name and Bulgarian text are required." };
  const item = await updateLibraryItem(id, {
    name: name.trim(), bg: bg.trim(), en: en.trim(), category: (category ?? "").trim() || "My items",
  });
  if (!item) return { error: "Item not found." };
  revalidatePath("/items", "page");
  return { item };
}

export async function deleteLibraryItemAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireOwner();
  if (!id) return { error: "Missing id." };
  await deleteLibraryItem(id);
  revalidatePath("/items", "page");
  return { ok: true };
}

// ── Document builder: free BG⇄EN translation (MyMemory) + save composed blocks ──
// Swappable provider — only this function talks to the translator, so moving to a
// self-hosted/private one later is a one-place change. Never uses the Claude API.
function chunkText(t: string, max: number): string[] {
  if (t.length <= max) return [t];
  const parts: string[] = [];
  let cur = "";
  for (const sentence of t.split(/(?<=[.!?…])\s+/)) {
    if ((cur + " " + sentence).trim().length > max) {
      if (cur) parts.push(cur.trim());
      if (sentence.length > max) {
        for (let i = 0; i < sentence.length; i += max) parts.push(sentence.slice(i, i + max));
        cur = "";
      } else cur = sentence;
    } else cur = (cur + " " + sentence).trim();
  }
  if (cur) parts.push(cur.trim());
  return parts;
}

export async function translateAction(
  text: string,
  from: "bg" | "en",
  to: "bg" | "en"
): Promise<{ text?: string; error?: string }> {
  await requireOwner(); // no-op until auth is on; then owners-only
  const t = (text ?? "").trim();
  if (!t) return { text: "" };
  try {
    const out: string[] = [];
    for (const chunk of chunkText(t, 480)) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}`;
      const res = await fetch(url, { headers: { "User-Agent": "PTS-Portal" } });
      if (!res.ok) return { error: `Translator unavailable (${res.status}).` };
      const data = await res.json();
      const piece = data?.responseData?.translatedText;
      if (typeof piece !== "string" || !piece) return { error: "No translation returned." };
      out.push(piece);
    }
    return { text: out.join(" ") };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Save the current document (both languages) as a reusable whole-document
// template — a starting point for the SAME document in any scheme of the same
// type (testing/calibration). Returns the created template so the editor can list it.
export async function saveDocTemplateAction(
  docKey: string,
  type: "T" | "C",
  name: string,
  bg: string,
  en: string
): Promise<{ item?: SavedTemplate; error?: string }> {
  await requireOwner();
  if (!name.trim()) return { error: "A template name is required." };
  if (!bg.trim() && !en.trim()) return { error: "Nothing to save — the document is empty." };
  const item = await addSavedTemplate({
    docKey, type: type === "C" ? "C" : "T", name: name.trim(), bg: String(bg ?? ""), en: String(en ?? ""),
  });
  return { item };
}

export async function deleteDocTemplateAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireOwner();
  if (!id) return { error: "Missing id." };
  await deleteSavedTemplate(id);
  return { ok: true };
}

// Set the document skin (visual theme) for a scheme. Every document for the scheme
// then renders in that skin. The id is validated by resolving it (built-in OR
// custom) — an unknown id resolves to "classic", so we never store a dangling ref.
export async function saveSchemeSkinAction(schemeId: string, skinId: string) {
  await requireOwner();
  const scheme = await getScheme(schemeId);
  if (!scheme) throw new Error("Scheme not found");
  const resolved = await getSkinAsync(skinId);
  await updateScheme(schemeId, { skin: resolved.meta.id });
  revalidatePath(`/schemes/${schemeId}`, "layout");
}

// Set the default skin for a scheme type (testing/calibration) from the gallery —
// persisted in app_settings. The id is validated by resolving it first.
export async function setDefaultSkinAction(formData: FormData) {
  await requireOwner();
  const type = String(formData.get("type")) === "C" ? "C" : "T";
  const resolved = await getSkinAsync(String(formData.get("skinId") ?? ""));
  await setDefaultSkinAsync(type, resolved.meta.id);
  revalidatePath("/skins", "page");
}

// ── Custom skins: create / update / delete (the visual skin editor) ──────────
// The editor posts a plain skin-data object; sanitizeSkinData() is the trust
// boundary (hex-only colours, allow-listed fonts, fixed element keys, restricted
// logo). Owners only. Never trusts the client shape.
export async function createCustomSkinAction(input: unknown): Promise<{ id?: string; error?: string }> {
  await requireOwner();
  if (!String((input as { name?: unknown })?.name ?? "").trim()) return { error: "A skin name is required." };
  const id = randomUUID();
  await upsertCustomSkin(sanitizeSkinData(input, id));
  revalidatePath("/skins", "page");
  return { id };
}

export async function updateCustomSkinAction(id: string, input: unknown): Promise<{ id?: string; error?: string }> {
  await requireOwner();
  if (!id || !(await getCustomSkin(id))) return { error: "Skin not found." };
  if (!String((input as { name?: unknown })?.name ?? "").trim()) return { error: "A skin name is required." };
  await upsertCustomSkin(sanitizeSkinData(input, id));
  revalidatePath("/skins", "page");
  revalidatePath(`/skins/${id}/edit`, "page");
  return { id };
}

export async function deleteCustomSkinAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireOwner();
  if (!id) return { error: "Missing id." };
  await deleteCustomSkin(id);
  // If a per-type default pointed at the deleted skin, reset it to Classic.
  // (Schemes that chose it fall back to Classic automatically when resolving.)
  for (const t of ["T", "C"] as const) {
    if ((await getDefaultSkinId(t)) === id) await setDefaultSkinId(t, "classic");
  }
  revalidatePath("/skins", "page");
  return { ok: true };
}

// Upload a custom logo for the skin editor → Supabase Storage (public bucket), and
// return the public https URL (which the skin's `logo` field then stores; it's
// already allowed by safeLogo). Owners only. Raster-only + size-capped + random
// filename, so there's no SVG-XSS, no path control, and no oversized uploads.
const LOGO_BUCKET = "skin-assets";
const LOGO_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export async function uploadSkinLogoAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireOwner();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file received." };
  const ext = LOGO_EXT[file.type];
  if (!ext) return { error: "Use a PNG, JPG or WEBP image." };
  if (file.size > 1_500_000) return { error: "Image too large (max 1.5 MB)." };
  const db = getDb();
  if (!db) return { error: "Uploads need Supabase configured." };
  try {
    const { data: bucket } = await db.storage.getBucket(LOGO_BUCKET);
    if (!bucket) {
      const { error: be } = await db.storage.createBucket(LOGO_BUCKET, {
        public: true, fileSizeLimit: "2MB", allowedMimeTypes: Object.keys(LOGO_EXT),
      });
      if (be && !/exist/i.test(be.message)) throw be;
    }
    const path = `logos/${randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error } = await db.storage.from(LOGO_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw error;
    return { url: db.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl };
  } catch (e) {
    return { error: (e as Error)?.message || "Upload failed." };
  }
}

// Save the Word-like editor's HTML for a document (both languages).
export async function saveDocHtmlAction(schemeId: string, docKey: string, bg: string, en: string) {
  await requireOwner(); // no-op until auth is on; then owners-only
  const scheme = await getScheme(schemeId);
  if (!scheme) throw new Error("Scheme not found");
  const docs = { ...(scheme.docs ?? {}), [docKey]: { bg: String(bg ?? ""), en: String(en ?? "") } };
  await updateScheme(schemeId, { docs });
  revalidatePath(`/schemes/${schemeId}/build/${docKey}`, "page");
}

// Translate a whole document's HTML BG→EN, preserving tags/images (only text runs
// are translated, via the free MyMemory provider). The owner then edits the EN.
export async function translateDocHtmlAction(html: string): Promise<{ html?: string; error?: string }> {
  await requireOwner();
  const parts = String(html ?? "").split(/(<[^>]+>)/);
  const out: string[] = [];
  for (const part of parts) {
    if (part.startsWith("<") || !part.trim()) {
      out.push(part);
      continue;
    }
    const r = await translateAction(part, "bg", "en");
    out.push(r.error ? part : r.text ?? part);
  }
  return { html: out.join("") };
}

export async function saveComposedAction(schemeId: string, docKey: string, blocksJson: string) {
  await requireOwner(); // no-op until auth is on; then owners-only
  const scheme = await getScheme(schemeId);
  if (!scheme) throw new Error("Scheme not found");
  let parsed: unknown;
  try {
    parsed = JSON.parse(blocksJson);
  } catch {
    throw new Error("Invalid blocks payload");
  }
  const arr = Array.isArray(parsed) ? (parsed as Block[]) : [];
  const clean: Block[] = arr.slice(0, 300).map((b, i) => ({
    id: typeof b?.id === "string" ? b.id : `b${i}`,
    type: b?.type === "heading" || b?.type === "field" ? b.type : "text",
    bg: typeof b?.bg === "string" ? b.bg : "",
    en: typeof b?.en === "string" ? b.en : "",
    field: typeof b?.field === "string" ? b.field : undefined,
  }));
  const composed = { ...(scheme.composed ?? {}), [docKey]: clean };
  await updateScheme(schemeId, { composed });
  revalidatePath(`/schemes/${schemeId}/build/${docKey}`, "page");
}

// ── public application form: lightweight in-memory rate-limit per IP ──────────
const appHits = new Map<string, number[]>();
function allowSubmission(ip: string, max = 8, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  // Bound memory: when the map grows large, drop entries whose window has expired
  // (a flood of unique IPs would otherwise leak one entry per IP forever).
  if (appHits.size > 5000) {
    for (const [k, v] of appHits) {
      if (v.every((t) => now - t >= windowMs)) appHits.delete(k);
    }
  }
  const arr = (appHits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    appHits.set(ip, arr);
    return false;
  }
  arr.push(now);
  appHits.set(ip, arr);
  return true;
}

// Public self-service application (заявка). No auth (public form). Spam defence:
// a honeypot field + a per-IP rate limit; both fail silently to the thank-you
// page so a bot/abuser learns nothing.
export async function submitApplicationAction(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const schemeId = get("schemeId");

  if (get("website")) redirect("/apply/thanks"); // honeypot tripped → drop quietly
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!allowSubmission(ip)) redirect("/apply/thanks"); // rate-limited → drop quietly

  const scheme = await getScheme(schemeId);
  // basic server-side validation (the client validates too)
  if (!scheme || !get("labName") || !get("email")) redirect(schemeId ? `/apply/${schemeId}` : "/apply");

  const selections: Record<string, number> = {};
  scheme.parameters.forEach((_, i) => {
    const n = parseInt(get(`sel_${i}`) || "0", 10);
    if (Number.isFinite(n) && n > 0) selections[String(i)] = n;
  });

  await addApplication(schemeId, {
    labName: get("labName"),
    accreditationCert: get("accreditationCert"),
    manager: get("manager"),
    contactPerson: get("contactPerson"),
    email: get("email"),
    phone: get("phone"),
    companyName: get("companyName"),
    registeredAddress: get("registeredAddress"),
    eik: get("eik"),
    vat: get("vat"),
    mol: get("mol"),
    deliveryAddress: get("deliveryAddress"),
    postalCode: get("postalCode"),
    selections,
    // if a logged-in lab is applying, thread this заявка to its account
    labId: (await getLabSession())?.lab.id,
  });

  redirect("/apply/thanks");
}

// Owner approves a pending application → creates the participant (auto code) and
// marks the application approved.
export async function approveApplicationAction(formData: FormData) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  const schemeId = String(formData.get("schemeId") ?? "");
  const appId = String(formData.get("appId") ?? "");
  const app = (await listApplications(schemeId)).find((a) => a.id === appId);
  if (!app) redirect(`/schemes/${schemeId}/applications`);

  const total = Object.values(app.selections).reduce((a, b) => a + b, 0) || 1;

  // Phase 2b: resolve (or create) the lab's PERMANENT account from the application,
  // then link this participation to it so it shows up in the lab's portal. The
  // account is created here; the owner sends the portal invite separately.
  let labId: string | undefined;
  if (app.email) {
    const existing = await getLabByEmail(app.email);
    const lab = existing ?? (await addLab({
      email: app.email, name: app.labName, accreditationCert: app.accreditationCert,
      contactPerson: app.contactPerson, phone: app.phone, registeredAddress: app.registeredAddress,
      eik: app.eik, vat: app.vat, mol: app.mol,
    }));
    labId = lab.id;
  }

  await addParticipant({
    schemeId,
    labName: app.labName,
    contact: app.contactPerson,
    email: app.email,
    phone: app.phone,
    deliveryAddress: app.deliveryAddress,
    participations: total,
    labId,
  });
  await setApplicationStatus(schemeId, appId, "approved");

  revalidatePath(`/schemes/${schemeId}`, "layout");
  redirect(`/schemes/${schemeId}/applications`);
}

// A lab edits its OWN profile. Scoped to the signed-in lab's id (a lab can never
// edit another's). Email/status/auth are not editable here (email is the login key).
export async function updateLabProfileAction(formData: FormData) {
  const ls = await getLabSession();
  if (!ls) redirect("/lab/login");
  const get = (k: string) => String(formData.get(k) ?? "").trim().slice(0, 200);
  await updateLab(ls.lab.id, {
    name: get("name") || ls.lab.name,
    accreditationCert: get("accreditationCert"),
    contactPerson: get("contactPerson"),
    phone: get("phone"),
    registeredAddress: get("registeredAddress"),
    eik: get("eik"),
    vat: get("vat"),
    mol: get("mol"),
  });
  revalidatePath("/lab");
  redirect("/lab");
}

// Owner invites a lab to the portal — sends a Supabase Auth invite (set-password)
// email and records the auth user id. Needs Supabase email/SMTP configured to
// deliver; fails soft (logs) otherwise so approving/linking still works.
export async function inviteLabAction(formData: FormData) {
  await requireOwner();
  const labId = String(formData.get("labId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");
  const lab = await getLab(labId);
  const db = getDb();
  if (lab && db) {
    try {
      const h = await headers();
      const proto = h.get("x-forwarded-proto") ?? "https";
      const host = h.get("host") ?? "";
      const origin = host ? `${proto}://${host}` : "";
      const { data, error } = await db.auth.admin.inviteUserByEmail(
        lab.email,
        origin ? { redirectTo: `${origin}/lab/login` } : undefined
      );
      if (error) throw error;
      if (data?.user?.id) await updateLab(lab.id, { authUserId: data.user.id });
    } catch (e) {
      console.warn("[invite] failed (Supabase email may not be configured):", (e as Error)?.message ?? e);
    }
  }
  if (returnTo.startsWith("/")) redirect(returnTo);
}

export async function rejectApplicationAction(formData: FormData) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  const schemeId = String(formData.get("schemeId") ?? "");
  const appId = String(formData.get("appId") ?? "");
  await setApplicationStatus(schemeId, appId, "rejected");
  revalidatePath(`/schemes/${schemeId}/applications`, "page");
  redirect(`/schemes/${schemeId}/applications`);
}

// Issue (or update) a participant's Certificate number + date. The number is
// `<scheme number>-<random 5 digits>`, generated ONCE and stored so a reprint
// keeps the same number. The date auto-fills to today but is editable.
// No redirect — revalidate in place so the doc page keeps the selected lab.
export async function issueCertificateAction(formData: FormData) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  const schemeId = String(formData.get("schemeId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const dateInput = String(formData.get("date") ?? "").trim();
  const scheme = await getScheme(schemeId);
  if (!scheme || !code) return;

  const certs = { ...(scheme.certificates ?? {}) };
  const existing = certs[code];
  const now = new Date();
  const today = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
  certs[code] = {
    no: existing?.no ?? `${scheme.number}-${randomInt(10000, 100000)}`, // generated once, kept
    date: dateInput || existing?.date || today,
  };
  await updateScheme(schemeId, { certificates: certs });
  revalidatePath(`/schemes/${schemeId}/doc/certificate`, "page");
}

export async function addParticipantAction(formData: FormData) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  const schemeId = String(formData.get("schemeId") ?? "");
  const labName = String(formData.get("labName") ?? "").trim();
  if (!schemeId || !labName) redirect(`/schemes/${schemeId}/participants`);
  const partRaw = parseInt(String(formData.get("participations") ?? "1"), 10);
  await addParticipant({
    schemeId,
    labName,
    contact: String(formData.get("contact") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    deliveryAddress: String(formData.get("deliveryAddress") ?? "").trim(),
    participations: Number.isFinite(partRaw) ? partRaw : 1,
  });
  revalidatePath(`/schemes/${schemeId}/participants`);
  redirect(`/schemes/${schemeId}/participants`);
}

// Create a new scheme from the folder explorer: type is implied by the folder,
// the official PTS number is auto-assigned for that type+year, the owner just
// names it (+ optional object). Lands on the new scheme's folder.
export async function createProjectAction(formData: FormData) {
  await requireOwner();
  const type: "T" | "C" = String(formData.get("type")) === "C" ? "C" : "T";
  const year = String(formData.get("year") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const object = String(formData.get("object") ?? "").trim();
  const slug = type === "C" ? "calibration" : "testing";
  if (!year || !name) redirect(`/files/${slug}/${year}`);

  const { id, number } = nextProject(await listSchemeSummaries(), type, year);
  if (await getScheme(id)) redirect(`/schemes/${id}`);

  const scheme = blankScheme({
    id, number, type,
    titleEn: name, titleBg: name,
    objectEn: object, objectBg: object,
    distribution: type === "C" ? "sequential" : "simultaneous",
    minParticipants: type === "C" ? 1 : 5,
  });
  scheme.name = name;
  await addScheme(scheme);

  revalidatePath("/", "layout");
  redirect(`/schemes/${id}`);
}

// Rename a scheme folder (its friendly display name). Owners only.
export async function renameSchemeAction(id: string, name: string) {
  await requireOwner();
  const scheme = await getScheme(id);
  if (!scheme) return;
  const clean = String(name ?? "").trim().slice(0, 120);
  if (!clean) return;
  await updateScheme(id, { name: clean });
  revalidatePath("/", "layout");
  revalidatePath(`/schemes/${id}`, "layout");
}

// Delete a scheme folder and everything in it (documents/applications live in the
// row; participants cascade in the DB). Destructive — the UI confirms first, and
// requireOwner() guards the direct-POST path. Lands back on the year folder.
export async function deleteSchemeAction(id: string) {
  await requireOwner();
  const scheme = await getScheme(id);
  if (!scheme) redirect("/");
  const slug = scheme!.type === "C" ? "calibration" : "testing";
  const year = schemeYear(scheme!);
  await deleteScheme(id);
  revalidatePath("/", "layout");
  redirect(`/files/${slug}/${year}`);
}

const two = (v: string) => v.replace(/\D/g, "").slice(0, 2).padStart(2, "0");

export async function createSchemeAction(formData: FormData) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const type = get("type") === "C" ? "C" : "T";
  const yy = two(get("year") || "26");
  const mm = two(get("month"));
  const seqNum = parseInt(get("seq") || "1", 10);
  const seq = Number.isFinite(seqNum) && seqNum > 0 ? seqNum : 1;

  const id = `${yy}-${mm}-${type}-${seq}`;
  const number = `PTS ${yy}/${mm}-${type}-${seq}`;

  // if it already exists, just open it
  if (await getScheme(id)) redirect(`/schemes/${id}`);

  const minRaw = parseInt(get("minParticipants") || "5", 10);
  await addScheme(
    blankScheme({
      id,
      number,
      type,
      titleEn: get("titleEn"),
      titleBg: get("titleBg"),
      objectEn: get("objectEn"),
      objectBg: get("objectBg"),
      distribution: get("distribution") === "sequential" ? "sequential" : "simultaneous",
      minParticipants: Number.isFinite(minRaw) ? minRaw : 5,
    })
  );

  revalidatePath("/", "layout");
  redirect(`/schemes/${id}/edit`);
}

// SECURITY: Server Actions are reachable via direct POST, not only the UI — so the
// owner check lives INSIDE the action (proxy.ts alone is not sufficient).
export async function updateSchemeAction(formData: FormData) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  const id = String(formData.get("id") ?? "");
  const existing = await getScheme(id);
  if (!existing) throw new Error("Scheme not found");

  const str = (k: string, fallback: string) =>
    String(formData.get(k) ?? fallback).trim();

  const schedule = existing.schedule.map((it, i) => ({
    date: str(`sched_${i}_date`, it.date),
    labelEn: str(`sched_${i}_en`, it.labelEn),
    labelBg: str(`sched_${i}_bg`, it.labelBg),
  }));

  const parameters = existing.parameters.map((p, i) => {
    const sm = parseFloat(str(`param_${i}_sigmaMin`, "").replace(",", "."));
    return {
      standardEn: str(`param_${i}_stdEn`, p.standardEn),
      standardBg: str(`param_${i}_stdBg`, p.standardBg),
      characteristicEn: str(`param_${i}_chEn`, p.characteristicEn),
      characteristicBg: str(`param_${i}_chBg`, p.characteristicBg),
      rangeEn: str(`param_${i}_rgEn`, p.rangeEn),
      rangeBg: str(`param_${i}_rgBg`, p.rangeBg),
      specimensEn: str(`param_${i}_spEn`, p.specimensEn),
      specimensBg: str(`param_${i}_spBg`, p.specimensBg),
      sigmaMin: Number.isFinite(sm) ? sm : undefined, // blank → no floor
    };
  });

  const prices = existing.prices.map((pr, i) => ({
    characteristicEn: str(`price_${i}_chEn`, pr.characteristicEn),
    characteristicBg: str(`price_${i}_chBg`, pr.characteristicBg),
    first: str(`price_${i}_first`, pr.first),
    additional: str(`price_${i}_add`, pr.additional),
  }));

  const minRaw = parseInt(str("minParticipants", String(existing.minParticipants)), 10);

  // calibration block (only for C schemes that already carry calibration data)
  let calibration = existing.calibration;
  if (existing.calibration) {
    const list = (k: string, fb: string[]) => {
      const raw = str(k, "");
      return raw ? raw.split(",").map((x) => x.trim()).filter(Boolean) : fb;
    };
    const c = existing.calibration;
    calibration = {
      ...c,
      quantityEn: str("cal_quantityEn", c.quantityEn),
      quantityBg: str("cal_quantityBg", c.quantityBg),
      unit: str("cal_unit", c.unit),
      deviceEn: str("cal_deviceEn", c.deviceEn),
      deviceBg: str("cal_deviceBg", c.deviceBg),
      points: list("cal_points", c.points),
      directionsEn: list("cal_dirEn", c.directionsEn),
      directionsBg: list("cal_dirBg", c.directionsBg),
      referenceLabEn: str("cal_refLabEn", c.referenceLabEn),
      referenceLabBg: str("cal_refLabBg", c.referenceLabBg),
      referenceLabLocEn: str("cal_refLocEn", c.referenceLabLocEn),
      referenceLabLocBg: str("cal_refLocBg", c.referenceLabLocBg),
      methodEn: str("cal_methodEn", c.methodEn),
      methodBg: str("cal_methodBg", c.methodBg),
    };
  }

  await updateScheme(id, {
    titleEn: str("titleEn", existing.titleEn),
    titleBg: str("titleBg", existing.titleBg),
    objectEn: str("objectEn", existing.objectEn),
    objectBg: str("objectBg", existing.objectBg),
    minParticipants: Number.isFinite(minRaw) ? minRaw : existing.minParticipants,
    schedule,
    parameters,
    prices,
    calibration,
  });

  revalidatePath(`/schemes/${id}`, "layout");
  redirect(`/schemes/${id}/doc/plan`);
}

// Parse a submitted results form into a Scoring object. Field naming uses
// positional indices (metric mi · participant pi) and we re-derive the same
// metric and participant order from the store, so the keys can never drift.
async function readScoringForm(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const scheme = await getScheme(id);
  if (!scheme) throw new Error("Scheme not found");
  const participants = await listParticipants(id);

  // accept both "1.5" and the BG "1,5"; blank → null (skip, don't store 0)
  const num = (k: string): number | null => {
    const raw = String(formData.get(k) ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  };

  const scoring = buildScoring(metricsForScheme(scheme), participants.map((p) => p.code), num);
  return { id, scheme, scoring };
}

// Save manually-entered results & assigned values.
export async function saveScoringAction(formData: FormData) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  const { id, scoring } = await readScoringForm(formData);
  await updateScheme(id, { scoring });
  revalidatePath(`/schemes/${id}`, "layout");
  redirect(`/schemes/${id}/results`);
}

// Save the entered results AND auto-fill the assigned value/σ/u from them using
// ISO 13528 Algorithm A (robust consensus). Testing schemes only — for
// calibration the assigned value is the reference lab's, kept manual. The filled
// values remain editable, so this is a starting point, not a lock-in.
export async function autoAssignAction(formData: FormData) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  const { id, scheme, scoring } = await readScoringForm(formData);
  if (scheme.type !== "C") {
    scoring.assigned = { ...scoring.assigned, ...computeAssigned(metricsForScheme(scheme), scoring) };
  }
  await updateScheme(id, { scoring });
  revalidatePath(`/schemes/${id}`, "layout");
  redirect(`/schemes/${id}/results`);
}
