require('dotenv').config();
const { Telegraf } = require('telegraf');
const path = require('path');
const fs = require('fs');
const { createKhqrCard } = require('./khqr_card');
const store = require('./store');
const { setupAdminPanel } = require('./admin_panel');
let adminPanel = null; // assigned once deps are ready (before bot.launch)

// Guide & Welcome Videos Configuration
function resolveVideoPath(...names) {
  for (const name of names) {
    const exts = ['.mp4', '.MOV', '.mov', '.MP4'];
    for (const ext of exts) {
      const p = path.join(__dirname, `${name}${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const WELCOME_VIDEO_PATH = resolveVideoPath('IMG_0942', 'welcome') || path.join(__dirname, 'IMG_0942.MP4');
let cachedWelcomeVideoFileId = null;

let cachedAddFundsVideoFileId = null;
function getAddFundsVideo() {
  if (cachedAddFundsVideoFileId) return cachedAddFundsVideoFileId;
  const filePath = resolveVideoPath('addfound', 'addfunds', 'topup');
  return filePath ? { source: filePath } : null;
}

let cachedWithdrawVideoFileId = null;
function getWithdrawVideo() {
  if (cachedWithdrawVideoFileId) return cachedWithdrawVideoFileId;
  const filePath = resolveVideoPath('withdrawmoney', 'withdraw', 'withdraw_money');
  return filePath ? { source: filePath } : null;
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '-1003930632930';
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@PAY8BET1680';
const CHANNEL_LINK = process.env.CHANNEL_LINK || 'https://t.me/PAY8BET1680';
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || '@PAY8BET168';
const SUPPORT_LINK = process.env.SUPPORT_LINK || 'https://t.me/PAY8BET168';

// Admin Notification Groups (Only send to private groups, never to public channel)
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID || null;
const ADMIN_TOPUP_GROUP_ID = process.env.ADMIN_TOPUP_GROUP_ID || ADMIN_GROUP_ID;
const ADMIN_WITHDRAW_GROUP_ID = process.env.ADMIN_WITHDRAW_GROUP_ID || ADMIN_GROUP_ID;

// PayLinkAPI Configuration
const PAYLINK_BASE_URL = process.env.PAYLINK_BASE_URL || 'https://paylinkapi-bot.onrender.com';
const PAYLINK_API_KEY = process.env.PAYLINK_API_KEY || 'plk_live_std_d0b420ff88ca';
const PAYLINK_SECRET = process.env.PAYLINK_SECRET || 'whsec_5bad6c5e8bf502f1';
const STORE_NAME = process.env.STORE_NAME || 'PAY8BET168';
const EXCHANGE_RATE = parseInt(process.env.EXCHANGE_RATE, 10) || 4100;

if (!BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN is missing in .env file!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Global Error Handler to prevent any process crashes
bot.catch((err, ctx) => {
  console.warn(`[Telegraf Error] for ${ctx.updateType}:`, err.message);
});

// ---------------- TELEGRAM PREMIUM ANIMATED CUSTOM EMOJIS ----------------
const ANIM = {
  MEGAPHONE: '<tg-emoji emoji-id="5424818078833715060">📣</tg-emoji>',
  BULB: '<tg-emoji emoji-id="5422439311196834318">💡</tg-emoji>',
  FLOWER: '<tg-emoji emoji-id="5465119341815027379">🌸</tg-emoji>',
  CHECK: '<tg-emoji emoji-id="5206607081334906820">✔️</tg-emoji>',
  SUCCESS: '<tg-emoji emoji-id="5280786041324707830">✅</tg-emoji>',
  CROSS: '<tg-emoji emoji-id="5210952531676504517">❌</tg-emoji>',
  CROWN: '<tg-emoji emoji-id="5217822164362739968">👑</tg-emoji>',
  USER: '<tg-emoji emoji-id="5217822164362739968">👑</tg-emoji>',
  OFFICER: '<tg-emoji emoji-id="5280958226563606026">👮</tg-emoji>',
  DIAMOND: '<tg-emoji emoji-id="5427168083074628963">💎</tg-emoji>',
  STAR: '<tg-emoji emoji-id="5438496463044752972">⭐️</tg-emoji>',
  SPARKLES: '<tg-emoji emoji-id="5325547803936572038">✨</tg-emoji>',
  FIRE: '<tg-emoji emoji-id="5424972470023104089">🔥</tg-emoji>',
  LIGHTNING: '<tg-emoji emoji-id="5456140674028019486">⚡️</tg-emoji>',
  MONEY: '<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji>',
  WAVE: '<tg-emoji emoji-id="5407076281898512830">👋</tg-emoji>',
  PARTY: '<tg-emoji emoji-id="5461151367559141950">🎉</tg-emoji>',
  WARN: '<tg-emoji emoji-id="5447644880824181073">⚠️</tg-emoji>',
  ID: '<tg-emoji emoji-id="5334544901428229844">ℹ️</tg-emoji>',
  CALENDAR: '<tg-emoji emoji-id="5413879192267805083">🗓</tg-emoji>',
  DOWN: '<tg-emoji emoji-id="5406745015365943482">⬇️</tg-emoji>',
  CHAT: '<tg-emoji emoji-id="5443038326535759644">💬</tg-emoji>',
  CART: '<tg-emoji emoji-id="5229064374403998351">🛍</tg-emoji>',
  CHART: '<tg-emoji emoji-id="5244837092042750681">📈</tg-emoji>',
  REFRESH: '<tg-emoji emoji-id="5375338737028841420">🔄</tg-emoji>',
  LOCK: '<tg-emoji emoji-id="5296369303661067030">🔒</tg-emoji>',
  BACK: '<tg-emoji emoji-id="5363896514655564837">⬅️</tg-emoji>',
  HOURGLASS: '<tg-emoji emoji-id="5386367538735104399">⌛</tg-emoji>',
  CARD: '<tg-emoji emoji-id="5445353829304387411">💳</tg-emoji>',
  GAME: '<tg-emoji emoji-id="5409125874651903587">🎮</tg-emoji>',
  SHIELD: '<tg-emoji emoji-id="5251203410396458957">🛡</tg-emoji>',
  SIREN: '<tg-emoji emoji-id="5395695537687123235">🚨</tg-emoji>',
  PIN: '<tg-emoji emoji-id="5397782960512444700">📌</tg-emoji>',
  RECEIPT: '<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji>',
  PHONE: '<tg-emoji emoji-id="5253655686398629310">📱</tg-emoji>',
  CAMERA: '<tg-emoji emoji-id="5332798318617567350">📸</tg-emoji>',
  DEPOSIT: '<tg-emoji emoji-id="5443127283898405358">📥</tg-emoji>',
  WITHDRAW: '<tg-emoji emoji-id="5445355530111437729">📤</tg-emoji>',
  MELBET: '<tg-emoji emoji-id="5467697670812376018">🔥</tg-emoji>'
};

// Custom Emoji IDs for Buttons
const BTN_ICONS = {
  MEGAPHONE: '5424818078833715060',
  BULB: '5422439311196834318',
  CHAT: '5443038326535759644',
  CHECK: '5206607081334906820',
  SUCCESS: '5280786041324707830',
  CART: '5229064374403998351',
  MONEY: '5409048419211682843',
  CROWN: '5217822164362739968',
  CHART: '5244837092042750681',
  REFRESH: '5375338737028841420',
  GAME: '5409125874651903587',
  PLANE: '5447630114726624483',
  BACK: '5363896514655564837',
  DIAMOND: '5427168083074628963',
  EDIT: '5395444784611480792',
  CANCEL: '5210952531676504517',
  CARD: '5445353829304387411',
  SHIELD: '5251203410396458957',
  CAMERA: '5332798318617567350',
  DEPOSIT: '5443127283898405358',
  WITHDRAW: '5445355530111437729',
  MELBET: '5467697670812376018'
};

// ---------------- SECURE ADMIN CONFIGURATION ----------------
// The Admin Panel is accessible ONLY to the numeric Telegram ID configured in
// .env (ADMIN_ID). ADMIN_CHAT_ID is kept as a backward-compatible fallback for
// existing deployments. The id is NEVER hardcoded in source.
const ADMIN_ID = String(process.env.ADMIN_ID || process.env.ADMIN_CHAT_ID || '').trim();
const ADMIN_ID_VALID = /^\d+$/.test(ADMIN_ID);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ADMIN_ID; // used for legacy group notifications
const USERS_FILE_PATH = path.join(__dirname, 'users.json');

if (!ADMIN_ID_VALID) {
  console.warn('⚠️  WARNING: ADMIN_ID is missing or invalid in .env. The Admin Panel is DISABLED (fail-secure) and no user can access admin features. Set ADMIN_ID=<your numeric Telegram id> in .env.');
}

// Reusable, strict admin authorization check. Compares the caller's numeric
// Telegram id against ADMIN_ID. Button visibility / callback data are never
// trusted for authorization — this is called inside every admin handler.
function isAdmin(id) {
  if (!ADMIN_ID_VALID) return false;              // fail secure
  if (id === undefined || id === null) return false;
  return String(id) === ADMIN_ID;
}

// In-memory Database & Sessions
const usersDb = new Map();
const userStates = new Map(); // tracks user input modes (e.g., custom amount, broadcast)
const pendingTxs = new Map(); // tracks active QR payments & countdown timers
const userActiveMsgs = new Map(); // tracks last active bot message id to delete & replace cleanly
const topupRequests = new Map(); // tracks completed payments waiting for admin to add funds
const withdrawRequests = new Map(); // tracks pending withdrawal requests waiting for admin to process

function loadUsersFromDisk() {
  try {
    if (fs.existsSync(USERS_FILE_PATH)) {
      const raw = fs.readFileSync(USERS_FILE_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const u of data) {
          if (u && u.id) {
            usersDb.set(Number(u.id), u);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error loading users.json:', err.message);
  }
}

function saveUsersToDisk() {
  try {
    const list = Array.from(usersDb.values());
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving users.json:', err.message);
  }
}

// Load users from storage
loadUsersFromDisk();

function getUser(id, firstName = 'User', username = '') {
  const numericId = Number(id);
  if (!usersDb.has(numericId)) {
    usersDb.set(numericId, {
      id: numericId,
      name: firstName || 'User',
      username: username ? (username.startsWith('@') ? username : `@${username}`) : '',
      balance: 0.00,
      joinedAt: new Date().toLocaleDateString('km-KH', { timeZone: 'Asia/Phnom_Penh' }),
      orders: []
    });
    saveUsersToDisk();
  } else {
    const user = usersDb.get(numericId);
    let changed = false;
    if (firstName && user.name !== firstName) {
      user.name = firstName;
      changed = true;
    }
    const cleanUsername = username ? (username.startsWith('@') ? username : `@${username}`) : '';
    if (cleanUsername && user.username !== cleanUsername) {
      user.username = cleanUsername;
      changed = true;
    }
    if (changed) saveUsersToDisk();
  }
  return usersDb.get(numericId);
}

// Ensure the configured Admin is always registered (if a valid ADMIN_ID is set)
if (ADMIN_ID_VALID) getUser(Number(ADMIN_ID), 'Admin');

/**
 * Clean In-Place Message Display:
 * Removes the old message and shows the new one, or edits in-place so chat never stacks up!
 */
async function showScreen(ctx, { text, reply_markup, photo = null, video = null, videoKey = null }) {
  const chatId = ctx.chat.id;
  const oldMsgId = userActiveMsgs.get(chatId);

  // If user clicked an inline button, we try editing in-place first if both are plain text (no media)
  if (ctx.callbackQuery && !photo && !video && ctx.callbackQuery.message && !ctx.callbackQuery.message.photo && !ctx.callbackQuery.message.video) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
      userActiveMsgs.set(chatId, ctx.callbackQuery.message.message_id);
      return;
    } catch (e) {
      // If edit fails, fall through to delete and replace
    }
  }

  // Delete previous bot message to keep chat completely clean (no stacking up/down)
  if (oldMsgId) {
    await ctx.telegram.deleteMessage(chatId, oldMsgId).catch(() => { });
  } else if (ctx.callbackQuery?.message?.message_id) {
    await ctx.telegram.deleteMessage(chatId, ctx.callbackQuery.message.message_id).catch(() => { });
  }

  // Send new message
  let sent;
  if (video) {
    try {
      if (typeof video === 'object' && video?.source) {
        ctx.sendChatAction('upload_video').catch(() => { });
      }
      sent = await ctx.replyWithVideo(video, {
        caption: text,
        parse_mode: 'HTML',
        reply_markup
      });
      if (sent?.video?.file_id) {
        if (videoKey === 'welcome') {
          cachedWelcomeVideoFileId = sent.video.file_id;
        } else if (videoKey === 'addfunds') {
          cachedAddFundsVideoFileId = sent.video.file_id;
        } else if (videoKey === 'withdraw') {
          cachedWithdrawVideoFileId = sent.video.file_id;
        } else if (!videoKey) {
          cachedWelcomeVideoFileId = sent.video.file_id;
        }
      }
    } catch (err) {
      console.warn("Could not send video, falling back to text:", err.message);
      sent = await ctx.replyWithHTML(text, { reply_markup });
    }
  } else if (photo) {
    sent = await ctx.replyWithPhoto(photo, {
      caption: text,
      parse_mode: 'HTML',
      reply_markup
    });
  } else {
    sent = await ctx.replyWithHTML(text, { reply_markup });
  }

  if (sent?.message_id) {
    userActiveMsgs.set(chatId, sent.message_id);
  }
  return sent;
}

// ---------------- PAYLINKAPI PAYMENT FUNCTIONS ----------------

async function generateKHQR(amount, currency = 'USD') {
  const url = `${PAYLINK_BASE_URL}/api/aba/generate-qr`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': PAYLINK_API_KEY,
      'x-secret': PAYLINK_SECRET
    },
    body: JSON.stringify({ amount: parseFloat(amount), currency })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayLinkAPI error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

async function checkPaymentStatus(tranId, md5) {
  const url = `${PAYLINK_BASE_URL}/api/web/check-payment`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': PAYLINK_API_KEY
    },
    body: JSON.stringify({ tranId, md5 })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayLinkAPI check error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

async function checkMembership(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_ID, userId);
    const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
    return {
      isMember: validStatuses.includes(member.status),
      error: null
    };
  } catch (error) {
    const errMsg = error.response?.description || error.message;
    return {
      isMember: false,
      error: errMsg
    };
  }
}

// ---------------- MENUS ----------------

function getForceSubMenu() {
  const text =
    `${ANIM.MEGAPHONE} <b>សូមចូលរួម Channel របស់យើងសិន ដើម្បីប្រើប្រាស់ Bot</b>

${ANIM.BULB} <i>បន្ទាប់ពីចូលរួម សូមចុចប៊ូតុង " ${ANIM.FLOWER} ខ្ញុំបានចូលរួមហើយ " ខាងក្រោម</i>`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'ចូលរួម Channel',
          url: CHANNEL_LINK,
          icon_custom_emoji_id: BTN_ICONS.MEGAPHONE,
          style: 'primary'
        }
      ],
      [
        {
          text: 'ខ្ញុំបានចូលរួមហើយ',
          callback_data: 'verify_joined',
          icon_custom_emoji_id: BTN_ICONS.CHECK,
          style: 'success'
        }
      ]
    ]
  };

  return { text, reply_markup };
}

// NOTE: The old in-line broadcast helper was replaced by the full Announcement
// System in admin_panel.js (broadcast to all / single user + delivery reports +
// persistent history). Admin broadcast entry points now delegate to the panel.

function getMainMenu(user) {
  const isUserAdmin = isAdmin(user.id);
  const text =
    `╔════════════════════════════╗
${ANIM.MELBET}  <b>QUICKACC ONLI  |  PAY 8BET</b>  ${ANIM.MELBET}
╚════════════════════════════╝

${ANIM.WAVE} <b>សួស្តី</b> <a href="tg://user?id=${user.id}">${user.name}</a>!${isUserAdmin ? ` (👑 <b>អ្នកគ្រប់គ្រង</b>)` : ''}
${ANIM.SPARKLES} <i>សូមស្វាគមន៍មកកាន់ប្រព័ន្ធសេវាកម្មស្វ័យប្រវត្តិ 24/7!</i>

${ANIM.DOWN} <b>សូមជ្រើសរើសមុខងារដែលអ្នកចង់ប្រើប្រាស់៖</b>`;

  const keyboard = [
    [
      {
        text: 'ដាក់ប្រាក់',
        callback_data: 'menu_topup',
        icon_custom_emoji_id: BTN_ICONS.DEPOSIT,
        style: 'success'
      },
      {
        text: 'ដកប្រាក់',
        callback_data: 'menu_withdraw',
        icon_custom_emoji_id: BTN_ICONS.WITHDRAW,
        style: 'primary'
      }
    ],
    [
      {
        text: 'របៀបដាក់ប្រាក់',
        callback_data: 'guide_topup',
        icon_custom_emoji_id: BTN_ICONS.MELBET,
        style: 'primary'
      },
      {
        text: 'របៀបដកប្រាក់',
        callback_data: 'guide_withdraw',
        icon_custom_emoji_id: BTN_ICONS.MELBET,
        style: 'primary'
      }
    ],
    [
      {
        text: 'My Orders',
        callback_data: 'menu_history',
        icon_custom_emoji_id: BTN_ICONS.CHART,
        style: 'primary'
      }
    ],
    [
      {
        text: 'Support',
        url: SUPPORT_LINK,
        icon_custom_emoji_id: BTN_ICONS.CHAT,
        style: 'primary'
      }
    ]
  ];

  // Admin-only entry point to the full premium Admin Control Panel
  if (isUserAdmin) {
    keyboard.push([
      {
        text: `👑 ផ្ទាំងគ្រប់គ្រង (ADMIN)`,
        callback_data: 'ap_home',
        icon_custom_emoji_id: BTN_ICONS.CROWN,
        style: 'success'
      }
    ]);
  }

  const reply_markup = { inline_keyboard: keyboard };

  let video = null;
  if (cachedWelcomeVideoFileId) {
    video = cachedWelcomeVideoFileId;
  } else if (fs.existsSync(WELCOME_VIDEO_PATH)) {
    video = { source: WELCOME_VIDEO_PATH };
  }

  return { text, reply_markup, video, videoKey: 'welcome' };
}

// ---------------- GLOBAL STRICT FORCE-SUB MIDDLEWARE & BROADCAST ----------------
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;

  if (userId) {
    getUser(userId, ctx.from?.first_name, ctx.from?.username);
  }

  // Handle Admin Panel text/media input (announcement content, search queries).
  // handleAdminMessage returns true ONLY for a verified admin in an admin input
  // state; it internally re-checks isAdmin, so no bypass is possible here.
  if (adminPanel && ctx.message) {
    const handled = await adminPanel.handleAdminMessage(ctx);
    if (handled) return;
  }

  // Maintenance Mode Gate: while the bot is CLOSED, block every normal-user
  // action (messages AND callbacks) in private chats. Admins are exempt so the
  // Admin Panel keeps working. Status is read from persistent storage.
  if (ctx.chat?.type === 'private' && !isAdmin(userId) && store.isBotClosed()) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Bot ត្រូវបានបិទជាបណ្តោះអាសន្ន សម្រាប់ការថែទាំ។', { show_alert: true }).catch(() => { });
    }
    if (adminPanel) return adminPanel.showClosedScreen(ctx);
    return; // fail-closed: block if panel not ready
  }

  if (ctx.callbackQuery && ctx.callbackQuery.data === 'verify_joined') {
    return next();
  }

  if (!userId) return next();

  // Admins bypass the force-subscribe gate so the Admin Panel is always reachable
  if (isAdmin(userId)) return next();

  if (ctx.chat?.type === 'private') {
    const check = await checkMembership(ctx, userId);

    if (!check.isMember) {
      const { text, reply_markup } = getForceSubMenu();

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('⚠️ អ្នកត្រូវតែចូលរួម Channel ជាមុនសិន ដើម្បីប្រើប្រាស់ Bot!', { show_alert: true }).catch(() => { });
      }
      return showScreen(ctx, { text, reply_markup });
    }
  }

  return next();
});

// ---------------- COMMANDS ----------------

bot.start(async (ctx) => {
  // Delete user's incoming /start command to keep chat clean
  await ctx.deleteMessage().catch(() => { });
  userStates.delete(ctx.from.id);

  const user = getUser(ctx.from.id, ctx.from.first_name, ctx.from.username);
  const { text, reply_markup, video } = getMainMenu(user);
  return showScreen(ctx, { text, reply_markup, video });
});

// Admin Broadcast Command -> opens the Announcement Center (Admin Panel)
bot.command('broadcast', async (ctx) => {
  await ctx.deleteMessage().catch(() => { });
  if (!isAdmin(ctx.from.id)) {
    await ctx.replyWithHTML('⛔ <b>បដិសេធការចូល! អ្នកមិនមានសិទ្ធិប្រើប្រាស់ផ្ទាំងគ្រប់គ្រងនេះទេ។</b>').catch(() => { });
    return;
  }
  if (adminPanel) return adminPanel.openAnnouncementMenu(ctx);
});

// Legacy broadcast callback -> delegates to the Announcement Center (re-auth)
bot.action('admin_broadcast_menu', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('⛔ បដិសេធការចូល! អ្នកមិនមានសិទ្ធិប្រើប្រាស់ផ្ទាំងគ្រប់គ្រងនេះទេ។', { show_alert: true }).catch(() => { });
    return;
  }
  await ctx.answerCbQuery().catch(() => { });
  if (adminPanel) return adminPanel.openAnnouncementMenu(ctx);
});

// Quick Helper: /id command to get any Chat/Group ID easily
bot.command('id', async (ctx) => {
  const chatInfo =
    `${ANIM.ID} <b>Chat ID:</b> <code>${ctx.chat.id}</code>
${ANIM.PIN} <b>Title:</b> <code>${ctx.chat.title || ctx.chat.first_name || 'Private'}</code>
${ANIM.ID} <b>Type:</b> <code>${ctx.chat.type}</code>`;

  console.log(`\n📢 [ID Command] Chat ID: ${ctx.chat.id} | Title: "${ctx.chat.title || 'Private'}" | Type: ${ctx.chat.type}`);
  return ctx.replyWithHTML(chatInfo);
});

// Detect when Bot is added to a new Group or Channel
bot.on('my_chat_member', (ctx) => {
  console.log(`\n📢 [Bot Added to Group/Channel]`);
  console.log(`👉 Title: "${ctx.chat.title}"`);
  console.log(`👉 EXACT CHAT ID: ${ctx.chat.id}`);
  console.log(`👉 Status: ${ctx.myChatMember.new_chat_member.status}\n`);
});

// ---------------- CALLBACK QUERIES ----------------

bot.action('verify_joined', async (ctx) => {
  const userId = ctx.from.id;
  const user = getUser(userId, ctx.from.first_name);

  try {
    const check = await checkMembership(ctx, userId);

    if (check.isMember) {
      await ctx.answerCbQuery('🎉 សូមអរគុណ! អ្នកបានចូលរួម Channel ជោគជ័យហើយ!', { show_alert: true }).catch(() => { });
      const { text, reply_markup, video } = getMainMenu(user);
      return showScreen(ctx, { text, reply_markup, video });
    } else {
      await ctx.answerCbQuery(
        '⚠️ សូមអភ័យទោស! អ្នកមិនទាន់បានចុចចូលរួម Channel ទេ!\n\nសូមចុចប៊ូតុង "ចូលរួម Channel" ជាមុនសិន រួចចុចផ្ទៀងផ្ទាត់ម្តងទៀត។',
        { show_alert: true }
      ).catch(() => { });
    }
  } catch (err) {
    await ctx.answerCbQuery('⚠️ មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់! សូមព្យាយាមម្តងទៀត។').catch(() => { });
  }
});

bot.action('menu_refresh', async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  const { text, reply_markup, video } = getMainMenu(user);
  await ctx.answerCbQuery('🔄 បានធ្វើបច្ចុប្បន្នភាពរួចរាល់!').catch(() => { });
  return showScreen(ctx, { text, reply_markup, video });
});

bot.action('menu_profile', async (ctx) => {
  userStates.delete(ctx.from.id);
  const user = getUser(ctx.from.id, ctx.from.first_name);
  const text =
    `${ANIM.CROWN} <b>ព័ត៌មានគណនីរបស់អ្នក (YOUR PROFILE)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.CROWN} <b>ឈ្មោះ:</b> ${user.name}
${ANIM.ID} <b>User ID:</b> <code>${user.id}</code>
${ANIM.MONEY} <b>សមតុល្យ:</b> <code>$${user.balance.toFixed(2)} USD</code>
${ANIM.CART} <b>ចំនួនទិញសរុប:</b> <code>${user.orders.length} ដង</code>
${ANIM.CALENDAR} <b>កាលបរិច្ឆេទចូលរួម:</b> <code>${user.joinedAt}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'បញ្ចូលលុយឥឡូវនេះ',
          callback_data: 'menu_topup',
          icon_custom_emoji_id: BTN_ICONS.MONEY,
          style: 'success'
        }
      ],
      [
        {
          text: 'ត្រឡប់ក្រោយ (Back)',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'primary'
        }
      ]
    ]
  };

  await ctx.answerCbQuery().catch(() => { });
  return showScreen(ctx, { text, reply_markup });
});

