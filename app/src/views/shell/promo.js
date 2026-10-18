// The White Eagles strip, as in WE Budget and WE Time Tracker: a badge in
// the brand gradient, one line of text, the link to whiteeagles.sk and
// the copyright. Fixed at the bottom of the main area on wide screens;
// on a phone the same block ends the More screen and the dashboard.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';

export const WHITE_EAGLES_URL = 'https://whiteeagles.sk/';

export function copyrightText(year = new Date().getFullYear()) {
  return `© ${year} White Eagles & Co. s. r. o. ${t('footer.rights')}`;
}

export function promoFooter({ inline = false } = {}) {
  return h('footer', { class: `promo-footer ${inline ? 'promo-inline' : ''}`.trim() },
    h('div', { class: 'promo-content' },
      h('span', { class: 'promo-badge' }, 'White Eagles'),
      h('span', { class: 'promo-text' },
        h('span', {}, t('footer.promo')), ' ',
        h('a', { href: WHITE_EAGLES_URL, target: '_blank', rel: 'noopener' }, t('footer.visit'), ' ', icon('external-link')))),
    h('div', { class: 'promo-copyright' }, copyrightText()));
}
