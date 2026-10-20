// The running attachment files (files.js) for the screens: the state of
// one attachment and the dictionary key that explains a file that cannot
// be opened. Set once by boot/sync.js; without it (tests, the demo) every
// file counts as kept on this device.
let instance = null;

export function setAttachmentFiles(files) {
  instance = files || null;
}

export function getAttachmentFiles() {
  return instance;
}

/** One of ATTACHMENT_STATES (files.js). */
export function attachmentState(id) {
  return instance ? instance.state(id) : 'local';
}

/** The dictionary key of a state's short label, or null for the states that need none. */
export function attachmentStateKey(state) {
  return ['pending', 'remote', 'downloading', 'notUploaded', 'offline'].includes(state) ? `sync.attachments.state.${state}` : null;
}

/**
 * Why a file could not be opened, as a dictionary key with {name}: not
 * uploaded yet by the device that added it, Drive out of reach, or simply
 * not on this device (sync off).
 */
export function attachmentMissingKey(id) {
  const state = attachmentState(id);
  if (state === 'notUploaded') return 'sync.attachments.missing.notUploaded';
  if (state === 'offline') return 'sync.attachments.missing.offline';
  return 'documents.attachments.missing';
}
