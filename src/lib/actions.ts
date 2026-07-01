"use server";

import { randomInt, randomUUID, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getScheme, updateScheme, addScheme, deleteScheme, listSchemeSummaries, listSchemesInFolder, schemeNumberExists } from "./store";
import { blankScheme } from "./new-scheme";
import { nextProject } from "./folders";
import { addParticipant, listParticipants } from "./participants";
import { addApplication, listApplications, setApplicationStatus } from "./applications";
import { metricsForScheme, buildScoring, computeAssigned } from "./scoring";
import { isOwnerEmail } from "./auth";
import { addLibraryItem, updateLibraryItem, deleteLibraryItem, type LibraryItem } from "./library-store";
import { addSavedTemplate, deleteSavedTemplate, type SavedTemplate } from "./saved-templates";
import { getSkinAsync, setDefaultSkinAsync } from "../skins";
import { sanitizeSkinData } from "../skins/custom";
import {
  upsertCustomSkin, getCustomSkin, deleteCustomSkin, getDefaultSkinId, setDefaultSkinId,
  setDefaultCoverImage,
} from "./custom-skins";
import { getDb } from "./supabase";
import { getLabByEmail, addLab, getLab, updateLab } from "./labs";
import {
  addLabApplication, listLabApplications, getLabApplication, setLabApplicationReview,
  countPendingByEmail,
} from "./lab-applications";
import { validateEik } from "./verify-eik";
import { checkVies } from "./verify-vies";
import { getLabSession } from "./lab-auth";
import { addStaff, updateStaff, getStaffByEmail, getStaff } from "./staff";
import { requireManager, requireWriter, getRoleContext } from "./roles";
import { logActivity } from "./activity";
import { addCaseEvent, getCaseEvent, deleteCaseEvent } from "./case-events";
import { addRevision, getRevision, approveRevision } from "./doc-revisions";
import { createFolder, renameFolder, deleteFolder, getFolder, listChildFolders } from "./folder-tree";
import { SAMPLE_SCHEMES } from "./sample-schemes";
import { TYPE_SLUG, type FolderType } from "./folders";
import type { Block, Scheme, StaffRole, StaffStatus, LabStatus, CaseEventKind, LabRegion, VatStatus, SchemeStatus } from "./types";

const STAFF_ROLES: StaffRole[] = ["manager", "staff", "auditor"];
const SCHEME_STATUSES: SchemeStatus[] = ["draft", "open", "running", "report", "closed"];

// Save a reusable snippet to the owner's global library ("+ Add your own").
// Returns the created item so the editor can show it immediately.
export async function addLibraryItemAction(name: string, bg: string, en: string, category?: string): Promise<{ item?: LibraryItem; error?: string }> {
  await requireWriter();
  if (!name.trim() || !bg.trim()) return { error: "A name and Bulgarian text are required." };
  const item = await addLibraryItem({ name: name.trim(), bg: bg.trim(), en: en.trim(), category: (category ?? "").trim() || undefined });
  revalidatePath("/items", "page");
  return { item };
}

// Edit an existing library item (the "My items" management page).
export async function updateLibraryItemAction(id: string, name: string, bg: string, en: string, category?: string): Promise<{ item?: LibraryItem; error?: string }> {
  await requireWriter();
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
  await requireWriter();
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
  await requireWriter();
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
  await requireWriter();
  if (!name.trim()) return { error: "A template name is required." };
  if (!bg.trim() && !en.trim()) return { error: "Nothing to save — the document is empty." };
  const item = await addSavedTemplate({
    docKey, type: type === "C" ? "C" : "T", name: name.trim(), bg: String(bg ?? ""), en: String(en ?? ""),
  });
  return { item };
}

export async function deleteDocTemplateAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireWriter();
  if (!id) return { error: "Missing id." };
  await deleteSavedTemplate(id);
  return { ok: true };
}

// Set the document skin (visual theme) for a scheme. Every document for the scheme
// then renders in that skin. The id is validated by resolving it (built-in OR
// custom) — an unknown id resolves to "classic", so we never store a dangling ref.
export async function saveSchemeSkinAction(schemeId: string, skinId: string) {
  await requireWriter();
  const scheme = await getScheme(schemeId);
  if (!scheme) throw new Error("Scheme not found");
  const resolved = await getSkinAsync(skinId);
  await updateScheme(schemeId, { skin: resolved.meta.id });
  revalidatePath(`/schemes/${schemeId}`, "layout");
}

