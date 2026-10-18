// The view of a route whose work package has not landed yet.
import { h, emptyState } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { navItem } from './nav.js';

export function renderPlaceholder(root, route) {
  const item = navItem(route);
  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, item ? t(item.label) : t('app.name'))),
    emptyState({ title: t('placeholder.title'), text: t('placeholder.text'), iconName: item ? item.icon : 'construction' })
  );
}