bot.action('menu_buy', async (ctx) => {
  userStates.delete(ctx.from.id);
  const text =
    `${ANIM.CART} <b>បញ្ជីសេវាកម្ម និងគណនី (PRODUCT CATALOG)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>សូមជ្រើសរើសប្រភេទគណនីដែលអ្នកចង់ទិញ៖</i>

${ANIM.LIGHTNING} <b>1. គណនី Telegram (Old / New)</b>
${ANIM.FIRE} <b>2. គណនី Game (Free Fire / PUBG)</b>
${ANIM.SPARKLES} <b>3. គណនី Social (TikTok, Facebook, IG)</b>
${ANIM.DIAMOND} <b>4. គណនី Gmail Verified</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.CHECK} <i>រាល់ការទិញទទួលបានការធានា 100%!</i>`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: 'Telegram ($1.50)', callback_data: 'buy_item_tg', icon_custom_emoji_id: BTN_ICONS.PLANE, style: 'primary' },
        { text: 'Game ($3.00)', callback_data: 'buy_item_game', icon_custom_emoji_id: BTN_ICONS.GAME, style: 'primary' }
      ],
      [
        { text: 'Social Media ($2.00)', callback_data: 'buy_item_social', icon_custom_emoji_id: BTN_ICONS.DIAMOND, style: 'primary' },
        { text: 'Gmail Verified ($0.50)', callback_data: 'buy_item_gmail', icon_custom_emoji_id: BTN_ICONS.CHECK, style: 'primary' }
      ],
      [
        { text: 'ត្រឡប់ក្រោយ (Back)', callback_data: 'back_main', icon_custom_emoji_id: BTN_ICONS.BACK, style: 'danger' }
      ]
    ]
  };

  await ctx.answerCbQuery().catch(() => { });
  return showScreen(ctx, { text, reply_markup });
});

