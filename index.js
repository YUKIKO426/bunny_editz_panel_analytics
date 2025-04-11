
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin123";

const KEYS_FILE = './data/keys.json';
const LOGS_FILE = './data/logs.json';
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Load keys and logs
function loadKeys() {
    if (!fs.existsSync(KEYS_FILE)) return {};
    return JSON.parse(fs.readFileSync(KEYS_FILE));
}
function saveKeys(keys) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}
function logActivation(log) {
    const logs = fs.existsSync(LOGS_FILE) ? JSON.parse(fs.readFileSync(LOGS_FILE)) : [];
    logs.push(log);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

// Generate a new key
app.post('/generate', (req, res) => {
    if (req.headers.token !== ADMIN_TOKEN) return res.status(403).send("Unauthorized");
    const { key, duration } = req.body;
    if (!key || !duration) return res.status(400).send("Key and duration required");
    const keys = loadKeys();
    const now = Date.now();
    keys[key] = {
        created: now,
        expiry: now + (duration * 86400000),
        duration,
        activated: false
    };
    saveKeys(keys);
    res.send({ success: true, key });
});

// Get all keys
app.get('/keys', (req, res) => {
    const keys = loadKeys();
    res.send(keys);
});

// Get logs (admin only)
app.get('/logs', (req, res) => {
    if (req.headers.token !== ADMIN_TOKEN) return res.status(403).send("Unauthorized");
    const logs = fs.existsSync(LOGS_FILE) ? JSON.parse(fs.readFileSync(LOGS_FILE)) : [];
    res.send(logs);
});

// Activate a key (called by mod)
app.post('/activate', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const { key } = req.body;
    const keys = loadKeys();
    const success = !!keys[key];
    if (success) {
        keys[key].activated = true;
        saveKeys(keys);
    }
    logActivation({
        key: key,
        time: new Date().toISOString(),
        ip,
        success
    });
    res.send({ success });
});

// Delete key
app.delete('/key/:key', (req, res) => {
    if (req.headers.token !== ADMIN_TOKEN) return res.status(403).send("Unauthorized");
    const keys = loadKeys();
    const key = req.params.key;
    if (!keys[key]) return res.status(404).send("Key not found");
    delete keys[key];
    saveKeys(keys);
    res.send({ success: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


// Analytics endpoint
app.get('/analytics', (req, res) => {
    if (req.headers.token !== ADMIN_TOKEN) return res.status(403).send("Unauthorized");
    const keys = loadKeys();
    const logs = fs.existsSync(LOGS_FILE) ? JSON.parse(fs.readFileSync(LOGS_FILE)) : [];
    const now = Date.now();
    const last24h = now - 86400000;

    const uniqueIPs = new Set();
    let activations24h = 0;
    logs.forEach(log => {
        if (log.time && new Date(log.time).getTime() > last24h) activations24h++;
        if (log.ip) uniqueIPs.add(log.ip);
    });

    const stats = {
        total: Object.keys(keys).length,
        activated: Object.values(keys).filter(k => k.activated).length,
        expired: Object.values(keys).filter(k => k.expiry < now).length,
        uniqueIPs: uniqueIPs.size,
        activations24h
    };
    res.send(stats);
});
