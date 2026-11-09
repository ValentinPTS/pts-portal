"use server";

import { randomUUID, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getScheme, updateScheme, updateSchemeWith, addScheme, archiveScheme, listSchemeSummaries, listSchemesInFolder, schemeIdTaken, schemeNumberExists, listSchemes } from "./store";
import { blankScheme } from "./new-scheme";
import { nextProject } from "./folders";
import { sameSchemeNumber, schemeIdFromNumber, sofiaYearMonth, readSchemeNumber, markersFor, schemeMarkers, isKind, isActivity, type SchemeKind, type Activity } from "./scheme-number";
import { isTestEnvironment, mailAllowedHere, looksLikeSimNumber, testSubject } from "./environment";
import { isMailConfigured, sendEmail } from "./mail";
import { inviteLink, INVITE_RETURN, safeNext, siteOrigin } from "./auth-links";
import { INVITE_SUBJECT, inviteText, invitePreview, PROFILE_CONFIRMED_SUBJECT, PROFILE_CONFIRMED_KEY, profileConfirmedText, fixedApproval } from "./fixed-texts";
import { sendToLab, recordPending, settle, type Approval } from "./sent-messages";
import { saveReminderTemplate, approveReminderTemplate, getReminderTemplate, REMINDER_KINDS, type ReminderKind } from "./reminder-templates";
import { proposeChange, decideChange, recordSettingChange, proposalProblem, listChanges } from "./change-register";
import { endAllRolesOf, assignSchemeRole, endSchemeRole, permanentRoleProblem, type AssignProblem } from "./scheme-roles";
import { isEffectiveHead } from "./people-manager";
import { ROLE_LABEL } from "./role-model";
import { designateProcessing, designationStatus } from "./processing-roles";
import { recordDeclaration, voidDeclaration, DECLARATION_EXT, MAX_DECLARATION_BYTES, type DeclarationProblem } from "./staff-declarations";
import { type Coincidence, type ProcessingProblem } from "./processing-model";
import { isSharedMailbox, SHARED_MAILBOX_REFUSAL, isProviderHead, isFounder, mailboxKey } from "./provider-people";
import { raiseDueReminders } from "./notify-reminders";
import { schemeNowIso, schemeNowMs, sofiaToday, MAX_CLOCK_SHIFT_MS, sofiaNowWallShifted } from "./clock";
import { certNumberFor, type CertNumberProblem } from "./cert-number";
import { addParticipant, listParticipants, updateParticipant, labIdsFor, labIdOf, schemePrefix, NoLabNumberError } from "./participants";
import { actorNow } from "./identities";

// Who to tell, looked up BEFORE a step is recorded (part 2.3): the laboratory behind
// a code is in the identity store, and if it cannot be reached nothing is recorded —
// a retry then tells them, rather than a step recorded and its notice lost.
const NOT_REACHED = "Не стигнах до хранилището на самоличността — нищо не е записано. Опитайте пак. · Could not reach the identity store — nothing was recorded; try again.";
async function labToTell(schemeId: string, code: string | undefined): Promise<{ labId?: string } | null> {
  if (!code) return {};
  try {
    return { labId: await labIdOf(schemeId, code, await actorNow()) };
  } catch {
    return null;
  }
}
// …after the step, for the stop it actually was (another, only if the order changed meanwhile)
async function labAfter(schemeId: string, code: string, pre: { code?: string; tell: { labId?: string } }): Promise<string | undefined> {
  return code === pre.code ? pre.tell.labId : labIdOf(schemeId, code, await actorNow()).catch(() => undefined);
}
import { listVisibleParticipations, isStarted } from "./visibility";
import { applyStamp, chainNewestMs, isStampSource, rebuildChain, returnProblem, sofiaDay, sofiaTime, sofiaWallToIso, stampProblem, stampSourceLabel, type StampProblem, type StampWhat } from "./chain";
import { ONLINE_APPLICATIONS_OPEN } from "./online-applications";
import { freezeNow, issueEdition, latestEdition, getEdition, sameAs, servable, reissueReason, amendmentStampFor, type DocEdition, type Frozen } from "./editions";
import { hasEditions, editionLabel } from "./editions-model";
import { addApplication, setApplicationStatus } from "./applications";
import { getDoc, hasDocContent, isRestrictedDoc, markCodedList, usableForDoc, isListDoc, pairsNamesWithCodes, showsIdentities, ORDER_DOC } from "./documents";
import { isSendableDoc, isLabDocSlot, hasCohortNames, hasPortalScores, LAB_DOC_SLOTS, type LabDocSlot } from "./doc-release";
import { DATE_KEYS, DATE_LABELS, isDeadline, fmtSchemeDate, type SchemeDateKey } from "./scheme-dates";
import { checkExtension, extensionKey, resultsDeadline, chainWindow, freezeWindow, EXTENSION_PROBLEM_TEXT, type Extension, type ExtensionInput } from "./deadlines-model";
import { holidayProblem, officialHolidays } from "./holidays-model";
import { uniformBelow } from "./random";
import { readCharacteristicFields, FIELD_PROBLEM_TEXT, ensureIds, ensurePointIds, configOf, nextVersionNo } from "./characteristics-model";
import { readCommercial, commercialDiff } from "./commercial-model";
import { readList, listsOf, listsDiff, listSeq, startingLists, MAX_ITEMS, type SchemeLists } from "./scheme-lists-model";
import { M1_SPECIFIC_CLAUSES, M1_BLOCKS, MAX_M1_BLOCK, isM1Doc, m1Problems, usesM1 } from "./m1-render";
import { readProviders, readPeriod, metaDiff, MAX_PROVIDERS } from "./scheme-meta";
import { readEntity, entityDiff, entityChecked, stateProblem, eikKey, UUID_RE, ENTITY_PROBLEM_TEXT, ENTITY_STATES, type EntityState, type LegalEntity } from "./entities-model";
import { openEntities, putEntity, entityKeyTaken, confirmEntity, eraseEntity } from "./entities";
import { readRejectReason, readEraseRequest, retentionOver, REJECT_REASON_MIN } from "./retention-model";
import { storeProof, removeProof, PROOF_EXT, MAX_PROOF_BYTES } from "./entity-proofs";
import { readLaboratory, laboratoryDiff, LABORATORY_PROBLEM_TEXT, type Laboratory, type LaboratoryState } from "./laboratories-model";
import { openLaboratories, putLaboratory } from "./laboratories";
import { readEntityUser, entityUserDiff, ENTITY_USER_PROBLEM_TEXT, type EntityUser } from "./entity-users-model";
import { openEntityUsers, putEntityUser, userEmailTaken, linkEntityUserAccount } from "./entity-users";
import { requireParticipant, participantActor, getParticipantSession, participationsOf } from "./participant-session";
import { inviteParticipant } from "./participant-invite";
import { freezeParticipation, participationEntity } from "./participation-snapshots";
import { readSelections, characteristicsOf, readRefusal, readSource, inRound, REFUSAL_CATEGORIES, STANDING_PROBLEM_TEXT, MAX_PER_CHARACTERISTIC, participationSets, selectionsOf, sameSelections, objectsNeeded, type Standing } from "./application-model";
import { notifyParticipationRefused, notifyItemsDispatched, notifyReceiptProtocol, notifyDeliveryProblem } from "./notify-events";
import { readDocNumber, invoiceSlotProblem, INVOICE_PROBLEM_TEXT } from "./invoice-model";
import { readShipment, readReceipt, deliveryOf, openShipment, openProblems, replacementProblem, replacementCalledFor, minDaysOf, readMinDays, LIMITS as DELIVERY_LIMITS, MAX_OPEN_PROBLEMS, type Shipment, type ShipmentKind, type Deliveries } from "./delivery-model";
import { finalListOf, splitFor, invoiceProblem, currentFinalList, inFinalRound, finalSelectionsOf, ANNOUNCEMENT_PROBLEM_TEXT, type FinalList } from "./announcement-model";
import { readTarget, RELEASE_PROBLEM_TEXT, releaseFor, type TargetRelease } from "./release-model";
import { ackRequiredFor, ackSettable, ackOf, kindOf, readAckForm, type Acknowledgement, type AckProblem } from "./ack-model";
import { drawCodes, drawObjects, toCode, codingProblem, objectsGiven, unfinished, sampleCodeOf, isProvisional, CODING_PROBLEM_TEXT, type CodingProblem, type CodingRecord } from "./coding-model";
import { commitCoding } from "./coding-store";
import { pointKeys, pointsReady, fingerprint, orphans, readReferenceTable, kNeedsReason, currentRows, sameRow, sameRows, type ReferenceRow } from "./reference-values-model";
import { numbersTaken, codeMoment, MAX_LAB_NUMBER } from "./code-rule";
import { characteristicLabel } from "./characteristics-model";
import { changedOnly, readShown, CONFLICT_TEXT } from "./form-merge";
import { readCompletion, privacyUrl, confirmDate, COMPLETION_PROBLEM_TEXT } from "./profile-confirm-model";
import { logAs } from "./activity-store";
import { checkBatch, objectCodes, drawRoles, parseHomogeneity, remapHomogeneity, newHomogeneityRows, backfillCharacteristicIds, withCharacteristicIds, BATCH_PROBLEM_TEXT, DRAW_PROBLEM_TEXT, HOMOGENEITY_PROBLEM_TEXT, OBJECT_ROLES, type Batch, type BatchInput, type ObjectRole } from "./batches-model";
import { holidayCalendar, holidaySet, listHolidayEntries, recordHoliday } from "./holidays";
import { PSTATUS_ORDER, LAB_UPLOAD_SLOTS, canLabUploadNow, type LabUploadSlot } from "./lab-phases";
import {
  metricsForScheme, buildScoring, computeAssigned,
  scoringStamp, diffScoring, describeScoringChanges, belowMinimum, CONSENSUS_FLOOR,
} from "./scoring";
import { isOwnerEmail } from "./auth";
import { addLibraryItem, updateLibraryItem, deleteLibraryItem, type LibraryItem } from "./library-store";
import { addSavedTemplate, deleteSavedTemplate, getSavedTemplateDocKey, type SavedTemplate } from "./saved-templates";
import { getSkinAsync, setDefaultSkinAsync } from "../skins";
import { sanitizeSkinData } from "../skins/custom";
import {
  upsertCustomSkin, getCustomSkin, deleteCustomSkin, getDefaultSkinId, setDefaultSkinId,
  setDefaultCoverImage,
} from "./custom-skins";
import { getDb, dbMode } from "./supabase";
import { getLabByEmail, addLab, addLabOrThrow, getLab, labEmailInUse, updateLab } from "./labs";
import {
  addLabApplication, getLabApplication, setLabApplicationReview, listLabApplications, removeLabApplication,
  countPendingByEmail,
} from "./lab-applications";
import { validateEik } from "./verify-eik";
import { checkVies } from "./verify-vies";
import { getLabSession } from "./lab-auth";
import { addStaff, updateStaff, getStaffByEmail, getStaff, staffEmailInUse } from "./staff";
import { requirePeopleManager, getRoleContext, canManagePeople } from "./roles";
import { requireCap, requireCapAnywhere, requireOneOf, mayNow, mayViewDoc, getViewer, schemesFor, mayAnywhereNow } from "./access";
import { isAmendedDoc, needsAmendment, checkAmendment, nextAmendmentNo, amendmentLine, amendmentNote, AMENDMENT_PROBLEM_TEXT, type Amendment, type AmendmentInput } from "./amendments-model";
import { ACTS, ACT_PROBLEM_TEXT, TICK_PROBLEM_TEXT, STATE_LABEL, actProblem, actTarget, isActKey, stageDef, tickProblem, untickProblem, type ActKey, type ActProblem, type LifecycleAct, type StageTick } from "./lifecycle-model";
import { sanitizeDocHtml } from "./sanitize-html";
import { SCHEME_DOC_BUCKET, SCHEME_DOC_EXT, MAX_SCHEME_DOC_BYTES, ensureSchemeDocsBucket } from "./scheme-uploads";
import { isDocKey } from "./doc-stages";
import type { UploadedDoc } from "./types";
import { logActivity } from "./activity";
import { decideNotice, getNotice, markRead, readerKey, listForProvider, listForLab, listForParticipations } from "./notifications";
import {
  notifyApplicationReceived, notifyApplicationApproved, notifyApplicationRejected,
  notifyReceiptConfirmed, notifyResultsReturned, notifyReportIssued, notifyDocsSent,
  notifyInvoiceReady, notifyDeviceMoved, notifyChainReceipt, notifyChainHandover,
  notifySchemeNotHeld, notifyReportPublished, notifySchemeAmended, notifyDeadlineExtended, notifySchemeAnnounced, notifyFinalList, notifyCoded,
} from "./notify-events";
import { addCaseEvent, getCaseEvent, listCaseEvents, listCaseEventsForScheme, voidCaseEvent } from "./case-events";
import { LAB_RECORDER } from "./redact";
import { addRevision, getRevision, approveRevision } from "./doc-revisions";
import { createFolder, renameFolder, deleteFolder, getFolder, listChildFolders } from "./folder-tree";
import { SAMPLE_SCHEMES } from "./sample-schemes";
import { TYPE_SLUG, type FolderType } from "./folders";
import type { ChainStamp, ChainStop, Scheme, Scoring, Parameter, StaffRole, StaffStatus, LabStatus, CaseEventKind, LabRegion, VatStatus, SchemeStatus, ParticipantStatus } from "./types";
import {
  isIdentityMap, remapSelections, remapCharacteristics, remapScoring, paramsSignature,
  effectiveDirections, calibrationDataSlots, calibrationSlotsBroken, clearCalibrationSlots,
} from "./param-remap";
import { usesCalApplyItem, CAL_SELECTION_KEY } from "./apply-item";

const STAFF_ROLES: StaffRole[] = ["manager", "staff", "auditor"];

// Save a reusable snippet to the owner's global library ("+ Add your own").
// Returns the created item so the editor can show it immediately.
export async function addLibraryItemAction(name: string, bg: string, en: string, category?: string): Promise<{ item?: LibraryItem; error?: string }> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  if (!name.trim() || !bg.trim()) return { error: "A name and Bulgarian text are required." };
  const item = await addLibraryItem({ name: name.trim(), bg: bg.trim(), en: en.trim(), category: (category ?? "").trim() || undefined });
  revalidatePath("/items", "page");
  return { item };
}

// Edit an existing library item (the "My items" management page).
export async function updateLibraryItemAction(id: string, name: string, bg: string, en: string, category?: string): Promise<{ item?: LibraryItem; error?: string }> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
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
  await requireCapAnywhere("library.manage"); // the role model (2.4)
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
  await requireCapAnywhere("scheme.edit"); // the role model (2.4)
  const t = (text ?? "").trim();
  if (!t) return { text: "" };
  try {
    const out: string[] = [];
    for (const chunk of chunkText(t, 480)) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}`;
      // Hard timeout so a slow/hung translator can never block the action (same
      // pattern as checkVies). Fails soft to an "unavailable" error the UI shows.
      const res = await fetch(url, { headers: { "User-Agent": "PTS-Portal" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { error: `Translator unavailable (${res.status}).` };
      const data = await res.json();
      // MyMemory answers HTTP 200 even when it REFUSES the request — the real status
      // lives in the JSON body, and when the free daily quota runs out the warning
      // text itself is delivered in `translatedText`. Checking only res.ok therefore
      // splices "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR
      // TODAY…" into the document as if it were the translation, paragraph after
      // paragraph. Both guards below are needed: the status covers refusals, the
      // pattern covers the quota case where the status is still 200.
      const status = Number(data?.responseStatus);
      if (Number.isFinite(status) && status !== 200) {
        const detail = String(data?.responseDetails ?? "").slice(0, 120);
        return { error: `Translator refused (${status})${detail ? `: ${detail}` : "."}` };
      }
      const piece = data?.responseData?.translatedText;
      if (typeof piece !== "string" || !piece) return { error: "No translation returned." };
      if (/^\s*(MYMEMORY WARNING|QUERY LENGTH LIMIT|PLEASE SELECT|INVALID LANGUAGE|'?AUTO'? IS AN INVALID)/i.test(piece)) {
        return { error: "Daily free-translation limit reached — the document was left unchanged. Try again tomorrow, or translate this text by hand." };
      }
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
  await requireDocWriter(docKey);
  if (!isDocKey(docKey)) return { error: "Unknown document." };
  // a list, F 7.2.1-6 or a certificate may carry names, and a template is shared
  // across schemes — names are per scheme (2.4)
  if (isListDoc(docKey) || showsIdentities(docKey)) return { error: "Документ с имена не се пази като шаблон — имената са на една схема. · A document with names is not kept as a template — names belong to one scheme." };
  // the Order is one scheme's, read by the staff it assigns (Реш. 149, 2.6)
  if (docKey === ORDER_DOC) return { error: "Заповедта не се пази като шаблон — тя е на една схема (Реш. 149). · The Order is not kept as a template — it belongs to one scheme." };
  if (!name.trim()) return { error: "A template name is required." };
  if (!bg.trim() && !en.trim()) return { error: "Nothing to save — the document is empty." };
  const item = await addSavedTemplate({
    docKey, type: type === "C" ? "C" : "T", name: name.trim(),
    bg: markCodedList(docKey, String(bg ?? "")), en: markCodedList(docKey, String(en ?? "")),
  });
  await settingChanged(`Шаблон на документ «${name.trim()}» (${docKey}) записан`, `A reusable template for ${docKey} saved.`, `doc-template:${item.id}`);
  return { item };
}

export async function deleteDocTemplateAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  if (!id) return { error: "Missing id." };
  // deleting a template is an act on its document — F 7.2.1-6's are a manager's
  const docKey = await getSavedTemplateDocKey(id);
  if (!docKey) return { error: "Template not found." };
  await requireDocWriter(docKey);
  await deleteSavedTemplate(id);
  await settingChanged(`Шаблон на документ (${docKey}) изтрит`, `A reusable template for ${docKey} deleted.`, `doc-template:${id}`);
  return { ok: true };
}

// Set the document skin (visual theme) for a scheme. Every document for the scheme
// then renders in that skin. The id is validated by resolving it (built-in OR
// custom) — an unknown id resolves to "classic", so we never store a dangling ref.
export async function saveSchemeSkinAction(schemeId: string, skinId: string) {
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) throw new Error("Scheme not found");
  const resolved = await getSkinAsync(skinId);
  await updateScheme(schemeId, { skin: resolved.meta.id });
  revalidatePath(`/schemes/${schemeId}`, "layout");
}

// Set the default skin for a scheme type (testing/calibration) from the gallery —
// persisted in app_settings. The id is validated by resolving it first.
export async function setDefaultSkinAction(formData: FormData) {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  const type = String(formData.get("type")) === "C" ? "C" : "T";
  const resolved = await getSkinAsync(String(formData.get("skinId") ?? ""));
  await setDefaultSkinAsync(type, resolved.meta.id);
  await settingChanged(`Облик по подразбиране (${type === "C" ? "калибриране" : "изпитване"}): ${resolved.meta.name}`, `The default skin for ${type} schemes set to «${resolved.meta.id}».`, `app_settings:default_skin_${type}`);
  revalidatePath("/skins", "page");
}

// ── Custom skins: create / update / delete (the visual skin editor) ──────────
// The editor posts a plain skin-data object; sanitizeSkinData() is the trust
// boundary (hex-only colours, allow-listed fonts, fixed element keys, restricted
// logo). Owners only. Never trusts the client shape.
export async function createCustomSkinAction(input: unknown): Promise<{ id?: string; error?: string }> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  if (!String((input as { name?: unknown })?.name ?? "").trim()) return { error: "A skin name is required." };
  const id = randomUUID();
  await upsertCustomSkin(sanitizeSkinData(input, id));
  await settingChanged(`Облик «${String((input as { name?: unknown }).name).trim().slice(0, 80)}» създаден`, "A custom skin created.", `skin:${id}`);
  revalidatePath("/skins", "page");
  return { id };
}

export async function updateCustomSkinAction(id: string, input: unknown): Promise<{ id?: string; error?: string }> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  if (!id || !(await getCustomSkin(id))) return { error: "Skin not found." };
  if (!String((input as { name?: unknown })?.name ?? "").trim()) return { error: "A skin name is required." };
  await upsertCustomSkin(sanitizeSkinData(input, id));
  await settingChanged(`Облик «${String((input as { name?: unknown }).name).trim().slice(0, 80)}» променен`, "A custom skin changed.", `skin:${id}`);
  revalidatePath("/skins", "page");
  revalidatePath(`/skins/${id}/edit`, "page");
  return { id };
}

export async function deleteCustomSkinAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  if (!id) return { error: "Missing id." };
  await deleteCustomSkin(id);
  await settingChanged("Облик изтрит", "A custom skin deleted.", `skin:${id}`);
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

// Verify the file's REAL bytes match its declared type — the browser-reported MIME
// (file.type) is client-controlled and could be spoofed to smuggle a non-image (e.g.
// an HTML/SVG payload) past the allow-list. Cheap magic-number check; the buckets
// only ever store/serve these formats.
function magicMatches(bytes: Uint8Array, mime: string): boolean {
  const b = bytes;
  switch (mime) {
    case "image/png":
      return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    case "image/jpeg":
      return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/webp": // "RIFF"…"WEBP"
      return b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    case "application/pdf": // "%PDF"
      return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
    default:
      return false;
  }
}
export async function uploadSkinLogoAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
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
    if (!magicMatches(bytes, file.type)) return { error: "That file isn't a real PNG, JPG or WEBP image." };
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
  await requireCapAnywhere("scheme.edit"); // the role model (2.4)
  return storeCoverImage(formData);
}

// the storage upload itself — each caller has its own gate (a scheme's cover, or the
// default one, which is the shared library's)
async function storeCoverImage(formData: FormData): Promise<{ url?: string; error?: string }> {
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
    if (!magicMatches(bytes, file.type)) return { error: "That file isn't a real PNG, JPG or WEBP image." };
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
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  const res = await storeCoverImage(formData); // the same storage upload (raster-only, size-capped)
  if (res.url) {
    await setDefaultCoverImage(res.url);
    await logActivity("cover.default", { summary: "Default title-page photo updated" });
    await settingChanged("Снимка за заглавна страница по подразбиране — сменена", "The default title-page photo changed.", "app_settings:default_cover");
    revalidatePath("/skins", "page");
    revalidatePath("/", "layout");
  }
  return res;
}

export async function clearDefaultCoverAction(): Promise<{ ok?: boolean }> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  await setDefaultCoverImage("");
  await logActivity("cover.default", { summary: "Default title-page photo cleared" });
  await settingChanged("Снимка за заглавна страница по подразбиране — махната", "The default title-page photo cleared.", "app_settings:default_cover");
  revalidatePath("/skins", "page");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Upload a ready-made file into a document's slot ──────────────────────────
// Any of the 14 documents can be filled by an external PDF/image scan instead of /
// alongside the app-built version. Staff-only, private storage, strict validation
// (declared type ∈ allow-list, size cap, and the REAL bytes must match — same magic-
// byte check as the image uploads). When Supabase isn't configured (local dev) the
// bytes are kept as a data: URL on the in-memory scheme so the flow still works.
// Part 0.9 (finding N9): replacing or removing a file never deletes it. The stored
// object stays and the scheme keeps a record of it — called inside the per-scheme
// lock with the FRESH scheme, so two overlapping writes each record their own.
function supersede(s: Scheme, where: string, file: UploadedDoc | undefined, reason: "replaced" | "removed", by: string): Partial<Scheme> {
  if (!file) return {};
  return { supersededFiles: [...(s.supersededFiles ?? []), { where, file, at: new Date().toISOString(), reason, by }] };
}

// Who may change a document (part 2.4): in a scheme, its editors — and F 7.2.1-6,
// the name↔code mapping, only one who also sees names there (§4.2, part 0.2, Реш.
// 93). A whole-document template (no scheme): the shared library — F 7.2.1-6's only
// for one who sees names somewhere. Called once the key is known.
async function requireDocWriter(docKey: string, schemeId?: string): Promise<void> {
  if (schemeId === undefined) {
    await requireCapAnywhere("library.manage");
    if (isRestrictedDoc(docKey)) await requireCapAnywhere("names.view");
    return;
  }
  await requireCap("scheme.edit", schemeId);
  if (isRestrictedDoc(docKey)) await requireCap("names.view", schemeId);
}

export async function uploadSchemeDocAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
  const docKey = String(formData.get("docKey") ?? "");
  await requireDocWriter(docKey, schemeId);
  if (!isDocKey(docKey)) return { error: "Unknown document." };
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file received." };
  const ext = SCHEME_DOC_EXT[file.type];
  if (!ext) return { error: "Use a PDF, JPG or PNG file." };
  if (file.size > MAX_SCHEME_DOC_BYTES) return { error: "File too large (max 15 MB)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!magicMatches(bytes, file.type)) return { error: "That file isn't a real PDF/JPG/PNG." };

  const actor = (await getRoleContext()).email ?? "";
  const name = String(file.name || `document.${ext}`).slice(0, 160);

  let path: string;
  const db = getDb();
  if (db) {
    try {
      await ensureSchemeDocsBucket(db);
      path = `${schemeId}/${docKey}/${randomUUID()}.${ext}`;
      const { error } = await db.storage.from(SCHEME_DOC_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
      if (error) throw error;
      // the replaced file is NOT deleted — it is kept and recorded below (part 0.9)
    } catch (e) {
      return { error: (e as Error)?.message || "Upload failed." };
    }
  } else {
    // no Supabase (dev) → keep the bytes inline so the viewer still works locally
    path = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  const upload: UploadedDoc = { path, name, mime: file.type, size: file.size, uploadedAt: new Date().toISOString(), uploadedBy: actor };
  // in the lock, from the fresh scheme: what this replaces is recorded, never lost
  let replaced: UploadedDoc | undefined;
  await updateSchemeWith(schemeId, (s) => {
    replaced = s.uploads?.[docKey];
    return {
      uploads: { ...(s.uploads ?? {}), [docKey]: upload },
      docActive: { ...(s.docActive ?? {}), [docKey]: "uploaded" as const },
      ...supersede(s, `upload:${docKey}`, s.uploads?.[docKey], "replaced", actor),
    };
  });
  // before → after in the journal (part 1.9): a replacement says what it replaced
  await logActivity("doc.uploaded", {
    schemeId, subject: `upload:${docKey}`,
    // never the file name: a scan is often named after a laboratory (§4.2)
    summary: `File ${replaced ? "replaced" : "uploaded"} for document “${docKey}”`,
    before: replaced ? { size: replaced.size, mime: replaced.mime, at: replaced.uploadedAt } : null,
    after: { size: upload.size, mime: upload.mime, at: upload.uploadedAt },
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// ── Release a document to the participants ───────────────────────────────────
// The clear line the owner asked for. Uploading tells nobody; THIS is the act
// that puts a document in every participant's portal and raises their notice.
// Reversible: "спри споделянето" takes it back out of their view. The notices
// already raised stay — they are a record of what was said, not a mirror of the
// current state.
//
// What goes out is an EDITION (part 3.0, Реш. 50): the latest one when the document
// is still what it froze, else the next one — issued here, with the person's note of
// what changed and why (from edition 2 on it is asked for: a change is never silent).
//
// It gates nothing else. A document can be released at any moment, in any order,
// however late — the owner's schedule is his own and the app never argues with it.
export async function setDocSentAction(
  schemeId: string,
  docKey: string,
  sent: boolean,
  note?: { reason?: string; scope?: string },
): Promise<{ ok?: boolean; error?: string; told?: number; namesWithheld?: boolean; scoresWithheld?: boolean; needsNote?: { no: number; since: number }; edition?: number; issued?: boolean; stillTargeted?: number }> {
  await requireCap("docs.release", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const def = getDoc(docKey);
  // The allow-list is the security boundary, not the UI: the registers and the
  // provider's planning papers can never be released, whatever gets posted here.
  if (!def || !isSendableDoc(docKey)) return { error: "This document is not one the participants receive." };

  // Rebuilt from the fresh scheme inside the per-scheme lock: releasing one
  // document must never drop another that went out at the same moment.
  if (!sent) {
    await updateSchemeWith(schemeId, (s) => {
      const sentMap = { ...(s.sentToParticipants ?? {}) };
      delete sentMap[docKey];
      const eds = { ...(s.releasedEditions ?? {}) };
      // an opened scheme's plan or invitation keeps the record of the edition the
      // participants last held: sent again, it is that one — unless an amendment
      // issued a later one (3.3). Every reader of the record checks it is sent.
      if (!(isAmendedDoc(docKey) && needsAmendment(s))) delete eds[docKey];
      return { sentToParticipants: sentMap, releasedEditions: eds };
    });
    await logActivity("doc.unsent", { schemeId, summary: `Document “${docKey}” withdrawn from the participants` });
    revalidatePath(`/schemes/${schemeId}`, "layout");
    // a release to one participation or one user is its own decision: it stays — said (5.4 review)
    const stillTargeted = ((await getScheme(schemeId))?.releases ?? []).filter((r) => r.docKey === docKey && !r.withdrawnAt).length;
    return { ok: true, ...(stillTargeted ? { stillTargeted } : {}) };
  }

  // Refuse to release an empty slot — a laboratory opening a blank document is
  // worse than not having it yet. Either an uploaded file or a built body will do.
  if (!scheme.uploads?.[docKey] && !hasDocContent(scheme, docKey)) {
    return { error: "There is nothing in this document yet — upload a file or create it first." };
  }

  // Already with the participants: a second «Изпрати» (a stale tab, a colleague)
  // must not swap what they hold behind their back. A new edition goes out as a
  // withdrawal and a fresh release.
  if (scheme.sentToParticipants?.[docKey]) {
    return { error: "This document is already with the participants. To send a new edition, stop sharing it first, then send it again." };
  }

  // The edition that goes out (part 3.0) — decided first, so that a send that asks
  // for its note, or is refused, opens nothing. If none can be kept, nothing is
  // released: a release must never be something unrecorded. (One issued here and not
  // sent — the lookup below failing — is simply the latest edition, sent next time.)
  const got = await editionToSend(scheme, docKey, note, await actorNow());
  if ("needsNote" in got) return { needsNote: got.needsNote };
  if ("error" in got) return { error: got.error };
  const { edition, issued } = got;

  // Who to tell, before the release is recorded (2.3) — those in the round: a refused,
  // annulled or withdrawn participation is told nothing more, its identity not opened (5.1)
  let parts: Awaited<ReturnType<typeof listParticipants>>;
  let labOf: Map<string, string | undefined>;
  try {
    parts = (await listParticipants(schemeId)).filter(inRound);
    labOf = await labIdsFor(schemeId, parts, await actorNow());
  } catch {
    return { error: NOT_REACHED };
  }
  const sentAt = new Date().toISOString();
  let already = false;
  let amendedMeanwhile = false;
  await updateSchemeWith(schemeId, (s) => {
    // re-checked inside the lock: of two sends at once, only the first goes out
    if (s.sentToParticipants?.[docKey]) { already = true; return {}; }
    // an amendment recorded since this send chose its edition re-issues the plan or the
    // invitation: what was chosen may be the edition it replaces (3.3)
    if (isAmendedDoc(docKey) && (s.amendments?.length ?? 0) !== (scheme.amendments?.length ?? 0)) { amendedMeanwhile = true; return {}; }
    return {
      sentToParticipants: { ...(s.sentToParticipants ?? {}), [docKey]: sentAt },
      releasedEditions: { ...(s.releasedEditions ?? {}), [docKey]: { id: edition.id, no: edition.no, at: sentAt } },
    };
  });
  if (already) return { error: "This document is already with the participants." };
  if (amendedMeanwhile) return { error: "Междувременно е записано изменение — презаредете страницата и изпратете отново. · An amendment was recorded meanwhile — reload the page and send again." };

  // One notice per PARTICIPATION, each carrying the code that participation works
  // under. A laboratory in two schemes is told twice, never once.
  for (const p of parts) {
    await notifyDocsSent(labOf.get(p.code), schemeId, scheme.number, p.code, def.nameBg, def.nameEn);
  }
  // Releasing is never blocked — the owner's schedule is his own. But if the body
  // he wrote contains a participants table, the laboratories will receive it with
  // that table replaced by a note (lib/doc-release), and he has to know that BEFORE
  // they read it rather than after.
  const namesWithheld =
    hasCohortNames(scheme.docs?.[docKey]?.bg ?? "") || hasCohortNames(scheme.docs?.[docKey]?.en ?? "");
  // the same for a table of the portal's own scores (Реш. 135, part 0.6)
  const scoresWithheld =
    hasPortalScores(scheme.docs?.[docKey]?.bg ?? "") || hasPortalScores(scheme.docs?.[docKey]?.en ?? "");

  await logActivity("doc.sent", {
    schemeId,
    subject: `edition:${edition.id}`,
    summary: `Document “${docKey}” sent to the participants — ${editionLabel("en", edition.no, edition.issuedOn)}${issued ? " (issued now)" : ""} (${parts.length} participation(s))`
      + (namesWithheld ? " — a participant-name table in the body is withheld from them" : "")
      + (scoresWithheld ? " — portal-computed scores in the body are withheld from them" : ""),
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true, told: parts.length, namesWithheld, scoresWithheld, edition: edition.no, issued };
}

// ── Release to one participation or one user (plan part 5.4; Zadanie «Три нива на
// пускане на документ»; Реш. 50) ─────────────────────────────────────────────────
// «Изпрати» above releases to every participant. Here a document goes to ONE
// participation, or to ONE user of a legal entity with a participation in the scheme —
// as an edition (3.0), the same rules choosing it; kept on the scheme with who, when and
// which edition; withdrawn by a date, never removed. A participation is told by its code
// through the send control; a single user is told by PTS directly (a notice reaches a
// participation's people, not one of them).

const RELEASE_REFUSAL = Object.fromEntries(Object.entries(RELEASE_PROBLEM_TEXT).map(([k, v]) => [k, `${v.bg} · ${v.en}`])) as Record<keyof typeof RELEASE_PROBLEM_TEXT, string>;

export async function releaseDocToAction(
  schemeId: string,
  docKey: string,
  targetIn: { level?: unknown; participantId?: unknown; userId?: unknown },
  note?: { reason?: string; scope?: string },
): Promise<{ ok?: boolean; error?: string; told?: number; needsNote?: { no: number; since: number }; edition?: number; issued?: boolean; namesWithheld?: boolean; scoresWithheld?: boolean }> {
  await requireCap("docs.release", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Схемата не е намерена. · Scheme not found." };
  const def = getDoc(docKey);
  if (!def || !isSendableDoc(docKey)) return { error: "Този документ не се изпраща на участници. · This document is not one the participants receive." };
  // a started scheme only — nothing of an unstarted one reaches a laboratory (Реш. 147)
  if (!isStarted(scheme)) return { error: RELEASE_REFUSAL.started };
  const target = readTarget(targetIn);
  if (!target.ok) return { error: RELEASE_REFUSAL.target };
  // one user by name: only who may see names (§4.2) — on the server, not only on the screen
  if (target.level === "user" && !(await mayNow("names.view", schemeId))) return { error: RELEASE_REFUSAL.target };
  if (!scheme.uploads?.[docKey] && !hasDocContent(scheme, docKey)) return { error: "В документа още няма нищо — качете файл или го създайте. · There is nothing in this document yet — upload a file or create it first." };
  const by = await actorNow();

  // the target — of THIS scheme, in its round — and who to tell, before anything is recorded (2.3)
  let parts: Awaited<ReturnType<typeof listParticipants>>;
  try { parts = (await listParticipants(schemeId)).filter((p) => inFinalRound(scheme, p)); } catch { return { error: NOT_REACHED }; }
  let tellCode: string | undefined;
  let tellLab: string | undefined;
  if (target.level === "participation") {
    const p = parts.find((x) => x.id === target.participantId);
    if (!p) return { error: RELEASE_REFUSAL.participation };
    const t = await labToTell(schemeId, p.code);
    if (!t) return { error: NOT_REACHED };
    tellCode = p.code;
    tellLab = t.labId;
  } else {
    try {
      const [u] = await openEntityUsers({ actor: by, purpose: "send" }, { userId: target.userId });
      if (!u || u.state !== "active") return { error: RELEASE_REFUSAL.user };
      const entities = await Promise.all(parts.map((p) => participationEntity(schemeId, p.code, by)));
      if (!entities.includes(u.entityId)) return { error: RELEASE_REFUSAL.user };
    } catch {
      return { error: NOT_REACHED };
    }
  }

  // the edition that goes out — the same rules as «Изпрати» (3.0, 3.3)
  const got = await editionToSend(scheme, docKey, note, by);
  if ("needsNote" in got) return { needsNote: got.needsNote };
  if ("error" in got) return { error: got.error };
  const { edition, issued } = got;

  const release: TargetRelease = {
    id: randomUUID(), docKey, level: target.level,
    ...(target.level === "participation" ? { participantId: target.participantId } : { userId: target.userId }),
    editionId: edition.id, editionNo: edition.no, at: new Date().toISOString(), by,
  };
  // re-checked inside the lock: an amendment recorded since the edition was chosen
  // re-issues the plan or the invitation (3.3) — the chosen one may be what it replaces
  let amendedMeanwhile = false;
  await updateSchemeWith(schemeId, (cur) => {
    if (isAmendedDoc(docKey) && (cur.amendments?.length ?? 0) !== (scheme.amendments?.length ?? 0)) { amendedMeanwhile = true; return {}; }
    return { releases: [...(cur.releases ?? []), release] };
  });
  if (amendedMeanwhile) return { error: "Междувременно е записано изменение — презаредете страницата и изпратете отново. · An amendment was recorded meanwhile — reload the page and send again." };
  if (tellCode) await notifyDocsSent(tellLab, schemeId, scheme.number, tellCode, def.nameBg, def.nameEn);
  await logActivity("doc.sent", {
    schemeId, subject: `edition:${edition.id}`, ...(tellCode ? { targetCode: tellCode } : {}),
    summary: `Document “${docKey}” sent ${target.level === "participation" ? `to one participation (${tellCode})` : "to one user of a legal entity"} — ${editionLabel("en", edition.no, edition.issuedOn)}${issued ? " (issued now)" : ""}`,
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "layout");
  // what the laboratory will see in place of a names table or portal scores, as with «Изпрати»
  const namesWithheld = hasCohortNames(scheme.docs?.[docKey]?.bg ?? "") || hasCohortNames(scheme.docs?.[docKey]?.en ?? "");
  const scoresWithheld = hasPortalScores(scheme.docs?.[docKey]?.bg ?? "") || hasPortalScores(scheme.docs?.[docKey]?.en ?? "");
  return { ok: true, told: tellCode ? 1 : 0, edition: edition.no, issued, namesWithheld, scoresWithheld };
}

/** The users a document may go to by name — of the legal entities with a participation in
 *  the scheme's round — opened ONLY when «one user» is chosen, by who may see names (5.4). */
export async function releaseUsersAction(schemeId: string): Promise<{ value: string; label: string }[]> {
  await requireCap("docs.release", schemeId);
  if (!(await mayNow("names.view", schemeId))) return [];
  const scheme = await getScheme(schemeId);
  if (!scheme) return [];
  const actor = await actorNow();
  const going = (await listParticipants(schemeId)).filter((p) => inFinalRound(scheme, p));
  const entities = [...new Set((await Promise.all(going.map((p) => participationEntity(schemeId, p.code, actor)))).filter((x): x is string => !!x))];
  const users = (await Promise.all(entities.map((e) => openEntityUsers({ actor, purpose: "names.view" }, { entityId: e })))).flat();
  return users.filter((u) => u.state === "active").map((u) => ({ value: u.id, label: `${u.name}${u.email ? ` <${u.email}>` : ""}` }));
}

/** A release to one participation or one user, withdrawn — kept, with the date (5.4). */
export async function withdrawReleaseAction(schemeId: string, releaseId: string): Promise<{ ok: true } | { error: string }> {
  await requireCap("docs.release", schemeId);
  const by = await actorNow();
  let found: TargetRelease | undefined;
  await updateSchemeWith(schemeId, (cur) => {
    found = (cur.releases ?? []).find((r) => r.id === releaseId && !r.withdrawnAt);
    if (!found) return {};
    const at = new Date().toISOString();
    return { releases: (cur.releases ?? []).map((r) => (r.id === releaseId ? { ...r, withdrawnAt: at, withdrawnBy: by } : r)) };
  });
  if (!found) return { error: RELEASE_REFUSAL.gone };
  const f = found as TargetRelease;
  // the withdrawal is recorded: its journal line never lost to a failed lookup (5.4 review)
  const code = f.participantId ? await listParticipants(schemeId).then((ps) => ps.find((p) => p.id === f.participantId)?.code ?? "?", () => "?") : undefined;
  await logActivity("doc.unsent", { schemeId, subject: `edition:${f.editionId}`, ...(code ? { targetCode: code } : {}), summary: `Document “${f.docKey}” withdrawn from ${f.level === "participation" ? `one participation (${code ?? "?"})` : "one user"}` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "layout");
  return { ok: true };
}

const EDITION_REFUSAL: Record<string, string> = {
  reason: "From the second edition on, say what changed and why (5 characters at least).",
  "too-long": "The note is too long (1000 characters at most each).",
  empty: "There is nothing in this document yet — upload a file or create it first.",
  conflict: "Someone issued an edition of this document at the same moment. Reload and look at it first.",
  editionless: "This document has no editions: it is drawn from the live data.",
  failed: "Could not keep the edition's file, so nothing was issued. Try again in a moment.",
  incomplete: "Документът не е готов за издаване: има места «за попълване», липсва заглавие от M1 или число, което вече не е на схемата. · The document is not ready to issue: a place to fill in, a missing M1 heading, or a number that is no longer the scheme's.",
  amendment: "Планът и поканата на отворена схема се изменят само със заповед за изменение — «Изменения» на схемата (Zadanie §3). · Once the scheme is open, the plan and the invitation change only by an order of amendment — the scheme's «Amendments».",
};

/** From the scheme's opening, a CHANGED plan or invitation is issued only as an
 *  amendment's edition (3.3) — never by «Изпрати» or «Издай нова редакция». The first
 *  edition, and the same content issued again because its file is gone, are not
 *  changes. */
const amendmentOnly = (scheme: Scheme, docKey: string, latest: DocEdition | null) =>
  !!latest && isAmendedDoc(docKey) && needsAmendment(scheme);

/** The edition a release sends: the latest one if the document is still what it froze,
 *  else the next one, issued now — which, from edition 2 on, needs the person's note. */
/** A calibration document on M1 is issued whole — no «[за попълване]» left, every M1
 *  heading in place (3.10); null when it may be issued. */
function m1Refusal(scheme: Scheme, docKey: string, now: Frozen): string | null {
  if (now.source !== "rendered" || !usesM1(scheme) || !isM1Doc(docKey)) return null;
  const bg = m1Problems(now.bg, docKey, "bg", scheme), en = m1Problems(now.en, docKey, "en", scheme);
  if (!bg.length && !en.length) return null;
  return `Документът не е готов за издаване: ${(bg.length ? bg : en).join("; ")}. · The document is not ready to issue: ${(en.length ? en : bg).join("; ")}.`;
}

async function editionToSend(scheme: Scheme, docKey: string, note: { reason?: string; scope?: string } | undefined, by: string):
  Promise<{ edition: DocEdition; issued: boolean } | { needsNote: { no: number; since: number } } | { error: string }> {
  let now: Frozen | null;
  let latest: DocEdition | null;
  try {
    [now, latest] = await Promise.all([freezeNow(scheme, docKey), latestEdition(scheme.id, docKey)]);
  } catch (e) {
    console.warn("[release] could not read the document or its editions:", (e as Error)?.message ?? e);
    return { error: EDITION_REFUSAL.failed };
  }
  if (!now) return { error: EDITION_REFUSAL.empty };
  const notWhole = m1Refusal(scheme, docKey, now);
  if (notWhole) return { error: notWhole };
  // An opened scheme's plan or invitation sent again: the edition the participants last
  // held — not a later one issued meanwhile, unless an amendment issued it (3.3)
  const keptRec = isAmendedDoc(docKey) && needsAmendment(scheme) ? scheme.releasedEditions?.[docKey] : undefined;
  if (latest && keptRec && keptRec.id !== latest.id && !amendmentStampFor(scheme, latest)) {
    const kept = await getEdition(keptRec.id).catch(() => null);
    if (kept && kept.schemeId === scheme.id && kept.docKey === docKey && (await servable(kept))) return { edition: kept, issued: false };
    return { error: EDITION_REFUSAL.amendment };
  }
  let reason = note?.reason;
  // an amendment's edition keeps its line, when it is recognised and when re-issued (3.3)
  const stamp = amendmentStampFor(scheme, latest);
  if (latest && sameAs(now, latest, stamp)) {
    if (await servable(latest)) return { edition: latest, issued: false };
    // unchanged, but its file is gone or not the one recorded: never sent as it is —
    // the same content goes out as the next edition, saying why
    console.error(`[editions] edition ${latest.no} of “${docKey}” (${scheme.id}) cannot be served — issuing the same content again`);
    reason = reissueReason(latest.no);
  } else if (amendmentOnly(scheme, docKey, latest)) return { error: EDITION_REFUSAL.amendment };
  else if (latest && !String(reason ?? "").trim()) return { needsNote: { no: latest.no + 1, since: latest.no } };
  const r = await issueEdition({ scheme, docKey, frozen: now, reason, scope: note?.scope, by, amendment: latest && sameAs(now, latest, stamp) ? stamp : undefined });
  if (!r.ok) return { error: EDITION_REFUSAL[r.error] ?? EDITION_REFUSAL.failed };
  await logActivity("doc.edition", {
    schemeId: scheme.id, subject: `edition:${r.edition.id}`,
    summary: `${editionLabel("en", r.edition.no, r.edition.issuedOn)} of “${docKey}” issued — ${r.edition.reason}${r.edition.scope ? ` (scope: ${r.edition.scope})` : ""}`,
  });
  return { edition: r.edition, issued: true };
}

// ── Issue an edition (part 3.0) ──────────────────────────────────────────────
// The document as it is now becomes its next edition — number, date, the note of
// what changed and why, the frozen file — whether or not it is sent anywhere: the
// Order, the plan, the statistical design are issued too. Nothing is issued when
// nothing changed since the latest one.
export async function issueEditionAction(
  schemeId: string,
  docKey: string,
  note: { reason?: string; scope?: string },
): Promise<{ ok?: boolean; error?: string; no?: number }> {
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
  // the Order only by the staff it is for (Реш. 149), a names list never (none has editions)
  if (!(await mayViewDoc(docKey, schemeId))) return { error: "This document is not one you may open." };
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  if (!getDoc(docKey) || !hasEditions(docKey)) return { error: EDITION_REFUSAL.editionless };
  let now: Frozen | null;
  let latest: DocEdition | null;
  try {
    [now, latest] = await Promise.all([freezeNow(scheme, docKey), latestEdition(schemeId, docKey)]);
  } catch {
    return { error: EDITION_REFUSAL.failed };
  }
  if (!now) return { error: docKey === "report" ? "The final report is issued as PTS's own file — upload it first." : EDITION_REFUSAL.empty };
  const notWhole = m1Refusal(scheme, docKey, now);
  if (notWhole) return { error: notWhole };
  let reason = note?.reason;
  const stamp = amendmentStampFor(scheme, latest);
  const same = !!latest && sameAs(now, latest, stamp);
  if (latest && same) {
    if (await servable(latest)) return { error: `Nothing has changed since edition ${latest.no} — there is nothing to issue.` };
    if (!String(reason ?? "").trim()) reason = reissueReason(latest.no); // its file is gone or altered
  } else if (amendmentOnly(scheme, docKey, latest)) return { error: EDITION_REFUSAL.amendment };
  const r = await issueEdition({ scheme, docKey, frozen: now, reason, scope: note?.scope, by: await actorNow(), amendment: same ? stamp : undefined });
  if (!r.ok) return { error: EDITION_REFUSAL[r.error] ?? EDITION_REFUSAL.failed };
  await logActivity("doc.edition", {
    schemeId, subject: `edition:${r.edition.id}`,
    summary: `${editionLabel("en", r.edition.no, r.edition.issuedOn)} of “${docKey}” issued — ${r.edition.reason}${r.edition.scope ? ` (scope: ${r.edition.scope})` : ""}`,
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true, no: r.edition.no };
}

// ── The scheme's four working dates ──────────────────────────────────────────
// Operational only: they tell a laboratory what it is waiting for and they feed
// the day-before reminder. They never reach a document, and they gate nothing —
// a date can pass unmet and the round carries on, because in the real work it
// often does. Blank clears a date; an unparseable one is refused rather than
// stored as junk the reminder would later trip over.
export async function setSchemeDatesAction(
  schemeId: string,
  input: Partial<Record<SchemeDateKey, string>>,
): Promise<{ ok?: boolean; error?: string }> {
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
  const prior = await getScheme(schemeId);
  if (!prior) return { error: "Scheme not found." };
  // the published deadlines change only by an order of amendment (3.3; Zadanie §3,
  // Реш. 154) — or, for one laboratory, an individual extension (3.4)

  const dates: Record<string, string> = {};
  for (const key of DATE_KEYS) {
    const v = String(input?.[key] ?? "").trim();
    if (!v) continue; // blank = not set
    // a day, or a day and its hour in Bulgaria (3.4)
    if (!isDeadline(v)) return { error: `“${DATE_LABELS[key].en}” is not a valid date (and hour).` };
    dates[key] = v;
  }
  // From the opening, a deadline already set is CHANGED only by an amendment — and
  // never cleared here; one not yet set may still be set (it changes nothing published)
  const changesSet = (s: Scheme) => needsAmendment(s) && DATE_KEYS.some((k) => !!s.dates?.[k] && dates[k] !== s.dates[k]);
  const refusal = { error: "Сроковете на отворена схема се сменят само със заповед за изменение — «Изменения». · Once the scheme is open, its deadlines change only by an order of amendment — «Amendments»." };
  if (changesSet(prior)) return refusal;
  // Replaces the whole set, so clearing a field really clears it — re-checked inside the
  // lock, so an amendment recorded meanwhile is never undone (3.4 review)
  let late = false;
  await updateSchemeWith(schemeId, (cur) => { if (changesSet(cur)) { late = true; return {}; } return { dates }; });
  if (late) return refusal;
  await logActivity("scheme.dates", {
    schemeId, subject: `scheme:${schemeId}`, before: prior.dates ?? {}, after: dates,
    summary: `Working dates set: ${DATE_KEYS.filter((k) => dates[k]).map((k) => `${DATE_LABELS[k].en} ${dates[k]}`).join(", ") || "none"}`,
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "page");
  return { ok: true };
}

// ── Per-laboratory documents (the proforma invoice) ──────────────────────────
// The mirror image of a lab's own uploads: one file per PARTICIPATION, stored
// under its code. Putting the file in the slot is the act of sending it — there
// is no separate release step, because the upload was already for one named lab
// (see lib/doc-release).
//
// MANAGER ONLY, both here and in the viewer route. A proforma invoice is made out
// to the laboratory by name and VAT number, so handling one crosses the
// code↔identity line that staff and auditors work behind (§4.2) — the same reason
// a lab's own signed protocol is manager-only to open.
export async function uploadLabDocAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("participants.manage", schemeId); // in THIS scheme, by the role model (2.4)
  const code = String(formData.get("code") ?? "").trim();
  const slot = String(formData.get("slot") ?? "");
  if (!isLabDocSlot(slot)) return { error: "Unknown document." };
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  // a scheme that is not held invoices nothing — neither document (О9, Реш. 129)
  if (scheme.status === "not_held") return { error: "Схемата не се състои — нищо не се фактурира. · The scheme is not held — nothing is invoiced." };
  // the code must be a real participation in THIS scheme — never trust the form
  const participant = (await listParticipants(schemeId)).find((p) => p.code === code);
  if (!participant) return { error: "No such participant in this scheme." };
  // a proforma or an invoice only after the second announcement, to a participation on its
  // final list (5.2; Реш. 65)
  const invoiceNo = invoiceProblem(scheme, participant);
  if (invoiceNo) return { error: ANNOUNCE_REFUSAL[invoiceNo] };
  // its number, as the accounting software gives it (Реш. 36); the original invoice only
  // once the payment is marked — «Неплатена оригинална фактура не съществува» (Реш. 35)
  const docNumber = readDocNumber(formData.get("number"));
  const slotProblem = invoiceSlotProblem(slot as "proforma" | "invoice", docNumber, !!scheme.paidAt?.[code]);
  if (slotProblem) return { error: `${INVOICE_PROBLEM_TEXT[slotProblem].bg} · ${INVOICE_PROBLEM_TEXT[slotProblem].en}` };
  // a document for the participation is news for it: who it is, before anything is saved (2.3)
  const invoiceTell = await labToTell(schemeId, code);
  if (!invoiceTell) return { error: NOT_REACHED };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file received." };
  const ext = SCHEME_DOC_EXT[file.type];
  if (!ext) return { error: "Use a PDF, JPG or PNG file." };
  if (file.size > MAX_SCHEME_DOC_BYTES) return { error: "File too large (max 15 MB)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!magicMatches(bytes, file.type)) return { error: "That file isn't a real PDF/JPG/PNG." };

  const actor = (await getRoleContext()).email ?? "";
  const name = String(file.name || `${slot}.${ext}`).slice(0, 160);

  let path: string;
  const db = getDb();
  if (db) {
    try {
      await ensureSchemeDocsBucket(db);
      path = `labdocs/${schemeId}/${code}/${slot}-${randomUUID()}.${ext}`;
      const { error } = await db.storage.from(SCHEME_DOC_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
      if (error) throw error;
    } catch (e) {
      return { error: (e as Error)?.message || "Upload failed." };
    }
  } else {
    path = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  const upload: UploadedDoc = { path, name, mime: file.type, size: file.size, uploadedAt: new Date().toISOString(), uploadedBy: actor, number: docNumber! };
  // updateSchemeWith, not updateScheme: the map is rebuilt from the FRESH scheme
  // inside the per-scheme lock. Invoices are issued one lab after another, and a
  // plain read-modify-write would drop the previous one if two overlapped — the
  // same reason applications.ts takes the lock.
  // What the new file REPLACES is read inside the lock too, so two overlapping
  // uploads can't both decide the same old object is theirs to delete.
  // What it REPLACES is kept and recorded (part 0.9), read inside the lock too.
  let replacedDoc: UploadedDoc | undefined;
  let notHeldNow = false;
  await updateSchemeWith(schemeId, (s) => {
    // re-checked inside the lock: a scheme declared not held meanwhile invoices nothing;
    // nor one stepped back past its second announcement meanwhile (5.2)
    notHeldNow = s.status === "not_held" || invoiceProblem(s, participant) !== null
      // the invoice re-checked too: still paid (Реш. 35)
      || (slot === "invoice" && !s.paidAt?.[code]);
    if (notHeldNow) return {};
    replacedDoc = s.labDocs?.[code]?.[slot];
    return {
      labDocs: { ...(s.labDocs ?? {}), [code]: { ...(s.labDocs?.[code] ?? {}), [slot]: upload } },
      ...supersede(s, `labdoc:${code}:${slot}`, s.labDocs?.[code]?.[slot], "replaced", actor),
    };
  });
  if (notHeldNow) return { error: "Схемата не се състои или окончателният ѝ списък е отменен — нищо не се фактурира. · The scheme is not held, or its final list was undone — nothing is invoiced." };

  await notifyInvoiceReady(invoiceTell.labId, schemeId, scheme.number, code, { slot: slot as "proforma" | "invoice", number: docNumber!, participantId: participant.id });
  // The log records the CODE and nothing else. NOT the file name: accounting
  // software names an invoice after the customer ("Проформа-2026-ЕкоЛаб-ООД.pdf"),
  // and the activity log, the case file and the audit pack are all read by staff
  // and auditors who work behind the code (§4.2). The invoice itself is
  // manager-only; its name must not walk out through the trail beside the code.
  // A manager who needs the file name sees it on the case page, where the file is.
  await logActivity("labdoc.uploaded", {
    schemeId, targetCode: code, subject: `labdoc:${code}:${slot}`,
    // its number is the accounting software's, not a name — the journal may carry it (5.8)
    summary: `${LAB_DOC_SLOTS[slot].en} No. ${docNumber} ${replacedDoc ? "replaced" : "sent"} to ${code}`,
    // never the file name — an invoice is named after the customer (§4.2)
    before: replacedDoc ? { size: replacedDoc.size, mime: replacedDoc.mime, at: replacedDoc.uploadedAt, number: replacedDoc.number ?? null } : null,
    after: { size: upload.size, mime: upload.mime, at: upload.uploadedAt, number: docNumber },
  });
  // No case event either. The case file is the ISO traceability chain for the PT
  // ITEMS, and "docs_sent" there means the participant handouts went out. An
  // invoice is not a handout, and stamping it would tick that milestone — and the
  // traceability matrix with it — for a round where nothing has been sent yet.
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

export async function removeLabDocAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("participants.manage", schemeId); // in THIS scheme, by the role model (2.4)
  const code = String(formData.get("code") ?? "").trim();
  const slot = String(formData.get("slot") ?? "");
  if (!isLabDocSlot(slot)) return { error: "Unknown document." };
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };

  // The file is taken out of the slot but never deleted: it is kept and recorded
  // as superseded (part 0.9), decided inside the lock.
  const actor = (await getRoleContext()).email ?? "";
  await updateSchemeWith(schemeId, (s) => {
    const removed = s.labDocs?.[code]?.[slot];
    const labDocs = { ...(s.labDocs ?? {}) };
    // Drop the slot, and the code's whole entry once its last slot is gone, so the
    // scheme JSONB doesn't accumulate empty objects for every participant ever.
    const forCode: Partial<Record<string, UploadedDoc>> = { ...(labDocs[code] ?? {}) };
    delete forCode[slot];
    if (Object.keys(forCode).length === 0) delete labDocs[code];
    else labDocs[code] = forCode;
    return { labDocs, ...supersede(s, `labdoc:${code}:${slot}`, removed, "removed", actor) };
  });
  await logActivity("labdoc.removed", { schemeId, targetCode: code, summary: `${LAB_DOC_SLOTS[slot as LabDocSlot].en} removed for ${code}` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// The "платена" tick. Payment itself happens outside the app — the accountant
// handles it — so this is a note to self and nothing more: it gates nothing,
// blocks nothing, and is deliberately NOT wired to the participant status ladder,
// which drives the lab's timeline and must not jump backwards because an invoice
// was ticked late. Writer-level: it says nothing about who is behind the code.
export async function setParticipantPaidAction(
  schemeId: string,
  code: string,
  paid: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  await requireCap("participants.manage", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  if (!(await listParticipants(schemeId)).some((p) => p.code === code)) {
    return { error: "No such participant in this scheme." };
  }
  const at = new Date().toISOString();
  // an original invoice exists only for one paid (Реш. 35): not unmarked while it is held
  let held = false;
  await updateSchemeWith(schemeId, (s) => {
    if (!paid && s.labDocs?.[code]?.invoice) { held = true; return {}; }
    const paidAt = { ...(s.paidAt ?? {}) };
    if (paid) paidAt[code] = at;
    else delete paidAt[code];
    return { paidAt };
  });
  if (held) return { error: "Оригиналната фактура е качена — първо я премахнете, после отбележете неплатено. · The original invoice is uploaded — remove it first, then mark unpaid." };
  await logActivity(paid ? "payment.marked" : "payment.unmarked", {
    schemeId, targetCode: code,
    summary: paid ? `${code} marked paid` : `${code} no longer marked paid`,
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// Remove an uploaded file from a document's slot. The stored file is kept and
// recorded as superseded (part 0.9). The app-built version, if any, becomes active.
export async function removeSchemeDocUploadAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
  const docKey = String(formData.get("docKey") ?? "");
  await requireDocWriter(docKey, schemeId);
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const actor = (await getRoleContext()).email ?? "";
  await updateSchemeWith(schemeId, (s) => {
    const uploads = { ...(s.uploads ?? {}) };
    const removed = uploads[docKey];
    delete uploads[docKey];
    return { uploads, docActive: { ...(s.docActive ?? {}), [docKey]: "built" as const }, ...supersede(s, `upload:${docKey}`, removed, "removed", actor) };
  });
  await logActivity("doc.upload_removed", { schemeId, summary: `Uploaded file removed for document “${docKey}”` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// Mark a started (editor-built) document as READY / back to in-progress. A doc
// with content is only "Готов" on the scheme page when this flag is set — the
// owner decides, not the mere existence of text (button in the editor's action bar).
export async function setDocReadyAction(schemeId: string, docKey: string, ready: boolean): Promise<{ ok?: boolean; error?: string }> {
  await requireDocWriter(docKey, schemeId);
  if (!isDocKey(docKey)) return { error: "Unknown document." };
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const docReady = { ...(scheme.docReady ?? {}) };
  if (ready) docReady[docKey] = true; else delete docReady[docKey];
  await updateScheme(schemeId, { docReady });
  await logActivity(ready ? "doc.ready" : "doc.reopened", { schemeId, summary: `Document “${docKey}” marked ${ready ? "ready" : "in progress"}` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// Switch which version of a document is active/official when both an uploaded file
// and an app-built version exist ("uploaded" | "built").
export async function setDocSourceAction(schemeId: string, docKey: string, source: "built" | "uploaded"): Promise<{ ok?: boolean; error?: string }> {
  await requireDocWriter(docKey, schemeId);
  if (!isDocKey(docKey)) return { error: "Unknown document." };
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const docActive = { ...(scheme.docActive ?? {}), [docKey]: source };
  await updateScheme(schemeId, { docActive });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// Save the Word-like editor's HTML for a document (both languages). The body is
// user-authored rich HTML, so it is SANITIZED here (the server trust boundary) —
// stripping any <script>/event-handler/js: URL — and size-capped so a document
// can't run script in the app origin or bloat the scheme row unbounded.
const MAX_DOC_HTML = 3_000_000; // 3 MB per language (images now go to storage, not base64)
export async function saveDocHtmlAction(schemeId: string, docKey: string, bg: string, en: string) {
  await requireDocWriter(docKey, schemeId);
  const scheme = await getScheme(schemeId);
  if (!scheme) throw new Error("Scheme not found");
  // the coded lists' mark goes on after sanitizing (it is an HTML comment)
  const cleanBg = markCodedList(docKey, sanitizeDocHtml(bg));
  const cleanEn = markCodedList(docKey, sanitizeDocHtml(en));
  if (cleanBg.length > MAX_DOC_HTML || cleanEn.length > MAX_DOC_HTML) {
    throw new Error("Document is too large. Insert images as photos (they upload automatically) rather than pasting them inline.");
  }
  const docs = { ...(scheme.docs ?? {}), [docKey]: { bg: cleanBg, en: cleanEn } };
  await updateScheme(schemeId, { docs });
  // §8.3 — snapshot a revision (skips if unchanged). Records who saved it.
  const actor = (await getRoleContext()).email ?? "";
  await addRevision({ schemeId, docKey, bg: cleanBg, en: cleanEn, savedBy: actor });
  await logActivity("doc.saved", { schemeId, summary: `Document “${docKey}” edited` });
  revalidatePath(`/schemes/${schemeId}/build/${docKey}`, "page");
}

// Translate a whole document's HTML BG→EN, preserving tags/images (only text runs
// are translated, via the free MyMemory provider). The owner then edits the EN.
// The translation is an outside service with no contract (MyMemory — part 1.12): a
// document that names laboratories never goes to it — by its kind (the lists, the
// certificate) or by what it holds (a code-and-laboratory table), whatever the caller sends.
const TRANSLATE_REFUSED = "Документ с имена на лаборатории не се изпраща за превод навън. · A document naming laboratories is never sent out for translation.";
export async function translateDocHtmlAction(html: string, docKey?: string): Promise<{ html?: string; error?: string }> {
  await requireCapAnywhere("scheme.edit"); // the role model (2.4)
  if (typeof docKey === "string" && (isListDoc(docKey) || pairsNamesWithCodes(docKey))) return { error: TRANSLATE_REFUSED };
  if (hasCohortNames(String(html ?? ""))) return { error: TRANSLATE_REFUSED };
  const parts = String(html ?? "").split(/(<[^>]+>)/);
  // Bound the number of outbound translation calls: only the first N text runs are
  // translated (each is one fetch); the rest pass through untranslated. Prevents a
  // pathological document (thousands of tiny text runs) from firing thousands of
  // requests. Real documents have well under this many runs.
  const MAX_TEXT_RUNS = 400;
  let runs = 0;
  const out: string[] = [];
  for (const part of parts) {
    if (part.startsWith("<") || !part.trim() || runs >= MAX_TEXT_RUNS) {
      out.push(part);
      continue;
    }
    runs++;
    const r = await translateAction(part, "bg", "en");
    // Stop at the first refusal and report it, instead of returning a half-translated
    // document. The dominant failure is the daily quota, which will reject every
    // remaining run as well — and a silently partial translation is worse than none,
    // because nothing on the page shows which paragraphs are genuinely translated.
    if (r.error) return { error: r.error };
    out.push(r.text ?? part);
  }
  return { html: out.join("") };
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
  // Online applications are closed in the transition (Реш. 1, part 0.4): nothing is
  // accepted, whatever posts here — the public form, the signed-in wizard, a script.
  if (!ONLINE_APPLICATIONS_OPEN) redirect("/apply");
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const schemeId = get("schemeId");

  if (get("website")) redirect("/apply/thanks"); // honeypot tripped → drop quietly
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!allowSubmission(ip)) redirect("/apply/thanks"); // rate-limited → drop quietly

  const scheme = await getScheme(schemeId);
  // basic server-side validation (the client validates too). Only an OPEN scheme
  // takes applications — a draft or a running one never did (part 0.3/0.4).
  if (!scheme || scheme.status !== "open" || !get("labName") || !get("email")) redirect(schemeId ? `/apply/${schemeId}` : "/apply");

  // The sel_i answers are POSITIONAL against the standards list the wizard
  // rendered. If the owner restructured the standards while this form was open,
  // the positions no longer mean the same standards — bounce back to a fresh
  // form instead of recording participations against the wrong standards.
  // (Forms rendered before this field existed post no signature → accepted.)
  const sig = get("paramSig");
  if (sig && sig !== paramsSignature(scheme.parameters)) redirect(`/apply/${schemeId}`);

  // The wizard also posts WHICH branch its step 3 rendered ("cal" = the device
  // item, "std" = the standards). If the owner's edits flipped the branch while
  // the form was open, the positional sel_i answers mean different things —
  // bounce to a fresh form instead of misrecording them (paramSig can't catch
  // this: calibration edits never touch scheme.parameters).
  const serverBranch = usesCalApplyItem(scheme) ? "cal" : "std";
  const postedBranch = get("applyBranch");
  if (postedBranch && postedBranch !== serverBranch) redirect(`/apply/${schemeId}`);

  const selections: Record<string, number> = {};
  if (serverBranch === "cal") {
    // Calibration: the wizard showed ONE item (the device) → sel_0 is the
    // participation count, stored under the reserved "cal" key (lib/apply-item).
    const n = parseInt(get("sel_0") || "0", 10);
    if (Number.isFinite(n) && n > 0) selections[CAL_SELECTION_KEY] = Math.min(n, 99);
  } else {
    scheme.parameters.forEach((_, i) => {
      const n = parseInt(get(`sel_${i}`) || "0", 10);
      // the same cap as an application entered by PTS (5.1) — one rule, never a count
      // the edit form could not take back
      if (Number.isFinite(n) && n > 0) selections[String(i)] = Math.min(n, MAX_PER_CHARACTERISTIC);
    });
  }

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
  // Tell the owner a заявка is waiting. Scheme number only — the notice carries no
  // laboratory name (§4.2); the applications page behind the link shows who applied.
  await notifyApplicationReceived(schemeId, scheme!.number);

  redirect("/apply/thanks");
}

// Owner approves a pending application → creates the participant (auto code) and
// marks the application approved.
export async function approveApplicationAction(formData: FormData) {
  // Manager only: the заявка names the lab and approving mints its code, so whoever
  // approves learns the name↔code link (§4.2, N29).
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("participants.manage", schemeId); // in THIS scheme, by the role model (2.4)
  const appId = String(formData.get("appId") ?? "");
  // One read serves both: the заявка being approved and the scheme number the
  // approval notice quotes back to the laboratory (applications live in the scheme).
  const scheme = await getScheme(schemeId);
  const app = scheme?.applications?.find((a) => a.id === appId);
  // only a pending заявка: a double click must not mint a second participant — and
  // it is CLAIMED in the lock first, so two approvals at once never both go on: each
  // draws a different number now (3.12 review)
  if (!app || app.status !== "pending") redirect(`/schemes/${schemeId}/applications`);
  // the final list announced (5.2): no new participation — re-checked in the claim's lock
  if (scheme && currentFinalList(scheme)) redirect(`/schemes/${schemeId}/applications?err=list-final`);
  let claimed = false;
  let listFinal = false;
  await updateSchemeWith(schemeId, (cur) => {
    const a = cur.applications?.find((x) => x.id === appId);
    if (!a || a.status !== "pending") return {};
    if (currentFinalList(cur)) { listFinal = true; return {}; }
    claimed = true;
    return { applications: (cur.applications ?? []).map((x) => (x.id === appId ? { ...x, status: "approved" as const } : x)) };
  });
  if (listFinal) redirect(`/schemes/${schemeId}/applications?err=list-final`);
  if (!claimed) redirect(`/schemes/${schemeId}/applications`);

  // the participations follow from the counts — the same rule as an application
  // entered by PTS (5.1: its largest count, one participation a set)
  const total = participationSets(app.selections);
  // Keep WHICH characteristics the lab picked (F 7.2.1-6 renders one row per
  // characteristic) — previously this detail was flattened into `total` and lost.
  const characteristics = Object.entries(app.selections)
    .filter(([, n]) => n > 0)
    .map(([idx]) => parseInt(idx, 10))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);

  // Link this participation to a lab account only when a SIGNED-IN lab submitted the
  // заявка (app.labId — the authenticated identity). A public заявка carries a typed
  // e-mail, which proves nothing: matching it to an account (or minting one from it)
  // could hand this participation to another lab's portal (finding N2, part 0.5).
  // Such a participant stays unlinked until PTS links it deliberately (part 4.4).
  const labId: string | undefined = app.labId;

  // a failed write is shown and the заявка stays pending — nothing half-done (N14)
  const p = await addParticipant({
    schemeId,
    labName: app.labName,
    contact: app.contactPerson,
    email: app.email,
    phone: app.phone,
    deliveryAddress: app.deliveryAddress,
    participations: total,
    labId,
    characteristics,
    // the application's own counts per characteristic (5.1)
    selections: Object.fromEntries(Object.entries(app.selections).filter(([, n]) => Number.isInteger(n) && n > 0)),
  }, await actorNow()).catch((e) => (e instanceof NoLabNumberError ? "full" as const : null));
  if (!p || p === "full") {
    // nothing half-done: the заявка is pending again
    await updateSchemeWith(schemeId, (cur) => ({ applications: (cur.applications ?? []).map((x) => (x.id === appId && x.status === "approved" ? { ...x, status: "pending" as const } : x)) }));
    redirect(`/schemes/${schemeId}/applications?err=${p === "full" ? "numbers" : "save"}`);
  }
  await logActivity("application.approved", { schemeId, targetCode: p.code, summary: `Application approved → ${isProvisional(p.code) ? `application ${p.code} (no code until the coding act)` : `participant ${p.code}`}${p.drawnFrom ? ` (laboratory number drawn at random from ${p.drawnFrom} free, at admission — D17)` : ""}` });
  // a code assigned now only at admission (D17); else at the coding act (5.3)
  if (!isProvisional(p.code)) {
    await addCaseEvent({ schemeId, code: p.code, kind: "code_assigned", at: await roundDay(schemeId), source: "auto" });
    await advanceStatusForEvent(schemeId, p.code, "code_assigned");
  }
  // This is where a laboratory learns the code it works under for THIS scheme —
  // a different code in every scheme it joins.
  await notifyApplicationApproved(labId, schemeId, scheme!.number, p.code);

  revalidatePath(`/schemes/${schemeId}`, "layout");
  redirect(`/schemes/${schemeId}/applications`);
}

// ── Lab self-upload (traceability iteration 2, owner-approved 2026-07-09) ───────
// A signed-in lab uploads its signed receipt protocol / completed results sheet
// for a scheme it participates in. The upload is validated like the owner's doc
// uploads (type allow-list, 15 MB cap, magic bytes), stored PRIVATELY, recorded
// on scheme.labUploads[code][slot], and auto-stamps the case file (which advances
// the participant status → matrix + timeline move without staff typing anything).
// Replace is allowed until the participation is scored; then the slot is locked.
// E-mail stays a first-class path — staff keep recording those steps manually.
export async function labUploadDocAction(formData: FormData): Promise<void> {
  const ls = await getLabSession();
  if (!ls) redirect("/lab/login");
  const schemeId = String(formData.get("schemeId") ?? "");
  const slot = String(formData.get("slot") ?? "") as LabUploadSlot;
  // hasOwnProperty, not a bare lookup: LAB_UPLOAD_SLOTS["constructor"] resolves up
  // the prototype chain to a truthy function, so a posted slot of "constructor" or
  // "toString" used to pass this guard and be written into scheme.labUploads with
  // an undefined event kind. A Server Action can be POSTed directly, so the form
  // never having offered those values is not a defence.
  if (!Object.prototype.hasOwnProperty.call(LAB_UPLOAD_SLOTS, slot)) redirect("/lab");
  // back to the participation's page it came from (5.5) — only ever one of its own pages
  const backRaw = String(formData.get("back") ?? "");
  const back = /^\/lab\/p\/[0-9A-Za-z-]{8,64}$/.test(backRaw) ? backRaw : "/lab";
  // the participation, when the form names it: a laboratory in a scheme twice uploads for the
  // one it means, not the first one found (5.5)
  const pid = String(formData.get("participantId") ?? "").trim();
  const slotDef = LAB_UPLOAD_SLOTS[slot];

  // the lab must own a participation in this scheme (never trust the form), and the
  // scheme must have started — a draft is refused like a scheme it is not in (Реш. 147)
  const mine = (await listVisibleParticipations(ls!.lab.id)).find((p) => p.schemeId === schemeId && (!pid || p.id === pid));
  if (!mine) redirect("/lab");
  // refused, annulled or withdrawn: out of the round — it sends nothing more (5.1 review)
  if (!inRound(mine!)) redirect(`${back}?e=locked`);
  // …nor one off the final list, told it goes no further (5.2 review) — checked below with the scheme
  // locked once scored (evaluation integrity)
  if (!canLabUploadNow(mine!.status)) redirect(`${back}?e=locked`);

  const scheme = await getScheme(schemeId);
  if (!scheme) redirect("/lab");
  // from processing on, results come only through PTS (Реш. 111); a scheme that is
  // not held or whose records are closed takes nothing (3.2)
  const st = scheme!.status;
  const lockedNow = (x: string) => x === "not_held" || x === "closed" || (slot === "results" && (x === "processing" || x === "report"));
  if (lockedNow(st)) redirect(`${back}?e=locked`);
  if (!inFinalRound(scheme!, mine!)) redirect(`${back}?e=locked`);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`${back}?e=upload`);
  const f = file as File;
  const ext = SCHEME_DOC_EXT[f.type];
  if (!ext || f.size > MAX_SCHEME_DOC_BYTES) redirect(`${back}?e=upload`);
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (!magicMatches(bytes, f.type)) redirect(`${back}?e=upload`);

  const code = mine!.code;
  const name = String(f.name || `${slot}.${ext}`).slice(0, 160);
  const prev = scheme!.labUploads?.[code]?.[slot];

  let path: string;
  const db = getDb();
  if (db) {
    try {
      await ensureSchemeDocsBucket(db);
      path = `labs/${schemeId}/${code}/${slot}-${randomUUID()}.${ext}`;
      const { error } = await db.storage.from(SCHEME_DOC_BUCKET).upload(path, bytes, { contentType: f.type, upsert: false });
      if (error) throw error;
      // the replaced file is NOT deleted — it is kept and recorded below (part 0.9)
    } catch {
      redirect(`${back}?e=upload`);
    }
  } else {
    // no Supabase (dev) → keep the bytes inline so the flow still works locally
    path = `data:${f.type};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  // by account id, not e-mail: the upload sits under the participant code (§4.2)
  // the moment that counts against its deadline is the round's (1.3, 3.4)
  const upload: UploadedDoc = { path: path!, name, mime: f.type, size: f.size, uploadedAt: new Date().toISOString(), uploadedBy: `lab:${ls!.lab.id}`, roundAt: schemeNowIso(scheme!) };
  // Locked read-modify-write from the FRESH scheme (finding N8): two laboratories
  // uploading at once can no longer lose one another's record. The file this one
  // replaces is kept and recorded (N9).
  // …and the state re-checked there: an upload still on its way when processing
  // started is not recorded (3.2; the stored file stays, unreferenced)
  let late = true;
  await updateSchemeWith(schemeId, (s) => {
    late = lockedNow(s.status);
    if (late) return {};
    return {
      labUploads: { ...(s.labUploads ?? {}), [code]: { ...(s.labUploads?.[code] ?? {}), [slot]: upload } },
      ...supersede(s, `labupload:${code}:${slot}`, s.labUploads?.[code]?.[slot], "replaced", `lab:${ls!.lab.id}`),
    };
  });
  if (late) redirect(`${back}?e=locked`);

  // auto-stamp the case file → the matrix fills in and the status advances
  // No file name and no e-mail in the timeline: staff and auditors read it by code,
  // and a lab's file name or address would say which lab the code is (§4.2, N4).
  await addCaseEvent({
    schemeId, code, kind: slotDef.kind, docKey: slotDef.docKey, at: await roundDay(schemeId),
    note: prev ? "replaced by the laboratory (portal upload)" : "uploaded by the laboratory (portal)",
    recordedBy: LAB_RECORDER, source: "auto",
  });
  await advanceStatusForEvent(schemeId, code, slotDef.kind);
  await logActivity("lab.uploaded", {
    schemeId, targetCode: code, subject: `labupload:${code}:${slot}`,
    summary: `Lab upload: ${slot}${prev ? " (replaced)" : ""}`,
    // the laboratory's file name would say which lab the code is (N4)
    before: prev ? { size: prev.size, mime: prev.mime, at: prev.uploadedAt } : null,
    after: { size: upload.size, mime: upload.mime, at: upload.uploadedAt },
  });
  // Tell the owner the file came back, by code. Which notice depends on the slot,
  // so a new slot has to say what it means here rather than defaulting to silence.
  if (slot === "protocol") await notifyReceiptConfirmed(schemeId, scheme!.number, code);
  else await notifyResultsReturned(schemeId, scheme!.number, code);
  revalidatePath("/lab", "page");
  if (back !== "/lab") revalidatePath(back); // a literal path: no type (Next 16)
  revalidatePath(`/schemes/${schemeId}`, "layout");
  redirect(back);
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

// Owner invites a lab to the portal from the participants page. The form shows the
// invitation's exact text and carries its key (part 1.8): «Изпрати» sends that text
// or nothing. Fails soft (logs) so the page still returns.
export async function inviteLabAction(formData: FormData) {
  const labId = String(formData.get("labId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");
  const r = await inviteLabByIdAction(labId, String(formData.get("textKey") ?? ""));
  if (r.error) console.warn("[invite] not sent:", r.error);
  if (returnTo) redirect(safeNext(returnTo, "/users"));
}

// ── PTS's people and the laboratory accounts («Потребители») ─────────────────────
// PTS's people are the head's (requirePeopleManager, 2.2); the laboratory accounts
// are whoever works with them by the role model (labs.manage, 2.4). Founders
// (OWNER_EMAILS) are configuration and are NOT stored here, so there is never a
// duplicate or over-ridable record for them.

// Send a Supabase Auth invite (set-password e-mail) so a person can sign in. Needs
// Supabase email/SMTP configured to deliver; fails soft so the row/account is still
// created. redirectPath = where the invite link lands (owner /login or /lab/login).
// A LABORATORY's invitation (part 1.8) goes only through the portal's own mailer —
// the exact text the manager saw, stored with its approval before it is sent.
// Supabase's own invitation (the fallback) is for PTS's team only: its words are
// in the dashboard, not here, so the portal could not show or record them.
async function sendAuthInvite(email: string, lab?: { labId: string; approval: Approval }): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Supabase is not configured." };
  if (isSharedMailbox(email)) return { ok: false, error: SHARED_MAILBOX_REFUSAL }; // never a login (Реш. 139)
  // Supabase sends this e-mail itself — in the test environment only to @ptsbg.eu (1.2)
  if (!mailAllowedHere(email)) return { ok: false, error: "Test environment: only @ptsbg.eu addresses are invited." };
  try {
    const h = await headers();
    // one fixed address per environment for the links (NEXT_PUBLIC_SITE_URL)
    const origin = siteOrigin(h.get("host") ?? "", h.get("x-forwarded-proto") ?? "https");
    // Part 1.5: with the portal's own mailer the invitation goes out through it (so
    // the send control of 1.8 will apply), carrying a link to /auth/confirm that sets
    // the session and leads to «set a password». Without one, Supabase sends its own
    // invitation — its e-mail template must point at the same /auth/confirm link.
    // not a laboratory's invitation → never to a laboratory's address (part 1.8):
    // that one goes only with its text shown and its approval on record
    if (!lab) {
      try {
        if (await labEmailInUse(email)) return { ok: false, error: "This address belongs to a laboratory — invite it from its row." };
      } catch {
        return { ok: false, error: "Could not check this address. Nothing was sent — try again in a moment." };
      }
    }
    if (lab && !(isMailConfigured() && origin)) {
      return { ok: false, error: "Поканите към лаборатории тръгват само през пощата на портала (1.7) — тя още не е настроена. · Laboratory invitations go only through the portal's own mail, which is not set up yet." };
    }
    if (isMailConfigured() && origin) {
      const { data, error } = await db.auth.admin.generateLink({ type: "invite", email });
      if (error) throw error;
      const link = inviteLink(origin, data.properties.hashed_token);
      const subject = testSubject(INVITE_SUBJECT), text = inviteText(link);
      const sent = lab
        // the record keeps the words, not the live sign-in link
        ? await sendToLab({ class: "provider", kind: "invite", labId: lab.labId, to: email, subject, body: text, secrets: [link] }, lab.approval)
        : await sendEmail({ to: email, subject, text });
      if (!sent.ok) return { ok: false, userId: data.user?.id, error: `The invitation could not be e-mailed: ${sent.error}` };
      return { ok: true, userId: data.user?.id };
    }
    const { data, error } = await db.auth.admin.inviteUserByEmail(email, origin ? { redirectTo: `${origin}${INVITE_RETURN}` } : undefined);
    if (error) throw error;
    return { ok: true, userId: data?.user?.id };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Invite failed." };
  }
}

// The invitation's words live in lib/fixed-texts.ts (part 1.8), for PTS to approve.

export async function addStaffAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager(); // the head of the PT provider (2.2, Реш. 141)
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const role = String(formData.get("role") ?? "staff") as StaffRole;
  if (!email || !email.includes("@")) return { error: "A valid e-mail is required." };
  if (!STAFF_ROLES.includes(role)) return { error: "Invalid role." };
  if (isSharedMailbox(email)) return { error: SHARED_MAILBOX_REFUSAL };
  if (isOwnerEmail(email)) return { error: "This e-mail is already a founder (manager)." };
  // a laboratory's address would turn that laboratory's login into a team login — a
  // participant's user's too (4.3 review)
  try {
    if (await labEmailInUse(email)) return { error: "This e-mail belongs to a laboratory account, so it cannot be a team member." };
    if (await participantLogin(email)) return { error: "This e-mail is a participant's user's login, so it cannot be a team member." };
  } catch {
    return { error: "Could not check whether this e-mail is already in use. Nothing was changed — try again in a moment." };
  }
  const existing = await getStaffByEmail(email);
  if (existing) return { error: "This user already exists." };
  try {
    await addStaff({ email, name, role });
  } catch {
    return { error: NOT_SAVED };
  }
  // Auto-send a sign-in invite (best-effort). The row is created either way; the
  // manager can re-send from the row's Invite button if email isn't set up.
  const inv = await sendAuthInvite(email);
  await logActivity("staff.added", { summary: `Staff ${email} added as ${role}${inv.ok ? " + invited" : ""}` });
  // who may do what is a setting of the system: in the change register too (rule 7)
  await recordSettingChange({ title: `Потребители: ${email} добавен като ${role}`, what: `A team member added with the role «${role}».`, validation: "Entered by the head of the PT provider on «Потребители» (Реш. 141); the role's rights are the portal's own.", ref: `staff:${email}`, by: (await getRoleContext()).email ?? "build" });
  if (!inv.ok) console.warn("[invite-staff] not sent:", inv.error);
  revalidatePath("/users");
  return { ok: true };
}

/** Is this address a participant's user's login (4.3) — by the address and by its
 *  mailbox? Throws when it cannot say. */
async function participantLogin(email: string): Promise<boolean> {
  const actor = (await getRoleContext()).email ?? "build";
  return (await userEmailTaken(actor, email)) || (await userEmailTaken(actor, mailboxKey(email)));
}

// Re-send a sign-in invite to a staff/auditor (the row's Invite button).
export async function inviteStaffAction(email: string): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager(); // the head of the PT provider (2.2, Реш. 141)
  const e = (typeof email === "string" ? email : "").trim().toLowerCase();
  if (!e || !e.includes("@")) return { error: "Missing e-mail." };
  // a server action takes any string: only an existing team member is invited here
  if (!(await getStaffByEmail(e))) return { error: "Not a team member — add the person first." };
  const inv = await sendAuthInvite(e);
  if (!inv.ok) return { error: inv.error };
  await logActivity("staff.invited", { summary: `Sign-in invite sent to ${e}` });
  return { ok: true };
}

// Create a laboratory account directly (manager onboarding) + send its portal
// invite. Avoids needing the public Apply→approve flow just to get a login.
export async function addLabAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireCapAnywhere("labs.manage"); // the role model (2.4)
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim().slice(0, 160);
  if (!email || !email.includes("@")) return { error: "A valid e-mail is required." };
  if (isSharedMailbox(email)) return { error: SHARED_MAILBOX_REFUSAL };
  // a founder's or team member's address is never a laboratory (as on approval, N3)
  try {
    if (isOwnerEmail(email) || (await staffEmailInUse(email))) return { error: "This e-mail belongs to a PTS team member, so it cannot become a laboratory account." };
    // a participant's user of the legal entities (4.3) has its own login (4.3 review)
    if (await participantLogin(email)) return { error: "This e-mail is a participant's user's login (Организации), so it cannot become a laboratory account." };
  } catch {
    return { error: "Could not check whether this e-mail is already in use. Nothing was changed — try again in a moment." };
  }
  const existing = await getLabByEmail(email);
  const lab = existing ?? (await addLab({ email, name }));
  // no invitation here (part 1.8): it goes from the row's «Покани», after the
  // manager has seen its exact text
  await logActivity("lab.added", { targetCode: lab.id, summary: "Laboratory account created" });
  await settingChanged(`Лабораторен акаунт ${lab.id} създаден`, "A laboratory account created (by a manager).", `lab:${lab.id}`);
  revalidatePath("/users");
  return { ok: true };
}

// Re-send the portal invite to an existing lab (the row's Invite button).
export async function inviteLabByIdAction(labId: string, textKey: string): Promise<{ ok?: boolean; error?: string }> {
  await requireCapAnywhere("labs.manage"); // the role model (2.4)
  // the text the manager saw, or nothing (part 1.8, Реш. 138)
  const shown = invitePreview();
  if (typeof textKey !== "string" || textKey !== shown.key) return { error: "Текстът на поканата е променен — отворете я отново. · The invitation's text has changed — open it again." };
  const lab = typeof labId === "string" ? await getLab(labId) : null;
  if (!lab) return { error: "Laboratory not found." };
  const by = (await getRoleContext()).email ?? "build";
  const inv = await sendAuthInvite(lab.email, { labId: lab.id, approval: { by, ref: `invite:${shown.key}` } });
  if (inv.userId) await updateLab(lab.id, { authUserId: inv.userId }); // even if its e-mail failed
  if (!inv.ok) return { error: inv.error };
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
    // Validate ALL files up front (outside the upload try/catch, so these redirects
    // aren't swallowed by it): declared type ∈ allow-list, size cap, and the REAL
    // bytes match the declared type (not just the client-reported MIME). Read each
    // file's bytes once here and reuse them for the upload.
    const prepared: { file: File; bytes: Uint8Array }[] = [];
    for (const f of files) {
      if (!DOC_EXT[f.type]) redirect("/register?e=filetype");
      if (f.size > 5_000_000) redirect("/register?e=filesize");
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!magicMatches(bytes, f.type)) redirect("/register?e=filetype");
      prepared.push({ file: f, bytes });
    }
    const db = getDb();
    if (db && prepared.length) {
      try {
        await ensureLabDocsBucket(db);
        const folder = randomUUID();
        for (const { file: f, bytes } of prepared) {
          const path = `${folder}/${randomUUID()}.${DOC_EXT[f.type]}`;
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
  await requireCapAnywhere("labs.manage"); // the role model (2.4)
  const id = String(formData.get("id") ?? "");
  const app = await getLabApplication(id);
  if (!app || app.status !== "pending") return { error: "Application not found or already handled." };
  const db = getDb();
  if (!db) return { error: "Approving needs Supabase configured." };

  // Finding N3 (part 0.5): approving must never take over an existing account. It
  // used to reuse a lab account matched by the typed e-mail and, when that e-mail
  // already had a login, reset its password and show the new one to the manager.
  // Now the request is refused when the e-mail belongs to a PTS team member or a
  // founder (a login minted for it would sign in as INTERNAL — resolveLoginRole
  // checks those first), to an existing laboratory account, or to an existing login.
  // Every check fails CLOSED: a database error refuses, it never waves through.
  try {
    if (isSharedMailbox(app.email)) return { error: SHARED_MAILBOX_REFUSAL };
    if (isOwnerEmail(app.email) || (await staffEmailInUse(app.email))) {
      return { error: "This e-mail belongs to a PTS team member, so it cannot become a laboratory account. Reject the request." };
    }
    if (await labEmailInUse(app.email)) {
      return { error: "A laboratory account with this e-mail already exists, so this request is not approved — approving would hand that account over. Reject the request; the laboratory signs in with its existing account." };
    }
    if (await participantLogin(app.email)) {
      return { error: "This e-mail is a participant's user's login (Организации), so this request is not approved. Reject the request." };
    }
  } catch (e) {
    console.warn("[lab-approve] account check failed:", (e as Error)?.message ?? e);
    return { error: "Could not check whether this e-mail is already in use. Nothing was changed — try again in a moment." };
  }

  // 1) mint the Supabase login with a ONE-TIME temp password (email_confirm so they
  //    can sign in at once). The lab should change it after first sign-in. Done
  //    first, so a refused e-mail leaves no half-made lab account behind.
  const tempPassword = randomBytes(12).toString("base64url");
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: app.email, password: tempPassword, email_confirm: true,
    // changed before anything else at the first sign-in (part 1.5) — in app_metadata,
    // which only the server's key can write, so the holder cannot clear it
    app_metadata: { must_change_password: true },
  });
  const authUserId = created?.user?.id;
  if (createErr || !authUserId) {
    const exists = createErr?.code === "email_exists" || /already|registered|exists/i.test(createErr?.message ?? "");
    if (!exists) console.warn("[lab-approve] createUser failed:", createErr?.message ?? "no user returned");
    return {
      error: exists
        ? "This e-mail already has a login, so this request is not approved — approving would take that login over. Reject the request, or ask PTS's software administrator to look at the existing login."
        : `Could not create the login (${createErr?.message ?? "no user returned"}). Nothing was changed — try again in a moment.`,
    };
  }

  // 2) the permanent lab account, active and bound to that new login. If it cannot
  //    be written, the login just created is withdrawn, so no login exists without
  //    its account and the request stays pending.
  let lab: Awaited<ReturnType<typeof addLabOrThrow>>;
  try {
    lab = await addLabOrThrow({
      email: app.email, name: app.orgName, contactPerson: app.contactPerson, phone: app.phone,
      registeredAddress: app.address, eik: app.eik, vat: app.vat, accreditationCert: app.accreditationNo,
      authUserId,
    });
  } catch (e) {
    console.warn("[lab-approve] lab account insert failed:", (e as Error)?.message ?? e);
    await db.auth.admin.deleteUser(authUserId).catch(() => {});
    return { error: "Could not create the laboratory account, so the new login was withdrawn. Nothing was approved — try again in a moment." };
  }

  const me = (await getRoleContext()).email ?? "manager";
  await setLabApplicationReview(id, { status: "approved", reviewedBy: me });
  await logActivity("lab_application.approved", { targetCode: lab.id, summary: "Lab account application approved" });
  await settingChanged(`Лабораторен акаунт ${lab.id} одобрен`, "A laboratory account request approved.", `lab:${lab.id}`);
  // NOTE: no revalidatePath here on purpose — the one-time temp password is returned
  // to the manager's screen and must stay visible until they navigate away. The row
  // is already marked approved in the DB, so it won't reappear after a manual reload.
  return { ok: true, email: app.email, tempPassword };
}

export async function rejectLabApplicationAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireCapAnywhere("labs.manage"); // the role model (2.4)
  const id = String(formData.get("id") ?? "");
  // the reason is kept with it six years (4.7, Zadanie §10) — required
  const reason = readRejectReason(formData.get("reason"));
  if (!reason) return { error: `Напишете причината (поне ${REJECT_REASON_MIN} знака) — пази се с отказа 6 години. · Write the reason (${REJECT_REASON_MIN} characters at least) — it is kept with the rejection for 6 years.` };
  const app = await getLabApplication(id);
  if (!app || app.status !== "pending") return { error: "Application not found or already handled." };
  const me = (await getRoleContext()).email ?? "manager";
  await setLabApplicationReview(id, { status: "rejected", rejectReason: reason, reviewedBy: me });
  await logActivity("lab_application.rejected", { targetCode: id, summary: "Lab account application rejected" });
  revalidatePath("/users");
  return { ok: true };
}

// Reset someone's two-factor sign-in (part 1.6, Реш. 95): a lost or replaced phone
// must not lock a person out — and only the head of the PT provider may do it,
// against a journal entry (by account id, never the address). The person enrols a
// new authenticator at the next sign-in (team) or may (laboratory). Supabase also
// ends every session of theirs when a verified authenticator is deleted, so a
// stolen phone's session does not live on. A founder row is addressed by e-mail —
// it is configuration (OWNER_EMAILS), not a row.
export async function resetTwoFactorAction(kind: "staff" | "lab" | "founder", id: string): Promise<{ ok?: boolean; error?: string; removed?: number }> {
  await requireCap("twofa.reset"); // the role model (2.4)
  const ctx = await getRoleContext();
  if (!(await isEffectiveHead(ctx.email))) return { error: "Само ръководителят на РТ провайдъра нулира двуфакторния вход (Реш. 95). · Only the head of the PT provider resets two-factor sign-in." };
  // a server action's arguments come from the browser
  if ((kind !== "staff" && kind !== "lab" && kind !== "founder") || typeof id !== "string" || !id || id.length > 254) return { error: "Not found." };
  const db = getDb();
  if (!db) return { error: "Supabase is not configured." };
  const person = kind === "founder"
    ? (isOwnerEmail(id) ? { email: id.trim().toLowerCase() } : null)
    : kind === "staff" ? await getStaff(id) : await getLab(id);
  if (!person || isSharedMailbox(person.email)) return { error: "Not found." };
  // the login: a laboratory keeps its id; otherwise found by address — and never,
  // through a laboratory row, the login of a founder or a team member
  let userId = kind === "lab" ? (person as { authUserId?: string }).authUserId : undefined;
  if (!userId && kind === "lab") {
    try {
      if (isOwnerEmail(person.email) || (await staffEmailInUse(person.email))) return { error: "This laboratory's address belongs to a PTS team member — reset it on that person's row." };
    } catch {
      return { error: "Could not check this address. Nothing was changed — try again in a moment." };
    }
  }
  if (!userId) {
    const want = person.email.toLowerCase();
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return { error: error.message };
      userId = data.users.find((u) => (u.email ?? "").toLowerCase() === want)?.id;
      if (data.users.length < 200) break;
    }
  }
  if (!userId) return { error: "This person has no sign-in yet — nothing to reset." };
  const { data: factors, error: le } = await db.auth.admin.mfa.listFactors({ userId });
  if (le) return { error: le.message };
  const all = factors?.factors ?? [];
  let removed = 0;
  for (const f of all) {
    const { error } = await db.auth.admin.mfa.deleteFactor({ userId, id: f.id });
    if (!error) removed++;
  }
  // journalled by account id, never the address; a founder by its login's id
  const who = `${kind} ${kind === "founder" ? userId : id}`;
  if (removed < all.length) {
    await logActivity("auth.2fa_reset", { subject: `${kind}:${kind === "founder" ? userId : id}`, after: { removed, of: all.length }, summary: `Two-factor sign-in reset for ${who} FAILED IN PART: ${removed} of ${all.length} authenticator(s) removed, by the head of the PT provider` });
    revalidatePath("/users");
    return { error: `Only ${removed} of ${all.length} authenticator(s) could be removed — the old one may still work. Try again. · Премахнати са ${removed} от ${all.length}; опитайте отново.` };
  }
  await logActivity("auth.2fa_reset", { subject: `${kind}:${kind === "founder" ? userId : id}`, after: { removed, of: all.length }, summary: `Two-factor sign-in reset for ${who} (${removed} authenticator(s) removed) by the head of the PT provider` });
  await settingChanged(`Двуфакторен вход нулиран: ${who}`, `${removed} authenticator(s) removed by the head of the PT provider (Реш. 95).`, `2fa:${who}`);
  revalidatePath("/users");
  return { ok: true, removed };
}

// «Пробно писмо» on the system check (part 1.7): does the portal's mail arrive, from
// the right sender, signed by ptsbg.eu? Only ever to the signed-in person's OWN
// address — never to a participant — and journalled without the address.
const TEST_MAIL_SUBJECT = "Пробно писмо от портала на PTS Bulgaria · Test e-mail from the PTS Bulgaria portal";
const TEST_MAIL_TEXT = [
  "Това е пробно писмо от портала, поискано от «Проверка на системата».",
  "Ако е във «Входящи» (не в нежелана поща) и подателят е адрес на ptsbg.eu, пощата на портала работи.",
  "В Gmail: «Покажи оригинала» → DKIM трябва да е «PASS» с домейн ptsbg.eu.",
  "",
  "This is a test e-mail from the portal, asked for on «System check».",
  "If it is in the inbox (not in spam) and the sender is a ptsbg.eu address, the portal's mail works.",
  "In Gmail: «Show original» → DKIM should be «PASS» with the domain ptsbg.eu.",
].join("\n");

export async function sendTestMailAction(): Promise<{ ok?: boolean; error?: "no-login" | "not-configured" | "failed"; detail?: string }> {
  await requireCap("system.technical"); // the role model (2.4)
  const ctx = await getRoleContext();
  if (!ctx.authEnabled || !ctx.email) return { error: "no-login" };
  if (!isMailConfigured()) return { error: "not-configured" };
  const r = await sendEmail({ to: ctx.email, subject: testSubject(TEST_MAIL_SUBJECT), text: TEST_MAIL_TEXT });
  if (!r.ok) {
    await logActivity("mail.test", { summary: "Test e-mail to the signed-in manager FAILED" });
    return { error: "failed", detail: r.error.slice(0, 200) };
  }
  await logActivity("mail.test", { summary: "Test e-mail sent to the signed-in manager's own address" });
  return { ok: true };
}

// Nobody changes their own role or access (part 2.2): a head who is not a manager
// would otherwise make themselves one, and with it see laboratory names (D5).
const SELF_REFUSAL = "Собствената си роля и достъп не променяте — прави го друг ръководител. · You do not change your own role or access.";
const NOT_SAVED = "Не е записано — опитайте пак. · Not saved — try again.";
const NOT_A_MEMBER = "Няма такъв служител. · Not a team member.";

// What a person holds, ended and cleared on record — when they are deactivated, or
// become the auditor (read-only, outside the role model: no role, 2.4). Returns an
// error to show, or null once everything is cleared.
async function clearRolesOf(before: { id: string; email: string; permanentRole?: "quality" | "software_admin" | null }, by: string, why: "deactivation" | "auditor"): Promise<{ error: string } | null> {
  const [en, bg] = why === "deactivation" ? ["deactivation", "деактивиране"] : ["becoming the auditor", "преминаване към одитор"];
  const validation = `${why === "deactivation" ? "Deactivation" : "A change to the auditor role"} by the head of the PT provider on «Потребители» (Реш. 141).`;
  let ended;
  try {
    ended = await endAllRolesOf(before.email, by);
  } catch {
    return { error: NOT_SAVED };
  }
  for (const r of ended) await logActivity("scheme_role.ended", { schemeId: r.schemeId, subject: `scheme_role:${r.id}`, before: { person: r.personEmail, role: r.role }, summary: `${r.personEmail}: ${ROLE_LABEL[r.role].en} in ${r.schemeId} ended on ${en}` });
  if (ended.length) await recordSettingChange({ title: `Роли в схеми на ${before.email}: прекратени при ${bg} (${ended.length})`, what: `Ended on ${en}: ${ended.map((r) => `${r.schemeId} — ${ROLE_LABEL[r.role].en}`).join("; ")}.`, validation, ref: `staff:${before.id}`, by });
  if (before.permanentRole) {
    try {
      await updateStaff(before.id, { permanentRole: null });
    } catch {
      return { error: NOT_SAVED };
    }
    await logActivity("role.permanent", { subject: `staff:${before.id}`, before: { permanentRole: before.permanentRole }, after: { permanentRole: null }, summary: `Permanent role of ${before.email}: ${before.permanentRole} → none (${en})` });
    await recordSettingChange({ title: `Потребители: постоянна роля на ${before.email}: ${PERMANENT_LABEL(before.permanentRole)} → — (${bg})`, what: `The permanent role «${before.permanentRole}» cleared on ${en}.`, validation, ref: `staff:${before.id}`, by });
  }
  return null;
}

export async function setStaffRoleAction(id: string, role: StaffRole): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager(); // the head of the PT provider (2.2, Реш. 141)
  if (!id) return { error: "Missing id." };
  if (!STAFF_ROLES.includes(role)) return { error: "Invalid role." };
  const before = typeof id === "string" ? await getStaff(id) : undefined;
  if (!before) return { error: NOT_A_MEMBER };
  const me = (await getRoleContext()).email;
  if (me && before.email === me) return { error: SELF_REFUSAL };
  if (before.role === role) return { ok: true };
  // the auditor takes no role (2.4): what the person holds is ended first, on record
  if (role === "auditor") {
    const cleared = await clearRolesOf(before, me ?? "build", "auditor");
    if (cleared) return cleared;
  }
  try {
    await updateStaff(id, { role });
  } catch {
    return { error: NOT_SAVED };
  }
  await logActivity("role.changed", { subject: `staff:${id}`, before: { role: before.role }, after: { role }, summary: `Role of ${before.email}: ${before.role} → ${role}` });
  await recordSettingChange({ title: `Потребители: роля на ${before.email}: ${before.role} → ${role}`, what: `The role of a team member changed from «${before.role}» to «${role}».`, validation: "Chosen by the head of the PT provider on «Потребители» (Реш. 141).", ref: `staff:${id}`, by: me ?? "build" });
  revalidatePath("/users");
  return { ok: true };
}

export async function setStaffStatusAction(id: string, status: StaffStatus): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager(); // the head of the PT provider (2.2, Реш. 141)
  if (!id || (status !== "active" && status !== "inactive")) return { error: "Bad request." };
  const before = typeof id === "string" ? await getStaff(id) : undefined;
  if (!before) return { error: NOT_A_MEMBER };
  const me = (await getRoleContext()).email;
  if (me && before.email === me) return { error: SELF_REFUSAL };
  const by = me ?? "build";
  if (status === "inactive") {
    // first what the person holds (2.1): every scheme role ended and the permanent role
    // cleared, each on record — so a failure here leaves them active, to try again, and
    // a reactivation brings nothing back by itself. Repeated, it ends what is left.
    const cleared = await clearRolesOf(before, by, "deactivation");
    if (cleared) return cleared;
  }
  if (before.status === status) { revalidatePath("/users"); return { ok: true }; }
  try {
    await updateStaff(id, { status });
  } catch {
    return { error: NOT_SAVED };
  }
  await logActivity("staff.status", { subject: `staff:${id}`, before: { status: before.status }, after: { status }, summary: `Staff ${before.email} set ${status}` });
  await recordSettingChange({ title: `Потребители: ${before.email} — ${status === "active" ? "активиран" : "деактивиран"}`, what: `A team member's account set ${status}.`, validation: "Done by the head of the PT provider on «Потребители» (Реш. 141).", ref: `staff:${id}`, by });
  revalidatePath("/users");
  return { ok: true };
}

// ── PTS's own people (part 2.2, Реш. 141): the head of the PT provider sets each
// person's permanent role and, from the Order, their roles in each scheme. Every
// change is journalled with before/after and is in the change register (rule 7).
// The role model and its refusals are lib/role-model.ts + lib/scheme-roles.ts (2.1).

const PERMANENT_LABEL = (r: string | null | undefined) =>
  r === "quality" || r === "software_admin" ? ROLE_LABEL[r].bg : "—";

const PERMANENT_REFUSAL: Record<"role" | "holds-scheme-roles" | "head", string> = {
  role: "Няма такава постоянна роля. · No such permanent role.",
  "holds-scheme-roles": "Първо прекратете ролите на човека в схемите — администраторът на софтуера няма роля в схема (П 7.4.1 т. 3). · End this person's scheme roles first — the software administrator holds none.",
  head: "Ръководителят на РТ провайдъра не може да е и администратор на софтуера: единият предлага промяна, другият я разрешава. · The head cannot also be the software administrator: one proposes a change, the other authorises it.",
};

export async function setPermanentRoleAction(id: string, role: string): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager();
  const before = typeof id === "string" && id ? await getStaff(id) : undefined;
  if (!before) return { error: NOT_A_MEMBER };
  const me = (await getRoleContext()).email;
  if (me && before.email === me) return { error: SELF_REFUSAL };
  const next = role === "" ? null : role;
  const problem = await permanentRoleProblem(before.email, next);
  if (problem) return { error: PERMANENT_REFUSAL[problem] };
  if ((before.permanentRole ?? null) === next) return { ok: true };
  if (next && before.status !== "active") return { error: "Първо активирайте човека. · Activate the person first." };
  if (next && before.role === "auditor") return { error: "Одиторът остава само за четене — без роля. · The auditor stays read-only, with no role." };
  try {
    await updateStaff(id, { permanentRole: next as "quality" | "software_admin" | null });
  } catch {
    return { error: NOT_SAVED };
  }
  const by = me ?? "build";
  await logActivity("role.permanent", { subject: `staff:${id}`, before: { permanentRole: before.permanentRole ?? null }, after: { permanentRole: next }, summary: `Permanent role of ${before.email}: ${before.permanentRole ?? "none"} → ${next ?? "none"}` });
  await recordSettingChange({ title: `Потребители: постоянна роля на ${before.email}: ${PERMANENT_LABEL(before.permanentRole)} → ${PERMANENT_LABEL(next)}`, what: `The permanent role of a team member changed from «${before.permanentRole ?? "none"}» to «${next ?? "none"}».`, validation: "Set by the head of the PT provider on «Потребители» (Реш. 141); the role's rights are the portal's own (2.1).", ref: `staff:${id}`, by });
  revalidatePath("/users");
  return { ok: true };
}

const ASSIGN_REFUSAL: Record<AssignProblem, string> = {
  role: "Няма такава роля в схема. · No such scheme role.",
  scheme: "Няма такава схема. · No such scheme.",
  order: "Посочете Заповедта — номер и дата. · Name the Order — its number and date.",
  person: "Само активен човек на PTS получава роля в схема. · Only an active member of PTS's team takes a scheme role.",
  "software-admin": "Администраторът на софтуера няма роля в схема (П 7.4.1 т. 3). · The software administrator holds no scheme role.",
  already: "Човекът вече има тази роля в схемата. · This person already holds this role in the scheme.",
  failed: NOT_SAVED,
};

export async function assignSchemeRoleAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager();
  const by = (await getRoleContext()).email ?? "build";
  const r = await assignSchemeRole({
    schemeId: String(formData.get("schemeId") ?? ""), personEmail: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""), orderRef: String(formData.get("orderRef") ?? ""), by,
  });
  if (!r.ok) return { error: ASSIGN_REFUSAL[r.error] };
  const e = r.entry;
  // the head may give himself a role — he issues the Order (D5) — but it says so,
  // in the journal and in the register (2.4)
  const self = e.personEmail === by.toLowerCase();
  await logActivity("scheme_role.assigned", { schemeId: e.schemeId, subject: `scheme_role:${e.id}`, after: { person: e.personEmail, role: e.role, order: e.orderRef ?? null, self }, summary: `${e.personEmail}: ${ROLE_LABEL[e.role].en} in ${e.schemeId}, from ${e.orderRef}${self ? " — given to themselves" : ""}` });
  await recordSettingChange({ title: `Роля в схема ${e.schemeId}: ${e.personEmail} — ${ROLE_LABEL[e.role].bg}${self ? " (възложена на себе си)" : ""}`, what: `A scheme role given from the Order «${e.orderRef}».`, validation: "Entered by the head of the PT provider on «Потребители» from the Order (Реш. 141).", ref: `scheme_role:${e.id}`, by });
  revalidatePath("/users");
  return { ok: true };
}

export async function endSchemeRoleAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager();
  const by = (await getRoleContext()).email ?? "build";
  let ended;
  try {
    ended = typeof id === "string" && id ? await endSchemeRole(id, by) : null;
  } catch {
    return { error: NOT_SAVED };
  }
  if (!ended) return { error: "Тази роля вече не е активна. · This role is no longer held." };
  await logActivity("scheme_role.ended", { schemeId: ended.schemeId, subject: `scheme_role:${ended.id}`, before: { person: ended.personEmail, role: ended.role }, summary: `${ended.personEmail}: ${ROLE_LABEL[ended.role].en} in ${ended.schemeId} ended` });
  await recordSettingChange({ title: `Роля в схема ${ended.schemeId}: ${ended.personEmail} — ${ROLE_LABEL[ended.role].bg} прекратена`, what: `A scheme role ended (it stays on record, from the Order «${ended.orderRef ?? "—"}»).`, validation: "Ended by the head of the PT provider on «Потребители» (Реш. 141).", ref: `scheme_role:${ended.id}`, by });
  revalidatePath("/users");
  return { ok: true };
}

// Who processes, reviews and approves a scheme (part 2.5, Реш. 140): designated by
// the head of the PT provider from the Order, as the scheme roles are (2.2). Two acts
// on one person need a written justification; the record keeps every designation.
const PROCESSING_REFUSAL: Record<ProcessingProblem, string> = {
  "processor-role": "Обработката е на експерта по статистика или на технически експерт на схемата. · The processing is the statistics expert's or a technical expert's of this scheme.",
  "reviewer-role": "Прегледът е на отговорника по качеството или на упълномощено лице от Заповедта. · The review is the quality manager's or an authorised person's from the Order.",
  "approver-role": "Одобряването е на ръководителя на схемата. · The approval is the scheme manager's.",
  "quality-processes": "Отговорникът по качеството обработва — прегледът е на друго упълномощено лице от Заповедта (Реш. 140). · The quality manager processes — the review is another authorised person's, from the Order.",
  justification: "Две от трите действия са на един човек — напишете обосновка (поне 10 знака). · Two of the three acts are one person — write a justification (at least 10 characters).",
};
const COINCIDE_LABEL: Record<Coincidence, string> = {
  "process-review": "обработка и преглед", "process-approve": "обработка и одобряване", "review-approve": "преглед и одобряване",
};

export async function designateProcessingAction(formData: FormData): Promise<{ ok?: boolean; error?: string; coincide?: Coincidence[] }> {
  await requirePeopleManager(); // the head of the PT provider — he issues the Order (2.2, Реш. 141)
  const by = (await getRoleContext()).email ?? "build";
  const schemeId = String(formData.get("schemeId") ?? "");
  const r = await designateProcessing({
    schemeId, processor: String(formData.get("processor") ?? ""), reviewer: String(formData.get("reviewer") ?? ""),
    approver: String(formData.get("approver") ?? ""), justification: String(formData.get("justification") ?? ""), by,
  });
  if (!r.ok) {
    if (r.error === "scheme") return { error: "Няма такава схема. · No such scheme." };
    if (r.error === "rules") return { error: r.problems.map((p) => PROCESSING_REFUSAL[p]).join(" "), coincide: r.coincide };
    if (r.error === "conflict") return { error: "Някой друг определи току-що — презаредете страницата. · Someone else designated just now — reload the page.", coincide: r.coincide };
    // the database checked the rules again and refused: a role changed in between
    if (r.error === "refused") return { error: `Базата отказа — ролите са се променили междувременно; презаредете. · The database refused: ${r.detail ?? ""}`, coincide: r.coincide };
    return { error: NOT_SAVED, coincide: r.coincide };
  }
  if (r.unchanged) return { ok: true }; // the same three again: nothing to record
  const e = r.entry;
  const three = (d: { processor: string; reviewer: string; approver: string }) => ({ processor: d.processor, reviewer: d.reviewer, approver: d.approver });
  const self = [e.processor, e.reviewer, e.approver].includes(by.toLowerCase());
  const coincide = e.coincide.map((c) => COINCIDE_LABEL[c]).join(", ");
  await logActivity("processing.designated", {
    schemeId, subject: `processing:${e.id}`,
    before: r.previous ? { ...three(r.previous), reviewerBasis: r.previous.reviewerBasis } : undefined,
    after: { ...three(e), reviewerBasis: e.reviewerBasis, coincide: e.coincide, justification: e.justification || null, self },
    summary: `Processing of ${schemeId}: processes ${e.processor}, reviews ${e.reviewer} (${e.reviewerBasis === "order" ? "authorised by the Order" : "quality manager"}), approves ${e.approver}${e.coincide.length ? ` — two acts coincide (${e.coincide.join(", ")}), justified` : ""}`,
  });
  await recordSettingChange({
    title: `Обработка на схема ${schemeId}: обработва ${e.processor}, преглежда ${e.reviewer}, одобрява ${e.approver}${coincide ? ` — съвпадат ${coincide}` : ""}`,
    what: `The three processing acts designated (П 7.4.1 т. 3)${e.coincide.length ? `; two coincide, justified: «${e.justification}»` : ""}.${r.previous ? " The previous designation is ended and stays on record." : ""}`,
    validation: "Designated by the head of the PT provider on the scheme's page from the Order; the portal and the database check who may do each act (Реш. 140).",
    ref: `processing:${e.id}`, by,
  });
  revalidatePath(`/schemes/${schemeId}`);
  return { ok: true };
}

// The staff confidentiality declaration Ф 4.2-1 (part 2.8, E17): recorded per
// person by the head of the PT provider — the date it was signed and the signed scan
// (a real PDF, PNG or JPG by its bytes). Journalled; the scan itself never in the
// journal, only that one was recorded.
const DECLARATION_REFUSAL: Record<DeclarationProblem, string> = {
  person: "Само за човек на PTS — активен член на екипа, ръководителят или основател. · Only for one of PTS's people.",
  date: "Посочете истинската дата на подписване — не по-късна от днес. · Give the real date it was signed — not after today.",
  file: "Приложете сканираната подписана декларация. · Attach the signed scan.",
  type: "Сканираното копие е PDF, JPG или PNG. · The scan is a PDF, JPG or PNG.",
  size: "Файлът е твърде голям (до 15 MB). · The file is too large (up to 15 MB).",
  failed: NOT_SAVED,
};

export async function recordDeclarationAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager(); // the head of the PT provider (2.2, Реш. 141)
  const by = (await getRoleContext()).email ?? "build";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: DECLARATION_REFUSAL.file };
  if (!DECLARATION_EXT[file.type]) return { error: DECLARATION_REFUSAL.type };
  if (file.size > MAX_DECLARATION_BYTES) return { error: DECLARATION_REFUSAL.size };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!magicMatches(bytes, file.type)) return { error: "Това не е истински PDF, JPG или PNG. · That file isn't a real PDF, JPG or PNG." };
  const r = await recordDeclaration({
    personEmail: String(formData.get("email") ?? ""), signedOn: String(formData.get("signedOn") ?? ""),
    file: { bytes, mime: file.type, name: file.name }, by,
  });
  if (!r.ok) return { error: DECLARATION_REFUSAL[r.error] };
  const e = r.entry;
  await logActivity("declaration.recorded", {
    subject: `declaration:${e.id}`, after: { person: e.personEmail, signedOn: e.signedOn, size: e.fileSize, mime: e.fileMime },
    summary: `Ф 4.2-1 of ${e.personEmail}, signed ${e.signedOn}, recorded with its scan`,
  });
  revalidatePath("/users");
  return { ok: true };
}

/** One recorded by mistake — the wrong person, a mistyped date — is voided with the
 *  reason, never deleted; it is then in force for nobody (2.8). */
export async function voidDeclarationAction(id: string, reason: string): Promise<{ ok?: boolean; error?: string }> {
  await requirePeopleManager(); // the head of the PT provider (2.2, Реш. 141)
  const by = (await getRoleContext()).email ?? "build";
  const r = await voidDeclaration({ id: typeof id === "string" ? id : "", reason: typeof reason === "string" ? reason : "", by });
  if (!r.ok) {
    return { error: r.error === "reason" ? "Напишете защо (поне 5 знака). · Say why (at least 5 characters)." : r.error === "already" ? "Вече е анулирана. · Already voided." : r.error === "missing" ? "Няма такава декларация. · No such declaration." : NOT_SAVED };
  }
  await logActivity("declaration.voided", { subject: `declaration:${r.entry.id}`, before: { person: r.entry.personEmail, signedOn: r.entry.signedOn }, after: { voided: true, reason: r.entry.voided?.reason }, summary: `Ф 4.2-1 of ${r.entry.personEmail} (signed ${r.entry.signedOn}) voided: ${r.entry.voided?.reason}` });
  revalidatePath("/users");
  return { ok: true };
}

// Activate / deactivate a laboratory account from the Users & roles screen. The log
// stores the opaque lab id (never the lab name) to stay confidential (§4.2).
export async function setLabStatusAction(id: string, status: LabStatus): Promise<{ ok?: boolean; error?: string }> {
  await requireCapAnywhere("labs.manage"); // the role model (2.4)
  if (!id || (status !== "active" && status !== "inactive")) return { error: "Bad request." };
  const was = (await getLab(id))?.status ?? null;
  await updateLab(id, { status });
  await logActivity("lab.status", { targetCode: id, subject: `lab:${id}`, before: { status: was }, after: { status }, summary: `Laboratory account set ${status}` });
  if (was !== status) await settingChanged(`Лабораторен акаунт ${id} — ${status === "active" ? "активиран" : "деактивиран"}`, `A laboratory account set ${status}.`, `lab:${id}`);
  revalidatePath("/users");
  return { ok: true };
}

export async function rejectApplicationAction(formData: FormData) {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("participants.manage", schemeId); // in THIS scheme, by the role model (2.4)
  const appId = String(formData.get("appId") ?? "");
  // only a pending заявка: an approved one is never turned into a "not accepted" notice
  const pending = (await getScheme(schemeId))?.applications?.find((a) => a.id === appId);
  if (!pending || pending.status !== "pending") redirect(`/schemes/${schemeId}/applications`);
  const rejected = await setApplicationStatus(schemeId, appId, "rejected");
  await logActivity("application.rejected", { schemeId, summary: "Application rejected" });
  // Tell the applicant only if it applied signed in (app.labId). A typed e-mail is
  // not matched to an account (N2): the notice could reach another lab. Otherwise
  // the owner replies directly.
  if (rejected) {
    const scheme = await getScheme(schemeId);
    const labId = rejected.labId;
    if (scheme) await notifyApplicationRejected(labId, schemeId, scheme.number);
  }
  revalidatePath(`/schemes/${schemeId}/applications`, "page");
  redirect(`/schemes/${schemeId}/applications`);
}

// Record a participant's Certificate number + date. The portal no longer makes the
// number up (PTS, 02.11.2026, condition 1 — part 0.15): it comes from the existing
// series and must already be in the register the public lookup reads, or the lookup
// would call a real certificate invalid. So PTS types the number the ptsbg.eu
// register holds (К7: the scheme number, «-», five digits) and ticks that it is in
// the register. The date auto-fills to today (Bulgarian time) but is editable.
// No redirect — revalidate in place so the doc page keeps the selected lab.
export async function issueCertificateAction(
  formData: FormData,
): Promise<{ ok: true; no: string } | { error: CertNumberProblem | "register" | "date" | "no-scheme" | "no-participant" | "not-reached" }> {
  const actor = (await getRoleContext()).email ?? "";
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("approve", schemeId); // in THIS scheme, by the role model (2.4)
  const code = String(formData.get("code") ?? "").trim();
  const dateInput = String(formData.get("date") ?? "").trim().slice(0, 20);
  const typed = String(formData.get("no") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!schemeId || !code) return { error: "no-scheme" };
  // a simulation round's certificate is never entered in the register (Реш. 130, 1.2)
  const simulation = looksLikeSimNumber((await getScheme(schemeId))?.number ?? "");
  if (!simulation && formData.get("inRegister") !== "on") return { error: "register" };
  if (dateInput && !/^\d{2}\.\d{2}\.\d{4}$/.test(dateInput)) return { error: "date" };
  // only one of the scheme's own participants gets a certificate (and no "__proto__")
  // …and only a coded one: an application has no certificate before the coding act (5.3)
  if (isProvisional(code) || !(await listParticipants(schemeId)).some((p) => p.code === code)) return { error: "no-participant" };

  // a first certificate is news for the laboratory: who it is, before it is recorded (2.3)
  const certTell = (await getScheme(schemeId))?.certificates?.[code] ? {} : await labToTell(schemeId, code);
  if (!certTell) return { error: "not-reached" };
  const day = sofiaToday(schemeNowMs(await getScheme(schemeId))); // yyyy-mm-dd, the round's clock (1.3)
  const today = `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
  // decided on the fresh scheme, inside the lock
  const out: { problem?: CertNumberProblem; first?: boolean; changed?: boolean; old?: string; number?: string; no?: string } = {};
  await updateSchemeWith(schemeId, (s) => {
    const certs = { ...(s.certificates ?? {}) };
    const others = Object.entries(certs).filter(([c]) => c !== code).map(([, v]) => v.no);
    // stored as the scheme's own number + the digits, however the prefix was typed
    const r = certNumberFor(typed, s.number, others);
    if ("problem" in r) { out.problem = r.problem; return {}; }
    const existing = Object.prototype.hasOwnProperty.call(certs, code) ? certs[code] : undefined;
    out.first = !existing;
    out.changed = !!existing && existing.no !== r.no;
    out.old = existing?.no;
    out.number = s.number;
    out.no = r.no;
    certs[code] = simulation
      ? { no: r.no, date: dateInput || existing?.date || today, simulation: true }
      : {
          no: r.no,
          date: dateInput || existing?.date || today,
          registeredBy: actor,
          registeredAt: new Date().toISOString(),
        };
    return { certificates: certs };
  });
  if (out.problem) return { error: out.problem };
  if (!out.no) return { error: "no-scheme" };

  if (out.first || out.changed) {
    // never the certificate's NUMBER beside the code — not in the journal, not in the
    // case file: a number and a code together are a register lookup that names the
    // laboratory (Реш. 115), and both are read by staff and auditors, and exported
    // in the coded part (1.10). The number is on the certificate record itself.
    if (out.first) {
      await logActivity("certificate.issued", { schemeId, targetCode: code, summary: simulation ? `Simulation certificate recorded for ${code} (not in the register)` : `Certificate recorded for ${code} (in the ptsbg.eu register)` });
    } else {
      await logActivity("certificate.updated", { schemeId, targetCode: code, summary: `Certificate number for ${code} corrected (in the ptsbg.eu register)` });
    }
    await addCaseEvent({ schemeId, code, kind: "report_issued", at: day, ref: "certificate", source: "auto" });
  } else {
    // the same number again — a date correction: journalled, no new case-file step
    await logActivity("certificate.updated", { schemeId, targetCode: code, summary: `Certificate for ${code}: details updated` });
  }
  // Tell that one laboratory its certificate is out. Only on the FIRST issue —
  // editing the date afterwards is a correction, not news worth another notice.
  // The notice is held until a person releases it (0.8).
  if (out.first) {
    await notifyReportIssued("labId" in certTell ? certTell.labId : await labIdOf(schemeId, code, await actorNow()).catch(() => undefined), schemeId, out.number!, code);
  }
  revalidatePath(`/schemes/${schemeId}/doc/certificate`, "page");
  return { ok: true, no: out.no };
}

export async function addParticipantAction(formData: FormData) {
  // Manager only: the new row's code would stand next to the name just typed (§4.2).
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("participants.manage", schemeId); // in THIS scheme, by the role model (2.4)
  const labName = String(formData.get("labName") ?? "").trim();
  if (!schemeId || !labName) redirect(`/schemes/${schemeId}/participants`);
  const partRaw = parseInt(String(formData.get("participations") ?? "1"), 10);
  // the application from the PDF: its participations per characteristic (5.1) — no
  // approval act follows: entering it makes the laboratory a participant (Реш. 123)
  // (a scheme with no characteristics — a calibration one — has no counts to read)
  const scheme = await getScheme(schemeId);
  // the final list announced (5.2): no new application — a step back undoes the list
  if (scheme && currentFinalList(scheme)) redirect(`/schemes/${schemeId}/participants?err=list-final`);
  const nChar = scheme?.parameters.length ?? 0;
  const sel = nChar ? readSelections(Object.fromEntries(formData.entries()), nChar) : null;
  if (sel && !sel.ok) redirect(`/schemes/${schemeId}/participants?err=${sel.problem === "none" ? "sel-none" : "sel-count"}`);
  // a failed write is shown, never swallowed (N14)
  const p = await addParticipant({
    schemeId,
    labName,
    contact: String(formData.get("contact") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    deliveryAddress: String(formData.get("deliveryAddress") ?? "").trim(),
    // with characteristics, the participations follow from the counts (5.1); else as typed
    participations: sel?.ok ? participationSets(sel.selections) : Number.isFinite(partRaw) && partRaw > 0 ? partRaw : 1,
    courier: String(formData.get("courier") ?? "").trim().slice(0, 60), // free text, as offered (Реш. 128)
    sampleCode: String(formData.get("sampleCode") ?? "").trim().slice(0, 40),
    ...(sel?.ok ? { selections: sel.selections, characteristics: characteristicsOf(sel.selections) } : {}),
  }, await actorNow()).catch((e) => (e instanceof NoLabNumberError ? "full" as const : null));
  if (!p || p === "full") redirect(`/schemes/${schemeId}/participants?err=${p === "full" ? "numbers" : "save"}`);
  await logActivity("participant.added", { schemeId, targetCode: p.code, summary: `${isProvisional(p.code) ? `Application ${p.code} entered (no code until the coding act)` : `Participant ${p.code} added`}${p.drawnFrom ? ` (laboratory number drawn at random from ${p.drawnFrom} free, at admission — D17)` : ""}` });
  // a code assigned now only at admission (D17); else at the coding act (5.3)
  if (!isProvisional(p.code)) {
    await addCaseEvent({ schemeId, code: p.code, kind: "code_assigned", at: await roundDay(schemeId), source: "auto" });
    await advanceStatusForEvent(schemeId, p.code, "code_assigned");
  }
  revalidatePath(`/schemes/${schemeId}/participants`);
  redirect(`/schemes/${schemeId}/participants`);
}

// Edit one participation's registration/logistics fields (new-standard forms
// F 7.2.1-4/-6 need courier, sample code and per-lab characteristics). The code
// itself is immutable. `characteristics` arrives as repeated checkbox values.
export async function updateParticipantAction(formData: FormData) {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("participants.manage", schemeId); // in THIS scheme, by the role model (2.4)
  const id = String(formData.get("id") ?? "");
  const labName = String(formData.get("labName") ?? "").trim();
  const back = `/schemes/${schemeId}/participants`;
  if (!schemeId || !id || !labName) redirect(back);
  const own = (await listParticipants(schemeId)).find((x) => x.id === id);
  if (!own) redirect(back); // the row must belong to THIS scheme
  const partRaw = parseInt(String(formData.get("participations") ?? "1"), 10);
  // its participations per characteristic (5.1) — the characteristics follow from them
  const scheme = await getScheme(schemeId);
  // (a scheme with no characteristics — a calibration one — has no counts to read)
  const nChar = scheme?.parameters.length ?? 0;
  const sel = nChar ? readSelections(Object.fromEntries(formData.entries()), nChar) : null;
  if (sel && !sel.ok) redirect(`${back}?err=${sel.problem === "none" ? "sel-none" : "sel-count"}`);
  // the final list announced (5.2): what was applied for per characteristic stays as it was
  if (sel?.ok && scheme && currentFinalList(scheme)) {
    const cur = (await listParticipants(schemeId)).find((x) => x.id === id);
    if (!cur || !sameSelections(selectionsOf(cur, nChar), sel.selections)) redirect(`${back}?err=list-final`);
  }
  const p = await updateParticipant(id, {
    labName,
    contact: String(formData.get("contact") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    deliveryAddress: String(formData.get("deliveryAddress") ?? "").trim(),
    participations: sel?.ok ? participationSets(sel.selections) : Number.isFinite(partRaw) && partRaw > 0 ? partRaw : 1,
    courier: String(formData.get("courier") ?? "").trim().slice(0, 60), // free text, as offered (Реш. 128)
    sampleCode: String(formData.get("sampleCode") ?? "").trim().slice(0, 40),
    ...(sel?.ok ? { characteristics: characteristicsOf(sel.selections), selections: sel.selections } : {}),
  }, await actorNow()).catch((e) => (/frozen/.test(String((e as Error)?.message ?? "")) ? "frozen" as const : null)); // the identity goes to the identity store, on record (2.3)
  // a participation with a copy: its laboratory name and delivery address are the copy's (4.5)
  if (p === "frozen") redirect(`${back}?err=frozen`);
  if (!p) redirect(`${back}?err=save`); // a failed write is shown, never swallowed (N14)
  await logActivity("participant.updated", { schemeId, targetCode: p.code, summary: `Participant ${p.code} details updated` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  redirect(back);
}

// ── RT3: participant case-file timeline (dated milestones, by code) ─────────────
// Recording is staff work — requireWriter (manager + staff; auditor is read-only).
const CASE_MANUAL_KINDS: CaseEventKind[] = [
  "docs_sent", "items_dispatched", "receipt_confirmed", "results_returned", "scored", "report_issued", "other",
];

// Traceability → status machine (owner decision 2026-07-08): recording a
// milestone advances the participation FORWARD (never backwards), so the lab's
// stepper/timeline always reflects the real timeline staff maintain. Deleting an
// event does not roll the status back — correct that via a newer event if needed.
const KIND_STATUS: Partial<Record<CaseEventKind, ParticipantStatus>> = {
  code_assigned: "approved",
  items_dispatched: "dispatched",
  receipt_confirmed: "received",
  results_returned: "submitted",
  scored: "scored",
};
async function advanceStatusForEvent(schemeId: string, code: string, kind: CaseEventKind): Promise<void> {
  const target = KIND_STATUS[kind];
  if (!target) return; // docs_sent / report_issued / other don't move the status
  const p = (await listParticipants(schemeId)).find((x) => x.code === code);
  if (!p) return;
  if (PSTATUS_ORDER.indexOf(target) > PSTATUS_ORDER.indexOf(p.status)) {
    await updateParticipant(p.id, { status: target });
  }
}

export async function addCaseEventAction(formData: FormData): Promise<void> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("dispatch", schemeId); // in THIS scheme, by the role model (2.4)
  const code = String(formData.get("code") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as CaseEventKind;
  const at = String(formData.get("at") ?? "").trim();
  const ref = String(formData.get("ref") ?? "").trim().slice(0, 120);
  const note = String(formData.get("note") ?? "").trim().slice(0, 400);
  // optional link to the portal document the event refers to — whitelist only
  const docKeyRaw = String(formData.get("docKey") ?? "").trim();
  const docKey = getDoc(docKeyRaw) ? docKeyRaw : "";
  // back only to one of this scheme's own pages — never a URL from the form (5.6)
  const returnTo = String(formData.get("returnTo") ?? "");
  const back = returnTo.startsWith(`/schemes/${schemeId}/`) && !returnTo.includes("//") && !/[\\\s]/.test(returnTo) ? returnTo
    : `/schemes/${schemeId}/participants/${encodeURIComponent(code)}`;
  if (!schemeId || !code || !CASE_MANUAL_KINDS.includes(kind)) redirect(back);
  // a testing scheme's object goes out through «Доставки» (5.6) — the shipment on record,
  // the participation told; a step here alone would leave the two disagreeing (review)
  if (kind === "items_dispatched" && (await getScheme(schemeId))?.type === "T") redirect(`${back}${back.includes("?") ? "&" : "?"}step=dispatch`);
  // the code must belong to this scheme (never trust the URL)
  const exists = (await listParticipants(schemeId)).some((p) => p.code === code);
  if (!exists) redirect(`/schemes/${schemeId}/participants`);

  const actor = (await getRoleContext()).email ?? "";
  await addCaseEvent({ schemeId, code, kind, at, ref, note, docKey, recordedBy: actor, source: "manual" });
  await advanceStatusForEvent(schemeId, code, kind);
  await logActivity("case.updated", { schemeId, targetCode: code, summary: `Timeline: ${kind} for ${code}${ref ? ` (${ref})` : ""}` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  redirect(back);
}

// Remove a mistaken timeline entry. Manager-only; the removal is itself logged, so
// the trail stays honest (§8.4).
// A timeline step recorded by mistake is VOIDED with a reason, never deleted
// (part 0.9, finding N23): it stays in the case file, struck through, and stops
// counting toward the matrix and the lab's timeline. Manager only, as before.
export async function voidCaseEventAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
  const code = String(formData.get("code") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  const back = `/schemes/${schemeId}/participants/${encodeURIComponent(code)}`;
  if (!reason) redirect(`${back}?void=reason`); // a void without a reason is not recorded
  const ev = await getCaseEvent(id);
  // only a manual step of THIS participation in THIS scheme
  if (!ev || ev.schemeId !== schemeId || ev.code !== code || ev.source !== "manual") redirect(back);
  const by = (await getRoleContext()).email ?? "build";
  if (!(await voidCaseEvent(id, by, reason))) redirect(`${back}?void=failed`);
  await logActivity("case.voided", { schemeId, targetCode: ev!.code, summary: `Timeline step “${ev!.kind}” (${ev!.at}) voided` });
  // the step no longer counts — so a status it alone had set comes back down
  await settleStatusAfterVoid(schemeId, code, ev!.kind);
  revalidatePath(back);
  redirect(back);
}

// After a void: if the voided step is what put the participant where it is, the
// status falls back to the furthest one the REMAINING steps support (never below
// "approved" — the code was assigned). A status set by something else is left alone.
async function settleStatusAfterVoid(schemeId: string, code: string, voidedKind: CaseEventKind): Promise<void> {
  const target = KIND_STATUS[voidedKind];
  if (!target) return;
  const p = (await listParticipants(schemeId)).find((x) => x.code === code);
  if (!p || p.status !== target) return;
  let best: ParticipantStatus = "approved";
  for (const e of await listCaseEvents(schemeId, code)) {
    const st = KIND_STATUS[e.kind];
    if (st && PSTATUS_ORDER.indexOf(st) > PSTATUS_ORDER.indexOf(best)) best = st;
  }
  if (best !== p.status) await updateParticipant(p.id, { status: best });
}

// ── RT5: document version history (§8.3) ───────────────────────────────────────
// Approve a revision (manager — controlled-document approval) and restore an older
// revision as the current document (writer — a restore is itself a new save).
export async function approveDocRevisionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
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
  const id = String(formData.get("id") ?? "");
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
  const docKey = String(formData.get("docKey") ?? "");
  await requireDocWriter(docKey, schemeId);
  const back = `/schemes/${schemeId}/build/${encodeURIComponent(docKey)}/history`;
  const rev = await getRevision(id);
  const scheme = await getScheme(schemeId);
  if (!rev || !scheme || rev.schemeId !== schemeId || rev.docKey !== docKey) redirect(back);
  // A coded-list revision saved before the swap is the other list's content: it is
  // not restored at all (no new revision either, so it cannot come back marked).
  if (!usableForDoc(docKey, rev!)) redirect(back);
  const docs = { ...(scheme!.docs ?? {}), [docKey]: { bg: rev!.bg, en: rev!.en } };
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
  await requireCap("scheme.create"); // the role model (2.4)
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
  await requireCap("scheme.create"); // the role model (2.4)
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
  await requireCap("scheme.create"); // the role model (2.4)
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
  await requireCap("scheme.create"); // the role model (2.4)
  const type: "T" | "C" = String(formData.get("type")) === "C" ? "C" : "T";
  // The folder this scheme is placed in (null = directly under the type root).
  const folderId = String(formData.get("folderId") ?? "").trim() || null;
  // year drives only the auto-number (PTS YY/MM-X-N); defaults to the current year.
  // The month is today's, in Bulgaria — N counts within it and the activity (0.14).
  const today = sofiaYearMonth();
  const year = today.year; // with today's month — the form's year could be yesterday's
  const name = String(formData.get("name") ?? "").trim();
  const object = String(formData.get("object") ?? "").trim();
  if (!name) redirect(folderView(type, folderId));

  // What the number is made of (Реш. 102, 3.1): PTS or ILC, the activity — a
  // calibration folder's is C, a testing folder's T or S — and NA.
  const kind: SchemeKind = String(formData.get("kind")) === "ILC" ? "ILC" : "PTS";
  const activity: Activity = type === "C" ? "C" : String(formData.get("activity")) === "S" ? "S" : "T";
  const na = formData.get("na") === "on";
  // archived schemes count too: their numbers are never handed out again (0.9)
  // the test environment numbers its simulation rounds «SIM …» (Реш. 130, 1.2)
  const auto = nextProject(await listSchemeSummaries({ includeArchived: true }), { kind, activity, na, simulation: isTestEnvironment() }, year, today.month);
  // The owner may override the official number in the dialog; it flows into every
  // document (renderers print s.number) and drives the year grouping. Fall back to
  // the auto number if the field was cleared.
  const number = cut60(String(formData.get("number") ?? "").trim() || auto.number);
  // The official number (YY/MM-X-N) is unique system-wide — block a duplicate (only
  // possible when the owner manually edits it to one already in use). Т/T and С/C
  // spell the same number (E4.a).
  if (await schemeNumberExists(number)) {
    redirect(`${folderView(type, folderId)}?dupNumber=${encodeURIComponent(number)}`);
  }
  // a simulation number belongs to the test environment only — never the real series
  if ((readSchemeNumber(number)?.simulation || looksLikeSimNumber(number)) && !isTestEnvironment()) {
    redirect(`${folderView(type, folderId)}?simNumber=${encodeURIComponent(number)}`);
  }
  // The portal reads the number (Реш. 102): today's form, or one of the archive's —
  // nothing else; and a testing scheme's activity is T or S, a calibration one's C.
  const reading = readSchemeNumber(number);
  if (!reading) redirect(`${folderView(type, folderId)}?badNumber=${encodeURIComponent(number)}`);
  // The dialog's choices compose a NEW number; an archive number of an old form is
  // not described by them — what it does not state stays unstated until PTS sets it
  // on the edit page, rather than taking the dialog's defaults as a choice.
  const markers = markersFor(number, type, reading.form === "old" ? {} : { kind, activity, accredited: !na });
  if (!markers.ok) redirect(`${folderView(type, folderId)}?numberActivity=${encodeURIComponent(number)}`);
  // Derive a URL-safe id from the number ("PTS 26/03-T-1" → "26-03-T-1"; a Cyrillic
  // «Т» keeps its letter as T) so the folder URL stays consistent with it; never
  // overwrite an existing scheme (suffix on clash).
  const baseId = schemeIdFromNumber(number) || auto.id;
  let id = baseId, n = 2;
  while (await schemeIdTaken(id)) id = `${baseId}-${n++}`; // archived ids stay taken

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
  // A sample is a ready scheme and starts open: that opening is an act on record like
  // any other (3.2), by the person who created it.
  delete scheme.lifecycle;
  if (scheme.status === "open") {
    const at = new Date().toISOString();
    scheme.lifecycle = { acts: [{ act: "open", from: "draft", to: "open", at, by: await actorNow(), day: sofiaToday(schemeNowMs(scheme)), note: "Създадена от образец — отворена при създаването" }] };
  }
  // the number's markers, kept as fields (Реш. 102) — the sample's own are replaced
  delete scheme.kind; delete scheme.activity; delete scheme.accredited;
  if (markers.kind) scheme.kind = markers.kind;
  if (markers.activity) scheme.activity = markers.activity;
  if (markers.accredited !== undefined) scheme.accredited = markers.accredited;
  // the lists it starts with, STORED — a calibration scheme's Instruction checks, so
  // what its ids mean never lives in the code alone (3.8 review)
  delete scheme.lists;
  const lists0 = startingLists(type);
  if (lists0) scheme.lists = lists0;
  // a calibration scheme's plan, invitation and instruction on M1's structure (3.10).
  // A blank one starts its scheme-specific points EMPTY — marked to fill, with M1's
  // guidance — never with the testing sample's texts it was copied from
  delete scheme.calTemplate;
  if (type === "C") {
    scheme.calTemplate = "m1";
    if (!sample) {
      for (const k of M1_SPECIFIC_CLAUSES) delete scheme.clauses[k];
      // nor the testing sample's assigned value and scores («Алгоритъм A», z) — marked
      // to fill in the plan's point 14 (3.10 review)
      scheme.assignedValueMethodEn = ""; scheme.assignedValueMethodBg = "";
      scheme.scoresEn = ""; scheme.scoresBg = "";
    }
  }
  // a create of the same number that landed first wins; this one is told, not merged
  if (!(await addScheme(scheme))) redirect(`${folderView(type, folderId)}?dupNumber=${encodeURIComponent(number)}`);
  if (scheme.status === "open") {
    await logActivity("scheme.state", { schemeId: id, subject: `scheme:${id}`, before: { status: "draft" }, after: { status: "open" }, summary: `${ACTS.open.en}: Draft → Open (created from a sample)` });
  }
  await logActivity("scheme.created", {
    schemeId: id, after: { number, kind: scheme.kind, activity: scheme.activity, accredited: scheme.accredited },
    summary: `Scheme ${number} created: ${scheme.kind ?? "—"} · ${scheme.activity ?? "—"} · ${scheme.accredited === undefined ? "—" : scheme.accredited ? "in scope" : "NA"}`,
  });

  revalidatePath("/", "layout");
  redirect(`/schemes/${id}`);
}

// Rename a scheme folder (its friendly display name). Owners only.
export async function renameSchemeAction(id: string, name: string) {
  await requireCap("scheme.edit", id); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(id);
  if (!scheme) return;
  const clean = String(name ?? "").trim().slice(0, 120);
  if (!clean) return;
  await updateScheme(id, { name: clean });
  await logActivity("scheme.renamed", { schemeId: id, subject: `scheme:${id}`, before: { name: scheme.name ?? "" }, after: { name: clean }, summary: `Scheme renamed to “${clean}”` });
  revalidatePath("/", "layout");
  revalidatePath(`/schemes/${id}`, "layout");
}

// Delete a scheme folder and everything in it (documents/applications live in the
// row; participants cascade in the DB). Destructive — the UI confirms first, and
// requireOwner() guards the direct-POST path. Lands back on the year folder.
export async function deleteSchemeAction(id: string) {
  await requireCap("scheme.create", id); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(id);
  if (!scheme) redirect("/");
  const dest = folderView(scheme!.type, scheme!.folderId ?? null);
  // never deleted: archived, with its participants, documents and journal kept (N23)
  const by = (await getRoleContext()).email ?? "build";
  // if the archive did not take (a database error), the scheme stays and says so
  if (!(await archiveScheme(id, by))) redirect(`/schemes/${id}?err=archive`);
  await logActivity("scheme.archived", { schemeId: id, summary: `Scheme ${scheme!.number} archived` });
  revalidatePath("/", "layout");
  redirect(dest);
}

// a scheme number at most 60 characters, cut between characters — never through a
// surrogate pair, which would make encodeURIComponent throw on the redirect
const cut60 = (v: string) => Array.from(v).slice(0, 60).join("");

// The old «/schemes/new» form, retired in part 3.1: a scheme is created from the folder
// explorer only (createProjectAction), where the number is read, its markers kept and
// the act journalled. A direct POST here creates nothing — it lands on that dialog.
export async function createSchemeAction(formData: FormData) {
  await requireCap("scheme.create"); // the role model (2.4)
  redirect(folderView(String(formData.get("type")) === "C" ? "C" : "T", null));
}

// SECURITY: Server Actions are reachable via direct POST, not only the UI — so the
// owner check lives INSIDE the action (proxy.ts alone is not sufficient).
export async function updateSchemeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await requireCap("scheme.edit", id); // in THIS scheme, by the role model (2.4)
  const existing = await getScheme(id);
  if (!existing) throw new Error("Scheme not found");

  // Every text field is stripped of invisible junk that rides along when pasting
  // from Word/PDF (control chars, zero-width marks, private-use glyphs, U+FFFD)
  // — mirrors the client-side cleanup in SchemeEditor so nothing slips through.
  const str = (k: string, fallback: string) =>
    String(formData.get(k) ?? fallback)
      .replace(/[\u2028\u2029]/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\uE000-\uF8FF\uFEFF\uFFFD]/g, "")
      .trim();
  // row count posted by the SchemeEditor (variable-length lists). Bounded; null
  // when absent (an older form) → fall back to fixed-index mapping over existing.
  const cnt = (k: string): number | null => {
    if (formData.get(k) === null) return null;
    const n = parseInt(str(k, ""), 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 100) : null;
  };

  // ── Schedule — dynamic add/remove/reorder; rows are purely positional ──
  const schedCount = cnt("schedCount");
  let schedule =
    schedCount === null
      ? existing.schedule.map((it, i) => ({
          date: str(`sched_${i}_date`, it.date),
          labelEn: str(`sched_${i}_en`, it.labelEn),
          labelBg: str(`sched_${i}_bg`, it.labelBg),
        }))
      : Array.from({ length: schedCount }, (_, i) => ({
          date: str(`sched_${i}_date`, ""),
          labelEn: str(`sched_${i}_en`, ""),
          labelBg: str(`sched_${i}_bg`, ""),
        })).filter((r) => r.date || r.labelEn || r.labelBg);
  if (!schedule.length) schedule = existing.schedule; // never silently wipe

  // ── Standards — dynamic; each surviving row posts its ORIGINAL index so the
  // position-based references (applications' selections, participants'
  // characteristics, T-scheme scoring keys) can follow their standard. ──
  const paramCount = cnt("paramCount");
  // the 3.6 fields of each row (lib/characteristics-model): one that does not read is
  // named, and the characteristics are not saved — the rest of the form is
  const charProblems: string[] = [];
  // a row's problem counts only when the row is kept — a blank new row is dropped (3.6 review)
  let rowProblem: string | null = null;
  const readParam = (i: number, base: Parameter): Parameter => {
    const sm = parseFloat(str(`param_${i}_sigmaMin`, "").replace(",", "."));
    const f = readCharacteristicFields((n) => (formData.get(`param_${i}_${n}`) === null ? null : str(`param_${i}_${n}`, "")), base);
    rowProblem = f.ok ? null : `${i + 1}: ${FIELD_PROBLEM_TEXT[f.problem].bg}`;
    return {
      ...(base.id ? { id: base.id } : {}),
      ...(f.ok ? f.fields : { unit: base.unit, step: base.step, guardMin: base.guardMin, guardMax: base.guardMax, uRequired: base.uRequired, group: base.group, groupEn: base.groupEn, determinations: base.determinations, engine: base.engine }),
      standardEn: str(`param_${i}_stdEn`, base.standardEn),
      standardBg: str(`param_${i}_stdBg`, base.standardBg),
      characteristicEn: str(`param_${i}_chEn`, base.characteristicEn),
      characteristicBg: str(`param_${i}_chBg`, base.characteristicBg),
      rangeEn: str(`param_${i}_rgEn`, base.rangeEn),
      rangeBg: str(`param_${i}_rgBg`, base.rangeBg),
      specimensEn: str(`param_${i}_spEn`, base.specimensEn),
      specimensBg: str(`param_${i}_spBg`, base.specimensBg),
      sigmaMin: Number.isFinite(sm) ? sm : undefined, // blank → no floor
    };
  };
  const EMPTY_PARAM: Parameter = {
    standardEn: "", standardBg: "", characteristicEn: "", characteristicBg: "",
    rangeEn: "", rangeBg: "", specimensEn: "", specimensBg: "",
  };
  let parameters: Parameter[];
  const paramMap = new Map<number, number>(); // old index → new index
  let paramsRestructured = false;
  if (paramCount === null) {
    parameters = existing.parameters.map((p, i) => { const r = readParam(i, p); if (rowProblem) charProblems.push(rowProblem); return r; });
    // Calibration schemes must not carry the "New project" template's blank
    // standard rows — they block the calibration fallbacks (F 7.2.1-6's
    // quantity × directions, the заявка's device item). All-blank → none.
    if (
      existing.type === "C" && existing.calibration &&
      parameters.every((p) => !p.standardEn && !p.standardBg && !p.characteristicEn && !p.characteristicBg)
    ) {
      parameters = [];
    }
  } else {
    const rows: { p: Parameter; orig: number | null }[] = [];
    const usedOrig = new Set<number>(); // a crafted duplicate orig must not collapse the map
    for (let i = 0; i < paramCount; i++) {
      const origRaw = str(`param_${i}_orig`, "");
      const origIdx = parseInt(origRaw, 10);
      // a row that carries a stable id is matched BY IT (3.6 review): a form opened before
      // someone else reordered or removed characteristics never gives a row another's id
      // or its references; one whose characteristic is gone is a new row. A row without an
      // id (a characteristic from before 3.6, an older form) by its place, as before.
      const postedId = str(`param_${i}_id`, "");
      const byId = postedId ? existing.parameters.findIndex((x) => x.id === postedId) : -1;
      const orig = postedId
        ? (byId >= 0 && !usedOrig.has(byId) ? byId : null)
        : origRaw !== "" && Number.isInteger(origIdx) && origIdx >= 0 &&
          origIdx < existing.parameters.length && !usedOrig.has(origIdx)
          ? origIdx
          : null;
      if (orig !== null) usedOrig.add(orig);
      const p = readParam(i, orig !== null ? existing.parameters[orig] : EMPTY_PARAM);
      // a NEW row left completely blank is just noise — skip it
      if (orig === null && !p.standardEn && !p.standardBg && !p.characteristicEn && !p.characteristicBg) continue;
      if (rowProblem) charProblems.push(rowProblem);
      rows.push({ p, orig });
    }
    if (rows.length === 0) {
      parameters = existing.parameters; // never silently wipe every standard
    } else {
      parameters = rows.map((r) => r.p);
      rows.forEach((r, newIdx) => {
        if (r.orig !== null) paramMap.set(r.orig, newIdx);
      });
      paramsRestructured = !isIdentityMap(paramMap, existing.parameters.length);
    }
  }

  if (charProblems.length) {
    parameters = existing.parameters;
    paramsRestructured = false;
    paramMap.clear();
  }

  // Refuse a structural change that would STRAND a participant: a lab registered
  // for exactly the deleted standard(s) would end with characteristics=[] — and
  // the codebase-wide convention reads empty as "registered for ALL standards",
  // silently widening that lab's scope in official documents (F 7.2.1-6). The
  // owner must first re-scope or remove those participants.
  // The final list announced (5.2): it names its characteristics by their places — no
  // reorder or removal while it stands; a step back undoes it first.
  if (paramsRestructured && currentFinalList(existing)) redirect(`/schemes/${id}/edit?err=list-final`);
  const participantRows = paramsRestructured ? await listParticipants(id) : [];
  if (paramsRestructured) {
    const stranded = participantRows.filter(
      (p) => p.characteristics?.length && (remapCharacteristics(p.characteristics, paramMap) ?? []).length === 0
    );
    if (stranded.length) {
      redirect(`/schemes/${id}/edit?err=stranded&codes=${encodeURIComponent(stranded.map((p) => p.code).join(", "))}`);
    }
  }

  const prices = existing.prices.map((pr, i) => ({
    characteristicEn: str(`price_${i}_chEn`, pr.characteristicEn),
    characteristicBg: str(`price_${i}_chBg`, pr.characteristicBg),
    first: str(`price_${i}_first`, pr.first),
    additional: str(`price_${i}_add`, pr.additional),
  }));

  // the commercial fields (3.7, Реш. 153) and the minimum participants: one that does
  // not read keeps them all as they were — named — and the rest of the form is saved
  const com = readCommercial((n) => (formData.get(n) === null ? null : str(n, "")), existing.commercial, existing.minParticipants);
  // the per-scheme lists (3.8): the shipment documents, the receipt-protocol checklist,
  // «accreditation required». A form that does not carry them keeps them; a row that
  // does not read keeps them all as they were — named — and the rest is saved
  const listsPosted = formData.get("listsPosted") !== null;
  // the posted count, as posted (a list longer than allowed is refused, never cut
  // short in silence) — and the rows read, bounded
  const postedCount = (pfx: string) => Math.max(0, parseInt(str(`${pfx}Count`, "0"), 10) || 0);
  const rowsOf = (pfx: string) =>
    Array.from({ length: Math.min(MAX_ITEMS + 1, postedCount(pfx)) }, (_, i) => ({ id: str(`${pfx}_${i}_id`, ""), bg: str(`${pfx}_${i}_bg`, ""), en: str(`${pfx}_${i}_en`, "") }));
  const shipRows = listsPosted ? rowsOf("ship") : [];
  const rcptRows = listsPosted ? rowsOf("rcpt") : [];
  const accreditationRequired = formData.get("accreditationRequired") !== null;
  // each list on its own: one that does not read keeps ITS rows, the other list and
  // the flag are saved (3.8 review); the refusal names the row by its words
  const refusalOf = (rows: typeof shipRows, pfx: string) => {
    if (!listsPosted) return "";
    const r = readList(rows, undefined, 0, postedCount(pfx));
    return r.ok ? "" : [r.problem, r.row ?? "", r.text ?? ""].join(":");
  };
  // a calibration scheme's own texts for its M1 documents (3.10 review) — written
  // into its clauses; a form that does not carry them keeps them
  const m1Texts: Record<string, { bg: string; en: string } | null> = {};
  if (formData.get("m1BlocksPosted") !== null && usesM1(existing)) {
    for (const b of M1_BLOCKS) {
      if (formData.get(`m1c_${b.key}_bg`) === null && formData.get(`m1c_${b.key}_en`) === null) continue;
      const cut = (k: string) => Array.from(str(k, "")).slice(0, MAX_M1_BLOCK).join("");
      const bg = cut(`m1c_${b.key}_bg`), en = cut(`m1c_${b.key}_en`);
      m1Texts[b.key] = bg || en ? { bg, en } : null;
    }
  }
  // the design data and the external providers (3.13): the period as the report
  // writes it, and who supplies what — refused with their own notice, the rest saved
  const metaPosted = formData.get("metaPosted") !== null;
  const periodRead = readPeriod(metaPosted ? (formData.get("period") === null ? null : str("period", "")) : null, existing.period);
  const provCount = metaPosted ? Math.max(0, parseInt(str("provCount", "0"), 10) || 0) : 0;
  const provRows = Array.from({ length: Math.min(MAX_PROVIDERS + 1, provCount) }, (_, i) => ({
    id: str(`prov_${i}_id`, ""), name: str(`prov_${i}_name`, ""), address: str(`prov_${i}_address`, ""), servicesBg: str(`prov_${i}_svcBg`, ""), servicesEn: str(`prov_${i}_svcEn`, ""),
  }));
  const provCheck = metaPosted ? readProviders(provRows, existing.externalProviders, () => crypto.randomUUID(), provCount) : null;
  // the period and the providers each on its own: one that does not read never throws
  // the other away (3.13 review)
  const periodRefused = !periodRead.ok;
  const metaRefusal = provCheck && !provCheck.ok ? `${provCheck.problem}${provCheck.row ? `:${provCheck.row}` : ""}` : "";
  const shipRefusal = refusalOf(shipRows, "ship");
  const rcptRefusal = refusalOf(rcptRows, "rcpt");

  // calibration block (only for C schemes that already carry calibration data)
  let calibration = existing.calibration;
  if (existing.calibration) {
    // A POSTED empty field clears the list (the editor's labels promise "empty
    // if none"); the fallback applies only when the field wasn't posted at all
    // (an older form that doesn't carry it).
    const list = (k: string, fb: string[]) => {
      if (formData.get(k) === null) return fb;
      return str(k, "").split(",").map((x) => x.trim()).filter(Boolean);
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
  // ONE static reminder text per scheme (А3, 3.6) — kept when the form does not carry it;
  // cut by characters, never inside one (3.6 review)
  const cut600 = (k: string) => Array.from(str(k, "")).slice(0, 600).join("");
  const reminderBg = formData.get("staticReminderBg") === null ? existing.staticReminder?.bg ?? "" : cut600("staticReminderBg");
  const reminderEn = formData.get("staticReminderEn") === null ? existing.staticReminder?.en ?? "" : cut600("staticReminderEn");
  const editorBy3 = await actorNow();

  // Calibration points/directions are edited as FREE TEXT, so a surviving point
  // carries no original index the way a standard does (param_i_orig) — the
  // "<dir>:<point>" keys holding the Eₙ inputs (scheme.scoring) and the Results
  // Sheet fields (formData["results"]: result_<dir>_<pt> / unc_<dir>_<pt>) CANNOT
  // follow it. Deleting, reordering or renaming a point would silently reattach an
  // already-issued Eₙ to a different load. Refuse the save while those slots still
  // hold data — the owner clears them on the Results page first, exactly as the
  // stranded-participant guard above does. Appending new points stays allowed.
  // The guard no longer REFUSES the save. The owner asked for an app that never
  // stands in his way, and refusing meant a trip to the Results page and retyping
  // every other edit he had made on this form. What it must still never do is let
  // the data follow the edit onto a different load point.
  //
  // So: the editor warns him before submitting, naming the exact results at stake,
  // and if he goes ahead they are CLEARED rather than reattached. Arriving without
  // that confirmation — an older client, or a Server Action POSTed directly — still
  // gets the refusal, so nothing can be dropped without somebody having said so.
  const oldCal = existing.calibration;
  let clearedSlots: [number, number][] = [];
  if (existing.type === "C" && oldCal && calibration) {
    const broken = calibrationSlotsBroken(
      calibrationDataSlots(existing.scoring, existing.formData?.["results"]),
      oldCal.points, calibration.points,
      oldCal.directionsEn, calibration.directionsEn
    );
    if (broken.length && formData.get("calslotsConfirm") !== "1") {
      const dirs = effectiveDirections(oldCal.directionsEn);
      const list = [...new Set(broken.map(([d, p]) =>
        `${dirs[d] ?? `#${d + 1}`} @ ${oldCal.points[p] ?? `#${p + 1}`}${oldCal.unit ? ` ${oldCal.unit}` : ""}`
      // Trailing lone surrogate stripped: slicing mid-pair would make
      // encodeURIComponent throw a URIError and 500 the save instead of showing
      // the banner. (Cyrillic and digits are BMP, so this is belt-and-braces.)
      ))].join(", ").slice(0, 300).replace(/[\uD800-\uDFFF]$/, "");
      redirect(`/schemes/${id}/edit?err=calslots&slots=${encodeURIComponent(list)}`);
    }
    clearedSlots = broken;
  }

  // cover photo: URL (uploaded), width (%) and placement, all owner-set on the Edit
  // page. Only site-relative or https URLs, with no characters that could break out
  // of an attribute in the rendered documents (defense alongside esc()).
  const coverRaw = str("coverImage", existing.coverImage ?? "");
  const coverImage =
    coverRaw === "" || (/^(\/|https:\/\/)/.test(coverRaw) && !/["'<>\s\\]/.test(coverRaw))
      ? coverRaw
      : existing.coverImage ?? "";
  const cwRaw = parseInt(str("coverImageWidth", ""), 10);
  const caRaw = str("coverImageAlign", "");
  const coverImageAlign = caRaw === "left" || caRaw === "center" || caRaw === "right" ? caRaw : existing.coverImageAlign;

  // Lab visibility = the lifecycle status alone. There is no "announced" draft any
  // more: nothing unstarted is shown (Реш. 147). This page opens a scheme (stage 7) or
  // takes an open one back to draft; every later state is an act on the scheme page
  // (3.2) — a posted «report» or «closed» here changes nothing. Either move is an act
  // on record.
  const statusRaw = str("status", existing.status);
  const wantStatus: "draft" | "open" | null = statusRaw === "open" || statusRaw === "draft" ? statusRaw : null;
  // the state the form was opened in: a move is what the person changed on THIS form,
  // and only from the state it showed — a form left open while an act moved the scheme
  // never undoes that act by being saved
  const statusFrom = str("statusFrom", "");
  const editorBy = await actorNow();
  const editorAt = new Date().toISOString();
  const editorDay = sofiaToday(schemeNowMs(existing));
  let statusMove: LifecycleAct | null = null;
  let newVersionNo: number | null = null;
  let comChanges: string[] = [];
  let listsChanged: string[] = [];
  let m1Changed: string[] = [];
  let metaChanged: string[] = [];

  // A changed number must not be another scheme's — Т/T and С/C alike, archived
  // schemes included (E4.a; the create dialog already checked this, the edit did not).
  // A taken number is not saved, but the rest of the form is: refusing everything
  // would mean retyping every other edit for one wrong field.
  const newNumber = cut60(str("number", existing.number) || existing.number);
  const numberChange = !sameSchemeNumber(newNumber, existing.number);
  // …and any change of how it is written: the certificates print it as it is (below)
  const spellingChange = newNumber !== existing.number;
  // certificates carry the number in theirs, and the register holds them so (0.15):
  // once one is issued the scheme number stays — freeing it would let another scheme
  // take it and its certificate numbers collide
  const hasCerts = (s: { certificates?: Record<string, unknown> }) => Object.keys(s.certificates ?? {}).length > 0;
  // — even a change of spelling only («26/1-T-01» for «26/01-T-1»): the documents would
  // print another prefix than the certificates and the register
  const numberLocked = spellingChange && hasCerts(existing);
  const numberTaken = numberChange && !numberLocked && (await schemeNumberExists(newNumber, id));
  // a «SIM» number only in the test environment (Реш. 130, 1.2)
  const simRefused = numberChange && !numberLocked && !numberTaken && (readSchemeNumber(newNumber)?.simulation || looksLikeSimNumber(newNumber)) && !isTestEnvironment();
  // the portal reads the number (Реш. 102, 3.1): today's form or one of the archive's
  const numberUnread = numberChange && !numberLocked && !numberTaken && !simRefused && !readSchemeNumber(newNumber);
  // What the number does not state, PTS chooses on this page (3.1); a field the form
  // did not carry keeps its value. "" = not stated.
  const pick = <T,>(k: string, ok: (v: unknown) => v is T, keep: T | undefined): T | null | undefined => {
    const v = formData.get(k);
    if (v === null) return keep;
    return v === "" ? null : ok(v) ? v : keep;
  };
  const chosen = {
    kind: pick("kind", isKind, existing.kind),
    activity: pick("activity", isActivity, existing.activity),
    accredited: pick("accredited", (v): v is "yes" | "NA" => v === "yes" || v === "NA", existing.accredited === undefined ? undefined : existing.accredited ? "yes" : "NA"),
  };
  const chosenMarkers = { kind: chosen.kind, activity: chosen.activity, accredited: chosen.accredited == null ? chosen.accredited : chosen.accredited === "yes" };
  // a calibration scheme's number is C, a testing one's T or S: the number is kept then
  const activityRefused = numberChange && !numberLocked && !numberTaken && !simRefused && !numberUnread
    && !markersFor(newNumber, existing.type, chosenMarkers).ok;
  const numberRefused = numberTaken || simRefused || numberUnread || activityRefused;
  let markersBefore: Pick<Scheme, "number" | "kind" | "activity" | "accredited"> | null = null;
  let markersLockedRefused = false;
  let listFinalLate = false; // a second announcement made while this save ran (5.2)
  let markersAfter: Pick<Scheme, "number" | "kind" | "activity" | "accredited"> | null = null;

  // Write the scheme in ONE locked read-modify-write: when the standards were
  // reordered/removed, the position-based references stored ON the scheme (the
  // labs' requested participations, the T-scheme scoring keys) are remapped from
  // the FRESH state inside the lock — a заявка submitted while this action was
  // running is remapped too, never clobbered (lib/param-remap).
  await updateSchemeWith(id, (current) => {
    // …re-checked here: a final list announced meanwhile refuses the reorder (5.2 review)
    if (paramsRestructured && currentFinalList(current)) { listFinalLate = true; return {}; }
    // official PTS number — shown on every document + drives the year grouping.
    // Falls back to the existing number if the field was cleared.
    const number = numberRefused || (spellingChange && hasCerts(current)) ? current.number : newNumber;
    // its markers, kept as fields (Реш. 102): what the number states, the rest as chosen
    const m = markersFor(number, current.type, chosenMarkers);
    const kept = { kind: current.kind, activity: current.activity, accredited: current.accredited };
    let markers = m.ok ? { kind: m.kind, activity: m.activity, accredited: m.accredited } : kept;
    // issued certificates carry the status — the accreditation mark or the NA sentence —
    // so once there are any it stays, as the number does (3.9 review)
    if (hasCerts(current)) {
      const reads = (x: typeof kept) => JSON.stringify(schemeMarkers({ number, type: current.type, ...x }));
      if (reads(markers) !== reads(kept)) markersLockedRefused = true;
      markers = kept;
    }
    markersBefore = { number: current.number, kind: current.kind, activity: current.activity, accredited: current.accredited };
    markersAfter = { number, ...markers };
    const move = wantStatus && wantStatus !== statusFrom && current.status === statusFrom && (current.status === "draft" || current.status === "open") ? wantStatus : null;
    statusMove = move ? {
      act: move === "open" ? "open" : "back", from: current.status, to: move, at: editorAt, by: editorBy, day: editorDay,
      ...(move === "draft" ? { note: "Върната в чернова от «Редактирай данните»" } : {}),
    } : null;
    // the characteristics' stable ids — never given twice — and, when their
    // configuration changed, its next version on record (3.6)
    const withIds = ensureIds(parameters, current.characteristicSeq);
    // each calibration point keeps its stable id while its value stays — given HERE,
    // from the fresh state, so two saves at once never give one id twice (3.6 review)
    const pi = calibration ? ensurePointIds(calibration.points, current.calibration?.points, current.calibration?.pointIds, current.pointSeq) : null;
    const cal = calibration && pi ? { ...calibration, pointIds: pi.ids } : calibration;
    const cfgNow = configOf(withIds.params, cal ? { values: cal.points, ids: cal.pointIds } : undefined);
    const lastVersion = (current.characteristicVersions ?? []).at(-1);
    const cfgBefore = lastVersion ? configOf(lastVersion.characteristics, lastVersion.points) : configOf(current.parameters, current.calibration ? { values: current.calibration.points, ids: current.calibration.pointIds } : undefined);
    const versionMade = !lastVersion || cfgNow !== cfgBefore;
    if (versionMade) newVersionNo = nextVersionNo(current.characteristicVersions);
    // the commercial fields, compared with the FRESH state for the journal (3.7)
    const comNow = com.ok ? com.commercial : current.commercial;
    const minNow = com.ok ? com.minParticipants : current.minParticipants;
    comChanges = commercialDiff(current.commercial, comNow, current.minParticipants, minNow);
    // the lists — their ids from the FRESH state's counter (3.8)
    const listsBefore = listsOf(current);
    let listsNow: SchemeLists | undefined = current.lists;
    if (listsPosted) {
      // ids above every id either list holds; whatever else the lists carry is kept
      let seq = listSeq(listsBefore);
      const sh = shipRefusal ? null : readList(shipRows, listsBefore.shipmentDocs, seq);
      if (sh?.ok) seq = sh.seq;
      const rc = rcptRefusal ? null : readList(rcptRows, listsBefore.receiptChecks, seq);
      if (rc?.ok) seq = rc.seq;
      const { accreditationRequired: _was, ...rest } = listsBefore; // the flag as posted
      void _was;
      listsNow = {
        ...rest,
        shipmentDocs: sh?.ok ? sh.items : listsBefore.shipmentDocs ?? [],
        receiptChecks: rc?.ok ? rc.items : listsBefore.receiptChecks ?? [],
        ...(accreditationRequired ? { accreditationRequired: true } : {}),
        seq,
      };
    }
    listsChanged = listsNow === current.lists ? [] : listsDiff(listsBefore, listsNow ?? {});
    // the design data and the providers (3.13) — ids from the FRESH state
    let periodNow = current.period, providersNow = current.externalProviders;
    if (metaPosted) {
      if (periodRead.ok) periodNow = periodRead.period;
      if (!metaRefusal) {
        const pr = readProviders(provRows, current.externalProviders, () => crypto.randomUUID(), provCount);
        if (pr.ok) providersNow = pr.providers.length ? pr.providers : undefined;
      }
    }
    metaChanged = metaDiff({ period: current.period, externalProviders: current.externalProviders }, { period: periodNow, externalProviders: providersNow });
    // the M1 texts — compared with the fresh state, for the journal
    const clausesNow = { ...(current.clauses ?? {}) };
    m1Changed = [];
    for (const [k, v] of Object.entries(m1Texts)) {
      const was = current.clauses?.[k];
      if (JSON.stringify(was ?? null) === JSON.stringify(v)) continue;
      m1Changed.push(k);
      if (v) clausesNow[k] = v; else delete clausesNow[k];
    }
    return {
    ...(statusMove ? { status: statusMove.to, lifecycle: { ...(current.lifecycle ?? {}), acts: [...(current.lifecycle?.acts ?? []), statusMove] } } : {}),
    characteristicSeq: withIds.seq,
    ...(pi ? { pointSeq: pi.seq } : {}),
    ...(versionMade ? { characteristicVersions: [...(current.characteristicVersions ?? []), {
      no: newVersionNo!, at: editorAt, by: editorBy3, day: editorDay, characteristics: withIds.params,
      ...(cal ? { points: { values: cal.points, ids: cal.pointIds } } : {}),
    }] } : {}),
    staticReminder: reminderBg || reminderEn ? { bg: reminderBg, en: reminderEn } : undefined,
    number,
    ...markers,
    coverImage: coverImage || undefined,
    coverImageWidth: Number.isFinite(cwRaw) ? Math.min(100, Math.max(10, cwRaw)) : existing.coverImageWidth,
    coverImageAlign,
    titleEn: str("titleEn", existing.titleEn),
    titleBg: str("titleBg", existing.titleBg),
    objectEn: str("objectEn", existing.objectEn),
    objectBg: str("objectBg", existing.objectBg),
    minParticipants: minNow,
    commercial: comNow,
    lists: listsNow,
    period: periodNow,
    externalProviders: providersNow,
    ...(m1Changed.length ? { clauses: clausesNow } : {}),
    schedule,
    parameters: withIds.params,
    prices,
    calibration: cal,
    // He confirmed the calibration-point edit, so the Eₙ values and Results-Sheet
    // fields that belonged to the points he changed are dropped HERE, inside the
    // same locked write — an entry made while this action was running is cleared
    // too, and never left pointing at a load point that no longer means what it did.
    ...(clearedSlots.length
      ? (() => {
          const c = clearCalibrationSlots(current.scoring, current.formData?.["results"], clearedSlots);
          return {
            ...(c.scoring ? { scoring: c.scoring } : {}),
            ...(c.resultsSheet ? { formData: { ...(current.formData ?? {}), results: c.resultsSheet } } : {}),
          };
        })()
      : {}),
    ...(paramsRestructured
      ? {
          applications: (current.applications ?? []).map((a) => ({
            ...a,
            selections: remapSelections(a.selections, paramMap),
          })),
          ...(current.type !== "C" && current.scoring
            ? { scoring: remapScoring(current.scoring, paramMap) }
            : {}),
        }
      : {}),
    // the batches' homogeneity values follow their characteristic (3.5) — and a value
    // from before the ids gets its characteristic's id (3.6 review)
    ...(() => {
      const moved = paramsRestructured ? remapHomogeneity(current.batches, (old) => paramMap.get(old) ?? null) : current.batches;
      const filled = backfillCharacteristicIds(moved, withIds.params.map((p) => p.id));
      return filled !== current.batches ? { batches: filled } : {};
    })(),
    };
  });
  if (listFinalLate) redirect(`/schemes/${id}/edit?err=list-final`);

  // Participants' registered characteristics follow their standards too (separate
  // table; scheme written first so documents never see new standards with old
  // participant scopes). The stranding guard above already ensured none go empty.
  // Its participations per characteristic (5.1) are keyed by the same index, so they
  // follow too — else a reorder would move a count onto another standard.
  if (paramsRestructured) {
    const canon = (sel: Record<string, number>) => JSON.stringify(Object.entries(sel).sort(([a], [b]) => Number(a) - Number(b)));
    for (const p of participantRows) {
      const patch: { characteristics?: number[]; selections?: Record<string, number> } = {};
      if (p.characteristics?.length) {
        const next = remapCharacteristics(p.characteristics, paramMap) ?? [];
        const cur = [...p.characteristics].sort((a, b) => a - b);
        if (next.length !== cur.length || next.some((v, k) => v !== cur[k])) patch.characteristics = next;
      }
      if (p.selections && Object.keys(p.selections).length) {
        const nextSel = remapSelections(p.selections, paramMap);
        if (canon(nextSel) !== canon(p.selections)) patch.selections = nextSel;
      }
      if (patch.characteristics || patch.selections) await updateParticipant(p.id, patch);
    }
  }

  // Dropping issued Eₙ values is exactly the kind of thing an assessor asks about,
  // so it is recorded by load point — not just counted.
  if (clearedSlots.length && oldCal) {
    const dirs = effectiveDirections(oldCal.directionsEn);
    const lost = clearedSlots
      .map(([d, p]) => `${dirs[d] ?? `#${d + 1}`} @ ${oldCal.points[p] ?? `#${p + 1}`}${oldCal.unit ? ` ${oldCal.unit}` : ""}`)
      .join(", ");
    await logActivity("results.cleared", {
      schemeId: id,
      summary: `Calibration points edited with the owner's confirmation — results cleared for: ${lost}`,
    });
  }

  const metaLog = metaChanged as string[];
  if (metaLog.length) {
    await logActivity("scheme.meta", { schemeId: id, subject: `scheme:${id}`, after: { changes: metaLog }, summary: `Design data: ${metaLog.join("; ")}` });
  }
  const m1Log = m1Changed as string[];
  if (m1Log.length) {
    await logActivity("scheme.texts", { schemeId: id, subject: `scheme:${id}`, after: { changed: m1Log }, summary: `Document texts (M1): ${m1Log.join(", ")}` });
  }
  const listLog = listsChanged as string[];
  if (listLog.length) {
    await logActivity("scheme.lists", { schemeId: id, subject: `scheme:${id}`, after: { changes: listLog }, summary: `Lists: ${listLog.join("; ")}` });
  }
  const comLog = comChanges as string[];
  if (comLog.length) {
    await logActivity("scheme.commercial", { schemeId: id, subject: `scheme:${id}`, after: { changes: comLog }, summary: `Prices / participants: ${comLog.join("; ")}` });
  }
  const madeNo = newVersionNo as number | null;
  if (madeNo !== null) {
    await logActivity("scheme.characteristics", { schemeId: id, subject: `scheme:${id}`, after: { version: madeNo }, summary: `Characteristics: configuration version ${madeNo}` });
  }
  const moved = statusMove as LifecycleAct | null;
  if (moved) {
    await logActivity("scheme.state", {
      schemeId: id, subject: `scheme:${id}`, before: { status: moved.from }, after: { status: moved.to },
      summary: `${ACTS[moved.act].en}: ${STATE_LABEL[moved.from].en} → ${STATE_LABEL[moved.to].en} (from «Edit data»)`,
    });
  }
  // the number and what it carries are on every document — a change is on record
  const b = markersBefore as Pick<Scheme, "number" | "kind" | "activity" | "accredited"> | null;
  const a = markersAfter as Pick<Scheme, "number" | "kind" | "activity" | "accredited"> | null;
  // as they read — a scheme from before 3.1 storing the fields its number states for
  // the first time is not a change
  const reads = (x: Pick<Scheme, "number" | "kind" | "activity" | "accredited">) => JSON.stringify(schemeMarkers({ ...x, type: existing.type }));
  if (b && a && (b.number !== a.number || reads(b) !== reads(a))) {
    await logActivity("scheme.number", {
      schemeId: id, subject: `scheme:${id}`, before: { ...b }, after: { ...a },
      summary: `Number ${a.number}: ${a.kind ?? "—"} · ${a.activity ?? "—"} · ${a.accredited === undefined ? "—" : a.accredited ? "in scope" : "NA"}`,
    });
  }

  revalidatePath(`/schemes/${id}`, "layout");
  // the characteristics' refusal is its own notice, carried with whichever other one
  // comes back — neither hides the other (3.6 review)
  const chars = charProblems.length ? `chars=${encodeURIComponent(Array.from(charProblems.join("; ")).slice(0, 300).join(""))}` : "";
  // …and so is the commercial fields' (3.7)
  const comQ = com.ok ? "" : `com=${encodeURIComponent(com.problem)}`;
  // each list's refusal its own notice (3.8 review): «problem:row:its words»
  const lstQ = [shipRefusal ? `lship=${encodeURIComponent(shipRefusal)}` : "", rcptRefusal ? `lrcpt=${encodeURIComponent(rcptRefusal)}` : ""].filter(Boolean).join("&");
  // a fresh token each time: the editor starts again from what was saved (3.7 review)
  // …and the status kept because certificates are issued (3.9 review)
  const mklQ = markersLockedRefused ? "mkl=1" : "";
  // …and the design data's (3.13)
  const metaQ = [metaRefusal ? `meta=${encodeURIComponent(metaRefusal)}` : "", periodRefused ? "per=1" : ""].filter(Boolean).join("&");
  const back = (q: string) => `/schemes/${id}/edit?${[q, chars, comQ, lstQ, mklQ, metaQ, `t=${Date.now().toString(36)}`].filter(Boolean).join("&")}`;
  if (numberLocked) redirect(back(`err=numberLocked&number=${encodeURIComponent(newNumber)}`));
  if (simRefused) redirect(back(`err=simNumber&number=${encodeURIComponent(newNumber)}`));
  if (numberUnread) redirect(back(`err=badNumber&number=${encodeURIComponent(newNumber)}`));
  if (activityRefused) redirect(back(`err=numberActivity&number=${encodeURIComponent(newNumber)}`));
  if (numberTaken) redirect(back(`err=dupNumber&number=${encodeURIComponent(newNumber)}`));
  redirect(chars || comQ || lstQ || mklQ || metaQ ? back("") : `/schemes/${id}`);
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

  const metrics = metricsForScheme(scheme);
  // results only for a coded participation — an application has none before the coding act (5.3)
  const codes = participants.filter((p) => !isProvisional(p.code)).map((p) => p.code);
  const scoring = buildScoring(metrics, codes, num);
  // The positional layout the form was built from: metric keys then participant
  // codes. Part of the stamp, so a scheme/participant change since render is a
  // conflict too — r_<mi>_<pi>_* indices would otherwise land on the wrong lab.
  const shape = [...metrics.map((m) => m.key), ...codes];
  // A form with no `stamp` field at all (a page rendered by an older build, or a
  // restored bfcache page from before this deploy) keeps the previous, unchecked
  // behaviour — the check must not turn a working save into a hard failure.
  const raw = formData.get("stamp");
  const stamp = typeof raw === "string" ? raw : null;
  return { id, scheme, scoring, metrics, stamp, shape };
}

// Optimistic lock for the results screen. Both save paths REPLACE scheme.scoring
// wholesale, so a form rendered before someone else's save would silently drop
// their entries (the browser posts blanks for cells it never saw). The form carries
// the stamp of the state it was rendered from; inside the per-scheme write lock we
// re-read the CURRENT scheme and refuse when it no longer matches. Re-posting the
// SAME data (double-click, Back-then-Save) is not a conflict — the write would be a
// no-op. Returns true when the save was refused.
async function writeScoringIfUnchanged(
  id: string,
  stamp: string | null,
  shape: string[],
  scoring: Scoring
): Promise<boolean> {
  let conflict = false;
  await updateSchemeWith(id, (current) => {
    const now = scoringStamp(current.scoring, shape);
    if (stamp !== null && now !== stamp && now !== scoringStamp(scoring, shape)) {
      conflict = true;
      return {};
    }
    return { scoring };
  });
  return conflict;
}

// Save manually-entered results & assigned values. §7.5.1/§8.4 — the save is logged
// with WHO, WHICH scheme and every cell that changed (old → new), so "who entered
// this z-score and what was it before?" is answerable from the append-only log.
// `scheme` here is the PRE-write snapshot readScoringForm already fetched, so the
// diff costs no extra query.
export async function saveScoringAction(formData: FormData) {
  // results entered (the coding expert) or processed (the statistics expert), in THIS scheme (2.4)
  await requireOneOf(["results.enter", "results.process"], String(formData.get("id") ?? ""));
  const { id, scheme, scoring, metrics, stamp, shape } = await readScoringForm(formData);
  const changes = diffScoring(scheme.scoring, scoring);
  const conflict = await writeScoringIfUnchanged(id, stamp, shape, scoring);
  await logActivity(conflict ? "results.conflict" : "results.saved", {
    schemeId: id,
    summary: conflict
      ? "Results save REFUSED — the scheme changed since the form was opened; nothing was written."
      : `Results saved — ${describeScoringChanges(changes, metrics)}`,
  });
  revalidatePath(`/schemes/${id}`, "layout");
  redirect(`/schemes/${id}/results${conflict ? "?err=conflict" : ""}`);
}

// Save the entered results AND auto-fill the assigned value/σ/u from them using
// ISO 13528 Algorithm A (robust consensus). Testing schemes only — for
// calibration the assigned value is the reference lab's, kept manual. The filled
// values remain editable, so this is a starting point, not a lock-in.
export async function autoAssignAction(formData: FormData) {
  await requireCap("results.process", String(formData.get("id") ?? "")); // in THIS scheme, by the role model (2.4)
  const { id, scheme, scoring, metrics, stamp, shape } = await readScoringForm(formData);
  // Refuse to derive a consensus value for a characteristic that has fewer results
  // than the scheme's own declared minimum. At n = 2 Algorithm A degenerates — both
  // labs always score z = ±0.62 ("satisfactory") however far apart they are — and a
  // bogus xpt would travel into the Final Report and every lab's dashboard, where a
  // screen warning cannot follow it. The entered results are still saved; the
  // assigned value is then entered by hand per Statistical project §4.
  const need = CONSENSUS_FLOOR;
  const short = scheme.type === "C" ? [] : belowMinimum(metrics, scoring, need);
  if (scheme.type !== "C") {
    scoring.assigned = { ...scoring.assigned, ...computeAssigned(metrics, scoring, need) };
  }
  const changes = diffScoring(scheme.scoring, scoring);
  const conflict = await writeScoringIfUnchanged(id, stamp, shape, scoring);
  await logActivity(conflict ? "results.conflict" : "results.auto_assigned", {
    schemeId: id,
    summary: conflict
      ? "Results save REFUSED — the scheme changed since the form was opened; nothing was written."
      : `Results saved + assigned value auto-computed (ISO 13528 Algorithm A, min ${need} results)`
        + `${short.length ? `; ${short.length} characteristic(s) below the minimum were left for manual entry` : ""}`
        + ` — ${describeScoringChanges(changes, metrics)}`,
  });
  revalidatePath(`/schemes/${id}`, "layout");
  const q = conflict ? "?err=conflict" : short.length ? `?warn=minpart&n=${need}` : "";
  redirect(`/schemes/${id}/results${q}`);
}

// ── Notifications ────────────────────────────────────────────────────────────
// Mark the reader's own feed read. The AUDIENCE is resolved from the session on
// the server and never taken from the client: a signed-in laboratory can only
// ever clear its own feed, and a lab session is checked FIRST so a lab can never
// fall through to the provider branch.
//
// Deliberately no revalidatePath: the badge is already cleared on the reader's
// screen, and the feed lives in the ROOT layout — revalidating that would discard
// every cached page in the app to restyle one dropdown. The next navigation
// re-renders the layout anyway and picks the read state up then.
// Per person (4.6, N28): what THIS reader was shown is read for them — never for
// everyone, and never more than they were shown (the ids their page rendered), within
// their own feed as their page filters it (review). A laboratory account by its
// sign-in, a participant's user by its id, PTS's people by their e-mail — the reader is
// the session's, never the client's.
export async function markNotificationsReadAction(shownIds: unknown): Promise<void> {
  const shown = new Set((Array.isArray(shownIds) ? shownIds : []).filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, 200));
  if (!shown.size) return;
  const mine = (ids: string[]) => ids.filter((id) => shown.has(id));
  const ls = await getLabSession();
  if (ls) {
    await markRead(readerKey.labAccount(ls.userId), mine((await listForLab(ls.lab.id, 200)).map((n) => n.id)));
    return;
  }
  const ps = await getParticipantSession();
  if (ps) {
    // only the started schemes' (Реш. 147), as the page shows them
    const started = new Set((await listSchemes()).filter((s) => isStarted(s)).map((s) => s.id));
    const parts = (await participationsOf(ps)).filter((p) => started.has(p.schemeId));
    await markRead(readerKey.participant(ps.user.id), mine((await listForParticipations(parts, 200)).map((n) => n.id)));
    return;
  }
  const ctx = await getRoleContext();
  if (!ctx.role || ctx.role === "lab") return;
  // the bell's own filters: a new заявка only to who opens it; only the schemes this person works in
  const scope = schemesFor(await getViewer(), "codes.view");
  const canManageUsers = (await mayAnywhereNow("labs.manage")) || (await canManagePeople(ctx));
  const feed = (await listForProvider(200)).filter((n) => canManageUsers || n.kind !== "application.received").filter((n) => scope === "all" || (!!n.schemeId && scope.includes(n.schemeId)));
  await markRead(readerKey.staff(ctx.email ?? "build"), mine(feed.map((n) => n.id)));
}

// ── The calibration chain ────────────────────────────────────────────────────
// One device, travelling laboratory to laboratory. The owner fixes the order; the
// app reveals each next address only when the device is actually in a lab's hands.
// Every rule lives in lib/chain.ts — these actions only move state and tell people.

/**
 * Set or rebuild the chain. One action covers creating it, reordering, adding and
 * dropping, because to him they are one job: "this is the order".
 *
 * Stops the device has ALREADY reached are frozen — they are the traceability
 * record and are kept exactly as they are, whatever is posted. Everything else is
 * replaced by `desired`, so omitting a pending stop drops it.
 */
export async function setChainAction(
  schemeId: string,
  desired: { id?: string; kind: "lab" | "ref"; code?: string }[],
): Promise<{ ok?: boolean; error?: string }> {
  await requireCap("dispatch", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  if (scheme.type !== "C") return { error: "Only calibration schemes have a chain." };
  // the chain is the measurements: once processing has started (or the scheme is not
  // held, or closed) it is what it was (3.2)
  if (!chainOpen(scheme.status)) return { error: "Веригата не се променя след началото на обработката. · The chain does not change once processing has started." };

  // A lab stop must name a real participation in THIS scheme — never trust the form.
  // A NEW lab stop only for one still in the round (5.1): a refused, annulled or
  // withdrawn participation never gets the device; a stop it already had stays as it was.
  const all = await listParticipants(schemeId);
  const codes = new Set(all.map((p) => p.code));
  const outOfRound = new Set(all.filter((p) => !inRound(p)).map((p) => p.code));
  for (const d of desired ?? []) {
    if (d.kind === "lab" && !codes.has(String(d.code ?? ""))) {
      return { error: `“${d.code}” is not a participant in this scheme.` };
    }
    if (d.kind === "lab" && !d.id && outOfRound.has(String(d.code ?? ""))) {
      return { error: `«${d.code}» е извън кръга (отказана, анулирана или оттеглена) — не получава уреда. · “${d.code}” is out of the round (refused, annulled or withdrawn) — it does not get the device.` };
    }
  }

  // rebuilt from the scheme as it is NOW — a stop reached since the screen loaded
  // stays where it is and is not added a second time (lib/chain.ts rebuildChain)
  await updateSchemeWith(schemeId, (s) => ({
    chain: { ...(s.chain ?? {}), stops: rebuildChain(s.chain?.stops ?? [], desired ?? [], () => randomUUID()) },
  }));
  await logActivity("chain.order", { schemeId, summary: `Calibration chain order set (${(desired ?? []).length} pending stop(s))` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "page");
  return { ok: true };
}

/** His own guess at how long a lab keeps the device — only used until real hops exist. */
export async function setChainPaceAction(schemeId: string, days: number): Promise<{ ok?: boolean; error?: string }> {
  await requireCap("dispatch", schemeId); // in THIS scheme, by the role model (2.4)
  if (!(await getScheme(schemeId))) return { error: "Scheme not found." };
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 0 || n > 365) return { error: "Give a number of days between 0 and 365." };
  await updateSchemeWith(schemeId, (s) => ({ chain: { stops: s.chain?.stops ?? [], ...(s.chain ?? {}), daysPerLab: n || undefined } }));
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "page");
  return { ok: true };
}

/**
 * The owner confirms he has sent the device to the first stop. Both ends of the
 * chain stay in his hands — he asked for that explicitly.
 */
// A round's own Bulgarian day — for the case-file steps it dates (1.3).
async function roundDay(schemeId: string): Promise<string> {
  return sofiaToday(schemeNowMs(await getScheme(schemeId)));
}

// The round's clock (part 1.3, Реш. 132): move this round's "now" to a Bulgarian
// wall-clock time, or back to the real time (null). TEST environment only — the real
// portal refuses, and lib/clock ignores a stored offset there anyway.
export async function setTestClockAction(schemeId: string, wall: string | null): Promise<{ ok: true } | { error: "not-test" | "bad-time" | "too-far" | "before-chain" | "no-scheme"; at?: string }> {
  await requireCap("scheme.edit", schemeId); // in THIS scheme, by the role model (2.4)
  if (!isTestEnvironment()) return { error: "not-test" };
  const actor = (await getRoleContext()).email ?? "";
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "no-scheme" };
  let offsetMs = 0;
  if (wall !== null) {
    const iso = sofiaWallToIso(String(wall));
    // a time that does not exist in Sofia (the spring-forward hour) does not round-trip
    if (!iso || sofiaNowWallShifted(Date.parse(iso) - Date.now()) !== String(wall)) return { error: "bad-time" };
    offsetMs = Date.parse(iso) - Date.now();
    if (Math.abs(offsetMs) > MAX_CLOCK_SHIFT_MS) return { error: "too-far" };
    // never back before what the round's chain already holds — every later step would
    // then be «before» an earlier one
    const newest = chainNewestMs(scheme.chain);
    if (newest && Date.now() + offsetMs < newest) return { error: "before-chain", at: new Date(newest).toISOString() };
  }
  await updateSchemeWith(schemeId, () => ({
    testClock: wall === null ? undefined : { offsetMs, setAt: new Date().toISOString(), setBy: actor },
    // a moved clock may try a reminder again — the stamps were the old timeline's
    remindedAt: {},
  }));
  await logActivity("testclock.set", {
    schemeId,
    summary: wall === null ? "Test clock back to the real time" : `Test clock moved to ${wall} (Bulgarian time)`,
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// The reminder job, now (test environment only): the daily cron runs on the real
// portal's deployment, not the test one, so the test environment runs it by hand
// to try a reminder on a moved clock (1.3). Records notices only — held, as ever.
export async function runRemindersNowAction(): Promise<{ ok: true; raised: number } | { error: "not-test" }> {
  await requireCapAnywhere("scheme.edit"); // the role model (2.4)
  if (!isTestEnvironment()) return { error: "not-test" };
  const r = await raiseDueReminders();
  await logActivity("notify.run", { summary: `Reminders run by hand in the test environment: ${r.remindersRaised} raised` });
  revalidatePath("/", "layout");
  return { ok: true, raised: r.remindersRaised };
}

export async function confirmChainDispatchAction(schemeId: string): Promise<{ ok?: boolean; error?: string }> {
  await requireCap("dispatch", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  if (!scheme.chain?.stops?.[0]) return { error: "Set the chain order first." };

  // the first stop's laboratory, before the dispatch is recorded (2.3)
  const pre0 = scheme.chain.stops[0];
  const tell0 = pre0.kind === "lab" ? await labToTell(schemeId, pre0.code) : {};
  if (!tell0) return { error: NOT_REACHED };

  // Once only: a second press (or a second tab) must not file the dispatch twice.
  const at = schemeNowIso(scheme); // the round's clock (1.3)
  const out: { first?: ChainStop } = {};
  await updateSchemeWith(schemeId, (s) => {
    if (s.chain?.dispatchedAt || !s.chain?.stops?.[0]) return {};
    out.first = s.chain.stops[0];
    return { chain: { ...s.chain, dispatchedAt: at } };
  });
  const first = out.first;
  if (!first) return { ok: true };
  // The first stop's case file gets the dispatch, dated, and the notice to it waits
  // in «Известия» for a person (part 0.8). A reference-lab stop has no participant
  // account and no case file — the owner deals with that laboratory directly.
  if (first.kind === "lab" && first.code) {
    const actor = (await getRoleContext()).email ?? "";
    await addCaseEvent({
      schemeId, code: first.code, kind: "items_dispatched", at: sofiaDay(at), ref: "device",
      note: `device sent by PTS ${sofiaTime(at)} (calibration chain)`, recordedBy: actor, source: "manual",
    });
    await notifyDeviceMoved(await labAfter(schemeId, first.code, { code: pre0.code, tell: tell0 }), schemeId, scheme.number, first.code);
  }
  await logActivity("chain.dispatched", { schemeId, targetCode: first.code, summary: "Device dispatched to the first stop" });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "page");
  return { ok: true };
}

/**
 * The owner confirms the device is back with PTS. The chain is closed — only once
 * every stop has handed it on (lib/chain.ts returnProblem): a closed chain takes
 * no more steps, so closing it early would strand the stops still open.
 */
export async function confirmChainReturnAction(schemeId: string): Promise<{ ok?: boolean; error?: string }> {
  await requireCap("dispatch", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const at = schemeNowIso(scheme); // the round's clock (1.3)
  const out: { problem: ReturnType<typeof returnProblem> } = { problem: "not-dispatched" };
  await updateSchemeWith(schemeId, (s) => {
    out.problem = returnProblem(s.chain, Date.parse(at));
    if (out.problem || !s.chain) return {};
    return { chain: { ...s.chain, returnedAt: at } };
  });
  if (out.problem === "already") return { ok: true }; // closed already — nothing twice
  if (out.problem) return { error: out.problem };
  await logActivity("chain.returned", { schemeId, summary: "Device returned to PTS — chain closed" });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "page");
  return { ok: true };
}

/**
 * PTS records a stop's arrival or handover itself (part 0.10, N25 / E6.c). A
 * reference laboratory has no account — before the round or after it — and a
 * laboratory may phone instead of pressing its button; without this, one silent
 * stop stalls the whole chain. `at` is when it HAPPENED; `source` is how PTS knows.
 * The rules (in order, not in the future, …) are lib/chain.ts stampProblem, checked
 * against the scheme as it is inside the lock.
 *
 * Stamping sends nothing by itself (Реш. 138, D19). PTS is not notified of what it
 * just did, and the "device on its way" notice to the next laboratory waits in
 * «Известия» until a person releases it. Errors come back as StampProblem codes.
 */
export async function stampChainStopAction(
  schemeId: string,
  input: { stopId: string; what: string; at: string; source: string; note?: string },
): Promise<{ ok?: boolean; error?: string }> {
  await requireCap("dispatch", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme || scheme.type !== "C") return { error: "missing" };
  const what: StampWhat | null = input?.what === "received" || input?.what === "sent" ? input.what : null;
  if (!what) return { error: "missing" };
  const source = input?.source;
  if (!isStampSource(source)) return { error: "source" };
  // Bulgarian wall-clock time, as PTS typed it — whatever zone the browser is in
  const at = sofiaWallToIso(String(input?.at ?? ""));
  if (!at) return { error: "time" };
  const atMs = Date.parse(at);
  const note = String(input?.note ?? "").trim().slice(0, 300) || undefined;
  const actor = (await getRoleContext()).email ?? "";
  const stamp: ChainStamp = { by: "pts", recordedAt: new Date().toISOString(), recordedBy: actor || undefined, source, note };
  const stopId = String(input?.stopId ?? "");

  // on a hand-over, the next stop's laboratory, before the step is recorded (2.3)
  const preIdx = scheme.chain?.stops.findIndex((x) => x.id === stopId) ?? -1;
  const preNext = what === "sent" && preIdx >= 0 ? scheme.chain?.stops[preIdx + 1] : undefined;
  const tellNext = preNext?.kind === "lab" ? await labToTell(schemeId, preNext.code) : {};
  if (!tellNext) return { error: "not-reached" };
  const out: { problem: StampProblem | null; stops: ChainStop[]; index: number } = { problem: "missing", stops: [], index: -1 };
  const offDays = what === "sent" ? await holidaySet() : new Set<string>();
  await updateSchemeWith(schemeId, (s) => {
    out.problem = stampProblem(s.chain, stopId, what, atMs, schemeNowMs(s)); // «not in the future» of the round's clock
    if (out.problem || !s.chain) return {};
    out.stops = applyStamp(s.chain.stops, stopId, what, at, stamp);
    // handed on: its window is kept as it stood (3.4)
    if (what === "sent") out.stops = freezeWindow(s, out.stops, stopId, offDays);
    out.index = out.stops.findIndex((x) => x.id === stopId);
    return { chain: { ...s.chain, stops: out.stops } };
  });
  if (out.problem) return { error: out.problem };
  // The store falls back to memory when the database refuses a write; a step PTS
  // believes it recorded must really be there before anything is filed from it.
  const kept = (await getScheme(schemeId))?.chain?.stops.find((x) => x.id === stopId);
  if ((what === "received" ? kept?.receivedAt : kept?.sentAt) !== at) return { error: "not-saved" };

  // The case files carry the step with its date and time (E6.a). A reference stop
  // has no case file. PTS's own words stay on the stamped stop's step only — never
  // on another laboratory's.
  const stop = out.stops[out.index];
  const how = stampSourceLabel(source, "en");
  const byPts = ` (calibration chain) — recorded by PTS, ${how}`;
  if (stop.kind === "lab" && stop.code) {
    await addCaseEvent({
      schemeId, code: stop.code, kind: what === "received" ? "receipt_confirmed" : "other", at: sofiaDay(at), ref: "device",
      note: `device ${what === "received" ? "received" : "handed on"} ${sofiaTime(at)}${byPts}${note ? `: ${note}` : ""}`,
      recordedBy: actor, source: "manual",
    });
  }
  if (what === "sent") {
    const next = out.stops[out.index + 1];
    if (next?.kind === "lab" && next.code) {
      await addCaseEvent({
        schemeId, code: next.code, kind: "items_dispatched", at: sofiaDay(at), ref: "device",
        note: `device sent on to this laboratory ${sofiaTime(at)}${byPts}`, recordedBy: actor, source: "manual",
      });
      await notifyDeviceMoved(await labAfter(schemeId, next.code, { code: preNext?.code, tell: tellNext }), schemeId, scheme.number, next.code); // held (part 0.8)
    }
  }
  const where = stop.kind === "lab" ? stop.code : "reference laboratory";
  await logActivity("chain.stamped", {
    schemeId, targetCode: stop.code,
    summary: `PTS recorded the device ${what === "received" ? "arriving at" : "leaving"} stop ${out.index + 1} (${where}), ${how}`,
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "page");
  return { ok: true };
}

// Resolve the signed-in laboratory's OWN pending stop in this scheme. Returns the
// stop index, never anything about other stops — the caller cannot use this to
// look further down the chain.
async function myChainStop(schemeId: string): Promise<{ scheme: Scheme; code: string; index: number; log: (action: string, meta: { targetCode: string; summary: string }) => Promise<void> } | null> {
  // a laboratory's account, or a user of its legal entity (5.5 review: the participation's
  // page shows the chain to both, so both may say the device arrived or went on) — each for
  // its own participations, in the round only: one refused, annulled or withdrawn is no stop
  // of the device (5.1)
  const ls = await getLabSession();
  const ps = ls ? null : await getParticipantSession().catch(() => null);
  if (!ls && !ps) return null;
  const scheme = await getScheme(schemeId);
  // started schemes only (Реш. 147)
  if (!scheme?.chain?.stops?.length || !isStarted(scheme)) return null;
  let codes: Set<string>;
  if (ls) {
    codes = new Set((await listVisibleParticipations(ls.lab.id)).filter((p) => p.schemeId === schemeId && inRound(p)).map((p) => p.code));
  } else {
    const own = new Set((await participationsOf(ps!)).filter((p) => p.schemeId === schemeId).map((p) => p.participantId));
    codes = new Set((await listParticipants(schemeId)).filter((p) => own.has(p.id) && inRound(p)).map((p) => p.code));
  }
  if (!codes.size) return null;
  // the earliest stop of ours that has not yet handed the device on
  const index = scheme.chain.stops.findIndex((s) => s.kind === "lab" && s.code && codes.has(s.code) && !s.sentAt);
  if (index === -1) return null;
  // on record as the account that pressed it — a laboratory's or the entity user's (1.9)
  const log = async (action: string, meta: { targetCode: string; summary: string }) => {
    if (ls) await logActivity(action, { schemeId, ...meta });
    else await logAs({ kind: "lab", userId: ps!.user.id }, action, { schemeId, ...meta, after: { by: `entityuser:${ps!.user.id}` } });
  };
  return { scheme, code: scheme.chain.stops[index].code!, index, log };
}

/**
 * The laboratory confirms the device arrived. THIS is what unlocks the next
 * address for it — the order was already the owner's decision, so re-typing an
 * address at every hop would be a chore rather than a choice.
 *
 * The signed protocol is attached separately (the existing "protocol" slot), and
 * deliberately does not gate this: nothing blocks anything.
 */
// The device travels while the scheme is open or running — not once processing has
// started, nor in a scheme closed or not held (3.2).
const chainOpen = (st: string) => st === "draft" || st === "open" || st === "running";

export async function labConfirmDeviceReceiptAction(schemeId: string): Promise<{ ok?: boolean; error?: string }> {
  const mine = await myChainStop(schemeId);
  if (!mine) return { error: "no-stop" };
  if (!chainOpen(mine.scheme.status)) return { error: "closed" };
  const stopId = mine.scheme.chain!.stops[mine.index].id;
  const at = schemeNowIso(mine.scheme); // the round's clock (1.3)
  // The same rules as PTS's own stamp (lib/chain.ts stampProblem, "lab"), decided
  // inside the lock: not before the device has left PTS, not out of turn, not after
  // the chain closed — a press too early would freeze this stop ahead of the others.
  const out: { problem: StampProblem | null } = { problem: "missing" };
  await updateSchemeWith(schemeId, (s) => {
    out.problem = stampProblem(s.chain, stopId, "received", Date.parse(at), schemeNowMs(s), "lab");
    if (out.problem || !s.chain) return {};
    return { chain: { ...s.chain, stops: applyStamp(s.chain.stops, stopId, "received", at, { by: "lab", recordedAt: new Date().toISOString() }) } };
  });
  if (out.problem === "already") return { ok: true }; // already confirmed (perhaps by PTS)
  if (out.problem) return { error: out.problem };
  await addCaseEvent({
    schemeId, code: mine.code, kind: "receipt_confirmed", at: sofiaDay(at), ref: "device",
    note: `device received ${sofiaTime(at)} (calibration chain)`, source: "auto",
  });
  await notifyChainReceipt(schemeId, mine.scheme.number, mine.code);
  await mine.log("chain.received", { targetCode: mine.code, summary: `${mine.code} confirmed the device arrived` });
  revalidatePath("/lab", "page");
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

/** "Предадох уреда" — this laboratory has sent it on to the next stop. */
export async function labHandOverDeviceAction(schemeId: string): Promise<{ ok?: boolean; error?: string }> {
  const mine = await myChainStop(schemeId);
  if (!mine) return { error: "no-stop" };
  if (!chainOpen(mine.scheme.status)) return { error: "closed" };
  const stop = mine.scheme.chain!.stops[mine.index];

  // the next stop's laboratory, before the hand-over is recorded (2.3)
  const preNext = mine.scheme.chain!.stops[mine.index + 1];
  const tellNext = preNext?.kind === "lab" ? await labToTell(schemeId, preNext.code) : {};
  if (!tellNext) return { error: "not-reached" };
  const at = schemeNowIso(mine.scheme); // the round's clock (1.3)
  const out: { problem: StampProblem | null; next?: ChainStop } = { problem: "missing" };
  const offDays = await holidaySet();
  await updateSchemeWith(schemeId, (s) => {
    out.problem = stampProblem(s.chain, stop.id, "sent", Date.parse(at), schemeNowMs(s), "lab");
    if (out.problem || !s.chain) return {};
    out.next = s.chain.stops[s.chain.stops.findIndex((x) => x.id === stop.id) + 1];
    // handed on: its window is kept as it stood (3.4)
    return { chain: { ...s.chain, stops: freezeWindow(s, applyStamp(s.chain.stops, stop.id, "sent", at, { by: "lab", recordedAt: new Date().toISOString() }), stop.id, offDays) } };
  });
  if (out.problem === "already") return { ok: true }; // already handed on (perhaps by PTS)
  if (out.problem) return { error: out.problem };
  const next = out.next;

  // Both case files carry the step, dated and timed (E6.a): this laboratory let the
  // device go, the next one has it coming — by code, never naming the sender.
  await addCaseEvent({
    schemeId, code: mine.code, kind: "other", at: sofiaDay(at), ref: "device",
    note: `device handed on ${sofiaTime(at)} (calibration chain)`, source: "auto",
  });
  if (next?.kind === "lab" && next.code) {
    await addCaseEvent({
      schemeId, code: next.code, kind: "items_dispatched", at: sofiaDay(at), ref: "device",
      note: `device sent on to this laboratory ${sofiaTime(at)} (calibration chain)`, source: "auto",
    });
    await notifyDeviceMoved(await labAfter(schemeId, next.code, { code: preNext?.code, tell: tellNext }), schemeId, mine.scheme.number, next.code);
  }
  await notifyChainHandover(schemeId, mine.scheme.number, mine.code, !next);
  await mine.log("chain.handed_over", { targetCode: mine.code, summary: `${mine.code} handed the device on` });
  revalidatePath("/lab", "page");
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// ── «Текстове на напомнянията» (part 1.8, Реш. 138) ──────────────────────────
// PTS approves the words of each automatic reminder once; an approved reminder
// then goes out by itself, an unapproved one waits in /notices for a person. A
// manager's act, journalled with the very words saved or approved. Both forms name
// the version the manager saw.
const asReminderKind = (v: FormDataEntryValue | null): ReminderKind | null =>
  (REMINDER_KINDS as readonly string[]).includes(String(v ?? "")) ? (String(v) as ReminderKind) : null;
const TEXTS_PAGE = "/notices/texts";

export async function saveReminderTemplateAction(formData: FormData): Promise<void> {
  await requireCapAnywhere("library.manage"); // the role model (2.4)
  const kind = asReminderKind(formData.get("kind"));
  const seen = Number(formData.get("version"));
  if (!kind || !Number.isInteger(seen)) redirect(`${TEXTS_PAGE}?error=bad`);
  const by = (await getRoleContext()).email ?? "build";
  const was = await getReminderTemplate(kind);
  const r = await saveReminderTemplate(kind, String(formData.get("bg") ?? "").trim(), String(formData.get("en") ?? "").trim(), by, seen);
  if (!r.ok) redirect(`${TEXTS_PAGE}?error=${r.error}`);
  await logActivity("template.saved", {
    subject: `template:${kind}`,
    before: { version: was.version, bg: was.bg, en: was.en },
    after: { version: r.template.version, bg: r.template.bg, en: r.template.en },
    summary: `Reminder text ${kind} v${r.template.version} saved (not approved yet): БГ «${r.template.bg}» EN «${r.template.en}»` });
  revalidatePath(TEXTS_PAGE);
  redirect(`${TEXTS_PAGE}?saved=1`);
}

export async function approveReminderTemplateAction(formData: FormData): Promise<void> {
  await requireCap("texts.approve"); // the role model (2.4)
  const kind = asReminderKind(formData.get("kind"));
  const seen = Number(formData.get("version"));
  if (!kind || !Number.isInteger(seen)) redirect(`${TEXTS_PAGE}?error=bad`);
  const by = (await getRoleContext()).email ?? "build";
  const r = await approveReminderTemplate(kind, by, seen);
  if (!r.ok) redirect(`${TEXTS_PAGE}?error=${r.error}`);
  await logActivity("template.approved", { subject: `template:${kind}`, after: { approvedVersion: r.template.version }, summary: `Reminder text ${kind} v${r.template.version} approved — reminders now go out by themselves: БГ «${r.template.bg}» EN «${r.template.en}»` });
  // a message template is a system setting: in the change register (rule 7)
  await recordSettingChange({
    title: `Текст на напомнянето ${kind} v${r.template.version} одобрен`,
    what: `БГ «${r.template.bg}» · EN «${r.template.en}»`,
    validation: "Seen by the approver on «Текстове на напомнянията», with an example as the laboratory will see it, before approving.",
    ref: `template:${kind}@v${r.template.version}`, by,
  });
  revalidatePath(TEXTS_PAGE);
  redirect(`${TEXTS_PAGE}?approved=1`);
}

// A setting of the system changed in the portal (rule 7): in the change register, as
// made — the person who saved it, having seen it, is its authorisation. Never the
// name of a laboratory (an account is named by its id, §4.2).
async function settingChanged(title: string, what: string, ref: string): Promise<void> {
  await recordSettingChange({ title, what, validation: "Done on its own page by the person named, who saw the change before saving it.", ref, by: (await getRoleContext()).email ?? "build" });
}

// ── «Регистър на промените» (part 1.11, Реш. 67, rule 7) ──────────────────────
// A manager proposes a release (with its commit) or an update; the head of the PT
// provider authorises or rejects it — before it is put to use: the build gate
// deploys to production only an authorised commit. Journalled.
const CHANGES_PAGE = "/changes";

// on a deployment the register is kept only with login on: «build» authorises nothing
async function registerOpen(): Promise<boolean> {
  return !(dbMode().strict && !(await getRoleContext()).authEnabled);
}

export async function proposeChangeAction(formData: FormData): Promise<void> {
  await requireCap("register.propose"); // the role model (2.4)
  if (!(await registerOpen())) redirect(`${CHANGES_PAGE}?error=login`);
  const p = {
    kind: String(formData.get("kind") ?? ""), title: String(formData.get("title") ?? "").trim(),
    what: String(formData.get("what") ?? "").trim(), validation: String(formData.get("validation") ?? "").trim(),
    ref: String(formData.get("ref") ?? "").trim().toLowerCase(),
  };
  const problem = proposalProblem(p);
  if (problem) redirect(`${CHANGES_PAGE}?error=${problem}`);
  const by = (await getRoleContext()).email ?? "build";
  const e = await proposeChange({ kind: p.kind as "release" | "update", title: p.title, what: p.what, validation: p.validation, ref: p.ref || undefined, by });
  await logActivity("change.proposed", { subject: `change:${e.id}`, summary: `${e.kind === "release" ? "Release" : "Update"} proposed: «${e.title}»${e.ref ? ` (${e.ref})` : ""}` });
  revalidatePath(CHANGES_PAGE);
  redirect(`${CHANGES_PAGE}?proposed=1`);
}

export async function decideChangeAction(formData: FormData): Promise<void> {
  await requireCap("register.authorise"); // the role model (2.4)
  if (!(await registerOpen())) redirect(`${CHANGES_PAGE}?error=login`);
  const ctx = await getRoleContext();
  // the head of the PT provider authorises (with login on); locally, the build persona
  if (ctx.authEnabled && !(await isEffectiveHead(ctx.email))) redirect(`${CHANGES_PAGE}?error=head`);
  const id = String(formData.get("id") ?? "");
  const raw = formData.get("decision");
  const to = raw === "authorise" ? "authorised" : raw === "reject" ? "rejected" : null;
  if (!id || !to) redirect(`${CHANGES_PAGE}?error=bad`);
  const by = ctx.email ?? "build";
  // two people: the one who proposed is never the one who decides — except on a
  // local server with no database, where login is off and everyone is «build»
  const localSelf = !ctx.authEnabled && !getDb();
  if (!localSelf && (await listChanges(500)).find((x) => x.id === id)?.requestedBy === by) redirect(`${CHANGES_PAGE}?error=self`);
  const e = await decideChange(id, to, by, String(formData.get("reason") ?? "").trim() || undefined, { localSelf });
  if (!e) redirect(`${CHANGES_PAGE}?error=changed`);
  const what = `«${e.title}»${e.ref ? ` (${e.ref})` : ""}`;
  if (to === "authorised") await logActivity("change.authorised", { subject: `change:${id}`, summary: `Authorised: ${what}` });
  else await logActivity("change.rejected", { subject: `change:${id}`, summary: `Rejected: ${what}${e.reason ? ` — ${e.reason}` : ""}` });
  revalidatePath(CHANGES_PAGE);
  redirect(`${CHANGES_PAGE}?${to}=1`);
}

// ── Held notices to laboratories (Реш. 138, part 0.8) ────────────────────────
// Every notice to a laboratory waits in /notices until a member of PTS has seen
// its exact text and released it — or decided it is not to be sent. A writer's
// act (an auditor only reads); journalled with who decided.
export async function decideNoticeAction(formData: FormData): Promise<void> {
  await requireCapAnywhere("docs.release"); // the role model (2.4)
  const id = String(formData.get("id") ?? "");
  // …in the scheme the notice is about: a notice of another scheme is not theirs, and
  // one that cannot be found (or read) is decided by nobody
  const notice = id ? await getNotice(id).catch(() => null) : null;
  if (!notice || !(await mayNow("docs.release", notice.schemeId))) redirect("/notices");
  const raw = formData.get("decision");
  // only an explicit decision counts — anything else changes nothing
  const decision = raw === "release" || raw === "withhold" ? raw : null;
  const by = (await getRoleContext()).email ?? "build";
  const changed = id && decision ? await decideNotice(id, decision, by) : false;
  if (changed && decision === "release") await logActivity("notice.released", { subject: `notice:${id}`, summary: "Notice to a laboratory released («Изпрати»)" });
  if (changed && decision === "withhold") await logActivity("notice.withheld", { subject: `notice:${id}`, summary: "Notice to a laboratory withheld" });
  revalidatePath("/notices");
  redirect("/notices");
}


// ── The lifecycle (part 3.2; Zadanie §3, §11; О9 / Реш. 129, 140) ─────────────
// The scheme moves between its states only by an ACT, the scheme manager's (the
// provider's decision, by the Order), each on record with who and when; the
// stages the portal reflects but does not perform are ticked, dated, by the role
// responsible. lib/lifecycle-model holds the rules.

export type LifecycleResult = { ok: true } | { error: string };

const ACT_REFUSAL = Object.fromEntries(Object.entries(ACT_PROBLEM_TEXT).map(([k, v]) => [k, `${v.bg} · ${v.en}`])) as Record<ActProblem, string>;

export async function lifecycleActAction(schemeId: string, actRaw: string, noteRaw?: string): Promise<LifecycleResult> {
  await requireCap("scheme.edit", schemeId); // the scheme manager's acts (2.4)
  if (!isActKey(actRaw)) return { error: "Bad request." };
  const act: ActKey = actRaw;
  const note = String(noteRaw ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏﻿�]/g, "").trim();
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  // a calibration scheme's processing: every participant through the chain (§11) — every
  // one still in the round (a refused, annulled or withdrawn one never gets the device, 5.1)
  const codes = act === "process" && scheme.type === "C" ? (await listParticipants(schemeId)).filter((p) => inFinalRound(scheme, p)).map((p) => p.code) : undefined;
  // processing waits for the coding: none on the final list without its code (5.3 review)
  if (act === "process" && codeMoment(scheme) === "coding-act" && (await listParticipants(schemeId)).some((p) => inFinalRound(scheme, p) && isProvisional(p.code))) return { error: CODING_REFUSAL.uncoded };
  // the first announcement: how many are in the round, against the scheme's minimum —
  // kept with the act; below it, the scheme runs by PTS's decision, on record (5.2)
  let inRoundNow: number | undefined;
  if (act === "announce") {
    try { inRoundNow = (await listParticipants(schemeId)).filter(inRound).length; } catch { return { error: NOT_REACHED }; }
  }
  let minAt = scheme.minParticipants;
  // the second announcement settles the final list — only through its own form (5.2)
  if (act === "announce2") return { error: ANNOUNCE_REFUSAL["use-form"] };
  const first = actProblem(scheme, act, note, codes);
  if (first) return { error: ACT_REFUSAL[first] };
  const by = await actorNow();

  // Who to tell, before anything is recorded (2.3): every participant, when the scheme
  // runs (the first announcement, 5.2), when it is not held (О9) and when the report
  // is issued.
  const tells = act === "announce" || act === "not_held" || act === "report";
  let parts: Awaited<ReturnType<typeof listParticipants>> = [];
  let labOf = new Map<string, string | undefined>();
  if (tells) {
    try {
      // …those in the round: a refused, annulled or withdrawn one is told nothing more (5.1)
      parts = (await listParticipants(schemeId)).filter(inRound);
      labOf = parts.length ? await labIdsFor(schemeId, parts, by) : labOf;
    } catch {
      return { error: NOT_REACHED };
    }
  }

  // The report reaches the participants as an edition of PTS's file (3.0): the file
  // uploaded NOW — the latest edition when it is that file and can be served, else the
  // next edition, kept at the act. Never an earlier draft issued in «Редакции».
  if (act === "report") {
    let frozen: Frozen | null;
    let latest: DocEdition | null;
    try {
      [frozen, latest] = await Promise.all([freezeNow(scheme, "report"), latestEdition(schemeId, "report")]);
    } catch {
      return { error: EDITION_REFUSAL.failed };
    }
    if (!frozen) return { error: ACT_REFUSAL["no-report"] };
    if (!(latest && sameAs(frozen, latest) && (await servable(latest)))) {
      const reason = latest
        ? `Окончателният доклад — издаден с акта «Издай окончателния доклад» (част 3.2): файлът, качен в момента${latest && sameAs(frozen, latest) ? `; ${reissueReason(latest.no)}` : ", а не редакция № " + latest.no}.`
        : "Окончателният доклад — издаден с акта «Издай окончателния доклад» (част 3.2).";
      const r = await issueEdition({ scheme, docKey: "report", frozen, by, reason });
      if (!r.ok) return { error: EDITION_REFUSAL[r.error] ?? "The report could not be kept as an edition." };
      await logActivity("doc.edition", { schemeId, subject: `edition:${r.edition.id}`, summary: `${editionLabel("en", r.edition.no, r.edition.issuedOn)} of “report” issued with the report act` });
    }
  }

  const at = new Date().toISOString();
  const day = sofiaToday(schemeNowMs(scheme));
  let refused: ActProblem | null = "gone"; // stays so if the scheme is not found inside the lock
  let from: SchemeStatus = scheme.status;
  let to: SchemeStatus = scheme.status;
  await updateSchemeWith(schemeId, (cur) => {
    // re-checked inside the lock: of two acts at once (on this instance), only the
    // first stands
    refused = actProblem(cur, act, note, codes);
    if (refused) return {};
    from = cur.status;
    to = actTarget(cur, act);
    minAt = cur.minParticipants;
    const entry: LifecycleAct = { act, from, to, at, by, day, ...(note ? { note } : {}), ...(inRoundNow !== undefined ? { count: { inRound: inRoundNow, min: cur.minParticipants } } : {}) };
    return { status: to, lifecycle: { ...(cur.lifecycle ?? {}), acts: [...(cur.lifecycle?.acts ?? []), entry] } };
  });
  if (refused) return { error: ACT_REFUSAL[refused as ActProblem] };

  await logActivity("scheme.state", {
    schemeId, subject: `scheme:${schemeId}`, before: { status: from }, after: { status: to },
    summary: `${ACTS[act].en}: ${STATE_LABEL[from].en} → ${STATE_LABEL[to].en}${inRoundNow !== undefined ? ` — ${inRoundNow} in the round, minimum ${minAt}${inRoundNow < minAt ? " (BELOW the minimum — runs by decision)" : ""}` : ""}${note ? ` — ${note}` : ""}`,
  });
  // one notice per participation, by its code (never a name)
  for (const p of parts) {
    if (act === "announce") await notifySchemeAnnounced(labOf.get(p.code), schemeId, scheme.number, p.code);
    if (act === "not_held") await notifySchemeNotHeld(labOf.get(p.code), schemeId, scheme.number, p.code);
    if (act === "report") await notifyReportPublished(labOf.get(p.code), schemeId, scheme.number, p.code);
  }
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "layout");
  return { ok: true };
}

// ── The two announcements (plan part 5.2; Zadanie «Двете обявявания»; Реш. 24, 65,
// 66, 129) ──────────────────────────────────────────────────────────────────────
// The FIRST is an act above (lifecycleActAction): it runs — every participation in
// the round told — or it is not held. The SECOND settles which characteristics run
// and so the final list; it is recorded with its act, never changed after (a step
// back and a new first announcement start a new run), and each participation is told
// INDIVIDUALLY, from what it applied for (Реш. 65). Proformas only after it.

const ANNOUNCE_REFUSAL = {
  ...Object.fromEntries(Object.entries(ANNOUNCEMENT_PROBLEM_TEXT).map(([k, v]) => [k, `${v.bg} · ${v.en}`])),
  "use-form": "Второто обявяване се прави от формата му — по кои характеристики и окончателният списък. · The second announcement is made from its form — which characteristics run, and the final list.",
} as Record<keyof typeof ANNOUNCEMENT_PROBLEM_TEXT | "use-form", string>;

export async function secondAnnouncementAction(schemeId: string, input: { runs?: unknown; note?: unknown }): Promise<{ ok: true; late?: number } | { error: string }> {
  await requireCap("scheme.edit", schemeId); // the scheme manager's act (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const note = String(input?.note ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏﻿�]/g, "").trim();
  const first = actProblem(scheme, "announce2", note);
  if (first) return { error: ACT_REFUSAL[first] };
  // which characteristics run — only the scheme's own; a scheme without characteristics
  // (calibration) settles the list alone
  const n = scheme.parameters.length;
  const runs = n && Array.isArray(input?.runs)
    ? [...new Set((input.runs as unknown[]).map((x) => Number(x)))].filter((i) => Number.isInteger(i) && i >= 0 && i < n).sort((a, b) => a - b)
    : [];
  if (n && !runs.length) return { error: ANNOUNCE_REFUSAL.runs };
  const by = await actorNow();

  // who is on the list, and who to tell — before anything is recorded (2.3)
  let parts: Awaited<ReturnType<typeof listParticipants>>;
  let labOf: Map<string, string | undefined>;
  try {
    parts = (await listParticipants(schemeId)).filter(inRound);
    labOf = parts.length ? await labIdsFor(schemeId, parts, by) : new Map();
  } catch {
    return { error: NOT_REACHED };
  }
  const listed: FinalList = n ? finalListOf(parts, runs, n) : { runs: [], dropped: [], participants: parts.map((p) => p.id) };
  if (!listed.participants.length) return { error: ANNOUNCE_REFUSAL["final-list"] };
  // the characteristics by their stable ids too (3.6) — the places are what the counts use
  const idOf = (i: number) => scheme.parameters[i]?.id;
  const final: FinalList = { ...listed, ...(n ? { runIds: listed.runs.map(idOf).filter((x): x is string => !!x), droppedIds: listed.dropped.map(idOf).filter((x): x is string => !!x) } : {}) };
  const sig = paramsSignature(scheme.parameters);

  const at = new Date().toISOString();
  const day = sofiaToday(schemeNowMs(scheme));
  let refused: ActProblem | null = "gone";
  let changed = false;
  await updateSchemeWith(schemeId, (cur) => {
    // re-checked inside the lock: of two at once, only the first stands
    refused = actProblem(cur, "announce2", note);
    if (refused) return {};
    // the characteristics the list names, as they were read — changed meanwhile, refused (5.2 review)
    if (paramsSignature(cur.parameters) !== sig) { changed = true; return {}; }
    const entry: LifecycleAct = { act: "announce2", from: cur.status, to: cur.status, at, by, day, ...(note ? { note } : {}), final };
    return { lifecycle: { ...(cur.lifecycle ?? {}), acts: [...(cur.lifecycle?.acts ?? []), entry] } };
  });
  if (changed) return { error: ANNOUNCE_REFUSAL.changed };
  if (refused) return { error: ACT_REFUSAL[refused as ActProblem] };

  const label = (i: number) => ({ bg: characteristicLabel(scheme.parameters[i], "bg"), en: characteristicLabel(scheme.parameters[i], "en") });
  await logActivity("scheme.state", {
    schemeId, subject: `scheme:${schemeId}`, before: { status: scheme.status }, after: { status: scheme.status },
    summary: `${ACTS.announce2.en}: ${final.participants.length} of ${parts.length} participation(s) on the final list${n ? ` — running: ${final.runs.map((i) => label(i).en).join("; ")}${final.dropped.length ? `; dropped: ${final.dropped.map((i) => label(i).en).join("; ")}` : ""}` : ""}${note ? ` — ${note}` : ""}`,
  });
  // one notice per participation, by its code — from what IT applied for (Реш. 65)
  const onList = new Set(final.participants);
  for (const p of parts) {
    const own = n ? splitFor(p, final.runs, n) : { runs: [], dropped: [] };
    await notifyFinalList(labOf.get(p.code), schemeId, scheme.number, p.code, onList.has(p.id), own.runs.map(label), own.dropped.map(label));
  }
  // an application entered while the list was being made is off it and was told nothing:
  // said to PTS, and on record (5.2 review) — a step back makes a list with it
  const late = (await listParticipants(schemeId).catch(() => [])).filter((p) => inRound(p) && !parts.some((q) => q.id === p.id));
  if (late.length) await logActivity("scheme.state", { schemeId, subject: `scheme:${schemeId}`, summary: `Second announcement: ${late.length} participation(s) entered while it was made — not on the final list (${late.map((p) => p.code).join(", ")})` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "layout");
  return late.length ? { ok: true, late: late.length } : { ok: true };
}

// ── The coding act (plan part 5.3; Zadanie «Кодиране», stage 9; А2; Реш. 124; D17) ─────
// After applications close, the coding expert codes the participations on the final
// list: each still under its provisional reference draws, AT RANDOM, a laboratory number
// never given in the scheme — and its objects, from the batch's objects for participants.
// Once, on record (which reference became which code — coded data, no name). Who to tell
// is found first; the record is written first, so an act that stops half-way is applied
// again by pressing again — never drawn again.

const CODING_REFUSAL = Object.fromEntries(Object.entries(CODING_PROBLEM_TEXT).map(([k, v]) => [k, `${v.bg} · ${v.en}`])) as Record<CodingProblem, string>;

export async function codingAction(schemeId: string): Promise<{ ok: true; coded: number } | { error: string }> {
  await requireCap("results.enter", schemeId); // the coding expert's (Реш. 93; stage 9)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const by = await actorNow();
  let parts: Awaited<ReturnType<typeof listParticipants>>;
  let events: Awaited<ReturnType<typeof listCaseEventsForScheme>>;
  try { [parts, events] = await Promise.all([listParticipants(schemeId), listCaseEventsForScheme(schemeId)]); } catch { return { error: NOT_REACHED }; }

  // an act whose follow-up did not finish (its case events, notices): completed — nothing drawn again
  const assigned = new Set(events.filter((e) => e.kind === "code_assigned" && !e.voidedAt).map((e) => e.code));
  const left = unfinished(scheme.coding, parts, assigned);
  if (left.length) {
    let byCode: Map<string, string | undefined>;
    try { byCode = await labIdsFor(schemeId, parts.filter((p) => left.some((l) => l.id === p.id)), by); } catch { return { error: NOT_REACHED }; }
    await afterCoding(scheme, left.map((l) => ({ id: l.id, ref: l.ref })), Object.fromEntries(left.map((l) => [l.ref, l.code])), Object.fromEntries(left.map((l) => [l.code, l.objects])), new Map(left.map((l) => [l.ref, byCode.get(l.code)])));
    await logActivity("scheme.coding", { schemeId, subject: `scheme:${schemeId}`, summary: `Coding act completed: ${left.length} participation(s) given their case-file step and notice` });
    revalidatePath(`/schemes/${schemeId}`, "layout");
    revalidatePath("/lab", "layout");
    return { ok: true, coded: left.length };
  }

  const problem = codingProblem(scheme, parts);
  if (problem) return { error: CODING_REFUSAL[problem] };
  const todo = toCode(scheme, parts);
  const prefix = schemePrefix(scheme.number);
  if (!prefix) return { error: CODING_REFUSAL.prefix };
  // every code the scheme holds — taken before anything moves (a list read from memory moves with it)
  const heldBefore = parts.map((p) => p.code);
  const targets = todo.map((p) => ({ id: p.id, ref: p.code }));
  // the codes: drawn at random from the numbers never given in the scheme
  const codes = drawCodes(prefix, heldBefore, todo.length, uniformBelow);
  if (!codes) return { error: CODING_REFUSAL.numbers };
  const map = Object.fromEntries(targets.map((x, i) => [x.ref, codes[i]]));
  // the objects (testing): from the drawn batches' objects for participants, never given before
  const list = currentFinalList(scheme)!;
  const n = scheme.parameters.length;
  let objects: Record<string, string[]> = {};
  if (scheme.type === "T") {
    const given = objectsGiven(scheme.coding);
    const pool = (scheme.batches ?? []).flatMap((b) => b.objects.filter((o) => o.role === "participant" && !given.has(o.code)).map((o) => o.code));
    if (pool.length) {
      const need = todo.map((p) => objectsNeeded(list.runs ? finalSelectionsOf(p, { runs: list.runs }, n) : selectionsOf(p, n), "T"));
      const drawn = drawObjects(pool, need, uniformBelow);
      if (!drawn) return { error: CODING_REFUSAL.objects };
      objects = Object.fromEntries(targets.map((x, i) => [map[x.ref], drawn[i]]));
    }
  }
  // who to tell — before anything is recorded (2.3)
  let labOf: Map<string, string | undefined>;
  try { labOf = await labIdsFor(schemeId, todo, by); } catch { return { error: NOT_REACHED }; }

  // the act, WHOLE or not at all (0040): the record, the scheme's own records under the
  // new codes, each participation with its notices and case events
  const at = new Date().toISOString();
  const day = sofiaToday(schemeNowMs(scheme));
  const record: CodingRecord = { id: randomUUID(), at, by, day, codes: map, ids: Object.fromEntries(targets.map((x) => [x.ref, x.id])), ...(Object.keys(objects).length ? { objects } : {}) };
  const done = await commitCoding(schemeId, record, (cur) => (cur.lifecycle?.stages?.["9"] ? {} : {
    // stage 9 is done by the act
    lifecycle: { ...(cur.lifecycle ?? {}), stages: { ...(cur.lifecycle?.stages ?? {}), "9": { at, by, day, note: `Кодиране: ${targets.length} участия` } } },
  }), by);
  if (!done.ok) {
    if (done.problem === "failed") console.warn("[coding] not recorded:", done.message);
    return { error: CODING_REFUSAL[done.problem === "failed" ? "failed" : "twice"] };
  }
  await afterCoding(scheme, targets, map, objects, labOf);
  const total = Object.values(objects).reduce((a, o) => a + o.length, 0);
  await logActivity("scheme.coding", {
    schemeId, subject: `scheme:${schemeId}`,
    summary: `Coding act: ${targets.length} participation(s) coded at random from ${MAX_LAB_NUMBER - numbersTaken(prefix, heldBefore).size} free numbers${total ? `; ${total} object(s) drawn at random` : "; no objects drawn (no batch with objects for participants)"}`,
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "layout");
  return { ok: true, coded: targets.length };
}

/** After the codes are on the participations: each one's objects, its «code assigned»
 *  event and status, and its notice — by the NEW code. */
async function afterCoding(scheme: Scheme, targets: { id: string; ref: string }[], map: Record<string, string>, objects: Record<string, string[]>, labOf: Map<string, string | undefined>): Promise<void> {
  const day = await roundDay(scheme.id);
  for (const { id, ref } of targets) {
    if (!Object.hasOwn(map, ref)) continue;
    const code = map[ref];
    const objs = objects[code] ?? [];
    const sample = sampleCodeOf(objs);
    if (sample) await updateParticipant(id, { sampleCode: sample }).catch(() => null);
    await addCaseEvent({ schemeId: scheme.id, code, kind: "code_assigned", at: day, source: "auto" });
    await advanceStatusForEvent(scheme.id, code, "code_assigned");
    await notifyCoded(labOf.get(ref), scheme.id, scheme.number, code, objs);
  }
}

const TICK_REFUSAL = Object.fromEntries(Object.entries(TICK_PROBLEM_TEXT).map(([k, v]) => [k, `${v.bg} · ${v.en}`])) as Record<keyof typeof TICK_PROBLEM_TEXT, string>;

/** Tick a stage done (or withdraw the tick), dated, by the role responsible. */
export async function stageTickAction(schemeId: string, no: number, done: boolean, noteRaw?: string): Promise<LifecycleResult> {
  const def = stageDef(Number(no));
  if (!def || !("tick" in def.way)) return { error: TICK_REFUSAL.stage };
  const ticker = def.way.tick;
  const viewer = await getViewer();
  const me = viewer.email?.trim().toLowerCase();
  // the processing acts (2.5, Реш. 140): this act's own capability, the person the
  // current designation names for it — while that designation holds — and never one's
  // own processing or review unless the designation allows it, with its justification
  let designation: Awaited<ReturnType<typeof designationStatus>>["current"] = null;
  if ("cap" in ticker) {
    await requireCap(ticker.cap, schemeId);
  } else {
    await requireCap(ticker.designated === "processor" ? "results.process" : ticker.designated === "reviewer" ? "review" : "approve", schemeId);
    const st = await designationStatus(schemeId);
    designation = st.current;
    if (!viewer.build) {
      if (!(designation && me && designation[ticker.designated] === me)) return { error: TICK_REFUSAL.who };
      if (st.problems.length) return { error: TICK_REFUSAL.stale };
    }
  }
  const note = String(noteRaw ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏﻿�]/g, "").trim();
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const by = await actorNow();
  const at = new Date().toISOString();
  const day = sofiaToday(schemeNowMs(scheme));
  const key = String(def.no);
  // results recorded by PTS count as much as a laboratory's upload (stage 4 below)
  const reported = def.no === 4 && done ? (await listParticipants(schemeId)).filter((p) => p.status === "submitted" || p.status === "scored").length > 0 : false;
  let refused: string | null = "Scheme not found."; // stays so if the scheme is not found inside the lock
  let before: StageTick | undefined;
  await updateSchemeWith(schemeId, (cur) => {
    refused = null;
    before = cur.lifecycle?.stages?.[key];
    const p = done ? tickProblem(cur, def.no, note) : untickProblem(cur, def.no);
    if (p) { refused = TICK_REFUSAL[p]; return {}; }
    // not one's own processing or review (Реш. 140), unless designated so with a reason
    if (done && !viewer.build && me && designation) {
      const by = (n: number) => cur.lifecycle?.stages?.[String(n)]?.by?.trim().toLowerCase();
      const allowed = (c: "process-review" | "process-approve" | "review-approve") => designation!.coincide.includes(c);
      if ((def.no === 15 && by(14) === me && !allowed("process-review"))
        || (def.no === 16 && ((by(14) === me && !allowed("process-approve")) || (by(15) === me && !allowed("review-approve"))))) {
        refused = TICK_REFUSAL.self;
        return {};
      }
    }
    const stages = { ...(cur.lifecycle?.stages ?? {}) };
    if (done) {
      // the design approved after a result arrived does not prove the criteria came
      // first — said on the tick itself, not hidden (stage 4)
      const results = reported || Object.values(cur.labUploads ?? {}).some((u) => !!u?.results);
      stages[key] = { at, by, day, ...(note ? { note } : {}), ...(def.no === 4 && results ? { afterResults: true } : {}) };
    } else {
      delete stages[key];
    }
    return { lifecycle: { ...(cur.lifecycle ?? {}), stages } };
  });
  if (refused) return { error: refused };
  await logActivity("scheme.stage", {
    schemeId, subject: `scheme:${schemeId}`, before: before ? { ...before } : undefined, after: done ? { stage: def.no, day, note } : undefined,
    summary: `${done ? "Stage ticked" : "Tick withdrawn"}: ${def.no}. ${def.en}${note ? ` — ${note}` : ""}`,
  });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// ── Amendments to a running scheme (part 3.3; Zadanie §3; Реш. 154) ───────────
// The head's order of amendment, entered by the head: its number and date, the
// reason, the amended points, the new deadlines, the assessment of the consequences
// for validity. The plan and the invitation it names go out again as editions
// «Изменение № … от … по Заповед № … от …; заменя редакцията от …» — the earlier ones
// stay — and the participants are told (through the send control, 1.8).

export async function recordAmendmentAction(schemeId: string, input: AmendmentInput): Promise<{ ok: true; no: number; incomplete?: string } | { error: string }> {
  await requireCap("order.manage", schemeId); // the head's order (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const checked = checkAmendment(scheme, input);
  if (!checked.ok) { const t = AMENDMENT_PROBLEM_TEXT[checked.problem]; return { error: `${t.bg} · ${t.en}` }; }
  const v = checked.value;
  const by = await actorNow();
  const at = new Date().toISOString();
  const day = sofiaToday(schemeNowMs(scheme));

  // each document it re-issues must have something in it — refused before anything
  // is recorded
  try {
    for (const doc of v.docs) {
      if (!(await freezeNow(scheme, doc))) return { error: `“${getDoc(doc)?.nameBg ?? doc}” е празен — няма какво да се издаде. · “${getDoc(doc)?.nameEn ?? doc}” is empty — there is nothing to issue.` };
    }
  } catch {
    return { error: EDITION_REFUSAL.failed };
  }

  // who to tell, before anything is recorded (2.3) — only those in the round, so no
  // identity is opened for one told nothing more (5.1)
  let parts: Awaited<ReturnType<typeof listParticipants>>;
  let labOf: Map<string, string | undefined>;
  try {
    parts = (await listParticipants(schemeId)).filter(inRound);
    labOf = parts.length ? await labIdsFor(schemeId, parts, by) : new Map();
  } catch {
    return { error: NOT_REACHED };
  }

  // FIRST the amendment itself, in the lock — its number reserved, the new deadlines
  // applied — and only then its editions: an edition never names an amendment that is
  // not on record (the 3.3 review)
  const id = randomUUID();
  let no = 0;
  let refused: string | null = "Scheme not found.";
  let datesBefore: Partial<Record<string, string>> = {};
  await updateSchemeWith(schemeId, (cur) => {
    refused = null;
    if (!checkAmendment(cur, input).ok) { refused = `${AMENDMENT_PROBLEM_TEXT.state.bg} · ${AMENDMENT_PROBLEM_TEXT.state.en}`; return {}; }
    no = nextAmendmentNo(cur.amendments);
    datesBefore = { ...(cur.dates ?? {}) };
    const amendment: Amendment = {
      id, no, orderNo: v.orderNo, orderDate: v.orderDate, reason: v.reason, points: v.points, validity: v.validity,
      ...(Object.keys(v.dates).length ? { dates: v.dates, datesBefore: Object.fromEntries(Object.keys(v.dates).map((k) => [k, cur.dates?.[k as keyof NonNullable<Scheme["dates"]>] ?? ""])) } : {}),
      ...(v.docs.length ? { pending: v.docs } : {}),
      day, at, by,
    };
    return {
      amendments: [...(cur.amendments ?? []), amendment],
      ...(Object.keys(v.dates).length ? { dates: { ...(cur.dates ?? {}), ...v.dates } } : {}),
    };
  });
  if (refused) return { error: refused };

  const head = { no, day, orderNo: v.orderNo, orderDate: v.orderDate, reason: v.reason, points: v.points };
  await logActivity("scheme.amendment", {
    schemeId, subject: `scheme:${schemeId}`, before: { dates: datesBefore }, after: { dates: { ...datesBefore, ...v.dates }, reissues: v.docs },
    summary: `${amendmentLine("en", head)} — ${v.reason}${Object.keys(v.dates).length ? ` · new deadlines: ${Object.entries(v.dates).map(([k, d]) => `${k} ${d}`).join(", ")}` : ""}${v.docs.length ? ` · re-issued: ${v.docs.join(", ")}` : ""}`,
  });
  const issued = await issueAmendmentEditions(schemeId, id, by);
  // the participants are told at once (Zadanie §3) — by code, through the send control
  // …only those in the round: a refused, annulled or withdrawn one is told nothing more (5.1)
  for (const p of parts) await notifySchemeAmended(labOf.get(p.code), schemeId, scheme.number, p.code, amendmentLine("bg", head), amendmentLine("en", head));
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "layout");
  return issued.left.length
    ? { ok: true, no, incomplete: `Изменение № ${no} е записано, но не се издаде: ${issued.left.join(", ")} — довършете го от «Изменения». · Amendment No. ${no} is recorded, but not issued: ${issued.left.join(", ")} — complete it from «Amendments».` }
    : { ok: true, no };
}

/** Issue the documents an amendment still has to issue — each the next edition with the
 *  amendment's line — and record them on it; where the participants had been sent the
 *  document, they now hold the new edition. Stops at the first failure: what is left
 *  stays pending, to be completed. */
async function issueAmendmentEditions(schemeId: string, amendmentId: string, by: string): Promise<{ left: string[] }> {
  const scheme = await getScheme(schemeId);
  const a = scheme?.amendments?.find((x) => x.id === amendmentId);
  if (!scheme || !a) return { left: [] };
  const left = [...(a.pending ?? [])];
  while (left.length) {
    const doc = left[0];
    let frozen: Frozen | null, latest: DocEdition | null;
    try {
      [frozen, latest] = await Promise.all([freezeNow(scheme, doc), latestEdition(schemeId, doc)]);
    } catch { break; }
    if (!frozen) break;
    const replaces = latest ? { issuedOn: latest.issuedOn } : undefined;
    const note = amendmentNote(a, replaces);
    const r = await issueEdition({ scheme, docKey: doc, frozen, by, reason: note.reason, scope: note.scope, amendment: { bg: amendmentLine("bg", a, replaces), en: amendmentLine("en", a, replaces) } });
    if (!r.ok) break;
    const entry = { id: r.edition.id, no: r.edition.no, ...(latest ? { replaces: { no: latest.no, issuedOn: latest.issuedOn } } : {}) };
    await updateSchemeWith(schemeId, (cur) => {
      const list = (cur.amendments ?? []).map((x) => x.id !== amendmentId ? x : {
        ...x, editions: { ...(x.editions ?? {}), [doc]: entry }, pending: (x.pending ?? []).filter((d) => d !== doc),
      });
      // the participants now hold the amended edition of what they had been sent — every
      // one: to all, and each release to one participation or one user (5.4 review)
      const sent = !!cur.sentToParticipants?.[doc];
      const now = new Date().toISOString();
      const active = (cur.releases ?? []).filter((x) => x.docKey === doc && !x.withdrawnAt);
      return {
        amendments: list,
        ...(sent ? { releasedEditions: { ...(cur.releasedEditions ?? {}), [doc]: { id: r.edition.id, no: r.edition.no, at: now } } } : {}),
        ...(active.length ? { releases: [
          ...(cur.releases ?? []).map((x) => (x.docKey === doc && !x.withdrawnAt ? { ...x, withdrawnAt: now, withdrawnBy: `amendment:${amendmentId}` } : x)),
          ...active.map((x) => ({ ...x, id: randomUUID(), editionId: r.edition.id, editionNo: r.edition.no, at: now, by, withdrawnAt: undefined, withdrawnBy: undefined })),
        ] } : {}),
      };
    });
    await logActivity("doc.edition", { schemeId, subject: `edition:${r.edition.id}`, summary: `${editionLabel("en", r.edition.no, r.edition.issuedOn)} of “${doc}” issued — ${amendmentLine("en", a, replaces)}` });
    left.shift();
  }
  return { left };
}

/** Complete an amendment a file failure left with documents not issued. */
export async function completeAmendmentAction(schemeId: string, amendmentId: string): Promise<{ ok: true } | { error: string }> {
  await requireCap("order.manage", schemeId);
  const scheme = await getScheme(schemeId);
  const a = scheme?.amendments?.find((x) => x.id === String(amendmentId));
  if (!scheme || !a) return { error: "Not found." };
  if (!a.pending?.length) return { ok: true };
  const r = await issueAmendmentEditions(schemeId, a.id, await actorNow());
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return r.left.length ? { error: `Не се издаде: ${r.left.join(", ")}. Опитайте пак. · Not issued: ${r.left.join(", ")}. Try again.` } : { ok: true };
}

// ── Deadlines (part 3.4; Zadanie §9, §11; Реш. 154; О6) ──────────────────────

/** A calibration scheme's window per laboratory, in working days from its receipt.
 *  Set while the scheme is being prepared — once opened, a laboratory's window moves
 *  only by an individual extension with its order. */
export async function setChainWindowAction(schemeId: string, days: number): Promise<{ ok?: boolean; error?: string }> {
  await requireCap("dispatch", schemeId); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  if (scheme.type !== "C") return { error: "Only calibration schemes have a chain." };
  if (needsAmendment(scheme)) return { error: "Прозорецът се определя, докато схемата се подготвя; след отварянето — индивидуално удължаване със заповед. · The window is set while the scheme is prepared; once open — an individual extension with its order." };
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 1 || n > 60) return { error: "Между 1 и 60 работни дни. · Between 1 and 60 working days." };
  const before = scheme.chain?.windowWorkDays;
  let opened = false;
  await updateSchemeWith(schemeId, (s) => {
    if (needsAmendment(s)) { opened = true; return {}; } // opened meanwhile
    return { chain: { stops: s.chain?.stops ?? [], ...(s.chain ?? {}), windowWorkDays: n } };
  });
  if (opened) return { error: "Схемата беше отворена междувременно — прозорецът вече не се сменя. · The scheme was opened meanwhile — the window no longer changes." };
  await logActivity("scheme.window", { schemeId, subject: `scheme:${schemeId}`, before: { windowWorkDays: before ?? null }, after: { windowWorkDays: n }, summary: `Calibration window: ${n} working days from each laboratory's receipt` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "page");
  return { ok: true };
}

/** An individual extension of one participant's deadline — the results deadline, or a
 *  calibration laboratory's window — granted with its order (the head's: «Удължаване
 *  на срок … минава със заповед за изменение, а не с имейл», О6). By code. */
export async function grantExtensionAction(schemeId: string, code: string, input: ExtensionInput): Promise<{ ok: true } | { error: string }> {
  await requireCap("order.manage", schemeId); // the head's order (2.4)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  // the code must be a real participation in THIS scheme — never trust the form
  if (!(await listParticipants(schemeId)).some((p) => p.code === code)) return { error: "No such participant in this scheme." };
  // the key cleaned once, and read the same way by every check below (3.4 review)
  const key = extensionKey(input.key);
  if (!key) { const t = EXTENSION_PROBLEM_TEXT.key; return { error: `${t.bg} · ${t.en}` }; }
  input = { ...input, key };
  const off = await holidaySet();
  // a window's: the stop the laboratory holds now, else its latest — its own window
  const stopOf = (s: Scheme) => {
    const mine = (s.chain?.stops ?? []).filter((x) => x.kind === "lab" && x.code === code && x.receivedAt);
    return mine.find((x) => !x.sentAt) ?? mine[mine.length - 1];
  };
  const current = (s: Scheme) => {
    if (key !== "chain") return resultsDeadline(s, code).at;
    const stop = stopOf(s);
    return stop ? chainWindow(s, stop, off)?.due : undefined;
  };
  const checked = checkExtension(scheme, input, current(scheme));
  if (!checked.ok) { const t = EXTENSION_PROBLEM_TEXT[checked.problem]; return { error: `${t.bg} · ${t.en}` }; }
  const v = checked.value;
  // a calibration window starts with the receipt: none to extend before it
  if (v.key === "chain" && !current(scheme)) return { error: "Лабораторията още не е получила уреда — прозорецът ѝ не е започнал. · The laboratory has not received the instrument yet — its window has not started." };
  // who it is, before anything is recorded (2.3)
  const tell = await labToTell(schemeId, code);
  if (!tell) return { error: NOT_REACHED };
  const by = await actorNow();
  let refused: string | null = "Scheme not found.";
  let before: string | undefined;
  await updateSchemeWith(schemeId, (cur) => {
    // re-checked inside the lock: the state, and later than the deadline now in force
    before = current(cur);
    const again = checkExtension(cur, input, before);
    if (!again.ok) { const t = EXTENSION_PROBLEM_TEXT[again.problem]; refused = `${t.bg} · ${t.en}`; return {}; }
    const stopId = key === "chain" ? stopOf(cur)?.id : undefined;
    if (key === "chain" && !stopId) { refused = "Лабораторията още не е получила уреда. · The laboratory has not received the instrument yet."; return {}; }
    refused = null;
    const ext: Extension = { id: randomUUID(), code, key: v.key, ...(stopId ? { stopId } : {}), until: v.until, orderNo: v.orderNo, orderDate: v.orderDate, reason: v.reason, day: sofiaToday(schemeNowMs(cur)), at: new Date().toISOString(), by };
    return { extensions: [...(cur.extensions ?? []), ext] };
  });
  if (refused) return { error: refused };
  const what = v.key === "chain" ? "the calibration window" : "the results deadline";
  await logActivity("deadline.extended", {
    schemeId, targetCode: code, subject: `participant:${code}`, before: { until: before ?? null }, after: { until: v.until, orderNo: v.orderNo, orderDate: v.orderDate },
    summary: `${code}: ${what} extended to ${v.until} by Order No. ${v.orderNo} of ${v.orderDate} — ${v.reason}`,
  });
  await notifyDeadlineExtended(tell.labId, schemeId, scheme.number, code, v.key, fmtSchemeDate(v.until), v.orderNo);
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/lab", "layout");
  return { ok: true };
}

/** The holiday calendar (3.4): a day added or removed — a new entry, who and when.
 *  The head's (it counts every calibration window). */
export async function setHolidayAction(dayRaw: string, nameRaw: string, add: boolean): Promise<{ ok: true } | { error: string }> {
  await requireCapAnywhere("order.manage");
  const day = String(dayRaw ?? "").trim();
  const name = String(nameRaw ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g, "").trim();
  const cal = await holidayCalendar();
  const has = cal.find((h) => h.day === day);
  const p = holidayProblem(day, add ? name : has?.name ?? "—");
  if (p) return { error: p === "day" ? "Не е истинска дата. · Not a real date." : "Името е задължително (до 120 знака). · The name is required (120 characters at most)." };
  if (add === !!has) return { error: add ? "Денят вече е в календара. · The day is in the calendar already." : "Денят не е в календара. · The day is not in the calendar." };
  try {
    await recordHoliday({ day, name: add ? name : has!.name, action: add ? "add" : "remove", by: await actorNow() });
  } catch {
    return { error: "Календарът не можа да се запише — опитайте пак. · The calendar could not be saved — try again." };
  }
  await logActivity(add ? "holiday.added" : "holiday.removed", { subject: `holiday:${day}`, after: { day, name: add ? name : has!.name }, summary: `Day off ${add ? "added" : "removed"}: ${day} — ${add ? name : has!.name}` });
  revalidatePath("/holidays");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Add the year's official holidays the calendar does not have yet (lib/holidays-model
 *  officialHolidays) — a proposal PTS has checked on the page before pressing. */
export async function addOfficialHolidaysAction(year: number): Promise<{ ok: true; added: number } | { error: string }> {
  await requireCapAnywhere("order.manage");
  const y = Math.round(Number(year));
  if (!(y >= 2020 && y <= 2099)) return { error: "Година между 2020 и 2099. · A year between 2020 and 2099." };
  // not a day the calendar already decided about — one removed stays removed (3.4 review)
  const have = new Set((await listHolidayEntries()).map((h) => h.day));
  const by = await actorNow();
  let added = 0;
  try {
    for (const h of officialHolidays(y)) {
      if (have.has(h.day)) continue;
      await recordHoliday({ day: h.day, name: h.name, action: "add", by });
      added++;
    }
  } catch {
    return { error: `Записани са ${added}; останалите не — опитайте пак. · ${added} saved; the rest not — try again.` };
  }
  await logActivity("holiday.added", { subject: `holidays:${y}`, after: { year: y, added }, summary: `Official holidays of ${y} added to the calendar: ${added}` });
  revalidatePath("/holidays");
  return { ok: true, added };
}

// ── Batches and their objects (part 3.5; Реш. 151 / А18; D3) ─────────────────
// The technical expert's (items.manage, D18), and the scheme manager who plans them
// (scheme.edit). A testing scheme's only. Nothing is removed: a batch recorded is in
// the record; its objects' roles are drawn once.

export async function createBatchAction(schemeId: string, input: BatchInput): Promise<{ ok: true; id: string } | { error: string }> {
  await requireOneOf(["items.manage", "scheme.edit"], schemeId); // the technical expert, the scheme manager (D18)
  const scheme = await getScheme(schemeId);
  if (!scheme) return { error: "Scheme not found." };
  const first = checkBatch(scheme, input);
  if (!first.ok) { const t = BATCH_PROBLEM_TEXT[first.problem]; return { error: `${t.bg} · ${t.en}` }; }
  const v = first.value;
  const id = randomUUID();
  const by = await actorNow();
  let refused: string | null = "Scheme not found.";
  await updateSchemeWith(schemeId, (cur) => {
    // re-checked inside the lock: an object is in exactly one batch
    const again = checkBatch(cur, input);
    if (!again.ok) { const t = BATCH_PROBLEM_TEXT[again.problem]; refused = `${t.bg} · ${t.en}`; return {}; }
    refused = null;
    const batch: Batch = {
      id, label: v.label, material: v.material, preparedOn: v.preparedOn, storage: v.storage, prefix: v.prefix,
      objects: objectCodes(v.prefix, v.count).map((code) => ({ code })),
      ...(v.hsRecord ? { hsRecord: v.hsRecord } : {}),
      createdAt: new Date().toISOString(), createdBy: by,
    };
    return { batches: [...(cur.batches ?? []), batch] };
  });
  if (refused) return { error: refused };
  await logActivity("batch.created", { schemeId, subject: `batch:${id}`, after: { label: v.label, material: v.material, preparedOn: v.preparedOn, objects: v.count }, summary: `Batch ${v.label}: ${v.count} objects of ${v.material}, prepared ${v.preparedOn}` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/batches");
  return { ok: true, id };
}

/** Draw the objects' roles at random — once (Реш. 151: «избират се на случаен принцип»). */
export async function drawBatchAction(schemeId: string, batchId: string, counts: Partial<Record<ObjectRole, unknown>>): Promise<{ ok: true } | { error: string }> {
  await requireOneOf(["items.manage", "scheme.edit"], schemeId); // the technical expert, the scheme manager (D18)
  const scheme = await getScheme(schemeId);
  const batch = scheme?.batches?.find((b) => b.id === String(batchId));
  if (!scheme || !batch) return { error: "Not found." };
  const by = await actorNow();
  const day = sofiaToday(schemeNowMs(scheme));
  let refused: string | null = "Not found.";
  let drawn: Record<ObjectRole, number> | null = null;
  let drawnObjects: { code: string; role?: ObjectRole }[] = [];
  await updateSchemeWith(schemeId, (cur) => {
    const b = cur.batches?.find((x) => x.id === batch.id);
    if (!b) return {};
    // drawn inside the lock, from the batch as it is now — two presses at once draw once
    const r = drawRoles(b, counts, uniformBelow);
    if (!r.ok) { const t = DRAW_PROBLEM_TEXT[r.problem]; refused = `${t.bg} · ${t.en}`; return {}; }
    refused = null;
    drawn = r.counts;
    drawnObjects = r.objects;
    return { batches: (cur.batches ?? []).map((x) => x.id !== b.id ? x : { ...x, objects: r.objects, draw: { counts: r.counts, at: new Date().toISOString(), by, day } }) };
  });
  if (refused) return { error: refused };
  const c = drawn as Record<ObjectRole, number> | null;
  // which object got which role, on record — a draw is reconstructable from the journal
  const roles = Object.fromEntries(OBJECT_ROLES.map((r) => [r, drawnObjects.filter((o) => o.role === r).map((o) => o.code)]));
  await logActivity("batch.drawn", { schemeId, subject: `batch:${batch.id}`, after: { counts: c, roles }, summary: `Batch ${batch.label}: objects drawn at random — ${OBJECT_ROLES.map((r) => `${r} ${c?.[r] ?? 0}`).join(", ")}` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

/** Add homogeneity values (pasted rows, the contract's columns) to a drawn batch. A
 *  value is added, never replaced: a correction is a further row (the latest of its
 *  series, object, characteristic and replicate counts), the record whole; the same
 *  value pasted again is not added twice. */
export async function addHomogeneityAction(schemeId: string, batchId: string, text: string): Promise<{ ok: true; added: number; same: number } | { error: string }> {
  await requireOneOf(["items.manage", "results.process", "scheme.edit"], schemeId);
  const raw = String(text ?? "");
  if (raw.length > 200_000) return { error: "Твърде много наведнъж — поставете на части. · Too much at once — paste it in parts." };
  const scheme = await getScheme(schemeId);
  const batch = scheme?.batches?.find((b) => b.id === String(batchId));
  if (!scheme || !batch) return { error: "Not found." };
  if (!batch.draw) return { error: "Първо изтеглете обектите на партидата. · Draw the batch's objects first." };
  const by = await actorNow();
  const at = new Date().toISOString();
  const say = (p: Extract<ReturnType<typeof parseHomogeneity>, { ok: false }>) => { const t = HOMOGENEITY_PROBLEM_TEXT[p.problem]; return p.line ? `Ред ${p.line}: ${t.bg}. · Line ${p.line}: ${t.en}.` : `${t.bg}. · ${t.en}.`; };
  const namesOf = (s: Scheme) => s.parameters.map((p) => p.characteristicBg || p.characteristicEn || p.standardBg || "—");
  const idsOf = (s: Scheme) => s.parameters.map((p) => p.id);
  const pre = parseHomogeneity(raw, batch, namesOf(scheme), idsOf(scheme));
  if (!pre.ok) return { error: say(pre) };
  let refused: string | null = "Not found.";
  let added = 0, same = 0;
  await updateSchemeWith(schemeId, (cur) => {
    const b = cur.batches?.find((x) => x.id === batch.id);
    if (!b) return {};
    // read against the characteristic list as it is NOW — a reorder meanwhile is
    // never mixed into the places (3.5 review)
    const parsed = parseHomogeneity(raw, b, namesOf(cur), idsOf(cur));
    if (!parsed.ok) { refused = say(parsed); return {}; }
    refused = null;
    // the values from before the ids get theirs first, so a pasted value is recognised
    // as the same or as a correction (3.6 review)
    const prior = withCharacteristicIds(b.homogeneity, idsOf(cur));
    const fresh = newHomogeneityRows(prior, parsed.rows.map((r) => ({ ...r, at, by })));
    added = fresh.add.length; same = fresh.same;
    if (!added) return {};
    return { batches: (cur.batches ?? []).map((x) => x.id !== b.id ? x : { ...x, homogeneity: [...(prior ?? []), ...fresh.add] }) };
  });
  if (refused) return { error: refused };
  if (added) await logActivity("batch.homogeneity", { schemeId, subject: `batch:${batch.id}`, after: { rows: added, alreadyThere: same }, summary: `Batch ${batch.label}: ${added} homogeneity/stability values entered${same ? ` (${same} already there)` : ""}` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true, added, same };
}

/** A batch's fields corrected — and, until its objects are drawn, how many objects it
 *  has. Each change on record, before and after (3.5 review). */
export async function updateBatchAction(schemeId: string, batchId: string, input: BatchInput): Promise<{ ok: true } | { error: string }> {
  await requireOneOf(["items.manage", "scheme.edit"], schemeId); // the technical expert, the scheme manager (D18)
  const scheme = await getScheme(schemeId);
  const batch = scheme?.batches?.find((b) => b.id === String(batchId));
  if (!scheme || !batch) return { error: "Not found." };
  // a field the form did not carry keeps its value
  const i = (input ?? {}) as Partial<BatchInput>;
  const merged: BatchInput = {
    label: i.label ?? batch.label, material: i.material ?? batch.material, preparedOn: i.preparedOn ?? batch.preparedOn, storage: i.storage ?? batch.storage,
    prefix: i.prefix ?? batch.prefix, count: i.count ?? String(batch.objects.length), hsRecord: batch.hsRecord ?? "",
  };
  let refused: string | null = "Not found.";
  let before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  await updateSchemeWith(schemeId, (cur) => {
    const b = cur.batches?.find((x) => x.id === batch.id);
    if (!b) return {};
    const c = checkBatch(cur, merged, b.id);
    if (!c.ok) { const t = BATCH_PROBLEM_TEXT[c.problem]; refused = `${t.bg} · ${t.en}`; return {}; }
    const v = c.value;
    const recount = v.count !== b.objects.length || v.prefix !== b.prefix;
    // the objects are fixed once their roles are drawn
    if (recount && b.draw) { refused = "Обектите вече са изтеглени — броят и кодовете им не се сменят. · The objects are drawn — their number and codes do not change."; return {}; }
    refused = null;
    before = { label: b.label, material: b.material, preparedOn: b.preparedOn, storage: b.storage, prefix: b.prefix, objects: b.objects.length };
    after = { label: v.label, material: v.material, preparedOn: v.preparedOn, storage: v.storage, prefix: v.prefix, objects: v.count };
    return { batches: (cur.batches ?? []).map((x) => x.id !== b.id ? x : {
      ...x, label: v.label, material: v.material, preparedOn: v.preparedOn, storage: v.storage, prefix: v.prefix,
      ...(recount ? { objects: objectCodes(v.prefix, v.count).map((code) => ({ code })) } : {}),
    }) };
  });
  if (refused) return { error: refused };
  await logActivity("batch.updated", { schemeId, subject: `batch:${batch.id}`, before, after, summary: `Batch ${String(after.label)} corrected` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  revalidatePath("/batches");
  return { ok: true };
}

/** The link to the record of the homogeneity and stability assessment (А18). */
export async function setBatchRecordAction(schemeId: string, batchId: string, record: string): Promise<{ ok: true } | { error: string }> {
  await requireOneOf(["items.manage", "scheme.edit"], schemeId); // the technical expert, the scheme manager (D18)
  const rec = String(record ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g, "").trim().slice(0, 500);
  let before: string | undefined;
  let found = false;
  await updateSchemeWith(schemeId, (cur) => {
    const b = cur.batches?.find((x) => x.id === String(batchId));
    if (!b) return {};
    found = true;
    before = b.hsRecord;
    return { batches: (cur.batches ?? []).map((x) => x.id !== b.id ? x : { ...x, hsRecord: rec || undefined }) };
  });
  if (!found) return { error: "Not found." };
  await logActivity("batch.record", { schemeId, subject: `batch:${batchId}`, before: { hsRecord: before ?? null }, after: { hsRecord: rec || null }, summary: `Batch record of the homogeneity and stability assessment: ${rec || "—"}` });
  revalidatePath(`/schemes/${schemeId}`, "layout");
  return { ok: true };
}

// ── Legal entities (plan part 4.1; Zadanie §8; А13) ─────────────────────────────
// PTS enters a legal entity (from a PDF application — Реш. 145, 4.4), checks it (ЕИК by
// its check digit, VAT by VIES or an attached document, and its own manual tick — each
// FOR the numbers as they are) and sets it active; an entity is never deleted —
// «неактивно» is its end. Names are identity: in the identity store, every opening on
// record (lib/entities). The journal names the fields that changed, never their values.
const ENTITY_FAILED = "Не се записа — опитайте пак. · Could not save — try again.";
/** The database refused for an inactive (or missing) entity: said so — never «try again» (4.2 review). */
const entityRefusal = (e: unknown, text: { bg: string; en: string }) =>
  /inactive|no such entity/i.test(String((e as Error)?.message ?? "")) ? { error: `${text.bg}. · ${text.en}.` } : { error: ENTITY_FAILED };
async function oneEntity(entityId: unknown, actor: string) {
  const id = String(entityId ?? "");
  if (!UUID_RE.test(id)) return null;
  const [e] = await openEntities({ actor, purpose: "write" }, id);
  return e ?? null;
}
/** The entity's checks made for another number, or for a document now replaced, count
 *  for nothing: an active entity without them goes back to «чака проверка» — on record. */
async function demoteIfUnchecked(e: LegalEntity, patch: Partial<LegalEntity>): Promise<Partial<LegalEntity>> {
  const now = { ...e, ...patch };
  const c = entityChecked(now);
  if (now.state === "active" && !(c.registry && c.manual)) {
    await logActivity("entity.state", { subject: `entity:${e.id}`, before: { state: "active" }, after: { state: "pending" }, summary: "Legal entity: active → pending (its checks no longer hold)" });
    return { ...patch, state: "pending" };
  }
  return patch;
}

export async function saveEntityAction(input: { id?: string; name: unknown; country: unknown; eik: unknown; vat: unknown; correspondenceAddress: unknown; officialEmail?: unknown; mol: unknown; language: unknown; shown?: unknown }):
  Promise<{ ok: true; id: string } | { error: string }> {
  await requireCapAnywhere("labs.manage"); // the people of the laboratories (2.4)
  const actor = await actorNow();
  const was = input.id ? await oneEntity(input.id, actor) : null;
  if (input.id && !was) return { error: "Not found." };
  const r = readEntity(input, [], was?.id);
  if (!r.ok) { const t = ENTITY_PROBLEM_TEXT[r.problem]; return { error: `${t.bg}. · ${t.en}.` }; }
  // only what the person changed from what the form showed — a form left open does not
  // undo the laboratory's own changes (4.4 review); the same field changed by both: refused
  const m = was ? changedOnly(r.fields, readShown(input.shown), was) : { patch: r.fields, conflict: [] };
  if (m.conflict.length) return { error: `${CONFLICT_TEXT.bg}. · ${CONFLICT_TEXT.en}.` };
  const eff = { ...(was ?? {}), ...m.patch } as typeof r.fields;
  // one company once — asked narrowly, not by opening every entity (4.1 review)
  try {
    if (await entityKeyTaken(actor, eff.country, eff.eik, was?.id)) return { error: `${ENTITY_PROBLEM_TEXT.duplicate.bg}. · ${ENTITY_PROBLEM_TEXT.duplicate.en}.` };
  } catch { return { error: ENTITY_FAILED }; }
  // a changed number: every check was of another one — VIES, PTS's tick and the
  // document set aside (the document stays in its history; 4.1 review)
  const recheck = !!was && (eikKey(was.eik) !== eikKey(eff.eik) || was.vat !== eff.vat || was.country !== eff.country);
  const id = was?.id ?? randomUUID();
  if (was && !Object.keys(m.patch).length) return { ok: true, id }; // nothing changed
  let patch: Partial<LegalEntity> = { ...m.patch, ...(was ? {} : { origin: "pdf" as const, state: "pending" as const }), ...(recheck ? { vies: undefined, manualCheck: undefined, proofPath: undefined } : {}) };
  if (was && recheck) patch = await demoteIfUnchecked(was, patch);
  try { await putEntity(id, patch, actor); } catch (e) {
    return { error: /duplicate key|unique/i.test(String((e as Error).message)) ? `${ENTITY_PROBLEM_TEXT.duplicate.bg}. · ${ENTITY_PROBLEM_TEXT.duplicate.en}.` : ENTITY_FAILED };
  }
  const changed = was ? entityDiff(was, m.patch) : [];
  // after the laboratory confirmed its data (4.4) the data is the laboratory's: a change by
  // PTS from then on is marked so in the journal
  const afterConfirmation = !!was?.confirmedAt;
  await logActivity(was ? "entity.updated" : "entity.created", { subject: `entity:${id}`, after: was ? { fields: changed, ...(recheck ? { checksReset: true } : {}), ...(afterConfirmation ? { afterConfirmation: true } : {}) } : { created: true }, summary: was ? `Legal entity changed: ${changed.join(", ") || "nothing"}${recheck ? " — checked again from the start" : ""}${afterConfirmation ? " — by PTS, after the laboratory's confirmation" : ""}` : "Legal entity entered (from a PDF application)" });
  revalidatePath("/organizations");
  return { ok: true, id };
}

/** VIES for the entity's VAT number — its answer kept FOR that number, with when. Not
 *  valid, and no document: PTS's tick no longer stands (4.1 review). */
export async function checkEntityViesAction(entityId: string): Promise<{ ok: true; status: string } | { error: string }> {
  await requireCapAnywhere("labs.manage");
  const actor = await actorNow();
  const e = await oneEntity(entityId, actor);
  if (!e) return { error: "Not found." };
  if (!e.vat) return { error: "Няма номер по ДДС — приложете документ. · No VAT number — attach a document." };
  const v = await checkVies(e.vat, e.country);
  // the number may have changed while VIES answered: the answer is for the one asked
  const fresh = await oneEntity(e.id, actor);
  if (!fresh || fresh.vat !== e.vat || fresh.country !== e.country) return { error: "Номерът по ДДС се промени междувременно — проверете отново. · The VAT number changed meanwhile — check again." };
  const vies = { status: v.status, checkedAt: new Date().toISOString(), vat: e.vat, country: e.country, ...(v.name ? { name: v.name } : {}) };
  let patch: Partial<LegalEntity> = { vies };
  if (v.status !== "valid" && !fresh.proofPath && fresh.manualCheck) patch.manualCheck = undefined;
  patch = await demoteIfUnchecked(fresh, patch);
  try { await putEntity(e.id, patch, actor); } catch { return { error: ENTITY_FAILED }; }
  await logActivity("entity.checked", { subject: `entity:${e.id}`, after: { vies: v.status }, summary: `Legal entity: VIES — ${v.status}` });
  revalidatePath("/organizations");
  return { ok: true, status: v.status };
}

/** PTS's own check — the tick, who and when, FOR the numbers and the document as they
 *  are; or taken back. */
export async function setEntityManualCheckAction(entityId: string, checked: boolean, note: string): Promise<{ ok: true } | { error: string }> {
  await requireCapAnywhere("labs.manage");
  const actor = await actorNow();
  const e = await oneEntity(entityId, actor);
  if (!e) return { error: "Not found." };
  const n = Array.from(String(note ?? "").trim()).slice(0, 300).join("");
  if (checked && !entityChecked(e).registry) return { error: "Първо VIES (валиден за този номер) или приложен документ. · First VIES (valid for this number) or an attached document." };
  let patch: Partial<LegalEntity> = { manualCheck: checked ? { by: actor, at: new Date().toISOString(), eik: e.eik, vat: e.vat, country: e.country, ...(e.proofPath ? { proofPath: e.proofPath } : {}), ...(n ? { note: n } : {}) } : undefined };
  if (!checked) patch = await demoteIfUnchecked(e, patch);
  try { await putEntity(e.id, patch, actor); } catch { return { error: ENTITY_FAILED }; }
  await logActivity("entity.checked", { subject: `entity:${e.id}`, after: { manual: checked }, summary: checked ? "Legal entity: checked by PTS" : "Legal entity: PTS's check taken back" });
  revalidatePath("/organizations");
  return { ok: true };
}

/** Active only while checked — the registry and PTS's tick; inactive any time; never deleted. */
export async function setEntityStateAction(entityId: string, to: EntityState): Promise<{ ok: true } | { error: string }> {
  await requireCapAnywhere("labs.manage");
  if (!ENTITY_STATES.includes(to)) return { error: "?" };
  const actor = await actorNow();
  const e = await oneEntity(entityId, actor);
  if (!e) return { error: "Not found." };
  const p = stateProblem(e, to);
  if (p === "same") return { ok: true };
  if (p === "unchecked") return { error: "Активно става след проверката — VIES или документ, и проверката на PTS. · It becomes active after the checks — VIES or a document, and PTS's own." };
  // inactive: its laboratories and users go with it, in the same step (the database's
  // triggers) — how many, on record (4.2 review)
  const goingLabs = to === "inactive" ? (await openLaboratories({ actor, purpose: "write" }, { entityId: e.id })).filter((l) => l.state === "active").length : 0;
  const goingUsers = to === "inactive" ? (await openEntityUsers({ actor, purpose: "write" }, { entityId: e.id })).filter((u) => u.state !== "inactive").length : 0;
  try { await putEntity(e.id, { state: to }, actor); } catch { return { error: ENTITY_FAILED }; }
  await logActivity("entity.state", { subject: `entity:${e.id}`, before: { state: e.state }, after: { state: to, ...(to === "inactive" ? { laboratories: goingLabs, users: goingUsers } : {}) }, summary: `Legal entity: ${e.state} → ${to}${to === "inactive" ? ` — with it ${goingLabs} laboratories and ${goingUsers} users made inactive` : ""}` });
  revalidatePath("/organizations");
  return { ok: true };
}

/** The document attached where VIES cannot say (4.1) — a real PDF, PNG or JPG, in the
 *  private bucket; every document stays in the entity's history; a new one is new
 *  evidence, so PTS's tick is to be made again (4.1 review). */
export async function attachEntityProofAction(formData: FormData): Promise<{ ok: true } | { error: string }> {
  await requireCapAnywhere("labs.manage");
  const actor = await actorNow();
  const e = await oneEntity(formData.get("entityId"), actor);
  if (!e) return { error: "Not found." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Изберете файл. · Choose a file." };
  if (!PROOF_EXT[file.type]) return { error: "PDF, JPG или PNG. · A PDF, JPG or PNG." };
  if (file.size > MAX_PROOF_BYTES) return { error: "Файлът е над 4 MB. · The file is over 4 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!magicMatches(bytes, file.type)) return { error: "Това не е истински PDF, JPG или PNG. · That file isn't a real PDF, JPG or PNG." };
  let path: string;
  try { path = await storeProof({ bytes, mime: file.type }); } catch { return { error: ENTITY_FAILED }; }
  const history = [...(e.proofHistory ?? []), { path, at: new Date().toISOString(), by: actor }];
  let patch: Partial<LegalEntity> = { proofPath: path, proofHistory: history, ...(e.manualCheck ? { manualCheck: undefined } : {}) };
  patch = await demoteIfUnchecked(e, patch);
  try { await putEntity(e.id, patch, actor); } catch {
    await removeProof(path); // not kept without its record
    return { error: ENTITY_FAILED };
  }
  await logActivity("entity.checked", { subject: `entity:${e.id}`, after: { proof: history.length, replaced: !!e.proofPath }, summary: e.proofPath ? `Legal entity: its document replaced — no. ${history.length}; the earlier ones stay in its history` : "Legal entity: a document attached" });
  revalidatePath("/organizations");
  return { ok: true };
}

// ── Laboratories (plan part 4.2; Zadanie §8 «Лаборатория») ───────────────────────
// Several per legal entity: the name as on the accreditation certificate, the delivery
// address, «мобилен офис», the accreditation number (information only, Реш. 108). In
// the identity store; never deleted — «неактивна» is its end. The journal names the
// fields that changed, never their values.
export async function saveLaboratoryAction(input: { id?: string; entityId: string; name: unknown; deliveryAddress: unknown; mobileOffice: unknown; accreditationNo: unknown; accreditationBody?: unknown; shown?: unknown }):
  Promise<{ ok: true; id: string } | { error: string }> {
  await requireCapAnywhere("labs.manage"); // the people of the laboratories (2.4)
  const actor = await actorNow();
  const r = readLaboratory(input);
  if (!r.ok) { const t = LABORATORY_PROBLEM_TEXT[r.problem]; return { error: `${t.bg}. · ${t.en}.` }; }
  let was: Laboratory | undefined;
  if (input.id) {
    if (!UUID_RE.test(String(input.id))) return { error: "Not found." };
    [was] = await openLaboratories({ actor, purpose: "write" }, { laboratoryId: String(input.id) });
    if (!was) return { error: "Not found." };
  } else if (!UUID_RE.test(String(input.entityId ?? ""))) { const t = LABORATORY_PROBLEM_TEXT.entity; return { error: `${t.bg}. · ${t.en}.` }; }
  // the entity's state is the database's to hold (laboratories_rules) — not read here by
  // opening the entity (4.2 review); its refusal said in words
  const id = was?.id ?? randomUUID();
  // only what the person changed from what the form showed (4.4 review)
  const m = was ? changedOnly(r.fields, readShown(input.shown), was) : { patch: r.fields, conflict: [] };
  if (m.conflict.length) return { error: `${CONFLICT_TEXT.bg}. · ${CONFLICT_TEXT.en}.` };
  if (was && !Object.keys(m.patch).length) return { ok: true, id }; // nothing changed
  try { await putLaboratory(id, was ? m.patch : { ...r.fields, entityId: String(input.entityId), state: "active" }, actor); }
  catch (e) { return entityRefusal(e, LABORATORY_PROBLEM_TEXT.entity); }
  const changed = was ? laboratoryDiff(was, m.patch) : [];
  await logActivity(was ? "laboratory.updated" : "laboratory.created", { subject: `laboratory:${id}`, after: was ? { fields: changed } : { entity: String(input.entityId) }, summary: was ? `Laboratory changed: ${changed.join(", ") || "nothing"}` : "Laboratory added to a legal entity" });
  revalidatePath("/organizations");
  return { ok: true, id };
}

/** Active or inactive — never deleted. A laboratory comes back only under an entity that is not inactive. */
export async function setLaboratoryStateAction(laboratoryId: string, to: LaboratoryState): Promise<{ ok: true } | { error: string }> {
  await requireCapAnywhere("labs.manage");
  if (to !== "active" && to !== "inactive") return { error: "?" };
  if (!UUID_RE.test(String(laboratoryId))) return { error: "Not found." };
  const actor = await actorNow();
  const [l] = await openLaboratories({ actor, purpose: "write" }, { laboratoryId: String(laboratoryId) });
  if (!l) return { error: "Not found." };
  if (l.state === to) return { ok: true };
  try { await putLaboratory(l.id, { state: to }, actor); } catch (e) { return entityRefusal(e, LABORATORY_PROBLEM_TEXT.entity); }
  await logActivity("laboratory.state", { subject: `laboratory:${l.id}`, before: { state: l.state }, after: { state: to }, summary: `Laboratory: ${l.state} → ${to}` });
  revalidatePath("/organizations");
  return { ok: true };
}

// ── A legal entity's users (plan part 4.3; Реш. 112; К5) ─────────────────────────
// PTS enters the people of an entity: login e-mail, name, position (information only),
// phone, the profile's administrator or a user, two-factor sign-in required or not.
// «поканен» until the invitation is accepted (4.4). Every user sees all the entity's
// laboratories (К5). The entity keeps an active administrator; never deleted. The
// journal names the fields that changed, never their values.
export async function saveEntityUserAction(input: { id?: string; entityId: string; email: unknown; name: unknown; position: unknown; phone: unknown; role: unknown; twoFactorRequired: unknown; receivesNotices?: unknown; shown?: unknown }):
  Promise<{ ok: true; id: string } | { error: string }> {
  await requireCapAnywhere("labs.manage"); // the people of the laboratories (2.4)
  const actor = await actorNow();
  const say = (k: keyof typeof ENTITY_USER_PROBLEM_TEXT) => ({ error: `${ENTITY_USER_PROBLEM_TEXT[k].bg}. · ${ENTITY_USER_PROBLEM_TEXT[k].en}.` });
  const r = readEntityUser(input);
  if (!r.ok) return say(r.problem);
  // a participant has a login of its own — never one of PTS's people (2.2, 1.6), by the
  // mailbox, nor a laboratory account of the earlier portal; a lookup that fails
  // refuses (4.3 review)
  try {
    if (await providerMailbox(r.fields.email)) return say("staff");
    if ((await labEmailInUse(r.fields.email)) || (await labEmailInUse(mailboxKey(r.fields.email)))) return say("lab-account");
  } catch { return { error: ENTITY_FAILED }; }
  let was: EntityUser | undefined;
  let entityId = String(input.entityId ?? "");
  if (input.id) {
    if (!UUID_RE.test(String(input.id))) return { error: "Not found." };
    [was] = await openEntityUsers({ actor, purpose: "write" }, { userId: String(input.id) });
    if (!was) return { error: "Not found." };
    entityId = was.entityId;
  } else if (!UUID_RE.test(entityId)) return say("entity");
  try { if (await userEmailTaken(actor, r.fields.email, was?.id)) return say("taken"); } catch { return { error: ENTITY_FAILED }; }
  // the database holds the rest (0033): the first user while the entity has no active
  // administrator is its administrator; an active administrator kept; a changed login
  // unlinked and «поканен» again unless inactive (4.3 review)
  const id = was?.id ?? randomUUID();
  // only what the person changed from what the form showed (4.4 review)
  const m = was ? changedOnly(r.fields, readShown(input.shown), was) : { patch: r.fields, conflict: [] };
  if (m.conflict.length) return { error: `${CONFLICT_TEXT.bg}. · ${CONFLICT_TEXT.en}.` };
  if (was && !Object.keys(m.patch).length) return { ok: true, id }; // nothing changed
  try { await putEntityUser(id, was ? m.patch : { ...r.fields, entityId, state: "invited" }, actor); }
  catch (e) { return /administrator/.test(String((e as Error).message)) ? say("last-admin") : /duplicate key|unique/i.test(String((e as Error).message)) ? say("taken") : entityRefusal(e, ENTITY_USER_PROBLEM_TEXT.entity); }
  const [now] = await openEntityUsers({ actor, purpose: "write" }, { userId: id });
  const changed = was ? entityUserDiff(was, m.patch) : [];
  const emailChanged = !!was && "email" in m.patch && was.email !== r.fields.email;
  // the old sign-in account of a changed login is closed — it never signs in, nor is it
  // linked to anyone again (4.4 review)
  const closed = emailChanged && was?.authUserId ? await closeSignInAccount(was.authUserId) : undefined;
  await logActivity(was ? "entityuser.updated" : "entityuser.created", { subject: `entityuser:${id}`, after: was ? { fields: changed, ...(emailChanged ? { signInUnlinked: true } : {}), ...(closed !== undefined ? { oldSignInClosed: closed } : {}) } : { entity: entityId, role: now?.role ?? r.fields.role }, summary: was ? `Participant's user changed: ${changed.join(", ") || "nothing"}${emailChanged ? " — its sign-in unlinked" : ""}` : `Participant's user entered — ${(now?.role ?? r.fields.role) === "admin" ? "profile administrator" : "user"}` });
  // a state that changed with it — its own entry
  if (was && now && now.state !== was.state) await logActivity("entityuser.state", { subject: `entityuser:${id}`, before: { state: was.state }, after: { state: now.state }, summary: `Participant's user: ${was.state} → ${now.state} (a changed login is invited again)` });
  revalidatePath("/organizations");
  return { ok: true, id };
}

/** A sign-in account no longer any user's: closed for good (banned — nothing deleted).
 *  true closed; false could not be (it is unlinked all the same: no session of it is a
 *  participant's). */
async function closeSignInAccount(authUserId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return true; // memory: no sign-in accounts
  const { error } = await db.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" }).catch((e) => ({ error: e as Error }));
  if (error) console.warn("[entity-users] the old sign-in account was not closed:", error.message);
  return !error;
}

/** Is this address one of PTS's people — a founder, the head, a team member or a
 *  shared mailbox — by the mailbox («ivanov+lab@» reaches ivanov@)? Throws when it
 *  cannot say (4.3 review). */
async function providerMailbox(email: string): Promise<boolean> {
  const k = mailboxKey(email);
  if (isSharedMailbox(email) || [email, k].some((e) => isProviderHead(e) || isFounder(e) || isOwnerEmail(e))) return true;
  return (await staffEmailInUse(email)) || (await staffEmailInUse(k));
}

/** Inactive — or back: active once its sign-in exists, else invited. Never deleted; the
 *  entity keeps an active administrator. */
export async function setEntityUserStateAction(userId: string, to: "active" | "inactive"): Promise<{ ok: true } | { error: string }> {
  await requireCapAnywhere("labs.manage");
  if (to !== "active" && to !== "inactive") return { error: "?" };
  if (!UUID_RE.test(String(userId))) return { error: "Not found." };
  const actor = await actorNow();
  const [u] = await openEntityUsers({ actor, purpose: "write" }, { userId: String(userId) });
  if (!u) return { error: "Not found." };
  const next = to === "inactive" ? "inactive" : u.authUserId ? "active" : "invited";
  if (u.state === next) return { ok: true };
  // the entity keeps an active administrator — the database's rule (0033), said in words
  try { await putEntityUser(u.id, { state: next }, actor); } catch (e) { return /administrator/.test(String((e as Error).message)) ? { error: `${ENTITY_USER_PROBLEM_TEXT["last-admin"].bg}. · ${ENTITY_USER_PROBLEM_TEXT["last-admin"].en}.` } : entityRefusal(e, ENTITY_USER_PROBLEM_TEXT.entity); }
  await logActivity("entityuser.state", { subject: `entityuser:${u.id}`, before: { state: u.state }, after: { state: next }, summary: `Participant's user: ${u.state} → ${next}` });
  revalidatePath("/organizations");
  return { ok: true };
}

// ── A profile from a PDF application (plan part 4.4; Реш. 145; К23; Реш. 152) ──────
// PTS invites each user of an entity it entered from the PDF application — the
// laboratory's invitation text (1.8), shown before «Изпрати» and on record before it
// goes. The user sets a password (the invitation accepted); the profile's
// administrator reviews, completes and confirms the data — once, when and who on
// record; from then the data is the laboratory's. At the confirmation the notice goes
// to the entity's official e-mail (К23) with the link to M4 (Реш. 152).

/** «Изпрати поканата» to a participant's user — the text the person saw, or nothing. */
export async function inviteEntityUserAction(userId: string, textKey: string): Promise<{ ok: true } | { error: string }> {
  await requireCapAnywhere("labs.manage"); // the people of the laboratories (2.4)
  const shown = invitePreview();
  if (typeof textKey !== "string" || textKey !== shown.key) return { error: "Текстът на поканата е променен — отворете я отново. · The invitation's text has changed — open it again." };
  if (!UUID_RE.test(String(userId))) return { error: "Not found." };
  const actor = await actorNow();
  const [u] = await openEntityUsers({ actor, purpose: "send" }, { userId: String(userId) });
  if (!u) return { error: "Not found." };
  if (u.state !== "invited") return { error: "Канят се само поканени потребители — този вече е приел поканата или е неактивен. · Only an invited user is invited — this one has accepted, or is inactive." };
  // still not one of PTS's people, nor an earlier laboratory account — asked again at
  // the send; a lookup that fails refuses
  const say = (k: keyof typeof ENTITY_USER_PROBLEM_TEXT) => ({ error: `${ENTITY_USER_PROBLEM_TEXT[k].bg}. · ${ENTITY_USER_PROBLEM_TEXT[k].en}.` });
  try {
    if (await providerMailbox(u.email)) return say("staff");
    if ((await labEmailInUse(u.email)) || (await labEmailInUse(mailboxKey(u.email)))) return say("lab-account");
  } catch { return { error: ENTITY_FAILED }; }
  // the notice of the confirmation goes to the official e-mail PTS entered from the PDF
  // application (К23) — never to one the confirming person types (4.4 review)
  const [ent] = await openEntities({ actor, purpose: "send" }, u.entityId);
  if (!ent || ent.state === "inactive") return { error: `${ENTITY_USER_PROBLEM_TEXT.entity.bg}. · ${ENTITY_USER_PROBLEM_TEXT.entity.en}.` };
  if (!ent.officialEmail) return { error: "Първо въведете официалния e-mail на юридическото лице от заявката — там отива уведомлението при потвърждението (К23). · First enter the legal entity's official e-mail from the application — the notice of the confirmation goes there (К23)." };
  const by = (await getRoleContext()).email ?? "build";
  const sent = await sendParticipantInvite(u, { by, ref: `invite:${shown.key}` }, actor);
  if ("error" in sent) return sent;
  await logActivity("entityuser.invited", { subject: `entityuser:${u.id}`, after: { entity: u.entityId }, summary: "Participant's user invited (the portal's invitation)" });
  revalidatePath("/organizations");
  return { ok: true };
}

/** The invitation through the portal's own mailer only (1.7–1.8) — its steps in
 *  lib/participant-invite: a new sign-in account, or a new link to the one this user
 *  was linked to before (never another's), linked BEFORE the e-mail, the e-mail on
 *  record first. */
async function sendParticipantInvite(u: EntityUser, approval: Approval, actor: string): Promise<{ ok: true } | { error: string }> {
  if (!mailAllowedHere(u.email)) return { error: "Тестова среда: канят се само адреси @ptsbg.eu. · Test environment: only @ptsbg.eu addresses are invited." };
  const db = getDb();
  const h = await headers();
  const origin = siteOrigin(h.get("host") ?? "", h.get("x-forwarded-proto") ?? "https");
  if (!db || !isMailConfigured() || !origin) return { error: "Поканите тръгват само през пощата на портала (1.7) — тя още не е настроена. · Invitations go only through the portal's own mail, which is not set up yet." };
  try {
    return await inviteParticipant(u, {
      generateLink: async (type, email) => {
        const r = await db.auth.admin.generateLink({ type, email });
        return { authId: r.data?.user?.id, token: r.data?.properties?.hashed_token, error: r.error?.message };
      },
      link: (userId, authId) => linkEntityUserAccount(userId, authId, actor),
      linkFor: (token, type) => inviteLink(origin, token, type),
      send: (link) => sendToLab({ class: "provider", kind: "invite", entityId: u.entityId, to: u.email, subject: testSubject(INVITE_SUBJECT), body: inviteText(link), secrets: [link] }, approval),
    });
  } catch {
    return { error: "Поканата не тръгна — опитайте пак. · The invitation was not sent — try again." };
  }
}

/** The laboratory's own (4.4): save what it completed — or, the profile's
 *  administrator, save and CONFIRM (once). Only what the person changed from what the
 *  page showed is written (4.4 review). The notice of a confirmation goes to the
 *  official e-mail PTS entered (К23), with the M4 link (Реш. 152) — on record, sent or
 *  not, and PTS can send it again. */
export async function saveProfileAction(input: Record<string, unknown>, confirm: boolean):
  Promise<{ ok: true; confirmedAt?: string; notice?: "sent" | "not-sent" } | { error: string }> {
  const ps = await requireParticipant(); // a participant's user, active, its entity not inactive
  const { user, entity } = ps;
  const actor = participantActor(user.id);
  const admin = user.role === "admin";
  const say = (t: { bg: string; en: string }) => ({ error: `${t.bg}. · ${t.en}.` });
  if (confirm && !admin) return { error: "Потвърждава администраторът на профила. · The profile's administrator confirms." };
  // the M4 section must be there to link to on the real portal (Реш. 152)
  if (confirm && !privacyUrl() && process.env.NODE_ENV === "production" && !isTestEnvironment()) return { error: "Разделът за личните данни (М4) още не е свързан — потвърждението чака PTS. · The privacy section (M4) is not linked yet — the confirmation waits for PTS." };
  if (confirm && !entity.officialEmail) return say(COMPLETION_PROBLEM_TEXT["official-email-required"]);
  const labs = admin ? (await openLaboratories({ actor, purpose: "lab.own" }, { entityId: entity.id })).filter((l) => l.state === "active") : [];
  const r = readCompletion(input ?? {}, { admin, labIds: labs.map((l) => l.id), confirm: !!confirm });
  if (!r.ok) {
    if (r.problem === "lab" && r.labProblem) {
      const lab = labs.find((l) => l.id === r.lab);
      const t = LABORATORY_PROBLEM_TEXT[r.labProblem];
      return { error: `${lab?.name ?? ""}: ${t.bg}. · ${t.en}.` };
    }
    return say(COMPLETION_PROBLEM_TEXT[r.problem]);
  }
  const c = r.value;
  // only what the person changed from what the page showed; refused where someone else
  // changed the same field meanwhile (4.4 review)
  const shown = readShown(input?.shown) ?? {};
  const sub = (k: string) => readShown((shown as Record<string, unknown>)[k]);
  const ent = c.entity ? changedOnly(c.entity, sub("entity"), entity) : { patch: {}, conflict: [] };
  const labPatches = c.laboratories.map((l) => ({ id: l.id, ...changedOnly(l.fields, readShown(sub("laboratories")?.[l.id]), labs.find((x) => x.id === l.id)!) }));
  const own = changedOnly(c.own, sub("own"), user);
  if (ent.conflict.length || own.conflict.length || labPatches.some((l) => l.conflict.length)) return say(CONFLICT_TEXT);
  const changed = [...Object.keys(ent.patch), ...new Set(labPatches.flatMap((l) => Object.keys(l.patch).map((k) => `laboratory.${k}`))), ...Object.keys(own.patch).map((k) => `own.${k}`)];
  try {
    if (Object.keys(ent.patch).length) await putEntity(entity.id, ent.patch, actor);
    for (const l of labPatches) if (Object.keys(l.patch).length) await putLaboratory(l.id, l.patch, actor);
    if (Object.keys(own.patch).length) await putEntityUser(user.id, own.patch, actor);
  } catch (e) { return entityRefusal(e, ENTITY_USER_PROBLEM_TEXT.entity); }
  const whoId = user.authUserId ?? "dev-persona"; // the sign-in account; a persona has none
  if (changed.length) await logAs({ kind: "lab", userId: whoId }, "profile.saved", { subject: `entity:${entity.id}`, after: { fields: changed, by: `entityuser:${user.id}` }, summary: `The laboratory completed its data: ${changed.join(", ")}` });
  let out: { ok: true; confirmedAt?: string; notice?: "sent" | "not-sent" } = { ok: true };
  if (confirm) {
    let conf: { confirmedAt: string; nowConfirmed: boolean };
    try { conf = await confirmEntity(entity.id, user.id, actor); }
    catch (e) {
      const m = String((e as Error)?.message ?? "");
      if (/official e-mail/.test(m)) return say(COMPLETION_PROBLEM_TEXT["official-email-required"]);
      if (/administrator/.test(m)) return { error: "Потвърждава активният администратор на профила. · The profile's active administrator confirms." };
      return entityRefusal(e, ENTITY_USER_PROBLEM_TEXT.entity);
    }
    out = { ok: true, confirmedAt: conf.confirmedAt };
    if (conf.nowConfirmed) {
      const sent = await sendConfirmationNotice(entity, { name: (own.patch.name as string | undefined) ?? user.name }, conf.confirmedAt, fixedApproval(PROFILE_CONFIRMED_KEY), "triggered");
      out.notice = sent ? "sent" : "not-sent";
      await logAs({ kind: "lab", userId: whoId }, "profile.confirmed", { subject: `entity:${entity.id}`, after: { by: `entityuser:${user.id}`, notice: sent ? "sent" : "not sent" }, summary: `The laboratory confirmed its data (from a PDF application, Реш. 145); the notice to the official e-mail ${sent ? "sent" : "NOT sent"}` });
    }
  }
  revalidatePath("/lab/confirm");
  revalidatePath("/organizations");
  return out;
}

/** К23: the organisation told of the confirmation, at the official e-mail PTS entered —
 *  on record whether or not it could go (no mail here, the test environment, a bad
 *  address: recorded «failed»), so PTS sees it and can send it again. */
async function sendConfirmationNotice(entity: LegalEntity, by: { name: string }, confirmedAt: string, approval: Approval, cls: "triggered" | "provider"): Promise<boolean> {
  const msg = {
    class: cls, kind: "profile.confirmed", entityId: entity.id, to: entity.officialEmail, subject: testSubject(PROFILE_CONFIRMED_SUBJECT),
    body: profileConfirmedText({ entity: entity.name, date: confirmDate(confirmedAt), by: by.name, privacy: privacyUrl() ?? "‹раздел М4 — още не е свързан · section M4 — not linked yet›" }),
  };
  const res = await sendToLab(msg, approval);
  if (res.ok) return true;
  // sendToLab records nothing it cannot send — this notice is recorded all the same
  if (!res.recordId) { const id = await recordPending(msg, approval); if (id) await settle(id, false, res.error ?? "not sent"); }
  return false;
}

/** «Изпрати отново» on «Организации» (4.4 review): the notice of a confirmation that did
 *  not go — the same fixed text, to the official e-mail; PTS's person approves it. */
export async function resendConfirmationNoticeAction(entityId: string): Promise<{ ok: true } | { error: string }> {
  await requireCapAnywhere("labs.manage");
  const actor = await actorNow();
  const e = await oneEntity(entityId, actor);
  if (!e) return { error: "Not found." };
  if (!e.confirmedAt || !e.confirmedBy) return { error: "Профилът още не е потвърден. · The profile is not confirmed yet." };
  if (!e.officialEmail) return { error: "Няма официален e-mail. · No official e-mail." };
  const [by] = await openEntityUsers({ actor, purpose: "send" }, { userId: e.confirmedBy });
  const person = (await getRoleContext()).email ?? "build";
  const sent = await sendConfirmationNotice(e, { name: by?.name ?? "—" }, e.confirmedAt, { by: person, ref: fixedApproval(PROFILE_CONFIRMED_KEY).ref }, "provider");
  await logActivity("profile.notice_resent", { subject: `entity:${e.id}`, after: { notice: sent ? "sent" : "not sent" }, summary: `The notice of the laboratory's confirmation sent again: ${sent ? "sent" : "NOT sent"}` });
  revalidatePath("/organizations");
  return sent ? { ok: true } : { error: "Уведомлението не тръгна — вижте изпратените писма. · The notice did not go — see the sent messages." };
}

// ── A frozen copy per participation (plan part 4.5; J12) ─────────────────────────
// PTS links a participation to the laboratory it is for: the database takes the legal
// entity's and the laboratory's data AS THEY ARE THEN and keeps that copy with the
// participation — later changes never reach it; the person by reference only. A wrong
// link is corrected by a new version, with its reason — the earlier one kept (4.5
// review). In THIS scheme, by whoever manages its participants (2.4) — who also sees
// the names.
const FROZEN_TEXT = {
  frozen: "Участието вече има своето копие — поправката иска причина. · The participation has its copy already — a correction needs its reason.",
  lab: "Лабораторията е неактивна или не е намерена. · The laboratory is inactive or not found.",
  entity: "Юридическото лице е неактивно. · The legal entity is inactive.",
  contact: "Лицето за контакт не е потребител на това юридическо лице. · The contact is not a user of that legal entity.",
  failed: "Не се записа — опитайте пак. · Could not save — try again.",
  none: "Не е намерено. · Not found.",
};

/** The laboratories (active, under an entity not inactive) and their users to choose
 *  from — opened only when a person opens «Свържи» (4.5 review: not on every load). */
export async function freezeOptionsAction(schemeId: string): Promise<{ labs: { id: string; entityId: string; label: string; entityName: string; eik: string; deliveryAddress: string }[]; users: { id: string; entityId: string; label: string }[] } | { error: string }> {
  await requireCap("participants.manage", String(schemeId ?? ""));
  const actor = await actorNow();
  try {
    const ents = new Map((await openEntities({ actor, purpose: "names.view" })).map((e) => [e.id, e]));
    const labs = (await openLaboratories({ actor, purpose: "names.view" })).filter((l) => l.state === "active" && ents.get(l.entityId) && ents.get(l.entityId)!.state !== "inactive")
      .map((l) => { const e = ents.get(l.entityId)!; return { id: l.id, entityId: l.entityId, label: `${e.name} — ${l.name}`, entityName: e.name, eik: e.eik, deliveryAddress: l.deliveryAddress }; })
      .sort((a, b) => a.label.localeCompare(b.label, "bg"));
    const entityIds = new Set(labs.map((l) => l.entityId));
    const users = entityIds.size ? (await openEntityUsers({ actor, purpose: "names.view" })).filter((u) => u.state !== "inactive" && entityIds.has(u.entityId)).map((u) => ({ id: u.id, entityId: u.entityId, label: u.position ? `${u.name} (${u.position})` : u.name })) : [];
    return { labs, users };
  } catch {
    return { error: FROZEN_TEXT.failed };
  }
}

export async function freezeParticipationAction(input: { schemeId: string; participantId: string; laboratoryId: string; contactUserId?: string; reason?: string }): Promise<{ ok: true } | { error: string }> {
  const schemeId = String(input?.schemeId ?? "");
  await requireCap("participants.manage", schemeId);
  const own = (await listParticipants(schemeId)).find((x) => x.id === String(input.participantId ?? ""));
  if (!own) return { error: FROZEN_TEXT.none }; // the row must belong to THIS scheme
  const lab = String(input.laboratoryId ?? ""), contact = String(input.contactUserId ?? ""), reason = String(input.reason ?? "").trim();
  if (!UUID_RE.test(lab)) return { error: "Изберете лабораторията. · Choose the laboratory." };
  if (contact && !UUID_RE.test(contact)) return { error: FROZEN_TEXT.none };
  let version: number;
  try { version = await freezeParticipation(own.id, lab, contact || undefined, await actorNow(), reason || undefined); }
  catch (e) {
    const m = String((e as Error)?.message ?? "");
    return { error: /frozen already|duplicate key/.test(m) ? FROZEN_TEXT.frozen : /laboratory, or it is inactive/.test(m) ? FROZEN_TEXT.lab : /entity, or it is inactive/.test(m) ? FROZEN_TEXT.entity : /contact/.test(m) ? FROZEN_TEXT.contact : FROZEN_TEXT.failed };
  }
  await logActivity("participant.frozen", { schemeId, targetCode: own.code, after: { version }, summary: version > 1 ? `The participation's copy corrected — version ${version}, with its reason (J12)` : `The participation's copy of its legal entity and laboratory taken (J12)${contact ? "; its contact by reference" : ""}` });
  revalidatePath(`/schemes/${schemeId}/participants`);
  return { ok: true };
}

// ── Retention (plan part 4.7; Zadanie §10) ──────────────────────────────────────
// A rejected registration is kept six years with its reason, then removed by hand — the
// database refuses earlier (0037). A profile with no participation is kept until its
// deletion is requested; then it is erased by hand, naming the request — on record.

/** «Премахни изтеклите»: the rejected registrations whose six years are over, and their
 *  stored documents — the documents first, the record only once they are gone (a
 *  record never left without its files' trace); each one the database checks again. */
export async function removeExpiredRejectionsAction(): Promise<{ ok: true; removed: number } | { error: string }> {
  await requireCapAnywhere("labs.manage"); // the people of the laboratories (2.4)
  const due = (await listLabApplications("rejected")).filter((a) => retentionOver(a, Date.now()));
  let removed = 0;
  const failedDocs: string[] = [];
  const db = getDb();
  for (const a of due) {
    try {
      if (db && a.docPaths?.length) {
        const r = await db.storage.from(DOC_BUCKET).remove(a.docPaths).catch((e) => ({ error: e as Error }));
        if (r.error) { failedDocs.push(...a.docPaths); continue; } // kept until its files go too
      }
      await removeLabApplication(a.id);
      removed++;
    } catch (e) { console.warn("[retention] a rejected registration was not removed:", (e as Error)?.message ?? e); }
  }
  if (removed || failedDocs.length) await logActivity("lab_application.removed", { after: { removed, documentsNotRemoved: failedDocs }, summary: `Rejected registrations past their six years removed: ${removed} (Zadanie §10)${failedDocs.length ? ` — ${failedDocs.length} document(s) could not be removed, their records kept` : ""}` });
  revalidatePath("/users");
  return removed === due.length ? { ok: true, removed } : { error: `Премахнати ${removed} от ${due.length} — останалите опитайте пак. · Removed ${removed} of ${due.length} — try the rest again.` };
}

/** Erase a profile on request — the head of the PT provider's (an irreversible act on a
 *  participant's identity, as resetting two-step sign-in is the head's — 4.7 review): a
 *  legal entity with no participation, its laboratories and users anonymised by the
 *  database in one step, the messages sent to it blanked; its sign-in accounts — every
 *  one it has had — deleted, its documents removed. The request named by its incoming
 *  number and date, kept with the entity, never in the journal. */
export async function eraseEntityAction(entityId: string, requestNo: unknown, requestDate: unknown, confirmed: unknown): Promise<{ ok: true } | { error: string }> {
  await requirePeopleManager(); // the head of the PT provider (2.2, Реш. 141)
  if (!UUID_RE.test(String(entityId))) return { error: "Не е намерено. · Not found." };
  const req = readEraseRequest(requestNo, requestDate, new Date().toISOString());
  if (!req) return { error: "Посочете искането — входящия му номер (без интервали) и датата му (не по-късна от днес). · Name the request — its incoming number (no spaces) and its date (not after today)." };
  if (confirmed !== true && confirmed !== "on") return { error: "Потвърдете, че изтриването не може да се върне. · Confirm that the erasure cannot be undone." };
  let r: Awaited<ReturnType<typeof eraseEntity>>;
  try { r = await eraseEntity(String(entityId), req, await actorNow()); }
  catch (e) {
    const m = String((e as Error)?.message ?? "");
    return { error: /participation/.test(m) ? "Профилът има участия — пази се: данните му са в записите на кръговете. · The profile has participations — it is kept: its data is in its rounds' records."
      : /erased already/.test(m) ? "Профилът вече е изтрит. · The profile is erased already."
      : /no such entity/.test(m) ? "Не е намерено. · Not found." : ENTITY_FAILED };
  }
  // its sign-in accounts deleted (no e-mail left in them), its documents removed — what
  // could not be is said, by id (random — no person in it), and journalled
  const accountsLeft: string[] = [], documentsLeft: string[] = [];
  const db = getDb();
  for (const a of r.accounts) {
    const res = db ? await db.auth.admin.deleteUser(a).catch((err) => ({ error: err as Error })) : { error: null };
    if (res.error && !/not found|user_not_found/i.test(String(res.error.message ?? ""))) accountsLeft.push(a);
  }
  for (const p of r.proofs) if (!(await removeProof(p))) documentsLeft.push(p);
  await logActivity("entity.erased", { subject: `entity:${entityId}`, after: { laboratories: r.laboratories, users: r.users, messages: r.messages, accountsDeleted: r.accounts.length - accountsLeft.length, documentsRemoved: r.proofs.length - documentsLeft.length, accountsLeft, documentsLeft }, summary: `Legal entity erased on request (no participation): ${r.laboratories} laboratories, ${r.users} users, ${r.messages} messages blanked, ${r.accounts.length - accountsLeft.length} sign-in accounts deleted, ${r.proofs.length - documentsLeft.length} documents removed (Zadanie §10)${accountsLeft.length || documentsLeft.length ? ` — LEFT: ${accountsLeft.length} accounts, ${documentsLeft.length} documents` : ""}` });
  revalidatePath("/organizations");
  if (accountsLeft.length || documentsLeft.length) return { error: `Профилът е изтрит, но ${accountsLeft.length} профила за вход и ${documentsLeft.length} документа не можаха да се премахнат — записано е в журнала; софтуерният администратор ги премахва. · The profile is erased, but ${accountsLeft.length} sign-in accounts and ${documentsLeft.length} documents could not be removed — in the journal; PTS's software administrator removes them.` };
  return { ok: true };
}

// ── Applications entered by PTS (plan part 5.1; Реш. 123, 14) ─────────────────────
// No approval act: entering the application makes the laboratory a participant. PTS
// may only refuse it — with a category and a reason (told to the laboratory, held for
// «Изпрати» like every notice); an application entered wrongly is annulled, one the
// laboratory takes back withdrawn — each with its source. Set once: the participation
// and its code stay, out of the round; nothing is deleted, a code never reused.
export async function setParticipationStandingAction(input: { schemeId: string; participantId: string; state: string; category?: unknown; reason?: unknown; source?: unknown }): Promise<{ ok: true } | { error: string }> {
  const schemeId = String(input?.schemeId ?? "");
  await requireCap("participants.manage", schemeId); // in THIS scheme, by the role model (2.4)
  const say = (t: { bg: string; en: string }) => ({ error: `${t.bg}. · ${t.en}.` });
  const own = (await listParticipants(schemeId)).find((x) => x.id === String(input.participantId ?? ""));
  if (!own) return { error: "Не е намерено. · Not found." }; // the row must belong to THIS scheme
  if (!inRound(own)) return say(STANDING_PROBLEM_TEXT.already);
  const by = (await getRoleContext()).email ?? "build";
  const at = new Date().toISOString();
  let standing: Standing;
  if (input.state === "refused") {
    const r = readRefusal(input.category, input.reason);
    if (!r.ok) return say(STANDING_PROBLEM_TEXT[r.problem]);
    standing = { state: "refused", at, by, category: r.category, reason: r.reason };
  } else if (input.state === "annulled" || input.state === "withdrawn") {
    const src = readSource(input.source);
    if (!src) return say(STANDING_PROBLEM_TEXT.source);
    standing = { state: input.state, at, by, source: src };
  } else return { error: "Неизвестно действие. · Unknown action." };
  // who to tell of a refusal — before anything is recorded (2.3): a failed lookup
  // refuses the whole act, never a refusal on record that nobody was told of
  const tell = standing.state === "refused" ? await labToTell(schemeId, own.code) : {};
  if (!tell) return { error: NOT_REACHED };
  const p = await updateParticipant(own.id, { standing }, await actorNow()).catch((e) => (/stays so/.test(String((e as Error)?.message ?? "")) ? "already" as const : null));
  if (p === "already") return say(STANDING_PROBLEM_TEXT.already);
  if (!p) return { error: ENTITY_FAILED };
  // the journal: the state and a refusal's category — never the reason or the source (they may name someone)
  const entry = { schemeId, targetCode: own.code, after: { state: standing.state, ...(standing.category ? { category: standing.category } : {}) }, summary: `Participation ${own.code} ${standing.state}${standing.category ? ` — ${standing.category}` : ""} (out of the round; its code stays)` };
  if (standing.state === "refused") await logActivity("participant.refused", entry);
  else if (standing.state === "annulled") await logActivity("participant.annulled", entry);
  else await logActivity("participant.withdrawn", entry);
  // a refusal is told to the laboratory — held until a person releases it (Реш. 138)
  if (standing.state === "refused") {
    const scheme = await getScheme(schemeId);
    const cat = REFUSAL_CATEGORIES.find((c) => c.key === standing.category)!;
    await notifyParticipationRefused(tell.labId, schemeId, scheme?.number ?? schemeId, own.code, cat, standing.reason ?? "");
  }
  revalidatePath(`/schemes/${schemeId}/participants`);
  return { ok: true };
}


// ── Delivery and receipt (part 5.6; lib/delivery-model) ─────────────────────────────
// PTS sends (capability «dispatch» in the scheme, D18): a dispatch with its waybill and
// documents, a replacement object (only with the minimum working days left, Реш. 127), or a
// hand-over to the participant's own courier (Реш. 154). The participant files its online
// receipt protocol (Ф 7.3.4-1; «годен» = every listed check passed, Реш. 79) and may signal
// a problem. A testing scheme's objects; a calibration device travels by the chain (5.7).
// Everything appended, journalled; the participation told by its code.

const DELIVERIES = (schemeId: string) => `/deliveries?scheme=${encodeURIComponent(schemeId)}`;
const putDelivery = (s: { deliveries?: Deliveries }, pid: string, patch: (d: ReturnType<typeof deliveryOf>) => ReturnType<typeof deliveryOf>): Deliveries =>
  ({ ...(s.deliveries ?? {}), [pid]: patch(deliveryOf(s, pid)) });

export async function dispatchAction(formData: FormData): Promise<void> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("dispatch", schemeId); // in THIS scheme, by the role model (2.4; D18)
  const pid = String(formData.get("participantId") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "");
  const kind: ShipmentKind | null = kindRaw === "dispatch" || kindRaw === "replacement" || kindRaw === "handover" ? kindRaw : null;
  const back = (q: string) => `${DELIVERIES(schemeId)}&${q}${pid ? `&p=${encodeURIComponent(pid)}` : ""}#p-${encodeURIComponent(pid)}`;
  if (!kind) redirect(back("err=kind"));
  const scheme = await getScheme(schemeId);
  if (!scheme || scheme.type === "C") redirect(back("err=scheme"));
  // the objects go while the scheme runs, to a participation going on in the round, coded
  if (scheme!.status !== "running") redirect(back("err=state"));
  const part = (await listParticipants(schemeId)).find((p) => p.id === pid);
  if (!part || !inFinalRound(scheme!, part)) redirect(back("err=participation"));
  if (isProvisional(part!.code)) redirect(back("err=uncoded"));
  const today = sofiaToday(schemeNowMs(scheme!));
  const d = deliveryOf(scheme!, pid);
  if (kind !== "replacement" && d.shipments.length) redirect(back("err=twice")); // one object; a second is a replacement
  // a replacement names the latest shipment the person saw — re-checked in the lock, so a
  // double press or two people at once send one replacement, not two (review)
  const seen = String(formData.get("after") ?? "");
  if (kind === "replacement") {
    if (!d.shipments.length) redirect(back("err=nothing"));
    if (seen !== d.shipments[d.shipments.length - 1].id) redirect(back("err=moved"));
    if (!replacementCalledFor(d)) redirect(back("err=fit")); // after an unfit protocol, or a problem signalled since
    const why = replacementProblem(scheme!.type, resultsDeadline(scheme!, part!.code).at, today, minDaysOf(scheme!), await holidaySet());
    if (why) redirect(back(`err=${why.problem}${why.left !== undefined ? `&left=${why.left}` : ""}`));
  }
  const read = readShipment(kind!, {
    day: formData.get("day"), waybill: formData.get("waybill"), carrier: formData.get("carrier") ?? part!.courier, docs: formData.getAll("doc"),
    time: formData.get("time"), receiver: formData.get("receiver"), reason: formData.get("reason"),
  }, scheme!.lists?.shipmentDocs, today);
  if (!read.ok) redirect(back(`err=${read.problem}`));
  const fields = (read as Extract<typeof read, { ok: true }>).fields;
  // who to tell, BEFORE it is recorded (2.3)
  const tell = await labToTell(schemeId, part!.code);
  if (!tell) redirect(back("err=reach"));
  const actor = (await getRoleContext()).email ?? "build";
  const shipment: Shipment = { id: randomUUID(), at: schemeNowIso(scheme!), recordedAt: new Date().toISOString(), by: actor, ...fields };
  // in the lock, from the fresh scheme: still running; still one object unless a replacement;
  // a replacement still called for, after the very shipment the person saw
  let refused: string | null = null;
  await updateSchemeWith(schemeId, (s) => {
    if (s.status !== "running") { refused = "state"; return {}; }
    const fresh = deliveryOf(s, pid);
    if (kind !== "replacement" && fresh.shipments.length) { refused = "twice"; return {}; }
    if (kind === "replacement" && (fresh.shipments[fresh.shipments.length - 1]?.id !== seen || !replacementCalledFor(fresh))) { refused = "moved"; return {}; }
    return { deliveries: putDelivery(s, pid, (x) => ({ ...x, shipments: [...x.shipments, shipment] })) };
  });
  if (refused) redirect(back(`err=${refused}`));
  const docNames = (scheme!.lists?.shipmentDocs ?? []).filter((i) => fields.docs.includes(i.id)).map((i) => i.en);
  await addCaseEvent({
    schemeId, code: part!.code, kind: "items_dispatched", at: fields.day,
    ref: (fields.waybill ?? (fields.handover ? `hand-over ${fields.handover.time}` : "")).slice(0, 120),
    // never the carrier: a participant's courier says where it is (the export keeps it with
    // identities) — and a hand-over's may be its own person (review)
    note: `${kind === "replacement" ? "replacement object" : kind === "handover" ? "handed to the participant's own courier" : "dispatched"}${docNames.length ? `; documents: ${docNames.join(", ")}` : ""}`.slice(0, 400),
    recordedBy: actor, source: "auto",
  });
  await advanceStatusForEvent(schemeId, part!.code, "items_dispatched");
  await notifyItemsDispatched(tell!.labId, schemeId, scheme!.number, part!.code, { kind: kind!, day: fields.day, waybill: fields.waybill, carrier: fields.carrier, time: fields.handover?.time });
  // the carrier and a replacement's reason stay in the record — never in the journal's words (§4.2)
  await logActivity("delivery.dispatched", { schemeId, targetCode: part!.code, subject: `shipment:${shipment.id}`, summary: `${kind === "replacement" ? "A replacement object" : kind === "handover" ? "The object handed to the participant's own courier" : "The object"} for ${part!.code} — ${fields.day}${fields.waybill ? `, waybill ${fields.waybill}` : ""}`, after: { kind, day: fields.day, waybill: fields.waybill ?? null, docs: fields.docs } });
  revalidatePath("/deliveries");
  revalidatePath(`/schemes/${schemeId}`, "layout");
  redirect(back(`ok=${kind}`));
}

/** PTS marks a signalled problem resolved, with a note — the problem stays on record. */
export async function resolveDeliveryProblemAction(formData: FormData): Promise<void> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("dispatch", schemeId);
  const pid = String(formData.get("participantId") ?? "").trim();
  const problemId = String(formData.get("problemId") ?? "").trim();
  const note = String(formData.get("note") ?? "").replace(/\s+/g, " ").trim().slice(0, DELIVERY_LIMITS.note);
  const back = (q: string) => `${DELIVERIES(schemeId)}&${q}&p=${encodeURIComponent(pid)}#p-${encodeURIComponent(pid)}`;
  if (note.length < 3) redirect(back("err=note"));
  const actor = (await getRoleContext()).email ?? "build";
  const scheme = await getScheme(schemeId);
  if (!scheme) redirect(back("err=scheme"));
  const at = schemeNowIso(scheme!); // the round's clock (1.3)
  let found = false;
  await updateSchemeWith(schemeId, (s) => {
    const d = deliveryOf(s, pid);
    if (!d.problems.some((x) => x.id === problemId && !x.resolved)) return {};
    found = true;
    return { deliveries: putDelivery(s, pid, (x) => ({ ...x, problems: x.problems.map((pr) => (pr.id === problemId ? { ...pr, resolved: { at, by: actor, note } } : pr)) })) };
  });
  if (!found) redirect(back("err=problem"));
  const code = (await listParticipants(schemeId)).find((p) => p.id === pid)?.code;
  // the note stays in the record (the participant reads it) — free words never in the journal (§4.2, N4; review)
  await logActivity("delivery.problem_resolved", { schemeId, targetCode: code, subject: `problem:${problemId}`, summary: `A delivery problem of ${code ?? "a participation"} marked resolved` });
  revalidatePath("/deliveries");
  redirect(back("ok=resolved"));
}

/** А16 / Реш. 127: the scheme's minimum working days for a replacement object. */
export async function setDeliveryMinDaysAction(formData: FormData): Promise<void> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("scheme.edit", schemeId);
  const n = readMinDays(formData.get("days"));
  if (n === null) redirect(`${DELIVERIES(schemeId)}&err=days`);
  const before = (await getScheme(schemeId))?.deliveryMinDays;
  await updateSchemeWith(schemeId, () => ({ deliveryMinDays: n! }));
  await logActivity("scheme.delivery_min_days", { schemeId, summary: `Minimum working days for a replacement object: ${before ?? "10 (default)"} → ${n}`, before: { days: before ?? null }, after: { days: n } });
  revalidatePath("/deliveries");
  redirect(`${DELIVERIES(schemeId)}&ok=days`);
}

// ── the participant's side ──
/** Its own participation in the scheme — a laboratory's account or a user of its entity —
 *  going on in the round; how it is journalled; who it is on the record (an account id). */
async function ownGoingOn(schemeId: string, participantId: string) {
  const ls = await getLabSession();
  const ps = ls ? null : await getParticipantSession().catch(() => null);
  if (!ls && !ps) return null;
  const scheme = await getScheme(schemeId);
  if (!scheme || !isStarted(scheme)) return null;
  const own = ls
    ? (await listVisibleParticipations(ls.lab.id)).some((p) => p.id === participantId && p.schemeId === schemeId)
    : (await participationsOf(ps!)).some((p) => p.participantId === participantId && p.schemeId === schemeId);
  if (!own) return null;
  const part = (await listParticipants(schemeId)).find((p) => p.id === participantId);
  if (!part || !inFinalRound(scheme, part)) return null;
  const by = ls ? `lab:${ls.lab.id}` : `entityuser:${ps!.user.id}`;
  const log = async (action: string, meta: { targetCode: string; subject?: string; summary: string; after?: Record<string, unknown> }) => {
    if (ls) await logActivity(action, { schemeId, ...meta });
    else await logAs({ kind: "lab", userId: ps!.user.id }, action, { schemeId, ...meta, after: { ...(meta.after ?? {}), by } });
  };
  return { scheme, part, by, log };
}
const ownBack = (pid: string, q: string) => `/lab/p/${encodeURIComponent(pid)}?${q}#receipt`;

/** The online receipt protocol (Ф 7.3.4-1) for the shipment awaiting it. */
export async function submitReceiptAction(formData: FormData): Promise<void> {
  const schemeId = String(formData.get("schemeId") ?? "");
  const pid = String(formData.get("participantId") ?? "").trim();
  const mine = await ownGoingOn(schemeId, pid);
  if (!mine) redirect("/lab");
  const { scheme, part, by, log } = mine!;
  if (scheme.type === "C") redirect(ownBack(pid, "e=receipt-shipment"));
  // only while the round runs — never after the report, in a closed scheme or one not held (review)
  if (scheme.status !== "running") redirect(ownBack(pid, "e=receipt-state"));
  const d0 = deliveryOf(scheme, pid);
  const posted = String(formData.get("shipmentId") ?? "");
  // a protocol for a shipment that has one already — a second press, a stale form: refused, said so
  if (d0.receipts.some((r) => r.shipmentId === posted)) redirect(ownBack(pid, "e=receipt-twice"));
  const open = openShipment(d0);
  if (!open || posted !== open.id) redirect(ownBack(pid, "e=receipt-shipment"));
  const checks: Record<string, unknown> = {};
  for (const i of scheme.lists?.receiptChecks ?? []) checks[i.id] = formData.get(`check_${i.id}`);
  const read = readReceipt({ day: formData.get("day"), time: formData.get("time"), checks, undamaged: formData.get("undamaged"), remarks: formData.get("remarks"), receivedBy: formData.get("receivedBy") }, scheme.lists?.receiptChecks, sofiaToday(schemeNowMs(scheme)), open!.day);
  if (!read.ok) redirect(ownBack(pid, `e=receipt-${read.problem}`));
  const fields = (read as Extract<typeof read, { ok: true }>).fields;
  const receipt = { id: randomUUID(), shipmentId: open!.id, at: schemeNowIso(scheme), by, ...fields };
  // in the lock: the same shipment still awaits it — a second press is not a second protocol
  let refused = false;
  await updateSchemeWith(schemeId, (s) => {
    const d = deliveryOf(s, pid);
    if (openShipment(d)?.id !== open!.id) { refused = true; return {}; }
    return { deliveries: putDelivery(s, pid, (x) => ({ ...x, receipts: [...x.receipts, receipt] })) };
  });
  if (refused) redirect(ownBack(pid, "e=receipt-twice"));
  await addCaseEvent({
    schemeId, code: part.code, kind: "receipt_confirmed", at: fields.day, ref: (open!.waybill ?? "").slice(0, 120),
    note: `online receipt protocol ${fields.time}: ${fields.suitable ? "fit" : "NOT fit"}${fields.undamaged ? "" : " (packaging damaged)"}`,
    recordedBy: LAB_RECORDER, source: "auto",
  });
  await advanceStatusForEvent(schemeId, part.code, "receipt_confirmed");
  await notifyReceiptProtocol(schemeId, scheme.number, part.code, fields.suitable);
  // the person's name stays in the record, out of the journal's words (§4.2, N4)
  await log("receipt.protocol", { targetCode: part.code, subject: `receipt:${receipt.id}`, summary: `Receipt protocol of ${part.code}: ${fields.suitable ? "fit" : "NOT fit"}`, after: { shipment: open!.id, day: fields.day, time: fields.time, suitable: fields.suitable, undamaged: fields.undamaged, failed: Object.entries(fields.checks).filter(([, v]) => !v).map(([k]) => k) } });
  revalidatePath(`/lab/p/${pid}`);
  revalidatePath("/deliveries");
  redirect(ownBack(pid, "ok=receipt"));
}

/** «Сигнализирай проблем» — after its object was sent, while it goes on. */
export async function reportDeliveryProblemAction(formData: FormData): Promise<void> {
  const schemeId = String(formData.get("schemeId") ?? "");
  const pid = String(formData.get("participantId") ?? "").trim();
  const mine = await ownGoingOn(schemeId, pid);
  if (!mine) redirect("/lab");
  const { scheme, part, by, log } = mine!;
  if (scheme.status !== "running") redirect(ownBack(pid, "e=problem-state"));
  if (!deliveryOf(scheme, pid).shipments.length) redirect(ownBack(pid, "e=problem-nothing"));
  // a handful open at once — the next waits for PTS's answer (each one tells PTS)
  if (openProblems(deliveryOf(scheme, pid)).length >= MAX_OPEN_PROBLEMS) redirect(ownBack(pid, "e=problem-many"));
  const text = String(formData.get("text") ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ").trim().slice(0, DELIVERY_LIMITS.problem);
  if (text.length < 3) redirect(ownBack(pid, "e=problem-text"));
  const problem = { id: randomUUID(), at: schemeNowIso(scheme), by, text };
  await updateSchemeWith(schemeId, (s) => ({ deliveries: putDelivery(s, pid, (x) => ({ ...x, problems: [...x.problems, problem] })) }));
  await notifyDeliveryProblem(schemeId, scheme.number, part.code);
  await log("delivery.problem", { targetCode: part.code, subject: `problem:${problem.id}`, summary: `${part.code} signalled a problem with its object` });
  revalidatePath(`/lab/p/${pid}`);
  revalidatePath("/deliveries");
  redirect(ownBack(pid, "ok=problem"));
}


// ── The reference values per point (part 5.7; Zadanie «Приписана и референтна стойност»;
// D3: 2.0's «Calibration» sheet) ────────────────────────────────────────────────────
// The scheme manager, or who processes the results, records per calibration point the
// reference laboratory's error before the first participant and after the last, with
// u_calibration, u_other and k. Each save a version — the whole table, who, when — appended,
// against the version and the points the person's form was drawn for (the store's lock — one
// server instance, as every scheme write). From the draft (the first reference calibration is
// stage 5) until the report. A typo returns the table as typed, the field named (review).
const REFERENCE_OPEN = (st: string) => st === "draft" || st === "open" || st === "running" || st === "processing";

export type ReferenceSaveState = { error?: string; problem?: { key: string; field: string; why: string }; values?: Record<string, string>; kReason?: string; n?: number } | null;

export async function saveReferenceValuesAction(_prev: ReferenceSaveState, formData: FormData): Promise<ReferenceSaveState> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireOneOf(["scheme.edit", "results.process"], schemeId);
  const back = (q: string) => `/schemes/${encodeURIComponent(schemeId)}/reference?${q}`;
  // what was typed — handed back on a refusal, so nothing is lost
  const typed = Object.fromEntries([...formData.entries()].filter(([k, v]) => /^(xBefore|xAfter|uCal|uOther|k)__/.test(k) && typeof v === "string").map(([k, v]) => [k, String(v).slice(0, 40)]));
  const kReason = String(formData.get("kReason") ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const refuse = (error: string, problem?: { key: string; field: string; why: string }): ReferenceSaveState => ({ error, problem, values: typed, kReason, n: Date.now() });
  const scheme = await getScheme(schemeId);
  if (!scheme || scheme.type !== "C") return refuse("scheme");
  if (!REFERENCE_OPEN(scheme.status)) return refuse("state");
  if (!pointsReady(scheme.calibration)) return refuse("ids");
  const keys = pointKeys(scheme.calibration);
  const seen = Number(formData.get("version"));
  const fp = String(formData.get("fp") ?? "");
  const read = readReferenceTable((n) => formData.get(n), keys);
  if (!read.ok) return refuse("value", (read as Extract<typeof read, { ok: false }>).problem);
  const typedRows = (read as Extract<typeof read, { ok: true }>).rows;
  if (kNeedsReason(typedRows) && kReason.length < 3) return refuse("kreason");
  const actor = (await getRoleContext()).email ?? "build";
  const res: { out: "ok" | "same" | "moved" | "state"; prev: Record<string, ReferenceRow>; rows: Record<string, ReferenceRow>; no: number } = { out: "ok", prev: {}, rows: {}, no: 0 };
  await updateSchemeWith(schemeId, (s) => {
    if (!REFERENCE_OPEN(s.status)) { res.out = "state"; return {}; }
    const versions = s.referenceValues?.versions ?? [];
    // the version AND the points the form was drawn for — else the keys could mean other points
    if (!Number.isInteger(seen) || versions.length !== seen || fingerprint(pointKeys(s.calibration)) !== fp) { res.out = "moved"; return {}; }
    res.prev = currentRows(s.referenceValues);
    // values under keys the scheme no longer has stay — never dropped by a save (review)
    const kept = Object.fromEntries(orphans(res.prev, pointKeys(s.calibration)).map((k) => [k, res.prev[k]]));
    res.rows = { ...kept, ...typedRows };
    if (sameRows(res.prev, res.rows) && (versions[versions.length - 1]?.kReason ?? "") === (kNeedsReason(res.rows) ? kReason : "")) { res.out = "same"; return {}; }
    res.no = versions.length + 1;
    return { referenceValues: { versions: [...versions, { at: schemeNowIso(s), by: actor, rows: res.rows, ...(kNeedsReason(res.rows) ? { kReason } : {}) }] } };
  });
  if (res.out === "state" || res.out === "moved") return refuse(res.out);
  if (res.out === "same") redirect(back("ok=same"));
  const { prev, rows, no } = res;
  // the points that changed, field by field (the database re-sorts a row's keys — review)
  const changed = [...new Set([...Object.keys(prev), ...Object.keys(rows)])].filter((k) => !sameRow(prev[k], rows[k]));
  await logActivity("scheme.reference_values", {
    schemeId, subject: `reference:v${no}`,
    summary: `Reference values per point: version ${no} — ${changed.length} point(s) changed`,
    before: Object.fromEntries(changed.map((k) => [k, prev[k] ?? null])), after: Object.fromEntries(changed.map((k) => [k, rows[k] ?? null])),
  });
  revalidatePath(`/schemes/${schemeId}/reference`);
  revalidatePath(`/schemes/${schemeId}`);
  redirect(back("ok=1"));
}


// ── The declaration and the acknowledgements (part 5.9; PTS's answers К12, К13 — Реш. 117,
// 118) ───────────────────────────────────────────────────────────────────────────────────
// A participation acknowledges the edition of a document it holds — or, for the declaration
// Ф 4.2-2, signs it with a tick: the account, the moment on the round's clock, the edition and
// (the declaration) the hash of its frozen file, which is the text signed. Per participation
// and edition: a second press is no second record, a new edition asks again. NEVER a block:
// nothing else in the portal waits on it (Реш. 117).
const ackBack = (pid: string, q: string) => `/lab/p/${encodeURIComponent(pid)}?${q}#documents`;

export async function acknowledgeDocAction(formData: FormData): Promise<void> {
  const schemeId = String(formData.get("schemeId") ?? "");
  const pid = String(formData.get("participantId") ?? "").trim();
  const docKey = String(formData.get("docKey") ?? "");
  const posted = String(formData.get("editionId") ?? "");
  const lang = formData.get("lang") === "en" ? "en" as const : "bg" as const;
  const mine = await ownGoingOn(schemeId, pid);
  if (!mine) redirect("/lab");
  const { scheme, part, by, log } = mine!;
  const no = (problem: AckProblem) => redirect(ackBack(pid, `e=ack-${problem}`));
  if (scheme.status === "not_held") no("state");
  const form = readAckForm(docKey, formData.get("tick"));
  if (!form.ok) no(form.problem);
  if (!isSendableDoc(docKey) || !ackRequiredFor(scheme, docKey)) no("not-asked");
  // the edition that reaches THIS participation now — its own release, or the scheme's
  const viewer = { participantIds: [pid], userId: by.startsWith("entityuser:") ? by.slice("entityuser:".length) : undefined };
  const reaching = releaseFor(scheme, docKey, viewer);
  if (!reaching) no("not-reaching");
  // what is acknowledged is always a frozen edition: a release from before editions (3.0) keeps
  // its edition on the first opening — open it first, never an unknown text signed (review)
  if (!reaching!.editionId) no("open-first");
  // the form was drawn for the edition it showed: a newer one meanwhile is the one to acknowledge
  if (reaching!.editionId !== posted) no("edition");
  if (ackOf(scheme, pid, docKey, reaching!.editionId)) no("twice");
  // the declaration: the text signed — the hash of the edition's frozen file, in the language shown
  let sha: string | undefined;
  if (kindOf(docKey) === "declaration") {
    const ed = await getEdition(reaching!.editionId!).catch(() => null);
    sha = ed ? (ed.source === "uploaded" ? ed.sha.file : ed.sha[lang] ?? ed.sha.bg ?? ed.sha.en) : undefined;
    // the text signed is the record's heart (Реш. 118): without its hash, nothing is saved (review)
    if (!sha) no("failed");
  }
  const record: Acknowledgement = {
    id: randomUUID(), participantId: pid, docKey, kind: kindOf(docKey),
    editionId: reaching!.editionId!, ...(reaching!.editionNo ? { editionNo: reaching!.editionNo } : {}),
    ...(sha ? { sha, lang } : {}),
    at: schemeNowIso(scheme), by,
  };
  // in the lock: still asked, still this edition, still not given — a second press is not a second record
  let refused: AckProblem | null = null;
  await updateSchemeWith(schemeId, (s) => {
    if (s.status === "not_held") { refused = "state"; return {}; }
    if (!ackRequiredFor(s, docKey)) { refused = "not-asked"; return {}; }
    const now = releaseFor(s, docKey, viewer);
    // withdrawn meanwhile: nothing to acknowledge; another edition meanwhile: that one (review)
    if (!now) { refused = "not-reaching"; return {}; }
    if (now.editionId !== reaching!.editionId) { refused = "edition"; return {}; }
    if (ackOf(s, pid, docKey, reaching!.editionId)) { refused = "twice"; return {}; }
    return { acknowledgements: [...(s.acknowledgements ?? []), record] };
  });
  if (refused) no(refused);
  const name = getDoc(docKey)?.nameEn ?? docKey;
  // the code, the document, the edition and the hash — the account in the record, never a name in the words
  await log(record.kind === "declaration" ? "declaration.signed" : "doc.acknowledged", {
    targetCode: part.code, subject: `ack:${docKey}:${record.editionId ?? "-"}`,
    summary: record.kind === "declaration" ? `${part.code} signed the ${name}${record.editionNo ? ` (edition No. ${record.editionNo})` : ""}` : `${part.code} acknowledged the ${name}${record.editionNo ? ` (edition No. ${record.editionNo})` : ""}`,
    after: { docKey, editionNo: record.editionNo ?? null, ...(sha ? { sha, lang } : {}) },
  });
  revalidatePath(`/lab/p/${pid}`);
  revalidatePath("/lab/overview");
  revalidatePath(`/schemes/${schemeId}`);
  redirect(ackBack(pid, `ok=${record.kind === "declaration" ? "declaration" : "ack"}`));
}

/** «Изисква потвърждение» on a document of the scheme — set or cleared by who edits the scheme.
 *  Clearing it keeps every record made; the declaration always asks and has no setting. */
export async function setAckRequiredAction(formData: FormData): Promise<void> {
  const schemeId = String(formData.get("schemeId") ?? "");
  await requireCap("scheme.edit", schemeId);
  const docKey = String(formData.get("docKey") ?? "");
  const on = formData.get("on") === "1";
  const back = (q: string) => `/schemes/${encodeURIComponent(schemeId)}?${q}#acknowledgements`;
  if (!isSendableDoc(docKey) || !ackSettable(docKey)) redirect(back("ack=doc"));
  const scheme = await getScheme(schemeId);
  if (!scheme) redirect("/files");
  const actor = (await getRoleContext()).email ?? "";
  let was = false;
  await updateSchemeWith(schemeId, (s) => {
    was = !!s.ackRequired?.[docKey];
    if (was === on) return {};
    const next = { ...(s.ackRequired ?? {}) };
    if (on) next[docKey] = { at: new Date().toISOString(), by: actor };
    else delete next[docKey];
    return { ackRequired: next };
  });
  if (was !== on) {
    await logActivity("scheme.ack", {
      schemeId, subject: `doc:${docKey}`,
      summary: `${getDoc(docKey)?.nameEn ?? docKey}: ${on ? "asks the participations to acknowledge it" : "no longer asks for an acknowledgement (the records stay)"}`,
      before: { required: was }, after: { required: on },
    });
  }
  revalidatePath(`/schemes/${schemeId}`);
  redirect(back(`ack=${on ? "on" : "off"}`));
}
