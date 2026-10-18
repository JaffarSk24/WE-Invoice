// Form pieces shared by the sync dialogs: a labelled password field, the
// strength hint and an error line. Text only through the dictionary.
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { passwordStrength } from '../crypto.js';

let seq = 0;

export function passwordField(labelKey, { autocomplete = 'current-password', autofocus = false } = {}) {
  const id = `sync-field-${++seq}`;
  const input = h('input', { type: 'password', id, autocomplete, autofocus: autofocus || null, class: 'sync-input' });
  const wrap = h('div', { class: 'sync-field' }, h('label', { for: id }, t(labelKey)), input);
  return { wrap, input };
}

export function textArea(labelKey, { rows = 4 } = {}) {
  const id = `sync-field-${++seq}`;
  const input = h('textarea', { id, rows, class: 'sync-input', autocomplete: 'off', spellcheck: 'false' });
  const wrap = h('div', { class: 'sync-field' }, h('label', { for: id }, t(labelKey)), input);
  return { wrap, input };
}

// A line under the password field that follows what is typed.
export function strengthHint(input) {
  const line = h('div', { class: 'sync-hint', dataset: { strength: '0' } }, t('sync.password.strength.0'));
  input.addEventListener('input', () => {
    const score = passwordStrength(input.value);
    line.dataset.strength = String(score);
    line.textContent = t(`sync.password.strength.${score}`);
  });
  return line;
}

export function errorLine() {
  const line = h('div', { class: 'sync-error', role: 'alert' });
  return {
    el: line,
    show(error) {
      console.error(error);
      const key = error && error.code ? `errors.${error.code}` : 'errors.UNKNOWN';
      const text = t(key);
      line.textContent = text === key ? t('errors.UNKNOWN') : text;
    },
    showKey(key, params) { line.textContent = t(key, params); },
    clear() { line.textContent = ''; }
  };
}

export function paragraph(key, params) {
  return h('p', { class: 'sync-text' }, t(key, params));
}
