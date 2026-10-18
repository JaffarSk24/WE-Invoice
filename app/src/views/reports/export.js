// Exports of a report: a CSV file (semicolons and decimal commas, with a
// byte order mark so spreadsheet programs read the diacritics) saved
// through the transport, and printing, where the print style sheet hides
// the frame of the app and leaves the report.
import { toCsv } from '@we-invoice/core';
import { getTransport } from '../../transport/index.js';
import { showError, showToast } from '../../ui/toast.js';
import { t } from '../../i18n/index.js';

const BOM = String.fromCharCode(0xfeff);

/** A file name without characters file systems refuse. */
export function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-');
}

/** The CSV text of a report table, as written to the file. */
export function csvText(columns, rows) {
  return BOM + toCsv(columns, rows);
}

/**
 * Saves rows as a CSV file.
 * @param {string} name  file name without extension
 * @param {{label: string, value: (row: object) => unknown}[]} columns
 * @param {object[]} rows
 */
export async function downloadCsv(name, columns, rows) {
  try {
    const blob = new Blob([csvText(columns, rows)], { type: 'text/csv;charset=utf-8' });
    await getTransport().files.saveAs(`${safeFileName(name)}.csv`, blob);
    showToast(t('reports.export.saved'), { type: 'success' });
  } catch (e) {
    showError(e, 'errors.REPORT_EXPORT_FAILED');
  }
}

/** Prints the current report (reports.css hides the app frame for print). */
export function printReport() {
  try {
    window.print();
  } catch (e) {
    showError(e, 'errors.REPORT_PRINT_FAILED');
  }
}
