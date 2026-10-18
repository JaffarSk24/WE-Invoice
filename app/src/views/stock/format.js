// Small helpers shared by the stock screens: the boot context (transport
// for file downloads, navigation), names of items and warehouses, number
// formats and the CSV download. Kept here so the screens stay short.
import { stockCsv } from '@we-invoice/core';
import { t, currentLang } from '../../i18n/index.js';
import { formatNumber, formatAmount } from '../../components/decimal.js';
import { showToast } from '../../ui/toast.js';
import { writeBlocker } from './data.js';

let context = null;

export function setStockContext(ctx) {
  context = ctx;
}

export function stockContext() {
  return context;
}

/** Quantity as people read it (up to 4 decimal places). */
export function qtyText(qty) {
  return formatNumber(qty || '0', currentLang(), { maximumFractionDigits: 4 });
}

export function moneyText(amount, currency = 'EUR') {
  return formatAmount(amount || '0', currency);
}

export function nameIndex(records) {
  const map = new Map((records || []).map(r => [r.id, r]));
  return (id) => map.get(id)?.name || t('stock.unknown');
}

export function unitLabel(item) {
  return item?.unit?.label || item?.unit?.code || '';
}

/**
 * Says why a write is refused (demo, no company, read-only) and returns
 * true, or returns false when writing is fine.
 */
export function refuseWrite() {
  const code = writeBlocker();
  if (!code) return false;
  const key = code === 'STOCK_DEMO' ? 'stock.demo.readOnly' : `errors.${code}`;
  const text = t(key);
  showToast(text === key ? t('stock.error.write') : text, { type: 'info' });
  return true;
}

/** Saves a table as CSV through the transport (a download on the web). */
export async function downloadCsv(fileName, columns, rows) {
  const text = stockCsv(columns, rows);
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const transport = context?.transport;
  if (transport?.files?.saveAs) {
    await transport.files.saveAs(fileName, blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
