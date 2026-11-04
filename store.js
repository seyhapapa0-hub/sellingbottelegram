// ============================================================================
//  store.js  —  Persistent JSON data store for the Admin Panel
// ----------------------------------------------------------------------------
//  Keeps bot settings (maintenance mode) and full transaction / announcement
//  history on disk so they survive restarts. Designed to sit ALONGSIDE the
//  existing users.json store without ever touching or resetting it.
//
//  Files created (lazily, in the project root):
//    - settings.json       { maintenance, closedAt, closedBy, openedAt, openedBy }
//    - topups.json         [ topup records ]
//    - withdrawals.json    [ withdrawal records ]
//    - announcements.json  [ announcement / broadcast reports ]
//
//  All writes are synchronous (matching the existing users.json pattern) and
//  wrapped in try/catch so a disk error can never crash the bot.
// ============================================================================

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const TOPUPS_FILE = path.join(__dirname, 'topups.json');
const WITHDRAWALS_FILE = path.join(__dirname, 'withdrawals.json');
const ANNOUNCEMENTS_FILE = path.join(__dirname, 'announcements.json');

const DEFAULT_SETTINGS = {
  maintenance: false,   // false = OPEN, true = CLOSED
  closedAt: null,
  closedBy: null,
  openedAt: null,
  openedBy: null
};

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------
function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8');
    if (!raw || !raw.trim()) return fallback;
    const data = JSON.parse(raw);
    return data;
  } catch (err) {
    console.error(`[store] Failed to read ${path.basename(file)}:`, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file); // near-atomic replace to avoid half-written files
    return true;
  } catch (err) {
    console.error(`[store] Failed to write ${path.basename(file)}:`, err.message);
    // Best-effort direct write if rename failed
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e2) {
      console.error(`[store] Fallback write also failed for ${path.basename(file)}:`, e2.message);
      return false;
    }
  }
}

// In-memory caches (kept in sync with disk)
let settings = Object.assign({}, DEFAULT_SETTINGS, readJson(SETTINGS_FILE, {}));
let topups = normalizeArray(readJson(TOPUPS_FILE, []));
let withdrawals = normalizeArray(readJson(WITHDRAWALS_FILE, []));
let announcements = normalizeArray(readJson(ANNOUNCEMENTS_FILE, []));

function normalizeArray(v) {
  return Array.isArray(v) ? v : [];
}

function persistSettings() { writeJson(SETTINGS_FILE, settings); }
function persistTopups() { writeJson(TOPUPS_FILE, topups); }
function persistWithdrawals() { writeJson(WITHDRAWALS_FILE, withdrawals); }
function persistAnnouncements() { writeJson(ANNOUNCEMENTS_FILE, announcements); }

// ---------------------------------------------------------------------------
// Settings / Maintenance mode
// ---------------------------------------------------------------------------
function getSettings() {
  return Object.assign({}, settings);
}

function isBotClosed() {
  return settings.maintenance === true;
}

function closeBot(adminId) {
  settings.maintenance = true;
  settings.closedAt = new Date().toISOString();
  settings.closedBy = adminId != null ? String(adminId) : null;
  persistSettings();
  return getSettings();
}

function openBot(adminId) {
  settings.maintenance = false;
  settings.openedAt = new Date().toISOString();
  settings.openedBy = adminId != null ? String(adminId) : null;
  persistSettings();
  return getSettings();
}

// ---------------------------------------------------------------------------
// Top-up history
//   status: 'paid' (awaiting admin) | 'approved' | 'rejected' | 'cancelled'
// ---------------------------------------------------------------------------
function addTopup(record) {
  if (!record || !record.id) return null;
  // Avoid duplicates (same transaction id)
  const existingIdx = topups.findIndex(t => String(t.id) === String(record.id));
  const full = Object.assign({
    id: record.id,
    userId: null,
    chatId: null,
    name: '',
    username: '',
    oneXBetId: '',
    amountUsd: 0,
    currency: 'USD',
    chargeAmount: 0,
    method: 'KHQR',
    reference: record.id,
    status: 'paid',
    rejectReason: '',
    decidedBy: '',
    decidedById: null,
    decidedAt: null,
    createdAt: new Date().toISOString()
  }, record);

  if (existingIdx >= 0) {
    topups[existingIdx] = Object.assign(topups[existingIdx], full);
  } else {
    topups.push(full);
  }
  persistTopups();
  return full;
}

