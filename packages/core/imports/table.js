// Importing a table (the rows of a CSV or an XLSX sheet) through a column
// mapping: contacts, price list items or documents. Rows of the same
// document number become the lines of one document; the partner of each
// document also comes in as a contact draft, so the plan can link it to an
// existing contact by IČO or add it.
import { emptyParsed, skip, warn } from './report.js';
import { pick, guessMapping, guessEntity } from './mapping.js';
import { contactDraft, itemDraft, documentDraft } from './records.js';
import { normalizeKey } from './values.js';

/**
 * @param {string[][]} rows  the table, header first (at options.headerRow)
 * @param {{entity?: string, mapping?: object, headerRow?: number, direction?: 'OUT'|'IN',
 *   company?: object, currency?: string, extraNames?: object}} options
 * @returns {{contacts: object[], items: object[], documents: object[], report: object, entity: string, mapping: object, header: string[]}}
 */
export function importRows(rows, options = {}) {
  const headerRow = options.headerRow || 0;
  const header = (rows[headerRow] || []).map(c => String(c ?? '').trim());
  const entity = options.entity || guessEntity(header, options.extraNames);
  const mapping = options.mapping || guessMapping(header, entity, options.extraNames && options.extraNames[entity]);
  const parsed = emptyParsed();
  const body = rows.slice(headerRow + 1).filter(r => r && r.some(c => String(c ?? '').trim() !== ''));
  const ctx = { company: options.company, currency: options.currency, direction: options.direction, country: options.country };

  if (entity === 'contacts') {
    body.forEach((row, i) => {
      const draft = contactDraft(pick(row, mapping), ctx);
      if (draft) parsed.contacts.push(draft);
      else skip(parsed.report, 'contacts', `#${headerRow + i + 2}`, 'MISSING_NAME');
    });
  } else if (entity === 'items') {
    body.forEach((row, i) => {
      const fields = pick(row, mapping);
      const draft = itemDraft(fields, ctx);
      if (draft) parsed.items.push(draft);
      else skip(parsed.report, 'items', fields.name || `#${headerRow + i + 2}`, fields.name ? 'MISSING_PRICE' : 'MISSING_NAME');
    });
  } else {
    const groups = new Map();
    body.forEach((row, i) => {
      const fields = pick(row, mapping);
      const key = normalizeKey(fields.number) || `#${headerRow + i + 2}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(fields);
    });
    for (const [key, group] of groups) {
      const { document, partner, reason, warnings } = documentDraft(group, ctx);
      if (!document) {
        skip(parsed.report, 'documents', group[0].number || key, reason);
        continue;
      }
      parsed.documents.push(document);
      if (partner) parsed.contacts.push(partner);
      [...new Set(warnings)].forEach(code => warn(parsed.report, 'documents', document.number, code));
    }
  }
  return { ...parsed, entity, mapping, header };
}
