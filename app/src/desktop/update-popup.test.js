// @vitest-environment happy-dom
// The large window about a new version: once per version and run, the
// download and restart steps inside it, the release notes drawn as text.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUpdatePopup, notesView, notesFor } from './update-popup.js';
import { t } from '../i18n/index.js';

function fakeUpdates() {
  const listeners = new Set();
  return {
    download: vi.fn(), install: vi.fn(),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(state) { listeners.forEach(fn => fn(state)); }
  };
}

const NOTES = '## WE Invoice 0.1.5\n\nA fix.\n\n### Fixed\n\n- **Import:** reads [iDoklad](https://x) files.\n- Buttons keep `their` colour.';

describe('update popup', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('opens once per version, starts the download and offers the restart', () => {
    const updates = fakeUpdates();
    createUpdatePopup({ updates, t });
    const state = { status: 'available', latest: '0.1.5', current: '0.1.4', notes: NOTES, progress: 0 };
    updates.emit({ ...state, status: 'checking', latest: null });
    expect(document.querySelector('.update-popup')).toBeNull();
    updates.emit(state);
    expect(document.querySelectorAll('.update-popup')).toHaveLength(1);
    expect(document.querySelector('.modal-content').textContent).toContain('0.1.5');
    expect(document.querySelector('.update-popup-lead').textContent).toContain('0.1.4');
    [...document.querySelectorAll('.update-popup button')].find(b => b.textContent.includes(t('desktop.updates.updateNow'))).click();
    expect(updates.download).toHaveBeenCalledOnce();
    updates.emit({ ...state, status: 'downloading', progress: 0.42 });
    expect(document.querySelector('.update-popup [role="progressbar"]').getAttribute('aria-valuenow')).toBe('42');
    updates.emit({ ...state, status: 'ready' });
    [...document.querySelectorAll('.update-popup button')].find(b => b.textContent.includes(t('desktop.updates.install'))).click();
    expect(updates.install).toHaveBeenCalledOnce();
  });

  it('closes on Later and does not come back for the same version in this run', () => {
    const updates = fakeUpdates();
    createUpdatePopup({ updates, t });
    const state = { status: 'available', latest: '0.1.5', current: '0.1.4', notes: '' };
    updates.emit(state);
    [...document.querySelectorAll('.update-popup button')].find(b => b.textContent === t('desktop.updates.later')).click();
    expect(document.querySelector('.update-popup')).toBeNull();
    updates.emit(state);
    expect(document.querySelector('.update-popup')).toBeNull();
    updates.emit({ ...state, latest: '0.1.6' });
    expect(document.querySelector('.update-popup')).not.toBeNull();
  });

  it('draws the release notes as headings, list items and plain text', () => {
    const view = notesView(NOTES, 'none');
    expect(view.querySelector('h4').textContent).toBe('Fixed');
    expect([...view.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Import: reads iDoklad files.', 'Buttons keep their colour.']);
    expect(view.querySelector('a, strong')).toBeNull();
    expect(view.textContent).not.toContain('WE Invoice 0.1.5');
    expect(notesView('', 'none').textContent).toBe('none');
  });

  it('shows the notes in the language of the app, else in English', () => {
    const notes = '# WE Invoice 0.1.7\n\n## English\n\n### Fixed\n\n- Back arrow.\n\n## Slovenčina\n\n### Opravené\n\n- Šípka späť.\n\n## Русский\n\n### Исправлено\n\n- Стрелка «Назад».\n';
    expect(notesFor(notes, 'ru')).toBe('### Исправлено\n\n- Стрелка «Назад».');
    expect(notesFor(notes, 'sk')).toContain('Šípka späť.');
    expect(notesFor(notes, 'de')).toBe('### Fixed\n\n- Back arrow.');
    expect(notesFor(NOTES, 'ru')).toBe(NOTES);
    const updates = fakeUpdates();
    createUpdatePopup({ updates, t, lang: () => 'ru' });
    updates.emit({ status: 'available', latest: '0.1.7', current: '0.1.6', notes });
    expect(document.querySelector('.update-popup-notes').textContent).toBe('ИсправленоСтрелка «Назад».');
  });
});
