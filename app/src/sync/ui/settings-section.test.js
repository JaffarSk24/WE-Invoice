// @vitest-environment happy-dom
// The sync section of Settings offers what fits the engine state and
// redraws when the state changes.
import { describe, it, expect, vi } from 'vitest';
import { syncActions, createSyncSection } from './settings-section.js';
import { emit } from '../../events.js';

describe('sync settings section', () => {
  it('offers the actions that fit the state', () => {
    expect(syncActions({ status: 'off', encrypted: false, locked: false })).toEqual(['signIn', 'encrypt']);
    expect(syncActions({ status: 'idle', encrypted: true, locked: false })).toEqual(['sync', 'changePassword', 'signOut']);
    expect(syncActions({ status: 'locked', encrypted: true, locked: true })).toEqual(['unlock', 'signOut']);
    expect(syncActions({ status: 'setup', encrypted: false, locked: false })).toEqual(['encrypt', 'signOut']);
    expect(syncActions({ status: 'renew', encrypted: true, locked: false })).toEqual(['sync', 'changePassword', 'signOut']);
  });

  it('shows the account, syncs and signs out, and follows sync:status', async () => {
    const engine = {
      state: { status: 'idle', email: 'jan@example.com', lastSyncAt: '2026-10-18T08:00:00.000Z', encrypted: true, locked: false },
      sync: vi.fn(async () => ({ ok: true })),
      signOut: vi.fn(async () => { engine.state = { status: 'off', email: '', encrypted: true, locked: false }; emit('sync:status', engine.state); })
    };
    const container = document.createElement('div');
    document.body.append(container);
    createSyncSection({ engine, transport: {} })(container);
    expect(container.textContent).toContain('jan@example.com');
    container.querySelector('#settings-sync-sync').click();
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledWith('manual'));
    container.querySelector('#settings-sync-signOut').click();
    await vi.waitFor(() => expect(container.querySelector('#settings-sync-signIn')).not.toBeNull());
    expect(container.querySelector('#settings-sync-signOut')).toBeNull();
    expect(container.textContent).not.toContain('jan@example.com');
    container.remove();
  });
});
