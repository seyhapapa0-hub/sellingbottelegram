// ============================================================================
//  admin_panel.js  —  Premium, ADMIN_ID-secured Admin Panel for the bot
// ----------------------------------------------------------------------------
//  This module ADDS an admin panel on top of the existing Telegraf bot without
//  modifying any existing user flow. It is wired in from index.js via:
//
//      adminPanel = require('./admin_panel').setupAdminPanel(bot, deps);
//
//  Every admin command, callback, and action re-verifies the Telegram user's
//  numeric id against ADMIN_ID loaded from .env. Button visibility is never
//  trusted for authorization. If ADMIN_ID is missing/invalid the panel is
//  fully disabled (fail-secure) and nobody can access admin features.
//
//  Features: announcements (broadcast / single / history), maintenance mode
//  (open/close, persistent), user management + search + full history, top-up
//  history + filters + search + show-more, withdrawal history + filters +
//  search + show-more + proof image, and a bot settings overview.
// ============================================================================

const PAGE_SIZE = 6;

const DENY_TEXT = '⛔ បដិសេធការចូល! អ្នកមិនមានសិទ្ធិប្រើប្រាស់ផ្ទាំងគ្រប់គ្រងនេះទេ។';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', hour12: false });
  } catch (e) {
    return d.toISOString();
  }
}

// Human-readable labels for statuses
const TOPUP_STATUS_LABEL = {
  paid: '🟡 កំពុងរង់ចាំ (រង់ចាំអ្នកគ្រប់គ្រង)',
  approved: '🟢 អនុម័តរួច',
  rejected: '🔴 បដិសេធ',
  cancelled: '⚪ បានបោះបង់'
};
const WITHDRAW_STATUS_LABEL = {
  pending: '🟡 កំពុងរង់ចាំ',
  processing: '🔵 កំពុងដំណើរការ',
  completed: '🟢 ជោគជ័យ',
  rejected: '🔴 បដិសេធ',
  cancelled: '⚪ បានបោះបង់'
};

// Filter sets (code -> label). "all" always included.
const TOPUP_FILTERS = [
  ['all', '📋 ទាំងអស់'],
  ['paid', '🟡 រង់ចាំ'],
  ['approved', '🟢 អនុម័ត'],
  ['rejected', '🔴 បដិសេធ'],
  ['cancelled', '⚪ បោះបង់']
];
const WITHDRAW_FILTERS = [
  ['all', '📋 ទាំងអស់'],
  ['pending', '🟡 រង់ចាំ'],
  ['processing', '🔵 ដំណើរការ'],
  ['completed', '🟢 ជោគជ័យ'],
  ['rejected', '🔴 បដិសេធ'],
  ['cancelled', '⚪ បោះបង់']
];

