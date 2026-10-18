// Showing the 24 recovery words once (print, save, copy) and asking three
// of them back, so the key is really written down before anything goes to
// Drive.
import { h } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { t } from '../../i18n/index.js';
import { errorLine, paragraph } from './fields.js';

function wordGrid(words) {
  return h('ol', { class: 'sync-words' }, ...words.map(w => h('li', {}, h('span', {}, w))));
}

function printWords(words) {
  const win = window.open('', '_blank', 'width=600,height=800');
  if (!win) return;
  const doc = win.document;
  const title = doc.createElement('h1');
  title.textContent = `WE Invoice: ${t('sync.recovery.title')}`;
  const note = doc.createElement('p');
  note.textContent = t('sync.recovery.fileText');
  const list = doc.createElement('ol');
  words.forEach(w => { const li = doc.createElement('li'); li.textContent = w; list.appendChild(li); });
  doc.body.append(title, note, list);
  doc.body.style.fontFamily = 'sans-serif';
  win.focus();
  win.print();
}

// Resolves true when the user confirmed the words, false when the dialog
// was closed.
export function showRecoveryWords({ words, positions, transport, showToast }) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const fileText = `${t('sync.recovery.fileText')}\n\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}\n`;
    const tools = h('div', { class: 'sync-tools' },
      h('button', { type: 'button', class: 'btn', onclick: () => printWords(words) }, t('sync.recovery.print')),
      h('button', { type: 'button', class: 'btn', onclick: () => transport.files.saveAs(t('sync.recovery.fileName'), new Blob([fileText], { type: 'text/plain' })) }, t('sync.recovery.save')),
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => navigator.clipboard.writeText(words.join(' ')).then(() => showToast(t('sync.recovery.copied'), { type: 'success' })).catch(e => console.warn('Clipboard unavailable', e))
      }, t('sync.recovery.copy')));
    const modal = openModal({
      title: t('sync.recovery.title'),
      body: h('div', {}, paragraph('sync.recovery.text'), wordGrid(words), tools),
      onClose: () => finish(false),
      actions: [{
        label: t('sync.recovery.written'), kind: 'primary',
        onClick: (m) => {
          m.close();
          confirmWords({ words, positions }).then(ok => { finish(ok); });
        }
      }]
    });
    return modal;
  });
}

function confirmWords({ words, positions }) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const error = errorLine();
    const inputs = positions.map(p => {
      const input = h('input', { type: 'text', class: 'sync-input', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      return { p, input, wrap: h('div', { class: 'sync-field' }, h('label', {}, t('sync.recovery.word', { n: p + 1 })), input) };
    });
    openModal({
      title: t('sync.recovery.confirmTitle'),
      body: h('div', {}, paragraph('sync.recovery.confirmText'), ...inputs.map(i => i.wrap), error.el),
      onClose: () => finish(false),
      actions: [{
        label: t('sync.recovery.confirm'), kind: 'primary',
        onClick: (m) => {
          const ok = inputs.every(({ p, input }) => input.value.trim().toLowerCase() === words[p]);
          if (!ok) { error.showKey('sync.recovery.confirmWrong'); return; }
          finish(true);
          m.close();
        }
      }]
    });
  });
}
