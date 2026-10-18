// Sample upstream answers shared by the route and contract tests.
export const RPO_ENTITY = {
  id: 1,
  identifiers: [{ value: '35763469', validFrom: '1999-01-01' }],
  fullNames: [{ value: 'Old name s. r. o.', validFrom: '1999-01-01', validTo: '2010-01-01' }, { value: 'Example s. r. o.', validFrom: '2010-01-01' }],
  legalForms: [{ value: { code: '112', value: 'Spoločnosť s ručením obmedzeným' }, validFrom: '1999-01-01' }],
  addresses: [{ street: 'Hlavná', buildingNumber: '12', regNumber: '345', municipality: { value: 'Bratislava' }, postalCodes: ['81101'], country: { value: 'Slovenská republika' }, validFrom: '1999-01-01' }]
};

export const ARES_ENTITY = {
  ico: '27074358', obchodniJmeno: 'Alza.cz a.s.', dic: 'CZ27074358', pravniForma: '121',
  sidlo: { nazevUlice: 'Jankovcova', cisloDomovni: 1522, cisloOrientacni: 53, nazevObce: 'Praha', psc: 17000, kodStatu: 'CZ', textovaAdresa: 'Jankovcova 1522/53, Holešovice, 170 00 Praha 7' }
};

export const VIES_VALID = { countryCode: 'SK', vatNumber: '2020317068', requestDate: '2026-10-18', isValid: true, name: 'EXAMPLE s. r. o.', address: 'Hlavná 1\n811 01 Bratislava', userError: 'VALID' };

export const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<gesmes:subject>Reference rates</gesmes:subject>
<Cube>
<Cube time="2026-10-16"><Cube currency="USD" rate="1.0876"/><Cube currency="CZK" rate="24.355"/><Cube currency="PLN" rate="4.2690"/></Cube>
<Cube time="2026-10-15"><Cube currency="USD" rate="1.0850"/><Cube currency="CZK" rate="24.401"/></Cube>
</Cube>
</gesmes:Envelope>`;

export const EKASA_RECEIPT = {
  receipt: {
    receiptId: 'O-1234567890ABCDEF1234567890ABCDEF', okp: 'abcd1234-ef567890-12345678-90abcdef-12345678', cashRegisterCode: '88812345678900001',
    issueDate: '17.10.2026 14:05:33', totalPrice: 12.5, vatAmountBasic: 2.08, taxBaseBasic: 10.42,
    organization: { name: 'Predajňa s. r. o.', ico: '12345678', dic: '2020123456', icDph: 'SK2020123456', streetName: 'Hlavná', buildingNumber: '1', postalCode: '81101', municipality: 'Bratislava' },
    items: [{ name: 'Káva', quantity: 2, price: 5, vatRate: 23 }, { name: 'Voda', quantity: 1, price: 2.5, vatRate: 23 }]
  }
};

export const SMP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ServiceGroup xmlns="http://busdox.org/serviceMetadata/publishing/1.0/" xmlns:id="http://busdox.org/transport/identifiers/1.0/">
<id:ParticipantIdentifier scheme="iso6523-actorid-upis">0245:2020317068</id:ParticipantIdentifier>
<ServiceMetadataReferenceCollection>
<ServiceMetadataReference href="https://smp.example.test/iso6523-actorid-upis%3A%3A0245%3A2020317068/services/busdox-docid-qns%3A%3Aurn%3Aoasis%3Anames%3Aspecification%3Aubl%3Aschema%3Axsd%3AInvoice-2%3A%3AInvoice%23%23urn%3Acen.eu%3Aen16931%3A2017%23compliant%23urn%3Afdc%3Apeppol.eu%3A2017%3Apoacc%3Abilling%3A3.0%3A%3A2.1"/>
<ServiceMetadataReference href="https://smp.example.test/iso6523-actorid-upis%3A%3A0245%3A2020317068/services/busdox-docid-qns%3A%3Aurn%3Aoasis%3Anames%3Aspecification%3Aubl%3Aschema%3Axsd%3ACreditNote-2%3A%3ACreditNote%23%23urn%3Acen.eu%3Aen16931%3A2017%23compliant%23urn%3Afdc%3Apeppol.eu%3A2017%3Apoacc%3Abilling%3A3.0%3A%3A2.1"/>
<ServiceMetadataReference href="https://smp.example.test/other"/>
</ServiceMetadataReferenceCollection>
</ServiceGroup>`;

export const INVOICE_DOCTYPE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1';

export const FS_TAX_SUBJECTS = { page: 1, pages: 1, itemsCount: 1, data: [{ ICO: '35763469', DIC: '2020317068', IC_DPH: 'SK2020317068', NAZOV: 'Example s. r. o.' }] };
export const FS_LIST = (icdph) => ({ page: 1, pages: 1, itemsCount: icdph ? 1 : 0, data: icdph ? [{ IC_DPH: icdph }] : [] });

export const NAPTR_RECORD = { flags: 'U', service: 'Meta:SMP', regexp: '!^.*$!https://smp.example.test!', replacement: '', order: 100, preference: 10 };
