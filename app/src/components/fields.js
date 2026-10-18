// Form fields: a label, the control, a hint and an error line wired with
// aria. Every field returns { el, input, setError, value() }. The amount
// field accepts both "," and "." and keeps its value as a decimal string.
import { h, selectEl } from '../ui/dom.js';
import { parseDecimal, toInputText } from './decimal.js';

let counter = 0;
const nextId = (prefix) => `${prefix}-${++counter}`;

function wrap({ id, label, hint = null, required = false, control, cls = '' }) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-error`;
  const error = h('div', { class: 'field-error', id: errorId, role: 'alert', hidden: true });
  control.setAttribute('aria-describedby', [hintId, errorId].filter(Boolean).join(' '));
  if (required) control.setAttribute('aria-required', 'true');
  const el = h('div', { class: `field ${cls}`.trim() },
    label ? h('label', { for: id }, label, required ? h('span', { class: 'field-required', 'aria-hidden': 'true' }, ' *') : null) : null,
    control,
    hint ? h('div', { class: 'field-hint', id: hintId }, hint) : null,
    error);
  const setError = (message) => {
    error.textContent = message || '';
    error.hidden = !message;
    control.setAttribute('aria-invalid', message ? 'true' : 'false');
    el.classList.toggle('field-invalid', Boolean(message));
  };
  return { el, input: control, setError };
}

export function textField({ label, value = '', name = null, type = 'text', placeholder = null, hint = null, required = false, attrs = {}, onInput = null }) {
  const id = nextId('f');
  const input = h('input', { type, id, name, value, placeholder, autocomplete: 'off', ...attrs });
  if (onInput) input.addEventListener('input', () => onInput(input.value));
  const field = wrap({ id, label, hint, required, control: input });
  return { ...field, value: () => input.value.trim() };
}

export function textArea({ label, value = '', name = null, rows = 3, hint = null, attrs = {} }) {
  const id = nextId('f');
  const input = h('textarea', { id, name, rows, ...attrs }, value);
  const field = wrap({ id, label, hint, control: input });
  return { ...field, value: () => input.value };
}

// Integer or decimal number; value() returns a decimal string or null.
export function numberField({ label, value = null, name = null, hint = null, required = false, attrs = {}, onChange = null }) {
  const id = nextId('f');
  const input = h('input', { type: 'text', inputmode: 'decimal', id, name, value: toInputText(value), autocomplete: 'off', class: 'num', ...attrs });
  const field = wrap({ id, label, hint, required, control: input });
  const read = () => parseDecimal(input.value);
  input.addEventListener('change', () => {
    const parsed = read();
    if (parsed !== null) input.value = toInputText(parsed);
    if (onChange) onChange(parsed);
  });
  return { ...field, value: read };
}

// Money: like numberField, with the currency shown after the input.
export function amountField({ label, value = null, currency = 'EUR', name = null, hint = null, required = false, onChange = null }) {
  const field = numberField({ label, value, name, hint, required, onChange, attrs: { class: 'num amount-input' } });
  const group = h('div', { class: 'amount-group' }, field.input, h('span', { class: 'amount-currency', 'aria-hidden': 'true' }, currency));
  field.el.insertBefore(group, field.el.querySelector('.field-hint, .field-error'));
  return field;
}

// Calendar date as YYYY-MM-DD (no time zone).
export function dateField({ label, value = '', name = null, hint = null, required = false, attrs = {} }) {
  const id = nextId('f');
  const input = h('input', { type: 'date', id, name, value, ...attrs });
  const field = wrap({ id, label, hint, required, control: input });
  return { ...field, value: () => input.value || null };
}

export function selectField({ label, options, value = null, name = null, hint = null, required = false, onChange = null, attrs = {} }) {
  const id = nextId('f');
  const input = selectEl(options, value, { id, name, ...attrs });
  if (onChange) input.addEventListener('change', () => onChange(input.value));
  const field = wrap({ id, label, hint, required, control: input });
  return { ...field, value: () => input.value };
}

export function checkboxField({ label, checked = false, name = null, hint = null, onChange = null }) {
  const id = nextId('f');
  const input = h('input', { type: 'checkbox', id, name, checked });
  if (onChange) input.addEventListener('change', () => onChange(input.checked));
  const el = h('div', { class: 'field field-checkbox' },
    h('label', { for: id, class: 'checkbox-label' }, input, h('span', {}, label)),
    hint ? h('div', { class: 'field-hint' }, hint) : null);
  return { el, input, value: () => input.checked, setError: () => {} };
}

// A group of radio cards: options [{ value, label, hint }].
export function radioGroup({ label, name, options, value = null, onChange = null }) {
  const id = nextId('f');
  const inputs = [];
  const el = h('fieldset', { class: 'field radio-group', id },
    h('legend', {}, label),
    options.map(o => {
      const input = h('input', { type: 'radio', name, value: o.value, checked: o.value === value, id: `${id}-${o.value}` });
      if (onChange) input.addEventListener('change', () => { if (input.checked) onChange(o.value); });
      inputs.push(input);
      return h('label', { class: 'radio-card', for: `${id}-${o.value}` }, input,
        h('span', { class: 'radio-text' }, h('span', { class: 'radio-title' }, o.label), o.hint ? h('span', { class: 'radio-hint' }, o.hint) : null));
    }));
  return { el, inputs, value: () => { const hit = inputs.find(i => i.checked); return hit ? hit.value : null; }, setError: () => {} };
}
