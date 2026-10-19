// The contacts route: #/contacts (list), #/contacts/new, #/contacts/<id>
// (card) and #/contacts/<id>/edit. The route name is the first segment;
// the rest of the hash is read here.
import '../../style/contacts.css';
import { renderContactList } from './list.js';
import { renderContactDetail } from './detail.js';
import { renderContactForm } from './form.js';
import { openLookupDialog } from './lookup-dialog.js';
import { openMergeDialog } from './merge-dialog.js';
import { subPath } from './source.js';

export function createContactsView({ transport }) {
  return (root) => {
    const [first, second] = subPath();
    if (first === 'new') renderContactForm(root, null, { transport });
    else if (first && second === 'edit') renderContactForm(root, first, { transport });
    else if (first) renderContactDetail(root, first, { transport });
    else renderContactList(root, { openLookup: () => openLookupDialog({ transport }), openMerge: () => openMergeDialog() });
  };
}