// Set the default skin for a scheme type (testing/calibration) from the gallery —
// persisted in app_settings. The id is validated by resolving it first.
export async function setDefaultSkinAction(formData: FormData) {
  await requireManager();
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
  await requireManager();
  if (!String((input as { name?: unknown })?.name ?? "").trim()) return { error: "A skin name is required." };
  const id = randomUUID();
  await upsertCustomSkin(sanitizeSkinData(input, id));
  revalidatePath("/skins", "page");
  return { id };
}

export async function updateCustomSkinAction(id: string, input: unknown): Promise<{ id?: string; error?: string }> {
  await requireManager();
  if (!id || !(await getCustomSkin(id))) return { error: "Skin not found." };
  if (!String((input as { name?: unknown })?.name ?? "").trim()) return { error: "A skin name is required." };
  await upsertCustomSkin(sanitizeSkinData(input, id));
  revalidatePath("/skins", "page");
  revalidatePath(`/skins/${id}/edit`, "page");
  return { id };
}

export async function deleteCustomSkinAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
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
  await requireManager();
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

// Upload a scheme cover photo → same public bucket (covers/ path) → public URL.
// Stored on scheme.coverImage. Owners only; raster-only + size-capped + random name.
export async function uploadCoverImageAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireWriter();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file received." };
  const ext = LOGO_EXT[file.type];
  if (!ext) return { error: "Use a PNG, JPG or WEBP image." };
  if (file.size > 2_000_000) return { error: "Image too large (max 2 MB)." };
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
    const path = `covers/${randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error } = await db.storage.from(LOGO_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw error;
    return { url: db.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl };
  } catch (e) {
    return { error: (e as Error)?.message || "Upload failed." };
  }
}

// Upload + set the GLOBAL default title-page photo (one photo, used on every scheme's
// title page that has no cover of its own). Manager-only branding setting.
export async function uploadDefaultCoverAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireManager();
  const res = await uploadCoverImageAction(formData); // reuse storage upload (raster-only, size-capped)
  if (res.url) {
    await setDefaultCoverImage(res.url);
    await logActivity("cover.default", { summary: "Default title-page photo updated" });
    revalidatePath("/skins", "page");
    revalidatePath("/", "layout");
  }
  return res;
}

export async function clearDefaultCoverAction(): Promise<{ ok?: boolean }> {
  await requireManager();
  await setDefaultCoverImage("");
  await logActivity("cover.default", { summary: "Default title-page photo cleared" });
  revalidatePath("/skins", "page");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Save the Word-like editor's HTML for a document (both languages).
export async function saveDocHtmlAction(schemeId: string, docKey: string, bg: string, en: string) {
  await requireWriter();
  const scheme = await getScheme(schemeId);
  if (!scheme) throw new Error("Scheme not found");
  const docs = { ...(scheme.docs ?? {}), [docKey]: { bg: String(bg ?? ""), en: String(en ?? "") } };
  await updateScheme(schemeId, { docs });
  // §8.3 — snapshot a revision (skips if unchanged). Records who saved it.
  const actor = (await getRoleContext()).email ?? "";
  await addRevision({ schemeId, docKey, bg: String(bg ?? ""), en: String(en ?? ""), savedBy: actor });
  await logActivity("doc.saved", { schemeId, summary: `Document “${docKey}” edited` });
  revalidatePath(`/schemes/${schemeId}/build/${docKey}`, "page");
}

// Translate a whole document's HTML BG→EN, preserving tags/images (only text runs
// are translated, via the free MyMemory provider). The owner then edits the EN.
export async function translateDocHtmlAction(html: string): Promise<{ html?: string; error?: string }> {
  await requireWriter();
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
  await requireWriter();
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
  await requireWriter();
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

  const p = await addParticipant({
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
  await logActivity("application.approved", { schemeId, targetCode: p.code, summary: `Application approved → participant ${p.code}` });
  await addCaseEvent({ schemeId, code: p.code, kind: "code_assigned", source: "auto" });

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
  await requireManager();
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

// ── RT1: staff roles (the Manager "Users & roles" screen) ──────────────────────
// All manager-gated: requireManager() is a no-op until AUTH_ENABLED=true, then it
// allows only a signed-in manager (founder in OWNER_EMAILS or an active staff
// manager) who has completed 2FA. Founders (OWNER_EMAILS) are managers by code and
// are NOT stored here, so we never create a duplicate/over-ridable record for them.

// Send a Supabase Auth invite (set-password e-mail) so a person can sign in. Needs
// Supabase email/SMTP configured to deliver; fails soft so the row/account is still
// created. redirectPath = where the invite link lands (owner /login or /lab/login).
async function sendAuthInvite(email: string, redirectPath: string): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Supabase is not configured." };
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("host") ?? "";
    const origin = host ? `${proto}://${host}` : "";
    const { data, error } = await db.auth.admin.inviteUserByEmail(
      email, origin ? { redirectTo: `${origin}${redirectPath}` } : undefined
    );
    if (error) throw error;
    return { ok: true, userId: data?.user?.id };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Invite failed." };
  }
}

