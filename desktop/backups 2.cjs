// Names and rotation of the local backups of the data file, kept apart from
// the file system so they can be tested without Electron. Backup names carry
// the local calendar day: a UTC date would roll over at 22:00 or 23:00 in
// Central Europe and the evening's backup would take the next day's name.

const DATA_FILE = 'we-invoice-data.json';
const BACKUP_PREFIX = 'we-invoice-data-';
const DAILY_BACKUPS_TO_KEEP = 14;
// Copies that are never rotated away: taken before a sync merge or before
// the whole document is replaced (restore from file, import).
const KEPT_TAGS = ['premerge', 'cloud', 'before-replace', 'corrupt'];

const pad = (n) => String(n).padStart(2, '0');

// YYYY-MM-DD of the local calendar day of `date`.
function localDayStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// YYYY-MM-DD_HH-MM-SS, local time, usable in a file name.
function localTimeStamp(date = new Date()) {
  return `${localDayStamp(date)}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function dailyBackupName(date = new Date()) {
  return `${BACKUP_PREFIX}${localDayStamp(date)}.json`;
}

function taggedBackupName(tag, date = new Date()) {
  if (!KEPT_TAGS.includes(tag)) throw new Error(`Unknown backup tag: ${tag}`);
  return `${BACKUP_PREFIX}${tag}-${localTimeStamp(date)}.json`;
}

const DAILY_NAME = new RegExp(`^${BACKUP_PREFIX}\\d{4}-\\d{2}-\\d{2}\\.json$`);

function isDailyBackup(name) {
  return DAILY_NAME.test(name);
}

// The daily backups to delete so that only the newest `keep` remain. Names
// sort by date because the stamp is ISO-like; tagged copies are never listed.
function dailyBackupsToDelete(names, keep = DAILY_BACKUPS_TO_KEEP) {
  const daily = (names || []).filter(isDailyBackup).sort();
  return daily.slice(0, Math.max(0, daily.length - keep));
}

module.exports = {
  DATA_FILE, BACKUP_PREFIX, DAILY_BACKUPS_TO_KEEP, KEPT_TAGS,
  localDayStamp, localTimeStamp, dailyBackupName, taggedBackupName, isDailyBackup, dailyBackupsToDelete
};
