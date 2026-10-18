// Shared steps of the WP-CRM end-to-end tests: a company set up through
// the wizard with the register mocked, so the store holds a real company
// to write contacts, documents and templates to.
import { expect } from '@playwright/test';

export const COMPANY = {
  name: 'Alfa Stavby, s. r. o.', ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', legalForm: 'SRO', legalFormText: 'Spoločnosť s ručením obmedzeným',
  registerEntry: 'OR OS Bratislava I, oddiel Sro, vložka 1/B', country: 'SK',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T10:00:00Z'
};

export const CLIENT = {
  name: 'Beta Obchod, s. r. o.', ico: '36070947', dic: '2020000015', icDph: 'SK2020000015', country: 'SK',
  address: { street: 'Mlynská 5', city: 'Košice', zip: '040 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T10:00:00Z'
};

const json = (body, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

// Mocks the register, VIES and the FS lists of the gateway.
export async function mockGateway(page) {
  await page.route('**/v1/company/sk/**', route => {
    const url = route.request().url();
    if (url.includes('/search')) return route.fulfill(json({ results: [CLIENT] }));
    return route.fulfill(json(url.includes(CLIENT.ico) ? CLIENT : COMPANY));
  });
  await page.route('**/v1/vat/vies/**', route => route.fulfill(json({ valid: true, name: CLIENT.name, checkedAt: new Date().toISOString() })));
  await page.route('**/v1/vat/sk/**', route => route.fulfill(json({ status: 'OK', lists: [], checkedAt: new Date().toISOString() })));
}

const next = (page) => page.locator('#ob-next').click();

// Runs the "My company" wizard to its end.
export async function setUpCompany(page) {
  await mockGateway(page);
  await page.goto('./#/onboarding');
  await next(page);
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next(page);
  await page.fill('#ob-ico', COMPANY.ico);
  await page.locator('#ob-lookup').click();
  await expect(page.locator('#ob-name')).toHaveValue(COMPANY.name);
  await next(page);
  await next(page);
  await next(page);
  await page.fill('#ob-iban', 'SK31 1200 0000 1987 4263 7541');
  await page.locator('#ob-iban').blur();
  await next(page);
  await next(page);
  await next(page);
  await page.locator('#ob-first-invoice').click();
  await expect(page.locator('#company-switcher option:checked')).toHaveText(COMPANY.name);
}

// Adds the client from the register through the contacts screen.
export async function addClient(page) {
  await page.goto('./#/contacts');
  await page.locator('#contacts-lookup').click();
  await page.fill('#lookup-query', CLIENT.ico);
  await page.locator('#lookup-search').click();
  await page.locator('.lookup-result', { hasText: CLIENT.name }).click();
  await expect(page.locator('#contact-title')).toHaveText(CLIENT.name);
}

// The first row of a list, a table row on the desktop or a card on a phone.
export const firstRow = (page) => page.locator('.data-table tr.row, .data-table .list-card').first();

// Puts an issued invoice for the first contact straight into the local
// data file of the open company (IndexedDB "we-invoice"), as the editor of
// the sales package would after issuing it, and reloads the page.
export async function seedInvoice(page, { number = '2026001', issueDate, dueDate, language = null } = {}) {
  await page.evaluate(async ({ number, issueDate, dueDate, language }) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('we-invoice', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const run = (mode, fn) => new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
    const workspace = JSON.parse(await run('readonly', s => s.get('workspace')));
    const key = `company:${workspace.activeCompanyId}`;
    const data = JSON.parse(await run('readonly', s => s.get(key)));
    const contact = data.contacts.find(c => !c.deleted);
    const now = new Date().toISOString();
    data.documents.push({
      id: `seed-${number}`, createdAt: now, updatedAt: now, kind: 'INVOICE', status: 'ISSUED', number, vs: number, currency: 'EUR',
      issueDate, taxDate: issueDate, dueDate, language, contactId: contact.id, paymentMethod: 'TRANSFER',
      seller: { name: data.company.name, ico: data.company.ico, address: data.company.address, vatPayer: true, icDph: data.company.icDph },
      buyer: { contactId: contact.id, name: contact.name, ico: contact.ico, address: contact.billingAddress, email: null },
      lines: [{ id: 'l1', kind: 'ITEM', name: 'Konzultácie', qty: '10', unit: { code: 'HUR', label: '' }, unitPrice: '50', priceType: 'NET', vatCategory: 'S', vatRate: '23' }],
      totals: {
        lineNet: '500.00', allowances: '0.00', charges: '0.00', net: '500.00', vat: '115.00', vatEur: null, gross: '615.00', prepaid: '0.00', rounding: '0.00',
        payable: '615.00', breakdown: [{ category: 'S', rate: '23', base: '500.00', vat: '115.00' }]
      },
      payments: [], sendLog: [], links: []
    });
    data.updatedAt = now;
    await run('readwrite', s => s.put(JSON.stringify(data), key));
    db.close();
  }, { number, issueDate, dueDate, language });
  await page.reload();
}
