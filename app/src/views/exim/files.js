// Saving and opening files through the transport (a download in the
// browser, the system dialog on the desktop), and reading what was opened.
import { getTransport } from '../../transport/index.js';

export async function saveFile(name, data, type, transport = null) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  return (transport || getTransport()).files.saveAs(name, blob);
}

/** @returns {Promise<File[]>} the files the user picked (none on cancel) */
export async function pickFiles({ accept = '', multiple = false } = {}, transport = null) {
  const picked = await (transport || getTransport()).files.openFile({ accept, multiple });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function fileBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}
