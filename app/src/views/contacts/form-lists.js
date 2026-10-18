// Repeating rows of the contact form: e-mail addresses with what each is
// for, contact persons and delivery addresses. Each editor keeps its rows
// in the page and returns them with value(); adding and removing a row
// never loses what the user typed in the others.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { EMAIL_PURPOSES } from './model.js';

function rowList({ title, addLabel, items, fields, id }) {
  const list = h('div', { class: 'repeat-rows' });
  const rows = [];

  function addRow(item = {}) {
    const inputs = {};
    const cells = fields.map(f => {
      if (f.kind === 'purposes') {
        const boxes = EMAIL_PURPOSES.map(p => {
          const box = h('input', { type: 'checkbox', value: p, checked: (item.purposes || []).includes(p) });
          return h('label', { class: 'checkbox-label inline-check' }, box, h('span', {}, t(`contacts.purpose.${p}`)));
        });
        inputs[f.name] = () => boxes.map(b => b.querySelector('input')).filter(b => b.checked).map(b => b.value);
        return h('div', { class: 'purpose-boxes', role: 'group', 'aria-label': t('contacts.emails.purposes') }, boxes);
      }
      const input = h('input', { type: f.type || 'text', value: item[f.name] || '', placeholder: t(f.label), 'aria-label': t(f.label), autocomplete: 'off' });
      inputs[f.name] = () => input.value.trim();
      return input;
    });
    const row = h('div', { class: 'repeat-row' }, cells,
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('contacts.removeRow'), onclick: () => { row.remove(); rows.splice(rows.indexOf(entry), 1); } }, icon('x')));
    const entry = { row, read: () => Object.fromEntries(Object.entries(inputs).map(([k, fn]) => [k, fn()])) };
    rows.push(entry);
    list.append(row);
    refreshIcons(row);
  }

  (items || []).forEach(addRow);
  const el = h('fieldset', { class: 'form-section', id },
    h('legend', {}, title),
    list,
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => addRow() }, icon('plus'), addLabel));
  return { el, value: () => rows.map(r => r.read()), addRow };
}

export function emailEditor(emails) {
  return rowList({
    id: 'contact-emails', title: t('contacts.section.emails'), addLabel: t('contacts.emails.add'), items: emails,
    fields: [{ name: 'address', label: 'contacts.field.email', type: 'email' }, { name: 'purposes', kind: 'purposes' }]
  });
}

export function personEditor(persons) {
  return rowList({
    id: 'contact-persons', title: t('contacts.section.persons'), addLabel: t('contacts.persons.add'), items: persons,
    fields: [
      { name: 'name', label: 'contacts.person.name' }, { name: 'role', label: 'contacts.person.role' },
      { name: 'email', label: 'contacts.field.email', type: 'email' }, { name: 'phone', label: 'contacts.field.phone', type: 'tel' }
    ]
  });
}

export function deliveryEditor(addresses) {
  const editor = rowList({
    id: 'contact-delivery', title: t('contacts.section.delivery'), addLabel: t('contacts.delivery.add'), items: addresses,
    fields: [
      { name: 'name', label: 'contacts.delivery.name' }, { name: 'street', label: 'contacts.field.street' },
      { name: 'zip', label: 'contacts.field.zip' }, { name: 'city', label: 'contacts.field.city' }
    ]
  });
  return { ...editor, value: () => editor.value().filter(a => a.street || a.city || a.name) };
}
