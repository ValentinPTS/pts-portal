// The laboratory (plan part 4.2; Zadanie §8 «Лаборатория»). Pure.
//
// A laboratory belongs to a legal entity (4.1) — several per entity. It has its name as
// on its accreditation certificate, a delivery address (where the objects go), the
// «мобилен офис» mark, and its accreditation number — information only: accreditation
// is no condition of taking part (Реш. 108; 3.8's flag only warns). Identity data, in
// the identity store (migration 0032). Never deleted — «неактивна» is its end.

export type LaboratoryState = "active" | "inactive";
export interface Laboratory {
  id: string;
  entityId: string;
  /** as on its accreditation certificate */
  name: string;
  deliveryAddress: string;
  mobileOffice: boolean;
  /** information only (Реш. 108) */
  accreditationNo: string;
  /** who accredited it — ИА «БСА», DAkkS … (X1, 4.6); information only */
  accreditationBody: string;
  state: LaboratoryState;
  createdAt: string;
  createdBy: string;
}

export const LAB_LIMITS = { name: 200, address: 300, accreditation: 60, accreditationBody: 120 };
export type LaboratoryProblem = "name" | "address" | "accreditation" | "accreditation-body" | "entity";

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g, " ").replace(/\s+/g, " ").trim();

export function readLaboratory(input: { name: unknown; deliveryAddress: unknown; mobileOffice: unknown; accreditationNo: unknown; accreditationBody?: unknown }):
  { ok: true; fields: Pick<Laboratory, "name" | "deliveryAddress" | "mobileOffice" | "accreditationNo" | "accreditationBody"> } | { ok: false; problem: LaboratoryProblem } {
  const name = clean(input.name);
  if (!name || [...name].length > LAB_LIMITS.name) return { ok: false, problem: "name" };
  const deliveryAddress = clean(input.deliveryAddress);
  if (!deliveryAddress || [...deliveryAddress].length > LAB_LIMITS.address) return { ok: false, problem: "address" };
  const accreditationNo = clean(input.accreditationNo);
  if ([...accreditationNo].length > LAB_LIMITS.accreditation) return { ok: false, problem: "accreditation" };
  const accreditationBody = clean(input.accreditationBody);
  if ([...accreditationBody].length > LAB_LIMITS.accreditationBody) return { ok: false, problem: "accreditation-body" };
  const m = input.mobileOffice;
  const mobileOffice = m === true || m === "on" || m === "1" || m === "true";
  return { ok: true, fields: { name, deliveryAddress, mobileOffice, accreditationNo, accreditationBody } };
}

export const LABORATORY_PROBLEM_TEXT: Record<LaboratoryProblem, { bg: string; en: string }> = {
  name: { bg: "наименованието по сертификата е задължително, до 200 знака", en: "the name as on the certificate is required, 200 characters at most" },
  address: { bg: "адресът за доставка е задължителен, до 300 знака", en: "the delivery address is required, 300 characters at most" },
  accreditation: { bg: "номерът на акредитацията е до 60 знака", en: "the accreditation number is 60 characters at most" },
  "accreditation-body": { bg: "органът по акредитация е до 120 знака", en: "the accreditation body is 120 characters at most" },
  entity: { bg: "юридическото лице не е намерено или е неактивно", en: "the legal entity is not found or is inactive" },
};

/** What changed, for the journal — by name, never the values (identity). */
export function laboratoryDiff(before: Partial<Laboratory>, after: Partial<Laboratory>): string[] {
  const keys: (keyof Laboratory)[] = ["name", "deliveryAddress", "mobileOffice", "accreditationNo", "accreditationBody"];
  return keys.filter((k) => k in after && JSON.stringify(before[k] ?? "") !== JSON.stringify(after[k] ?? ""));
}
