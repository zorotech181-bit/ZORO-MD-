const express = require('express');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) {
        return res.status(400).json({ error: "Veuillez entrer un numéro valide !" });
    }

    num = num.replace(/[^0-9]/g, '');
    const tempDir = path.join(__dirname, 'temp', `${num}_${Date.now()}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.ubuntu("Chrome")
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                await delay(3000);
                const credsPath = path.join(tempDir, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const credsData = fs.readFileSync(credsPath);
                    const sessionId = "ZORO~" + Buffer.from(credsData).toString('base64');
                    
                    await sock.sendMessage(sock.user.id, { 
                        text: `*CONNEXION RÉUSSIE ! 🎉*\n\nVoici votre SESSION_ID :\n\`\`\`${sessionId}\`\`\`\n\n*Ne partagez jamais ce code avec personne !*` 
                    });
                }
                setTimeout(() => {
                    try {
                        sock.ws.close();
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    } catch (e) {}
                }, 5000);
            }
        });

        await delay(2500);
        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        return res.json({ code });

    } catch (err) {
        console.error(err);
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
        return res.status(500).json({ error: "Erreur lors de la demande du code. Vérifiez le numéro ou réessayez dans 1 minute." });
    }
});

app.listen(PORT, () => {
    console.log(`Le serveur de pairing tourne sur le port ${PORT}`);
});
