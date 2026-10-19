// One render function for every sales route: the hash decides between the
// list (#/invoices), a new document (#/invoices/new?kind=&contact=), the
// card of a document (#/invoices/<id>) and its editor (#/invoices/<id>/edit).
// A draft always opens in the editor; an issued document opens in the
// editor only while canEdit allows, otherwise its card is shown. The
// editor and the card (with the PDF and payment QR code) load on first use,
// so the start of the app stays light.
import { canEdit } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { LIST_ROUTES, parseSalesHash, salesHash, routeForKind } from './kinds.js';
import { findDocument } from './source.js';
import { renderDocumentList } from './list-view.js';

let leaveEditor = null;
let editorModules = null;

function loadEditor() {
  if (!editorModules) {
    editorModules = Promise.all([import('../editor/view.js'), import('../editor/detail-view.js')])
      .then(([view, detail]) => ({ renderEditor: view.renderEditor, renderDetail: detail.renderDetail }));
    editorModules.catch(() => { editorModules = null; });
  }
  return editorModules;
}

// Draws into root once the editor modules are there, unless the user has
// left the screen in the meantime.
function whenLoaded(root, draw) {
  const marker = h('p', { class: 'muted', 'aria-busy': 'true' }, t('documents.editor.loading'));
  root.append(marker);
  const hash = window.location.hash;
  loadEditor().then((m) => {
    if (!marker.isConnected || window.location.hash !== hash) return;
    marker.remove();
    draw(m);
  }).catch((e) => {
    console.error('The document editor could not be loaded', e);
    marker.textContent = t('errors.UNKNOWN');
  });
}

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
      whenLoaded(root, (m) => { leaveEditor = m.renderEditor(root, { route: name, kind: newKindFor(name, parsed.params.kind), params: parsed.params, transport }); });
      return;
    }
    const doc = findDocument(parsed.id);
    if (!doc) { notFound(root, name); return; }
    const home = routeForKind(doc.kind) || name;
    const editable = Array.isArray(doc.lines) && canEdit(doc).editable;
    if ((doc.status === 'DRAFT' && Array.isArray(doc.lines)) || (parsed.mode === 'edit' && editable)) {
      whenLoaded(root, (m) => { leaveEditor = m.renderEditor(root, { route: home, kind: doc.kind, doc, transport }); });
    } else {
      whenLoaded(root, (m) => m.renderDetail(root, { route: home, id: doc.id }));
    }
  };
}

