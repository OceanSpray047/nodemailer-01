'use strict';
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const mailer   = require('./mailer');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '100mb' }));

// 1x1 Transparent GIF for Email Open Tracking
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
let totalOpensCount = 0;
const openedHistory = [];

// REST endpoints
app.get('/api/letter/default', (req, res) => {
    const p = path.join(__dirname, 'letter.html');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'letter.html not found' });
    res.json({ content: fs.readFileSync(p, 'utf-8') });
});

app.post('/api/letter/save', (req, res) => {
    try {
        const { content } = req.body;
        if (typeof content !== 'string') return res.status(400).json({ error: 'Content must be string' });
        fs.writeFileSync(path.join(__dirname, 'letter.html'), content, 'utf-8');
        const subfolderPath = path.join(__dirname, 'node - Copy', 'letter.html');
        if (fs.existsSync(path.dirname(subfolderPath))) {
            fs.writeFileSync(subfolderPath, content, 'utf-8');
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ running: mailer.isActive(), totalOpens: totalOpensCount });
});

// Email Open Tracking Pixel Route
app.get('/api/track/open/:id', (req, res) => {
    const trackId = req.params.id;
    const info = mailer.getTracker(trackId);
    if (info) {
        totalOpensCount++;
        const record = {
            trackId,
            email: info.email,
            time: new Date().toLocaleTimeString(),
            timestamp: new Date().toISOString()
        };
        openedHistory.push(record);
        io.emit('emailOpened', {
            email: info.email,
            time: record.time,
            totalOpens: totalOpensCount
        });
        console.log(`[🔔 OPEN] Recipient ${info.email} opened the email!`);
    }

    res.set({
        'Content-Type': 'image/gif',
        'Content-Length': PIXEL_GIF.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    res.end(PIXEL_GIF);
});

// Socket.io handlers
io.on('connection', (socket) => {
    console.log('[+] Client connected:', socket.id);

    // Send initial opens count
    socket.emit('openStats', { totalOpens: totalOpensCount });

    // Bulk campaign start
    socket.on('start', async (config) => {
        if (mailer.isActive()) {
            socket.emit('log', { type: 'warn', message: 'Campaign is already running — please stop it first.' });
            return;
        }
        await mailer.sendEmails(
            config,
            (log)      => socket.emit('log',      log),
            (progress) => socket.emit('progress', progress),
            (result)   => socket.emit('done',     result)
        );
    });

    // Campaign stop
    socket.on('stop', () => {
        mailer.stop();
        socket.emit('log', { type: 'warn', message: 'Stop signal sent...' });
    });

    function formatError(err) {
        if (!err) return 'Unknown error';
        if (err.errors && Array.isArray(err.errors) && err.errors.length > 0) {
            return err.errors.map(e => e.message || String(e)).filter(Boolean).join(' | ');
        }
        return err.message || String(err);
    }

    // Test SMTP credentials
    socket.on('testSmtp', async (smtpCfg, ack) => {
        try {
            await mailer.checkSMTP(smtpCfg);
            if (typeof ack === 'function') ack({ ok: true });
            socket.emit('log', { type: 'success', message: 'SMTP connection verified successfully!' });
        } catch (err) {
            const msg = formatError(err);
            if (typeof ack === 'function') ack({ ok: false, error: msg });
            socket.emit('log', { type: 'error', message: `SMTP verification failed: ${msg}` });
        }
    });

    // Send test email (supports one OR multiple test addresses)
    socket.on('sendTestEmail', async (data, ack) => {
        try {
            const result = await mailer.sendTestEmails(
                data.config,
                data.testEmails || data.testEmail,
                (log) => socket.emit('log', log)
            );
            if (typeof ack === 'function') ack({ ok: true, result });
        } catch (err) {
            const msg = formatError(err);
            if (typeof ack === 'function') ack({ ok: false, error: msg });
            socket.emit('log', { type: 'error', message: `Test email error: ${msg}` });
        }
    });

    socket.on('disconnect', () => {
        console.log('[-] Client disconnected:', socket.id);
    });
});

let currentPort = parseInt(process.env.PORT, 10) || 3001;

function startServer(port) {
    server.listen(port, () => {
        console.log(`\n  ========================================`);
        console.log(`  🚀 NodeX Mailer Dashboard is LIVE!`);
        console.log(`  🔗 Open in browser: http://localhost:${port}`);
        console.log(`  ========================================\n`);
    });
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        currentPort++;
        console.log(`[!] Port busy, trying next port: http://localhost:${currentPort}...`);
        setTimeout(() => startServer(currentPort), 300);
    } else {
        console.error('Server error:', err);
    }
});

startServer(currentPort);
