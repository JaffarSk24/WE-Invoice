// Slovak texts: contacts, items, recurring invoices, reminders, e-mail
// (WP-CRM), one file per screen in crm/, merged here.
import contacts from './crm/contacts.js';
import items from './crm/items.js';
import mail from './crm/mail.js';
import recurring from './crm/recurring.js';
import reminders from './crm/reminders.js';

export default { ...contacts, ...items, ...mail, ...recurring, ...reminders };
