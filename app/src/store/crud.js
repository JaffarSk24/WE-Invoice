// Record operations on one company data file, as pure functions: each
// takes the data and returns the new data plus the record it touched. The
// Store wraps them with persistence and events.
import { newRecord, touch, tombstone, isCollection, isLive } from './records.js';
import { storeError, CODES } from './errors.js';

function collectionOf(data, name) {
  if (!isCollection(name)) throw storeError(CODES.UNKNOWN_COLLECTION, `Unknown collection ${name}`);
  return data[name] || [];
}

export function listRecords(data, name, { includeDeleted = false } = {}) {
  const records = collectionOf(data, name);
  return includeDeleted ? records.slice() : records.filter(isLive);
}

export function getRecord(data, name, id, { includeDeleted = false } = {}) {
  const record = collectionOf(data, name).find(r => r.id === id) || null;
  return record && (includeDeleted || isLive(record)) ? record : null;
}

export function insertRecord(data, name, fields, now) {
  const records = collectionOf(data, name);
  const record = newRecord(fields, now);
  if (records.some(r => r.id === record.id)) throw storeError(CODES.NOT_FOUND, `Record ${record.id} already exists in ${name}`);
  return { data: { ...data, [name]: [...records, record], updatedAt: now }, record };
}

export function updateRecord(data, name, id, patch, now) {
  const records = collectionOf(data, name);
  const index = records.findIndex(r => r.id === id && isLive(r));
  if (index < 0) throw storeError(CODES.NOT_FOUND, `Record ${id} not found in ${name}`);
  const record = touch(records[index], patch, now);
  const next = records.slice();
  next[index] = record;
  return { data: { ...data, [name]: next, updatedAt: now }, record };
}

export function removeRecord(data, name, id, now) {
  const records = collectionOf(data, name);
  const index = records.findIndex(r => r.id === id && isLive(r));
  if (index < 0) throw storeError(CODES.NOT_FOUND, `Record ${id} not found in ${name}`);
  const record = tombstone(records[index], now);
  const next = records.slice();
  next[index] = record;
  return { data: { ...data, [name]: next, updatedAt: now }, record };
}

export function updateCompanyRecord(data, patch, now) {
  const company = touch(data.company, patch, now);
  return { data: { ...data, company, updatedAt: now }, record: company };
}
