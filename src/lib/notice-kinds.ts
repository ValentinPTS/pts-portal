// What a notice or a message is about, in words — never its internal kind («scheme.announced») on a
// page (the security sweep, UR-2). An unknown kind: its words made readable from the kind itself.
const KIND_TEXT: Record<string, { bg: string; en: string }> = {
  "application.approved": { bg: "заявката е приета", en: "application approved" },
  "application.received": { bg: "получена заявка", en: "application received" },
  "application.rejected": { bg: "заявката е отказана", en: "application refused" },
  "carrier.chosen": { bg: "избран превозвач", en: "carrier chosen" },
  "carrier.offers": { bg: "оферти на превозвачи", en: "carriers' offers" },
  "catalogue.next": { bg: "следващата схема започна", en: "the next scheme started" },
  "deadline.extended": { bg: "удължен срок", en: "deadline extended" },
  "delivery.problem": { bg: "проблем с доставката", en: "delivery problem" },
  "device.moved": { bg: "уредът е предаден", en: "the device moved on" },
  "docs.sent": { bg: "изпратени документи", en: "documents sent" },
  "invoice.ready": { bg: "фактура", en: "invoice ready" },
  "items.dispatched": { bg: "изпратен обект", en: "object dispatched" },
  "participation.coded": { bg: "участието е кодирано", en: "participation coded" },
  "participation.refused": { bg: "участието е отказано", en: "participation refused" },
  "receipt.confirmed": { bg: "протокол за получаване", en: "receipt protocol" },
  "receipt.due": { bg: "напомняне: протокол за получаване", en: "reminder: receipt protocol" },
  "report.issued": { bg: "издаден доклад", en: "report issued" },
  "results.corrected": { bg: "поправени резултати", en: "results corrected" },
  "results.due": { bg: "напомняне: резултати", en: "reminder: results" },
  "results.locked": { bg: "резултатите са заключени", en: "results locked" },
  "results.returned": { bg: "резултатите са върнати", en: "results returned" },
  "results.unlocked": { bg: "резултатите са отключени", en: "results unlocked" },
  "scheme.amended": { bg: "изменение на схемата", en: "scheme amended" },
  "scheme.announced": { bg: "първо обявяване", en: "first announcement" },
  "scheme.final_list": { bg: "окончателен списък", en: "final list" },
  "scheme.not_held": { bg: "схемата не се провежда", en: "scheme not held" },
  "profile.created": { bg: "профилът е създаден", en: "profile created" },
  "profile.user_joined": { bg: "нов потребител на профила", en: "a user joined the profile" },
  "profile.admin_changed": { bg: "нов администратор на профила", en: "new profile administrator" },
  "profile.confirmed": { bg: "данните са потвърдени", en: "data confirmed" },
  "password.reset": { bg: "смяна на парола", en: "password reset" },
  "password.changed": { bg: "паролата е сменена", en: "password changed" },
};

export function noticeKindText(kind: string, lang: "bg" | "en"): string {
  const t = KIND_TEXT[kind];
  if (t) return t[lang];
  return String(kind ?? "").replace(/[._]+/g, " ").trim();
}
