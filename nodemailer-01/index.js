'use strict';
const fs = require('fs');
const path = require('path');
const _chalk = require('chalk');
const chalk = _chalk.default || _chalk;
const mailer = require('./mailer');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
    console.log(chalk`
{bold.cyan ====================================================}
{bold.cyan 🚀 NodeX Career Outreach & Mailer (CLI Mode)}
{bold.gray Shared Engine with Web Dashboard v2.0}
{bold.cyan ====================================================}
`);

    const args = process.argv.slice(2);

    // Check for test flag: node index.js --test <email@example.com>
    const testIdx = args.indexOf('--test');
    const isTestMode = testIdx !== -1;
    const testRecipient = isTestMode ? args[testIdx + 1] : null;

    // Load configuration
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.log(chalk`{bold.red [!] Error:} config.json not found! Please ensure config.json exists.`);
        process.exit(1);
    }

    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
        console.log(chalk`{bold.red [!] Error parsing config.json:} ${err.message}`);
        process.exit(1);
    }

    // Load cover letter body from letter.html if present
    const letterPath = path.join(__dirname, 'letter.html');
    if (fs.existsSync(letterPath)) {
        config.body = fs.readFileSync(letterPath, 'utf8');
    }

    if (!config.smtp || !config.smtp.host || !config.smtp.user) {
        console.log(chalk`{bold.red [!] Error:} Please configure your SMTP host, user, and pass in config.json.`);
        process.exit(1);
    }

    // TEST MODE
    if (isTestMode) {
        if (!testRecipient) {
            console.log(chalk`{bold.yellow Usage:} node index.js --test <email@example.com>`);
            process.exit(1);
        }

        console.log(chalk`{bold.blue [i] Running in TEST MODE for:} {bold ${testRecipient}}\n`);
        try {
            await mailer.sendTestEmails(
                config,
                testRecipient,
                (log) => {
                    const tag = log.type === 'success' ? chalk.green('[SUCCESS]') : chalk.cyan('[INFO]');
                    console.log(`${tag} ${log.message}`);
                }
            );
            console.log(chalk`\n{bold.green ✅ Test email delivered successfully! Check your inbox.}`);
        } catch (err) {
            console.log(chalk`\n{bold.red ❌ Test failed:} ${err.message}`);
        }
        process.exit(0);
    }

    // CAMPAIGN MODE
    const listFile = (args[0] && !args[0].startsWith('--')) ? args[0] : 'list.txt';
    const listPath = path.join(__dirname, listFile);
    if (!fs.existsSync(listPath)) {
        console.log(chalk`{bold.yellow [!] Recipient list file not found:} ${listFile}`);
        console.log(chalk`{bold.white Usage:} node index.js [listfile.txt]`);
        console.log(chalk`{bold.white Or Test:} node index.js --test <email@example.com>`);
        process.exit(1);
    }

    config.listData = fs.readFileSync(listPath, 'utf8');

    console.log(chalk`{bold.blue [i] Target List:} {bold ${listFile}}`);
    console.log(chalk`{bold.blue [i] SMTP Server:} {bold ${config.smtp.host}:${config.smtp.port}} ({bold ${config.smtp.user}})`);
    console.log(chalk`{bold.blue [i] Interval Delay:} {bold ${config.delayMs || 3000}ms}`);
    console.log(chalk`{bold.cyan ----------------------------------------------------}\n`);

    await mailer.sendEmails(
        config,
        (log) => {
            let tag;
            if (log.type === 'success') tag = chalk.green('[SENT]');
            else if (log.type === 'error') tag = chalk.red('[FAIL]');
            else if (log.type === 'warn') tag = chalk.yellow('[WARN]');
            else tag = chalk.cyan('[INFO]');
            console.log(`${tag} ${log.message}`);
        },
        (prog) => {
            process.stdout.write(chalk`\r{bold Progress: ${prog.sent} Sent | ${prog.failed} Failed | ${prog.percent}% Complete}`);
        },
        (done) => {
            console.log(chalk`\n\n{bold.green ====================================================}`);
            console.log(chalk`{bold.green ✅ Campaign Completed: ${done.sent} sent, ${done.failed} failed of ${done.total} total.}`);
            console.log(chalk`{bold.green ====================================================}\n`);
            process.exit(0);
        }
    );
}

main().catch(err => {
    console.error(chalk.red(`Fatal Error: ${err.message || err}`));
    process.exit(1);
});