// ---------------- HOW TO DEPOSIT & WITHDRAW GUIDES ----------------

bot.action('guide_topup', async (ctx) => {
  await ctx.answerCbQuery().catch(() => { });
  const text =
    `${ANIM.MELBET} <b>របៀបដាក់ប្រាក់ (How to Top-Up)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.SPARKLES} <i>ខាងក្រោមនេះជាវីដេអូបង្រៀនលម្អិតអំពីរបៀបដាក់ប្រាក់ (Add Funds) ចូលក្នុងគណនី Melbet របស់អ្នក៖</i>

${ANIM.CHECK} <b>ជំហានងាយៗ៖</b>
1️⃣ ចុចប៊ូតុង <b>«ដាក់ប្រាក់»</b> នៅលើ Menu ចម្បង
2️⃣ បញ្ចូលលេខ <b>ID Melbet</b> របស់អ្នក
3️⃣ ជ្រើសរើសរូបិយប័ណ្ណ (USD ឬ រៀល) និងចំនួនទឹកប្រាក់
4️⃣ ស្កេនទូទាត់តាម <b>KHQR</b> ហើយរង់ចាំ Admin បញ្ចូលទឹកប្រាក់ជាការស្រេច!`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'ដាក់ប្រាក់ឥឡូវនេះ',
          callback_data: 'menu_topup',
          icon_custom_emoji_id: BTN_ICONS.DEPOSIT,
          style: 'success'
        }
      ],
      [
        {
          text: 'ត្រឡប់ក្រោយ (Back)',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'primary'
        }
      ]
    ]
  };

  const video = getAddFundsVideo();
  return showScreen(ctx, { text, reply_markup, video, videoKey: 'addfunds' });
});

bot.action('guide_withdraw', async (ctx) => {
  await ctx.answerCbQuery().catch(() => { });
  const text =
    `${ANIM.MELBET} <b>របៀបដកប្រាក់ (How to Withdraw)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.SPARKLES} <i>ខាងក្រោមនេះជាវីដេអូបង្រៀនលម្អិតអំពីរបៀបដកប្រាក់ (Withdraw Money) ពីគណនី Melbet របស់អ្នក៖</i>

${ANIM.CHECK} <b>ជំហានងាយៗ៖</b>
1️⃣ ចូលទៅកាន់ App Melbet រួចស្នើសុំដកប្រាក់
2️⃣ ចុចប៊ូតុង <b>«ដកប្រាក់»</b> នៅលើ Bot នេះ
3️⃣ បញ្ចូល <b>លេខកូដដកប្រាក់ (Withdrawal Code)</b>
4️⃣ ផ្ញើរូបភាព <b>QR Code ធនាគារ</b> របស់អ្នកដើម្បីទទួលប្រាក់!`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'ដកប្រាក់ឥឡូវនេះ',
          callback_data: 'menu_withdraw',
          icon_custom_emoji_id: BTN_ICONS.WITHDRAW,
          style: 'primary'
        }
      ],
      [
        {
          text: 'ត្រឡប់ក្រោយ (Back)',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'primary'
        }
      ]
    ]
  };

  const video = getWithdrawVideo();
  return showScreen(ctx, { text, reply_markup, video, videoKey: 'withdraw' });
});

// ---------------- MELBET WITHDRAWAL (STEP 1 OF 2: INPUT CODE) ----------------

bot.action('menu_withdraw', async (ctx) => {
  const userId = ctx.from.id;
  userStates.set(userId, { state: 'AWAITING_WITHDRAW_CODE' });

  const text =
    `${ANIM.CARD} <b>Melbet Withdrawal | Step 1 of 2</b>
────────────
${ANIM.SHIELD} សូមផ្ញើលេខកូដសម្ងាត់ដកប្រាក់ (4-Digit Code):`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'បោះបង់',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.CANCEL,
          style: 'danger'
        }
      ]
    ]
  };

  await ctx.answerCbQuery().catch(() => { });
  return showScreen(ctx, { text, reply_markup });
});

// ---------------- MELBET TOP-UP (STEP 1 OF 2: INPUT MELBET ID) ----------------

bot.action('menu_topup', async (ctx) => {
  const userId = ctx.from.id;
  userStates.set(userId, { state: 'AWAITING_MELBET_ID' });

  const text =
    `${ANIM.CARD} <b>Melbet Top-Up | Step 1 of 2</b>
────────────
សូមផ្ញើលេខ ${ANIM.MELBET} <b>ID Melbet</b> របស់អ្នក:`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'បោះបង់',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.CANCEL,
          style: 'danger'
        }
      ]
    ]
  };

  await ctx.answerCbQuery().catch(() => { });
  return showScreen(ctx, { text, reply_markup });
});

// Step 2: Choose Currency (USD or Riel)
function showCurrencySelectScreen(ctx, oneXBetId) {
  const userId = ctx.from.id;
  userStates.set(userId, { state: 'TOPUP_SELECT_CURRENCY', oneXBetId });

  const text =
    `${ANIM.CARD} <b>Melbet Top-Up | Step 2 of 3 (ជ្រើសរើសរូបិយប័ណ្ណ)</b>
────────────
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.REFRESH} <b>អត្រាប្តូរប្រាក់:</b> <code>$1.00 = ${EXCHANGE_RATE.toLocaleString()} ៛ (KHR)</code>
────────────
${ANIM.DOWN} <b>សូមជ្រើសរើសរូបិយប័ណ្ណដែលអ្នកចង់បញ្ចូល (USD ឬ Riel)៖</b>`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'ប្រាក់ដុល្លារ (USD)',
          callback_data: `sel_curr_USD_${oneXBetId}`,
          icon_custom_emoji_id: BTN_ICONS.MONEY,
          style: 'primary'
        }
      ],
      [
        {
          text: 'ប្រាក់រៀល (Riel)',
          callback_data: `sel_curr_KHR_${oneXBetId}`,
          icon_custom_emoji_id: BTN_ICONS.DIAMOND,
          style: 'success'
        }
      ],
      [
        {
          text: 'បោះបង់',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.CANCEL,
          style: 'danger'
        }
      ]
    ]
  };

  return showScreen(ctx, { text, reply_markup });
}

