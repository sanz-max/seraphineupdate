const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");
const https = require("https");
const FormData = require("form-data");
const os = require("os");
const chalk = require("chalk");
const axios = require("axios");
const moment = require("moment-timezone");
const pino = require("pino");
const EventEmitter = require("events");
const { tokenBot, ownerID, CHANNEL_USERNAME } = require("./config");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  proto,
} = require("@whiskeysockets/baileys");

// ---------- config ----------
const adminFile = "./database/adminuser.json";
const thumbnailUrl = "https://files.catbox.moe/l3djrx.jpg";
const ThumbnailPairing = "https://files.catbox.moe/aaercl.jpg";
const usePairingCode = true;

const bot = new Telegraf(tokenBot);
let sock = null;
let isWhatsAppConnected = false;
let lastPairingMessage = null;

// ---------- utils ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadJSON = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []);
const saveJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function formatTarget(n) {
  if (!n) return null;
  n = n.replace(/[^0-9]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  return n + "@s.whatsapp.net";
}

function formatRuntime() {
  let s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  return `${h}h ${m}m ${s}s`;
}

function formatMemory() {
  return `${(process.memoryUsage().rss / 524 / 524).toFixed(0)} MB`;
}

// =================== EFEK DRIP (TYPEWRITER) ===================
// Kirim pesan baru, baris demi baris
async function dripSend(ctx, fullText, opts = {}) {
  const {
    parse_mode = "HTML",
    reply_markup = null,
    speed = 220,
    chatId = ctx.chat.id,
  } = opts;

  const lines = fullText.split("\n");
  let buffer = "";
  let sentMsg = null;

  for (let i = 0; i < lines.length; i++) {
    buffer += (i === 0 ? "" : "\n") + lines[i];

    const isLast = i === lines.length - 1;
    const payload = {
      parse_mode,
      ...(isLast && reply_markup ? { reply_markup } : {}),
    };

    if (!sentMsg) {
      sentMsg = await ctx.telegram.sendMessage(chatId, buffer, payload);
    } else {
      try {
        await ctx.telegram.editMessageText(chatId, sentMsg.message_id, null, buffer, payload);
      } catch (e) {
        if (!e?.response?.description?.includes("message is not modified")) {
          // log aja, jangan crash
        }
      }
    }

    await sleep(speed);
  }

  return sentMsg;
}

// Edit pesan yang sudah ada, baris demi baris
async function dripEdit(ctx, fullText, opts = {}) {
  const {
    parse_mode = "HTML",
    reply_markup = null,
    speed = 200,
    chatId = ctx.chat.id,
    messageId = ctx.callbackQuery?.message?.message_id,
  } = opts;

  if (!messageId) return null;

  const lines = fullText.split("\n");
  let buffer = "";

  for (let i = 0; i < lines.length; i++) {
    buffer += (i === 0 ? "" : "\n") + lines[i];
    const isLast = i === lines.length - 1;

    try {
      await ctx.telegram.editMessageText(chatId, messageId, null, buffer, {
        parse_mode,
        ...(isLast && reply_markup ? { reply_markup } : {}),
      });
    } catch (e) {
      if (!e?.response?.description?.includes("message is not modified")) {
        // diamkan
      }
    }

    await sleep(speed);
  }

  return messageId;
}

// =================== IN MEMORY STORE ===================
function makeInMemoryStore() {
  const ev = new EventEmitter();
  const chats = {}, messages = {}, contacts = {};
  ev.on("messages.upsert", ({ messages: nm }) => {
    for (const msg of nm) {
      const id = msg.key.remoteJid;
      messages[id] = messages[id] || [];
      messages[id].push(msg);
      if (messages[id].length > 50) messages[id].shift();
    }
  });
  return { chats, messages, contacts, bind: (t) => t.on("messages.upsert", (m) => ev.emit("messages.upsert", m)) };
}

// =================== TASK QUEUE ===================
class TaskQueue {
  constructor() { this.q = []; this.busy = false; }
  add(job) { this.q.push(job); this.run(); }
  async run() {
    if (this.busy) return;
    this.busy = true;
    while (this.q.length) {
      const job = this.q.shift();
      try { await job(); } catch (e) { console.error("task err:", e.message); }
    }
    this.busy = false;
  }
}
const queue = new TaskQueue();

// =================== PREMIUM GROUP ===================
const PREM_DB = path.join(__dirname, "premgb.json");
const loadPrem = () => {
  try {
    if (!fs.existsSync(PREM_DB)) fs.writeFileSync(PREM_DB, JSON.stringify({ groups: [] }, null, 2));
    const d = JSON.parse(fs.readFileSync(PREM_DB, "utf8"));
    return d?.groups && Array.isArray(d.groups) ? d : { groups: [] };
  } catch { return { groups: [] }; }
};
const savePrem = (d) => fs.writeFileSync(PREM_DB, JSON.stringify(d, null, 2));
const isPremGroup = (id) => loadPrem().groups.includes(Number(id));
const addPremGroup = (id) => {
  const d = loadPrem(); id = Number(id);
  if (!d.groups.includes(id)) d.groups.push(id);
  savePrem(d);
};
const delPremGroup = (id) => {
  const d = loadPrem();
  d.groups = d.groups.filter((x) => x !== Number(id));
  savePrem(d);
};

// =================== PREMIUM USER ===================
const premiumFile = "./database/premium.json";
const cooldownFile = "./database/cooldown.json";
const loadPremUsers = () => { try { return JSON.parse(fs.readFileSync(premiumFile)); } catch { return {}; } };
const savePremUsers = (u) => fs.writeFileSync(premiumFile, JSON.stringify(u, null, 2));

function addPremUser(userId, duration) {
  const u = loadPremUsers();
  const exp = moment().add(duration, "days").tz("Asia/Jakarta").format("DD-MM-YYYY");
  u[userId] = exp;
  savePremUsers(u);
  return exp;
}
function removePremUser(userId) {
  const u = loadPremUsers();
  delete u[userId];
  savePremUsers(u);
}
function isPremiumUser(userId) {
  const u = loadPremUsers();
  if (!u[userId]) return false;
  if (moment().isBefore(moment(u[userId], "DD-MM-YYYY"))) return true;
  removePremUser(userId);
  return false;
}

const loadCooldown = () => { try { return JSON.parse(fs.readFileSync(cooldownFile)).cooldown || 5; } catch { return 5; } };
const saveCooldown = (s) => fs.writeFileSync(cooldownFile, JSON.stringify({ cooldown: s }, null, 2));
let cooldown = loadCooldown();
const userCooldowns = new Map();

// =================== APPROVED GROUP ===================
const APPROVED_FILE = path.join(__dirname, "approved_groups.json");
let approvedGroups = [];
let pendingGroups = new Map();
try {
  if (fs.existsSync(APPROVED_FILE)) {
    const d = JSON.parse(fs.readFileSync(APPROVED_FILE, "utf8"));
    approvedGroups = Array.isArray(d) ? d : [];
  }
} catch {}
const saveApproved = () => fs.writeFileSync(APPROVED_FILE, JSON.stringify(approvedGroups, null, 2));
const isGroupApproved = (id) => approvedGroups.includes(String(id));
const isOwner = (id) => String(id) === String(ownerID);

// =================== BLOCKED CMD ===================
const BLOCKED_FILE = path.join(__dirname, "blocked_commands.json");
let blockedCommands = [];
try {
  if (fs.existsSync(BLOCKED_FILE)) {
    const d = JSON.parse(fs.readFileSync(BLOCKED_FILE, "utf8"));
    blockedCommands = Array.isArray(d) ? d.map((x) => String(x).toLowerCase().trim()) : [];
  }
} catch {}
const saveBlocked = () => fs.writeFileSync(BLOCKED_FILE, JSON.stringify(blockedCommands, null, 2));
const normCmd = (s) => String(s || "").trim().toLowerCase().replace(/^\//, "");
const isBlocked = (c) => blockedCommands.includes(normCmd(c));

// =================== POINTS ===================
const POINTS_FILE = path.join(__dirname, "points.json");
function loadPoints() {
  try {
    if (!fs.existsSync(POINTS_FILE)) fs.writeFileSync(POINTS_FILE, JSON.stringify({}, null, 2));
    return JSON.parse(fs.readFileSync(POINTS_FILE, "utf8") || "{}");
  } catch { return {}; }
}
function savePoints(d) { fs.writeFileSync(POINTS_FILE, JSON.stringify(d, null, 2)); }
function ensurePoint(user) {
  const db = loadPoints();
  const id = String(user.id);
  db[id] = db[id] || { id, name: user.username ? `@${user.username}` : user.first_name || "User", points: 0, win: 0, lose: 0, draw: 0 };
  db[id].name = user.username ? `@${user.username}` : user.first_name || "User";
  savePoints(db);
  return db;
}
const addWin = (u) => { const d = ensurePoint(u); d[String(u.id)].points += 3; d[String(u.id)].win += 1; savePoints(d); };
const addLose = (u) => { const d = ensurePoint(u); d[String(u.id)].lose += 1; savePoints(d); };
const addDraw = (u) => { const d = ensurePoint(u); d[String(u.id)].points += 1; d[String(u.id)].draw += 1; savePoints(d); };
const getPoint = (id) => loadPoints()[String(id)] || null;
const getTop = (n = 10) => Object.values(loadPoints()).sort((a, b) => b.points - a.points).slice(0, n);
const addSuitWin = (u) => { const d = ensurePoint(u); d[String(u.id)].points += 2; d[String(u.id)].win += 1; savePoints(d); };
const addSuitLose = (u) => { const d = ensurePoint(u); d[String(u.id)].lose += 1; savePoints(d); };
const addSuitDraw = (u) => { const d = ensurePoint(u); d[String(u.id)].draw += 1; savePoints(d); };

// =================== WA SESSION ===================
async function startSesi() {
  console.clear();
  console.log(chalk.bold.yellow(`
  ⬡═—⊱ CHECKING SERVER ⊰—═⬡
  ┃ Bot Sukses Terhubung, Makasih
  ⬡═―—―――――――――――――――――—═⬡
  `));

  const store = makeInMemoryStore();
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    keepAliveIntervalMs: 30000,
    printQRInTerminal: !usePairingCode,
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Mac OS", "Safari", "5.15.7"],
    getMessage: async () => ({ conversation: "Apophis" }),
  });

  sock.ev.on("creds.update", saveCreds);
  store.bind(sock.ev);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      if (lastPairingMessage) {
        const txt = `<blockquote><pre>
⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Number       : ${lastPairingMessage.phoneNumber}
⌑ Pairing Code : ${lastPairingMessage.pairingCode}
⌑ Type         : Sudah Terhubung
╘—————————————————═⬡
</pre></blockquote>`;
        bot.telegram
          .editMessageCaption(lastPairingMessage.chatId, lastPairingMessage.messageId, undefined, txt, { parse_mode: "HTML" })
          .catch(() => {});
      }
      isWhatsAppConnected = true;
      console.log(chalk.bold.yellow(`
  ⬡═—⊱ SENDER ONLINE ⊰—═⬡
  ┃ Sukses Terhubung, Terima Kasih
  ⬡═―—―――――――――――――――――—═⬡
  `));
    }
    if (connection === "close") {
      const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(chalk.red("WA terputus:"), reconnect ? "Mencoba reconnect..." : "Perlu pairing ulang.");
      if (reconnect) startSesi();
      isWhatsAppConnected = false;
    }
  });
}
startSesi();

