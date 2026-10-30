// PDF bank statements: the text of every page, the way the Inbox reads
// PDFs, for the core reader of PDF statements. Banks protect them with a
// password; the user types it once, it is kept with the other secrets of
// the device (transport.secrets: the system keychain on the desktop,
// sealed with the data key in the browser) and tried on every next PDF.
// A password the PDF refuses asks again. Nothing of it is logged.
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { CoreError } from '@we-invoice/core';

export const passwordSecret = (companyId) => `bank-pdf:${companyId}`;

// The password also stays in memory while the app runs: in a browser whose
// secrets are still locked (no data key yet) it is asked once per run.
const SESSION = new Map();

/** True for the bytes of a PDF file. */
export function isPdf(bytes) {
  return bytes && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Asks for the password of a statement; null when the user cancels. */
export function askPassword({ name = '', wrong = false } = {}) {
  return new Promise(resolve => {
    let answered = false;
    const input = h('input', { type: 'password', class: 'input', autocomplete: 'off', id: 'bank-pdf-password', autofocus: true });
    const done = (m, value) => { answered = true; resolve(value); m.close(); };
    openModal({
      title: t('bank.pdf.passwordTitle'),
      body: h('div', { class: 'form-grid' },
        h('p', {}, t(wrong ? 'bank.pdf.passwordWrong' : 'bank.pdf.passwordText', { name })),
        h('label', { class: 'field', for: 'bank-pdf-password' }, h('span', {}, t('bank.pdf.password')), input),
        h('p', { class: 'field-hint' }, t('bank.pdf.passwordKept'))),
      onClose: () => { if (!answered) resolve(null); },
      actions: [
        { label: t('common.cancel'), onClick: (m) => { answered = true; resolve(null); m.close(); } },
        { label: t('bank.pdf.open'), kind: 'primary', onClick: (m) => { if (input.value) done(m, input.value); } }
      ]
    });
  });
}

async function textOf(pdf, toText) {
  try {
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) pages.push(toText(await pdf.pageItems(n)));
    return pages.join('\n');
  } finally {
    await pdf.destroy();
  }
}

/**
 * Remembers the statement password for a company and opens PDFs with it.
 * deps: open(bytes, {password}) and toText(items) read the PDF (ocr/pdf.js,
 * ocr/text-layout.js), ask() asks the user.
 */
export function createPdfReader({ secrets, companyId, open, toText, ask = askPassword, session = SESSION }) {
  const stored = async () => {
    if (!session.has(companyId)) {
      let value = null;
      try { value = (await secrets.get(passwordSecret(companyId))) || null; } catch (e) { console.warn('bank pdf: the password store is not readable', e.name); }
      if (value) session.set(companyId, value);
      return value;
    }
    return session.get(companyId);
  };
  const remember = async (password) => {
    session.set(companyId, password);
    try { await secrets.set(passwordSecret(companyId), password); } catch (e) { console.warn('bank pdf: the password was not kept', e.name); }
  };
  return async function readPdfText(bytes, name = '') {
    try {
      return await textOf(await open(bytes), toText);
    } catch (e) {
      if (e?.code !== 'PDF_PASSWORD') throw e;
    }
    let wrong = false;
    const saved = await stored();
    if (saved) {
      try { return await textOf(await open(bytes, { password: saved }), toText); } catch (e) {
        if (e?.code !== 'PDF_PASSWORD_WRONG') throw e;
        wrong = true;
      }
    }
    for (;;) {
      const password = await ask({ name, wrong });
      if (!password) throw new CoreError('BANK_PDF_PASSWORD_MISSING', 'the statement password was not given');
      try {
        const text = await textOf(await open(bytes, { password }), toText);
        await remember(password);
        return text;
      } catch (e) {
        if (e?.code !== 'PDF_PASSWORD_WRONG') throw e;
        wrong = true;
      }
    }
  };
}

/** The reader the import uses: pdf.js loads on first use. */
export async function statementPdfReader(ctx, companyId) {
  const [{ openPdf }, { itemsToText }] = await Promise.all([import('../../../ocr/pdf.js'), import('../../../ocr/text-layout.js')]);
  return createPdfReader({ secrets: ctx.transport.secrets, companyId, open: openPdf, toText: itemsToText });
}
