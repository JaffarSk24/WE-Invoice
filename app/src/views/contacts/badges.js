// Small pieces of the contact screens: the VAT traffic light and the
// "receives eFaktúry" mark, always with an icon and a text (never colour
// alone), and the balance of a client in every currency it has.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { formatDateTime } from '../../components/dates.js';
import { formatAmount } from '../../components/decimal.js';
import { vatIndicator } from './checks.js';

const VAT_ICON = { green: 'circle-check', yellow: 'triangle-alert', red: 'circle-x', grey: 'circle' };

export function vatBadge(contact, { now = new Date(), withDate = false } = {}) {
  const light = vatIndicator(contact, now);
  if (light === 'none') return null;
  const at = contact.vatReliability && contact.vatReliability.checkedAt;
  return h('span', { class: `vat-light vat-${light}`, dataset: { light }, title: at ? t('contacts.vat.checkedAt', { date: formatDateTime(at) }) : t('contacts.vat.never') },
    icon(VAT_ICON[light]), h('span', {}, t(`contacts.vat.${light}`)),
    withDate && at ? h('span', { class: 'muted small' }, ` ${t('contacts.vat.checkedAt', { date: formatDateTime(at) })}`) : null);
}

export function peppolBadge(contact) {
  const capable = contact.peppolCapable;
  if (!capable || !capable.value) return null;
  return h('span', { class: 'vat-light vat-green peppol-badge', title: capable.checkedAt ? t('contacts.vat.checkedAt', { date: formatDateTime(capable.checkedAt) }) : null },
    icon('mail-check'), h('span', {}, t('contacts.peppol.capable')));
}

// "1 234,00 €" for each currency, or a dash.
export function balanceText(byCurrency, field) {
  const parts = Object.entries(byCurrency || {}).filter(([, v]) => v[field] && v[field] !== '0.00').map(([cur, v]) => formatAmount(v[field], cur));
  return parts.length ? parts.join(', ') : '\u2212';
}
