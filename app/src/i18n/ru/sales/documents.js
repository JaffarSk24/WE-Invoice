// Russian texts: document lists, the document editor, numbering and company
// settings (WP-SALES), in four files merged here.
import list from './documents/list.js';
import editor from './documents/editor.js';
import settings from './documents/settings.js';
import attachments from './documents/attachments.js';

export default { ...list, ...editor, ...settings, ...attachments };
