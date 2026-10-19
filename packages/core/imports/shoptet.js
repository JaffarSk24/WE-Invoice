// Orders of a Shoptet e-shop (03-features.md § 3.13, P2): the XML order
// export (ORDERS / ORDER / ORDER_ITEMS / ITEM) or the CSV export with one
// row per item. Each order becomes a draft invoice (no number yet, the
// order code as the order reference) or a received order (objednávka
// prijatá, numbered by the order code), with the customer as a contact
// and the products as price list items, so the lines link to the price
// list by product code. Prices are taken with VAT when the shop gives
// them, which keeps the totals equal to the order; cancelled orders are
// skipped. Tag and column names are matched without case.
import { parseXml, children } from './xml.js';
import { emptyParsed, skip, warn } from './report.js';
import { readDate, readAmount, readRate, readText, normalizeKey } from './values.js';
import { contactDraft, unitCode, snapRate } from './records.js';
import { readCsv } from './csv.js';
import { computeTotals } from '../vat/index.js';
import { cmp, abs, sub, div, mul, round, isZero } from '../money/index.js';

export const SHOPTET_TARGETS = Object.freeze(['INVOICE_DRAFT', 'ORDER_IN']);
const CANCELLED = /storn|zrusen|zrušen|cancel/i;
const PRODUCT_TYPES = new Set(['product', 'product-set', 'gift', '']);

// Child text by one of several tag names, case-insensitive.
function pick(node, ...names) {
  if (!node) return null;
  const wanted = names.map(n => n.toLowerCase());
  const found = node.children.find(c => wanted.includes(c.name.toLowerCase()));
  return found ? readText(found.text) : null;
}

function childNode(node, ...names) {
  if (!node) return null;
  const wanted = names.map(n => n.toLowerCase());
  return node.children.find(c => wanted.includes(c.name.toLowerCase())) || null;
}

const METHODS = [[/dobierk|dobírk|cash on delivery|cod/i, 'COD'], [/kart|card/i, 'CARD'], [/hotov|cash/i, 'CASH'], [/prevod|převod|transfer/i, 'TRANSFER'], [/online|gopay|stripe|paypal|comgate/i, 'ONLINE']];

function methodOf(name) {
  const found = METHODS.find(([re]) => re.test(name || ''));
  return found ? found[1] : 'TRANSFER';
}

// One order in a neutral shape, from XML or from CSV rows.
function orderFromXml(node) {
  const customer = childNode(node, 'CUSTOMER');
  const billing = childNode(customer, 'BILLING_ADDRESS', 'INVOICE_ADDRESS') || customer;
  const currency = childNode(node, 'CURRENCY');
  const total = childNode(node, 'TOTAL_PRICE');
  const items = children(childNode(node, 'ORDER_ITEMS', 'ITEMS'), 'ITEM').concat(children(childNode(node, 'ORDER_ITEMS', 'ITEMS'), 'item'));
  return {
    code: pick(node, 'CODE', 'ORDER_CODE', 'NUMBER'),
    date: pick(node, 'DATE', 'CREATED'),
    status: pick(node, 'STATUS', 'STATUS_NAME') || '',
    currency: (currency ? pick(currency, 'CODE') : pick(node, 'CURRENCY')) || 'EUR',
    rate: currency ? pick(currency, 'EXCHANGE_RATE') : null,
    customer: {
      name: pick(billing, 'NAME', 'FULL_NAME'), company: pick(billing, 'COMPANY'),
      street: [pick(billing, 'STREET'), pick(billing, 'HOUSENUMBER', 'HOUSE_NUMBER')].filter(Boolean).join(' '),
      city: pick(billing, 'CITY'), zip: pick(billing, 'ZIP'), country: pick(billing, 'COUNTRY', 'COUNTRY_CODE'),
      ico: pick(billing, 'COMPANY_ID', 'ICO', 'CRN'), dic: pick(billing, 'TAX_ID', 'DIC'), icDph: pick(billing, 'VAT_ID', 'DIC_DPH', 'IC_DPH'),
      email: pick(customer, 'EMAIL') || pick(billing, 'EMAIL'), phone: pick(customer, 'PHONE') || pick(billing, 'PHONE')
    },
    payment: pick(node, 'PAYMENT_METHOD', 'BILLING_METHOD') || pick(childNode(node, 'PAYMENT_METHOD', 'PAYMENT'), 'NAME'),
    note: pick(node, 'REMARK', 'NOTE', 'CUSTOMER_REMARK'),
    totalGross: total ? pick(total, 'WITH_VAT') : null,
    items: items.map(item => {
      const unit = childNode(item, 'UNIT_PRICE');
      return {
        type: (pick(item, 'TYPE', 'ITEM_TYPE') || '').toLowerCase(),
        name: pick(item, 'NAME'), variant: pick(item, 'VARIANT_NAME'), code: pick(item, 'CODE'), ean: pick(item, 'EAN'),
        qty: pick(item, 'AMOUNT', 'QUANTITY'), unit: pick(item, 'AMOUNT_UNIT', 'UNIT'),
        gross: unit ? pick(unit, 'WITH_VAT') : null, net: unit ? pick(unit, 'WITHOUT_VAT') : null,
        rate: (unit && pick(unit, 'VAT_RATE')) || pick(item, 'VAT_RATE')
      };
    })
  };
}