// Step 3 (USD): Select USD Amount
function showUsdAmountScreen(ctx, oneXBetId) {
  const userId = ctx.from.id;
  userStates.set(userId, { state: 'TOPUP_SELECT_AMOUNT_USD', oneXBetId });
  const user = getUser(userId, ctx.from.first_name);

  const text =
    `${ANIM.CARD} <b>Melbet Top-Up | Step 3 of 3 (បញ្ចូលប្រាក់ជា USD)</b>
────────────
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.MONEY} <b>រូបិយប័ណ្ណ:</b> <code>USD ($)</code>
${ANIM.MONEY} <b>សមតុល្យបច្ចុប្បន្ន:</b> <code>$${user.balance.toFixed(2)} USD</code>
────────────
${ANIM.DOWN} <b>សូមជ្រើសរើសចំនួនទឹកប្រាក់ USD៖</b>`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '$1.00', callback_data: `gen_qr_1_USD_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' },
        { text: '$2.00', callback_data: `gen_qr_2_USD_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' },
        { text: '$5.00', callback_data: `gen_qr_5_USD_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' }
      ],
      [
        { text: '$10.00', callback_data: `gen_qr_10_USD_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' },
        { text: '$20.00', callback_data: `gen_qr_20_USD_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' },
        { text: '$50.00', callback_data: `gen_qr_50_USD_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' }
      ],
      [
        {
          text: 'បញ្ចូលចំនួនផ្ទាល់ខ្លួន (Custom USD)',
          callback_data: `topup_custom_USD_${oneXBetId}`,
          icon_custom_emoji_id: BTN_ICONS.EDIT,
          style: 'success'
        }
      ],
      [
        {
          text: 'ត្រឡប់ក្រោយ',
          callback_data: `back_to_curr_${oneXBetId}`,
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'primary'
        },
        {
          text: 'បោះបង់',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.CANCEL,
          style: 'danger'
        }
      ]
    ]
  };

  return showScreen(ctx, { text, reply_markup });
}

// Step 3 (Riel): Select Riel Amount
function showRielAmountScreen(ctx, oneXBetId) {
  const userId = ctx.from.id;
  userStates.set(userId, { state: 'TOPUP_SELECT_AMOUNT_KHR', oneXBetId });
  const user = getUser(userId, ctx.from.first_name);

  const text =
    `${ANIM.CARD} <b>Melbet Top-Up | Step 3 of 3 (បញ្ចូលប្រាក់ជារៀល)</b>
────────────
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.MONEY} <b>រូបិយប័ណ្ណ:</b> <code>KHR (៛ Riel)</code>
${ANIM.REFRESH} <b>អត្រាប្តូរប្រាក់:</b> <code>$1.00 = ${EXCHANGE_RATE.toLocaleString()} ៛</code>
────────────
${ANIM.DOWN} <b>សូមជ្រើសរើសចំនួនទឹកប្រាក់រៀល (ចាប់ពី 1,500 ៛ ឡើងទៅ)៖</b>`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '1,500 ៛', callback_data: `gen_qr_1500_KHR_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' },
        { text: '4,000 ៛', callback_data: `gen_qr_4000_KHR_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' },
        { text: '10,000 ៛', callback_data: `gen_qr_10000_KHR_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' }
      ],
      [
        { text: '20,000 ៛', callback_data: `gen_qr_20000_KHR_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' },
        { text: '50,000 ៛', callback_data: `gen_qr_50000_KHR_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' },
        { text: '100,000 ៛', callback_data: `gen_qr_100000_KHR_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.MONEY, style: 'primary' }
      ],
      [
        {
          text: 'បញ្ចូលចំនួនផ្ទាល់ខ្លួន (Custom Riel)',
          callback_data: `topup_custom_KHR_${oneXBetId}`,
          icon_custom_emoji_id: BTN_ICONS.EDIT,
          style: 'success'
        }
      ],
      [
        {
          text: 'ត្រឡប់ក្រោយ',
          callback_data: `back_to_curr_${oneXBetId}`,
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'primary'
        },
        {
          text: 'បោះបង់',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.CANCEL,
          style: 'danger'
        }
      ]
    ]
  };

  return showScreen(ctx, { text, reply_markup });
}

// Custom USD Amount Prompt
bot.action(/topup_custom_USD_(.+)/, async (ctx) => {
  const oneXBetId = ctx.match[1];
  const userId = ctx.from.id;
  userStates.set(userId, { state: 'AWAITING_CUSTOM_AMOUNT_USD', oneXBetId });

  const text =
    `${ANIM.CARD} <b>Melbet Top-Up | បញ្ចូលប្រាក់ផ្ទាល់ខ្លួនជា USD</b>
────────────
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.SPARKLES} <i>សូមវាយបញ្ចូលចំនួនទឹកប្រាក់ជា USD នៅក្នុងប្រអប់សារ៖</i>

${ANIM.BULB} <b>ឧទាហរណ៍:</b> <code>0.30</code>, <code>1</code>, <code>5</code>, <code>25</code>
<i>(សូមបញ្ចូលចាប់ពី $0.30 ឡើងទៅ | Min: $0.30 up - Max: $500.00)</i>
────────────`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'ត្រឡប់ក្រោយ',
          callback_data: `sel_curr_USD_${oneXBetId}`,
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'primary'
        },
        {
          text: 'បោះបង់',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.CANCEL,
          style: 'danger'
        }
      ]
    ]
  };

  await ctx.answerCbQuery().catch(() => { });
  return showScreen(ctx, { text, reply_markup });
});

// Custom Riel Amount Prompt
bot.action(/topup_custom_KHR_(.+)/, async (ctx) => {
  const oneXBetId = ctx.match[1];
  const userId = ctx.from.id;
  userStates.set(userId, { state: 'AWAITING_CUSTOM_AMOUNT_KHR', oneXBetId });

  const text =
    `${ANIM.CARD} <b>Melbet Top-Up | បញ្ចូលប្រាក់ផ្ទាល់ខ្លួនជារៀល</b>
────────────
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.REFRESH} <b>អត្រាប្តូរប្រាក់:</b> <code>$1.00 = ${EXCHANGE_RATE.toLocaleString()} ៛</code>
${ANIM.SPARKLES} <i>សូមវាយបញ្ចូលចំនួនទឹកប្រាក់ជារៀលនៅក្នុងប្រអប់សារ៖</i>

${ANIM.BULB} <b>ឧទាហរណ៍:</b> <code>1500</code>, <code>4000</code>, <code>10000</code>, <code>20000</code>
<i>(សូមបញ្ចូលចាប់ពី 1,500 ៛ ឡើងទៅ | Min: 1,500 ៛ - Max: 2,050,000 ៛)</i>
────────────`;

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: 'ត្រឡប់ក្រោយ',
          callback_data: `sel_curr_KHR_${oneXBetId}`,
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'primary'
        },
        {
          text: 'បោះបង់',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.CANCEL,
          style: 'danger'
        }
      ]
    ]
  };

  await ctx.answerCbQuery().catch(() => { });
  return showScreen(ctx, { text, reply_markup });
});

