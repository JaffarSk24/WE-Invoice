// The state of the app: the workspace (list of companies, settings, the
// encryption header) and the data of the active company, both kept as the
// two file roots of packages/core/schema and persisted through a local
// adapter (local.js). The sync engine reads and replaces whole roots; the
// views change records through the CRUD methods, which stamp updatedAt in
// UTC, keep deletions as tombstones and emit "data:changed".
//
// Safety rules:
//   - a stored text that cannot be read is never overwritten: the root is
//     marked damaged, the app shows an error and works read-only on it;
//   - a file of a newer schema than this client knows opens read-only
//     (core migrate), so an old client never writes what it does not
//     understand;
//   - switching the company changes which data file is open; the others
//     stay on disk untouched ("company:switched").
import { schema, SCHEMA_VERSION, uuidv7 } from '@we-invoice/core';
import { KEYS } from './local.js';
import { nowIso, newRecord, parseRoot, isLive } from './records.js';
import { listRecords, getRecord, insertRecord, updateRecord, removeRecord, updateCompanyRecord } from './crud.js';
import { storeError, CODES } from './errors.js';

const { emptyWorkspace, emptyCompanyData, migrate } = schema;

export class Store {
  constructor({ adapter, emit = () => {}, now = nowIso }) {
    this.adapter = adapter;
    this.emit = emit;
    this.now = now;
    this.workspace = null;
    this.data = null;
    // Roots that could not be read: key -> Error. Saving such a key is refused.
    this.damaged = new Map();
    // True when the active data file (or the workspace) is of a newer schema.
    this.readOnly = false;
    this.opened = false;
  }

  // ---------- loading ----------

  // Reads a root from the adapter. Returns the data, null when there is
  // nothing stored, and records damage instead of throwing.
  async readRoot(key, kind) {
    const text = await this.adapter.get(key);
    if (text === null || text === undefined || text === '') return null;
    const parsed = parseRoot(text, kind);
    if (parsed.error) {
      console.error(`Stored ${kind} (${key}) cannot be read; it will not be overwritten`, parsed.error);
      this.damaged.set(key, parsed.error);
      return null;
    }
    return parsed.data;
  }

  async writeRoot(key, data) {
    if (this.damaged.has(key)) throw storeError(CODES.DATA_DAMAGED, `${key} is damaged and is not overwritten`);
    await this.adapter.put(key, JSON.stringify(data));
  }

  // Applies the migrations of the core; a newer file is opened read-only.
  upgrade(data) {
    const result = migrate(data, SCHEMA_VERSION);
    if (result.readOnly) console.warn(`Schema ${data.schemaVersion} is newer than ${SCHEMA_VERSION}: read-only`);
    return result;
  }

  async open() {
    const stored = await this.readRoot(KEYS.workspace, 'workspace');
    if (stored) {
      const up = this.upgrade(stored);
      this.workspace = up.data;
      this.readOnly = up.readOnly;
      if (up.migrated) await this.saveWorkspace();
    } else if (this.damaged.has(KEYS.workspace)) {
      this.workspace = emptyWorkspace({ workspaceId: 'damaged', now: this.now(), schemaVersion: SCHEMA_VERSION });
      this.readOnly = true;
    } else {
      this.workspace = emptyWorkspace({ workspaceId: uuidv7(), now: this.now(), schemaVersion: SCHEMA_VERSION });
      await this.saveWorkspace();
    }
    this.opened = true;
    const active = this.workspace.activeCompanyId;
    if (active && this.companies().some(c => c.id === active)) await this.loadCompany(active);
    return this;
  }

  async loadCompany(companyId) {
    const key = KEYS.company(companyId);
    const stored = await this.readRoot(key, 'company');
    if (!stored) {
      this.data = null;
      this.readOnly = this.readOnly || this.damaged.has(key);
      return null;
    }
    const up = this.upgrade(stored);
    this.data = up.data;
    this.readOnly = up.readOnly;
    if (up.migrated && !up.readOnly) await this.writeRoot(key, this.data);
    return this.data;
  }

  // ---------- persistence ----------

  async saveWorkspace() {
    await this.writeRoot(KEYS.workspace, this.workspace);
  }

  async saveData() {
    if (!this.data) return;
    await this.writeRoot(KEYS.company(this.data.companyId), this.data);
  }

  assertWritable() {
    if (this.readOnly) throw storeError(CODES.READ_ONLY, 'The data is open read-only');
  }

  assertCompany() {
    this.assertWritable();
    if (!this.data) throw storeError(CODES.NO_COMPANY, 'No company is open');
  }

  // ---------- companies ----------

  companies() {
    return this.workspace.companies.filter(isLive);
  }

  activeCompanyId() {
    return this.data ? this.data.companyId : null;
  }

  company() {
    return this.data ? this.data.company : null;
  }

