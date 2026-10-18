// "Sample data" mode: a demo company with contacts and documents built on
// the device, never synced. The dashboard and the lists show it until the
// user leaves the mode in Settings. The names come from the dictionaries,
// so the demo speaks the user's language.
import { getPrefs, setPref } from '../../prefs.js';
import { t } from '../../i18n/index.js';
import { todayLocal } from '../../components/dates.js';
import { buildDemoData } from '../onboarding/demo.js';
import { emit } from '../../events.js';

let cache = null;
let cacheLang = null;

export function isDemo() {
  return Boolean(getPrefs().demo);
}

function names(lang) {
  return {
    company: t('demo.company'),
    contacts: Array.from({ length: 10 }, (_, i) => t(`demo.contact.${i + 1}`)),
    cities: [t('demo.city.1'), t('demo.city.2'), t('demo.city.3')],
    lang
  };
}

export function demoData(lang = document.documentElement.lang) {
  if (!cache || cacheLang !== lang) {
    cache = buildDemoData(names(lang), todayLocal());
    cacheLang = lang;
  }
  return cache;
}

export function enableDemo() {
  setPref('demo', true);
  const data = demoData();
  emit('demo:enabled', data);
  emit('company:switched', { company: data.company, companies: [data.company] });
  return data;
}

export function disableDemo() {
  setPref('demo', false);
  cache = null;
  emit('demo:disabled');
  emit('company:switched', { company: null, companies: [] });
}