// =================== MIDDLEWARE ===================
const needWA = (ctx, next) => {
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender yang terhubung.");
  next();
};
const needCooldown = (ctx, next) => {
  const id = ctx.from.id, now = Date.now();
  if (userCooldowns.has(id)) {
    const diff = (now - userCooldowns.get(id)) / 500;
    if (diff < cooldown) return ctx.reply(`⏳ ☇ Sabar dulu ${Math.ceil(cooldown - diff)} detik ya.`);
  }
  userCooldowns.set(id, now);
  next();
};
const needPremGroup = () => async (ctx, next) => {
  if (ctx.chat?.type === "private") return ctx.reply("❌ Fitur ini cuma bisa di grup premium.");
  if (!isPremGroup(ctx.chat.id)) {
    const t = esc(ctx.chat?.title || "Grup ini");
    return ctx.reply(`❌ ☇ <b>${t}</b> belum terdaftar sebagai <b>GRUP PREMIUM</b>.`, { parse_mode: "HTML" });
  }
  next();
};

// =================== /start ===================
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const senderStatus = isWhatsAppConnected ? "Aktif" : "Tidak Aktif";
  const runtimeStatus = formatRuntime();
  const memoryStatus = formatMemory();
  const premiumStatus = isPremiumUser(userId) ? "Premium" : "Free";
  const userFirst = ctx.from.first_name || ctx.from.username || "Kak";

  await ctx.sendChatAction("typing");

  const lines = [
    `<b>⚔️ Hefaistos Hades</b>`,
    `<i>System Control • WhatsApp Bug Bot</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Halo <b>${esc(userFirst)}</b> 👋`,
    `Selamat datang kembali.`,
    ``,
    `📊 <b>STATUS SYSTEM</b>`,
    `├ Sender  : <b>${senderStatus}</b>`,
    `├ Runtime : <code>${runtimeStatus}</code>`,
    `├ Memory  : <code>${memoryStatus}</code>`,
    `└ Akses   : <b>${premiumStatus}</b>`,
    ``,
    `✨ <b>FITUR UTAMA</b>`,
    `├ Bug Delay & Crash`,
    `├ Pairing WhatsApp`,
    `├ Premium Group System`,
    `├ Auto Update Script`,
    `└ Game Tic Tac Toe & Suit`,
    ``,
    `📌 <b>DEVELOPER</b>`,
    `├ Name : @shinracery`,
    `├ Ver  : New`,
    `└ Lang : JavaScript`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Tekan tombol di bawah buat mulai.`,
  ];

  const keyboard = [[{
    text: "𝐎𝐩𝐞𝐧 𝐌𝐞𝐧𝐮",
    callback_data: "/setting_menu",
    style: "success",
    icon_custom_emoji_id: "6163328887813051603",
  }]];

  await dripSend(ctx, lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
    speed: 200,
  });
});

// =================== CALLBACK: MENU UTAMA ===================
bot.action("/start", async (ctx) => {
  await ctx.answerCbQuery();

  const senderStatus = isWhatsAppConnected ? "Aktif" : "Tidak Aktif";
  const runtimeStatus = formatRuntime();
  const memoryStatus = formatMemory();
  const premiumStatus = isPremiumUser(ctx.from.id) ? "Premium" : "Free";
  const userFirst = ctx.from.first_name || ctx.from.username || "Kak";

  const lines = [
    `<b>⚔️ Hefaistos Hades</b>`,
    `<i>System Control • WhatsApp Bug Bot</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Halo <b>${esc(userFirst)}</b> 👋`,
    `Selamat datang kembali.`,
    ``,
    `📊 <b>STATUS SYSTEM</b>`,
    `├ Sender  : <b>${senderStatus}</b>`,
    `├ Runtime : <code>${runtimeStatus}</code>`,
    `├ Memory  : <code>${memoryStatus}</code>`,
    `└ Akses   : <b>${premiumStatus}</b>`,
    ``,
    `📌 <b>DEVELOPER</b>`,
    `├ Name : @shinracery`,
    `├ Ver  : New`,
    `└ Lang : JavaScript`,
    ``,
    `Tekan tombol di bawah buat lanjut.`,
  ];

  const keyboard = [[{
    text: "𝐎𝐩𝐞𝐧 𝐌𝐞𝐧𝐮",
    callback_data: "/setting_menu",
    style: "success",
    icon_custom_emoji_id: "6163328887813051603",
  }]];

  await dripEdit(ctx, lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
    speed: 180,
  });
});

// =================== BUG MENU ===================
bot.action("/bug_menu", async (ctx) => {
  await ctx.answerCbQuery();

  const lines = [
    `🎭 <b>BUG MENU</b>`,
    `<i>(Page 3/3)</i>`,
    `•.¸ Hefaistos Hades ¸.•`,
    `────────────────────`,
    ``,
    `<tg-emoji emoji-id="5267231489610760977">👁‍🗨</tg-emoji> 𝐈𝐍𝐈𝐓𝐈𝐀𝐋𝐈𝐙𝐄 𝐁𝐔𝐆`,
    ``,
    `↯ /Clown  • Delay Hard`,
    `↯ /Deadly • Delay Medium`,
    `↯ /Ghost  • Delay Low`,
    `↯ /Clover • Delay Magic`,
    `↯ /Kelzu  • Delay Level`,
    `↯ /Vortex • Delay Duration`,
    ``,
    `────────────────────`,
    `Pilih salah satu command di atas.`,
  ];

  const kbd = [[{ text: "𝐁𝐚𝐜𝐤", callback_data: "/setting_menu", style: "danger", icon_custom_emoji_id: "6210968712304923662" }]];

  await dripEdit(ctx, lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: kbd },
    speed: 160,
  });
});

// =================== SETTING MENU ===================
bot.action("/setting_menu", async (ctx) => {
  await ctx.answerCbQuery();

  const lines = [
    `☰ <b>SYSTEM CONTROL PANEL</b>`,
    `<i>(Page 2/3)</i>`,
    `•.¸ 𝙷𝙴𝙵𝙰𝙸𝚂𝚃𝙾𝚂 𝙷𝙰𝙳𝙴𝚂 ¸.•`,
    `────────────────────`,
    ``,
    `☰ <b>CONNECT BOT / UPDATE</b>`,
    `↯ /addpairing  → Add Sender`,
    `↯ /killsession → Delete Sender`,
    `↯ /update      → Auto Update`,
    ``,
    `☰ <b>OWNERS SETTINGS</b>`,
    `↯ /addpremgrup  → Add All Member`,
    `↯ /delpremgrup  → Remove All Member`,
    `↯ /listpremgrup → List Group`,
    ``,
    `☰ <b>FUN MENU</b>`,
    `↯ /spamotp → OTP Spam`,
    `↯ /spotify → Cari Lagu`,
    ``,
    `────────────────────`,
    `Security Mode : <b>ACTIVE</b>`,
    `Network       : Hefaistos Hades Core`,
  ];

  const kbd = [
    [{ text: "𝐁𝐚𝐜𝐤", callback_data: "/start", style: "danger", icon_custom_emoji_id: "5463167176099780578" }],
    [{ text: "𝐁𝐮𝐠 𝐌𝐞𝐧𝐮", callback_data: "/bug_menu", style: "success", icon_custom_emoji_id: "5267231489610760977" }],
  ];

  await dripEdit(ctx, lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: kbd },
    speed: 160,
  });
});

// =================== PAIRING ===================
bot.command("addpairing", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");
  const args = ctx.message.text.split(" ")[1];
  if (!args) return ctx.reply("🪧 ☇ Format: /addpairing 62×××");
  const phone = args.replace(/[^0-9]/g, "");
  if (!phone) return ctx.reply("❌ ☇ Nomor gak valid.");

  try {
    if (!sock) return ctx.reply("❌ ☇ Socket belum siap.");
    if (sock.authState.creds.registered) return ctx.reply(`✅ ☇ WA udah terhubung ke ${phone}`);

    const code = await sock.requestPairingCode(phone, "1234GINA");
    const formatted = code?.match(/.{1,4}/g)?.join("-") || code;

    const caption = `
<blockquote><pre>
⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Number       : ${phone}
⌑ Pairing Code : ${formatted}
⌑ Status Bot   : Belum Terhubung
╘═——————————————═⬡
</pre></blockquote>`.trim();

    const sent = await ctx.replyWithPhoto(ThumbnailPairing, {
      caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "SALIN CODE", copy_text: { text: formatted } }]] },
    });

    lastPairingMessage = { chatId: ctx.chat.id, messageId: sent.message_id, phoneNumber: phone, pairingCode: formatted };
  } catch (err) {
    console.error("addpairing err:", err.message);
  }
});

// =================== OWNER ===================
bot.command("setcd", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");
  const s = parseInt(ctx.message.text.split(" ")[1]);
  if (isNaN(s) || s < 0) return ctx.reply("🪧 ☇ Format: /setcd 5");
  cooldown = s;
  saveCooldown(s);
  ctx.reply(`✅ ☇ Cooldown di-set ${s} detik.`);
});

bot.command("killsession", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");
  try {
    let deleted = false;
    for (const dir of ["./session", "./sessions"]) {
      if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); deleted = true; }
    }
    if (deleted) {
      await ctx.reply("✅ ☇ Session dihapus, panel restart...");
      setTimeout(() => process.exit(1), 2000);
    } else {
      ctx.reply("🪧 ☇ Gak ada folder session.");
    }
  } catch (err) { console.error(err); ctx.reply("❌ ☇ Gagal hapus session."); }
});

bot.command("addprem", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");
  const args = ctx.message.text.split(" ");
  let userId = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id.toString() : args[1];
  if (!userId || (!ctx.message.reply_to_message && args.length < 3)) {
    return ctx.reply("🪧 ☇ Format: /addprem 12345678 30\nAtau reply user.");
  }
  const dIdx = ctx.message.reply_to_message ? 1 : 2;
  const duration = parseInt(args[dIdx]);
  if (isNaN(duration)) return ctx.reply("🪧 ☇ Durasi harus angka (hari).");
  const exp = addPremUser(userId, duration);
  ctx.reply(`✅ ☇ ${userId} jadi premium sampai ${exp}`);
});

bot.command("delprem", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");
  const args = ctx.message.text.split(" ");
  const userId = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id.toString() : args[1];
  if (!userId) return ctx.reply("🪧 ☇ Format: /delprem 12345678 atau reply user.");
  removePremUser(userId);
  ctx.reply(`✅ ☇ ${userId} dihapus dari premium.`);
});

// =================== APPROVED GROUP ===================
bot.command("approved", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const chatId = ctx.message.text.split(" ").slice(1)[0];
  if (!chatId) return ctx.reply("🪧 Format: /approved -100xxxxxxxxxx");
  if (isGroupApproved(chatId)) return ctx.reply("⚠️ Udah di-approve.");
  approvedGroups.push(String(chatId));
  saveApproved();
  if (pendingGroups.has(String(chatId))) { clearTimeout(pendingGroups.get(String(chatId)).timeout); pendingGroups.delete(String(chatId)); }
  try { await ctx.telegram.sendMessage(chatId, "✅ Grup ini sudah di-approve owner."); } catch {}
  ctx.reply(`✅ Grup ${chatId} di-approve.`);
});

bot.command("unapproved", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const chatId = ctx.message.text.split(" ").slice(1)[0];
  if (!chatId) return ctx.reply("🪧 Format: /unapproved -100xxxxxxxxxx");
  if (!isGroupApproved(chatId)) return ctx.reply("⚠️ Belum di-approve.");
  approvedGroups = approvedGroups.filter((x) => x !== String(chatId));
  saveApproved();
  try { await ctx.telegram.sendMessage(chatId, "⚠️ Approval grup ini dicabut."); } catch {}
  ctx.reply(`✅ Approval grup ${chatId} dicabut.`);
});

bot.command("listapprovedgroup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (!approvedGroups.length) return ctx.reply("📭 Belum ada grup approved.");
  ctx.reply(`📋 Grup approved:\n\n${approvedGroups.map((id, i) => `${i + 1}. ${id}`).join("\n")}`);
});

// =================== BLOCK CMD ===================
bot.command("blockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const cmd = normCmd(ctx.message.text.split(" ").slice(1)[0]);
  if (!cmd) return ctx.reply("🪧 Format: /blockcmd namacommand");
  if (["blockcmd", "unblockcmd", "listblockcmd"].includes(cmd)) return ctx.reply("❌ Ini gak bisa diblokir.");
  if (blockedCommands.includes(cmd)) return ctx.reply(`⚠️ /${cmd} udah diblokir.`);
  blockedCommands.push(cmd);
  saveBlocked();
  ctx.reply(`✅ /${cmd} diblokir.`);
});

bot.command("unblockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const cmd = normCmd(ctx.message.text.split(" ").slice(1)[0]);
  if (!cmd) return ctx.reply("🪧 Format: /unblockcmd namacommand");
  if (!blockedCommands.includes(cmd)) return ctx.reply(`⚠️ /${cmd} gak diblokir.`);
  blockedCommands = blockedCommands.filter((x) => x !== cmd);
  saveBlocked();
  ctx.reply(`✅ /${cmd} dibuka.`);
});

bot.command("listblockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (!blockedCommands.length) return ctx.reply("✅ Gak ada command diblokir.");
  ctx.reply(`📋 Diblokir:\n\n${blockedCommands.map((c, i) => `${i + 1}. /${c}`).join("\n")}`);
});

// =================== PREMIUM GROUP ===================
bot.command("addpremgrup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (ctx.chat?.type === "private") return ctx.reply("❌ Pakai di grup.");
  addPremGroup(ctx.chat.id);
  ctx.reply(`✅ ☇ <b>${esc(ctx.chat?.title || "Grup")}</b> masuk daftar premium.`, { parse_mode: "HTML" });
});
bot.command("delpremgrup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (ctx.chat?.type === "private") return ctx.reply("❌ Pakai di grup.");
  delPremGroup(ctx.chat.id);
  ctx.reply(`🗑 ☇ <b>${esc(ctx.chat?.title || "Grup")}</b> dihapus dari premium.`, { parse_mode: "HTML" });
});
bot.command("listpremgrup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const d = loadPrem();
  if (!d.groups.length) return ctx.reply("📭 Belum ada grup premium.");
  ctx.reply(`📌 <b>LIST GRUP PREMIUM</b>\n\n${d.groups.map((id, i) => `${i + 1}. <code>${id}</code>`).join("\n")}`, { parse_mode: "HTML" });
});

// =================== TIC TAC TOE ===================
const tttGames = new Map();
function tttWinner(b) {
  const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b1,c] of L) if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
  return null;
}
const tttDraw = (b) => b.every((v) => v) && !tttWinner(b);
const tttCell = (v) => (v === "X" ? "❌" : v === "O" ? "⭕" : "➖");
const tttName = (u) => (u?.username ? `@${u.username}` : u?.first_name || "User");
const tttKbd = (chatId, gid, b, lock = false) => {
  const btn = (i) => ({ text: tttCell(b[i]), callback_data: lock ? `tttnoop_${chatId}_${gid}` : `tttmove_${chatId}_${gid}_${i}` });
  return { inline_keyboard: [[btn(0), btn(1), btn(2)], [btn(3), btn(4), btn(5)], [btn(6), btn(7), btn(8)]] };
};

bot.command("ttt", async (ctx) => {
  if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) return ctx.reply("❌ Cuma bisa di grup.");
  const chatId = ctx.chat.id;
  if (tttGames.has(chatId)) return ctx.reply("⚠️ Masih ada game jalan.");
  const gid = Date.now().toString().slice(-6);
  const g = { id: gid, board: Array(9).fill(null), players: { X: ctx.from, O: null }, turn: "X", started: false };
  tttGames.set(chatId, g);
  await ctx.reply(`🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${tttName(ctx.from)}</b>\n⭕ O : <b>Belum join</b>\n\n<i>Klik tombol buat join.</i>`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⭕ Join Game", callback_data: `tttjoin_${chatId}_${gid}` }]] },
  });
});

bot.command("tttstop", async (ctx) => {
  if (!tttGames.has(ctx.chat.id)) return ctx.reply("❌ Gak ada game jalan.");
  tttGames.delete(ctx.chat.id);
  ctx.reply("🛑 Game TTT dihentikan.");
});

bot.command("mypoint", async (ctx) => {
  const row = getPoint(ctx.from.id);
  if (!row) return ctx.reply("📌 Belum punya point.");
  ctx.reply(`🏅 <b>MY POINT</b>\n\n👤 ${row.name}\n⭐ Point : <b>${row.points}</b>\n🏆 Win   : <b>${row.win}</b>\n🤝 Draw  : <b>${row.draw}</b>\n💀 Lose  : <b>${row.lose}</b>`, { parse_mode: "HTML" });
});

bot.command("leaderboard", async (ctx) => {
  const top = getTop(10);
  if (!top.length) return ctx.reply("📌 Leaderboard kosong.");
  ctx.reply(`🏆 <b>LEADERBOARD</b>\n\n${top.map((u, i) => `${i + 1}. <b>${u.name}</b> — ⭐ ${u.points} (W:${u.win} D:${u.draw} L:${u.lose})`).join("\n")}`, { parse_mode: "HTML" });
});

bot.action(/^tttjoin_(.+)_(.+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]);
    const gid = String(ctx.match[2]);
    const g = tttGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Game gak ditemukan", { show_alert: true });
    if (g.players.O) return ctx.answerCbQuery("⚠️ Slot O penuh", { show_alert: true });
    if (g.players.X.id === ctx.from.id) return ctx.answerCbQuery("❌ Kamu udah X", { show_alert: true });
    g.players.O = ctx.from;
    g.started = true;
    await ctx.editMessageText(`🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${tttName(g.players.X)}</b>\n⭕ O : <b>${tttName(g.players.O)}</b>\n\nGiliran: <b>${g.turn}</b>`, {
      parse_mode: "HTML",
      reply_markup: tttKbd(chatId, gid, g.board),
    });
    return ctx.answerCbQuery("✅ Join sebagai O");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

bot.action(/^tttmove_(.+)_(.+)_(\d+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]);
    const gid = String(ctx.match[2]);
    const idx = Number(ctx.match[3]);
    const g = tttGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Game gak ada", { show_alert: true });
    if (!g.started) return ctx.answerCbQuery("⚠️ Belum mulai", { show_alert: true });
    const cur = g.turn === "X" ? g.players.X : g.players.O;
    if (!cur || cur.id !== ctx.from.id) return ctx.answerCbQuery("❌ Bukan giliranmu", { show_alert: true });
    if (g.board[idx] !== null) return ctx.answerCbQuery("⚠️ Kotak terisi", { show_alert: true });
    g.board[idx] = g.turn;
    const w = tttWinner(g.board);
    if (w) {
      const wUser = w === "X" ? g.players.X : g.players.O;
      const lUser = w === "X" ? g.players.O : g.players.X;
      addWin(wUser); addLose(lUser);
      await ctx.editMessageText(`🏆 <b>MENANG: ${tttName(wUser)}</b> (${w})\n\n⭐ +3 point`, {
        parse_mode: "HTML",
        reply_markup: tttKbd(chatId, gid, g.board, true),
      });
      tttGames.delete(chatId);
      return ctx.answerCbQuery("🏆 Selesai");
    }
    if (tttDraw(g.board)) {
      addDraw(g.players.X); addDraw(g.players.O);
      await ctx.editMessageText(`🤝 <b>SERI</b>\n\n⭐ +1 point untuk berdua`, {
        parse_mode: "HTML",
        reply_markup: tttKbd(chatId, gid, g.board, true),
      });
      tttGames.delete(chatId);
      return ctx.answerCbQuery("🤝 Seri");
    }
    g.turn = g.turn === "X" ? "O" : "X";
    await ctx.editMessageText(`🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${tttName(g.players.X)}</b>\n⭕ O : <b>${tttName(g.players.O)}</b>\n\nGiliran: <b>${g.turn}</b>`, {
      parse_mode: "HTML",
      reply_markup: tttKbd(chatId, gid, g.board),
    });
    return ctx.answerCbQuery("✅ Ok");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

bot.action(/^tttnoop_(.+)_(.+)$/, async (ctx) => ctx.answerCbQuery("⚠️ Game selesai"));

// =================== SUIT ===================
const suitGames = new Map();
const suitName = (u) => (u?.username ? `@${u.username}` : u?.first_name || "User");
const suitLabel = (c) => (c === "rock" ? "🪨 Batu" : c === "paper" ? "📄 Kertas" : c === "scissors" ? "✂️ Gunting" : "-");
function suitWin(a, b) {
  if (a === b) return "draw";
  if ((a === "rock" && b === "scissors") || (a === "paper" && b === "rock") || (a === "scissors" && b === "paper")) return "p1";
  return "p2";
}
const suitKbd = (chatId, gid) => ({
  inline_keyboard: [[
    { text: "🪨 Batu", callback_data: `suitpick_${chatId}_${gid}_rock` },
    { text: "📄 Kertas", callback_data: `suitpick_${chatId}_${gid}_paper` },
    { text: "✂️ Gunting", callback_data: `suitpick_${chatId}_${gid}_scissors` },
  ]],
});

bot.command("suit", async (ctx) => {
  if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) return ctx.reply("❌ Cuma di grup.");
  const chatId = ctx.chat.id;
  if (suitGames.has(chatId)) return ctx.reply("⚠️ Masih ada game suit.");
  const gid = Date.now().toString().slice(-6);
  const g = { id: gid, p1: ctx.from, p2: null, p1Choice: null, p2Choice: null, started: false };
  suitGames.set(chatId, g);
  await ctx.reply(`🎮 <b>SUIT PVP</b>\n\n👤 P1 : <b>${suitName(ctx.from)}</b>\n👤 P2 : <b>Belum join</b>\n\n<i>Klik buat join.</i>`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⚔️ Join Suit", callback_data: `suitjoin_${chatId}_${gid}` }]] },
  });
});

bot.command("suitstop", async (ctx) => {
  if (!suitGames.has(ctx.chat.id)) return ctx.reply("❌ Gak ada game suit.");
  suitGames.delete(ctx.chat.id);
  ctx.reply("🛑 Game suit dibatalkan.");
});

bot.action(/^suitjoin_(.+)_(.+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]);
    const gid = String(ctx.match[2]);
    const g = suitGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Game gak ada", { show_alert: true });
    if (g.p2) return ctx.answerCbQuery("⚠️ P2 penuh", { show_alert: true });
    if (g.p1.id === ctx.from.id) return ctx.answerCbQuery("❌ Kamu udah P1", { show_alert: true });
    g.p2 = ctx.from;
    g.started = true;
    await ctx.editMessageText(`🎮 <b>SUIT PVP</b>\n\n👤 P1 : <b>${suitName(g.p1)}</b>\n👤 P2 : <b>${suitName(g.p2)}</b>\n\nPilih sekarang:`, {
      parse_mode: "HTML",
      reply_markup: suitKbd(chatId, gid),
    });
    return ctx.answerCbQuery("✅ Join sebagai P2");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

bot.action(/^suitpick_(.+)_(.+)_(rock|paper|scissors)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]);
    const gid = String(ctx.match[2]);
    const choice = String(ctx.match[3]);
    const g = suitGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Game gak ada", { show_alert: true });
    if (!g.started || !g.p2) return ctx.answerCbQuery("⚠️ Belum siap", { show_alert: true });

    if (ctx.from.id === g.p1.id) {
      if (g.p1Choice) return ctx.answerCbQuery("⚠️ Udah milih", { show_alert: true });
      g.p1Choice = choice;
      await ctx.answerCbQuery(`✅ Kamu pilih: ${suitLabel(choice)}`, { show_alert: true });
    } else if (ctx.from.id === g.p2.id) {
      if (g.p2Choice) return ctx.answerCbQuery("⚠️ Udah milih", { show_alert: true });
      g.p2Choice = choice;
      await ctx.answerCbQuery(`✅ Kamu pilih: ${suitLabel(choice)}`, { show_alert: true });
    } else return ctx.answerCbQuery("❌ Kamu bukan pemain", { show_alert: true });

    if (!g.p1Choice || !g.p2Choice) return;

    const res = suitWin(g.p1Choice, g.p2Choice);
    if (res === "draw") {
      addSuitDraw(g.p1); addSuitDraw(g.p2);
      await ctx.editMessageText(`🤝 <b>SERI</b>\n\n${suitName(g.p1)} = ${suitLabel(g.p1Choice)}\n${suitName(g.p2)} = ${suitLabel(g.p2Choice)}`, { parse_mode: "HTML" });
      suitGames.delete(chatId);
      return;
    }
    const winner = res === "p1" ? g.p1 : g.p2;
    const loser = res === "p1" ? g.p2 : g.p1;
    addSuitWin(winner); addSuitLose(loser);
    await ctx.editMessageText(`🏆 <b>MENANG: ${suitName(winner)}</b>\n\n${suitName(g.p1)} = ${suitLabel(g.p1Choice)}\n${suitName(g.p2)} = ${suitLabel(g.p2Choice)}\n\n⭐ +2 point`, { parse_mode: "HTML" });
    suitGames.delete(chatId);
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

// =================== AUTO UPDATE ===================
bot.command("update", async (ctx) => doUpdate(ctx));
const UPDATE_URL = "https://raw.githubusercontent.com/sanz-max/seraphineupdate/main/Asmo.js";
const UPDATE_FILE_PATH = "./Asmo.js";

function downloadToFile(url, fp) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(fp);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close(() => fs.unlink(fp, () => {}));
        return reject(new Error(`HTTP_${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      file.close(() => fs.unlink(fp, () => {}));
      reject(err);
    });
  });
}

