// The recurring route: #/recurring (list), #/recurring/new (optionally
// ?from=<documentId> to start from an existing invoice) and
// #/recurring/<id>.
import '../../style/contacts.css';
import '../../style/recurring.css';
import { renderTemplateList } from './list.js';
import { renderTemplateForm } from './form.js';
import { subPath } from '../contacts/source.js';

export function createRecurringView({ transport }) {
  return (root) => {
    const [first] = subPath();
    if (first === 'new') renderTemplateForm(root, null);
    else if (first) renderTemplateForm(root, first);
    else renderTemplateList(root, { transport });
  };
}
