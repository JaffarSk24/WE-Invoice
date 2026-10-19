// German texts: document lists, the document editor, numbering and company
// settings (WP-SALES), in three files merged here.
import list from './documents/list.js';
import editor from './documents/editor.js';
import settings from './documents/settings.js';

export default { ...list, ...editor, ...settings };