// Helper: Generate KHQR Card, Auto-Check & Notify Admin Group
async function initiateKhqrPayment(ctx, usdAmount, oneXBetId = 'N/A', currency = 'USD', explicitAmount = null) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : 'គ្មាន';

  const isKHR = String(currency).toUpperCase() === 'KHR';
  const effectiveCurrency = isKHR ? 'KHR' : 'USD';

  let chargeAmount;
  let finalUsdAmount;

  if (isKHR) {
    if (explicitAmount !== null && explicitAmount !== undefined && !isNaN(Number(explicitAmount))) {
      chargeAmount = Math.max(1500, Math.round(Number(explicitAmount)));
    } else {
      chargeAmount = Math.max(1500, Math.round(usdAmount * EXCHANGE_RATE));
    }
    finalUsdAmount = parseFloat((chargeAmount / EXCHANGE_RATE).toFixed(2));
  } else {
    if (explicitAmount !== null && explicitAmount !== undefined && !isNaN(Number(explicitAmount))) {
      chargeAmount = parseFloat(Number(explicitAmount).toFixed(2));
    } else {
      chargeAmount = parseFloat(Number(usdAmount).toFixed(2));
    }
    finalUsdAmount = chargeAmount;
  }

  // 1. Show animated loading state
  const loadingText = isKHR
    ? `${ANIM.REFRESH} <b>កំពុងដំណើរការបង្កើតកាត KHQR ចំនួន ${chargeAmount.toLocaleString()} ៛ KHR...</b>\n<i>${ANIM.HOURGLASS} សូមរង់ចាំមួយភ្លែត...</i>`
    : `${ANIM.REFRESH} <b>កំពុងដំណើរការបង្កើតកាត KHQR ចំនួន $${finalUsdAmount.toFixed(2)} USD...</b>\n<i>${ANIM.HOURGLASS} សូមរង់ចាំមួយភ្លែត...</i>`;

  await showScreen(ctx, {
    text: loadingText,
    reply_markup: { inline_keyboard: [] }
  });

  try {
    const data = await generateKHQR(chargeAmount, effectiveCurrency);

    if (!data.success || !data.qrString) {
      throw new Error(data.error || 'Failed to generate KHQR');
    }

    const tranId = data.tranId;
    const expiresAt = Date.now() + 60 * 1000; // 60 seconds (1 minute expiry)

    // 2. Render authentic NBC Bakong KHQR Card (showing selected currency ONLY)
    const cardBuffer = await createKhqrCard({
      merchantName: STORE_NAME,
      amount: data.amountFormatted || (isKHR ? chargeAmount.toString() : finalUsdAmount.toFixed(2)),
      currency: effectiveCurrency,
      qrString: data.qrString
    });

    const amountCaption = isKHR
      ? `<code>${Number(data.amountFormatted || chargeAmount).toLocaleString()} ៛ KHR</code>`
      : `<code>$${data.amountFormatted || finalUsdAmount.toFixed(2)} USD</code>`;

    const caption =
      `${ANIM.MONEY} <b>វិក្កយបត្របង់ប្រាក់ KHQR (${isKHR ? 'KHR' : 'USD'})</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.DIAMOND} <b>ហាង:</b> <code>${STORE_NAME}</code>
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> ${amountCaption}
${ANIM.ID} <b>លេខវិក្កយបត្រ:</b> <code>${tranId}</code>
${ANIM.HOURGLASS} <b>សុពលភាព:</b> <code>1 នាទី (60 វិនាទី)</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.PHONE} <i>ស្កេនជាមួយ Bakong App, ABA Mobile ឬគ្រប់ធនាគារទាំងអស់!</i>
${ANIM.REFRESH} <i>ប្រព័ន្ធកំពុងត្រួតពិនិត្យការទូទាត់ដោយស្វ័យប្រវត្តិ (Auto-Checking 24/7)...</i>`;

    const swapTarget = isKHR ? 'USD' : 'KHR';
    const swapLabel = isKHR
      ? `ប្តូរទៅជា USD ($${finalUsdAmount.toFixed(2)} USD)`
      : `ប្តូរទៅជា KH (${(Math.max(1500, Math.round(finalUsdAmount * EXCHANGE_RATE))).toLocaleString()} ៛ KHR)`;

    const reply_markup = {
      inline_keyboard: [
        [
          {
            text: swapLabel,
            callback_data: `swap_pay_${tranId}_${swapTarget}`,
            icon_custom_emoji_id: BTN_ICONS.REFRESH,
            style: 'primary'
          }
        ],
        [
          {
            text: 'បោះបង់ (Cancel)',
            callback_data: `cancel_pay_${tranId}`,
            icon_custom_emoji_id: BTN_ICONS.CANCEL,
            style: 'danger'
          }
        ]
      ]
    };

    // Send the high-resolution styled KHQR Card image
    const sentMsg = await showScreen(ctx, {
      text: caption,
      photo: { source: cardBuffer },
      reply_markup
    });

    // 3. Auto-Check Background Poller (Runs every 2.5 seconds)
    const pollInterval = setInterval(async () => {
      const tx = pendingTxs.get(tranId);
      if (!tx) {
        clearInterval(pollInterval);
        return;
      }

      // Re-entrancy guard: the bank API call is async and can take longer than
      // the 2.5s interval, so several ticks could overlap and each fire the
      // success block -> duplicate admin notifications. Skip if a check is
      // already in flight, or if this payment was already handled.
      if (tx._checking || tx._handled) return;
      tx._checking = true;

      try {
        const result = await checkPaymentStatus(tx.tranId, tx.md5);

        if (result.status === 'PAID' || result.paid === true || result.status === 'SUCCESS') {
          if (tx._handled) return;       // another tick already processed it
          tx._handled = true;            // set synchronously -> runs exactly once
          clearInterval(pollInterval);
          clearTimeout(tx.timerId);
          pendingTxs.delete(tranId);

          const user = getUser(tx.userId);
          user.balance += tx.usdAmount;
          user.orders.push({
            item: `Melbet Top-Up (ID: ${tx.oneXBetId}) ($${tx.usdAmount.toFixed(2)} USD / ${tx.currency === 'KHR' ? `${tx.chargeAmount.toLocaleString()} ៛` : `${Math.round(tx.usdAmount * EXCHANGE_RATE).toLocaleString()} ៛`})`,
            price: tx.usdAmount,
            date: new Date().toLocaleDateString('km-KH')
          });
          saveUsersToDisk(); // persist the credited balance

          // Save request for Admin to Add Funds
          topupRequests.set(tranId, {
            tranId,
            userId: tx.userId,
            chatId: tx.chatId,
            name: user.name,
            username: tx.username,
            oneXBetId: tx.oneXBetId,
            amount: tx.usdAmount,
            currency: tx.currency,
            chargeAmount: tx.chargeAmount,
            date: new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })
          });

          // Persist to top-up history (status: paid = awaiting admin decision)
          store.addTopup({
            id: tranId,
            userId: tx.userId,
            chatId: tx.chatId,
            name: user.name,
            username: tx.username,
            oneXBetId: tx.oneXBetId,
            amountUsd: tx.usdAmount,
            currency: tx.currency,
            chargeAmount: tx.chargeAmount,
            method: 'KHQR (Bakong)',
            reference: tranId,
            status: 'paid'
          });

          const paidAmtDesc = tx.currency === 'KHR'
            ? `+${tx.chargeAmount.toLocaleString()} ៛ KHR (+$${tx.usdAmount.toFixed(2)} USD)`
            : `+$${tx.usdAmount.toFixed(2)} USD`;

          const successCaption =
            `${ANIM.PARTY} <b>ការទូទាត់ប្រាក់ជោគជ័យ (PAID SUCCESSFUL)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.MELBET} <b>ID Melbet:</b> <code>${tx.oneXBetId}</code>
${ANIM.CHECK} <b>ទឹកប្រាក់បានបង់:</b> <code>${paidAmtDesc}</code>
${ANIM.MONEY} <b>សមតុល្យបច្ចុប្បន្ន:</b> <code>$${user.balance.toFixed(2)} USD</code>
${ANIM.ID} <b>លេខវិក្កយបត្រ:</b> <code>${tx.tranId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.HOURGLASS} <i>សូមរង់ចាំបន្តិច Admin កំពុងបញ្ចូលទឹកប្រាក់ (Add Funds) ទៅកាន់គណនី Melbet របស់អ្នក...</i>`;

          const successMarkup = {
            inline_keyboard: [
              [
                {
                  text: 'ទៅកាន់ Menu ចម្បង',
                  callback_data: 'back_main',
                  icon_custom_emoji_id: BTN_ICONS.DIAMOND,
                  style: 'primary'
                }
              ]
            ]
          };

          // Remove the QR code photo completely so users cannot re-scan, and show clean success screen
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id).catch(() => { });
          const sentSuccess = await ctx.telegram.sendMessage(chatId, successCaption, {
            parse_mode: 'HTML',
            reply_markup: successMarkup
          }).catch(() => { });

          if (sentSuccess?.message_id) {
            userActiveMsgs.set(chatId, sentSuccess.message_id);
          }

          // Send notification to Admin Top-Up Group
          const adminTopupText =
            `${ANIM.SIREN} <b>សំណើបញ្ចូលប្រាក់ថ្មី (NEW MELBET TOP-UP)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.USER} <b>អតិថិជន:</b> <a href="tg://user?id=${tx.userId}">${user.name}</a> (${tx.username})
${ANIM.ID} <b>Telegram ID:</b> <code>${tx.userId}</code>
${ANIM.MELBET} <b>ID Melbet:</b> <code>${tx.oneXBetId}</code>
${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> <code>+$${tx.usdAmount.toFixed(2)} USD</code> ${tx.currency === 'KHR' ? `(<code>${tx.chargeAmount.toLocaleString()} ៛ KHR</code>)` : ''}
${ANIM.RECEIPT} <b>លេខវិក្កយបត្រ:</b> <code>${tx.tranId}</code>
${ANIM.CALENDAR} <b>កាលបរិច្ឆេទ:</b> <code>${new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.PIN} <i>សូម Admin បញ្ចូលប្រាក់ទៅកាន់ ID Melbet ខាងលើ រួចចុចប៊ូតុងខាងក្រោម៖</i>`;

          const adminTopupMarkup = {
            inline_keyboard: [
              [
                {
                  text: 'បញ្ចូលជោគជ័យ (Done)',
                  callback_data: `adm_td_${tx.tranId}`,
                  icon_custom_emoji_id: BTN_ICONS.SUCCESS,
                  style: 'success'
                },
                {
                  text: 'បដិសេធ (Cancel)',
                  callback_data: `adm_tc_${tx.tranId}`,
                  icon_custom_emoji_id: BTN_ICONS.CANCEL,
                  style: 'danger'
                }
              ]
            ]
          };

          if (ADMIN_TOPUP_GROUP_ID) {
            try {
              await ctx.telegram.sendMessage(ADMIN_TOPUP_GROUP_ID, adminTopupText, {
                parse_mode: 'HTML',
                reply_markup: adminTopupMarkup
              });
            } catch (err) {
              console.error(`❌ Failed to send top-up to admin group (${ADMIN_TOPUP_GROUP_ID}):`, err.message);
              console.log(`💡 Make sure @Melbetpay8bet_bot is added into Telegram Group (${ADMIN_TOPUP_GROUP_ID}) as an Administrator!`);
            }
          }
        }
      } catch (e) {
        // Ignore background polling glitches
      } finally {
        if (tx) tx._checking = false; // release in-flight lock for the next tick
      }
    }, 2500);

    // 4. Set 1-Minute Live Expiry Timer
    const timerId = setTimeout(async () => {
      const tx = pendingTxs.get(tranId);
      if (!tx) return;

      clearInterval(tx.pollInterval);
      pendingTxs.delete(tranId);

      const expiredAmt = tx.currency === 'KHR'
        ? `${tx.chargeAmount.toLocaleString()} ៛ KHR (≈ $${tx.usdAmount.toFixed(2)} USD)`
        : `$${tx.usdAmount.toFixed(2)} USD`;

      const expiredCaption =
        `${ANIM.WARN} <b>វិក្កយបត្រនេះបានផុតកំណត់ហើយ (EXPIRED)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.LOCK} <i>កូដ KHQR នេះមានសុពលភាពត្រឹមតែ 1 នាទីប៉ុណ្ណោះ។</i>
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> <code>${expiredAmt}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>សូមបង្កើតវិក្កយបត្រថ្មីដើម្បីបន្តការទូទាត់!</i>`;

      const expiredMarkup = {
        inline_keyboard: [
          [
            {
              text: 'បង្កើតថ្មី (Generate New)',
              callback_data: 'menu_topup',
              icon_custom_emoji_id: BTN_ICONS.REFRESH,
              style: 'success'
            }
          ],
          [
            {
              text: 'ទៅកាន់ Menu ចម្បង',
              callback_data: 'back_main',
              icon_custom_emoji_id: BTN_ICONS.BACK,
              style: 'primary'
            }
          ]
        ]
      };

      try {
        await ctx.telegram.deleteMessage(chatId, sentMsg.message_id).catch(() => { });
        const sentExpired = await ctx.telegram.sendMessage(chatId, expiredCaption, {
          parse_mode: 'HTML',
          reply_markup: expiredMarkup
        });
        if (sentExpired?.message_id) {
          userActiveMsgs.set(chatId, sentExpired.message_id);
        }
      } catch (e) { }
    }, 60 * 1000);

    // Save pending transaction with timer, pollInterval and currency details
    pendingTxs.set(tranId, {
      userId,
      chatId,
      usdAmount: finalUsdAmount,
      currency: effectiveCurrency,
      chargeAmount,
      oneXBetId,
      username,
      md5: data.md5,
      tranId,
      msgId: sentMsg.message_id,
      timerId,
      pollInterval,
      expiresAt
    });

  } catch (err) {
    console.error("Error creating KHQR:", err);
    await showScreen(ctx, {
      text: `${ANIM.WARN} <b>មានបញ្ហាក្នុងការបង្កើតកូដ KHQR:</b> <code>${err.message}</code>\nសូមទាក់ទង Admin: ${SUPPORT_LINK}`,
      reply_markup: {
        inline_keyboard: [[{ text: 'ត្រឡប់ក្រោយ (Back)', callback_data: 'menu_topup', icon_custom_emoji_id: BTN_ICONS.BACK, style: 'danger' }]]
      }
    });
  }
}

// User chose currency (USD or Riel) from Currency Choice Screen
bot.action(/sel_curr_(USD|KHR)_(.+)/, async (ctx) => {
  const currency = ctx.match[1];
  const oneXBetId = ctx.match[2];
  await ctx.answerCbQuery().catch(() => { });
  if (currency === 'USD') {
    return showUsdAmountScreen(ctx, oneXBetId);
  } else {
    return showRielAmountScreen(ctx, oneXBetId);
  }
});

// Back from Amount Selection to Currency Choice Screen
bot.action(/back_to_curr_(.+)/, async (ctx) => {
  const oneXBetId = ctx.match[1];
  await ctx.answerCbQuery().catch(() => { });
  return showCurrencySelectScreen(ctx, oneXBetId);
});

// User clicked amount -> immediately generate QR in that currency
bot.action(/gen_qr_([0-9.]+)_([A-Z]+)_(.+)/, async (ctx) => {
  const rawAmount = parseFloat(ctx.match[1]);
  const currency = ctx.match[2];
  const oneXBetId = ctx.match[3];
  await ctx.answerCbQuery().catch(() => { });

  if (currency === 'USD') {
    return initiateKhqrPayment(ctx, rawAmount, oneXBetId, 'USD', rawAmount);
  } else {
    const khrAmount = Math.max(1500, Math.round(rawAmount));
    const usdEquiv = parseFloat((khrAmount / EXCHANGE_RATE).toFixed(2));
    return initiateKhqrPayment(ctx, usdEquiv, oneXBetId, 'KHR', khrAmount);
  }
});

