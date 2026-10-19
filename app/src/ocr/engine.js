// OCR of scans and photos with tesseract.js, entirely on the device: the
// picture never leaves it. The engine, its WebAssembly core and the
// Slovak, Czech and English models are files of the app itself (no CDN,
// so the CSP stays closed and OCR works offline), loaded on the first
// scan and run in a worker. The worker is ended after a minute of rest.
// Tests and other platforms may inject their own engine with setOcrEngine.
import { CoreError } from '@we-invoice/core';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import slkUrl from '@tesseract.js-data/slk/4.0.0_best_int/slk.traineddata.gz?url';
import cesUrl from '@tesseract.js-data/ces/4.0.0_best_int/ces.traineddata.gz?url';
import engUrl from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url';

export const OCR_LANGUAGES = Object.freeze({ slk: slkUrl, ces: cesUrl, eng: engUrl });
const IDLE_MS = 60_000;

let engine = null;
let creating = null;
let idleTimer = null;
let progressListener = null;

export function setOcrEngine(custom) {
  engine = custom;
  creating = null;
}

// tesseract.js 7 cannot initialise from language data passed in memory
// (it joins the data instead of the codes), so the models are put where
// its worker looks first: its IndexedDB cache (idb-keyval, database
// "keyval-store", store "keyval"), under a key of our own cache path.
// Read-only cache mode then never touches the network.
export const MODEL_CACHE_PATH = 'we-invoice-ocr-4.0.0_best_int';
const modelKey = (code) => `${MODEL_CACHE_PATH}/${code}.traineddata`;

function cacheDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('keyval-store');
    req.onupgradeneeded = () => req.result.createObjectStore('keyval');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function cacheRun(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keyval', mode);
    const req = fn(tx.objectStore('keyval'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function installModels() {
  const db = await cacheDb();
  try {
    for (const [code, url] of Object.entries(OCR_LANGUAGES)) {
      const present = await cacheRun(db, 'readonly', s => s.count(modelKey(code)));
      if (present) continue;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${code} model answered ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      await cacheRun(db, 'readwrite', s => s.put(data, modelKey(code)));
    }
  } finally {
    db.close();
  }
}

// Words of tesseract blocks as positioned items in page fractions.
export function wordsOf(data, width, height) {
  const words = [];
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        for (const word of line.words || []) {
          const b = word.bbox;
          words.push({ str: word.text, x: b.x0 / width, y: b.y0 / height, w: (b.x1 - b.x0) / width, h: (b.y1 - b.y0) / height, confidence: word.confidence / 100 });
        }
      }
    }
  }
  return words;
}

async function createBrowserEngine() {
  const [{ createWorker }] = await Promise.all([import('tesseract.js'), installModels()]);
  const worker = await createWorker(Object.keys(OCR_LANGUAGES).join('+'), 1, {
    workerPath: workerUrl,
    corePath: coreUrl,
    workerBlobURL: false,
    cacheMethod: 'readOnly',
    cachePath: MODEL_CACHE_PATH,
    // Never used while the cache holds the models; it keeps the CDN out.
    langPath: new URL('ocr-models', document.baseURI).href,
    logger: (m) => { if (progressListener && m.status === 'recognizing text') progressListener(m.progress); }
  });
  return {
    async recognize(canvas) {
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      return { text: data.text || '', words: wordsOf(data, canvas.width, canvas.height), confidence: (data.confidence || 0) / 100 };
    },
    terminate: () => worker.terminate()
  };
}

function getEngine() {
  if (engine) return Promise.resolve(engine);
  if (!creating) {
    creating = createBrowserEngine()
      .then(created => { engine = created; return created; })
      .catch(e => {
        creating = null;
        throw new CoreError('OCR_LOAD_FAILED', `The OCR engine could not be loaded: ${e && e.message}`);
      });
  }
  return creating;
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const current = engine;
    if (!current || !current.terminate) return;
    engine = null;
    creating = null;
    Promise.resolve(current.terminate()).catch(e => console.warn('OCR worker did not stop cleanly', e));
  }, IDLE_MS);
}

/**
 * Text and words of a picture drawn on a canvas.
 * @returns {Promise<{text: string, words: object[], confidence: number}>}
 */
export async function recognizeCanvas(canvas, onProgress = null) {
  const current = await getEngine();
  progressListener = onProgress;
  try {
    return await current.recognize(canvas);
  } catch (e) {
    if (e instanceof CoreError) throw e;
    throw new CoreError('OCR_FAILED', `OCR failed: ${e && e.message}`);
  } finally {
    progressListener = null;
    scheduleIdle();
  }
}