// CSV header names (Shoptet uses camelCase) to the neutral fields.
const CSV_FIELDS = {
  code: ['code', 'ordercode', 'kod objednavky'], date: ['date', 'datum'], status: ['statusname', 'status'], currency: ['currencycode', 'currency', 'mena'],
  rate: ['exchangerate'], email: ['email'], phone: ['phone', 'telefon'], name: ['billfullname', 'billname'], company: ['billcompany'],
  street: ['billstreet'], house: ['billhousenumber'], city: ['billcity'], zip: ['billzip'], country: ['billcountrycode', 'billcountry'],
  ico: ['companyid', 'billcompanyid'], dic: ['taxid', 'billtaxid'], icDph: ['vatid', 'billvatid'], type: ['itemtype', 'orderitemtype'],
  itemName: ['itemname', 'orderitemname'], variant: ['itemvariantname'], itemCode: ['itemcode', 'orderitemcode'], ean: ['itemean'],
  qty: ['itemamount', 'orderitemamount'], unit: ['itemunit', 'itemamountunit'], gross: ['itemunitpricewithvat'], net: ['itemunitpricewithoutvat'],
  itemRate: ['itemvatrate'], total: ['totalpricewithvat'], payment: ['paymentmethodname', 'billingmethodname', 'paymentname'], note: ['remark', 'customerremark']
};

function ordersFromCsv(text) {
  const rows = readCsv(text);
  const header = (rows[0] || []).map(normalizeKey);
  const col = Object.fromEntries(Object.entries(CSV_FIELDS).map(([f, names]) => [f, header.findIndex(h => names.includes(h))]));
  const get = (row, f) => (col[f] >= 0 ? readText(row[col[f]]) : null);
  const orders = new Map();
  rows.slice(1).forEach(row => {
    const code = get(row, 'code');
    if (!code) return;
    if (!orders.has(code)) {
      orders.set(code, {
        code, date: get(row, 'date'), status: get(row, 'status') || '', currency: get(row, 'currency') || 'EUR', rate: get(row, 'rate'),
        customer: {
          name: get(row, 'name'), company: get(row, 'company'), street: [get(row, 'street'), get(row, 'house')].filter(Boolean).join(' '),
          city: get(row, 'city'), zip: get(row, 'zip'), country: get(row, 'country'), ico: get(row, 'ico'), dic: get(row, 'dic'),
          icDph: get(row, 'icDph'), email: get(row, 'email'), phone: get(row, 'phone')
        },
        payment: get(row, 'payment'), note: get(row, 'note'), totalGross: get(row, 'total'), items: []
      });
    }
    orders.get(code).items.push({
      type: (get(row, 'type') || '').toLowerCase(), name: get(row, 'itemName'), variant: get(row, 'variant'), code: get(row, 'itemCode'),
      ean: get(row, 'ean'), qty: get(row, 'qty'), unit: get(row, 'unit'), gross: get(row, 'gross'), net: get(row, 'net'), rate: get(row, 'itemRate')
    });
  });
  return [...orders.values()];
}

// A line at the shop's price: with VAT when given (so the order total
// comes out exactly), else without; the rate from the item, or derived.
function lineOf(item, i, date) {
  const gross = readAmount(item.gross);
  const net = readAmount(item.net);
  let rate = readRate(item.rate);
  if (rate === null && gross !== null && net !== null && !isZero(net)) rate = snapRate(round(mul(sub(div(gross, net, 10), '1'), '100'), 2), date);
  const name = [item.name, item.variant].filter(Boolean).join(', ');
  const vat = rate === null || isZero(rate) ? { vatCategory: rate === null ? 'O' : 'Z', vatRate: null } : { vatCategory: 'S', vatRate: rate };
  return {
    id: `shoptet-${i + 1}`, kind: 'ITEM', itemId: null, itemCode: item.code || null, name, description: '',
    qty: readAmount(item.qty) || '1', unit: { code: unitCode(item.unit), label: item.unit || '' },
    unitPrice: gross !== null && vat.vatCategory === 'S' ? gross : net ?? gross ?? '0',
    priceType: gross !== null && vat.vatCategory === 'S' ? 'GROSS' : 'NET', discountPct: null, ...vat
  };
}

