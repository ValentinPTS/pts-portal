// An e-mail address as the portal takes it — for a login (4.3) and an entity's official
// e-mail (4.4). Pure.

/** The normal form — what makes two addresses one: lower case, no trailing dot on the
 *  domain («lab.bg.» is «lab.bg» — 4.3 review). */
export const emailKey = (email: string) => email.trim().toLowerCase().replace(/\.+$/, "");

// as mail servers and Supabase take it (4.3 review): the local part without an empty,
// leading or trailing dot; a Latin (or punycode) domain of labels that neither start
// nor end with a hyphen, and a top level of letters
const EMAIL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Does this address (in its normal form) read? */
export const emailReads = (key: string) => !!key && key.length <= 254 && EMAIL.test(key);