function setupAdminPanel(bot, deps) {
  const {
    ANIM, BTN_ICONS,
    isAdmin, ADMIN_ID, ADMIN_ID_VALID,
    usersDb, getUser, saveUsersToDisk,
    showScreen, userStates, userActiveMsgs,
    getMainMenu, store,
    topupRequests, withdrawRequests,
    EXCHANGE_RATE, SUPPORT_LINK, SUPPORT_USERNAME, STORE_NAME,
    CHANNEL_USERNAME, CHANNEL_ID
  } = deps;

  const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━━━';

  // -------------------------------------------------------------------------
  // Authorization guards (re-checked on EVERY entry point)
  // -------------------------------------------------------------------------
  async function guardAction(ctx) {
    if (isAdmin(ctx.from?.id)) return true;
    await ctx.answerCbQuery(DENY_TEXT, { show_alert: true }).catch(() => { });
    return false;
  }

  async function guardCommand(ctx) {
    if (isAdmin(ctx.from?.id)) return true;
    await ctx.replyWithHTML(`${ANIM.LOCK} <b>${escapeHtml(DENY_TEXT)}</b>`).catch(() => { });
    return false;
  }

  async function ack(ctx, text) {
    await ctx.answerCbQuery(text || '').catch(() => { });
  }

  async function deleteActive(ctx) {
    try {
      const chatId = ctx.chat.id;
      const old = userActiveMsgs.get(chatId);
      if (old) {
        await ctx.telegram.deleteMessage(chatId, old).catch(() => { });
        userActiveMsgs.delete(chatId);
      }
    } catch (e) { /* ignore */ }
  }

  function btn(text, callback_data, style, icon) {
    const b = { text, callback_data };
    if (style) b.style = style;
    if (icon) b.icon_custom_emoji_id = icon;
    return b;
  }

  // =========================================================================
  //  MAINTENANCE: closed screen shown to normal users
  // =========================================================================
  function showClosedScreen(ctx) {
    const text =
      `${ANIM.WARN} <b>សូមអភ័យទោស! Bot ត្រូវបានបិទជាបណ្តោះអាសន្ន</b>\n` +
      `${DIV}\n` +
      `${ANIM.LOCK} <i>Bot ត្រូវបានបិទដោយអ្នកគ្រប់គ្រង ដោយសារមានបញ្ហា ` +
      `ឬកំពុងធ្វើការថែទាំ។</i>\n\n` +
      `${ANIM.HOURGLASS} <b>សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។</b>\n` +
      `${DIV}\n` +
      `${ANIM.CHAT} ជំនួយ: ${SUPPORT_USERNAME}`;
    const reply_markup = {
      inline_keyboard: [[{ text: '💬 ទាក់ទងជំនួយ', url: SUPPORT_LINK, style: 'primary', icon_custom_emoji_id: BTN_ICONS.CHAT }]]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  // =========================================================================
  //  MAIN ADMIN PANEL
  // =========================================================================
  function panelMarkup() {
    return {
      inline_keyboard: [
        [btn('📢 ផ្ញើសារជូនដំណឹង', 'ap_ann', 'success', BTN_ICONS.MEGAPHONE)],
        [
          btn('👥 គ្រប់គ្រងអ្នកប្រើប្រាស់', 'ap_users_p_0', 'primary', BTN_ICONS.CROWN),
          btn('📜 ប្រវត្តិអ្នកប្រើប្រាស់', 'ap_hist_p_0', 'primary', BTN_ICONS.CHART)
        ],
        [
          btn('💰 ប្រវត្តិដាក់ប្រាក់', 'ap_tp_all_0', 'success', BTN_ICONS.DEPOSIT),
          btn('💸 ប្រវត្តិដកប្រាក់', 'ap_wdf_all_0', 'primary', BTN_ICONS.WITHDRAW)
        ],
        [
          btn('🔴 បិទ Bot', 'ap_close', 'danger', BTN_ICONS.CANCEL),
          btn('🟢 បើក Bot', 'ap_open', 'success', BTN_ICONS.SUCCESS)
        ],
        [btn('⚙️ ការកំណត់ Bot', 'ap_settings', 'primary', BTN_ICONS.SHIELD)],
        [btn('🔙 ត្រឡប់ទៅ Menu ចម្បង', 'ap_exit', 'primary', BTN_ICONS.BACK)]
      ]
    };
  }

  function openPanel(ctx) {
    userStates.delete(ctx.from.id);
    const s = store.getSettings();
    const statusLine = s.maintenance
      ? `${ANIM.WARN} <b>ស្ថានភាព Bot:</b> 🔴 <b>បិទ (កំពុងថែទាំ)</b>`
      : `${ANIM.SUCCESS} <b>ស្ថានភាព Bot:</b> 🟢 <b>បើក</b>`;

    const text =
      `${ANIM.CROWN} <b>ផ្ទាំងគ្រប់គ្រងសម្រាប់អ្នកគ្រប់គ្រង</b> ${ANIM.DIAMOND}\n` +
      `${DIV}\n` +
      `${ANIM.SHIELD} <b>ចូលបានតែអ្នកគ្រប់គ្រងប៉ុណ្ណោះ</b>\n` +
      `${ANIM.ID} <b>លេខសម្គាល់អ្នកគ្រប់គ្រង:</b> <code>${escapeHtml(ADMIN_ID)}</code>\n` +
      `${ANIM.USER} <b>អ្នកប្រើប្រាស់ដែលបានចុះឈ្មោះ:</b> <code>${usersDb.size}</code> នាក់\n` +
      `${statusLine}\n` +
      `${DIV}\n` +
      `${ANIM.DOWN} <i>សូមជ្រើសរើសមុខងារដែលអ្នកចង់គ្រប់គ្រង៖</i>`;

    return showScreen(ctx, { text, reply_markup: panelMarkup() });
  }

  // =========================================================================
  //  ANNOUNCEMENT SYSTEM
  // =========================================================================
  function openAnnouncementMenu(ctx) {
    userStates.delete(ctx.from.id);
    const text =
      `${ANIM.MEGAPHONE} <b>មជ្ឈមណ្ឌលផ្ញើសារជូនដំណឹង</b>\n` +
      `${DIV}\n` +
      `${ANIM.USER} <b>អ្នកប្រើប្រាស់ដែលបានចុះឈ្មោះ:</b> <code>${usersDb.size}</code> នាក់\n\n` +
      `${ANIM.DOWN} <i>សូមជ្រើសរើសប្រភេទការផ្ញើសារ៖</i>`;
    const reply_markup = {
      inline_keyboard: [
        [btn('📣 ផ្សាយទៅអ្នកប្រើប្រាស់ទាំងអស់', 'ap_ann_all', 'success', BTN_ICONS.MEGAPHONE)],
        [btn('👤 ផ្ញើទៅអ្នកប្រើម្នាក់', 'ap_ann_one', 'primary', BTN_ICONS.CROWN)],
        [btn('📊 ប្រវត្តិការផ្ញើសារ', 'ap_ann_hist_0', 'primary', BTN_ICONS.CHART)],
        [btn('🔙 ត្រឡប់ក្រោយ', 'ap_home', 'primary', BTN_ICONS.BACK)]
      ]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  function promptBroadcastMessage(ctx) {
    userStates.set(ctx.from.id, { state: 'AP_ANN_BROADCAST' });
    const text =
      `${ANIM.MEGAPHONE} <b>ផ្សាយទៅអ្នកប្រើប្រាស់ទាំងអស់</b>\n` +
      `${DIV}\n` +
      `${ANIM.USER} <b>អ្នកទទួល:</b> <code>${usersDb.size}</code> នាក់\n\n` +
      `${ANIM.CHAT} <b>សូមផ្ញើសារ / រូបភាព / វីដេអូ / ឯកសារ ដែលអ្នកចង់ផ្សាយ៖</b>\n` +
      `<i>(អត្ថបទ រូបភាព វីដេអូ ឬឯកសារ — ពាក្យពណ៌នា និងទ្រង់ទ្រាយនឹងរក្សាដដែល)</i>`;
    const reply_markup = {
      inline_keyboard: [[btn('❌ បោះបង់', 'ap_ann', 'danger', BTN_ICONS.CANCEL)]]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  function promptSingleUser(ctx) {
    userStates.set(ctx.from.id, { state: 'AP_ANN_ONE_USER' });
    const text =
      `${ANIM.CROWN} <b>ផ្ញើទៅអ្នកប្រើម្នាក់</b>\n` +
      `${DIV}\n` +
      `${ANIM.CHAT} <b>សូមផ្ញើឈ្មោះអ្នកប្រើ (Username) ដោយមាន ឬគ្មាន @ ក៏បាន៖</b>\n` +
      `<i>ឧទាហរណ៍:</i> <code>@username</code> <i>ឬ</i> <code>username</code>\n\n` +
      `${ANIM.BULB} <i>ឬអ្នកអាចផ្ញើលេខ Telegram ID ជាលេខផ្ទាល់ក៏បាន។</i>`;
    const reply_markup = {
      inline_keyboard: [[btn('❌ បោះបង់', 'ap_ann', 'danger', BTN_ICONS.CANCEL)]]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  // Resolve a @username or numeric id to a registered user (DB only — never
  // trust a username as a chat id).
  function resolveUser(query) {
    const q = String(query || '').trim();
    if (!q) return null;
    // Numeric id?
    if (/^\d+$/.test(q)) {
      const u = usersDb.get(Number(q));
      if (u) return u;
    }
    const clean = q.replace(/^@/, '').toLowerCase();
    for (const u of usersDb.values()) {
      const uname = String(u.username || '').replace(/^@/, '').toLowerCase();
      if (uname && uname === clean) return u;
    }
    return null;
  }

  async function resolveSingleTarget(ctx, text) {
    const userId = ctx.from.id;
    await ctx.deleteMessage().catch(() => { });
    const user = resolveUser(text);
    if (!user) {
      const t =
        `${ANIM.WARN} <b>រកមិនឃើញអ្នកប្រើប្រាស់នេះទេ!</b>\n` +
        `${DIV}\n` +
        `${ANIM.CROSS} <i>ឈ្មោះ / លេខ "<code>${escapeHtml(text)}</code>" មិនមានក្នុងបញ្ជីអ្នកប្រើប្រាស់ទេ។</i>\n` +
        `<i>អ្នកប្រើប្រាស់ត្រូវតែធ្លាប់ចុច Start Bot យ៉ាងតិចម្តង។</i>`;
      const reply_markup = {
        inline_keyboard: [
          [btn('🔁 ព្យាយាមម្តងទៀត', 'ap_ann_one', 'primary', BTN_ICONS.REFRESH)],
          [btn('🔙 ត្រឡប់ក្រោយ', 'ap_ann', 'primary', BTN_ICONS.BACK)]
        ]
      };
      await showScreen(ctx, { text: t, reply_markup });
      return true;
    }

    const target = {
      userId: user.id,
      username: user.username || '',
      displayName: user.name || 'User'
    };
    userStates.set(userId, { state: 'AP_ANN_ONE_MSG', target });

    const t =
      `${ANIM.CROWN} <b>រកឃើញអ្នកទទួល</b>\n` +
      `${DIV}\n` +
      `${ANIM.USER} <b>ឈ្មោះ:</b> ${escapeHtml(target.displayName)}\n` +
      `${ANIM.ID} <b>លេខ Telegram ID:</b> <code>${target.userId}</code>\n` +
      `${ANIM.CHAT} <b>ឈ្មោះអ្នកប្រើ:</b> ${escapeHtml(target.username || '-')}\n` +
      `${DIV}\n` +
      `${ANIM.DOWN} <b>សូមផ្ញើសារ / មេឌៀ ដែលអ្នកចង់ផ្ញើទៅអ្នកប្រើប្រាស់នេះ៖</b>`;
    const reply_markup = {
      inline_keyboard: [[btn('❌ បោះបង់', 'ap_ann', 'danger', BTN_ICONS.CANCEL)]]
    };
    await showScreen(ctx, { text: t, reply_markup });
    return true;
  }

  async function captureAnnouncementMessage(ctx, annType, target) {
    const userId = ctx.from.id;
    const srcChatId = ctx.chat.id;
    const srcMsgId = ctx.message.message_id;
    const rawText = ctx.message.text || ctx.message.caption || '[media message]';
    const previewText = rawText.length > 80 ? rawText.slice(0, 80) + '…' : rawText;

    // Remove the current active menu message, then show the real content as a
    // faithful preview by copying the admin's own message back to them.
    await deleteActive(ctx);
    let previewMsgId = null;
    try {
      const copied = await ctx.telegram.copyMessage(srcChatId, srcChatId, srcMsgId);
      previewMsgId = copied.message_id;
    } catch (e) { /* ignore preview failure */ }

    userStates.set(userId, {
      state: 'AP_ANN_PREVIEW',
      annType,
      target: target || null,
      srcChatId,
      srcMsgId,
      previewMsgId,
      previewText
    });

    const recipientLine = annType === 'single' && target
      ? `${ANIM.CROWN} <b>អ្នកទទួល:</b> ${escapeHtml(target.displayName)} (<code>${target.userId}</code>)`
      : `${ANIM.USER} <b>អ្នកទទួល:</b> <code>${usersDb.size}</code> នាក់`;

    const text =
      `${ANIM.MEGAPHONE} <b>មើលជាមុន — សូមបញ្ជាក់មុននឹងផ្ញើ</b>\n` +
      `${DIV}\n` +
      `${recipientLine}\n` +
      `${DIV}\n` +
      `${ANIM.WARN} <i>សារខាងលើនឹងត្រូវផ្ញើ។ សូមពិនិត្យមើលម្តងទៀត មុននឹងបញ្ជាក់។</i>`;

    const reply_markup = {
      inline_keyboard: [
        [btn('✅ បញ្ជាក់ & ផ្ញើ', 'ap_ann_confirm', 'success', BTN_ICONS.SUCCESS)],
        [
          btn('✏️ កែសារ', 'ap_ann_edit', 'primary', BTN_ICONS.EDIT),
          btn('❌ បោះបង់', 'ap_ann_cancel', 'danger', BTN_ICONS.CANCEL)
        ]
      ]
    };
    const sent = await ctx.replyWithHTML(text, { reply_markup }).catch(() => null);
    if (sent?.message_id) userActiveMsgs.set(srcChatId, sent.message_id);
    return true;
  }

  async function doConfirmSend(ctx) {
    const userId = ctx.from.id;
    const st = userStates.get(userId);
    if (!st || st.state !== 'AP_ANN_PREVIEW') {
      await ack(ctx, '⚠️ សម័យបានផុតកំណត់។');
      return openAnnouncementMenu(ctx);
    }
    await ack(ctx, '🚀 កំពុងផ្ញើ...');

    // Remove the preview copy to keep the chat clean
    if (st.previewMsgId) {
      await ctx.telegram.deleteMessage(st.srcChatId, st.previewMsgId).catch(() => { });
    }

    let report;
    if (st.annType === 'single' && st.target) {
      report = await runSingleSend(ctx, st);
    } else {
      report = await runBroadcast(ctx, st);
    }

    store.addAnnouncement({
      type: st.annType,
      adminId: userId,
      preview: st.previewText,
      targetUserId: st.target ? st.target.userId : null,
      targetUsername: st.target ? st.target.username : '',
      report
    });

    userStates.delete(userId);
    return showReport(ctx, st, report);
  }

  async function runBroadcast(ctx, st) {
    const users = Array.from(usersDb.values());
    const total = users.length;
    const report = { total, sent: 0, failed: 0, blocked: 0, invalid: 0, rateLimited: 0, otherErrors: 0 };

    const progress = await ctx.replyWithHTML(
      `${ANIM.REFRESH} <b>កំពុងផ្ញើសារ...</b> <code>0/${total}</code> នាក់`
    ).catch(() => null);

    let processed = 0;
    for (const u of users) {
      const recipientId = Number(u.id);
      if (!recipientId) { report.invalid++; report.failed++; processed++; continue; }

      let attempts = 0;
      let done = false;
      while (!done && attempts < 3) {
        attempts++;
        try {
          await ctx.telegram.copyMessage(recipientId, st.srcChatId, st.srcMsgId);
          report.sent++;
          done = true;
        } catch (err) {
          const desc = String(err?.response?.description || err?.description || err.message || '').toLowerCase();
          const retryAfter = err?.response?.parameters?.retry_after || err?.parameters?.retry_after;
          if (retryAfter) {
            report.rateLimited++;
            await sleep((Number(retryAfter) + 1) * 1000);
            continue; // retry after waiting
          }
          if (desc.includes('blocked') || desc.includes('deactivated')) report.blocked++;
          else if (desc.includes('chat not found') || desc.includes('invalid') || desc.includes('peer_id')) report.invalid++;
          else report.otherErrors++;
          report.failed++;
          done = true;
        }
      }

      processed++;
      await sleep(40); // stay under Telegram's ~30 msg/sec limit
      if (progress && processed % 20 === 0) {
        await ctx.telegram.editMessageText(
          progress.chat.id, progress.message_id, undefined,
          `${ANIM.REFRESH} <b>កំពុងផ្ញើសារ...</b> <code>${processed}/${total}</code> នាក់\n✅ ${report.sent}   ⚠️ ${report.failed}`,
          { parse_mode: 'HTML' }
        ).catch(() => { });
      }
    }

    if (progress) await ctx.telegram.deleteMessage(progress.chat.id, progress.message_id).catch(() => { });
    return report;
  }

  async function runSingleSend(ctx, st) {
    const report = { total: 1, sent: 0, failed: 0, blocked: 0, invalid: 0, rateLimited: 0, otherErrors: 0 };
    const recipientId = Number(st.target.userId);
    try {
      await ctx.telegram.copyMessage(recipientId, st.srcChatId, st.srcMsgId);
      report.sent = 1;
    } catch (err) {
      const desc = String(err?.response?.description || err?.description || err.message || '').toLowerCase();
      if (desc.includes('blocked') || desc.includes('deactivated')) report.blocked++;
      else if (desc.includes('chat not found') || desc.includes('invalid') || desc.includes('peer_id')) report.invalid++;
      else report.otherErrors++;
      report.failed = 1;
    }
    return report;
  }

  function showReport(ctx, st, report) {
    const isSingle = st.annType === 'single';
    const title = isSingle ? 'សារត្រូវបានផ្ញើ' : 'ការផ្សាយបានបញ្ចប់';
    const text =
      `${ANIM.PARTY} <b>${title}</b>\n` +
      `${DIV}\n` +
      `${ANIM.USER} <b>អ្នកទទួលសរុប:</b> <code>${report.total}</code>\n` +
      `${ANIM.SUCCESS} <b>ផ្ញើជោគជ័យ:</b> <code>${report.sent}</code>\n` +
      `${ANIM.CROSS} <b>បរាជ័យ:</b> <code>${report.failed}</code>\n` +
      `${ANIM.LOCK} <b>អ្នកប្រើបានប្លុក Bot:</b> <code>${report.blocked}</code>\n` +
      `${ANIM.WARN} <b>លេខ Chat មិនត្រឹមត្រូវ:</b> <code>${report.invalid}</code>\n` +
      `${ANIM.HOURGLASS} <b>ការព្យាយាមឡើងវិញ (ដែនកំណត់ល្បឿន):</b> <code>${report.rateLimited}</code>\n` +
      `${ANIM.ID} <b>កំហុសផ្សេងទៀត:</b> <code>${report.otherErrors}</code>\n` +
      `${DIV}`;
    const reply_markup = {
      inline_keyboard: [
        [btn('📊 ប្រវត្តិការផ្ញើសារ', 'ap_ann_hist_0', 'primary', BTN_ICONS.CHART)],
        [btn('🔙 មជ្ឈមណ្ឌលផ្ញើសារ', 'ap_ann', 'primary', BTN_ICONS.BACK)],
        [btn('🏠 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.DIAMOND)]
      ]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  async function doEdit(ctx) {
    const st = userStates.get(ctx.from.id);
    await ack(ctx);
    if (st?.previewMsgId) {
      await ctx.telegram.deleteMessage(st.srcChatId, st.previewMsgId).catch(() => { });
    }
    if (st?.annType === 'single' && st.target) {
      userStates.set(ctx.from.id, { state: 'AP_ANN_ONE_MSG', target: st.target });
      return showScreen(ctx, {
        text: `${ANIM.CHAT} <b>សូមផ្ញើសារថ្មីម្តងទៀត៖</b>`,
        reply_markup: { inline_keyboard: [[btn('❌ បោះបង់', 'ap_ann', 'danger', BTN_ICONS.CANCEL)]] }
      });
    }
    return promptBroadcastMessage(ctx);
  }

  async function doCancelAnnouncement(ctx) {
    const st = userStates.get(ctx.from.id);
    await ack(ctx, 'បានបោះបង់!');
    if (st?.previewMsgId) {
      await ctx.telegram.deleteMessage(st.srcChatId, st.previewMsgId).catch(() => { });
    }
    userStates.delete(ctx.from.id);
    return openAnnouncementMenu(ctx);
  }

  function showAnnouncementHistory(ctx, page) {
    const list = store.getAnnouncements();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, page), totalPages - 1);
    const slice = list.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

    let text = `${ANIM.CHART} <b>ប្រវត្តិការផ្ញើសារ</b>\n${DIV}\n`;
    if (list.length === 0) {
      text += `\n<i>${ANIM.WARN} មិនទាន់មានប្រវត្តិផ្សាយសារនៅឡើយទេ។</i>\n`;
    } else {
      slice.forEach((a) => {
        const typeLabel = a.type === 'single' ? `👤 ផ្ញើម្នាក់ → ${escapeHtml(a.targetUsername || a.targetUserId || '')}` : '📣 ផ្សាយទាំងអស់';
        const r = a.report || {};
        text +=
          `\n${ANIM.PIN} <b>${typeLabel}</b>\n` +
          `   🗓 <code>${fmtDate(a.createdAt)}</code>\n` +
          `   💬 <i>${escapeHtml(a.preview || '')}</i>\n` +
          `   ✅ <code>${r.sent || 0}</code>  ⚠️ <code>${r.failed || 0}</code>  👥 <code>${r.total || 0}</code>\n`;
      });
    }
    text += `${DIV}\n<i>ទំព័រ ${p + 1}/${totalPages}</i>`;

    const nav = [];
    if (p > 0) nav.push(btn('⬅️ មុន', `ap_ann_hist_${p - 1}`, 'primary', BTN_ICONS.BACK));
    if (p < totalPages - 1) nav.push(btn('បន្ទាប់ ➡️', `ap_ann_hist_${p + 1}`, 'primary'));
    const reply_markup = { inline_keyboard: [] };
    if (nav.length) reply_markup.inline_keyboard.push(nav);
    reply_markup.inline_keyboard.push([btn('🔙 ត្រឡប់ក្រោយ', 'ap_ann', 'primary', BTN_ICONS.BACK)]);

    return showScreen(ctx, { text, reply_markup });
  }

  // =========================================================================
  //  MAINTENANCE MODE  (Close / Open)
  // =========================================================================
  function confirmClose(ctx) {
    const text =
      `${ANIM.WARN} <b>បិទ Bot — ការបញ្ជាក់</b>\n` +
      `${DIV}\n` +
      `${ANIM.LOCK} <i>នៅពេលបិទ Bot៖ អ្នកប្រើប្រាស់ធម្មតានឹងមិនអាចដាក់ប្រាក់ ដកប្រាក់ ឬប្រើមុខងារផ្សេងៗបានទេ។</i>\n\n` +
      `${ANIM.SHIELD} <i>អ្នកគ្រប់គ្រងនៅតែអាចប្រើផ្ទាំងគ្រប់គ្រងបានធម្មតា។</i>\n` +
      `${DIV}\n<b>តើអ្នកប្រាកដជាចង់បិទ Bot មែនទេ?</b>`;
    const reply_markup = {
      inline_keyboard: [
        [btn('🔴 បាទ/ចាស បិទ Bot', 'ap_close_yes', 'danger', BTN_ICONS.CANCEL)],
        [btn('🔙 ត្រឡប់ក្រោយ', 'ap_home', 'primary', BTN_ICONS.BACK)]
      ]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  function doClose(ctx) {
    store.closeBot(ctx.from.id);
    const text =
      `${ANIM.SUCCESS} <b>Bot ត្រូវបានបិទរួចរាល់</b>\n` +
      `${DIV}\n` +
      `${ANIM.WARN} <b>ស្ថានភាព:</b> 🔴 <b>បិទ (កំពុងថែទាំ)</b>\n` +
      `${ANIM.HOURGLASS} <i>អ្នកប្រើប្រាស់ធម្មតាឥឡូវត្រូវបានរារាំងពីការធ្វើប្រតិបត្តិការ។</i>\n` +
      `${DIV}`;
    const reply_markup = {
      inline_keyboard: [
        [btn('🟢 បើក Bot', 'ap_open', 'success', BTN_ICONS.SUCCESS)],
        [btn('🏠 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.DIAMOND)]
      ]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  function confirmOpen(ctx) {
    const text =
      `${ANIM.SUCCESS} <b>បើក Bot — ការបញ្ជាក់</b>\n` +
      `${DIV}\n` +
      `${ANIM.SPARKLES} <i>នៅពេលបើក Bot ឡើងវិញ៖ អ្នកប្រើប្រាស់ទាំងអស់នឹងអាចប្រើមុខងារធម្មតាវិញ។</i>\n` +
      `${DIV}\n<b>តើអ្នកប្រាកដជាចង់បើក Bot មែនទេ?</b>`;
    const reply_markup = {
      inline_keyboard: [
        [btn('🟢 បាទ/ចាស បើក Bot', 'ap_open_yes', 'success', BTN_ICONS.SUCCESS)],
        [btn('🔙 ត្រឡប់ក្រោយ', 'ap_home', 'primary', BTN_ICONS.BACK)]
      ]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  function doOpen(ctx) {
    store.openBot(ctx.from.id);
    const text =
      `${ANIM.PARTY} <b>Bot ត្រូវបានបើករួចរាល់</b>\n` +
      `${DIV}\n` +
      `${ANIM.SUCCESS} <b>ស្ថានភាព:</b> 🟢 <b>បើក</b>\n` +
      `${ANIM.SPARKLES} <i>អ្នកប្រើប្រាស់ទាំងអស់អាចប្រើប្រាស់ Bot បានធម្មតាឡើងវិញហើយ។</i>\n` +
      `${DIV}`;
    const reply_markup = {
      inline_keyboard: [[btn('🏠 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.DIAMOND)]]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  // =========================================================================
  //  USER MANAGEMENT
  // =========================================================================
  function userRowLabel(u) {
    const uname = u.username ? escapeHtml(u.username) : '(no username)';
    return `${escapeHtml(u.name || 'User')} ${uname}`;
  }

  function showUsers(ctx, page, forHistory) {
    const list = Array.from(usersDb.values());
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, page), totalPages - 1);
    const slice = list.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

    const title = forHistory ? '📜 ប្រវត្តិអ្នកប្រើប្រាស់' : '👥 គ្រប់គ្រងអ្នកប្រើប្រាស់';
    let text = `${ANIM.CROWN} <b>${title}</b>\n${DIV}\n`;
    text += `${ANIM.USER} <b>ចំនួនចុះឈ្មោះសរុប:</b> <code>${list.length}</code> នាក់\n${DIV}\n`;
    text += `<i>សូមជ្រើសរើសអ្នកប្រើប្រាស់ ឬស្វែងរក៖</i>`;

    const prefix = forHistory ? 'ap_uhist_' : 'ap_user_';
    const rows = slice.map(u => [btn(
      `${u.username ? u.username : u.name} • ${u.id}`,
      `${prefix}${u.id}_0`,
      'primary'
    )]);

    const nav = [];
    const navBase = forHistory ? 'ap_hist_p_' : 'ap_users_p_';
    if (p > 0) nav.push(btn('⬅️ មុន', `${navBase}${p - 1}`, 'primary', BTN_ICONS.BACK));
    if (p < totalPages - 1) nav.push(btn('បន្ទាប់ ➡️', `${navBase}${p + 1}`, 'primary'));

    const reply_markup = { inline_keyboard: rows };
    reply_markup.inline_keyboard.push([btn('🔍 ស្វែងរកអ្នកប្រើ', 'ap_user_search', 'success', BTN_ICONS.CHART)]);
    if (nav.length) reply_markup.inline_keyboard.push(nav);
    reply_markup.inline_keyboard.push([btn('🔙 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.BACK)]);

    text += `\n${DIV}\n<i>ទំព័រ ${p + 1}/${totalPages}</i>`;
    userStates.set(ctx.from.id, { state: forHistory ? 'AP_HIST_BROWSE' : 'AP_USER_BROWSE' });
    return showScreen(ctx, { text, reply_markup });
  }

  function promptUserSearch(ctx) {
    userStates.set(ctx.from.id, { state: 'AP_USER_SEARCH' });
    const text =
      `${ANIM.CHART} <b>ស្វែងរកអ្នកប្រើ</b>\n` +
      `${DIV}\n` +
      `${ANIM.CHAT} <b>សូមផ្ញើឈ្មោះអ្នកប្រើ (Username) ឬលេខ Telegram ID៖</b>\n` +
      `<i>ឧទាហរណ៍:</i> <code>@username</code> <i>ឬ</i> <code>123456789</code>`;
    const reply_markup = {
      inline_keyboard: [[btn('🔙 ត្រឡប់ក្រោយ', 'ap_users_p_0', 'primary', BTN_ICONS.BACK)]]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  async function doUserSearch(ctx, text) {
    await ctx.deleteMessage().catch(() => { });
    const user = resolveUser(text);
    if (!user) {
      const t =
        `${ANIM.WARN} <b>រកមិនឃើញអ្នកប្រើប្រាស់!</b>\n${DIV}\n` +
        `${ANIM.CROSS} <i>"<code>${escapeHtml(text)}</code>" មិនបានចុះឈ្មោះទេ។</i>`;
      const reply_markup = {
        inline_keyboard: [
          [btn('🔁 ព្យាយាមម្តងទៀត', 'ap_user_search', 'primary', BTN_ICONS.REFRESH)],
          [btn('🔙 ត្រឡប់ក្រោយ', 'ap_users_p_0', 'primary', BTN_ICONS.BACK)]
        ]
      };
      await showScreen(ctx, { text: t, reply_markup });
      return true;
    }
    userStates.delete(ctx.from.id);
    await showUserDetail(ctx, user.id);
    return true;
  }

  function showUserDetail(ctx, id) {
    const u = usersDb.get(Number(id));
    if (!u) {
      return showScreen(ctx, {
        text: `${ANIM.WARN} <b>រកមិនឃើញអ្នកប្រើប្រាស់។</b>`,
        reply_markup: { inline_keyboard: [[btn('🔙 ត្រឡប់ក្រោយ', 'ap_users_p_0', 'primary', BTN_ICONS.BACK)]] }
      });
    }
    const stats = store.getUserStats(u.id);
    const text =
      `${ANIM.CROWN} <b>ព័ត៌មានអ្នកប្រើប្រាស់</b>\n` +
      `${DIV}\n` +
      `${ANIM.USER} <b>ឈ្មោះ:</b> ${escapeHtml(u.name || 'User')}\n` +
      `${ANIM.CHAT} <b>ឈ្មោះអ្នកប្រើ:</b> ${escapeHtml(u.username || '-')}\n` +
      `${ANIM.ID} <b>លេខ Telegram ID:</b> <code>${u.id}</code>\n` +
      `${ANIM.CALENDAR} <b>ថ្ងៃចុះឈ្មោះ:</b> <code>${escapeHtml(u.joinedAt || '-')}</code>\n` +
      `${ANIM.MONEY} <b>សមតុល្យ:</b> <code>$${Number(u.balance || 0).toFixed(2)} USD</code>\n` +
      `${DIV}\n` +
      `${ANIM.DEPOSIT} <b>ដាក់ប្រាក់សរុប (អនុម័ត):</b> <code>$${stats.totalTopupUsd.toFixed(2)}</code> (${stats.topupCount} ដង)\n` +
      `${ANIM.WITHDRAW} <b>ដកប្រាក់:</b> <code>${stats.withdrawCount}</code> ដង (${stats.totalWithdrawCount} ជោគជ័យ)\n` +
      `${ANIM.HOURGLASS} <b>កំពុងរង់ចាំ:</b> <code>${stats.pending}</code>   ✅ <b>ជោគជ័យ:</b> <code>${stats.completed}</code>\n` +
      `${ANIM.CROSS} <b>បដិសេធ:</b> <code>${stats.rejected}</code>   ⚪ <b>បោះបង់:</b> <code>${stats.cancelled}</code>\n` +
      `${DIV}`;
    const reply_markup = {
      inline_keyboard: [
        [btn('📜 ប្រវត្តិទាំងអស់', `ap_uhist_${u.id}_0`, 'success', BTN_ICONS.CHART)],
        [btn('👤 ផ្ញើសារ', `ap_msg_${u.id}`, 'primary', BTN_ICONS.MEGAPHONE)],
        [btn('🔙 ត្រឡប់ទៅបញ្ជីអ្នកប្រើ', 'ap_users_p_0', 'primary', BTN_ICONS.BACK)]
      ]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  // Complete per-user transaction history (top-ups + withdrawals combined)
  function showUserHistory(ctx, id, page) {
    const u = usersDb.get(Number(id));
    if (!u) {
      return showScreen(ctx, {
        text: `${ANIM.WARN} <b>រកមិនឃើញអ្នកប្រើប្រាស់។</b>`,
        reply_markup: { inline_keyboard: [[btn('🔙 ត្រឡប់ក្រោយ', 'ap_hist_p_0', 'primary', BTN_ICONS.BACK)]] }
      });
    }
    const tps = store.getUserTopups(u.id).map(t => ({ kind: 'topup', ...t }));
    const wds = store.getUserWithdrawals(u.id).map(w => ({ kind: 'withdraw', ...w }));
    const all = tps.concat(wds).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const stats = store.getUserStats(u.id);
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, page), totalPages - 1);
    const slice = all.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

    let text =
      `${ANIM.CHART} <b>ប្រវត្តិអ្នកប្រើប្រាស់</b> — ${escapeHtml(u.name || 'User')}\n` +
      `${DIV}\n` +
      `${ANIM.ID} <code>${u.id}</code> • ${escapeHtml(u.username || '-')}\n` +
      `${ANIM.MONEY} សមតុល្យ: <code>$${Number(u.balance || 0).toFixed(2)}</code>\n` +
      `${ANIM.DEPOSIT} ដាក់ប្រាក់: <code>${stats.topupCount}</code> • ${ANIM.WITHDRAW} ដកប្រាក់: <code>${stats.withdrawCount}</code>\n` +
      `${DIV}\n`;

    const rows = [];
    if (all.length === 0) {
      text += `\n<i>${ANIM.WARN} មិនទាន់មានប្រវត្តិប្រតិបត្តិការសម្រាប់អ្នកប្រើនេះទេ។</i>\n`;
    } else {
      slice.forEach((tx) => {
        if (tx.kind === 'topup') {
          text += `\n${ANIM.DEPOSIT} <b>ដាក់ប្រាក់</b> <code>${escapeHtml(tx.id)}</code>\n` +
            `   💵 $${Number(tx.amountUsd || 0).toFixed(2)} • ${TOPUP_STATUS_LABEL[tx.status] || tx.status}\n` +
            `   🗓 <code>${fmtDate(tx.createdAt)}</code>\n`;
          rows.push([btn(`💰 ដាក់ប្រាក់ ${tx.id}`, `ap_tpv_${tx.id}`, 'primary')]);
        } else {
          text += `\n${ANIM.WITHDRAW} <b>ដកប្រាក់</b> <code>${escapeHtml(tx.id)}</code>\n` +
            `   🔑 កូដ: <code>${escapeHtml(tx.code || '-')}</code> • ${WITHDRAW_STATUS_LABEL[tx.status] || tx.status}\n` +
            `   🗓 <code>${fmtDate(tx.createdAt)}</code>\n`;
          rows.push([btn(`💸 ដកប្រាក់ ${tx.id}`, `ap_wdv_${tx.id}`, 'primary')]);
        }
      });
    }
    text += `${DIV}\n<i>ទំព័រ ${p + 1}/${totalPages}</i>`;

    const nav = [];
    if (p > 0) nav.push(btn('⬅️ មុន', `ap_uhist_${u.id}_${p - 1}`, 'primary', BTN_ICONS.BACK));
    if (p < totalPages - 1) nav.push(btn('បន្ទាប់ ➡️', `ap_uhist_${u.id}_${p + 1}`, 'primary'));

    const reply_markup = { inline_keyboard: rows };
    if (nav.length) reply_markup.inline_keyboard.push(nav);
    reply_markup.inline_keyboard.push([btn('🔙 ត្រឡប់ក្រោយ', 'ap_hist_p_0', 'primary', BTN_ICONS.BACK)]);
    return showScreen(ctx, { text, reply_markup });
  }

  // =========================================================================
  //  TOP-UP HISTORY
  // =========================================================================
  function filterTopups(filter) {
    const list = store.getTopups();
    if (!filter || filter === 'all') return list;
    return list.filter(t => t.status === filter);
  }

  function topupFilterRow(active) {
    return TOPUP_FILTERS.map(([code, label]) => btn(
      (code === active ? '• ' : '') + label,
      `ap_tp_${code}_0`,
      code === active ? 'success' : 'primary'
    ));
  }

  function showTopups(ctx, filter, page) {
    const list = filterTopups(filter);
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, page), totalPages - 1);
    const slice = list.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

    let text =
      `${ANIM.DEPOSIT} <b>ប្រវត្តិដាក់ប្រាក់</b>\n` +
      `${DIV}\n` +
      `${ANIM.CHART} <b>តម្រង:</b> ${escapeHtml((TOPUP_FILTERS.find(f => f[0] === filter) || ['', 'ទាំងអស់'])[1])}  •  <b>សរុប:</b> <code>${list.length}</code>\n` +
      `${DIV}\n`;

    const rows = [];
    if (slice.length === 0) {
      text += `\n<i>${ANIM.WARN} មិនមានកំណត់ត្រាដាក់ប្រាក់សម្រាប់តម្រងនេះទេ។</i>\n`;
    } else {
      slice.forEach((t) => {
        const amtLine = t.currency === 'KHR'
          ? `${Number(t.chargeAmount || 0).toLocaleString()} ៛ (≈$${Number(t.amountUsd || 0).toFixed(2)})`
          : `$${Number(t.amountUsd || 0).toFixed(2)}`;
        text +=
          `\n${ANIM.RECEIPT} <code>${escapeHtml(t.id)}</code> — ${TOPUP_STATUS_LABEL[t.status] || t.status}\n` +
          `   ${ANIM.USER} ${escapeHtml(t.name || '')} ${escapeHtml(t.username || '')}\n` +
          `   ${ANIM.MONEY} ${amtLine}  •  🎮 <code>${escapeHtml(t.oneXBetId || '-')}</code>\n`;
        rows.push([btn(`🔎 ${t.id} • ${amtLine}`, `ap_tpv_${t.id}`, 'primary')]);
      });
    }
    text += `${DIV}\n<i>ទំព័រ ${p + 1}/${totalPages}</i>`;

    const reply_markup = { inline_keyboard: [] };
    // filters split into two rows for readability
    reply_markup.inline_keyboard.push(topupFilterRow(filter).slice(0, 3));
    reply_markup.inline_keyboard.push(topupFilterRow(filter).slice(3));
    rows.forEach(r => reply_markup.inline_keyboard.push(r));

    const nav = [];
    if (p > 0) nav.push(btn('⬅️ មុន', `ap_tp_${filter}_${p - 1}`, 'primary', BTN_ICONS.BACK));
    if (p < totalPages - 1) nav.push(btn('បន្ទាប់ ➡️', `ap_tp_${filter}_${p + 1}`, 'primary'));
    if (nav.length) reply_markup.inline_keyboard.push(nav);

    reply_markup.inline_keyboard.push([
      btn('🔍 ស្វែងរក', 'ap_tp_search', 'success', BTN_ICONS.CHART),
      btn('🔙 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.BACK)
    ]);
    return showScreen(ctx, { text, reply_markup });
  }

  function showTopupDetail(ctx, id, expanded) {
    const t = store.findTopup(id);
    if (!t) {
      return showScreen(ctx, {
        text: `${ANIM.WARN} <b>រកមិនឃើញកំណត់ត្រាដាក់ប្រាក់។</b>`,
        reply_markup: { inline_keyboard: [[btn('🔙 ត្រឡប់ក្រោយ', 'ap_tp_all_0', 'primary', BTN_ICONS.BACK)]] }
      });
    }
    const amtLine = t.currency === 'KHR'
      ? `${Number(t.chargeAmount || 0).toLocaleString()} ៛ KHR (≈ $${Number(t.amountUsd || 0).toFixed(2)} USD)`
      : `$${Number(t.amountUsd || 0).toFixed(2)} USD`;

    let text =
      `${ANIM.DEPOSIT} <b>ព័ត៌មានលម្អិតដាក់ប្រាក់</b>\n` +
      `${DIV}\n` +
      `${ANIM.RECEIPT} <b>លេខប្រតិបត្តិការ:</b> <code>${escapeHtml(t.id)}</code>\n` +
      `${ANIM.USER} <b>អ្នកប្រើ:</b> ${escapeHtml(t.name || '')} ${escapeHtml(t.username || '')}\n` +
      `${ANIM.ID} <b>លេខ Telegram ID:</b> <code>${t.userId}</code>\n` +
      `${ANIM.MELBET} <b>ID Melbet:</b> <code>${escapeHtml(t.oneXBetId || '-')}</code>\n` +
      `${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> ${amtLine}\n` +
      `${ANIM.CARD} <b>មធ្យោបាយ:</b> ${escapeHtml(t.method || 'KHQR')}\n` +
      `${ANIM.ID} <b>ស្ថានភាព:</b> ${TOPUP_STATUS_LABEL[t.status] || t.status}\n`;

    if (expanded) {
      text +=
        `${DIV}\n` +
        `${ANIM.PIN} <b>លេខយោង:</b> <code>${escapeHtml(t.reference || t.id)}</code>\n` +
        `${ANIM.MONEY} <b>រូបិយប័ណ្ណ:</b> <code>${escapeHtml(t.currency || 'USD')}</code>\n` +
        `${ANIM.CALENDAR} <b>ដាក់ស្នើ:</b> <code>${fmtDate(t.createdAt)}</code>\n` +
        `${ANIM.CALENDAR} <b>សម្រេច:</b> <code>${t.decidedAt ? fmtDate(t.decidedAt) : '-'}</code>\n` +
        `${ANIM.OFFICER} <b>សម្រេចដោយ:</b> ${escapeHtml(t.decidedBy || '-')}\n` +
        `${ANIM.CROSS} <b>មូលហេតុបដិសេធ:</b> ${escapeHtml(t.rejectReason || '-')}\n`;
    }
    text += `${DIV}`;

    const reply_markup = { inline_keyboard: [] };
    // Approve / reject actions for a PENDING top-up (status 'paid')
    if (t.status === 'paid') {
      reply_markup.inline_keyboard.push([
        btn('✅ បញ្ចូលជោគជ័យ (Done)', `ap_tpok_${t.id}`, 'success', BTN_ICONS.SUCCESS),
        btn('❌ បដិសេធ (Cancel)', `ap_tpno_${t.id}`, 'danger', BTN_ICONS.CANCEL)
      ]);
    }
    if (!expanded) {
      reply_markup.inline_keyboard.push([btn('📄 មើលបន្ថែម', `ap_tpmore_${t.id}`, 'success', BTN_ICONS.CHART)]);
    }
    reply_markup.inline_keyboard.push([btn('🔙 ត្រឡប់ទៅដាក់ប្រាក់', 'ap_tp_all_0', 'primary', BTN_ICONS.BACK)]);
    reply_markup.inline_keyboard.push([btn('🏠 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.DIAMOND)]);
    return showScreen(ctx, { text, reply_markup });
  }

  function promptTopupSearch(ctx) {
    userStates.set(ctx.from.id, { state: 'AP_TOPUP_SEARCH' });
    const text =
      `${ANIM.CHART} <b>ស្វែងរកការដាក់ប្រាក់</b>\n${DIV}\n` +
      `${ANIM.CHAT} <b>សូមផ្ញើលេខប្រតិបត្តិការ, លេខ Telegram ID ឬឈ្មោះអ្នកប្រើ៖</b>`;
    const reply_markup = { inline_keyboard: [[btn('🔙 ត្រឡប់ក្រោយ', 'ap_tp_all_0', 'primary', BTN_ICONS.BACK)]] };
    return showScreen(ctx, { text, reply_markup });
  }

  async function doTopupSearch(ctx, text) {
    await ctx.deleteMessage().catch(() => { });
    const q = String(text || '').trim();
    const qClean = q.replace(/^@/, '').toLowerCase();
    const list = store.getTopups();
    const matches = list.filter(t =>
      String(t.id).toLowerCase() === q.toLowerCase() ||
      String(t.userId) === q ||
      String(t.username || '').replace(/^@/, '').toLowerCase() === qClean ||
      String(t.oneXBetId || '') === q
    );
    userStates.delete(ctx.from.id);
    if (matches.length === 0) {
      await showScreen(ctx, {
        text: `${ANIM.WARN} <b>រកមិនឃើញការដាក់ប្រាក់សម្រាប់</b> <code>${escapeHtml(q)}</code>។`,
        reply_markup: {
          inline_keyboard: [
            [btn('🔁 ព្យាយាមម្តងទៀត', 'ap_tp_search', 'primary', BTN_ICONS.REFRESH)],
            [btn('🔙 ត្រឡប់ក្រោយ', 'ap_tp_all_0', 'primary', BTN_ICONS.BACK)]
          ]
        }
      });
      return true;
    }
    if (matches.length === 1) {
      await showTopupDetail(ctx, matches[0].id, false);
      return true;
    }
    // multiple -> list
    let t = `${ANIM.DEPOSIT} <b>លទ្ធផលស្វែងរក (${matches.length})</b>\n${DIV}\n`;
    const rows = matches.slice(0, 10).map(m => [btn(`🔎 ${m.id} • $${Number(m.amountUsd || 0).toFixed(2)}`, `ap_tpv_${m.id}`, 'primary')]);
    rows.push([btn('🔙 ត្រឡប់ក្រោយ', 'ap_tp_all_0', 'primary', BTN_ICONS.BACK)]);
    await showScreen(ctx, { text: t, reply_markup: { inline_keyboard: rows } });
    return true;
  }

  // =========================================================================
  //  WITHDRAW HISTORY
  // =========================================================================
  function filterWithdrawals(filter) {
    const list = store.getWithdrawals();
    if (!filter || filter === 'all') return list;
    return list.filter(w => w.status === filter);
  }

  function withdrawFilterRow(active) {
    return WITHDRAW_FILTERS.map(([code, label]) => btn(
      (code === active ? '• ' : '') + label,
      `ap_wdf_${code}_0`,
      code === active ? 'success' : 'primary'
    ));
  }

  function showWithdrawals(ctx, filter, page) {
    const list = filterWithdrawals(filter);
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, page), totalPages - 1);
    const slice = list.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

    let text =
      `${ANIM.WITHDRAW} <b>ប្រវត្តិដកប្រាក់</b>\n` +
      `${DIV}\n` +
      `${ANIM.CHART} <b>តម្រង:</b> ${escapeHtml((WITHDRAW_FILTERS.find(f => f[0] === filter) || ['', 'ទាំងអស់'])[1])}  •  <b>សរុប:</b> <code>${list.length}</code>\n` +
      `${DIV}\n`;

    const rows = [];
    if (slice.length === 0) {
      text += `\n<i>${ANIM.WARN} មិនមានកំណត់ត្រាដកប្រាក់សម្រាប់តម្រងនេះទេ។</i>\n`;
    } else {
      slice.forEach((w) => {
        text +=
          `\n${ANIM.RECEIPT} <code>${escapeHtml(w.id)}</code> — ${WITHDRAW_STATUS_LABEL[w.status] || w.status}\n` +
          `   ${ANIM.USER} ${escapeHtml(w.name || '')} ${escapeHtml(w.username || '')}\n` +
          `   🔑 កូដ: <code>${escapeHtml(w.code || '-')}</code>\n`;
        rows.push([btn(`🔎 ${w.id} • ${escapeHtml(w.code || '')}`, `ap_wdv_${w.id}`, 'primary')]);
      });
    }
    text += `${DIV}\n<i>ទំព័រ ${p + 1}/${totalPages}</i>`;

    const reply_markup = { inline_keyboard: [] };
    reply_markup.inline_keyboard.push(withdrawFilterRow(filter).slice(0, 3));
    reply_markup.inline_keyboard.push(withdrawFilterRow(filter).slice(3));
    rows.forEach(r => reply_markup.inline_keyboard.push(r));

    const nav = [];
    if (p > 0) nav.push(btn('⬅️ មុន', `ap_wdf_${filter}_${p - 1}`, 'primary', BTN_ICONS.BACK));
    if (p < totalPages - 1) nav.push(btn('បន្ទាប់ ➡️', `ap_wdf_${filter}_${p + 1}`, 'primary'));
    if (nav.length) reply_markup.inline_keyboard.push(nav);

    reply_markup.inline_keyboard.push([
      btn('🔍 ស្វែងរក', 'ap_wd_search', 'success', BTN_ICONS.CHART),
      btn('🔙 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.BACK)
    ]);
    return showScreen(ctx, { text, reply_markup });
  }

  function showWithdrawDetail(ctx, id, expanded) {
    const w = store.findWithdrawal(id);
    if (!w) {
      return showScreen(ctx, {
        text: `${ANIM.WARN} <b>រកមិនឃើញកំណត់ត្រាដកប្រាក់។</b>`,
        reply_markup: { inline_keyboard: [[btn('🔙 ត្រឡប់ក្រោយ', 'ap_wdf_all_0', 'primary', BTN_ICONS.BACK)]] }
      });
    }

    let text =
      `${ANIM.WITHDRAW} <b>ព័ត៌មានលម្អិតដកប្រាក់</b>\n` +
      `${DIV}\n` +
      `${ANIM.RECEIPT} <b>លេខដកប្រាក់:</b> <code>${escapeHtml(w.id)}</code>\n` +
      `${ANIM.USER} <b>អ្នកប្រើ:</b> ${escapeHtml(w.name || '')} ${escapeHtml(w.username || '')}\n` +
      `${ANIM.ID} <b>លេខ Telegram ID:</b> <code>${w.userId}</code>\n` +
      `${ANIM.SHIELD} <b>កូដ:</b> <code>${escapeHtml(w.code || '-')}</code>\n` +
      `${ANIM.CARD} <b>មធ្យោបាយ:</b> ${escapeHtml(w.method || '-')}\n` +
      `${ANIM.ID} <b>ស្ថានភាព:</b> ${WITHDRAW_STATUS_LABEL[w.status] || w.status}\n`;

    if (expanded) {
      text +=
        `${DIV}\n` +
        `${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> ${w.amount != null ? escapeHtml(String(w.amount)) : '-'}\n` +
        `${ANIM.CARD} <b>គណនី:</b> ${escapeHtml(w.account || '-')}\n` +
        `${ANIM.CALENDAR} <b>ថ្ងៃស្នើសុំ:</b> <code>${fmtDate(w.createdAt)}</code>\n` +
        `${ANIM.CALENDAR} <b>ថ្ងៃសម្រេច:</b> <code>${w.decidedAt ? fmtDate(w.decidedAt) : '-'}</code>\n` +
        `${ANIM.OFFICER} <b>ដំណើរការដោយ:</b> ${escapeHtml(w.decidedBy || '-')}\n` +
        `${ANIM.CROSS} <b>មូលហេតុបដិសេធ:</b> ${escapeHtml(w.rejectReason || '-')}\n`;
    }
    text += `${DIV}`;

    const reply_markup = { inline_keyboard: [] };
    // Approve / reject actions for a PENDING withdrawal
    if (w.status === 'pending') {
      reply_markup.inline_keyboard.push([
        btn('✅ ផ្ទេររួចរាល់ (Done)', `ap_wdok_${w.id}`, 'success', BTN_ICONS.SUCCESS),
        btn('❌ បដិសេធ (Cancel)', `ap_wdno_${w.id}`, 'danger', BTN_ICONS.CANCEL)
      ]);
    }
    if (w.photoFileId) {
      reply_markup.inline_keyboard.push([btn('🖼 មើលរូបភាពបញ្ជាក់ (QR)', `ap_wdphoto_${w.id}`, 'primary', BTN_ICONS.CAMERA)]);
    }
    if (!expanded) {
      reply_markup.inline_keyboard.push([btn('📄 មើលបន្ថែម', `ap_wdmore_${w.id}`, 'success', BTN_ICONS.CHART)]);
    }
    reply_markup.inline_keyboard.push([btn('🔙 ត្រឡប់ទៅដកប្រាក់', 'ap_wdf_all_0', 'primary', BTN_ICONS.BACK)]);
    reply_markup.inline_keyboard.push([btn('🏠 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.DIAMOND)]);
    return showScreen(ctx, { text, reply_markup });
  }

  async function showWithdrawPhoto(ctx, id) {
    const w = store.findWithdrawal(id);
    if (!w || !w.photoFileId) {
      await ack(ctx, '⚠️ គ្មានរូបភាពបញ្ជាក់ទេ។');
      return;
    }
    await ack(ctx);
    const caption =
      `${ANIM.CAMERA} <b>រូបភាពបញ្ជាក់ដកប្រាក់</b> — <code>${escapeHtml(w.id)}</code>\n` +
      `${ANIM.USER} ${escapeHtml(w.name || '')} ${escapeHtml(w.username || '')}\n` +
      `${ANIM.SHIELD} កូដ: <code>${escapeHtml(w.code || '-')}</code>`;
    const reply_markup = {
      inline_keyboard: [[btn('🔙 ត្រឡប់ទៅព័ត៌មានលម្អិត', `ap_wdv_${w.id}`, 'primary', BTN_ICONS.BACK)]]
    };
    return showScreen(ctx, { text: caption, photo: w.photoFileId, reply_markup });
  }

  function promptWithdrawSearch(ctx) {
    userStates.set(ctx.from.id, { state: 'AP_WITHDRAW_SEARCH' });
    const text =
      `${ANIM.CHART} <b>ស្វែងរកការដកប្រាក់</b>\n${DIV}\n` +
      `${ANIM.CHAT} <b>សូមផ្ញើលេខដកប្រាក់, លេខ Telegram ID ឬឈ្មោះអ្នកប្រើ៖</b>`;
    const reply_markup = { inline_keyboard: [[btn('🔙 ត្រឡប់ក្រោយ', 'ap_wdf_all_0', 'primary', BTN_ICONS.BACK)]] };
    return showScreen(ctx, { text, reply_markup });
  }

  async function doWithdrawSearch(ctx, text) {
    await ctx.deleteMessage().catch(() => { });
    const q = String(text || '').trim();
    const qClean = q.replace(/^@/, '').toLowerCase();
    const list = store.getWithdrawals();
    const matches = list.filter(w =>
      String(w.id).toLowerCase() === q.toLowerCase() ||
      String(w.userId) === q ||
      String(w.username || '').replace(/^@/, '').toLowerCase() === qClean ||
      String(w.code || '') === q
    );
    userStates.delete(ctx.from.id);
    if (matches.length === 0) {
      await showScreen(ctx, {
        text: `${ANIM.WARN} <b>រកមិនឃើញការដកប្រាក់សម្រាប់</b> <code>${escapeHtml(q)}</code>។`,
        reply_markup: {
          inline_keyboard: [
            [btn('🔁 ព្យាយាមម្តងទៀត', 'ap_wd_search', 'primary', BTN_ICONS.REFRESH)],
            [btn('🔙 ត្រឡប់ក្រោយ', 'ap_wdf_all_0', 'primary', BTN_ICONS.BACK)]
          ]
        }
      });
      return true;
    }
    if (matches.length === 1) {
      await showWithdrawDetail(ctx, matches[0].id, false);
      return true;
    }
    let t = `${ANIM.WITHDRAW} <b>លទ្ធផលស្វែងរក (${matches.length})</b>\n${DIV}\n`;
    const rows = matches.slice(0, 10).map(m => [btn(`🔎 ${m.id} • ${m.code || ''}`, `ap_wdv_${m.id}`, 'primary')]);
    rows.push([btn('🔙 ត្រឡប់ក្រោយ', 'ap_wdf_all_0', 'primary', BTN_ICONS.BACK)]);
    await showScreen(ctx, { text: t, reply_markup: { inline_keyboard: rows } });
    return true;
  }

  // =========================================================================
  //  APPROVE / REJECT a pending transaction directly from the panel
  //  Works from the persistent store (survives restarts) and also clears the
  //  in-memory request map so the group buttons can't double-process.
  // =========================================================================
  function userBackMarkup() {
    return { inline_keyboard: [[{ text: 'ទៅកាន់ Menu ចម្បង', callback_data: 'back_main', style: 'primary', icon_custom_emoji_id: BTN_ICONS.DIAMOND }]] };
  }

  async function decideTopup(ctx, id, approve) {
    const t = store.findTopup(id);
    if (!t) { await ack(ctx, '⚠️ រកមិនឃើញសំណើ!'); return showTopups(ctx, 'all', 0); }
    if (t.status !== 'paid') { await ack(ctx, '⚠️ សំណើនេះបានដំណើរការរួចហើយ!'); return showTopupDetail(ctx, id, false); }

    const adminName = ctx.from.first_name || 'Admin';
    store.updateTopup(id, {
      status: approve ? 'approved' : 'rejected',
      decidedBy: adminName,
      decidedById: ctx.from.id,
      decidedAt: new Date().toISOString(),
      rejectReason: approve ? '' : 'បដិសេធដោយអ្នកគ្រប់គ្រង (ផ្ទាំងគ្រប់គ្រង)'
    });
    if (topupRequests && topupRequests.delete) topupRequests.delete(String(id));

    const amt = Number(t.amountUsd || 0).toFixed(2);
    const userText = approve
      ? `${ANIM.PARTY} <b>ការបញ្ចូលទឹកប្រាក់ទទួលបានជោគជ័យ (TOPUP SUCCESSFUL)!</b>\n${DIV}\n` +
        `${ANIM.MELBET} <b>ID Melbet:</b> <code>${escapeHtml(t.oneXBetId || '-')}</code>\n` +
        `${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> <code>+$${amt} USD</code>\n` +
        `${ANIM.RECEIPT} <b>លេខវិក្កយបត្រ:</b> <code>${escapeHtml(t.id)}</code>\n${DIV}\n` +
        `${ANIM.SUCCESS} <i>Admin បានបញ្ចូលទឹកប្រាក់ទៅក្នុងគណនី Melbet របស់អ្នករួចរាល់ហើយ! សូមពិនិត្យមើលក្នុងគណនី Melbet របស់អ្នក។ អរគុណ!</i>`
      : `${ANIM.WARN} <b>ការបញ្ចូលទឹកប្រាក់មិនជោគជ័យ (TOPUP FAILED)</b>\n${DIV}\n` +
        `${ANIM.MELBET} <b>ID Melbet:</b> <code>${escapeHtml(t.oneXBetId || '-')}</code>\n` +
        `${ANIM.MONEY} <b>ចំនួនទឹកប្រាក់:</b> <code>$${amt} USD</code>\n${DIV}\n` +
        `${ANIM.CROSS} <i>ប្រព័ន្ធមិនអាចស្វែងរកលេខគណនី ID Melbet របស់អ្នកឃើញទេ! សូមពិនិត្យឡើងវិញ ឬទាក់ទង Admin៖</i>\n` +
        `${ANIM.CHAT} ជំនួយ: ${SUPPORT_USERNAME} (${SUPPORT_LINK})`;
    if (t.chatId) {
      await ctx.telegram.sendMessage(t.chatId, userText, { parse_mode: 'HTML', reply_markup: userBackMarkup() }).catch(() => { });
    }
    await ack(ctx, approve ? '✅ អនុម័តជោគជ័យ!' : '❌ បានបដិសេធ!');
    return showTopupDetail(ctx, id, false);
  }

  async function decideWithdraw(ctx, id, approve) {
    const w = store.findWithdrawal(id);
    if (!w) { await ack(ctx, '⚠️ រកមិនឃើញសំណើ!'); return showWithdrawals(ctx, 'all', 0); }
    if (w.status !== 'pending') { await ack(ctx, '⚠️ សំណើនេះបានដំណើរការរួចហើយ!'); return showWithdrawDetail(ctx, id, false); }

    const adminName = ctx.from.first_name || 'Admin';
    store.updateWithdrawal(id, {
      status: approve ? 'completed' : 'rejected',
      decidedBy: adminName,
      decidedById: ctx.from.id,
      decidedAt: new Date().toISOString(),
      rejectReason: approve ? '' : 'បដិសេធដោយអ្នកគ្រប់គ្រង (ផ្ទាំងគ្រប់គ្រង)'
    });
    if (withdrawRequests && withdrawRequests.delete) withdrawRequests.delete(String(id));

    const userText = approve
      ? `${ANIM.PARTY} <b>ការដកប្រាក់ទទួលបានជោគជ័យ (WITHDRAWAL SUCCESSFUL)!</b>\n${DIV}\n` +
        `${ANIM.SHIELD} <b>Code:</b> <code>${escapeHtml(w.code || '-')}</code>\n` +
        `${ANIM.RECEIPT} <b>Withdraw ID:</b> <code>${escapeHtml(w.id)}</code>\n${DIV}\n` +
        `${ANIM.SUCCESS} <i>Admin បានផ្ទេរប្រាក់ចូលគណនីធនាគាររបស់អ្នករួចរាល់ហើយ! សូមពិនិត្យ Banking App របស់អ្នក។ អរគុណ!</i>`
      : `${ANIM.WARN} <b>ការដកប្រាក់មិនជោគជ័យ (WITHDRAWAL FAILED)</b>\n${DIV}\n` +
        `${ANIM.SHIELD} <b>Code:</b> <code>${escapeHtml(w.code || '-')}</code>\n${DIV}\n` +
        `${ANIM.CROSS} <i>លេខកូដមិនត្រឹមត្រូវ ឬរកមិនឃើញក្នុងប្រព័ន្ធ Melbet ទេ! សូមពិនិត្យ និងព្យាយាមម្តងទៀត ឬទាក់ទង Admin៖</i>\n` +
        `${ANIM.CHAT} ជំនួយ: ${SUPPORT_USERNAME} (${SUPPORT_LINK})`;
    if (w.chatId) {
      await ctx.telegram.sendMessage(w.chatId, userText, { parse_mode: 'HTML', reply_markup: userBackMarkup() }).catch(() => { });
    }
    await ack(ctx, approve ? '✅ ផ្ទេរជោគជ័យ!' : '❌ បានបដិសេធ!');
    return showWithdrawDetail(ctx, id, false);
  }

  // =========================================================================
  //  BOT SETTINGS
  // =========================================================================
  function showSettings(ctx) {
    const s = store.getSettings();
    const topups = store.getTopups();
    const withdrawals = store.getWithdrawals();
    const approvedTopupUsd = topups.filter(t => t.status === 'approved').reduce((a, t) => a + (Number(t.amountUsd) || 0), 0);
    const completedWd = withdrawals.filter(w => w.status === 'completed').length;

    const statusLine = s.maintenance ? '🔴 បិទ (កំពុងថែទាំ)' : '🟢 បើក';
    const text =
      `${ANIM.SHIELD} <b>ការកំណត់ Bot</b>\n` +
      `${DIV}\n` +
      `${ANIM.ID} <b>លេខសម្គាល់អ្នកគ្រប់គ្រង:</b> <code>${escapeHtml(ADMIN_ID)}</code>\n` +
      `${ANIM.DIAMOND} <b>ហាង:</b> <code>${escapeHtml(STORE_NAME || '-')}</code>\n` +
      `${ANIM.REFRESH} <b>អត្រាប្តូរប្រាក់:</b> <code>$1 = ${Number(EXCHANGE_RATE).toLocaleString()} ៛</code>\n` +
      `${ANIM.MEGAPHONE} <b>ឆានែល:</b> ${escapeHtml(CHANNEL_USERNAME || '-')} (<code>${escapeHtml(String(CHANNEL_ID || '-'))}</code>)\n` +
      `${DIV}\n` +
      `${ANIM.USER} <b>អ្នកប្រើប្រាស់ចុះឈ្មោះ:</b> <code>${usersDb.size}</code> នាក់\n` +
      `${ANIM.DEPOSIT} <b>កំណត់ត្រាដាក់ប្រាក់:</b> <code>${topups.length}</code> (អនុម័ត $${approvedTopupUsd.toFixed(2)})\n` +
      `${ANIM.WITHDRAW} <b>កំណត់ត្រាដកប្រាក់:</b> <code>${withdrawals.length}</code> (${completedWd} ជោគជ័យ)\n` +
      `${DIV}\n` +
      `<b>ស្ថានភាព Bot:</b> ${statusLine}\n` +
      `${s.closedAt ? `🔴 <i>បិទចុងក្រោយ:</i> <code>${fmtDate(s.closedAt)}</code>\n` : ''}` +
      `${s.openedAt ? `🟢 <i>បើកចុងក្រោយ:</i> <code>${fmtDate(s.openedAt)}</code>\n` : ''}` +
      `${DIV}`;
    const reply_markup = {
      inline_keyboard: [
        [
          btn('🔴 បិទ Bot', 'ap_close', 'danger', BTN_ICONS.CANCEL),
          btn('🟢 បើក Bot', 'ap_open', 'success', BTN_ICONS.SUCCESS)
        ],
        [btn('🔙 ផ្ទាំងគ្រប់គ្រង', 'ap_home', 'primary', BTN_ICONS.BACK)]
      ]
    };
    return showScreen(ctx, { text, reply_markup });
  }

  // =========================================================================
  //  Admin message input handler (called from index.js middleware)
  // =========================================================================
  async function handleAdminMessage(ctx) {
    const userId = ctx.from?.id;
    if (!userId || !isAdmin(userId)) return false;
    if (!ctx.message) return false;

    const st = userStates.get(userId);
    if (!st || !st.state || !String(st.state).startsWith('AP_')) return false;

    const text = ctx.message.text ? ctx.message.text.trim() : '';
    // Let slash-commands escape any admin input state
    if (text.startsWith('/')) {
      userStates.delete(userId);
      return false;
    }

    try {
      switch (st.state) {
        case 'AP_ANN_BROADCAST':
          return await captureAnnouncementMessage(ctx, 'broadcast', null);
        case 'AP_ANN_ONE_USER':
          return await resolveSingleTarget(ctx, text);
        case 'AP_ANN_ONE_MSG':
          return await captureAnnouncementMessage(ctx, 'single', st.target);
        case 'AP_USER_SEARCH':
          return await doUserSearch(ctx, text);
        case 'AP_TOPUP_SEARCH':
          return await doTopupSearch(ctx, text);
        case 'AP_WITHDRAW_SEARCH':
          return await doWithdrawSearch(ctx, text);
        default:
          return false;
      }
    } catch (err) {
      console.error('[admin_panel] handleAdminMessage error:', err.message);
      return false;
    }
  }

  // =========================================================================
  //  Register commands & callbacks
  // =========================================================================
  bot.command('admin', async (ctx) => {
    await ctx.deleteMessage().catch(() => { });
    if (!(await guardCommand(ctx))) return;
    return openPanel(ctx);
  });

  bot.command('panel', async (ctx) => {
    await ctx.deleteMessage().catch(() => { });
    if (!(await guardCommand(ctx))) return;
    return openPanel(ctx);
  });

  bot.action('ap_home', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return openPanel(ctx); });
  bot.action('ap_exit', async (ctx) => {
    if (!(await guardAction(ctx))) return;
    await ack(ctx);
    userStates.delete(ctx.from.id);
    const user = getUser(ctx.from.id, ctx.from.first_name, ctx.from.username);
    const { text, reply_markup, video } = getMainMenu(user);
    return showScreen(ctx, { text, reply_markup, video });
  });

  // Announcements
  bot.action('ap_ann', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return openAnnouncementMenu(ctx); });
  bot.action('ap_ann_all', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return promptBroadcastMessage(ctx); });
  bot.action('ap_ann_one', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return promptSingleUser(ctx); });
  bot.action('ap_ann_confirm', async (ctx) => { if (!(await guardAction(ctx))) return; return doConfirmSend(ctx); });
  bot.action('ap_ann_edit', async (ctx) => { if (!(await guardAction(ctx))) return; return doEdit(ctx); });
  bot.action('ap_ann_cancel', async (ctx) => { if (!(await guardAction(ctx))) return; return doCancelAnnouncement(ctx); });
  bot.action(/^ap_ann_hist_(\d+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showAnnouncementHistory(ctx, parseInt(ctx.match[1], 10)); });

  // Send message to a specific user (from user detail screen)
  bot.action(/^ap_msg_(\d+)$/, async (ctx) => {
    if (!(await guardAction(ctx))) return;
    await ack(ctx);
    const u = usersDb.get(Number(ctx.match[1]));
    if (!u) return showUserDetail(ctx, ctx.match[1]);
    const target = { userId: u.id, username: u.username || '', displayName: u.name || 'User' };
    userStates.set(ctx.from.id, { state: 'AP_ANN_ONE_MSG', target });
    return showScreen(ctx, {
      text: `${ANIM.CROWN} <b>ផ្ញើសារទៅ</b> ${escapeHtml(target.displayName)} (<code>${target.userId}</code>)\n${DIV}\n${ANIM.DOWN} <b>សូមផ្ញើសារ / មេឌៀ៖</b>`,
      reply_markup: { inline_keyboard: [[btn('❌ បោះបង់', `ap_user_${u.id}_0`, 'danger', BTN_ICONS.CANCEL)]] }
    });
  });

  // Maintenance
  bot.action('ap_close', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return confirmClose(ctx); });
  bot.action('ap_close_yes', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx, '🔴 Bot បានបិទ!'); return doClose(ctx); });
  bot.action('ap_open', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return confirmOpen(ctx); });
  bot.action('ap_open_yes', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx, '🟢 Bot បានបើក!'); return doOpen(ctx); });

  // Settings
  bot.action('ap_settings', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showSettings(ctx); });

  // User management
  bot.action(/^ap_users_p_(\d+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showUsers(ctx, parseInt(ctx.match[1], 10), false); });
  bot.action(/^ap_hist_p_(\d+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showUsers(ctx, parseInt(ctx.match[1], 10), true); });
  bot.action('ap_user_search', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return promptUserSearch(ctx); });
  bot.action(/^ap_user_(\d+)_(\d+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showUserDetail(ctx, ctx.match[1]); });
  bot.action(/^ap_uhist_(\d+)_(\d+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showUserHistory(ctx, ctx.match[1], parseInt(ctx.match[2], 10)); });

  // Top-up history
  bot.action(/^ap_tp_(all|paid|approved|rejected|cancelled)_(\d+)$/, async (ctx) => {
    if (!(await guardAction(ctx))) return; await ack(ctx);
    return showTopups(ctx, ctx.match[1], parseInt(ctx.match[2], 10));
  });
  bot.action('ap_tp_search', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return promptTopupSearch(ctx); });
  bot.action(/^ap_tpv_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showTopupDetail(ctx, ctx.match[1], false); });
  bot.action(/^ap_tpmore_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showTopupDetail(ctx, ctx.match[1], true); });
  bot.action(/^ap_tpok_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; return decideTopup(ctx, ctx.match[1], true); });
  bot.action(/^ap_tpno_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; return decideTopup(ctx, ctx.match[1], false); });

  // Withdraw history
  bot.action(/^ap_wdf_(all|pending|processing|completed|rejected|cancelled)_(\d+)$/, async (ctx) => {
    if (!(await guardAction(ctx))) return; await ack(ctx);
    return showWithdrawals(ctx, ctx.match[1], parseInt(ctx.match[2], 10));
  });
  bot.action('ap_wd_search', async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return promptWithdrawSearch(ctx); });
  bot.action(/^ap_wdv_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showWithdrawDetail(ctx, ctx.match[1], false); });
  bot.action(/^ap_wdmore_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; await ack(ctx); return showWithdrawDetail(ctx, ctx.match[1], true); });
  bot.action(/^ap_wdok_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; return decideWithdraw(ctx, ctx.match[1], true); });
  bot.action(/^ap_wdno_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; return decideWithdraw(ctx, ctx.match[1], false); });
  bot.action(/^ap_wdphoto_(.+)$/, async (ctx) => { if (!(await guardAction(ctx))) return; return showWithdrawPhoto(ctx, ctx.match[1]); });

  console.log(ADMIN_ID_VALID
    ? `🛡  Admin Panel ACTIVE — authorized Admin ID: ${ADMIN_ID}`
    : '🛡  Admin Panel DISABLED — ADMIN_ID missing/invalid (fail-secure)');

  // Public surface used by index.js
  return {
    handleAdminMessage,
    showClosedScreen,
    isBotClosed: () => store.isBotClosed(),
    openPanel,
    openAnnouncementMenu
  };
}

module.exports = { setupAdminPanel };
