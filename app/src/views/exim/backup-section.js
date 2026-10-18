// The backup panel inside Settings, with the screen's styles.
import '../../style/exim.css';
import { renderBackupPanel } from './backup-panel.js';

export function renderBackupSection(root, deps = {}) {
  renderBackupPanel(root, deps);
}
