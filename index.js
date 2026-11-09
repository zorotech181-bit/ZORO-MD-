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

    // Configuration optimisée pour un traitement instantané en RAM
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        logger: logger,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        defaultQueryTimeoutMs: undefined,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    let codeSent = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        // Délivrer le code à 8 chiffres au site web
        if (qr && !codeSent && res && !res.headersSent) {
            codeSent = true;
            try {
                await delay(1500);
                const code = await sock.requestPairingCode(num);
                console.log(`✅ CODE DISPONIBLE : ${code}`);
                return res.json({ code: code });
            } catch (err) {
                console.error("Erreur code :", err);
                if (!res.headersSent) {
                    return res.status(500).json({ error: "Erreur WhatsApp, réessayez !" });
                }
            }
        }

        // Connexion réussie
        if (connection === 'open') {
            console.log(`🎉🎉 LE BOT +${num} EST CONNECTÉ AVEC SUCCÈS !`);
            activeBots.set(num, sock);

            try {
                await sock.sendMessage(sock.user.id, { 
                    text: `╔════════════════════╗\n   ⚡ *ZORO-MD EST ACTIF !* ⚡\n╚════════════════════╝\n\n🎉 Votre bot est connecté avec succès !\nTapez *.menu* pour commencer.` 
                });
            } catch (e) {}
        }

        // Reconnexion automatique (gestion du code 515)
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`Connexion fermée, code : ${statusCode}`);
            activeBots.delete(num);

            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(`🔄 Reconnexion automatique pour +${num}...`);
                setTimeout(() => {
                    startBotInstance(num);
                }, 2000);
            } else {
                fs.rmSync(userSessionDir, { recursive: true, force: true });
            }
        }
    });

    // Commandes du bot (.ping, .menu)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message) return;
            const from = m.key.remoteJid;
            const body = m.message.conversation || m.message.extendedTextMessage?.text || "";

            if (body === '.ping') {
                await sock.sendMessage(from, { text: '🏓 *PONG !* ZORO-MD est en ligne et ultra rapide !' }, { quoted: m });
            }
            if (body === '.menu') {
                await sock.sendMessage(from, { text: `⚡ *ZORO-MD* ⚡\n\n- *.ping*\n- *.menu*` }, { quoted: m });
            }
        } catch (e) {}
    });
}

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Veuillez entrer un numéro valide !" });

    num = num.replace(/[^0-9]/g, '');

    const userSessionDir = path.join(SESSIONS_DIR, 'bot_' + num);
    if (fs.existsSync(userSessionDir)) {
        fs.rmSync(userSessionDir, { recursive: true, force: true });
    }

    startBotInstance(num, res);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur ZORO-MD actif sur le port ${PORT}`);
});
