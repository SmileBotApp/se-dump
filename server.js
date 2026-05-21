const express = require('express');
const axios = require('axios');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 🛡️ RATE LIMITER ---
// Protects the server from API spam and bandwidth abuse
const exportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 export requests per window
    message: `
        <div style="font-family: sans-serif; background: #1a1a1a; color: white; padding: 40px; text-align: center; border-top: 4px solid #f39c12;">
            <h2 style="color: #f39c12;">Whoa there, speedster!</h2>
            <p>You have requested too many exports recently. Please wait 15 minutes before trying again.</p>
            <a href="/" style="color: #5dade2;">← Go Back</a>
        </div>
    `,
    standardHeaders: true, 
    legacyHeaders: false, 
});

// Middleware to parse form data and serve the static HTML folder
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/export', exportLimiter, async (req, res) => {
    const { channelId, jwtToken } = req.body;

    if (!channelId || !jwtToken) {
        return res.status(400).send("<h2>Error</h2><p>Missing Channel ID or JWT Token.</p><a href='/'>Go back</a>");
    }

    // Updated CSV Header to include 'Watchtime (Minutes)'
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="se_leaderboard_${channelId.trim()}.csv"`);

    let csvData = "Username,Points,Watchtime (Minutes)\n"; 
    let offset = 0;
    const limit = 100;
    let keepFetching = true;

    try {
        while (keepFetching) {
            // The API returns 'points' and 'minutes' (watchtime) in the user object
            const response = await axios.get(`https://api.streamelements.com/kappa/v2/points/${channelId.trim()}/top`, {
                params: { limit: limit, offset: offset },
                headers: { 'Authorization': `Bearer ${jwtToken.trim()}` }
            });

            const users = response.data.users;

            if (!users || users.length === 0) {
                keepFetching = false;
                break;
            }

            for (const user of users) {
                const username = user.username.toLowerCase().trim();
                const points = parseInt(user.points);
                const minutes = parseInt(user.minutes || 0); // Pulling the watchtime minutes
                
                csvData += `"${username}",${points},${minutes}\n`; 
            }

            offset += limit;
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        res.send(csvData);

    } catch (err) {
        console.error("Export Error:", err.message);
        res.setHeader('Content-Type', 'text/html');
        res.status(500).send(`
            <div style="font-family: sans-serif; background: #1a1a1a; color: white; padding: 40px; text-align: center; border-top: 4px solid #e74c3c;">
                <h2 style="color: #e74c3c;">Connection Failed</h2>
                <p>Double check your Channel ID and JWT token. The StreamElements API rejected the connection.</p>
                <a href="/" style="color: #5dade2;">← Try Again</a>
            </div>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Secure SE Exporter running on port ${PORT}`);
});