// Swap Payment Currency (USD <-> KHR)
bot.action(/swap_pay_([^_]+)_(USD|KHR)/, async (ctx) => {
  const oldTranId = ctx.match[1];
  const targetCurrency = ctx.match[2];
  const tx = pendingTxs.get(oldTranId);

  if (!tx) {
    await ctx.answerCbQuery('⚠️ វិក្កយបត្រនេះបានផុតកំណត់ ឬមិនត្រឹមត្រូវទេ!', { show_alert: true }).catch(() => { });
    return;
  }

  // Clear previous polling interval and expiry timer
  if (tx.pollInterval) clearInterval(tx.pollInterval);
  if (tx.timerId) clearTimeout(tx.timerId);
  pendingTxs.delete(oldTranId);

  await ctx.answerCbQuery(`កំពុងប្តូរទៅជា ${targetCurrency === 'KHR' ? 'ប្រាក់រៀល (KHR)' : 'ប្រាក់ដុល្លារ (USD)'}...`).catch(() => { });

  // Re-generate KHQR in requested target currency
  let nextChargeAmount = null;
  if (targetCurrency === 'KHR') {
    nextChargeAmount = Math.max(1500, Math.round(tx.usdAmount * EXCHANGE_RATE));
  } else {
    nextChargeAmount = tx.usdAmount;
  }
  await initiateKhqrPayment(ctx, tx.usdAmount, tx.oneXBetId, targetCurrency, nextChargeAmount);
});

// Check Live Payment Callback
bot.action(/verify_pay_(.+)/, async (ctx) => {
  const tranId = ctx.match[1];
  const tx = pendingTxs.get(tranId);

  if (!tx) {
    await ctx.answerCbQuery('⚠️ វិក្កយបត្រនេះបានផុតកំណត់ ឬមិនត្រឹមត្រូវទេ!', { show_alert: true }).catch(() => { });
    return;
  }

  await ctx.answerCbQuery('🔄 កំពុងត្រួតពិនិត្យប្រព័ន្ធធនាគារ...').catch(() => { });

  try {
    const result = await checkPaymentStatus(tx.tranId, tx.md5);

    if (result.status === 'PAID' || result.paid === true || result.status === 'SUCCESS') {
      if (tx.pollInterval) clearInterval(tx.pollInterval);
      clearTimeout(tx.timerId);
      pendingTxs.delete(tranId);

      const creditedAmount = tx.usdAmount !== undefined ? tx.usdAmount : tx.amount;
      const user = getUser(tx.userId, ctx.from.first_name);
      user.balance += creditedAmount;
      user.orders.push({
        item: `បញ្ចូលលុយ KHQR ($${creditedAmount.toFixed(2)})`,
        price: creditedAmount,
        date: new Date().toLocaleDateString('km-KH')
      });
      saveUsersToDisk(); // persist the credited balance
      // Record this direct-credit top-up in history (credited immediately)
      store.addTopup({
        id: tx.tranId,
        userId: tx.userId,
        chatId: tx.chatId,
        name: user.name,
        username: tx.username,
        oneXBetId: tx.oneXBetId,
        amountUsd: creditedAmount,
        currency: tx.currency,
        chargeAmount: tx.chargeAmount,
        method: 'KHQR (Bakong)',
        reference: tx.tranId,
        status: 'approved',
        decidedBy: 'Auto (verified payment)',
        decidedAt: new Date().toISOString()
      });

      const paidAmtText = tx.currency === 'KHR'
        ? `+${tx.chargeAmount.toLocaleString()} ៛ KHR (+$${creditedAmount.toFixed(2)} USD)`
        : `+$${creditedAmount.toFixed(2)} USD`;

      const successCaption =
        `${ANIM.PARTY} <b>ការទូទាត់ប្រាក់ជោគជ័យ (PAID SUCCESSFUL)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.CHECK} <b>ទឹកប្រាក់បានបញ្ចូល:</b> <code>${paidAmtText}</code>
${ANIM.MONEY} <b>សមតុល្យបច្ចុប្បន្ន:</b> <code>$${user.balance.toFixed(2)} USD</code>
${ANIM.ID} <b>លេខវិក្កយបត្រ:</b> <code>${tx.tranId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.SPARKLES} <i>ទឹកប្រាក់ត្រូវបានបញ្ចូលទៅក្នុងគណនីរបស់អ្នករួចរាល់ហើយ!</i>`;

      const reply_markup = {
        inline_keyboard: [
          [
            {
              text: 'ទៅកាន់ Menu ចម្បង',
              callback_data: 'back_main',
              icon_custom_emoji_id: BTN_ICONS.DIAMOND,
              style: 'primary'
            }
          ]
        ]
      };

      try {
        await ctx.telegram.deleteMessage(tx.chatId, tx.msgId).catch(() => { });
        const sentSuccess = await ctx.telegram.sendMessage(tx.chatId, successCaption, {
          parse_mode: 'HTML',
          reply_markup
        });
        if (sentSuccess?.message_id) {
          userActiveMsgs.set(tx.chatId, sentSuccess.message_id);
        }
      } catch (e) { }

    } else {
      const remainingSec = Math.max(0, Math.round((tx.expiresAt - Date.now()) / 1000));
      await ctx.answerCbQuery(
        `⏳ មិនទាន់ទទួលបានការទូទាត់ទេ!\n(នៅសល់ពេល: ${remainingSec} វិនាទី)\n\nសូមស្កេនទូទាត់តាម Banking App រួចចុចពិនិត្យម្តងទៀត។`,
        { show_alert: true }
      ).catch(() => { });
    }
  } catch (err) {
    console.error("Error checking payment:", err);
    await ctx.answerCbQuery(`⚠️ បរាជ័យក្នុងការត្រួតពិនិត្យ: ${err.message}`, { show_alert: true }).catch(() => { });
  }
});

// Cancel Payment
bot.action(/cancel_pay_(.+)/, async (ctx) => {
  const tranId = ctx.match[1];
  const tx = pendingTxs.get(tranId);
  if (tx) {
    if (tx.pollInterval) clearInterval(tx.pollInterval);
    clearTimeout(tx.timerId);
    pendingTxs.delete(tranId);
  }
  await ctx.answerCbQuery('បានបោះបង់វិក្កយបត្រនេះរួចរាល់!').catch(() => { });
  const user = getUser(ctx.from.id, ctx.from.first_name);
  const { text, reply_markup, video } = getMainMenu(user);
  return showScreen(ctx, { text, reply_markup, video });
});

// ---------------- ADMIN ACTION HANDLERS (TOP-UP & WITHDRAWAL) ----------------

// 1. Admin Top-Up: DONE
bot.action(/adm_td_(.+)/, async (ctx) => {
  const tranId = ctx.match[1];
  let req = topupRequests.get(tranId);
  if (!req) {
    // Fallback to persistent store (survives Render restarts / spin-downs)
    const _t = store.findTopup(tranId);
    if (_t && _t.status === 'paid') {
      req = { userId: _t.userId, chatId: _t.chatId, name: _t.name, username: _t.username, oneXBetId: _t.oneXBetId, amount: Number(_t.amountUsd) || 0 };
    }
  }
  const adminName = ctx.from.first_name || 'Admin';

  if (!req) {
    await ctx.answerCbQuery('⚠️ សំណើនេះត្រូវបានដំណើរការរួចហើយ ឬរកមិនឃើញទេ!', { show_alert: true }).catch(() => { });
    return;
  }

  await ctx.answerCbQuery('✅ បានកត់ត្រាការបញ្ចូលប្រាក់ជោគជ័យ!').catch(() => { });

  // Update persistent top-up history -> approved
  store.updateTopup(tranId, {
    status: 'approved',
    decidedBy: adminName,
    decidedById: ctx.from.id,
    decidedAt: new Date().toISOString()
  });

  // Edit Admin message
  const adminText =
    `${ANIM.SUCCESS} <b>បានបញ្ចូលទឹកប្រាក់ជោគជ័យ (TOPUP COMPLETED)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.USER} <b>អតិថិជន:</b> <a href="tg://user?id=${req.userId}">${req.name}</a> (${req.username})
${ANIM.ID} <b>Telegram ID:</b> <code>${req.userId}</code>
${ANIM.MELBET} <b>ID Melbet:</b> <code>${req.oneXBetId}</code>
${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> <code>+$${req.amount.toFixed(2)} USD</code>
${ANIM.RECEIPT} <b>លេខវិក្កយបត្រ:</b> <code>${tranId}</code>
${ANIM.OFFICER} <b>បញ្ចូលដោយ Admin:</b> ${adminName}
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}</i>`;

  await ctx.editMessageText(adminText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }).catch(() => { });

  // Send direct notification to User
  const userText =
    `${ANIM.PARTY} <b>ការបញ្ចូលទឹកប្រាក់ទទួលបានជោគជ័យ (TOPUP SUCCESSFUL)!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.MELBET} <b>ID Melbet:</b> <code>${req.oneXBetId}</code>
${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> <code>+$${req.amount.toFixed(2)} USD</code>
${ANIM.RECEIPT} <b>លេខវិក្កយបត្រ:</b> <code>${tranId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.SUCCESS} <i>Admin បានបញ្ចូលទឹកប្រាក់ (Add Funds) ទៅក្នុងគណនី Melbet របស់អ្នករួចរាល់ហើយ! សូមពិនិត្យមើលក្នុងគណនី Melbet របស់អ្នក។ អរគុណសម្រាប់ការប្រើប្រាស់សេវាកម្ម!</i>`;

  const userMarkup = {
    inline_keyboard: [
      [
        {
          text: 'ទៅកាន់ Menu ចម្បង',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.DIAMOND,
          style: 'primary'
        }
      ]
    ]
  };

  try {
    await ctx.telegram.sendMessage(req.chatId, userText, {
      parse_mode: 'HTML',
      reply_markup: userMarkup
    });
  } catch (e) { }

  topupRequests.delete(tranId);
});

// 2. Admin Top-Up: CANCEL
bot.action(/adm_tc_(.+)/, async (ctx) => {
  const tranId = ctx.match[1];
  let req = topupRequests.get(tranId);
  if (!req) {
    // Fallback to persistent store (survives Render restarts / spin-downs)
    const _t = store.findTopup(tranId);
    if (_t && _t.status === 'paid') {
      req = { userId: _t.userId, chatId: _t.chatId, name: _t.name, username: _t.username, oneXBetId: _t.oneXBetId, amount: Number(_t.amountUsd) || 0 };
    }
  }
  const adminName = ctx.from.first_name || 'Admin';

  if (!req) {
    await ctx.answerCbQuery('⚠️ សំណើនេះត្រូវបានដំណើរការរួចហើយ ឬរកមិនឃើញទេ!', { show_alert: true }).catch(() => { });
    return;
  }

  await ctx.answerCbQuery('❌ បានបដិសេធសំណើ!').catch(() => { });

  // Update persistent top-up history -> rejected
  store.updateTopup(tranId, {
    status: 'rejected',
    decidedBy: adminName,
    decidedById: ctx.from.id,
    decidedAt: new Date().toISOString(),
    rejectReason: 'Rejected by admin (Melbet ID not found / invalid)'
  });

  // Edit Admin message
  const adminText =
    `${ANIM.CROSS} <b>សំណើបញ្ចូលប្រាក់ត្រូវបានបដិសេធ (TOPUP REJECTED)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.USER} <b>អតិថិជន:</b> <a href="tg://user?id=${req.userId}">${req.name}</a> (${req.username})
${ANIM.ID} <b>Telegram ID:</b> <code>${req.userId}</code>
${ANIM.MELBET} <b>ID Melbet:</b> <code>${req.oneXBetId}</code>
${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> <code>$${req.amount.toFixed(2)} USD</code>
${ANIM.RECEIPT} <b>លេខវិក្កយបត្រ:</b> <code>${tranId}</code>
${ANIM.OFFICER} <b>បដិសេធដោយ Admin:</b> ${adminName}
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}</i>`;

  await ctx.editMessageText(adminText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }).catch(() => { });

  // Send direct notification to User
  const userText =
    `${ANIM.WARN} <b>ការបញ្ចូលទឹកប្រាក់មិនជោគជ័យ (TOPUP FAILED)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.MELBET} <b>ID Melbet:</b> <code>${req.oneXBetId}</code>
${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> <code>$${req.amount.toFixed(2)} USD</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.CROSS} <i>ប្រព័ន្ធមិនអាចស្វែងរកលេខគណនី ID Melbet របស់អ្នកឃើញទេ! សូមពិនិត្យលេខសម្គាល់គណនីរបស់អ្នកឡើងវិញ ឬទាក់ទង Admin៖</i>
${ANIM.CHAT} Support: ${SUPPORT_USERNAME} (${SUPPORT_LINK})`;

  const userMarkup = {
    inline_keyboard: [
      [
        {
          text: 'ទាក់ទង Support',
          url: SUPPORT_LINK,
          icon_custom_emoji_id: BTN_ICONS.CHAT,
          style: 'success'
        },
        {
          text: 'ទៅកាន់ Menu ចម្បង',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'danger'
        }
      ]
    ]
  };

  try {
    await ctx.telegram.sendMessage(req.chatId, userText, {
      parse_mode: 'HTML',
      reply_markup: userMarkup
    });
  } catch (e) { }

  topupRequests.delete(tranId);
});