export async function addStaffAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const role = String(formData.get("role") ?? "staff") as StaffRole;
  if (!email || !email.includes("@")) return { error: "A valid e-mail is required." };
  if (!STAFF_ROLES.includes(role)) return { error: "Invalid role." };
  if (isOwnerEmail(email)) return { error: "This e-mail is already a founder (manager)." };
  const existing = await getStaffByEmail(email);
  if (existing) return { error: "This user already exists." };
  await addStaff({ email, name, role });
  // Auto-send a sign-in invite (best-effort). The row is created either way; the
  // manager can re-send from the row's Invite button if email isn't set up.
  const inv = await sendAuthInvite(email, "/login");
  await logActivity("staff.added", { summary: `Staff ${email} added as ${role}${inv.ok ? " + invited" : ""}` });
  if (!inv.ok) console.warn("[invite-staff] not sent:", inv.error);
  revalidatePath("/users");
  return { ok: true };
}

// Re-send a sign-in invite to a staff/auditor (the row's Invite button).
export async function inviteStaffAction(email: string): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return { error: "Missing e-mail." };
  const inv = await sendAuthInvite(e, "/login");
  if (!inv.ok) return { error: inv.error };
  await logActivity("staff.invited", { summary: `Sign-in invite sent to ${e}` });
  return { ok: true };
}

// Create a laboratory account directly (manager onboarding) + send its portal
// invite. Avoids needing the public Apply→approve flow just to get a login.
export async function addLabAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim().slice(0, 160);
  if (!email || !email.includes("@")) return { error: "A valid e-mail is required." };
  const existing = await getLabByEmail(email);
  const lab = existing ?? (await addLab({ email, name }));
  const inv = await sendAuthInvite(email, "/lab/login");
  if (inv.ok && inv.userId) await updateLab(lab.id, { authUserId: inv.userId });
  if (!inv.ok) console.warn("[invite-lab] not sent:", inv.error);
  await logActivity("lab.added", { targetCode: lab.id, summary: `Laboratory account created${inv.ok ? " + invited" : ""}` });
  revalidatePath("/users");
  return { ok: true };
}

// Re-send the portal invite to an existing lab (the row's Invite button).
export async function inviteLabByIdAction(labId: string): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const lab = await getLab(labId);
  if (!lab) return { error: "Laboratory not found." };
  const inv = await sendAuthInvite(lab.email, "/lab/login");
  if (!inv.ok) return { error: inv.error };
  if (inv.userId) await updateLab(lab.id, { authUserId: inv.userId });
  await logActivity("lab.invited", { targetCode: lab.id, summary: "Lab portal invite sent" });
  return { ok: true };
}

// ── Lab onboarding: public account application + manager review ────────────────
// SECURITY: the public submit is unauthenticated, so it carries the same defences
// as the scheme application (honeypot + per-IP rate limit, silent drop) plus strict
// file validation (type + size + count) with random keys in a PRIVATE bucket, a
// per-email pending cap, and — crucially — it creates NO login. Only a manager's
// approval mints the Supabase account, so a pending/rejected applicant can't sign in.

const DOC_BUCKET = "lab-docs";
const DOC_EXT: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
async function ensureLabDocsBucket(db: NonNullable<ReturnType<typeof getDb>>): Promise<void> {
  const { data: bucket } = await db.storage.getBucket(DOC_BUCKET);
  if (!bucket) {
    const { error: be } = await db.storage.createBucket(DOC_BUCKET, {
      public: false, fileSizeLimit: "6MB", allowedMimeTypes: Object.keys(DOC_EXT),
    });
    if (be && !/exist/i.test(be.message)) throw be;
  }
}