/**
 * @param {string} text  the XML or CSV export
 * @param {{company?: object, target?: 'INVOICE_DRAFT'|'ORDER_IN', addItems?: boolean}} [ctx]
 * @returns {{contacts: object[], items: object[], documents: object[], report: object}}
 */
export function importShoptet(text, ctx = {}) {
  const parsed = emptyParsed();
  const xml = /^\s*(\ufeff)?\s*</.test(text);
  const orders = xml ? children(parseXml(text), 'ORDER').concat(children(parseXml(text), 'order')).map(orderFromXml) : ordersFromCsv(text);
  if (!orders.length) warn(parsed.report, 'documents', '', 'NOTHING_FOUND');
  const target = ctx.target === 'ORDER_IN' ? 'ORDER_IN' : 'INVOICE_DRAFT';
  const own = ctx.company || {};
  const ownParty = { name: own.name || '', ico: own.ico || null, dic: own.dic || null, icDph: own.icDph || null, address: own.address || {}, vatPayer: own.vatMode === 'PAYER' };
  const products = new Map();
  orders.forEach(order => {
    if (!order.code) return skip(parsed.report, 'documents', '', 'MISSING_NUMBER');
    if (CANCELLED.test(order.status)) return skip(parsed.report, 'documents', order.code, 'ORDER_CANCELLED');
    const date = readDate(order.date);
    if (!date) return skip(parsed.report, 'documents', order.code, 'MISSING_DATE');
    const lines = order.items.filter(i => i.name).map((item, i) => lineOf(item, i, date));
    if (!lines.length) return skip(parsed.report, 'documents', order.code, 'NO_AMOUNT');
    const c = order.customer;
    const contact = contactDraft({ name: c.company || c.name, ico: c.ico, dic: c.dic, icDph: c.icDph, street: c.street, city: c.city, zip: c.zip, country: c.country, email: c.email, phone: c.phone });
    if (contact) {
      if (c.company && c.name) contact.note = c.name;
      parsed.contacts.push(contact);
    }
    order.items.forEach(item => {
      if (ctx.addItems === false || !item.code || !PRODUCT_TYPES.has(item.type) || products.has(item.code)) return;
      const line = lineOf(item, 0, date);
      products.set(item.code, {
        name: line.name, code: item.code, barcode: item.ean || null, unit: line.unit, price: line.unitPrice, priceType: line.priceType,
        vatCategory: line.vatCategory, vatRate: line.vatRate, currency: (order.currency || 'EUR').toUpperCase(), stockTracked: false, description: ''
      });
    });
    const currency = (order.currency || 'EUR').toUpperCase().slice(0, 3);
    const document = {
      kind: target === 'ORDER_IN' ? 'ORDER_IN' : 'INVOICE', status: target === 'ORDER_IN' ? 'ISSUED' : 'DRAFT',
      number: target === 'ORDER_IN' ? order.code : null, orderReference: order.code, issueDate: date, taxDate: target === 'ORDER_IN' ? null : date,
      currency, fxRate: currency !== 'EUR' && order.rate ? readAmount(order.rate) : null,
      seller: ownParty,
      buyer: contact ? { contactId: null, name: contact.name, ico: contact.ico, dic: contact.dic, icDph: contact.icDph, address: contact.billingAddress, email: contact.emails[0]?.address || null, phone: contact.phone, vatPayer: Boolean(contact.icDph) } : { name: '', address: {} },
      lines, paymentMethod: methodOf(order.payment), textIntro: null, noteInternal: order.note || null, payments: [], links: [], tags: ['shoptet']
    };
    const stated = readAmount(order.totalGross);
    try {
      if (stated !== null && cmp(abs(sub(computeTotals(document).payable, stated)), '0.01') > 0) warn(parsed.report, 'documents', order.code, 'TOTALS_MISMATCH');
    } catch (e) {
      warn(parsed.report, 'documents', order.code, e.code || 'INVALID_AMOUNTS');
    }
    if (currency !== 'EUR' && !document.fxRate) warn(parsed.report, 'documents', order.code, 'FX_RATE_MISSING');
    parsed.documents.push(document);
  });
  parsed.items = [...products.values()];
  return parsed;
}
