import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { packagingChanged, withoutVersion } = require('./packaging-changed.cjs');

const manifest = (version, extra = {}) => JSON.stringify({ name: 'we-invoice', version, ...extra });

describe('packaging changed', () => {
  it('reacts to main process, assets, icon, providers and the check itself', () => {
    const read = () => null;
    ['desktop/main.cjs', 'desktop/net-policy.cjs', 'desktop/assets/trayTemplate.png', 'icon.png',
      'packages/core/peppol/providers.json', 'desktop/scripts/check-windows-install.ps1', '.github/workflows/windows-install.yml']
      .forEach(file => expect(packagingChanged([file], read), file).toBe(true));
  });

  it('ignores interface files and tests', () => {
    const read = () => null;
    ['app/src/main.js', 'app/src/i18n/sk/desktop.js', 'desktop/net.test.js', 'README.md', 'docs/changelog/wp-desktop.md']
      .forEach(file => expect(packagingChanged([file], read), file).toBe(false));
  });

  it('ignores a version bump alone but not a dependency change', () => {
    const bump = (which, file) => (file === 'package.json' ? manifest(which === 'before' ? '1.0.0' : '1.0.1') : null);
    expect(packagingChanged(['package.json'], bump)).toBe(false);
    const dep = (which, file) => (file === 'package.json' ? manifest('1.0.0', which === 'after' ? { dependencies: { nodemailer: '1' } } : {}) : null);
    expect(packagingChanged(['package.json'], dep)).toBe(true);
    expect(withoutVersion(JSON.stringify({ version: '1', packages: { '': { version: '1', name: 'x' } } }))).toBe('{"packages":{"":{"name":"x"}}}');
    expect(withoutVersion(null)).toBe(null);
  });
});
