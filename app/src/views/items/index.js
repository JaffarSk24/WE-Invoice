// The items route: #/items (price list), #/items/new and #/items/<id>.
import '../../style/contacts.css';
import '../../style/items.css';
import { renderItemList } from './list.js';
import { renderItemForm } from './form.js';
import { subPath } from '../contacts/source.js';

export function createItemsView({ transport }) {
  return (root) => {
    const [first] = subPath();
    if (first === 'new') renderItemForm(root, null);
    else if (first) renderItemForm(root, first);
    else renderItemList(root, { transport });
  };
}
