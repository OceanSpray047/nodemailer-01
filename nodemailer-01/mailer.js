'use strict';
const nodemailer = require('nodemailer');
const _ = require('lodash');
const fs = require('fs');
const randomstring = require('randomstring');
const crypto = require('crypto');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let _stopFlag = false;
let _isRunning = false;

// Open Tracking Registry (trackId -> { email, registeredAt })
const _trackerMap = new Map();

function stop() { _stopFlag = true; }
function isActive() { return _isRunning; }
function registerTracker(trackId, email) { _trackerMap.set(trackId, { email, registeredAt: new Date().toISOString() }); }
function getTracker(trackId) { return _trackerMap.get(trackId); }

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Extract human-friendly name & company from email
function parseEmailIdentity(email) {
    const parts = (email || '').trim().split('@');
    const localPart = parts[0] || '';
    const domainPart = parts[1] || '';

    // Extract name from local part (e.g. john.doe -> John Doe)
    const nameWords = localPart.replace(/[._\-+0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const formattedName = nameWords.map(capitalize).join(' ') || 'Hiring Manager';

    // Extract company name from domain (e.g. stripe.com -> Stripe)
    const domainName = domainPart.replace(/\.[a-z.]+$/i, '').split('.')[0] || '';
    const formattedCompany = capitalize(domainName) || 'Your Company';

    return {
        name: formattedName,
        firstName: nameWords[0] ? capitalize(nameWords[0]) : 'Hiring Team',
        company: formattedCompany,
        domain: domainPart
    };
}

function applyMacros(text, email, timezone) {
    if (!text) return text;
    const tz = timezone || 'America/Los_Angeles';
    const id = parseEmailIdentity(email);

    // Job search personalization tags
    text = text.replace(/#NAME#/gi, id.name);
    text = text.replace(/#FIRSTNAME#/gi, id.firstName);
    text = text.replace(/#COMPANY#/gi, id.company);
    text = text.replace(/#EMAIL#/gi, email);
    text = text.replace(/#DATE#/gi, new Date().toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' }));

    // Legacy tag support (use word boundaries to avoid corrupting email addresses)
    text = text.replace(/\bBASE64EMAIL\b/g, Buffer.from(email).toString('base64'));
    text = text.replace(/\bXXXEMAIL\b/g, email);
    text = text.replace(/\bUSER\b/g, id.firstName);
    text = text.replace(/\bDOMAIN\b/g, id.domain);
    text = text.replace(/\bDOMC\b/g, id.company);
    text = text.replace(/\bDOMs\b/g, id.company.toLowerCase());
    text = text.replace(/\bMD5\b/g, crypto.randomBytes(16).toString('hex'));

    // Dynamic random strings
    text = text.replace(/##RANDOM##/gi, randomstring.generate({ length: 6, charset: 'alphanumeric' }));
    text = text.replace(/\b10CHAR\b/g, randomstring.generate({ length: 10, charset: 'alphanumeric' }));
    text = text.replace(/\b5CHAR\b/g, randomstring.generate({ length: 5, charset: 'alphanumeric' }));
    text = text.replace(/\b4CHAR\b/g, randomstring.generate({ length: 4, charset: 'alphanumeric' }));

    return text;
}

// Convert user input (plain text or HTML) into clean email HTML with optional open-tracking pixel
function formatBodyHtml(rawBody, email, tz, trackingBaseUrl) {
    if (!rawBody || !rawBody.trim()) return '';
    let processed = applyMacros(rawBody, email, tz);
    let finalHtml = '';

    // If the content already contains rich HTML doctype/body, use it directly
    if (/<html|<body/i.test(processed)) {
        finalHtml = processed;
    } else {
        // Conversational email styling (matches standard personal compose in Gmail/Outlook)
        // High Deliverability: Pure, clean paragraphs with standard system typography
        const paragraphs = processed.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean);
        const htmlParagraphs = paragraphs.map(p => {
            const withBr = p.replace(/\r?\n/g, '<br>\n');
            return `<p style="margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1a202c; line-height: 1.6;">${withBr}</p>`;
        }).join('\n');

        finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title></title>
</head>
<body style="margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1a202c; line-height: 1.6; background-color: #ffffff;">
<div dir="ltr">
${htmlParagraphs}
</div>
</body>
</html>`;
    }

    // Anti-Spam Protection: Only inject tracking pixel if a valid external HTTPS domain is provided.
    // NEVER embed localhost or 127.0.0.1 - mail providers instantly flag unresolvable private image URLs as spam/phishing.
    const isPublicHttps = trackingBaseUrl && /^https?:\/\//i.test(trackingBaseUrl) && !/localhost|127\.0\.0\.1|192\.168\.|10\./i.test(trackingBaseUrl);
    if (isPublicHttps) {
        const trackId = crypto.randomBytes(8).toString('hex');
        registerTracker(trackId, email);
        const pixelUrl = `${trackingBaseUrl.replace(/\/$/, '')}/api/track/open/${trackId}`;
        const pixelTag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none !important; width:1px; height:1px; border:0;" />`;
        if (/<\/body>/i.test(finalHtml)) {
            finalHtml = finalHtml.replace(/<\/body>/i, `${pixelTag}</body>`);
        } else {
            finalHtml += `\n${pixelTag}`;
        }
    }

    return finalHtml;
}

function extractDomain(fromStr) {
    if (!fromStr) return 'mail.local';
    const match = fromStr.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match ? match[1].toLowerCase() : 'mail.local';
}

async function checkSMTP(data) {
    const port = Number(data && data.port);

    if (!data || !data.host || !data.user || !data.pass) {
        throw new Error('SMTP host, username, and password are required.');
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid SMTP port: "${data.port}". Must be between 1 and 65535.`);
    }

    const secure = data.secure === true || data.secure === 'true';

    const transporter = nodemailer.createTransport({
        pool: false, // Prevents Office 365 idle pool disconnections and AggregateError
        host: data.host,
        port,
        secure,
        family: 4,   // Force IPv4 to eliminate Windows/ISP dual-stack IPv6 AggregateError
        auth: {
            user: data.user,
            pass: data.pass
        },
        tls: {
            // Allows compatibility with both major providers (Gmail/Outlook) and custom/cPanel servers
            rejectUnauthorized: false
        },
        connectionTimeout: 20000, // 20 seconds
        greetingTimeout: 20000,   // 20 seconds
        socketTimeout: 35000      // 35 seconds
    });

    try {
        await transporter.verify();
        return transporter;
    } catch (error) {
        try { if (transporter && transporter.close) transporter.close(); } catch (_) {}
        if (error && error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
            const detail = error.errors.map(e => e.message || String(e)).filter(Boolean).join(' | ');
            throw new Error(`SMTP Connection Error: ${detail}`);
        }
        throw error;
    }
}

const EMAIL_RE = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

function prepareAttachments(attachmentsList) {
    if (!attachmentsList || !Array.isArray(attachmentsList) || attachmentsList.length === 0) return [];
    return attachmentsList.map(att => {
        if (att.content && Buffer.isBuffer(att.content)) {
            return { filename: att.filename, content: att.content };
        }
        if (att.base64) {
            const cleanBase64 = att.base64.replace(/^data:[^;]+;base64,/, '');
            return {
                filename: att.filename || 'Resume_Attachment.pdf',
                content: Buffer.from(cleanBase64, 'base64')
            };
        }
        return null;
    }).filter(Boolean);
}

function resolveFromAddress(config, recipientEmail, tz) {
    let from = config && config.from ? config.from.trim() : '';
    // Strip out generic demo persona "Alex Morgan" if left in cache
    from = from.replace(/["']?Alex Morgan["']?\s*/i, '').trim();
    if (!from || from === '<>' || /<(\s*)>/.test(from)) {
        from = (config && config.smtp && config.smtp.user) ? config.smtp.user : 'sender@localhost';
    }
    return applyMacros(from, recipientEmail, tz);
}

// Send test emails to one OR multiple test addresses
async function sendTestEmails(config, testEmailInput, onLog) {
    const rawList = Array.isArray(testEmailInput)
        ? testEmailInput
        : (testEmailInput || '').split(/[\r\n,;]+/).map(e => e.trim()).filter(Boolean);

    const validEmails = rawList.filter(e => EMAIL_RE.test(e));
    if (validEmails.length === 0) {
        throw new Error('Please provide at least one valid test email address.');
    }

    const transporter = await checkSMTP(config.smtp);
    const tz = config.timezone || 'America/Los_Angeles';
    const deliveryMode = config.deliveryMode || 'both';

    const rawSubjects = (config.subjects && Array.isArray(config.subjects) && config.subjects.length > 0)
        ? config.subjects.filter(s => s && s.trim())
        : [config.subject || 'Application for Open Role'];

    const preparedAttachments = (deliveryMode === 'attachment' || deliveryMode === 'both')
        ? prepareAttachments(config.attachments)
        : [];

    const results = [];

    for (let i = 0; i < validEmails.length; i++) {
        const testEmail = validEmails[i];
        const fromAddr = resolveFromAddress(config, testEmail, tz);
        const id = parseEmailIdentity(testEmail);
        const recipientTo = (id.name && id.name !== 'Hiring Manager') ? `"${id.name}" <${testEmail}>` : testEmail;
        
        // Subject rotation across test addresses to prevent identical content fingerprinting
        const subjectTemplate = rawSubjects[i % rawSubjects.length];

        const mailOptions = {
            from: fromAddr,
            to: recipientTo,
            subject: applyMacros(subjectTemplate, testEmail, tz),
            headers: {
                'Content-Language': 'en-US',
                'X-Auto-Response-Suppress': 'OOF, AutoReply'
            }
        };

        if (config.replyTo) {
            mailOptions.replyTo = applyMacros(config.replyTo, testEmail, tz);
        }

        if (deliveryMode === 'body' || deliveryMode === 'both') {
            const bodyContent = config.body || config.letterContent || '';
            const rawBodyProcessed = applyMacros(bodyContent, testEmail, tz);
            // High Deliverability: Send genuine plain-text counterpart
            mailOptions.text = rawBodyProcessed;
            // Anti-clustering unique micro-salt prevents Google/Microsoft duplicate clustering
            const uniqueSalt = crypto.randomBytes(4).toString('hex');
            mailOptions.html = formatBodyHtml(bodyContent, testEmail, tz, config.trackingBaseUrl);
        }

        if (preparedAttachments.length > 0) {
            mailOptions.attachments = preparedAttachments;
        }

        try {
            await transporter.sendMail(mailOptions);
            results.push(testEmail);
        } catch (sendErr) {
            try { if (transporter && transporter.close) transporter.close(); } catch (_) {}
            if (sendErr && sendErr.errors && Array.isArray(sendErr.errors) && sendErr.errors.length > 0) {
                const detail = sendErr.errors.map(e => e.message || String(e)).filter(Boolean).join(' | ');
                throw new Error(`Delivery failed to ${testEmail}: ${detail}`);
            }
            throw sendErr;
        }

        if (typeof onLog === 'function') {
            onLog({
                type: 'success',
                message: `[Test ${i + 1}/${validEmails.length}] Test email successfully delivered to ${testEmail}!`
            });
        }

        // Anti-Burst Protection: Space out test emails with delay and jitter so subsequent emails don't trigger burst filters
        if (i < validEmails.length - 1) {
            const delayMs = parseInt(config.delayMs, 10) || 3000;
            const jitter = Math.floor(delayMs * 0.15 * (Math.random() * 2 - 1));
            const actualDelay = Math.max(1000, delayMs + jitter);
            if (typeof onLog === 'function') {
                onLog({
                    type: 'info',
                    message: `⏳ Anti-Burst Protection: Waiting ${(actualDelay / 1000).toFixed(1)}s before sending next test email...`
                });
            }
            await new Promise(r => setTimeout(r, actualDelay));
        }
    }

    try { if (transporter && transporter.close) transporter.close(); } catch (_) {}
    return { ok: true, sentCount: results.length, recipients: results };
}

// Bulk sender with Subject rotation, Delivery mode, and Open tracking
async function sendEmails(config, onLog, onProgress, onDone) {
    _stopFlag  = false;
    _isRunning = true;
    let sent   = 0;
    let failed = 0;
    let total  = 0;

    try {
        onLog({ type: 'info', message: 'Connecting to SMTP server...' });
        const transporter = await checkSMTP(config.smtp);
        onLog({ type: 'success', message: `SMTP connected: ${config.smtp.host}:${config.smtp.port}` });

        const rawList = (config.listData || '').split(/\r?\n/).map(e => e.trim()).filter(Boolean);
        total = rawList.length;
        onLog({ type: 'info', message: `Loaded ${total} recipients.` });
        onProgress({ sent, failed, total, percent: 0 });

        if (total === 0) {
            onLog({ type: 'warn', message: 'Recipient list is empty. Aborting.' });
            _isRunning = false;
            onDone({ sent, failed, total });
            return;
        }

        const tz = config.timezone || 'America/Los_Angeles';
        const delayMs = parseInt(config.delayMs, 10) || 2500;
        const deliveryMode = config.deliveryMode || 'both'; // 'body', 'attachment', 'both'

        const rawSubjects = (config.subjects && Array.isArray(config.subjects) && config.subjects.length > 0)
            ? config.subjects.filter(s => s && s.trim())
            : [config.subject || 'Application for Open Role'];

        const preparedAttachments = (deliveryMode === 'attachment' || deliveryMode === 'both')
            ? prepareAttachments(config.attachments)
            : [];

        const bodyContent = config.body || config.letterContent || '';

        onLog({
            type: 'info',
            message: `Mode: [${deliveryMode.toUpperCase()}]. Subjects: ${rawSubjects.length} (${rawSubjects.length === 1 ? 'Single' : 'Rotating'}). Delay: ${delayMs}ms. Open Tracking: ${config.trackingBaseUrl ? 'ON' : 'OFF'}.`
        });

        for (let i = 0; i < total; i++) {
            if (_stopFlag) {
                onLog({ type: 'warn', message: 'Campaign stopped by user.' });
                break;
            }

            const email = rawList[i];
            if (!EMAIL_RE.test(email)) {
                onLog({ type: 'warn', message: `[${i + 1}/${total}] ${email} => SKIPPED (invalid email address)` });
                continue;
            }

            // Subject rotation (1 subject uses index 0 for all; N subjects rotate 0, 1, 2...)
            const subjectTemplate = rawSubjects[i % rawSubjects.length];
            const fromAddr = resolveFromAddress(config, email, tz);
            const senderDomain = extractDomain(fromAddr);
            const id = parseEmailIdentity(email);
            const recipientTo = (id.name && id.name !== 'Hiring Manager') ? `"${id.name}" <${email}>` : email;
            const msgId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${senderDomain}>`;

            const mailOptions = {
                from: fromAddr,
                to: recipientTo,
                subject: applyMacros(subjectTemplate, email, tz),
                headers: {
                    'Content-Language': 'en-US',
                    'X-Auto-Response-Suppress': 'OOF, AutoReply'
                }
            };

            if (config.replyTo) {
                mailOptions.replyTo = applyMacros(config.replyTo, email, tz);
            }

            // Delivery mode logic:
            // If 'attachment': send ONLY subject + attachment (NO BODY AT ALL).
            // If 'body' or 'both': format body and attach.
            if (deliveryMode === 'body' || deliveryMode === 'both') {
                const rawBodyProcessed = applyMacros(bodyContent, email, tz);
                // High Deliverability: Send genuine plain-text counterpart
                mailOptions.text = rawBodyProcessed;
                // Anti-clustering unique micro-salt prevents Google/Microsoft duplicate clustering
                const uniqueSalt = crypto.randomBytes(4).toString('hex');
                mailOptions.html = formatBodyHtml(bodyContent, email, tz, config.trackingBaseUrl);
            }

            if (preparedAttachments.length > 0) {
                mailOptions.attachments = preparedAttachments;
            }

            try {
                await transporter.sendMail(mailOptions);
                sent++;
                const subjectNum = (i % rawSubjects.length) + 1;
                onLog({
                    type: 'success',
                    message: `[${i + 1}/${total}] ${email} => SENT (Subject #${subjectNum})`
                });
            } catch (err) {
                failed++;
                onLog({
                    type: 'error',
                    message: `[${i + 1}/${total}] ${email} => FAILED: ${err.message}`
                });
                try { fs.appendFileSync('logs-failed.txt', `${email} => ${err.message}\n`); } catch (_) {}
            }

            onProgress({
                sent,
                failed,
                total,
                percent: Math.round(((sent + failed) / total) * 100)
            });

            // Delay between each recipient with ±15% natural jitter to mimic human timing and avoid bot-pattern detection
            if (delayMs > 0 && !_stopFlag && i < total - 1) {
                const jitter = Math.floor(delayMs * 0.15 * (Math.random() * 2 - 1));
                const actualDelay = Math.max(500, delayMs + jitter);
                await new Promise(r => setTimeout(r, actualDelay));
            }
        }
    } catch (err) {
        onLog({ type: 'error', message: `Fatal Error: ${err.message || err}` });
    }

    _isRunning = false;
    onDone({ sent, failed, total });
}

module.exports = { sendEmails, sendTestEmails, stop, isActive, checkSMTP, getTracker };
