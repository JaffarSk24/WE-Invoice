// Help topics and Settings sections: every text exists in SK and EN, the
// search folds diacritics, bodies parse into blocks, the registry works.
import { describe, it, expect } from 'vitest';
import { TOPICS, HELP_GROUPS, helpKeys, filterTopics, groupTopics, bodyBlocks, foldText } from './help.js';
import { SETTINGS_SECTIONS, registerSettingsSection, settingsRenderer, resetSettingsRegistry } from '../settings/registry.js';
import { sk } from '../../i18n/sk/index.js';
import { en } from '../../i18n/en/index.js';

const tr = (dict) => (k) => dict[k] ?? k;
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

describe('help', () => {
  it('has title, short line and body for every topic in SK and EN', () => {
    TOPICS.forEach(topic => Object.values(helpKeys(topic.id)).forEach(k => {
      expect(sk[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
      expect(DASHES.test(sk[k]), k).toBe(false);
    }));
    HELP_GROUPS.forEach(g => expect(sk[`help.group.${g}`]).toBeTruthy());
  });
  it('has the two required guides', () => {
    expect(TOPICS.map(t => t.id)).toEqual(expect.arrayContaining(['start', 'efaktura2027']));
    expect(sk['help.efaktura2027.body']).toContain('2027');
  });
  it('searches without caring about diacritics', () => {
    expect(foldText('Účtovníctvo')).toBe('uctovnictvo');
    const found = filterTopics(TOPICS, { query: 'efaktura 2027' }, tr(sk));
    expect(found.map(t => t.id)).toContain('efaktura2027');
    expect(filterTopics(TOPICS, { onlyNew: true }, tr(sk)).every(t => t.isNew)).toBe(true);
    expect(groupTopics(TOPICS).map(g => g.group)).toEqual(HELP_GROUPS);
  });
  it('turns a body into paragraphs and lists', () => {
    expect(bodyBlocks('Intro\n\n- a\n- b\n\n1. x\n2. y')).toEqual([
      { type: 'p', text: 'Intro' }, { type: 'ul', items: ['a', 'b'] }, { type: 'ol', items: ['x', 'y'] }
    ]);
  });
});

describe('settings registry', () => {
  it('has a title and a description for every section', () => {
    SETTINGS_SECTIONS.forEach(s => {
      expect(sk[`settings.section.${s.id}`]).toBeTruthy();
      expect(en[`settings.section.${s.id}.text`]).toBeTruthy();
    });
  });
  it('lets a package fill a known section only', () => {
    const render = () => {};
    registerSettingsSection('peppol', render);
    expect(settingsRenderer('peppol')).toBe(render);
    expect(() => registerSettingsSection('nope', render)).toThrow();
    resetSettingsRegistry();
    expect(settingsRenderer('peppol')).toBe(null);
  });
});
