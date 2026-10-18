// English texts: contacts, items, recurring invoices, reminders, e-mail
// (WP-CRM), one file per screen in crm/, merged here.
import contacts from './crm/contacts.js';
import items from './crm/items.js';

export default { ...contacts, ...items };
