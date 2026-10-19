// What is missing before a document may be issued, shown twice: as a list
// at the top of the editor and at each field (§ 3.6.1). Particulars of the
// seller are fixed in the company settings, so their messages link there.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';

/** The editor field a missing particular belongs to: "party", "head.<field>", "lines" or "company". */
export function missingTarget(field) {
  if (field.startsWith('seller.')) return 'company';
  if (field.startsWith('buyer.')) return 'party';
  if (field.startsWith('lines')) return 'lines';
  return `head.${field}`;
}

export function missingCallout(missing) {
  if (!missing || !missing.length) return null;
  const company = missing.some(m => missingTarget(m.field) === 'company');
  return h('div', { class: 'callout callout-danger editor-missing', role: 'alert', id: 'editor-missing' },
    h('strong', {}, t('documents.editor.missingTitle')),
    h('ul', {}, [...new Set(missing.map(m => m.code))].map(code => h('li', {}, t(`document.missing.${code}`)))),
    company ? h('a', { href: '#/settings/company', class: 'btn btn-ghost btn-sm' }, icon('building-2'), t('documents.editor.fixCompany')) : null);
}
