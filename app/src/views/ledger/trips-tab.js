// Kniha jázd with the travel compensation of each trip (core travel):
// the list of the year and the form of one trip. A car that is a business
// asset is chosen from the assets; its trips get no km rate because its
// fuel is paid by receipts. A stored amount overrides the computed one.
import { tripAllowance, tripAmount, tripSummary } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate, todayLocal } from '../../components/dates.js';
import { textField, numberField, amountField, dateField, selectField } from '../../components/fields.js';
import { getStore } from '../../store/index.js';
import { money, stats, canWrite } from './kit.js';
import { tableSpec } from './export.js';

function amountOf(trip) {
  try { return tripAmount(trip); } catch (e) { console.warn('Trip without rates', trip.id, e); return null; }
}

/** Checks the trip form; returns error keys by field. Pure, for tests. */
export function tripErrors(v) {
  const errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) errors.date = 'ledger.trip.error.date';
  if (!v.km || Number.isNaN(Number(v.km)) || Number(v.km) <= 0) errors.km = 'ledger.trip.error.km';
  if (v.hours !== null && v.hours !== '' && v.hours !== undefined && (Number(v.hours) < 0 || Number(v.hours) > 24 * 31)) errors.hours = 'ledger.trip.error.hours';
  return errors;
}

export function openTripForm(trip = null, assets = []) {
  if (!canWrite()) return;
  const cars = assets.filter(a => a.kind === 'TANGIBLE' && !a.deleted);
  const date = dateField({ label: t('ledger.trip.date'), value: trip?.date || todayLocal(), required: true });
  const vehicle = textField({ label: t('ledger.trip.vehicle'), value: trip?.vehicle || '' });
  const from = textField({ label: t('ledger.trip.from'), value: trip?.from || '' });
  const to = textField({ label: t('ledger.trip.to'), value: trip?.to || '' });
  const purpose = textField({ label: t('ledger.trip.purpose'), value: trip?.purpose || '' });
  const km = numberField({ label: t('ledger.trip.km'), value: trip?.km || null, required: true });
  const hours = numberField({ label: t('ledger.trip.hours'), value: trip?.hours ?? null, hint: t('ledger.trip.hoursHint') });
  const fuel = amountField({ label: t('ledger.trip.fuel'), value: trip?.fuelCost || null, hint: t('ledger.trip.fuelHint') });
  const car = selectField({ label: t('ledger.trip.car'), options: [{ value: '', label: t('ledger.trip.privateCar') }, ...cars.map(a => ({ value: a.id, label: a.name }))], value: trip?.assetId || '' });
  const allowance = amountField({ label: t('ledger.trip.allowance'), value: trip?.allowance || null, hint: t('ledger.trip.allowanceHint') });
  const values = () => ({ date: date.value(), vehicle: vehicle.value(), from: from.value(), to: to.value(), purpose: purpose.value() || null, km: km.value(), hours: hours.value(), fuelCost: fuel.value(), assetId: car.value() || null, allowance: allowance.value() });

  async function save(modal) {
    const v = values();
    const errors = tripErrors(v);
    date.setError(errors.date ? t(errors.date) : null);
    km.setError(errors.km ? t(errors.km) : null);
    hours.setError(errors.hours ? t(errors.hours) : null);
    if (Object.keys(errors).length) return;
    const record = { ...v, hours: v.hours === null ? null : Number(v.hours) };
    try {
      if (trip) await getStore().update('trips', trip.id, record);
      else await getStore().insert('trips', record);
      showToast(t('ledger.trip.saved'), { type: 'success' });
      modal.close();
    } catch (e) {
      showError(e, 'ledger.trip.error.save');
    }
  }

  async function remove(modal) {
    if (!(await confirmDialog(t('ledger.trip.confirmDelete'), { danger: true, okLabel: t('common.delete') }))) return;
    try { await getStore().remove('trips', trip.id); modal.close(); } catch (e) { showError(e, 'ledger.trip.error.save'); }
  }

  const actions = [{ label: t('common.cancel'), onClick: (m) => m.close() }, { label: t('common.save'), kind: 'primary', onClick: save }];
  if (trip) actions.unshift({ label: t('common.delete'), onClick: remove });
  openModal({
    title: trip ? t('ledger.trip.editTitle') : t('ledger.trip.newTitle'),
    body: h('div', { class: 'form-grid ledger-form' }, date.el, vehicle.el, from.el, to.el, purpose.el, km.el, hours.el, car.el, fuel.el, allowance.el),
    actions
  });
}

function columns() {
  return [
    { id: 'date', label: t('ledger.col.date'), render: r => formatDate(r.date), sortValue: r => r.date, primary: true, always: true },
    { id: 'route', label: t('ledger.trip.route'), render: r => [r.from, r.to].filter(Boolean).join(' - ') },
    { id: 'vehicle', label: t('ledger.trip.vehicle'), render: r => r.vehicle || '' },
    { id: 'km', label: t('ledger.trip.km'), align: 'num', render: r => r.km, sortValue: r => Number(r.km) },
    { id: 'amount', label: t('ledger.col.amount'), align: 'num', render: r => { const a = amountOf(r); return a === null ? t('ledger.trip.noRates') : money(a); } }
  ];
}

/** ctx: { trips, assets, year, readOnly } */
export function renderTripsTab(panel, ctx) {
  const own = ctx.trips.filter(tr => String(tr.date).startsWith(`${ctx.year}-`));
  let summary = null;
  try { summary = tripSummary(own.filter(tr => amountOf(tr) !== null), ctx.year); } catch (e) { console.warn('Trip summary failed', e); }
  if (summary) panel.append(stats([{ label: t('ledger.trip.count'), value: String(summary.count) }, { label: t('ledger.trip.km'), value: summary.km }, { label: t('ledger.trip.total'), value: money(summary.amount) }]));
  const table = createTable({
    key: 'ledger-trips', columns: columns(), rows: own,
    onRowClick: (row) => openTripForm(row, ctx.assets),
    empty: emptyState({ title: t('ledger.trip.empty.title'), text: t('ledger.trip.empty.text'), iconName: 'truck', actionLabel: ctx.readOnly ? null : t('ledger.trip.add'), onAction: () => openTripForm(null, ctx.assets) })
  });
  panel.append(table.el);
}

export function tripsTable(trips, year) {
  const own = trips.filter(tr => String(tr.date).startsWith(`${year}-`));
  const detail = (tr) => { try { return tripAllowance(tr); } catch { return { kmAmount: null, fuel: null, meal: null }; } };
  return tableSpec(t('ledger.trip.title', { year }), [
    { label: t('ledger.col.date'), value: r => r.date },
    { label: t('ledger.trip.vehicle'), value: r => r.vehicle },
    { label: t('ledger.trip.route'), value: r => [r.from, r.to].filter(Boolean).join(' - ') },
    { label: t('ledger.trip.purpose'), value: r => r.purpose },
    { label: t('ledger.trip.km'), value: r => r.km, num: true },
    { label: t('ledger.trip.kmAmount'), value: r => detail(r).kmAmount, num: true },
    { label: t('ledger.trip.fuel'), value: r => detail(r).fuel, num: true },
    { label: t('ledger.trip.meal'), value: r => detail(r).meal, num: true },
    { label: t('ledger.col.amount'), value: r => amountOf(r), num: true }
  ], own);
}