function updateTopup(id, patch) {
  const idx = topups.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return null;
  topups[idx] = Object.assign(topups[idx], patch || {});
  persistTopups();
  return topups[idx];
}

function findTopup(id) {
  return topups.find(t => String(t.id) === String(id)) || null;
}

function getTopups() {
  // newest first
  return topups.slice().reverse();
}

// ---------------------------------------------------------------------------
// Withdrawal history
//   status: 'pending' | 'processing' | 'completed' | 'rejected' | 'cancelled'
// ---------------------------------------------------------------------------
function addWithdrawal(record) {
  if (!record || !record.id) return null;
  const existingIdx = withdrawals.findIndex(w => String(w.id) === String(record.id));
  const full = Object.assign({
    id: record.id,
    userId: null,
    chatId: null,
    name: '',
    username: '',
    code: '',
    photoFileId: '',
    method: 'Melbet Withdrawal Code',
    amount: null,
    account: '',
    status: 'pending',
    rejectReason: '',
    decidedBy: '',
    decidedById: null,
    decidedAt: null,
    createdAt: new Date().toISOString()
  }, record);

  if (existingIdx >= 0) {
    withdrawals[existingIdx] = Object.assign(withdrawals[existingIdx], full);
  } else {
    withdrawals.push(full);
  }
  persistWithdrawals();
  return full;
}

function updateWithdrawal(id, patch) {
  const idx = withdrawals.findIndex(w => String(w.id) === String(id));
  if (idx < 0) return null;
  withdrawals[idx] = Object.assign(withdrawals[idx], patch || {});
  persistWithdrawals();
  return withdrawals[idx];
}

function findWithdrawal(id) {
  return withdrawals.find(w => String(w.id) === String(id)) || null;
}

function getWithdrawals() {
  return withdrawals.slice().reverse();
}

// ---------------------------------------------------------------------------
// Announcement history
// ---------------------------------------------------------------------------
function addAnnouncement(record) {
  const full = Object.assign({
    id: 'AN' + Date.now().toString().slice(-8),
    type: 'broadcast',          // 'broadcast' | 'single'
    adminId: null,
    preview: '',
    targetUserId: null,
    targetUsername: '',
    report: {},
    createdAt: new Date().toISOString()
  }, record || {});
  announcements.push(full);
  persistAnnouncements();
  return full;
}

function getAnnouncements() {
  return announcements.slice().reverse();
}

// ---------------------------------------------------------------------------
// Aggregations per user (used by User Management / User History)
// ---------------------------------------------------------------------------
function getUserTopups(userId) {
  return topups.filter(t => String(t.userId) === String(userId));
}

function getUserWithdrawals(userId) {
  return withdrawals.filter(w => String(w.userId) === String(userId));
}

function getUserStats(userId) {
  const ut = getUserTopups(userId);
  const uw = getUserWithdrawals(userId);
  const approvedTopups = ut.filter(t => t.status === 'approved');
  const completedWithdraws = uw.filter(w => w.status === 'completed');
  return {
    topupCount: ut.length,
    withdrawCount: uw.length,
    totalTopupUsd: approvedTopups.reduce((s, t) => s + (Number(t.amountUsd) || 0), 0),
    totalWithdrawCount: completedWithdraws.length,
    pending: ut.filter(t => t.status === 'paid').length + uw.filter(w => w.status === 'pending').length,
    completed: approvedTopups.length + completedWithdraws.length,
    rejected: ut.filter(t => t.status === 'rejected').length + uw.filter(w => w.status === 'rejected').length,
    cancelled: ut.filter(t => t.status === 'cancelled').length + uw.filter(w => w.status === 'cancelled').length
  };
}

module.exports = {
  // settings / maintenance
  getSettings,
  isBotClosed,
  closeBot,
  openBot,
  // topups
  addTopup,
  updateTopup,
  findTopup,
  getTopups,
  getUserTopups,
  // withdrawals
  addWithdrawal,
  updateWithdrawal,
  findWithdrawal,
  getWithdrawals,
  getUserWithdrawals,
  // announcements
  addAnnouncement,
  getAnnouncements,
  // aggregates
  getUserStats
};
