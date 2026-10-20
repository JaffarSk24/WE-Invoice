// @vitest-environment happy-dom
// The window before sending names the attachments Peppol does not take, and
// the outcome toast names the first problem of a document to fix.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { confirmSend, skippedAttachmentNames, reportSendResult } from './send-dialog.js';
import { errorText } from './common.js';

beforeEach(() => { document.body.innerHTML = ''; });

const doc = (attachments) => ({ id: 'd', number: 'FA7', attachments });
const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));

describe('e-invoice send window', () => {
  it('sends straight away when every attachment can be embedded', async () => {
    expect(await confirmSend(doc([{ name: 'a.pdf', mime: 'application/pdf' }]))).toBe(true);
    expect(document.querySelector('.modal-content')).toBeNull();
  });

  it('lists the attachments left out and sends only after the user agrees', async () => {
    const d = doc([{ name: 'a.pdf', mime: 'application/pdf' }, { name: 'b.docx', mime: 'application/msword' }, { name: 'c.zip', mime: 'application/zip' }]);
    expect(skippedAttachmentNames(d)).toEqual(['b.docx', 'c.zip']);
    const answer = confirmSend(d);
    const items = [...document.querySelectorAll('.peppol-skipped li')].map(li => li.textContent);
    expect(items).toEqual(['b.docx', 'c.zip']);
    const buttons = document.querySelectorAll('.modal-actions button');
    click(buttons[buttons.length - 1]);
    expect(await answer).toBe(true);
    expect(document.querySelector('.modal-content')).toBeNull();
  });

  it('cancelling does not send', async () => {
    const answer = confirmSend(doc([{ name: 'b.docx', mime: 'application/msword' }]));
    click(document.querySelector('.modal-actions button'));
    expect(await answer).toBe(false);
  });

  it('turns attachment errors into texts with names and sizes', () => {
    expect(errorText({ code: 'ATTACHMENT_MISSING', message: 'a.pdf, b.png' })).toContain('a.pdf, b.png');
    const size = errorText({ code: 'MESSAGE_TOO_LARGE', params: { bytes: 12.5 * 1024 * 1024, limit: 10 * 1024 * 1024 } });
    expect(size).toMatch(/12[.,]5/);
    expect(size).toMatch(/10/);
  });

  it('the toast of a document to fix names its first problem', () => {
    const showToast = vi.fn();
    reportSendResult({ number: 'FA7', peppol: { status: 'INVALID', errors: [{ code: 'ATTACHMENT_MISSING', message: 'foto.jpg' }] } }, { showToast, showError: vi.fn() });
    expect(showToast.mock.calls[0][0]).toContain('foto.jpg');
    expect(showToast.mock.calls[0][1].type).toBe('error');
  });
});