export async function submitLabApplicationAction(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const cut = (s: string, n = 200) => s.slice(0, n);

  if (get("website")) redirect("/register/thanks"); // honeypot → drop quietly
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!allowSubmission(ip)) redirect("/register/thanks"); // rate-limited → drop quietly

  const region: LabRegion = get("region") === "non_eu" ? "non_eu" : "eu";
  const email = cut(get("email").toLowerCase(), 200);
  const orgName = cut(get("orgName"), 200);
  const country = cut(get("country"), 80);
  const contactPerson = cut(get("contactPerson"), 160);

  // Server-side required-field check (the client validates too).
  if (!orgName || !country || !contactPerson || !email || !email.includes("@")) {
    redirect("/register?e=missing");
  }
  // Anti-spam: at most 3 pending applications per e-mail.
  if ((await countPendingByEmail(email)) >= 3) redirect("/register/thanks");

  const phone = cut(get("phone"), 60);
  const address = cut(get("address"), 300);
  const accreditationBody = cut(get("accreditationBody"), 160);
  const accreditationNo = cut(get("accreditationNo"), 120);

  // EU path — instant EIK checksum + best-effort VIES VAT check.
  let eik = "", vat = "";
  let eikValid: boolean | undefined, vatStatus: VatStatus | undefined, vatName: string | undefined;
  if (region === "eu") {
    eik = cut(get("eik"), 20);
    vat = cut(get("vat"), 20);
    if (eik) { const v = validateEik(eik); eik = v.normalized; eikValid = v.ok; }
    if (vat) { const r = await checkVies(vat, country.length === 2 ? country : ""); vatStatus = r.status; vatName = r.name ? cut(r.name, 200) : undefined; }
  }

  // non-EU path — validate + store supporting documents in the private bucket.
  const docPaths: string[] = [];
  if (region === "non_eu") {
    const files = formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
    for (const f of files) {
      if (!DOC_EXT[f.type]) redirect("/register?e=filetype");
      if (f.size > 5_000_000) redirect("/register?e=filesize");
    }
    const db = getDb();
    if (db && files.length) {
      try {
        await ensureLabDocsBucket(db);
        const folder = randomUUID();
        for (const f of files) {
          const path = `${folder}/${randomUUID()}.${DOC_EXT[f.type]}`;
          const bytes = new Uint8Array(await f.arrayBuffer());
          const { error } = await db.storage.from(DOC_BUCKET).upload(path, bytes, { contentType: f.type, upsert: false });
          if (error) throw error;
          docPaths.push(path);
        }
      } catch (e) {
        console.warn("[lab-apply] document upload failed:", (e as Error)?.message ?? e);
      }
    }
    if (db && !docPaths.length) redirect("/register?e=docs"); // non-EU must attach at least one document
  }

  await addLabApplication({
    region, orgName, country, contactPerson, email, phone, address,
    accreditationBody, accreditationNo, eik, vat, eikValid, vatStatus, vatName, docPaths,
  });
  await logActivity("lab_application.submitted", { summary: `Lab account application received (${region})` });
  redirect("/register/thanks");
}

// Manager approves a pending application → mints the permanent lab account + a login
// with a one-time temporary password (returned once for the manager to share, since
// e-mail delivery isn't set up yet). Activates the lab so it can sign in immediately.
export async function approveLabApplicationAction(
  formData: FormData,
): Promise<{ ok?: boolean; email?: string; tempPassword?: string; error?: string }> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const app = await getLabApplication(id);
  if (!app || app.status !== "pending") return { error: "Application not found or already handled." };
  const db = getDb();
  if (!db) return { error: "Approving needs Supabase configured." };

  // 1) create (or reuse) the permanent lab account, active.
  const existing = await getLabByEmail(app.email);
  const lab = existing ?? (await addLab({
    email: app.email, name: app.orgName, contactPerson: app.contactPerson, phone: app.phone,
    registeredAddress: app.address, eik: app.eik, vat: app.vat, accreditationCert: app.accreditationNo,
  }));

  // 2) mint the Supabase login with a ONE-TIME temp password (email_confirm so they
  //    can sign in at once). The lab should change it after first sign-in.
  const tempPassword = randomBytes(12).toString("base64url");
  let authUserId = lab.authUserId;
  try {
    const { data, error } = await db.auth.admin.createUser({ email: app.email, password: tempPassword, email_confirm: true });
    if (error) throw error;
    authUserId = data.user?.id ?? authUserId;
  } catch (e) {
    if (authUserId) {
      const { error } = await db.auth.admin.updateUserById(authUserId, { password: tempPassword });
      if (error) return { error: `Account exists but password reset failed: ${error.message}` };
    } else {
      return { error: `This e-mail already has a login (${(e as Error)?.message ?? "exists"}). Reset it in Supabase, then approve.` };
    }
  }
  await updateLab(lab.id, { status: "active", ...(authUserId ? { authUserId } : {}) });

  const me = (await getRoleContext()).email ?? "manager";
  await setLabApplicationReview(id, { status: "approved", reviewedBy: me });
  await logActivity("lab_application.approved", { targetCode: lab.id, summary: `Lab application approved for ${app.email}` });
  // NOTE: no revalidatePath here on purpose — the one-time temp password is returned
  // to the manager's screen and must stay visible until they navigate away. The row
  // is already marked approved in the DB, so it won't reappear after a manual reload.
  return { ok: true, email: app.email, tempPassword };
}

