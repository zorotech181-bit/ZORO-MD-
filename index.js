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

// Fonction principale de gestion du bot
async function startBotInstance(num, res = null) {
    const userSessionDir = path.join(SESSIONS_DIR, 'bot_' + num);

    const { state, saveCreds } = await useMultiFileAuthState(userSessionDir);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    let codeSent = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        // Première étape : délivrer le code à 8 chiffres au site web
        if (qr && !codeSent && res && !res.headersSent) {
            codeSent = true;
            try {
                await delay(1500);
                const code = await sock.requestPairingCode(num);
                console.log(`✅ CODE GÉNÉRÉ : ${code}`);
                return res.json({ code: code });
            } catch (err) {
                console.error("Erreur génération code :", err);
                if (!res.headersSent) {
                    return res.status(500).json({ error: "Erreur WhatsApp, veuillez réessayer !" });
                }
            }
        }

        // Étape finale : Connexion établie avec succès !
        if (connection === 'open') {
            console.log(`🎉🎉 LE BOT +${num} EST CONNECTÉ AVEC SUCCÈS À WHATSAPP !`);
            activeBots.set(num, sock);

            try {
                await sock.sendMessage(sock.user.id, { 
                    text: `╔════════════════════╗\n   ⚡ *ZORO-MD EST ACTIF !* ⚡\n╚════════════════════╝\n\n🎉 Votre bot est connecté avec succès !\nTapez *.menu* pour commencer.` 
                });
            } catch (e) {}
        }

        // Gestion de la coupure et du signal 515 (Restart Required)
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connexion fermée avec le code : ${statusCode}`);
            activeBots.delete(num);

            // Si l'utilisateur n'a pas appuyé manuellement sur "Déconnecter", on redémarre immédiatement !
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(`🔄 Reconnexion automatique pour +${num} afin de finaliser l'association...`);
                setTimeout(() => {
                    startBotInstance(num); // Relance le socket sans écraser les clés enregistrées
                }, 2000);
            } else {
                console.log(`❌ L'utilisateur s'est déconnecté manuellement (+${num})`);
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
                await sock.sendMessage(from, { text: '🏓 *PONG !* ZORO-MD est ultra rapide et connecté !' }, { quoted: m });
            }
            if (body === '.menu') {
                await sock.sendMessage(from, { text: `⚡ *ZORO-MD* ⚡\n\n- *.ping*\n- *.menu*` }, { quoted: m });
            }
        } catch (e) {}
    });
}

// Route appelée par le site web
app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Numéro de téléphone manquant !" });

    num = num.replace(/[^0-9]/g, '');

    // Réinitialise uniquement lorsqu'une nouvelle demande de code est faite sur le site
    const userSessionDir = path.join(SESSIONS_DIR, 'bot_' + num);
    if (fs.existsSync(userSessionDir)) {
        fs.rmSync(userSessionDir, { recursive: true, force: true });
    }

    startBotInstance(num, res);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur ZORO-MD actif sur le port ${PORT}`);
});
