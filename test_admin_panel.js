// Standalone runtime test for the Admin Panel + store (no Telegram connection).
// Mocks a Telegraf bot + ctx and exercises authorization, menus, broadcast
// reporting, history, search and maintenance mode.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- Start from a clean slate so assertions are deterministic -------------
for (const f of ['settings.json', 'topups.json', 'withdrawals.json', 'announcements.json']) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Load store AFTER clearing files so its in-memory cache starts empty
const store = require('./store');
const { setupAdminPanel } = require('./admin_panel');

let passed = 0;
function ok(name) { passed++; console.log('  \u2713', name); }

// ---- Mock Telegraf bot -----------------------------------------------------
const actions = []; // { trigger, handler }
const commands = {};
const bot = {
  action(trigger, handler) { actions.push({ trigger, handler }); },
  command(name, handler) { commands[name] = handler; },
  use() {},
  on() {},
  catch() {}
};

// ---- Mock dependencies -----------------------------------------------------
const ANIM = new Proxy({}, { get: () => '•' });     // any emoji -> bullet
const BTN_ICONS = new Proxy({}, { get: () => '1' }); // any icon id

const usersDb = new Map();
usersDb.set(999, { id: 999, name: 'Admin', username: '@admin', balance: 5, joinedAt: '01/01/2026', orders: [] });
usersDb.set(111, { id: 111, name: 'Alice', username: '@alice', balance: 2.5, joinedAt: '02/01/2026', orders: [] });
usersDb.set(222, { id: 222, name: 'Bob', username: '@bob', balance: 0, joinedAt: '03/01/2026', orders: [] });

function getUser(id, name, username) {
  const n = Number(id);
  if (!usersDb.has(n)) usersDb.set(n, { id: n, name: name || 'User', username: username || '', balance: 0, joinedAt: 'x', orders: [] });
  return usersDb.get(n);
}

const ADMIN_ID = '999';
function isAdmin(id) { return String(id) === ADMIN_ID; }

const userStates = new Map();
const userActiveMsgs = new Map();

let lastScreen = null;
function showScreen(ctx, screen) {
  lastScreen = screen;
  const id = (userActiveMsgs.get(ctx.chat.id) || 1000) + 1;
  userActiveMsgs.set(ctx.chat.id, id);
  return Promise.resolve({ message_id: id, chat: { id: ctx.chat.id } });
}

function getMainMenu(user) {
  return { text: 'MAIN MENU for ' + user.name, reply_markup: { inline_keyboard: [] }, video: null };
}

const api = setupAdminPanel(bot, {
  ANIM, BTN_ICONS, isAdmin, ADMIN_ID, ADMIN_ID_VALID: true,
  usersDb, getUser, saveUsersToDisk: () => {},
  showScreen, userStates, userActiveMsgs,
  getMainMenu, store,
  EXCHANGE_RATE: 4100, SUPPORT_LINK: 'https://t.me/s', SUPPORT_USERNAME: '@s',
  STORE_NAME: 'TESTSTORE', CHANNEL_USERNAME: '@c', CHANNEL_ID: '-100'
});

// ---- ctx factory -----------------------------------------------------------
function makeCtx(fromId, { data, message } = {}) {
  const cbqAlerts = [];
  const copied = [];
  const ctx = {
    from: { id: fromId, first_name: 'Tester', username: 'tester' },
    chat: { id: fromId, type: 'private' },
    match: null,
    _alerts: cbqAlerts,
    _copied: copied,
    answerCbQuery: (t) => { cbqAlerts.push(t || ''); return Promise.resolve(); },
    reply: () => Promise.resolve({ message_id: 1, chat: { id: fromId } }),
    replyWithHTML: () => Promise.resolve({ message_id: 2, chat: { id: fromId } }),
    deleteMessage: () => Promise.resolve(true),
    editMessageText: () => Promise.resolve(true),
    telegram: {
      copyMessage: (toId) => { copied.push(toId); return Promise.resolve({ message_id: 7 }); },
      deleteMessage: () => Promise.resolve(true),
      editMessageText: () => Promise.resolve(true),
      sendMessage: () => Promise.resolve({ message_id: 9 })
    }
  };
  if (data) ctx.callbackQuery = { data, message: { message_id: 50 } };
  if (message) ctx.message = message;
  return ctx;
}

async function fire(ctx, data) {
  for (const { trigger, handler } of actions) {
    if (typeof trigger === 'string') {
      if (trigger === data) { ctx.match = null; return handler(ctx); }
    } else if (trigger instanceof RegExp) {
      const m = String(data).match(trigger);
      if (m) { ctx.match = m; return handler(ctx); }
    }
  }
  throw new Error('No action registered for: ' + data);
}

