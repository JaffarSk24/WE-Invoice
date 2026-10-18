// Building the accountant package: the core gives the register and the
// program files, this adds the PDFs of the issued documents and a summary
// in the user's language, and zips it all. Marking the documents exported
// is a separate step, done only after the file is saved.
import {
  accountantFiles, buildZip, exportFileName, exportedPatch, SALES_KINDS_PUBLIC, uuidv7, formatAmount
} from './core-bridge.js';
import { t, currentLang } from '../../i18n/index.js';
import { exportLabels, registerHeaders, lineHeaders, fileNames, reasonText } from './labels.js';
import { formatDate, formatDateTime } from '../../components/dates.js';
import { replaceCompanyData } from './store-bulk.js';

// "2026-10-18T14:05:09" in Bratislava for the ZIP entry times.
export function localStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function summaryText(result, { company, from, to, now, pdfFailures = [] }) {
  const lang = currentLang();
  const lines = [
    t('exim.summary.title'),
    `${t('exim.summary.company')}: ${company.name || ''}${company.ico ? ` (${company.ico})` : ''}`,
    `${t('exim.summary.period')}: ${formatDate(from, lang)} - ${formatDate(to, lang)}`,
    `${t('exim.summary.created')}: ${formatDateTime(now, lang)}`,
    '',
    t('exim.summary.documents', { n: result.documents.length })
  ];
  result.summary.forEach(s => {
    lines.push(`  ${t(`document.kind.${s.kind}`)} (${s.currency}): ${s.count} | ${t('exim.summary.net')} ${formatAmount(s.net, s.currency, lang)} | ${t('exim.summary.vat')} ${formatAmount(s.vat, s.currency, lang)} | ${t('exim.summary.gross')} ${formatAmount(s.gross, s.currency, lang)}`);
  });
  const skipped = [...result.skipped, ...pdfFailures];
  if (skipped.length) {
    lines.push('', t('exim.summary.skipped'));
    skipped.forEach(s => lines.push(`  ${s.number || s.id} (${s.format}): ${reasonText(s.reason)}`));
  }
  if (result.warnings.length) {
    lines.push('', t('exim.summary.notes'));
    [...new Set(result.warnings)].forEach(w => lines.push(`  ${reasonText(w)}`));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * @param {{company: object, documents: object[], contacts: object[]}} source
 * @param {{from: string, to: string, formats: string[]}} options
 * @param {{buildPdf?: Function, pdfFileNameFor?: Function, now?: Date}} [deps]
 * @returns {Promise<{bytes: Uint8Array, fileName: string, documents: object[], warnings: string[], skipped: object[]}>}
 */
export async function buildAccountantZip(source, options, deps = {}) {
  const nowDate = deps.now || new Date();
  const now = nowDate.toISOString();
  const time = localStamp(nowDate);
  const result = await accountantFiles(source, {
    from: options.from, to: options.to, now, time, formats: options.formats.filter(f => f !== 'pdf'),
    names: fileNames(), headers: registerHeaders(), lineHeaders: lineHeaders(), labels: exportLabels()
  });
  const files = [...result.files];
  const pdfFailures = [];
  if (options.formats.includes('pdf')) {
    const pdf = deps.buildPdf ? deps : await import('../../pdf/index.js');
    for (const document of result.documents.filter(d => SALES_KINDS_PUBLIC.includes(d.kind))) {
      try {
        const blob = await pdf.buildPdf(document, source.company, { allowIncomplete: true });
        const name = pdf.pdfFileNameFor(document, source.company) || `${exportFileName(document.number)}.pdf`;
        files.push({ name: `pdf/${name}`, data: new Uint8Array(await blob.arrayBuffer()) });
      } catch (e) {
        console.error(`PDF of ${document.number} could not be made`, e);
        pdfFailures.push({ id: document.id, number: document.number, reason: e.code || 'PDF_FAILED', format: 'pdf' });
      }
    }
  }
  files.unshift({ name: `${t('exim.file.summary')}.txt`, data: summaryText(result, { company: source.company, from: options.from, to: options.to, now, pdfFailures }) });
  const bytes = await buildZip(files, { time });
  const company = exportFileName(source.company && source.company.name, 'export');
  return {
    bytes, fileName: `${company}_${options.from}_${options.to}.zip`, documents: result.documents,
    warnings: result.warnings, skipped: [...result.skipped, ...pdfFailures]
  };
}

/** Marks the documents exported (with the lock) and logs it, in one write. */
export async function markExported(store, documents, now = new Date().toISOString()) {
  const ids = new Set(documents.map(d => d.id));
  const data = store.data;
  const audit = [];
  const next = data.documents.map(d => {
    if (!ids.has(d.id) || d.deleted) return d;
    const patch = exportedPatch(d, now);
    audit.push({
      id: uuidv7(), createdAt: now, updatedAt: now, deleted: false, at: now, actor: null, device: null, action: 'EXPORT',
      entity: 'Document', entityId: d.id, changes: [{ field: 'exportedAt', from: d.exportedAt || null, to: now }], reason: null
    });
    return { ...d, ...patch, updatedAt: now };
  });
  await replaceCompanyData(store, { ...data, documents: next, auditLog: [...(data.auditLog || []), ...audit], updatedAt: now });
  return audit.length;
}
