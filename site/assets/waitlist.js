// The waitlist form: validates on the client, sends JSON to the gateway
// (gateway/openapi.yaml, POST /v1/waitlist) and shows a message in the
// language of the page. The messages come from data attributes of the form
// so this script carries no text. Errors are shown to the visitor and the
// technical cause goes to the console.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function message(form, key) {
  return form.dataset[`msg${key[0].toUpperCase()}${key.slice(1)}`] || '';
}

function show(form, key, ok) {
  const status = form.querySelector('.form-status');
  status.textContent = message(form, key);
  status.classList.toggle('ok', !!ok);
  status.classList.toggle('bad', !ok);
}

// `data` is the FormData of the form (or anything with get and getAll).
export function readForm(data) {
  const vat = data.get('vatPayer');
  return {
    email: String(data.get('email') || '').trim(),
    lang: String(data.get('lang') || 'sk'),
    consent: data.get('consent') === 'true',
    source: String(data.get('source') || 'site'),
    interests: data.getAll('interests').map(String),
    vatPayer: vat === 'true' ? true : vat === 'false' ? false : null,
    website: String(data.get('website') || ''),
    startedAt: Number(data.get('startedAt')) || Date.now()
  };
}

// The message key for a response, or null when it was accepted.
export function outcome(status) {
  if (status === 202 || status === 200) return null;
  if (status === 429) return 'rateLimited';
  return 'badRequest';
}

async function submit(form) {
  const body = readForm(new FormData(form));
  if (!EMAIL.test(body.email)) { show(form, 'invalidEmail'); form.elements.email.focus(); return; }
  if (!body.consent) { show(form, 'consent'); form.elements.consent.focus(); return; }

  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = form.dataset.sending || label;
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const key = outcome(response.status);
    if (!key) {
      show(form, 'success', true);
      form.querySelectorAll('input, button, fieldset').forEach(el => { el.disabled = true; });
      return;
    }
    const detail = await response.text().catch(() => '');
    console.warn(`Waitlist: ${response.status} ${detail.slice(0, 200)}`);
    show(form, key);
  } catch (error) {
    console.error('Waitlist: request failed', error);
    show(form, 'network');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function init() {
  const form = document.getElementById('waitlist-form');
  if (!form) return;
  form.elements.startedAt.value = String(Date.now());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(form);
  });
}

if (typeof document !== 'undefined') init();
