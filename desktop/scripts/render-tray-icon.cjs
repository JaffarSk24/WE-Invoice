// Renders the menu-bar icon of macOS: an invoice sheet, black on
// transparent, as a template image (macOS recolours it for light and dark
// menu bars). Drawn from a pixel map so the result is crisp at 16 px and
// needs no Electron or browser to build:
//   node desktop/scripts/render-tray-icon.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 16 x 16: a sheet with a folded corner and three lines of text.
const SHEET = [
  '................',
  '...#######......',
  '...#.....##.....',
  '...#.....#.#....',
  '...#.....####...',
  '...#........#...',
  '...#..#####.#...',
  '...#........#...',
  '...#..#####.#...',
  '...#........#...',
  '...#..###...#...',
  '...#........#...',
  '...#........#...',
  '...##########...',
  '................',
  '................'
];

const OUTPUTS = [
  { file: 'trayTemplate.png', scale: 1 },
  { file: 'trayTemplate@2x.png', scale: 2 }
];

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typed) >>> 0);
  return Buffer.concat([length, typed, crc]);
}

// An RGBA PNG from a pixel map; `#` is an opaque black pixel.
function encodePng(rows, scale) {
  const size = rows.length * scale;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const on = rows[Math.floor(y / scale)][Math.floor(x / scale)] === '#';
      raw[y * (size * 4 + 1) + 1 + x * 4 + 3] = on ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(dir, { recursive: true });
  OUTPUTS.forEach(({ file, scale }) => {
    fs.writeFileSync(path.join(dir, file), encodePng(SHEET, scale));
    console.info('wrote', path.join('desktop', 'assets', file));
  });
}

module.exports = { encodePng, SHEET };