async function doUpdate(ctx) {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");
  await ctx.reply("⏳ <b>Auto Update Script...</b>", { parse_mode: "HTML" });
  try {
    await downloadToFile(UPDATE_URL, UPDATE_FILE_PATH);
    await ctx.reply("✅ <b>Update berhasil!</b> ♻ Restart...", { parse_mode: "HTML" });
    setTimeout(() => process.exit(0), 1500);
  } catch (e) {
    await ctx.reply(`❌ Gagal update: <code>${String(e.message || e)}</code>`, { parse_mode: "HTML" });
  }
}

// =================== DETEKSI BOT JOIN GRUP ===================
bot.on("my_chat_member", async (ctx) => {
  try {
    const u = ctx.update.my_chat_member;
    const nw = u.new_chat_member.status;
    const old = u.old_chat_member.status;
    const chat = u.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;
    const chatId = String(chat.id);
    const title = chat.title || "Tanpa Nama";

    if (["member", "administrator"].includes(nw) && ["left", "kicked"].includes(old)) {
      if (isGroupApproved(chatId)) return;
      await ctx.telegram.sendMessage(chat.id, "⚠️ Bot belum di-approve owner.\nJika 10 menit gak di-approve, bot keluar otomatis.");
      await ctx.telegram.sendMessage(ownerID, `🚨 BOT DITAMBAHKAN KE GRUP BARU\n\nNama : ${title}\nID   : ${chatId}\n\nGunakan:\n/approved ${chatId}`);
      if (pendingGroups.has(chatId)) clearTimeout(pendingGroups.get(chatId).timeout);
      const t = setTimeout(async () => {
        try {
          if (!isGroupApproved(chatId)) {
            await ctx.telegram.sendMessage(chat.id, "❌ Tidak di-approve 10 menit. Bot keluar.");
            await ctx.telegram.leaveChat(chat.id);
          }
        } catch (e) {}
        finally { pendingGroups.delete(chatId); }
      }, 10 * 60 * 1000);
      pendingGroups.set(chatId, { title, timeout: t });
    }
  } catch (err) { console.error("my_chat_member err:", err.message); }
});

