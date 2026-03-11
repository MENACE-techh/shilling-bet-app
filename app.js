require('dotenv').config();
const fs = require('fs');
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.static('public'));

// 1. const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const shortcode = process.env.MPESA_SHORTCODE;
const passkey = process.env.MPESA_PASSKEY;
// 2. GAME ENGINE STATE
let players = []; 
let timeLeft = 60;
let lastWinner = "Waiting for first draw...";

// 3. AUTOMATIC GAME LOOP (Timer & Drawing)
// 3. AUTOMATIC GAME LOOP (Timer & Drawing)
setInterval(() => {
    if (timeLeft > 0) {
        timeLeft--;
    } else {
        console.log("--- 🏆 DRAWING RESULTS ---");
        if (players.length > 0) {
            const randomIndex = Math.floor(Math.random() * players.length);
           lastWinner = maskNumber(players[randomIndex]);

            // 💰 THE REVENUE CALCULATOR
            const totalPot = players.length * 1; // 1 KES per player
            const houseCut = totalPot * 0.20;    // You keep 20% (0.2 KES per player)
            const winnerPrize = totalPot - houseCut;

            // 📝 Log the winner and your profit
            const logEntry = `${new Date().toLocaleString()} | POT: ${totalPot} | WINNER: ${lastWinner} | PRIZE: ${winnerPrize} KES | MY REVENUE: ${houseCut} KES\n`;
            fs.appendFileSync('winners_log.txt', logEntry);

            console.log(`🏆 WINNER PICKED: ${lastWinner} | YOUR REVENUE: ${houseCut} KES`);
            function maskNumber(number) {
    return number.slice(0, 4) + "****" + number.slice(-3);
}
        } else {
            lastWinner = "No players this round.";
            console.log("⚠️ No players participated.");
        }
        players = []; // Reset players for the next round
        timeLeft = 60; // Reset the clock
    }
}, 1000);
// 4. ACCESS TOKEN GENERATOR
async function getAccessToken() {
    const auth = Buffer.from(`${consumerKey.trim()}:${consumerSecret.trim()}`).toString('base64');
    try {
        const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: { Authorization: `Basic ${auth}` }
        });
        console.log("✅ ACCESS GRANTED");
        return response.data.access_token;
    } catch (error) {
        console.log("❌ AUTH FAILED. Check if Consumer Key/Secret are exactly as in portal.");
        return null;
    }
}

// 5. STK PUSH ROUTE
app.post('/join', async (req, res) => {
    const phone = req.body.phone;
    const token = await getAccessToken();
    if (!token) return res.status(500).json({ success: false });

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');
    
    const callBackURL = "https://shilling-win.onrender.com/callback";

    try {
       await axios.post('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: 1,
            PartyA: phone,
            PartyB: shortcode,
            PhoneNumber: phone,
            CallBackURL: callBackURL,
            AccountReference: "ShillingMin",
            TransactionDesc: "Entry"
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`📱 Prompt Sent to: ${phone}`);
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
        // This is where the magic happens!
        const phoneNumber = callbackData.CallbackMetadata.Item.find(item => item.Name === 'PhoneNumber').Value;
        players.push(phoneNumber); 
        console.log(`✅ PLAYER ADDED: ${phoneNumber}`);
    } else {
        console.log("❌ Payment failed or cancelled by user.");
    }
    res.json({ ResultCode: 0 });
});

app.get('/game-status', (req, res) => {
    res.json({ 
        timeLeft, 
        lastWinner, 
        activePlayers: players.length,
        jackpot: players.length * 1 // Total KES in the current round
    });
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

app.listen(3000, () => console.log("🚀 ENGINE READY ON PORT 3000"));