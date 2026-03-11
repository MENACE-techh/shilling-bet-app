require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs'); // ADDED THIS - Essential for logging winners!
const app = express();

const consumerKey = (process.env.MPESA_CONSUMER_KEY || "").trim();
const consumerSecret = (process.env.MPESA_CONSUMER_SECRET || "").trim();
const shortcode = (process.env.MPESA_SHORTCODE || "174379").trim();
const passkey = (process.env.MPESA_PASSKEY || "").trim();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. GAME ENGINE STATE
let players = []; 
let timeLeft = 60;
let lastWinner = "Waiting for first draw...";

function maskNumber(number) {
    return number.slice(0, 4) + "****" + number.slice(-3);
}

// 3. AUTOMATIC GAME LOOP
setInterval(() => {
    if (timeLeft > 0) {
        timeLeft--;
    } else {
        console.log("--- 🏆 DRAWING RESULTS ---");
        if (players.length > 0) {
            const randomIndex = Math.floor(Math.random() * players.length);
            lastWinner = maskNumber(players[randomIndex].toString());

            const totalPot = players.length * 1; 
            const houseCut = totalPot * 0.20;    
            const winnerPrize = totalPot - houseCut;

            const logEntry = `${new Date().toLocaleString()} | POT: ${totalPot} | WINNER: ${lastWinner} | PRIZE: ${winnerPrize} KES | MY REVENUE: ${houseCut} KES\n`;
            fs.appendFileSync('winners_log.txt', logEntry);

            console.log(`🏆 WINNER PICKED: ${lastWinner} | YOUR REVENUE: ${houseCut} KES`);
        } else {
            lastWinner = "No players this round.";
            console.log("⚠️ No players participated.");
        }
        players = []; 
        timeLeft = 60; 
    }
}, 1000);

// 4. ACCESS TOKEN GENERATOR
async function getAccessToken() {
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        // Keeping this on SANDBOX to match your shortcode
        const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: { Authorization: `Basic ${auth}` }
        });
        console.log("✅ ACCESS GRANTED");
        return response.data.access_token;
    } catch (error) {
        console.log("❌ AUTH FAILED. Check credentials in Render Secret File.");
        return null;
    }
}

// UPDATED STK PUSH ROUTE
app.post('/join', async (req, res) => {
    const { phone, amount } = req.body; // CRITICAL: This pulls the 1, 5, or 10 KES from the button click
    const token = await getAccessToken();
    if (!token) return res.status(500).json({ success: false });

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');
    
    const callBackURL = "https://shilling-win.onrender.com/callback";

    try {
       await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount, // This is now dynamic!
            PartyA: phone,
            PartyB: shortcode,
            PhoneNumber: phone,
            CallBackURL: callBackURL,
            AccountReference: "ShillingWin",
            TransactionDesc: "Entry"
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`📱 ${amount} KES Prompt Sent to: ${phone}`);
        res.json({ success: true });
    } catch (error) {
        console.error("❌ M-Pesa Error:", JSON.stringify(error.response?.data || error.message));
        res.status(500).json({ success: false });
    }
});

// 6. CALLBACK & STATUS
app.post('/callback', (req, res) => {
    const callbackData = req.body.Body.stkCallback;
    if (callbackData.ResultCode === 0) {
        const phoneNumber = callbackData.CallbackMetadata.Item.find(item => item.Name === 'PhoneNumber').Value;
        players.push(phoneNumber); 
        console.log(`✅ PLAYER ADDED: ${phoneNumber}`);
    }
    res.json({ ResultCode: 0 });
});

app.get('/game-status', (req, res) => {
    res.json({ timeLeft, lastWinner, activePlayers: players.length, jackpot: players.length * 1 });
});

app.get('/recent-winners', (req, res) => {
    try {
        const data = fs.readFileSync('winners_log.txt', 'utf8');
        const lines = data.trim().split('\n').reverse().slice(0, 5);
        res.json({ winners: lines });
    } catch (err) {
        res.json({ winners: [] });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ENGINE READY ON PORT ${PORT}`);
});