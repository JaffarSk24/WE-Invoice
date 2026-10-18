// Party snapshots: the seller's and buyer's details copied onto the
// document when it is issued, so later edits of the company or contact
// never change an issued document (02-architecture.md § 2.4.2).

const copyAddress = (address) => (address ? {
  street: address.street ?? '',
  city: address.city ?? '',
  zip: address.zip ?? '',
  country: address.country ?? 'SK',
  ...(address.region ? { region: address.region } : {})
} : {});

const orNull = (value) => (value === undefined || value === '' ? null : value);

/** Snapshot of the company as the seller (or the buyer of a received document). */
export function companySnapshot(company) {
  return {
    contactId: null,
    name: company.name || '',
    ico: orNull(company.ico),
    dic: orNull(company.dic),
    icDph: company.vatMode === 'NONPAYER' ? null : orNull(company.icDph),
    address: copyAddress(company.address),
    registerEntry: orNull(company.registerEntry),
    email: orNull(company.email),
    phone: orNull(company.phone),
    peppolId: orNull(company.peppol?.participantId),
    vatPayer: company.vatMode === 'PAYER'
  };
}

/** Snapshot of a contact as the buyer (or the supplier of a received document). */
export function contactSnapshot(contact) {
  const billing = (contact.emails || []).find(e => !e.purposes || e.purposes.includes('INVOICE')) || (contact.emails || [])[0];
  return {
    contactId: contact.id ?? null,
    name: contact.name || '',
    ico: orNull(contact.ico),
    dic: orNull(contact.dic),
    icDph: orNull(contact.icDph),
    address: copyAddress({ ...contact.billingAddress, country: contact.billingAddress?.country ?? contact.country }),
    registerEntry: null,
    email: billing ? billing.address : null,
    phone: orNull(contact.phone),
    peppolId: orNull(contact.peppolId),
    vatPayer: Boolean(contact.icDph)
  };
}
