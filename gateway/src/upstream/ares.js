// ARES REST API of Czechia (ares.gov.cz): company by IČO. The answer is
// mapped to the common CompanyLookup shape of the contract.
import { mapLegalForm, nullIfEmpty } from './legal-form.js';

export function mapAresEntity(e, checkedAt = new Date().toISOString()) {
  if (!e || !e.obchodniJmeno) return null;
  const s = e.sidlo || {};
  const number = [nullIfEmpty(s.cisloDomovni), nullIfEmpty(s.cisloOrientacni)].filter(Boolean).join('/');
  const streetName = nullIfEmpty(s.nazevUlice) || nullIfEmpty(s.nazevCastiObce) || nullIfEmpty(s.nazevObce);
  const street = [streetName, number].filter(Boolean).join(' ') || nullIfEmpty(s.textovaAdresa);
  const zip = nullIfEmpty(s.psc);
  return {
    name: String(e.obchodniJmeno).trim(),
    ico: nullIfEmpty(e.ico),
    dic: nullIfEmpty(e.dic),
    icDph: nullIfEmpty(e.dic) ? `CZ${String(e.dic).replace(/^CZ/i, '')}` : null,
    legalForm: mapLegalForm(e.pravniForma),
    legalFormText: nullIfEmpty(e.pravniFormaText) || (nullIfEmpty(e.pravniForma) ? `Právní forma ${e.pravniForma}` : null),
    registerEntry: nullIfEmpty(e.spisovaZnacka),
    country: 'CZ',
    address: { street, city: nullIfEmpty(s.nazevObce), zip: zip ? zip.replace(/^(\d{3})(\d{2})$/, '$1 $2') : null, country: nullIfEmpty(s.kodStatu) || 'CZ' },
    source: 'ARES',
    checkedAt
  };
}

export async function fetchCompanyCz(upstream, config, ico) {
  const data = await upstream.json('ares', `${config.aresUrl}/ekonomicke-subjekty/${encodeURIComponent(ico.padStart(8, '0'))}`);
  return mapAresEntity(data);
}
