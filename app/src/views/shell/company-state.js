// What the shell knows about companies: the open one and the list to
// switch between. The data itself belongs to the store (WP-SYNC); the
// shell only listens to its events and re-emits the user's wish to switch.
//
//   company:switched  { company, companies? }  or the company object alone
//   company:list      [companies]
//   company:switch    { id }  (emitted here when the user picks another one)
//
// Without any event the state is neutral: no company, every menu item is
// shown, the switcher offers only "add a company".
import { on, emit } from '../../events.js';

const state = { company: null, companies: [] };
const listeners = new Set();
let started = false;

function notify() {
  listeners.forEach(fn => {
    try { fn(state); } catch (e) { console.error('Company listener failed', e); }
  });
}

// Accepts both payload shapes, so the sync package can pick either.
export function applySwitched(payload) {
  if (!payload) { state.company = null; return state; }
  const company = payload.company !== undefined ? payload.company : payload;
  state.company = company && typeof company === 'object' ? company : null;
  if (Array.isArray(payload.companies)) state.companies = payload.companies.slice();
  else if (state.company && !state.companies.some(c => c.id === state.company.id)) state.companies = [...state.companies, state.company];
  return state;
}

export function applyList(list) {
  state.companies = Array.isArray(list) ? list.slice() : [];
  return state;
}

export function currentCompany() {
  return state.company;
}

export function companyList() {
  return state.companies.slice();
}

export function onCompanyChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function requestSwitch(id) {
  emit('company:switch', { id });
}

export function initCompanyState() {
  if (started) return;
  started = true;
  on('company:switched', (payload) => { applySwitched(payload); notify(); });
  on('company:list', (list) => { applyList(list); notify(); });
}

// For tests: forget everything.
export function resetCompanyState() {
  state.company = null;
  state.companies = [];
  listeners.clear();
  started = false;
}
