// Units of measure of the lines: UN/ECE Recommendation 20 codes with the
// label printed on the document in its print language (print
// dictionaries, unit.<code>). When the print language changes, labels
// that are still the standard ones follow it; a label the user typed
// stays.
import { PRINT_DICTIONARIES } from '../../pdf/labels.js';
import { UNIT_CODES } from './draft.js';

export function unitLabel(code, language) {
  const dict = PRINT_DICTIONARIES[language] || PRINT_DICTIONARIES.sk;
  return dict[`unit.${code}`] || PRINT_DICTIONARIES.sk[`unit.${code}`] || '';
}

function isStandardLabel(code, label) {
  return !label || Object.values(PRINT_DICTIONARIES).some(dict => dict[`unit.${code}`] === label);
}

/** Lines with their standard unit labels in another print language. */
export function relabelUnits(lines, language) {
  return (lines || []).map(line => {
    if (!line.unit || !UNIT_CODES.includes(line.unit.code) || !isStandardLabel(line.unit.code, line.unit.label)) return line;
    return { ...line, unit: { code: line.unit.code, label: unitLabel(line.unit.code, language) } };
  });
}
