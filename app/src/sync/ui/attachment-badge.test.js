// @vitest-environment happy-dom
// The label next to an attachment follows the state of its file and
// stops listening once it is off the page; the texts for a file that
// cannot be opened say why.
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { attachmentBadge } from './attachment-badge.js';
import { setAttachmentFiles, attachmentState, attachmentStateKey, attachmentMissingKey } from '../attachments/registry.js';
import { on, emit } from '../../events.js';
import { setLanguage } from '../../i18n/index.js';

beforeAll(() => setLanguage('sk'));

afterEach(() => setAttachmentFiles(null));

function fakeFiles(states) {
  return { state: (id) => states[id] || 'synced' };
}

describe('attachment state label', () => {
  it('shows nothing without sync and for a file that is fine', () => {
    expect(attachmentState('x')).toBe('local');
    const el = attachmentBadge({ id: 'x' });
    expect(el.hidden).toBe(true);
    setAttachmentFiles(fakeFiles({}));
    expect(attachmentBadge({ id: 'x' }).hidden).toBe(true);
  });

  it('follows the state and stops listening once removed', () => {
    const states = { a1: 'pending' };
    setAttachmentFiles(fakeFiles(states));
    let listeners = 0;
    const listen = (event, fn) => { listeners += 1; const off = on(event, fn); return () => { listeners -= 1; off(); }; };
    const el = attachmentBadge({ id: 'a1' }, { listen });
    document.body.append(el);
    expect(el.hidden).toBe(false);
    expect(el.dataset.state).toBe('pending');
    expect(el.textContent).toBe('Čaká na nahratie do Google Drive');
    states.a1 = 'downloading';
    emit('attachments:status', { id: 'a1', state: 'downloading' });
    expect(el.dataset.state).toBe('downloading');
    states.a1 = 'synced';
    emit('attachments:status', { id: 'other', state: 'remote' });
    expect(el.dataset.state).toBe('downloading');
    emit('attachments:status', { id: null, state: null });
    expect(el.hidden).toBe(true);
    el.remove();
    emit('attachments:status', { id: 'a1', state: 'synced' });
    expect(listeners).toBe(0);
  });

  it('names the reason a file cannot be opened', () => {
    setAttachmentFiles(fakeFiles({ n: 'notUploaded', o: 'offline', r: 'remote' }));
    expect(attachmentMissingKey('n')).toBe('sync.attachments.missing.notUploaded');
    expect(attachmentMissingKey('o')).toBe('sync.attachments.missing.offline');
    expect(attachmentMissingKey('r')).toBe('documents.attachments.missing');
    expect(attachmentStateKey('synced')).toBeNull();
    expect(attachmentStateKey('remote')).toBe('sync.attachments.state.remote');
  });
});
