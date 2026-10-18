// The status badge of a document: colour, icon and text together, never
// colour alone (07-ui-ux-i18n.md § 7.1). Every status of the schema has a
// style here; the text comes from status.<CODE> in the dictionaries.
import { h, icon } from '../ui/dom.js';
import { t } from '../i18n/index.js';

// tone: the --status-<tone> token the badge is coloured with.
export const STATUS_STYLES = Object.freeze({
  DRAFT: { tone: 'draft', icon: 'pencil-line' },
  ISSUED: { tone: 'issued', icon: 'file-check' },
  SENT: { tone: 'sent', icon: 'send' },
  PAID: { tone: 'paid', icon: 'circle-check' },
  PARTIALLY_PAID: { tone: 'partial', icon: 'circle-dot' },
  OVERPAID: { tone: 'partial', icon: 'circle-plus' },
  OVERDUE: { tone: 'overdue', icon: 'alarm-clock' },
  CANCELLED: { tone: 'cancelled', icon: 'ban', strike: true },
  ACCEPTED: { tone: 'paid', icon: 'thumbs-up' },
  REJECTED: { tone: 'rejected', icon: 'circle-x' },
  EXPIRED: { tone: 'cancelled', icon: 'hourglass' },
  TO_PROCESS: { tone: 'issued', icon: 'inbox' },
  PROCESSED: { tone: 'paid', icon: 'check' },
  BOOKED: { tone: 'paid', icon: 'book-check' },
  DELIVERED: { tone: 'delivered', icon: 'circle-check' }
});

export function statusStyle(status) {
  return STATUS_STYLES[status] || { tone: 'draft', icon: 'circle' };
}

export function statusBadge(status, { label = null } = {}) {
  const style = statusStyle(status);
  return h('span', {
    class: `status-badge status-${style.tone} ${style.strike ? 'status-strike' : ''}`.trim(), dataset: { status }
  }, icon(style.icon), h('span', {}, label || t(`status.${status}`)));
}
