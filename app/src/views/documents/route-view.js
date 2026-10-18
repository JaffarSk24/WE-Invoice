// One render function for every sales route: the hash decides between the
// list (#/invoices), a new document (#/invoices/new?kind=&contact=), the
// card of a document (#/invoices/<id>) and its editor (#/invoices/<id>/edit).
// A draft always opens in the editor; an issued document opens in the
// editor only while canEdit allows, otherwise its card is shown.
import { canEdit } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { LIST_ROUTES, parseSalesHash, salesHash, routeForKind } from './kinds.js';
import { findDocument } from './source.js';
import { renderDocumentList } from './list-view.js';
import { renderEditor } from '../editor/view.js';
import { renderDetail } from '../editor/detail-view.js';

let leaveEditor = null;

function notFound(root, route) {
  root.append(h('div', { class: 'detail' },
    h('p', { class: 'muted' }, t('documents.detail.notFound')),
    h('a', { href: salesHash(route), class: 'btn' }, icon('arrow-left'), t('documents.editor.back'))));
}

/** The kind a new document of a route gets: the asked one when the route shows it, else its first. */
export function newKindFor(route, asked) {
  const config = LIST_ROUTES[route];
  return config.kinds.includes(asked) ? asked : config.newKinds[0];
}

export function salesRoute({ transport }) {
  return function renderSales(root, route) {
    if (leaveEditor) { const leave = leaveEditor; leaveEditor = null; leave(); }
    const parsed = parseSalesHash(window.location.hash);
    const name = LIST_ROUTES[parsed.route] ? parsed.route : route;
    if (parsed.mode === 'list' || parsed.route !== name) { renderDocumentList(root, name); return; }
    if (parsed.mode === 'new') {
      leaveEditor = renderEditor(root, { route: name, kind: newKindFor(name, parsed.params.kind), params: parsed.params, transport });
      return;
    }
    const doc = findDocument(parsed.id);
    if (!doc) { notFound(root, name); return; }
    const home = routeForKind(doc.kind) || name;
    const editable = Array.isArray(doc.lines) && canEdit(doc).editable;
    if (doc.status === 'DRAFT' && Array.isArray(doc.lines)) {
      leaveEditor = renderEditor(root, { route: home, kind: doc.kind, doc, transport });
    } else if (parsed.mode === 'edit' && editable) {
      leaveEditor = renderEditor(root, { route: home, kind: doc.kind, doc, transport });
    } else {
      renderDetail(root, { route: home, id: doc.id });
    }
  };
}

