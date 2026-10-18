// Toasts instead of blocking alert(), ported from WE Budget. The container
// is an aria-live region, so screen readers announce every toast.
// showToast(message, { type: 'success'|'error'|'info', actionLabel, onAction, duration })
import { t } from '../i18n/index.js';

let container = null;

function ensureContainer() {
  if (!container || !container.isConnected) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('role', 'status');
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, options = {}) {
  const { type = 'info', actionLabel = null, onAction = null, duration = 5000 } = options;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;
  toast.appendChild(text);

  let timeoutId = null;
  const dismiss = () => {
    clearTimeout(timeoutId);
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 200);
  };

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => { onAction(); dismiss(); });
    toast.appendChild(btn);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', t('common.close'));
  close.textContent = '\u00d7';
  close.addEventListener('click', dismiss);
  toast.appendChild(close);

  ensureContainer().appendChild(toast);
  timeoutId = setTimeout(dismiss, duration);
  return dismiss;
}

// An error for the user (translated by its code) and the technical cause
// for the console: errors are never swallowed.
export function showError(error, fallbackKey = 'errors.UNKNOWN') {
  console.error(error);
  const key = error && error.code ? `errors.${error.code}` : fallbackKey;
  const text = t(key);
  return showToast(text === key ? t(fallbackKey) : text, { type: 'error', duration: 8000 });
}
