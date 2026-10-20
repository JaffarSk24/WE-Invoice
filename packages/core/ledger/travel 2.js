// Kniha jázd and cestovné náhrady of the owner (zákon č. 283/2002 Z. z.,
// § 19 ods. 2 ZDP): a trip in a private car gets the base rate per km
// plus the fuel (taken from the fuel cost of the trip); a trip in a car
// that is a business asset gets nothing here, because its fuel is paid by
// receipts that are already expenses. Stravné follows the hours of the
// trip by the bands of legislation.travel valid on the trip date.
import { add, mul, round, sum, isZero } from '../money/index.js';
import { getLegislation } from '../legislation/index.js';

const live = (r) => r && !r.deleted;

/** Stravné for a trip of so many hours on a date ("0.00" below the first band). */
export function mealAllowance(hours, date, country = 'SK') {
  const bands = getLegislation('travel.mealAllowance', date, country);
  const h = Number(hours || 0);
  const band = bands.find(b => h >= b.fromHours && (b.toHours === null || h < b.toHours));
  return band ? round(band.amount, 2) : '0.00';
}

/**
 * Compensation of one trip.
 * @param {object} trip  TripLog (date, km, fuelCost, assetId, hours)
 * @returns {{km: string, kmRate: string|null, kmAmount: string, fuel: string, meal: string, total: string}}
 */
export function tripAllowance(trip, { country = 'SK' } = {}) {
  const businessCar = Boolean(trip.assetId);
  const kmRate = businessCar ? null : getLegislation('travel.kmRate', trip.date, country);
  const kmAmount = kmRate ? round(mul(trip.km || '0', kmRate), 2) : '0.00';
  const fuel = businessCar || !trip.fuelCost ? '0.00' : round(trip.fuelCost, 2);
  const meal = trip.hours ? mealAllowance(trip.hours, trip.date, country) : '0.00';
  return { km: round(trip.km || '0', 1), kmRate, kmAmount, fuel, meal, total: round(add(add(kmAmount, fuel), meal), 2) };
}

/** Amount a trip books: the stored allowance when the user set one, else the computed total. */
export function tripAmount(trip, ctx = {}) {
  if (trip.allowance !== null && trip.allowance !== undefined && trip.allowance !== '') return round(trip.allowance, 2);
  return tripAllowance(trip, ctx).total;
}

/** Rows of travel compensation for the peňažný denník of a year. */
export function tripRows(trips, year, ctx = {}) {
  return (trips || []).filter(t => live(t) && String(t.date).startsWith(`${year}-`)).flatMap(trip => {
    const amount = tripAmount(trip, ctx);
    if (isZero(amount)) return [];
    return [{ id: `trip:${trip.id}`, date: trip.date, number: null, text: [trip.from, trip.to].filter(Boolean).join(' - ') || null, category: 'EXPENSE_TAX_OTHER', amount, tripId: trip.id }];
  });
}

/** Kilometres and compensation of a year. */
export function tripSummary(trips, year, ctx = {}) {
  const own = (trips || []).filter(t => live(t) && String(t.date).startsWith(`${year}-`));
  return {
    count: own.length,
    km: round(sum(own.map(t => t.km || '0')), 1),
    amount: round(sum(own.map(t => tripAmount(t, ctx))), 2)
  };
}
