// Labels printed on Slovak, Czech, English and German invoices and
// receipts, folded (lower case, no diacritics). Within a list the more
// specific label comes first: it wins over a general one.

export const LABELS = Object.freeze({
  number: [
    'cislo faktury', 'faktura cislo', 'faktura c\\.', 'cislo dokladu', 'doklad cislo', 'doklad c\\.', 'danovy doklad c\\.',
    'dobropis c\\.', 'dobropis', 'opravny danovy doklad c\\.', 'credit note no\\.?', 'credit note', 'gutschrift nr\\.?',
    'invoice number', 'invoice no\\.?', 'invoice #', 'rechnungsnummer', 'rechnung nr\\.?', 'faktura -? ?danovy doklad', 'faktura', 'invoice'
  ],
  issueDate: [
    'datum vyhotovenia', 'datum vystavenia', 'datum vystaveni', 'vystavene dna', 'vystaveno', 'issue date', 'date of issue', 'invoice date',
    'rechnungsdatum', 'ausstellungsdatum', 'datum'
  ],
  taxDate: [
    'datum dodania tovaru alebo sluzby', 'datum dodania', 'datum uskutocnenia zdanitelneho plnenia', 'datum zdanitelneho plnenia', 'datum uskutecneni zdanitelneho plneni', 'datum zdanitelneho plneni', 'duzp',
    'datum dodani', 'date of supply', 'delivery date', 'leistungsdatum', 'lieferdatum'
  ],
  dueDate: ['datum splatnosti', 'splatnost', 'splatne do', 'due date', 'payment due', 'faelligkeitsdatum', 'falligkeitsdatum', 'zahlbar bis'],
  vs: ['variabilny symbol', 'variabilni symbol', 'var\\. symbol', 'v\\. ?s\\.', 'vs'],
  ks: ['konstantny symbol', 'konstantni symbol', 'konst\\. symbol', 'k\\. ?s\\.', 'ks'],
  ss: ['specificky symbol', 'spec\\. symbol', 's\\. ?s\\.', 'ss'],
  total: [
    'celkom k uhrade', 'celkova suma k uhrade', 'suma k uhrade', 'celkem k uhrade', 'k uhrade celkem', 'zostava uhradit', 'k uhrade', 'na uhradu',
    'total due', 'amount due', 'balance due', 'grand total', 'total amount', 'zu zahlen', 'gesamtbetrag', 'rechnungsbetrag',
    'celkom s dph', 'spolu s dph', 'celkem s dph', 'cena celkom', 'celkom', 'celkem', 'spolu', 'suma', 'total'
  ],
  net: [
    'zaklad dane spolu', 'spolu bez dph', 'celkom bez dph', 'celkem bez dph', 'suma bez dph', 'cena bez dph', 'zaklad dane', 'total net', 'net amount',
    'subtotal', 'nettobetrag', 'summe netto', 'netto'
  ],
  vat: ['dph spolu', 'dph celkom', 'celkom dph', 'spolu dph', 'vyska dph', 'dph celkem', 'suma dph', 'total vat', 'vat amount', 'vat total', 'mwst\\.?', 'umsatzsteuer', 'vat', '(?<!bez |s |ic |ic pre |vratane |vcetne )dph'],
  supplier: ['dodavatel', 'supplier', 'seller', 'predavajuci', 'prodavajici', 'lieferant', 'verkaufer', 'vystavil', 'from'],
  buyer: ['odberatel', 'objednavatel', 'customer', 'buyer', 'bill to', 'kunde', 'rechnungsempfanger', 'kupujuci', 'kupujici'],
  bic: ['bic', 'swift']
});

// Labels of identifiers: the value is classified by checksum anyway.
export const ID_LABELS = Object.freeze({
  ico: '(?:ico|ic)',
  dic: '(?:dic)',
  icDph: '(?:ic dph|ic pre dph|i\\.c\\. dph|vat id|vat no\\.?|vat number|vat reg\\.? no\\.?|ust-?idnr\\.?|ust-?id|dic)'
});

export const KIND_HINTS = Object.freeze([
  { kind: 'RECEIVED_CREDIT_NOTE', pattern: 'dobropis|opravny danovy doklad|credit note|gutschrift|rechnungskorrektur' },
  { kind: 'EXPENSE_RECEIPT', pattern: 'pokladnicny doklad|pokladnicni doklad|\\bokp\\b|ekasa|e-kasa|uctenka|kassenbon|\\bblocek\\b|kod pokladne' }
]);

export const CURRENCIES = Object.freeze([
  { code: 'EUR', pattern: '€|\\beur\\b' },
  { code: 'CZK', pattern: '\\bczk\\b|\\bkc\\b' },
  { code: 'USD', pattern: '\\busd\\b|\\$' },
  { code: 'GBP', pattern: '\\bgbp\\b|£' },
  { code: 'PLN', pattern: '\\bpln\\b|\\bzl\\b' },
  { code: 'HUF', pattern: '\\bhuf\\b|\\bft\\b' },
  { code: 'CHF', pattern: '\\bchf\\b' }
]);