export async function rejectLabApplicationAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const app = await getLabApplication(id);
  if (!app || app.status !== "pending") return { error: "Application not found or already handled." };
  const me = (await getRoleContext()).email ?? "manager";
  await setLabApplicationReview(id, { status: "rejected", rejectReason: reason, reviewedBy: me });
  await logActivity("lab_application.rejected", { summary: `Lab application rejected for ${app.email}` });
  revalidatePath("/users");
  return { ok: true };
}

// Short-lived signed URL for a stored non-EU document (manager review only). The key
// is confined to the private bucket namespace — no traversal / arbitrary object keys.
export async function labDocUrlAction(path: string): Promise<{ url?: string; error?: string }> {
  await requireManager();
  const db = getDb();
  if (!db) return { error: "Not configured." };
  if (!path || path.includes("..") || path.startsWith("/")) return { error: "Bad path." };
  try {
    const { data, error } = await db.storage.from(DOC_BUCKET).createSignedUrl(path, 300);
    if (error || !data) throw error ?? new Error("no url");
    return { url: data.signedUrl };
  } catch (e) {
    return { error: (e as Error)?.message || "Could not sign URL." };
  }
}

export async function setStaffRoleAction(id: string, role: StaffRole): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  if (!id) return { error: "Missing id." };
  if (!STAFF_ROLES.includes(role)) return { error: "Invalid role." };
  const before = await getStaff(id);
  await updateStaff(id, { role });
  if (before && before.role !== role) {
    await logActivity("role.changed", { summary: `Role of ${before.email}: ${before.role} → ${role}` });
  }
  revalidatePath("/users");
  return { ok: true };
}

export async function setStaffStatusAction(id: string, status: StaffStatus): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  if (!id || (status !== "active" && status !== "inactive")) return { error: "Bad request." };
  const before = await getStaff(id);
  await updateStaff(id, { status });
  await logActivity("staff.status", { summary: `Staff ${before?.email ?? id} set ${status}` });
  revalidatePath("/users");
  return { ok: true };
}

// Activate / deactivate a laboratory account from the Users & roles screen. The log
// stores the opaque lab id (never the lab name) to stay confidential (§4.2).
export async function setLabStatusAction(id: string, status: LabStatus): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  if (!id || (status !== "active" && status !== "inactive")) return { error: "Bad request." };
  await updateLab(id, { status });
  await logActivity("lab.status", { targetCode: id, summary: `Laboratory account set ${status}` });
  revalidatePath("/users");
  return { ok: true };
}

export async function rejectApplicationAction(formData: FormData) {
  await requireWriter();
  const schemeId = String(formData.get("schemeId") ?? "");
  const appId = String(formData.get("appId") ?? "");
  await setApplicationStatus(schemeId, appId, "rejected");
  await logActivity("application.rejected", { schemeId, summary: "Application rejected" });
  revalidatePath(`/schemes/${schemeId}/applications`, "page");
  redirect(`/schemes/${schemeId}/applications`);
}

