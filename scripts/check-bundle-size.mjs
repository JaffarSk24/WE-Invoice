// Initial load of the web build must stay within 400 KB gzip
// (01-product.md § 1.5): index.html plus the scripts and styles it links.
// Lazy chunks (dictionaries, pdfmake, tesseract) do not count.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT = 400 * 1024;
const dir = process.argv[2] || 'dist-web';
const indexPath = join(dir, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`No ${indexPath}: run npm run build:web first`);
  process.exit(1);
}
const html = readFileSync(indexPath, 'utf8');
const base = '/WE-Invoice/app/';
const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m => m[1].replace(base, '').replace(/^\.?\//, ''));
let total = gzipSync(html).length;
for (const ref of refs) {
  const size = gzipSync(readFileSync(join(dir, ref))).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(8)} KB  ${ref}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(8)} KB  initial load (limit ${LIMIT / 1024} KB gzip)`);
if (total > LIMIT) {
  console.error('Initial bundle is over the limit');
  process.exit(1);
}