  // A new company with its own data file; it becomes the active one.
  async createCompany(fields) {
    this.assertWritable();
    const now = this.now();
    const company = newRecord(fields, now);
    const entry = { id: company.id, name: company.name || '', folderId: null, updatedAt: now };
    const data = emptyCompanyData({ company, now, schemaVersion: SCHEMA_VERSION });
    await this.writeRoot(KEYS.company(company.id), data);
    this.workspace = { ...this.workspace, companies: [...this.workspace.companies, entry], activeCompanyId: company.id, updatedAt: now };
    await this.saveWorkspace();
    this.data = data;
    this.emit('company:switched', { companyId: company.id });
    this.emit('data:changed', { collection: 'company', id: company.id, source: 'local' });
    return company;
  }

  async switchCompany(companyId) {
    if (!this.companies().some(c => c.id === companyId)) throw storeError(CODES.NOT_FOUND, `Company ${companyId} not found`);
    if (this.activeCompanyId() === companyId) return this.data;
    this.readOnly = false;
    const data = await this.loadCompany(companyId);
    this.workspace = { ...this.workspace, activeCompanyId: companyId, updatedAt: this.now() };
    if (!this.damaged.has(KEYS.workspace)) await this.saveWorkspace();
    this.emit('company:switched', { companyId });
    return data;
  }

  // Removes a company from the list; its data file stays (10-year archive).
  async removeCompany(companyId) {
    this.assertWritable();
    const now = this.now();
    const companies = this.workspace.companies.map(c => (c.id === companyId ? { ...c, deleted: true, updatedAt: now } : c));
    const active = this.workspace.activeCompanyId === companyId ? null : this.workspace.activeCompanyId;
    this.workspace = { ...this.workspace, companies, activeCompanyId: active, updatedAt: now };
    await this.saveWorkspace();
    if (this.data && this.data.companyId === companyId) {
      this.data = null;
      this.emit('company:switched', { companyId: null });
    }
  }

  async updateCompany(patch) {
    this.assertCompany();
    const now = this.now();
    const { data, record } = updateCompanyRecord(this.data, patch, now);
    this.data = data;
    const companies = this.workspace.companies.map(c => (c.id === record.id && c.name !== record.name ? { ...c, name: record.name, updatedAt: now } : c));
    this.workspace = { ...this.workspace, companies, updatedAt: now };
    await this.saveData();
    await this.saveWorkspace();
    this.emit('data:changed', { collection: 'company', id: record.id, source: 'local' });
    return record;
  }

  async updateSettings(patch) {
    this.assertWritable();
    this.workspace = { ...this.workspace, settings: { ...this.workspace.settings, ...patch }, updatedAt: this.now() };
    await this.saveWorkspace();
    this.emit('data:changed', { collection: 'settings', id: null, source: 'local' });
    return this.workspace.settings;
  }

  // ---------- records ----------

  list(name, options) {
    if (!this.data) return [];
    return listRecords(this.data, name, options);
  }

  get(name, id, options) {
    if (!this.data) return null;
    return getRecord(this.data, name, id, options);
  }

  async commit(name, result) {
    this.data = result.data;
    await this.saveData();
    this.emit('data:changed', { collection: name, id: result.record.id, source: 'local' });
    return result.record;
  }

  async insert(name, fields) {
    this.assertCompany();
    return this.commit(name, insertRecord(this.data, name, fields, this.now()));
  }

  async update(name, id, patch) {
    this.assertCompany();
    return this.commit(name, updateRecord(this.data, name, id, patch, this.now()));
  }

  async remove(name, id) {
    this.assertCompany();
    return this.commit(name, removeRecord(this.data, name, id, this.now()));
  }

  // ---------- sync ----------

  // Whole roots arriving from the sync engine: stored and announced with
  // source 'sync', so views refresh and the engine does not count them as
  // local work.
  async applySynced(data) {
    if (!this.data || data.companyId !== this.data.companyId) throw storeError(CODES.NO_COMPANY, 'Synced data is for another company');
    const up = this.upgrade(data);
    this.data = up.data;
    this.readOnly = up.readOnly;
    if (!up.readOnly) await this.saveData();
    this.emit('data:changed', { collection: null, id: null, source: 'sync' });
  }

  async applySyncedWorkspace(workspace) {
    const up = this.upgrade(workspace);
    const active = this.workspace.activeCompanyId;
    this.workspace = { ...up.data, activeCompanyId: active || up.data.activeCompanyId || null };
    if (!up.readOnly && !this.damaged.has(KEYS.workspace)) await this.saveWorkspace();
    this.emit('data:changed', { collection: 'workspace', id: null, source: 'sync' });
  }

  // Data of any company for the engine (the active one from memory).
  async companyData(companyId) {
    if (this.data && this.data.companyId === companyId) return this.data;
    return this.readRoot(KEYS.company(companyId), 'company');
  }

  async storeCompanyData(data) {
    if (this.data && this.data.companyId === data.companyId) return this.applySynced(data);
    await this.writeRoot(KEYS.company(data.companyId), data);
  }
}