// 3. Admin Withdrawal: DONE
bot.action(/adm_wd_(.+)/, async (ctx) => {
  const withdrawId = ctx.match[1];
  let req = withdrawRequests.get(withdrawId);
  if (!req) {
    // Fallback to persistent store (survives Render restarts / spin-downs)
    const _w = store.findWithdrawal(withdrawId);
    if (_w && _w.status === 'pending') {
      req = { userId: _w.userId, chatId: _w.chatId, name: _w.name, username: _w.username, code: _w.code };
    }
  }
  const adminName = ctx.from.first_name || 'Admin';

  if (!req) {
    await ctx.answerCbQuery('⚠️ សំណើដកប្រាក់នេះត្រូវបានដំណើរការរួចហើយ ឬរកមិនឃើញទេ!', { show_alert: true }).catch(() => { });
    return;
  }

  await ctx.answerCbQuery('✅ បានកត់ត្រាការផ្ទេរប្រាក់ជោគជ័យ!').catch(() => { });

  // Update persistent withdrawal history -> completed
  store.updateWithdrawal(withdrawId, {
    status: 'completed',
    decidedBy: adminName,
    decidedById: ctx.from.id,
    decidedAt: new Date().toISOString()
  });

  // Edit Admin message caption
  const adminCaption =
    `${ANIM.SUCCESS} <b>បានផ្ទេរប្រាក់រួចរាល់ (WITHDRAWAL COMPLETED)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.USER} <b>អតិថិជន:</b> <a href="tg://user?id=${req.userId}">${req.name}</a> (${req.username})
${ANIM.ID} <b>Telegram ID:</b> <code>${req.userId}</code>
${ANIM.SHIELD} <b>Code:</b> <code>${req.code}</code>
${ANIM.RECEIPT} <b>Withdraw ID:</b> <code>${withdrawId}</code>
${ANIM.OFFICER} <b>ផ្ទេរដោយ Admin:</b> ${adminName}
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}</i>`;

  await ctx.editMessageCaption(adminCaption, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }).catch(() => { });

  // Send direct notification to User
  const userText =
    `${ANIM.PARTY} <b>ការដកប្រាក់ទទួលបានជោគជ័យ (WITHDRAWAL SUCCESSFUL)!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.SHIELD} <b>Code:</b> <code>${req.code}</code>
${ANIM.RECEIPT} <b>Withdraw ID:</b> <code>${withdrawId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.SUCCESS} <i>Admin បានផ្ទេរប្រាក់ចូលក្នុងគណនីធនាគាររបស់អ្នករួចរាល់ហើយ! សូមពិនិត្យមើលក្នុង Banking App របស់អ្នក។ អរគុណ!</i>`;

  const userMarkup = {
    inline_keyboard: [
      [
        {
          text: 'ទៅកាន់ Menu ចម្បង',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.DIAMOND,
          style: 'primary'
        }
      ]
    ]
  };

  try {
    await ctx.telegram.sendMessage(req.chatId, userText, {
      parse_mode: 'HTML',
      reply_markup: userMarkup
    });
  } catch (e) { }

  withdrawRequests.delete(withdrawId);
});

// 4. Admin Withdrawal: CANCEL
bot.action(/adm_wc_(.+)/, async (ctx) => {
  const withdrawId = ctx.match[1];
  let req = withdrawRequests.get(withdrawId);
  if (!req) {
    // Fallback to persistent store (survives Render restarts / spin-downs)
    const _w = store.findWithdrawal(withdrawId);
    if (_w && _w.status === 'pending') {
      req = { userId: _w.userId, chatId: _w.chatId, name: _w.name, username: _w.username, code: _w.code };
    }
  }
  const adminName = ctx.from.first_name || 'Admin';

  if (!req) {
    await ctx.answerCbQuery('⚠️ សំណើដកប្រាក់នេះត្រូវបានដំណើរការរួចហើយ ឬរកមិនឃើញទេ!', { show_alert: true }).catch(() => { });
    return;
  }

  await ctx.answerCbQuery('❌ បានបដិសេធសំណើដកប្រាក់!').catch(() => { });

  // Update persistent withdrawal history -> rejected
  store.updateWithdrawal(withdrawId, {
    status: 'rejected',
    decidedBy: adminName,
    decidedById: ctx.from.id,
    decidedAt: new Date().toISOString(),
    rejectReason: 'Rejected by admin (invalid/not found code)'
  });

  // Edit Admin message caption
  const adminCaption =
    `${ANIM.CROSS} <b>សំណើដកប្រាក់ត្រូវបានបដិសេធ (WITHDRAWAL REJECTED)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.USER} <b>អតិថិជន:</b> <a href="tg://user?id=${req.userId}">${req.name}</a> (${req.username})
${ANIM.ID} <b>Telegram ID:</b> <code>${req.userId}</code>
${ANIM.SHIELD} <b>Code:</b> <code>${req.code}</code>
${ANIM.RECEIPT} <b>Withdraw ID:</b> <code>${withdrawId}</code>
${ANIM.OFFICER} <b>បដិសេធដោយ Admin:</b> ${adminName}
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}</i>`;

  await ctx.editMessageCaption(adminCaption, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }).catch(() => { });

  // Send direct notification to User
  const userText =
    `${ANIM.WARN} <b>ការដកប្រាក់មិនជោគជ័យ (WITHDRAWAL FAILED)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.SHIELD} <b>Code:</b> <code>${req.code}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.CROSS} <i>លេខកូដមិនត្រឹមត្រូវ ឬរកមិនឃើញក្នុងប្រព័ន្ធ Melbet ទេ! សូមពិនិត្យលេខកូដ និងផ្ញើ QR Code ម្តងទៀត ឬទាក់ទងមកកាន់ Admin៖</i>
${ANIM.CHAT} Support: ${SUPPORT_USERNAME} (${SUPPORT_LINK})`;

  const userMarkup = {
    inline_keyboard: [
      [
        {
          text: 'ដកប្រាក់ម្តងទៀត',
          callback_data: 'menu_withdraw',
          icon_custom_emoji_id: BTN_ICONS.REFRESH,
          style: 'primary'
        },
        {
          text: 'ទាក់ទង Support',
          url: SUPPORT_LINK,
          icon_custom_emoji_id: BTN_ICONS.CHAT,
          style: 'success'
        }
      ],
      [
        {
          text: 'ទៅកាន់ Menu ចម្បង',
          callback_data: 'back_main',
          icon_custom_emoji_id: BTN_ICONS.BACK,
          style: 'danger'
        }
      ]
    ]
  };

  try {
    await ctx.telegram.sendMessage(req.chatId, userText, {
      parse_mode: 'HTML',
      reply_markup: userMarkup
    });
  } catch (e) { }

  withdrawRequests.delete(withdrawId);
});

// Order History
bot.action('menu_history', async (ctx) => {
  userStates.delete(ctx.from.id);
  const user = getUser(ctx.from.id, ctx.from.first_name);
  let historyText = `${ANIM.CHART} <b>ប្រវត្តិការទិញរបស់អ្នក (ORDER HISTORY)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (user.orders.length === 0) {
    historyText += `\n<i>${ANIM.WARN} អ្នកមិនទាន់មានប្រវត្តិទិញទំនិញនៅឡើយទេ!</i>\n`;
  } else {
    user.orders.forEach((o, idx) => {
      historyText += `\n#${idx + 1}. <b>${o.item}</b> - $${o.price} (${o.date})`;
    });
  }
  historyText += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━';

  const reply_markup = {
    inline_keyboard: [
      [
        { text: 'ដាក់ប្រាក់ (Topup)', callback_data: 'menu_topup', icon_custom_emoji_id: BTN_ICONS.DEPOSIT, style: 'success' },
        { text: 'ត្រឡប់ក្រោយ (Back)', callback_data: 'back_main', icon_custom_emoji_id: BTN_ICONS.BACK, style: 'primary' }
      ]
    ]
  };

  await ctx.answerCbQuery().catch(() => { });
  return showScreen(ctx, { text: historyText, reply_markup });
});

// Buying item handler
bot.action(/buy_item_(.+)/, async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  await ctx.answerCbQuery(
    `⚠️ សមតុល្យរបស់អ្នកមិនគ្រប់គ្រាន់ទេ ($${user.balance.toFixed(2)})!\nសូមបញ្ចូលលុយជាមុនសិន។`,
    { show_alert: true }
  ).catch(() => { });
});

// Back to Main Menu
bot.action('back_main', async (ctx) => {
  userStates.delete(ctx.from.id);
  const user = getUser(ctx.from.id, ctx.from.first_name);
  const { text, reply_markup, video } = getMainMenu(user);
  await ctx.answerCbQuery().catch(() => { });
  return showScreen(ctx, { text, reply_markup, video });
});

