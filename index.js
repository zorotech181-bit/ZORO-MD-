const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason 
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

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Numéro manquant !" });

    num = num.replace(/[^0-9]/g, '');
    console.log(`\n=============================`);
    console.log(`📱 Demande reçue pour le numéro : +${num}`);

    const userSessionDir = path.join(SESSIONS_DIR, 'bot_' + num);
    if (fs.existsSync(userSessionDir)) {
        fs.rmSync(userSessionDir, { recursive: true, force: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(userSessionDir);

        console.log(`⏳ Préparation de la connexion WhatsApp...`);
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);

        // Détection de la connexion réussie
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`🎉 LE BOT DU NUMÉRO +${num} EST CONNECTÉ AVEC SUCCÈS !`);
                activeBots.set(num, sock);

                try {
                    await sock.sendMessage(sock.user.id, { 
                        text: `╔════════════════════╗\n   ⚡ *ZORO-MD EST ACTIF !* ⚡\n╚════════════════════╝\n\n🎉 Le bot est connecté à votre compte !\nTapez *.menu* pour commencer.` 
                    });
                } catch (e) {}
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                activeBots.delete(num);
                if (statusCode !== DisconnectReason.loggedOut) {
                    console.log(`Reconnexion automatique pour +${num}...`);
                }
            }
        });

        // Commandes du bot
        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const m = messages[0];
                if (!m.message) return;
                const from = m.key.remoteJid;
                const body = m.message.conversation || m.message.extendedTextMessage?.text || "";

                if (body === '.ping') {
                    await sock.sendMessage(from, { text: '🏓 *PONG !* ZORO-MD est en ligne et réactif !' }, { quoted: m });
                }
                if (body === '.menu') {
                    await sock.sendMessage(from, { text: `⚡ *ZORO-MD* ⚡\n\n- *.ping*\n- *.menu*` }, { quoted: m });
                }
            } catch (e) {}
        });

        // Demande du code à WhatsApp
        await delay(2000);
        console.log(`⚡ Demande du code à 8 chiffres à WhatsApp...`);
        
        const code = await sock.requestPairingCode(num);
        console.log(`✅ CODE GÉNÉRÉ AVEC SUCCÈS : ${code}`);
        
        return res.json({ code: code });

    } catch (err) {
        console.error("❌ ERREUR WHATSAPP :", err);
        return res.status(500).json({ error: "Erreur WhatsApp, réessayez dans quelques secondes." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Le serveur de pairing tourne sur le port ${PORT}`);
});
