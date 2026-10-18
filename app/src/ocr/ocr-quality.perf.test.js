// OCR quality on the synthetic scans (tests/fixtures/inbox/scans): the
// same tesseract.js engine and models as the app, run in Node, then the
// core extraction. AC § 3.11 asks for at least 70 % of the expected
// fields on scans. Slow (seconds per picture), so it runs with the
// performance tests: npm run test:perf.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createWorker } from 'tesseract.js';
import { extractInvoiceFields } from '@we-invoice/core';

const require = createRequire(import.meta.url);
const dir = new URL('../../../tests/fixtures/inbox/', import.meta.url);
const { company, today, cases } = JSON.parse(readFileSync(new URL('cases.json', dir), 'utf8'));
const SCANS = ['sk-invoice-simple', 'sk-invoice-multirate', 'sk-invoice-nonpayer', 'cz-invoice', 'sk-receipt-ekasa', 'sk-receipt-shop'];
const LANGS = ['slk', 'ces', 'eng'];

// The worker reads <langPath>/<code>.traineddata.gz; the models live in
// one package each, so they are gathered in a temporary folder.
function modelDir() {
  const dir = mkdtempSync(join(tmpdir(), 'we-invoice-ocr-'));
  LANGS.forEach(code => copyFileSync(require.resolve(`@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`), join(dir, `${code}.traineddata.gz`)));
  return dir;
}

let worker;
const results = {};

beforeAll(async () => {
  worker = await createWorker(LANGS.join('+'), 1, { langPath: modelDir(), cacheMethod: 'none' });
}, 120_000);

afterAll(async () => {
  if (worker) await worker.terminate();
  const total = Object.values(results).reduce((n, r) => n + r.total, 0);
  const right = Object.values(results).reduce((n, r) => n + r.right, 0);
  console.warn(`[ocr] ${right}/${total} expected fields (${Math.round((right / total) * 100)} %)`, results);
});

describe('OCR of synthetic scans', () => {
  it.each(SCANS)('%s', async (id) => {
    const { data } = await worker.recognize(readFileSync(new URL(`scans/${id}.jpg`, dir)));
    const fields = extractInvoiceFields(data.text, { company, today, source: 'ocr' }).fields;
    const expected = cases.find(c => c.id === id).expected;
    const wrong = Object.entries(expected).filter(([k, v]) => fields[k] !== v).map(([k, v]) => `${k}: ${v} != ${fields[k]}`);
    results[id] = { total: Object.keys(expected).length, right: Object.keys(expected).length - wrong.length, wrong };
    expect(results[id].right / results[id].total).toBeGreaterThanOrEqual(0.5);
  }, 120_000);

  it('reaches 70 % of the expected fields overall', () => {
    const total = Object.values(results).reduce((n, r) => n + r.total, 0);
    const right = Object.values(results).reduce((n, r) => n + r.right, 0);
    expect(total).toBeGreaterThan(0);
    expect(right / total).toBeGreaterThanOrEqual(0.7);
  });
});