(async () => {
  console.log('Admin Panel runtime tests\n');

  // 1) Non-admin is denied on a protected action
  {
    const ctx = makeCtx(111, { data: 'ap_home' });
    lastScreen = null;
    await fire(ctx, 'ap_home');
    assert(ctx._alerts.some(a => /បដិសេធការចូល/.test(a)), 'non-admin should get Access Denied (Khmer)');
    assert(lastScreen === null, 'non-admin must not see the panel');
    ok('non-admin blocked from ap_home (Access Denied)');
  }

  // 2) Admin opens the panel
  {
    const ctx = makeCtx(999, { data: 'ap_home' });
    await fire(ctx, 'ap_home');
    assert(/ផ្ទាំងគ្រប់គ្រង/.test(lastScreen.text), 'admin should see panel');
    ok('admin opens Admin Panel');
  }

  // 3) /admin command denies non-admin, allows admin
  {
    const ctxBad = makeCtx(111);
    let replied = '';
    ctxBad.replyWithHTML = (t) => { replied = t; return Promise.resolve({}); };
    await commands['admin'](ctxBad);
    assert(/បដិសេធការចូល/.test(replied), '/admin denies non-admin');
    const ctxGood = makeCtx(999);
    await commands['admin'](ctxGood);
    assert(/ផ្ទាំងគ្រប់គ្រង/.test(lastScreen.text), '/admin opens panel for admin');
    ok('/admin command authorization works');
  }

  // 4) Maintenance: close then open, persistence to disk
  {
    const ctx = makeCtx(999, { data: 'ap_close_yes' });
    await fire(ctx, 'ap_close_yes');
    assert(store.isBotClosed() === true, 'bot should be closed');
    const onDisk = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf-8'));
    assert(onDisk.maintenance === true, 'maintenance persisted to disk');
    await fire(makeCtx(999, { data: 'ap_open_yes' }), 'ap_open_yes');
    assert(store.isBotClosed() === false, 'bot should be open again');
    ok('maintenance close/open persists to disk');
  }

  // 5) Seed history and view topups + withdrawals + details + show more
  {
    store.addTopup({ id: 'TX1', userId: 111, name: 'Alice', username: '@alice', oneXBetId: 'MB1', amountUsd: 5, currency: 'USD', chargeAmount: 5, status: 'paid' });
    store.updateTopup('TX1', { status: 'approved', decidedBy: 'Admin', decidedAt: new Date().toISOString() });
    store.addTopup({ id: 'TX2', userId: 222, name: 'Bob', username: '@bob', oneXBetId: 'MB2', amountUsd: 2.44, currency: 'KHR', chargeAmount: 10000, status: 'rejected', rejectReason: 'bad id' });
    store.addWithdrawal({ id: 'WD1', userId: 111, name: 'Alice', username: '@alice', code: '1234', photoFileId: 'PHOTO123', status: 'pending' });
    store.updateWithdrawal('WD1', { status: 'completed', decidedBy: 'Admin', decidedAt: new Date().toISOString() });

    await fire(makeCtx(999, { data: 'ap_tp_all_0' }), 'ap_tp_all_0');
    assert(/ប្រវត្តិដាក់ប្រាក់/.test(lastScreen.text) && /TX1/.test(lastScreen.text), 'topup list shows TX1');

    await fire(makeCtx(999, { data: 'ap_tp_approved_0' }), 'ap_tp_approved_0');
    assert(/TX1/.test(lastScreen.text) && !/TX2/.test(lastScreen.text), 'approved filter shows only TX1');

    await fire(makeCtx(999, { data: 'ap_tpv_TX1' }), 'ap_tpv_TX1');
    assert(/ព័ត៌មានលម្អិតដាក់ប្រាក់/.test(lastScreen.text) && /មើលបន្ថែម/.test(JSON.stringify(lastScreen.reply_markup)), 'topup detail has Show More');

    await fire(makeCtx(999, { data: 'ap_tpmore_TX1' }), 'ap_tpmore_TX1');
    assert(/ដាក់ស្នើ:/.test(lastScreen.text) && !/មើលបន្ថែម/.test(JSON.stringify(lastScreen.reply_markup)), 'expanded detail shows full fields');

    await fire(makeCtx(999, { data: 'ap_wdf_all_0' }), 'ap_wdf_all_0');
    assert(/ប្រវត្តិដកប្រាក់/.test(lastScreen.text) && /WD1/.test(lastScreen.text), 'withdraw list shows WD1');

    await fire(makeCtx(999, { data: 'ap_wdv_WD1' }), 'ap_wdv_WD1');
    assert(/មើលរូបភាពបញ្ជាក់/.test(JSON.stringify(lastScreen.reply_markup)), 'withdraw detail offers proof image');

    await fire(makeCtx(999, { data: 'ap_wdphoto_WD1' }), 'ap_wdphoto_WD1');
    assert(lastScreen.photo === 'PHOTO123', 'proof image uses stored file id');
    ok('topup/withdraw history, filters, details, show-more, proof image');
  }

  // 6) User management + full history
  {
    await fire(makeCtx(999, { data: 'ap_users_p_0' }), 'ap_users_p_0');
    assert(/គ្រប់គ្រងអ្នកប្រើប្រាស់/.test(lastScreen.text), 'user list renders');
    await fire(makeCtx(999, { data: 'ap_user_111_0' }), 'ap_user_111_0');
    assert(/ព័ត៌មានអ្នកប្រើប្រាស់/.test(lastScreen.text) && /Alice/.test(lastScreen.text), 'user detail renders');
    await fire(makeCtx(999, { data: 'ap_uhist_111_0' }), 'ap_uhist_111_0');
    assert(/ប្រវត្តិអ្នកប្រើប្រាស់/.test(lastScreen.text) && /TX1/.test(lastScreen.text) && /WD1/.test(lastScreen.text), 'user history combines topups+withdraws');
    ok('user management + combined history');
  }

  // 7) Search via handleAdminMessage (admin-only)
  {
    // Non-admin cannot trigger admin input handling
    userStates.set(111, { state: 'AP_TOPUP_SEARCH' });
    const bad = makeCtx(111, { message: { message_id: 3, text: 'TX1' } });
    const handledBad = await api.handleAdminMessage(bad);
    assert(handledBad === false, 'non-admin input is not handled by panel');

    userStates.set(999, { state: 'AP_TOPUP_SEARCH' });
    const good = makeCtx(999, { message: { message_id: 3, text: 'TX1' } });
    const handled = await api.handleAdminMessage(good);
    assert(handled === true && /ព័ត៌មានលម្អិតដាក់ប្រាក់/.test(lastScreen.text), 'admin topup search opens detail');

    userStates.set(999, { state: 'AP_USER_SEARCH' });
    await api.handleAdminMessage(makeCtx(999, { message: { message_id: 4, text: '@alice' } }));
    assert(/ព័ត៌មានអ្នកប្រើប្រាស់/.test(lastScreen.text) && /Alice/.test(lastScreen.text), 'admin user search by @username');
    ok('search (topup + user) via admin message handler, with auth');
  }

  // 8) Broadcast with delivery report (one recipient blocked)
  {
    // Pending preview state as if admin already submitted a message
    userStates.set(999, { state: 'AP_ANN_PREVIEW', annType: 'broadcast', srcChatId: 999, srcMsgId: 500, previewMsgId: null, previewText: 'hello' });
    const ctx = makeCtx(999, { data: 'ap_ann_confirm' });
    // Make recipient 222 fail as "blocked"
    ctx.telegram.copyMessage = (toId) => {
      if (toId === 222) return Promise.reject({ response: { description: 'Forbidden: bot was blocked by the user' } });
      return Promise.resolve({ message_id: 7 });
    };
    await fire(ctx, 'ap_ann_confirm');
    assert(/ការផ្សាយបានបញ្ចប់/.test(lastScreen.text), 'broadcast report shown');
    const anns = store.getAnnouncements();
    assert(anns.length === 1, 'announcement stored');
    const r = anns[0].report;
    assert(r.total === 3 && r.sent === 2 && r.failed === 1 && r.blocked === 1, `report counts correct: ${JSON.stringify(r)}`);
    ok('broadcast sends to all, counts blocked user, stores history');
  }

  // 9) Single-user send
  {
    userStates.set(999, { state: 'AP_ANN_PREVIEW', annType: 'single', target: { userId: 111, username: '@alice', displayName: 'Alice' }, srcChatId: 999, srcMsgId: 501, previewMsgId: null, previewText: 'hi alice' });
    const ctx = makeCtx(999, { data: 'ap_ann_confirm' });
    let sentTo = null;
    ctx.telegram.copyMessage = (toId) => { sentTo = toId; return Promise.resolve({ message_id: 7 }); };
    await fire(ctx, 'ap_ann_confirm');
    assert(sentTo === 111, 'single message sent to resolved numeric id');
    assert(/សារត្រូវបានផ្ញើ/.test(lastScreen.text), 'single send report shown');
    ok('single-user announcement sends to stored numeric id only');
  }

  // 10) HTML escaping guards against injection in display
  {
    store.addTopup({ id: 'TX_HACK', userId: 111, name: '<b>x</b>', username: '@<i>u</i>', oneXBetId: '<script>', amountUsd: 1, currency: 'USD', chargeAmount: 1, status: 'paid' });
    await fire(makeCtx(999, { data: 'ap_tpv_TX_HACK' }), 'ap_tpv_TX_HACK');
    assert(/&lt;script&gt;/.test(lastScreen.text) && !/<script>/.test(lastScreen.text), 'user content is HTML-escaped');
    ok('HTML escaping prevents injection in transaction details');
  }

  console.log(`\nAll ${passed} admin-panel checks passed \u2705`);

  // Cleanup generated data files so production starts clean
  for (const f of ['settings.json', 'topups.json', 'withdrawals.json', 'announcements.json']) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
})().catch(err => {
  console.error('\n\u274c TEST FAILED:', err.message);
  console.error(err.stack);
  // best-effort cleanup
  for (const f of ['settings.json', 'topups.json', 'withdrawals.json', 'announcements.json']) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  process.exit(1);
});
