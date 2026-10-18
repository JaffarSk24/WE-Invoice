// What the tray shows, built from a summary of the documents and the
// dictionary: the main process draws texts in the page's language. Pure,
// tested without a DOM. The summary comes from the sales module through
// the "desktop:tray" event: { show, dueTotal, currency, overdueCount,
// canReceive }; money is a decimal string, never a float.

const LOCALES = { sk: 'sk-SK', cs: 'cs-CZ', en: 'en-GB', de: 'de-DE', ru: 'ru-RU', uk: 'uk-UA' };

export function formatAmount(decimal, currency, lang, { decimals = 2 } = {}) {
  const value = Number(decimal);
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat(LOCALES[lang] || LOCALES.sk, {
      style: 'currency', currency: currency || 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }).format(value);
  } catch (e) {
    return `${value.toFixed(decimals)} ${currency || 'EUR'}`;
  }
}

// `t(key, params)` is the translation function of the page.
export function buildTrayState(summary, t, lang) {
  const s = summary || {};
  const due = formatAmount(s.dueTotal, s.currency, lang);
  const overdue = Number(s.overdueCount) || 0;
  return {
    show: s.show !== false,
    title: formatAmount(s.dueTotal, s.currency, lang, { decimals: 0 }),
    tooltip: due ? t('desktop.tray.tooltip', { amount: due }) : t('app.name'),
    due: due ? t('desktop.tray.due', { amount: due }) : '',
    overdue: overdue > 0 ? t('desktop.tray.overdue', { count: overdue }) : '',
    newInvoice: t('desktop.tray.newInvoice'),
    receive: t('desktop.tray.receive'),
    receiveEnabled: s.canReceive === true,
    open: t('desktop.tray.open'),
    quit: t('desktop.tray.quit')
  };
}

// Where a tray action takes the user and which event tells the modules.
export const TRAY_ACTIONS = Object.freeze({
  'new-invoice': { route: 'invoices', event: 'invoice:new' },
  'receive-efaktury': { route: 'efaktury-in', event: 'peppol:receive' }
});
