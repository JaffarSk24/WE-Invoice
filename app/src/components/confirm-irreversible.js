// Confirmation of an action that cannot be undone (sending through Peppol,
// closing a period, switching encryption off): the user must tick "I
// understand" before the danger button works, so a reflex click on Enter
// cannot do it.
import { h } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { t } from '../i18n/index.js';

export function confirmIrreversible({ title, message, okLabel = null, consequences = [] }) {
  return new Promise(resolve => {
    let answered = false;
    const check = h('input', { type: 'checkbox', id: 'irreversible-ack' });
    const body = h('div', { class: 'irreversible' },
      h('p', {}, message),
      consequences.length ? h('ul', { class: 'irreversible-list' }, consequences.map(c => h('li', {}, c))) : null,
      h('label', { for: 'irreversible-ack', class: 'checkbox-label' }, check, h('span', {}, t('confirm.irreversible.ack'))));
    const modal = openModal({
      title: title || t('confirm.irreversible.title'),
      body,
      onClose: () => { if (!answered) resolve(false); },
      actions: [
        { label: t('common.cancel'), onClick: (m) => m.close() },
        { label: okLabel || t('common.ok'), kind: 'danger', onClick: (m) => { if (!check.checked) return; answered = true; resolve(true); m.close(); } }
      ]
    });
    const danger = modal.footer.querySelector('.btn-danger');
    danger.disabled = true;
    check.addEventListener('change', () => { danger.disabled = !check.checked; });
  });
}
