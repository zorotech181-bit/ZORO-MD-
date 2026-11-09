const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.static('public'));

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const activeBots = new Map();

async function startBotInstance(num, res = null) {
    const userSessionDir = path.join(SESSIONS_DIR, 'bot_' + num);
    const { state, saveCreds } = await useMultiFileAuthState(userSessionDir);

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        logger: logger,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: undefined,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000
    });

    sock.ev.on('creds.update', saveCreds);

    let codeSent = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr && !codeSent && res && !res.headersSent) {
            codeSent = true;
            try {
                await delay(1500);
                const code = await sock.requestPairingCode(num);
                console.log(`✅ Code généré pour +${num} : ${code}`);
                return res.json({ code: code });
            } catch (err) {
                console.error("Erreur code:", err);
                if (!res.headersSent) {
                    return res.status(500).json({ error: "Erreur WhatsApp, réessayez !" });
                }
            }
        }

        if (connection === 'open') {
            console.log(`🟢 LE BOT DU NUMÉRO +${num} EST ACTIF 24H/24 !`);
            activeBots.set(num, sock);

            try {
                await sock.sendPresenceUpdate('available');
                await sock.sendMessage(sock.user.id, { 
                    text: `╔════════════════════╗\n   ⚡ *ZORO-MD EST EN LIGNE !* ⚡\n╚════════════════════╝\n\n✅ Bot connecté et stabilisé 24h/24 !\n👉 Tapez *.menu* ou *.ping* pour tester.` 
                });
            } catch (e) {}
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connexion fermée pour +${num} (Code : ${statusCode})`);
            activeBots.delete(num);

            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(`🔄 Reconnexion automatique pour +${num}...`);
                setTimeout(() => {
                    startBotInstance(num);
                }, 3000);
            } else {
                console.log(`❌ Déconnexion définitive (+${num})`);
                fs.rmSync(userSessionDir, { recursive: true, force: true });
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message) return;

            const from = m.key.remoteJid;
            const text = (
                m.message.conversation ||
                m.message.extendedTextMessage?.text ||
                m.message.imageMessage?.caption ||
                ""
            ).trim().toLowerCase();

            if (text === '.ping') {
                await sock.sendMessage(from, { text: '🏓 *PONG !* ZORO-MD est bien actif et réactif !' }, { quoted: m });
            }

            if (text === '.menu') {
                const menu = `⚡ *ZORO-MD BOT MENU* ⚡\n\n` +
                             `🟢 *Statut :* Connecté & Actif 24/24\n` +
                             `👤 *Numéro :* +${num}\n\n` +
                             `📌 *COMMANDES :*\n` +
                             `▫️ *.ping* : Tester la vitesse\n` +
                             `▫️ *.menu* : Afficher ce menu\n` +
                             `▫️ *.bot* : Infos système\n\n` +
                             `_Propulsé par ZORO-MD_`;
                await sock.sendMessage(from, { text: menu }, { quoted: m });
            }

            if (text === '.bot') {
                await sock.sendMessage(from, { text: '🤖 Je suis ZORO-MD, bot WhatsApp multi-device toujours en ligne !' }, { quoted: m });
            }

        } catch (e) {
            console.error(e);
        }
    });
}

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Numéro requis !" });

    num = num.replace(/[^0-9]/g, '');

    const userSessionDir = path.join(SESSIONS_DIR, 'bot_' + num);
    if (fs.existsSync(userSessionDir)) {
        fs.rmSync(userSessionDir, { recursive: true, force: true });
    }

    startBotInstance(num, res);
});

function reloadExistingBots() {
    if (fs.existsSync(SESSIONS_DIR)) {
        const folders = fs.readdirSync(SESSIONS_DIR);
        folders.forEach(folder => {
            if (folder.startsWith('bot_')) {
                const num = folder.replace('bot_', '');
                console.log(`📦 Rechargement de la session pour +${num}...`);
                startBotInstance(num);
            }
        });
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur ZORO-MD opérationnel sur le port ${PORT}`);
    reloadExistingBots();
});