// =================== MIDDLEWARE GROUP ===================
bot.use(async (ctx, next) => {
  if (!ctx.chat) return next();
  const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
  if (!isGroup) return next();
  const chatId = String(ctx.chat.id);
  const text = ctx.message?.text || "";
  const cmd = text.startsWith("/") ? text.split(" ")[0].toLowerCase() : "";
  const bypass = ["/approved", "/unapproved", "/listapprovedgroup"];
  if (!isGroupApproved(chatId) && !bypass.includes(cmd)) {
    if (ctx.message?.text?.startsWith("/")) {
      await ctx.reply("❌ Grup ini belum di-approve owner.\n🪧 Format: /approved -100xxxxxxxxxx");
    }
    return;
  }
  return next();
});

// =================== MIDDLEWARE BLOCK CMD ===================
bot.use(async (ctx, next) => {
  if (!ctx.message || !ctx.message.text) return next();
  const text = ctx.message.text.trim();
  if (!text.startsWith("/")) return next();
  const cmd = normCmd(text.split(" ")[0].split("@")[0]);
  const bypass = ["blockcmd", "unblockcmd", "listblockcmd"];
  if (!bypass.includes(cmd) && isBlocked(cmd)) {
    await ctx.reply(`❌ Command /${cmd} sedang diblokir.`);
    return;
  }
  return next();
});

// =================== LAUNCH ===================
bot.launch();
console.log(chalk.green("🚀 Bot Hefaistos Hades aktif!"));