// ---------------- USER INPUT HANDLERS (TEXT & PHOTO) ----------------

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);

  // Delete user's incoming photo message to keep chat neat
  await ctx.deleteMessage().catch(() => { });

  if (userState?.state === 'AWAITING_WITHDRAW_QR') {
    const code = userState.withdrawCode || 'N/A';
    userStates.delete(userId);

    const withdrawId = 'WD' + Date.now().toString().slice(-6);
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const photoFileId = photo.file_id;
    const user = getUser(userId, ctx.from.first_name);
    const username = ctx.from.username ? `@${ctx.from.username}` : 'គ្មាន';

    // Store withdrawal request
    withdrawRequests.set(withdrawId, {
      withdrawId,
      userId,
      chatId: ctx.chat.id,
      name: user.name,
      username,
      code,
      photoFileId,
      date: new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })
    });

    // Persist to withdrawal history (status: pending = awaiting admin)
    store.addWithdrawal({
      id: withdrawId,
      userId,
      chatId: ctx.chat.id,
      name: user.name,
      username,
      code,
      photoFileId,
      method: 'Melbet Withdrawal Code',
      status: 'pending'
    });

    // 1. Tell user: please wait, admin is transferring money
    const userText =
      `${ANIM.HOURGLASS} <b>សំណើដកប្រាក់ត្រូវបានបញ្ជូនរួចរាល់!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.SHIELD} <b>Code:</b> <code>${code}</code>
${ANIM.RECEIPT} <b>Withdraw ID:</b> <code>${withdrawId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.HOURGLASS} <i>សូមរង់ចាំបន្តិច Admin កំពុងពិនិត្យ និងផ្ទេរប្រាក់ជូនអ្នក...</i>`;

    const userMarkup = {
      inline_keyboard: [
        [
          {
            text: 'ទៅកាន់ Menu ចម្បង',
            callback_data: 'back_main',
            icon_custom_emoji_id: BTN_ICONS.DIAMOND,
            style: 'primary'
          }
        ]
      ]
    };

    await showScreen(ctx, { text: userText, reply_markup: userMarkup });

    // 2. Send photo with details & action buttons to Admin Withdraw Group
    const adminCaption =
      `${ANIM.SIREN} <b>សំណើដកប្រាក់ថ្មី (NEW MELBET WITHDRAWAL)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.USER} <b>អតិថិជន:</b> <a href="tg://user?id=${userId}">${user.name}</a> (${username})
${ANIM.ID} <b>Telegram ID:</b> <code>${userId}</code>
${ANIM.SHIELD} <b>Code:</b> <code>${code}</code>
${ANIM.RECEIPT} <b>Withdraw ID:</b> <code>${withdrawId}</code>
${ANIM.CALENDAR} <b>កាលបរិច្ឆេទ:</b> <code>${new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ANIM.PIN} <i>សូម Admin ស្កេន QR ខាងលើ រួចចុចប៊ូតុងខាងក្រោម៖</i>`;

    const adminMarkup = {
      inline_keyboard: [
        [
          {
            text: 'ផ្ទេររួចរាល់ (Done)',
            callback_data: `adm_wd_${withdrawId}`,
            icon_custom_emoji_id: BTN_ICONS.SUCCESS,
            style: 'success'
          },
          {
            text: 'បដិសេធ (Cancel)',
            callback_data: `adm_wc_${withdrawId}`,
            icon_custom_emoji_id: BTN_ICONS.CANCEL,
            style: 'danger'
          }
        ]
      ]
    };

    if (ADMIN_WITHDRAW_GROUP_ID) {
      try {
        await ctx.telegram.sendPhoto(ADMIN_WITHDRAW_GROUP_ID, photoFileId, {
          caption: adminCaption,
          parse_mode: 'HTML',
          reply_markup: adminMarkup
        });
      } catch (err) {
        console.error(`❌ Failed to send withdraw request to admin group (${ADMIN_WITHDRAW_GROUP_ID}):`, err.message);
        console.log(`💡 Make sure @Melbetpay8bet_bot is added into Telegram Group (${ADMIN_WITHDRAW_GROUP_ID}) as an Administrator!`);
      }
    }
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);

  // Clean up user's typed message immediately so chat stays neat
  await ctx.deleteMessage().catch(() => { });

  // 1. Step 1 of Top-up: User enters Melbet ID -> Show Currency Selection (USD or Riel)
  if (userState?.state === 'AWAITING_MELBET_ID' || userState?.state === 'AWAITING_1XBET_ID') {
    const oneXBetId = ctx.message.text.trim();
    if (!oneXBetId) return;
    return showCurrencySelectScreen(ctx, oneXBetId);
  }

  // 2a. Custom USD Amount for Top-up -> Immediately generate USD QR
  if (userState?.state === 'AWAITING_CUSTOM_AMOUNT_USD') {
    const rawInput = ctx.message.text.trim().replace(/[^0-9.]/g, '');
    const usdAmount = Math.round(parseFloat(rawInput) * 100) / 100;
    const oneXBetId = userState?.oneXBetId || 'N/A';

    if (isNaN(usdAmount) || usdAmount < 0.30 || usdAmount > 500) {
      const errText =
        `${ANIM.WARN} <b>ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវទេ!</b>
────────────
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.CROSS} <i>សូមវាយបញ្ចូលចំនួនទឹកប្រាក់ចាប់ពី <b>$0.30 ឡើងទៅ</b> (Min: $0.30 - Max: $500.00)!</i>
${ANIM.BULB} <b>ឧទាហរណ៍:</b> <code>0.30</code>, <code>1</code>, <code>5</code>, <code>25</code>
────────────`;
      const reply_markup = {
        inline_keyboard: [
          [{ text: 'ត្រឡប់ក្រោយ', callback_data: `sel_curr_USD_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.BACK, style: 'primary' }],
          [{ text: 'បោះបង់', callback_data: 'back_main', icon_custom_emoji_id: BTN_ICONS.CANCEL, style: 'danger' }]
        ]
      };
      return showScreen(ctx, { text: errText, reply_markup });
    }

    userStates.delete(userId);
    return initiateKhqrPayment(ctx, usdAmount, oneXBetId, 'USD', usdAmount);
  }

  // 2b. Custom Riel Amount for Top-up -> Immediately generate Riel QR
  if (userState?.state === 'AWAITING_CUSTOM_AMOUNT_KHR') {
    const rawInput = ctx.message.text.trim().replace(/[^0-9.]/g, '');
    const khrAmount = Math.round(parseFloat(rawInput));
    const oneXBetId = userState?.oneXBetId || 'N/A';
    const minKhr = 1500; // 1,500 ៛ ឡើងទៅ
    const maxKhr = Math.round(500 * EXCHANGE_RATE);  // ~2,050,000 KHR

    if (isNaN(khrAmount) || khrAmount < minKhr || khrAmount > maxKhr) {
      const errText =
        `${ANIM.WARN} <b>ចំនួនទឹកប្រាក់រៀលមិនត្រឹមត្រូវទេ!</b>
────────────
${ANIM.MELBET} <b>ID Melbet:</b> <code>${oneXBetId}</code>
${ANIM.CROSS} <i>សូមវាយបញ្ចូលចំនួនចាប់ពី <b>1,500 ៛ ឡើងទៅ</b> (Min: 1,500 ៛ - Max: ${maxKhr.toLocaleString()} ៛)!</i>
${ANIM.BULB} <b>ឧទាហរណ៍:</b> <code>1500</code>, <code>4000</code>, <code>10000</code>, <code>20000</code>
────────────`;
      const reply_markup = {
        inline_keyboard: [
          [{ text: 'ត្រឡប់ក្រោយ', callback_data: `sel_curr_KHR_${oneXBetId}`, icon_custom_emoji_id: BTN_ICONS.BACK, style: 'primary' }],
          [{ text: 'បោះបង់', callback_data: 'back_main', icon_custom_emoji_id: BTN_ICONS.CANCEL, style: 'danger' }]
        ]
      };
      return showScreen(ctx, { text: errText, reply_markup });
    }

    userStates.delete(userId);
    const usdEquiv = parseFloat((khrAmount / EXCHANGE_RATE).toFixed(2));
    return initiateKhqrPayment(ctx, usdEquiv, oneXBetId, 'KHR', khrAmount);
  }

  // 2c. Fallback Custom Amount for Top-up
  if (userState?.state === 'AWAITING_CUSTOM_AMOUNT') {
    const rawInput = ctx.message.text.trim().toLowerCase();
    const oneXBetId = userState?.oneXBetId || 'N/A';

    const hasKhrSuffix = rawInput.endsWith('r') || rawInput.endsWith('khr') || rawInput.endsWith('៛');
    const numericOnly = parseFloat(rawInput.replace(/[^0-9.]/g, ''));

    if (hasKhrSuffix || (!isNaN(numericOnly) && numericOnly >= 1000 && !rawInput.includes('.'))) {
      const khrAmount = Math.max(1500, Math.round(numericOnly));
      userStates.delete(userId);
      const usdEquiv = parseFloat((khrAmount / EXCHANGE_RATE).toFixed(2));
      return initiateKhqrPayment(ctx, usdEquiv, oneXBetId, 'KHR', khrAmount);
    } else {
      const usdAmount = Math.round(numericOnly * 100) / 100;
      userStates.delete(userId);
      return initiateKhqrPayment(ctx, usdAmount, oneXBetId, 'USD', usdAmount);
    }
  }

  // 3. Step 1 of Withdrawal: User enters 4-digit code
  if (userState?.state === 'AWAITING_WITHDRAW_CODE') {
    const code = ctx.message.text.trim();
    userStates.set(userId, { state: 'AWAITING_WITHDRAW_QR', withdrawCode: code });

    const text =
      `${ANIM.CARD} <b>Melbet Withdrawal | Step 2 of 2</b>
────────────
${ANIM.SHIELD} <b>Code:</b> <code>${code}</code>

${ANIM.CAMERA} ឥឡូវ Send Qr មក Baby`;

    const reply_markup = {
      inline_keyboard: [
        [
          {
            text: 'បោះបង់',
            callback_data: 'back_main',
            icon_custom_emoji_id: BTN_ICONS.CANCEL,
            style: 'danger'
          }
        ]
      ]
    };

    return showScreen(ctx, { text, reply_markup });
  }

  // If user sends random text outside any flow, refresh the main menu cleanly
  const user = getUser(userId, ctx.from.first_name);
  const { text, reply_markup, video } = getMainMenu(user);
  return showScreen(ctx, { text, reply_markup, video });
});

// ---------------- WIRE IN THE PREMIUM ADMIN PANEL ----------------
// Registers all /admin, panel callbacks, announcement/maintenance/history
// handlers. Every handler re-verifies isAdmin() internally.
adminPanel = setupAdminPanel(bot, {
  ANIM, BTN_ICONS,
  isAdmin, ADMIN_ID, ADMIN_ID_VALID,
  usersDb, getUser, saveUsersToDisk,
  showScreen, userStates, userActiveMsgs,
  getMainMenu, store,
  topupRequests, withdrawRequests,
  EXCHANGE_RATE, SUPPORT_LINK, SUPPORT_USERNAME, STORE_NAME,
  CHANNEL_USERNAME, CHANNEL_ID
});

// ---------------- START BOT ----------------
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🤖 Starting Telegram Bot with AUTHENTIC KHQR CARD & 1-MIN EXPIRY...');
console.log(`📡 Bot Username: @Melbetpay8bet_bot`);
console.log(`📢 Target Channel: ${CHANNEL_USERNAME} (${CHANNEL_ID})`);
console.log(`📥 ដាក់ប្រាក់ (Top-Up) Group: ${ADMIN_TOPUP_GROUP_ID}`);
console.log(`📤 ដកប្រាក់ (Withdrawal) Group: ${ADMIN_WITHDRAW_GROUP_ID}`);
console.log(`💳 Payment Gateway: ${PAYLINK_BASE_URL}`);
console.log(`🔑 Merchant: PAY8BET168 (seyha_lome@bkrt)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Lightweight HTTP server for Render Web Service health checks
const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'melbet-telegram-bot', uptime: Math.floor(process.uptime()) }));
});

server.listen(PORT, () => {
  console.log(`🌐 Web health-check server running on port ${PORT} for Render deployment`);
});

bot.launch().then(() => {
  console.log('✅ Bot is running with live KHQR Card Generator and 1-Min Auto-Expiry!');
}).catch((err) => {
  console.error('❌ Failed to launch bot:', err);
});

// Graceful shutdown
process.once('SIGINT', () => {
  server.close();
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  server.close();
  bot.stop('SIGTERM');
});
