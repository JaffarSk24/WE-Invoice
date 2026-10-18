// Moves caused by documents and reservations by received orders.
import { describe, it, expect } from 'vitest';
import { movesForDocument, reconcileDocumentMoves, documentsAffectedBy, stockReservations, availableStock } from './index.js';

const items = [
  { id: 'i1', name: 'Paint', stockTracked: true, price: '10', priceType: 'NET', vatCategory: 'S', vatRate: '23' },
  { id: 'i2', name: 'Service', stockTracked: false, price: '50', priceType: 'NET', vatCategory: 'S', vatRate: '23' }
];
const line = (fields) => ({ id: fields.id || 'l1', kind: 'ITEM', name: 'x', qty: '2', unitPrice: '10', priceType: 'NET', vatCategory: 'S', vatRate: '23', itemId: 'i1', ...fields });
const doc = (fields) => ({ id: 'd1', kind: 'INVOICE', status: 'ISSUED', issueDate: '2026-10-10', number: 'FA20260001', currency: 'EUR', lines: [line({})], links: [], ...fields });
const ctx = (extra = {}) => ({ items, warehouseId: 'w1', documents: [], ...extra });

describe('movesForDocument', () => {
  it('issues tracked lines of an issued invoice from the default warehouse', () => {
    const d = doc({ lines: [line({}), line({ id: 'l2', itemId: 'i2' }), { id: 'l3', kind: 'TEXT', name: 'Heading', qty: '0', unitPrice: '0', vatCategory: 'S' }] });
    expect(movesForDocument(d, ctx())).toEqual([{
      kind: 'ISSUE', date: '2026-10-10', warehouseId: 'w1', targetWarehouseId: null, itemId: 'i1', qty: '2', unitCost: null, docId: 'd1', note: 'FA20260001'
    }]);
  });

  it('moves nothing for drafts, cancelled documents and quotes', () => {
    expect(movesForDocument(doc({ status: 'DRAFT' }), ctx())).toEqual([]);
    expect(movesForDocument(doc({ status: 'CANCELLED' }), ctx())).toEqual([]);
    expect(movesForDocument(doc({ kind: 'QUOTE' }), ctx())).toEqual([]);
  });

  it('uses the delivery date and the warehouse of the line', () => {
    const d = doc({ kind: 'DELIVERY_NOTE', deliveryDate: '2026-10-12', lines: [line({ warehouseId: 'w2' })] });
    expect(movesForDocument(d, ctx())[0]).toMatchObject({ kind: 'ISSUE', date: '2026-10-12', warehouseId: 'w2' });
  });

  it('turns a negative sale line into a return', () => {
    expect(movesForDocument(doc({ lines: [line({ qty: '-1' })] }), ctx())[0]).toMatchObject({ kind: 'RECEIPT', qty: '1' });
  });

  it('skips an invoice whose goods went out on a delivery note', () => {
    const note = doc({ id: 'dl', kind: 'DELIVERY_NOTE', links: [{ kind: 'DELIVERY_FOR', docId: 'd1' }] });
    expect(movesForDocument(doc({}), ctx({ documents: [note] }))).toEqual([]);
    expect(movesForDocument(doc({}), ctx({ documents: [{ ...note, status: 'DRAFT' }] }))).toHaveLength(1);
    const sameOrder = doc({ id: 'dl2', kind: 'DELIVERY_NOTE', links: [{ kind: 'FROM_ORDER', docId: 'o1' }] });
    expect(movesForDocument(doc({ links: [{ kind: 'FROM_ORDER', docId: 'o1' }] }), ctx({ documents: [sameOrder] }))).toEqual([]);
  });

  it('receives a received invoice at its net unit cost in EUR', () => {
    const d = doc({ kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', receivedDate: '2026-10-11', currency: 'CZK', fxRate: '25', lines: [line({ qty: '4', unitPrice: '100', discountPct: '10' })] });
    expect(movesForDocument(d, ctx({ company: { vatMode: 'PAYER' } }))[0]).toMatchObject({ kind: 'RECEIPT', date: '2026-10-11', qty: '4', unitCost: '3.6' });
  });

  it('includes the VAT in the cost for a company that cannot deduct it', () => {
    const d = doc({ kind: 'RECEIVED_INVOICE', lines: [line({ qty: '1', unitPrice: '100' })] });
    expect(movesForDocument(d, ctx({ company: { vatMode: 'NONPAYER' } }))[0].unitCost).toBe('123');
  });

  it('moves a credit note only when the goods were returned', () => {
    const credit = doc({ kind: 'CREDIT_NOTE' });
    expect(movesForDocument(credit, ctx())).toEqual([]);
    expect(movesForDocument({ ...credit, stockReturn: true }, ctx())[0]).toMatchObject({ kind: 'RECEIPT', qty: '2' });
    expect(movesForDocument({ ...credit, kind: 'RECEIVED_CREDIT_NOTE', stockReturn: true }, ctx())[0]).toMatchObject({ kind: 'ISSUE' });
  });

  it('needs a warehouse', () => {
    expect(() => movesForDocument(doc({}), ctx({ warehouseId: null }))).toThrow(expect.objectContaining({ code: 'STOCK_WAREHOUSE_MISSING' }));
  });
});

describe('reconcileDocumentMoves', () => {
  it('keeps matching moves and replaces the rest', () => {
    const wanted = movesForDocument(doc({ lines: [line({}), line({ id: 'l2', qty: '1' })] }), ctx());
    const existing = [{ ...wanted[0], id: 'm1' }, { ...wanted[0], id: 'm2', qty: '5' }];
    const { insert, remove } = reconcileDocumentMoves(existing, wanted);
    expect(insert).toEqual([wanted[1]]);
    expect(remove.map(m => m.id)).toEqual(['m2']);
  });

  it('changes nothing when issued twice', () => {
    const wanted = movesForDocument(doc({}), ctx());
    expect(reconcileDocumentMoves(wanted.map((m, n) => ({ ...m, id: `m${n}` })), wanted)).toEqual({ insert: [], remove: [] });
  });
});

describe('documentsAffectedBy', () => {
  it('names the invoice of a delivery note and the invoices of its order', () => {
    const note = doc({ id: 'dl', kind: 'DELIVERY_NOTE', links: [{ kind: 'DELIVERY_FOR', docId: 'd1' }, { kind: 'FROM_ORDER', docId: 'o1' }] });
    const other = doc({ id: 'd2', links: [{ kind: 'FROM_ORDER', docId: 'o1' }] });
    expect(documentsAffectedBy(note, [other]).sort()).toEqual(['d1', 'd2']);
    expect(documentsAffectedBy(doc({}), [other])).toEqual([]);
  });
});

describe('stockReservations', () => {
  const order = doc({ id: 'o1', kind: 'ORDER_IN', status: 'ACCEPTED', lines: [line({ qty: '5' }), line({ id: 'l2', itemId: 'i2', qty: '1' })] });

  it('holds the goods of open received orders', () => {
    expect(stockReservations([order], { items }).get('i1')).toBe('5');
    expect(stockReservations([order], { items }).has('i2')).toBe(false);
    expect(stockReservations([{ ...order, status: 'PROCESSED' }], { items }).size).toBe(0);
    expect(stockReservations([{ ...order, kind: 'ORDER_OUT' }], { items }).size).toBe(0);
  });

  it('releases what delivery notes and invoices of the order took out', () => {
    const note = doc({ id: 'dl', kind: 'DELIVERY_NOTE', lines: [line({ qty: '2' })], links: [{ kind: 'FROM_ORDER', docId: 'o1' }] });
    const invoice = doc({ id: 'fa', lines: [line({ qty: '2' })], links: [{ kind: 'FROM_ORDER', docId: 'o1' }] });
    expect(stockReservations([order, note], { items }).get('i1')).toBe('3');
    expect(stockReservations([order, note, invoice], { items }).get('i1')).toBe('3');
    const all = doc({ id: 'dl2', kind: 'DELIVERY_NOTE', lines: [line({ qty: '5' })], links: [{ kind: 'FROM_ORDER', docId: 'o1' }] });
    expect(stockReservations([order, all], { items }).has('i1')).toBe(false);
  });

  it('gives what is free to sell', () => {
    expect(availableStock('4', '5')).toBe('-1');
    expect(availableStock('4')).toBe('4');
  });
});
