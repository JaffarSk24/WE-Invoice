// The files the repository publishes: tracked plus new files not ignored,
// so a check sees a file before its first commit too.
import { execSync } from 'node:child_process';

export function repoFiles() {
  return execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean);
}

export const TEXT_FILE = /\.(js|cjs|mjs|json|css|html|md|yml|yaml|txt|svg|webmanifest|example|gitignore|editorconfig|nvmrc)$|(^|\/)(Dockerfile|LICENSE)$/;
