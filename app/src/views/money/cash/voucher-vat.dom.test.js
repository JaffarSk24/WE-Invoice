// @vitest-environment happy-dom
// The VAT choice of a cash voucher in its dialog: a VAT payer gets the
// rates, reverse charge, exemption and no VAT; reverse charge refuses a
// partner without a valid Slovak IČ DPH and stores the voucher once it is
// given; a company that is not a VAT payer gets no VAT choice at all.
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, memoryAdapter } from '../../../store/index.js';
import { resetPrefsCache } from '../../../prefs.js';
import { vatRecords } from '@we-invoice/core';
import { createCashBook } from './operations.js';
import { openVoucherDialog } from './voucher-dialog.js';

async function setup(vatMode = 'PAYER') {
  const store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany({ name: 'Firma', series: [], vatMode, vatPeriod: 'MONTH', icDph: 'SK2020123457' });
  await store.insert('contacts', { kind: 'COMPANY', name: 'Zberne suroviny s.r.o.', ico: '12345679', icDph: 'SK2021234567' });
  const book = await createCashBook(store, { name: 'Hlavna', openingBalance: '1000' });
  return { store, book };
}

const modal = () => document.querySelector('.modal-content');
const field = (label) => [...modal().querySelectorAll('.field')].find(f => f.querySelector('label')?.textContent.startsWith(label));
const input = (label) => field(label).querySelector('input, select');
const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
const save = () => modal().querySelector('.modal-actions [data-primary]').click();
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); resetPrefsCache(); });

describe('cash voucher VAT in the dialog', () => {
  it('offers rates, reverse charge, exemption and no VAT to a VAT payer', async () => {
    const { book } = await setup();
    openVoucherDialog({ book, kind: 'CASH_OUT' });
    const options = [...input('VAT').querySelectorAll('option')].map(o => o.textContent);
    expect(options).toEqual(['23 %', '19 %', '5 %', 'Reverse charge', 'Exempt from VAT', 'No VAT']);
    type(input('VAT'), 'AE');
    expect(modal().querySelector('.voucher-vat-hint').textContent).toContain('§ 69 ods. 12');
  });

  it('refuses reverse charge without the IČ DPH and stores it once given', async () => {
    const { store, book } = await setup();
    openVoucherDialog({ book, kind: 'CASH_OUT' });
    type(input('Amount'), '300');
    type(input('Purpose'), 'Odpad');
    type(input('Paid to'), 'Zberne suroviny s.r.o.');
    type(input('VAT'), 'AE');
    save();
    await settle();
    expect(field("Party's VAT ID").querySelector('.field-error').textContent).toBe("Enter the party's VAT ID (IČ DPH) for reverse charge.");
    expect(store.list('documents')).toHaveLength(0);
    type(input("Party's VAT ID"), 'CZ12345678');
    save();
    await settle();
    expect(field("Party's VAT ID").querySelector('.field-error').textContent).toContain('starts with SK');
    type(input("Party's VAT ID"), 'SK2021234567');
    save();
    await settle();
    const [voucher] = store.list('documents');
    expect(voucher.lines[0]).toMatchObject({ vatCategory: 'AE', vatRate: null, exemptionReasonCode: 'VATEX-EU-AE' });
    expect(voucher.seller).toMatchObject({ name: 'Zberne suroviny s.r.o.', icDph: 'SK2021234567' });
    const period = voucher.issueDate.slice(0, 7);
    expect(vatRecords(store.list('documents'), period, store.company()).entries)
      .toEqual([expect.objectContaining({ treatment: 'DOMESTIC_RC', direction: 'IN', base: '300.00' })]);
  });

  it('a picked contact fills the name and the IČ DPH', async () => {
    const { book } = await setup();
    openVoucherDialog({ book, kind: 'CASH_IN' });
    const search = modal().querySelector('input[role="combobox"]');
    type(search, 'Zber');
    await settle();
    modal().querySelector('.ac-list li').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(input('Received from').value).toBe('Zberne suroviny s.r.o.');
    expect(input("Party's VAT ID").value).toBe('SK2021234567');
  });

  it('gives a company that is not a VAT payer no VAT choice', async () => {
    const { store, book } = await setup('NONPAYER');
    openVoucherDialog({ book, kind: 'CASH_IN' });
    expect(field('VAT')).toBeUndefined();
    expect(field("Party's VAT ID").hidden).toBe(true);
    type(input('Amount'), '20');
    type(input('Purpose'), 'Predaj');
    save();
    await settle();
    expect(store.list('documents')[0].lines[0].vatCategory).toBe('O');
  });
});
