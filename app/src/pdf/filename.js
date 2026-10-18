// File name of the PDF from the company's mask, "{kind}_{number}_{buyer}"
// by default: the document kind in the print language, transliterated to
// ASCII, with every character a file system refuses replaced. Cyrillic
// names (a Ukrainian customer) transliterate too, so the name is never
// empty or unreadable.

const DEFAULT_MASK = '{kind}_{number}_{buyer}';
const MAX_LENGTH = 120;

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia'
};
const SPECIAL = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', þ: 'th', ð: 'd' };

export function transliterate(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[Ѐ-ӿ]/g, (ch) => {
      const lower = ch.toLowerCase();
      const out = CYRILLIC[lower] ?? '';
      return ch === lower ? out : out.charAt(0).toUpperCase() + out.slice(1);
    })
    .replace(/[ßæœøđłþð]/gi, (ch) => {
      const out = SPECIAL[ch.toLowerCase()] || '';
      return ch === ch.toLowerCase() ? out : out.charAt(0).toUpperCase() + out.slice(1);
    });
}

// A safe file name part: ASCII letters, digits, dot, dash and underscore.
export function safePart(text) {
  return transliterate(text)
    .replace(/[^A-Za-z0-9.\-_ ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
}

/**
 * @param {object} document
 * @param {{one: Function}} labels  print labels in the main language
 * @param {string} [mask]  company.defaults.pdfFileMask
 */
export function pdfFileName(document, labels, mask = DEFAULT_MASK) {
  const values = {
    kind: safePart(labels.one(`title.${document.kind}`)),
    number: safePart(document.number || 'draft'),
    buyer: safePart(document.buyer && document.buyer.name),
    seller: safePart(document.seller && document.seller.name),
    date: safePart(document.issueDate || ''),
    vs: safePart(document.vs || '')
  };
  let name = String(mask || DEFAULT_MASK).replace(/\{(\w+)\}/g, (m, key) => values[key] ?? '');
  name = safePart(name).replace(/_{2,}/g, '_');
  if (!name) name = 'document';
  return `${name.slice(0, MAX_LENGTH).replace(/[._]+$/, '')}.pdf`;
}
