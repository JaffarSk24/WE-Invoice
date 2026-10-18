// SMP lookup: GET {smp}/{scheme}::{id} answers a ServiceGroup whose
// ServiceMetadataReference hrefs name the document types the participant
// receives. The SMP host comes from DNS, not from the client, but it still
// passes the private-network check before the request.
import { SCHEME_ID } from './peppol-sml.js';
import { resolvePublicHost } from '../lib/ssrf.js';
import { HttpError } from '../lib/errors.js';

export const encodeParticipant = (scheme, id) => encodeURIComponent(`${SCHEME_ID}::${scheme}:${id}`);

// Document type identifiers from a ServiceGroup XML, without the
// "busdox-docid-qns::" prefix.
export function parseServiceGroup(xml) {
  const types = [];
  const re = /<(?:\w+:)?ServiceMetadataReference\s+[^>]*href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(xml))) {
    const href = m[1].replace(/&amp;/g, '&');
    const idx = href.lastIndexOf('/services/');
    if (idx < 0) continue;
    let value;
    try {
      value = decodeURIComponent(href.slice(idx + '/services/'.length));
    } catch (e) {
      continue;
    }
    const sep = value.indexOf('::');
    types.push(sep >= 0 ? value.slice(sep + 2) : value);
  }
  return [...new Set(types)];
}

export async function fetchDocumentTypes(upstream, smpUrl, scheme, id, { lookup } = {}) {
  const url = `${smpUrl}/${encodeParticipant(scheme, id)}`;
  await resolvePublicHost(new URL(url).hostname, lookup);
  try {
    const xml = await upstream.text('smp', url, { headers: { accept: 'application/xml, text/xml' } });
    return { registered: true, documentTypes: parseServiceGroup(xml) };
  } catch (e) {
    if (e instanceof HttpError && e.statusCode === 404) return { registered: false, documentTypes: [] };
    throw e;
  }
}
