import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compareVersions, pickAsset, checksumsAsset, parseChecksums } = require('./update-utils.cjs');

const asset = (name) => ({ name, browser_download_url: `https://example.com/${name}`, size: 100 });

describe('versions', () => {
  it('compares numerically, ignores the v prefix, puts pre-releases first', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3', '1.3.0')).toBe(-1);
    expect(compareVersions('1.3.0-beta.1', '1.3.0')).toBe(-1);
    expect(compareVersions('1.3.0', '1.3.0-beta.1')).toBe(1);
    expect(compareVersions('garbage', '1.0.0')).toBe(0);
  });
});

describe('release assets', () => {
  const universal = [
    asset('WE-Invoice-1.0.0-mac-universal.zip'), asset('WE-Invoice-1.0.0-mac-universal.dmg'),
    asset('WE-Invoice-1.0.0-win-x64.exe'), asset('latest-mac.yml'), asset('latest.yml')
  ];
  const perCpu = [
    asset('WE-Invoice-0.2.0-mac-x64.zip'), asset('WE-Invoice-0.2.0-mac-arm64.zip'),
    asset('WE-Invoice-0.2.0-mac-x64.dmg'), asset('WE-Invoice-0.2.0-mac-arm64.dmg'),
    asset('WE-Invoice-0.2.0-win-x64.exe')
  ];

  it('prefers the universal macOS build on any CPU', () => {
    expect(pickAsset(universal, 'darwin', 'arm64').install.name).toBe('WE-Invoice-1.0.0-mac-universal.zip');
    expect(pickAsset(universal, 'darwin', 'x64').manual.name).toBe('WE-Invoice-1.0.0-mac-universal.dmg');
    expect(pickAsset(universal, 'win32', 'x64').install.name).toBe('WE-Invoice-1.0.0-win-x64.exe');
  });

  it('picks the build for the running CPU when there is no universal one', () => {
    expect(pickAsset(perCpu, 'darwin', 'arm64').install.name).toBe('WE-Invoice-0.2.0-mac-arm64.zip');
    expect(pickAsset(perCpu, 'darwin', 'x64').manual.name).toBe('WE-Invoice-0.2.0-mac-x64.dmg');
  });

  it('falls back to the Intel build on Apple silicon', () => {
    const intelOnly = perCpu.filter(a => !a.name.includes('arm64'));
    expect(pickAsset(intelOnly, 'darwin', 'arm64').install.name).toBe('WE-Invoice-0.2.0-mac-x64.zip');
    expect(pickAsset([], 'linux', 'x64')).toEqual({ install: null, manual: null });
  });

  it('finds the checksum file per platform', () => {
    expect(checksumsAsset(universal, 'darwin').name).toBe('latest-mac.yml');
    expect(checksumsAsset(universal, 'win32').name).toBe('latest.yml');
    expect(checksumsAsset(universal, 'linux')).toBe(null);
  });

  it('reads sha512 and size of each file from latest-mac.yml', () => {
    const yml = [
      'version: 1.0.0',
      'files:',
      '  - url: WE-Invoice-1.0.0-mac-universal.zip',
      '    sha512: AAA==',
      '    size: 123',
      '  - url: WE-Invoice-1.0.0-mac-universal.dmg',
      '    sha512: BBB==',
      '    size: 456',
      'path: WE-Invoice-1.0.0-mac-universal.zip',
      'sha512: AAA==',
      "releaseDate: '2026-10-05T10:00:00.000Z'"
    ].join('\n');
    expect(parseChecksums(yml)).toEqual({
      'WE-Invoice-1.0.0-mac-universal.zip': { sha512: 'AAA==', size: 123 },
      'WE-Invoice-1.0.0-mac-universal.dmg': { sha512: 'BBB==', size: 456 }
    });
    expect(parseChecksums('')).toEqual({});
  });
});
