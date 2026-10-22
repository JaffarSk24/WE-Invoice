// Column mapping for table imports (CSV, XLSX): the fields each entity
// can take and the header names other programs use for them (iDoklad,
// SuperFaktúra, KROS, Pohoda list exports, WooCommerce order exports,
// generic English), compared
// without case and diacritics. The user can always correct the mapping
// in the preview; a guess only saves typing.
import { normalizeKey } from './values.js';

const ADDRESS = {
  ico: ['ico', 'ic', 'ico/rc', 'company id', 'id number', 'identifikacne cislo', 'identifikacni cislo', 'ico odberatela', 'ic odberatele'],
  dic: ['dic', 'tax id', 'danove identifikacne cislo', 'dic odberatela'],
  icDph: ['ic dph', 'icdph', 'ic pre dph', 'vat id', 'vat number', 'dic dph', 'ic dph odberatela'],
  street: ['ulica', 'ulice', 'street', 'adresa', 'address', 'ulica a cislo', 'ulice a cislo', 'ulice a c.p.'],
  city: ['mesto', 'obec', 'mesto/obec', 'city', 'town', 'misto'],
  zip: ['psc', 'zip', 'postal code', 'postcode', 'zip code'],
  country: ['stat', 'krajina', 'zeme', 'country']
};

export const FIELDS = Object.freeze({
  contacts: {
    name: ['nazov', 'nazov firmy', 'obchodne meno', 'obchodny nazov', 'meno', 'name', 'company', 'company name', 'nazev', 'nazev firmy', 'obchodni jmeno', 'firma', 'jmeno', 'klient', 'kontakt', 'odberatel', 'dodavatel'],
    ...ADDRESS,
    email: ['email', 'e-mail', 'mail', 'e-mailova adresa'],
    phone: ['telefon', 'tel', 'tel.', 'phone', 'mobil', 'telefonne cislo'],
    iban: ['iban', 'bankovy ucet', 'cislo uctu', 'ucet', 'bank account'],
    dueDays: ['splatnost', 'splatnost (dni)', 'due days', 'splatnost dni', 'splatnost (dny)'],
    note: ['poznamka', 'note', 'notes']
  },
  items: {
    name: ['nazov', 'nazov polozky', 'name', 'nazev', 'nazev polozky', 'polozka', 'popis', 'item', 'product', 'produkt', 'tovar', 'sluzba'],
    code: ['kod', 'kod polozky', 'code', 'sku', 'katalogove cislo', 'katalogove cislo', 'cislo polozky'],
    unit: ['mj', 'merna jednotka', 'jednotka', 'unit'],
    price: ['cena', 'cena bez dph', 'jednotkova cena', 'cena za mj', 'price', 'unit price', 'predajna cena', 'prodejni cena', 'cena bez dph za mj'],
    priceGross: ['cena s dph', 'price incl. vat', 'cena vratane dph', 'cena s dph za mj'],
    vatRate: ['dph', 'sadzba dph', 'sazba dph', 'dph %', 'vat', 'vat rate', 'dph (%)', 'sadzba'],
    barcode: ['ean', 'carovy kod', 'carovy kod', 'barcode'],
    description: ['poznamka', 'description', 'dlhy popis']
  },
  documents: {
    number: ['cislo', 'cislo faktury', 'cislo dokladu', 'number', 'invoice number', 'doklad', 'faktura', 'cislo faktury dodavatela', 'order number', 'order id'],
    kind: ['typ', 'typ dokladu', 'druh', 'druh dokladu', 'document type', 'type'],
    issueDate: ['datum vystavenia', 'datum vystaveni', 'vystavene', 'vystaveno', 'vystavenie', 'issue date', 'date', 'datum', 'order date'],
    taxDate: ['datum dodania', 'duzp', 'datum zdanitelneho plneni', 'datum uskutecneni zdanitelneho plneni', 'tax point date', 'delivery date', 'datum dodani', 'dodanie', 'dodane'],
    dueDate: ['datum splatnosti', 'splatnost', 'due date', 'splatne', 'splatna'],
    partner: ['odberatel', 'klient', 'zakaznik', 'customer', 'partner', 'nazov odberatela', 'nazev odberatele', 'firma', 'dodavatel', 'supplier', 'obchodny partner', 'nazov', 'nazov/meno', 'billing company', 'customer name', 'billing name'],
    ...ADDRESS,
    currency: ['mena', 'currency', 'mena dokladu'],
    fxRate: ['kurz', 'exchange rate', 'kurs'],
    vs: ['variabilny symbol', 'variabilni symbol', 'vs', 'variable symbol'],
    ks: ['konstantny symbol', 'konstantni symbol', 'ks'],
    ss: ['specificky symbol', 'ss'],
    lineName: ['polozka', 'nazov polozky', 'popis polozky', 'item', 'text polozky', 'line', 'item name', 'product name'],
    qty: ['mnozstvo', 'mnozstvi', 'pocet', 'qty', 'quantity', 'pocet mj'],
    unit: ['mj', 'jednotka', 'unit'],
    unitPrice: ['jednotkova cena', 'cena za mj', 'unit price', 'cena/mj', 'item cost', 'item price'],
    vatRate: ['sadzba dph', 'sazba dph', 'dph %', 'vat rate', 'sadzba', 'dph (%)'],
    net: ['zaklad', 'zaklad dane', 'suma bez dph', 'celkem bez dph', 'spolu bez dph', 'bez dph', 'net', 'total without vat', 'zaklad dph', 'celkom bez dph'],
    vat: ['dph', 'vyska dph', 'suma dph', 'vat', 'vat amount', 'dph spolu', 'dph celkem', 'dph celkom'],
    gross: ['celkom', 'suma', 'spolu', 'celkem', 'celkom s dph', 'celkem s dph', 'suma s dph', 'total', 'total with vat', 'k uhrade', 'celkova suma', 'order total'],
    paid: ['uhradene', 'uhrazeno', 'zaplatene', 'paid', 'uhrada', 'uhradena suma', 'zaplateno'],
    paidDate: ['datum uhrady', 'paid date', 'zaplatene dna', 'uhrazeno dne', 'datum zaplatenia', 'datum platby'],
    text: ['popis', 'text', 'poznamka', 'note', 'predmet', 'uvodny text'],
    paymentMethod: ['forma uhrady', 'sposob uhrady', 'zpusob uhrady', 'payment method', 'uhrada typ']
  }
});

