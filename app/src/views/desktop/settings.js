// The desktop settings screen (#/desktop): tray icon, start at login,
// background tasks, backups, updates and the SMTP account. Shown only in
// the Electron build; the settings screen of WP-UI links to it.
import './desktop.css';
import { h, clear } from '../../ui/dom.js';
import { getDesktopPrefs, setDesktopPref } from '../../desktop/prefs.js';
import { renderSmtpForm } from './smtp-form.js';

const TASKS = ['recurring', 'reminders', 'efaktury'];

function option(label, hint, checked, onChange) {
  const box = h('input', { type: 'checkbox', checked });
  box.addEventListener('change', () => onChange(box.checked, box));
  return h('label', { class: 'option-row' }, box, h('div', { class: 'option-text' }, h('strong', {}, label), hint ? h('span', {}, hint) : null));
}

function formatTime(ms, lang) {
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Bratislava' }).format(new Date(ms));
  } catch (e) {
    return new Date(ms).toISOString();
  }
}

// ctx = { t, lang, showToast, showError, bridges: { weApp, weScheduler, weStorage, weMail, weSecrets },
//         updates, refreshTray, version }
export function renderDesktopSettings(root, ctx) {
  const { t, lang, showToast, showError, bridges, updates, refreshTray } = ctx;
  const prefs = getDesktopPrefs();

  const general = h('section', { class: 'card desktop-section' },
    h('h2', {}, t('desktop.settings.general')),
    option(t('desktop.settings.tray'), t('desktop.settings.trayHint'), prefs.tray, (on) => { setDesktopPref('tray', on); refreshTray(); }));
  const login = option(t('desktop.settings.loginItem'), t('desktop.settings.loginItemHint'), false, async (on, box) => {
    const result = await bridges.weApp.setLoginItem(on);
    if (!result.ok) { box.checked = !on; showError(Object.assign(new Error(result.error), { code: result.error })); }
  });
  general.append(login);
  bridges.weApp.getLoginItem().then(({ enabled, supported }) => {
    login.querySelector('input').checked = enabled;
    if (!supported) { login.querySelector('input').disabled = true; login.querySelector('span').textContent = t('desktop.settings.loginItemUnsupported'); }
  }).catch(e => console.warn('Login item state unknown', e));

  const taskRows = h('div');
  async function drawTasks() {
    const state = await bridges.weScheduler.state();
    clear(taskRows);
    TASKS.forEach(kind => {
      const last = state.lastRuns[kind];
      taskRows.append(h('div', { class: 'task-row' },
        h('div', {}, h('div', {}, t(`desktop.scheduler.${kind}`)), h('div', { class: 'task-when' }, last ? t('desktop.scheduler.lastRun', { time: formatTime(last, lang) }) : t('desktop.scheduler.never'))),
        h('button', { type: 'button', class: 'btn', onclick: () => bridges.weScheduler.runNow(kind).then(drawTasks).catch(showError) }, t('desktop.scheduler.runNow'))));
    });
  }
  drawTasks().catch(e => console.warn('Scheduler state unknown', e));
  const scheduler = h('section', { class: 'card desktop-section' }, h('h2', {}, t('desktop.scheduler.title')), h('p', { class: 'form-hint' }, t('desktop.scheduler.hint')), taskRows);

  const backups = h('section', { class: 'card desktop-section' },
    h('h2', {}, t('desktop.settings.backups')),
    h('p', { class: 'form-hint' }, t('desktop.settings.backupsHint')),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => bridges.weStorage.backupsFolder().catch(showError) }, t('desktop.settings.openBackups'))));

  const updateStatus = h('p', { class: 'form-hint' }, t('desktop.settings.version', { version: ctx.version }));
  const updatesCard = h('section', { class: 'card desktop-section' },
    h('h2', {}, t('desktop.updates.check')),
    updateStatus,
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => updates.check().catch(showError) }, t('desktop.updates.check'))));
  const stopUpdates = updates.onChange((state) => {
    if (state.status === 'downloading') updateStatus.textContent = t('desktop.updates.downloading', { percent: Math.round(state.progress * 100) });
    else if (state.status === 'ready') updateStatus.textContent = t('desktop.updates.ready', { version: state.latest });
    else if (state.status === 'available') updateStatus.textContent = t('desktop.updates.available', { version: state.latest });
  });

  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t('desktop.settings.title'))),
    general, scheduler, backups, updatesCard,
    renderSmtpForm({ t, showToast, showError, weMail: bridges.weMail, weSecrets: bridges.weSecrets }));
  return () => stopUpdates();
}
