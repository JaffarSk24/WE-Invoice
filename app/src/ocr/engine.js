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

async function languageData() {
  return Promise.all(Object.entries(OCR_LANGUAGES).map(async ([code, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${code} model answered ${response.status}`);
    return { code, data: new Uint8Array(await response.arrayBuffer()) };
  }));
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
  const [{ createWorker }, langs] = await Promise.all([import('tesseract.js'), languageData()]);
  const worker = await createWorker(langs, 1, {
    workerPath: workerUrl,
    corePath: coreUrl,
    workerBlobURL: false,
    cacheMethod: 'none',
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