/** The fields an entity can map, in the order the preview lists them. */
export function fieldsOf(entity) {
  return Object.keys(FIELDS[entity] || {});
}

/**
 * Guesses a mapping { field: columnIndex } from the header names. Each
 * column is used once; fields earlier in the list win.
 */
export function guessMapping(header, entity, extra = {}) {
  const names = (header || []).map(normalizeKey);
  const taken = new Set();
  const mapping = {};
  for (const [field, synonyms] of Object.entries(FIELDS[entity] || {})) {
    const all = [...(extra[field] || []).map(normalizeKey), ...synonyms];
    const index = all.reduce((found, name) => (found >= 0 ? found : names.findIndex((h, i) => h === name && !taken.has(i))), -1);
    if (index >= 0) {
      mapping[field] = index;
      taken.add(index);
    }
  }
  return mapping;
}

/** Which entity a table most likely holds, from how many fields its header matches. */
export function guessEntity(header, extra = {}) {
  const score = (entity) => Object.keys(guessMapping(header, entity, extra[entity])).length;
  const s = { contacts: score('contacts'), items: score('items'), documents: score('documents') };
  const docSignals = guessMapping(header, 'documents', extra.documents);
  if (docSignals.number !== undefined && (docSignals.issueDate !== undefined || docSignals.gross !== undefined)) return 'documents';
  if (s.items > s.contacts && (guessMapping(header, 'items', extra.items).price !== undefined)) return 'items';
  return s.contacts >= s.items ? 'contacts' : 'items';
}

/** A row read through a mapping: { field: cell text }. */
export function pick(row, mapping) {
  const out = {};
  Object.entries(mapping || {}).forEach(([field, index]) => {
    if (index !== null && index !== undefined && index >= 0) out[field] = row[index] ?? '';
  });
  return out;
}