// Issue (or update) a participant's Certificate number + date. The number is
// `<scheme number>-<random 5 digits>`, generated ONCE and stored so a reprint
// keeps the same number. The date auto-fills to today but is editable.
// No redirect — revalidate in place so the doc page keeps the selected lab.
export async function issueCertificateAction(formData: FormData) {
  await requireManager(); // §6.2 — only a manager issues/signs reports & certificates
  const schemeId = String(formData.get("schemeId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const dateInput = String(formData.get("date") ?? "").trim();
  const scheme = await getScheme(schemeId);
  if (!scheme || !code) return;

  const certs = { ...(scheme.certificates ?? {}) };
  const existing = certs[code];
  const now = new Date();
  const today = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
  // The certificate number is generated ONCE per code and kept. Guarantee it's
  // unique within the scheme (regenerate on the rare random clash); the scheme-number
  // prefix already makes it unique across schemes.
  let no = existing?.no;
  if (!no) {
    const used = new Set(Object.values(certs).map((c) => c.no));
    do { no = `${scheme.number}-${randomInt(10000, 100000)}`; } while (used.has(no));
  }
  certs[code] = {
    no,
    date: dateInput || existing?.date || today,
  };
  await updateScheme(schemeId, { certificates: certs });
  await logActivity("certificate.issued", { schemeId, targetCode: code, summary: `Certificate ${certs[code].no} issued for ${code}` });
  await addCaseEvent({ schemeId, code, kind: "report_issued", ref: certs[code].no, source: "auto" });
  revalidatePath(`/schemes/${schemeId}/doc/certificate`, "page");
}

export async function addParticipantAction(formData: FormData) {
  await requireWriter();
  const schemeId = String(formData.get("schemeId") ?? "");
  const labName = String(formData.get("labName") ?? "").trim();
  if (!schemeId || !labName) redirect(`/schemes/${schemeId}/participants`);
  const partRaw = parseInt(String(formData.get("participations") ?? "1"), 10);
  const p = await addParticipant({
    schemeId,
    labName,
    contact: String(formData.get("contact") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    deliveryAddress: String(formData.get("deliveryAddress") ?? "").trim(),
    participations: Number.isFinite(partRaw) ? partRaw : 1,
  });
  await logActivity("participant.added", { schemeId, targetCode: p.code, summary: `Participant ${p.code} added` });
  await addCaseEvent({ schemeId, code: p.code, kind: "code_assigned", source: "auto" });
  revalidatePath(`/schemes/${schemeId}/participants`);
  redirect(`/schemes/${schemeId}/participants`);
}

// ── RT3: participant case-file timeline (dated milestones, by code) ─────────────
// Recording is staff work — requireWriter (manager + staff; auditor is read-only).
const CASE_MANUAL_KINDS: CaseEventKind[] = [
  "docs_sent", "items_dispatched", "receipt_confirmed", "results_returned", "scored", "report_issued", "other",
];

export async function addCaseEventAction(formData: FormData): Promise<void> {
  await requireWriter();
  const schemeId = String(formData.get("schemeId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as CaseEventKind;
  const at = String(formData.get("at") ?? "").trim();
  const ref = String(formData.get("ref") ?? "").trim().slice(0, 120);
  const note = String(formData.get("note") ?? "").trim().slice(0, 400);
  const back = `/schemes/${schemeId}/participants/${encodeURIComponent(code)}`;
  if (!schemeId || !code || !CASE_MANUAL_KINDS.includes(kind)) redirect(back);
  // the code must belong to this scheme (never trust the URL)
  const exists = (await listParticipants(schemeId)).some((p) => p.code === code);
  if (!exists) redirect(`/schemes/${schemeId}/participants`);

  const actor = (await getRoleContext()).email ?? "";
  await addCaseEvent({ schemeId, code, kind, at, ref, note, recordedBy: actor, source: "manual" });
  await logActivity("case.updated", { schemeId, targetCode: code, summary: `Timeline: ${kind} for ${code}${ref ? ` (${ref})` : ""}` });
  revalidatePath(back);
  redirect(back);
}

// Remove a mistaken timeline entry. Manager-only; the removal is itself logged, so
// the trail stays honest (§8.4).
export async function deleteCaseEventAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const schemeId = String(formData.get("schemeId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const ev = await getCaseEvent(id);
  await deleteCaseEvent(id);
  if (ev) await logActivity("case.removed", { schemeId, targetCode: ev.code, summary: `Timeline step “${ev.kind}” (${ev.at}) removed` });
  redirect(`/schemes/${schemeId}/participants/${encodeURIComponent(code)}`);
}

// ── RT5: document version history (§8.3) ───────────────────────────────────────
// Approve a revision (manager — controlled-document approval) and restore an older
// revision as the current document (writer — a restore is itself a new save).
export async function approveDocRevisionAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const schemeId = String(formData.get("schemeId") ?? "");
  const docKey = String(formData.get("docKey") ?? "");
  const back = `/schemes/${schemeId}/build/${encodeURIComponent(docKey)}/history`;
  const rev = await getRevision(id);
  if (!rev || rev.schemeId !== schemeId || rev.docKey !== docKey) redirect(back);
  const approver = (await getRoleContext()).email ?? "";
  await approveRevision(id, approver);
  await logActivity("doc.approved", { schemeId, summary: `Document “${docKey}” v${rev!.version} approved` });
  redirect(back);
}

export async function restoreDocRevisionAction(formData: FormData): Promise<void> {
  await requireWriter();
  const id = String(formData.get("id") ?? "");
  const schemeId = String(formData.get("schemeId") ?? "");
  const docKey = String(formData.get("docKey") ?? "");
  const back = `/schemes/${schemeId}/build/${encodeURIComponent(docKey)}/history`;
  const rev = await getRevision(id);
  const scheme = await getScheme(schemeId);
  if (!rev || !scheme || rev.schemeId !== schemeId || rev.docKey !== docKey) redirect(back);
  const docs = { ...(scheme.docs ?? {}), [docKey]: { bg: rev.bg, en: rev.en } };
  await updateScheme(schemeId, { docs });
  const actor = (await getRoleContext()).email ?? "";
  await addRevision({ schemeId, docKey, bg: rev.bg, en: rev.en, savedBy: actor, note: `Restored from v${rev.version}` });
  await logActivity("doc.restored", { schemeId, summary: `Document “${docKey}” restored from v${rev.version}` });
  revalidatePath(`/schemes/${schemeId}/build/${docKey}`, "page");
  redirect(back);
}

// ── Folders (real, nestable explorer folders) ──────────────────────────────────
function folderView(type: FolderType, folderId: string | null): string {
  const slug = TYPE_SLUG[type];
  return folderId ? `/files/${slug}/f/${folderId}` : `/files/${slug}`;
}

// Create a plain folder (name only) — e.g. a year "2026" or a group. Lives under a
// type root, or inside parentId. Lands back in the parent listing.
export async function createFolderAction(formData: FormData): Promise<void> {
  await requireWriter();
  const type: FolderType = String(formData.get("type")) === "C" ? "C" : "T";
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) redirect(folderView(type, parentId));
  // a parent (when given) must exist and be the same type
  if (parentId) {
    const p = await getFolder(parentId);
    if (!p || p.type !== type) redirect(`/files/${TYPE_SLUG[type]}`);
  }
  const f = await createFolder({ type, parentId, name });
  await logActivity("folder.created", { summary: `Folder “${name}” created` });
  revalidatePath("/", "layout");
  redirect(folderView(type, parentId ?? f.parentId));
}

export async function renameFolderAction(id: string, name: string): Promise<{ ok?: boolean; error?: string }> {
  await requireWriter();
  const f = await getFolder(id);
  if (!f) return { error: "Folder not found." };
  const clean = name.trim().slice(0, 80);
  if (!clean) return { error: "A name is required." };
  await renameFolder(id, clean);
  await logActivity("folder.renamed", { summary: `Folder renamed to “${clean}”` });
  revalidatePath("/", "layout");
  return { ok: true };
}

// Delete a folder — only when EMPTY (no subfolders, no schemes), so a year of work
// can't disappear by accident. Manager-only (destructive).
export async function deleteFolderAction(id: string): Promise<{ ok?: boolean; error?: string; emptyNeeded?: boolean }> {
  await requireManager();
  const f = await getFolder(id);
  if (!f) return { error: "Folder not found." };
  const [subs, schemes] = await Promise.all([
    listChildFolders(f.type, id),
    listSchemesInFolder(f.type, id),
  ]);
  if (subs.length || schemes.length) {
    return { error: "This folder isn’t empty — move or delete what’s inside it first.", emptyNeeded: true };
  }
  await deleteFolder(id);
  await logActivity("folder.deleted", { summary: `Folder “${f.name}” deleted` });
  revalidatePath("/", "layout");
  return { ok: true };
}

// Create a new scheme from the folder explorer: type is implied by the folder,
// the official PTS number is auto-assigned for that type+year, the owner just
// names it (+ optional object). Lands on the new scheme's folder.
export async function createProjectAction(formData: FormData) {
  await requireWriter();
  const type: "T" | "C" = String(formData.get("type")) === "C" ? "C" : "T";
  // The folder this scheme is placed in (null = directly under the type root).
  const folderId = String(formData.get("folderId") ?? "").trim() || null;
  // year drives only the auto-number (PTS YY/NN-…); defaults to the current year.
  const year = String(formData.get("year") ?? "").trim() || String(new Date().getFullYear());
  const name = String(formData.get("name") ?? "").trim();
  const object = String(formData.get("object") ?? "").trim();
  if (!name) redirect(folderView(type, folderId));

  const auto = nextProject(await listSchemeSummaries(), type, year);
  // The owner may override the official number in the dialog; it flows into every
  // document (renderers print s.number) and drives the year grouping. Fall back to
  // the auto number if the field was cleared.
  const number = (String(formData.get("number") ?? "").trim() || auto.number).slice(0, 60);
  // The official number (YY/MM-X-N) is unique system-wide — block a duplicate (only
  // possible when the owner manually edits it to one already in use).
  if (await schemeNumberExists(number)) {
    redirect(`${folderView(type, folderId)}?dupNumber=${encodeURIComponent(number)}`);
  }
  // Derive a URL-safe id from the number ("PTS 26/03-T-1" → "26-03-T-1") so the folder
  // URL stays consistent with it; never overwrite an existing scheme (suffix on clash).
  const baseId =
    number.replace(/^PTS\s*/i, "").replace(/\s+/g, "").replace(/\//g, "-")
      .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || auto.id;
  let id = baseId, n = 2;
  while (await getScheme(id)) id = `${baseId}-${n++}`;

  // "Start from a sample" → clone the ready-made scheme (all documents pre-filled),
  // then stamp the real id/number/folder. The sample keeps its own bilingual title,
  // object, parameters/calibration, schedule, prices and clauses.
  const sampleKey = String(formData.get("sample") ?? "").trim();
  const sample = sampleKey ? SAMPLE_SCHEMES[sampleKey] : undefined;

  let scheme: Scheme;
  if (sample) {
    scheme = JSON.parse(JSON.stringify(sample)) as Scheme; // deep clone — never mutate the shared sample
    scheme.id = id;
    scheme.number = number;
    scheme.type = type;
    scheme.status = "open";
    scheme.name = name;
    scheme.folderId = folderId ?? undefined;
    if (object) { scheme.objectEn = object; scheme.objectBg = object; }
  } else {
    scheme = blankScheme({
      id, number, type,
      titleEn: name, titleBg: name,
      objectEn: object, objectBg: object,
      distribution: type === "C" ? "sequential" : "simultaneous",
      minParticipants: type === "C" ? 1 : 5,
    });
    scheme.name = name;
    scheme.folderId = folderId ?? undefined;
  }
  await addScheme(scheme);
  await logActivity("scheme.created", { schemeId: id, summary: `Scheme ${number} created` });

  revalidatePath("/", "layout");
  redirect(`/schemes/${id}`);
}

// Rename a scheme folder (its friendly display name). Owners only.
export async function renameSchemeAction(id: string, name: string) {
  await requireWriter();
  const scheme = await getScheme(id);
  if (!scheme) return;
  const clean = String(name ?? "").trim().slice(0, 120);
  if (!clean) return;
  await updateScheme(id, { name: clean });
  await logActivity("scheme.renamed", { schemeId: id, summary: `Scheme renamed to “${clean}”` });
  revalidatePath("/", "layout");
  revalidatePath(`/schemes/${id}`, "layout");
}

// Delete a scheme folder and everything in it (documents/applications live in the
// row; participants cascade in the DB). Destructive — the UI confirms first, and
// requireOwner() guards the direct-POST path. Lands back on the year folder.
export async function deleteSchemeAction(id: string) {
  await requireManager(); // destructive — manager only
  const scheme = await getScheme(id);
  if (!scheme) redirect("/");
  const dest = folderView(scheme!.type, scheme!.folderId ?? null);
  await deleteScheme(id);
  await logActivity("scheme.deleted", { schemeId: id, summary: `Scheme ${scheme!.number} deleted` });
  revalidatePath("/", "layout");
  redirect(dest);
}

const two = (v: string) => v.replace(/\D/g, "").slice(0, 2).padStart(2, "0");

export async function createSchemeAction(formData: FormData) {
  await requireWriter();
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
  await requireWriter();
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

  // cover photo: URL (uploaded), width (%) and placement, all owner-set on the Edit page.
  const coverImage = str("coverImage", existing.coverImage ?? "");
  const cwRaw = parseInt(str("coverImageWidth", ""), 10);
  const caRaw = str("coverImageAlign", "");
  const coverImageAlign = caRaw === "left" || caRaw === "center" || caRaw === "right" ? caRaw : existing.coverImageAlign;

  // Lab visibility: lifecycle status (validated against the known set) + whether a
  // not-yet-open scheme is announced to labs (shown in the portal's Upcoming tab).
  const statusRaw = str("status", existing.status) as SchemeStatus;
  const status = SCHEME_STATUSES.includes(statusRaw) ? statusRaw : existing.status;
  const announced = formData.get("announced") === "on";

  await updateScheme(id, {
    status,
    announced,
    // official PTS number — shown on every document + drives the year grouping.
    // Falls back to the existing number if the field was cleared.
    number: (str("number", existing.number) || existing.number).slice(0, 60),
    coverImage: coverImage || undefined,
    coverImageWidth: Number.isFinite(cwRaw) ? Math.min(100, Math.max(10, cwRaw)) : existing.coverImageWidth,
    coverImageAlign,
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
  await requireWriter();
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
  await requireWriter();
  const { id, scheme, scoring } = await readScoringForm(formData);
  if (scheme.type !== "C") {
    scoring.assigned = { ...scoring.assigned, ...computeAssigned(metricsForScheme(scheme), scoring) };
  }
  await updateScheme(id, { scoring });
  revalidatePath(`/schemes/${id}`, "layout");
  redirect(`/schemes/${id}/results`);
}
