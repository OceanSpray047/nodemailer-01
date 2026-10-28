'use strict';
const nodemailer = require('nodemailer');
const _chalk = require('chalk');
const chalk = _chalk.default || _chalk;
const _delay = require('delay');
const delay = _delay.default || _delay;
const _ = require('lodash');
const fs = require('fs');
const randomstring = require('randomstring');
process.env.http_proxy = "127.0.0.1:1080";

async function readFrom(from, email) {
    try {
        from = from.replace(/USER/g, email.replace(/@[^@]+$/, ''));
        from = from.replace(/DOMC/g, email.match(/(?<=@)[^.]+(?=\.)/g)[0].charAt(0).toUpperCase() + email.match(/(?<=@)[^.]+(?=\.)/g)[0].slice(1));
        from = from.replace(/DOMs/g, email.match(/(?<=@)[^.]+(?=\.)/g)[0]);
        from = from.replace(/DOMAIN/g, email.replace(/.*@/, ''));
        from = from.replace(/SILENTCODERSEMAIL/g, email);
        from = from.replace(/SILENTCODERSLIMAHURUF/g, randomstring.generate({length: 5, charset: 'alphabetic'}));
        from = from.replace(/SILENTCODERSBANYAKHURUF/g, randomstring.generate({length: 50, charset: 'alphabetic'}));
        return Promise.resolve(from);
    } catch(err) {
        return Promise.reject(err);
    }
}

async function timezoneSet(timezone, options, timeoption) {
    let nDate;
    if(options === 1) { // Friday, May 10, 2019
        if(timeoption === 1) { // 24 hours
            nDate = new Date().toLocaleDateString('en-us', {
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour12: false,
                timeZone: timezone,

            });
            return Promise.resolve(nDate);
        } else { // 12 hours
            nDate = new Date().toLocaleDateString('en-us', {
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour12: true,
                timeZone: timezone,
                day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            return Promise.resolve(nDate);
        }
    } else if(options === 2) { // 05/10/2019
        if(timeoption === 1) { // 24 hours
            nDate = new Date().toLocaleString('en-us', {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                timeZone: timezone,
                hour12: false,
                day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            return Promise.resolve(nDate);
        } else { // 12 hours
            nDate = new Date().toLocaleString('en-us', {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                timeZone: timezone,
                hour12: true,
                day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            return Promise.resolve(nDate);
        }
    }
}

async function readLetter(letter, email, timezone, optionstime) {
    try {
        let sletter = await fs.readFileSync(letter, 'utf-8');
        const timex = await timezoneSet(timezone, 1, optionstime);
        sletter = sletter.replace(/SILENTCODERSTIMEZONE/g, timex);
        sletter = sletter.replace(/SILENTCODERSEMAIL/g, email);
        sletter = sletter.replace(/EMAILURLSILENTC0DERS/g, Buffer.from(email).toString('base64'));
        sletter = sletter.replace(/SILENTCODERSLIMAHURUF/g, randomstring.generate({length: 5, charset: 'alphabetic'}));
        sletter = sletter.replace(/SILENTCODERSBANYAKHURUF/g, randomstring.generate({length: 50, charset: 'alphabetic'}));
        sletter = sletter.replace(/USER/g, email.replace(/@[^@]+$/, ''));
        sletter = sletter.replace(/DOMAIN/g, email.replace(/.*@/, ''));
        sletter = sletter.replace(/DOMC/g, email.match(/(?<=@)[^.]+(?=\.)/g)[0].charAt(0).toUpperCase() + email.match(/(?<=@)[^.]+(?=\.)/g)[0].slice(1));
        sletter = sletter.replace(/DOMs/g, email.match(/(?<=@)[^.]+(?=\.)/g)[0]);
        return Promise.resolve(sletter);
    } catch(err){
        return Promise.reject(err);
    }
}

async function readLetterAttachments(letter, email) {
    try {
        let sletter = await fs.readFileSync(letter, 'utf-8');
        sletter = sletter.replace(/SILENTCODERSEMAIL/g, email);
        sletter = sletter.replace(/EMAILURLSILENTC0DERS/g, Buffer.from(email).toString('base64'));
        sletter = sletter.replace(/SILENTCODERSLIMAHURUF/g, randomstring.generate({length: 5, charset: 'alphabetic'}));
        sletter = sletter.replace(/SILENTCODERSBANYAKHURUF/g, randomstring.generate({length: 50, charset: 'alphabetic'}));
        sletter = sletter.replace(/USER/g, email.replace(/@[^@]+$/, ''));
        sletter = sletter.replace(/DOMAIN/g, email.replace(/.*@/, ''));
        sletter = sletter.replace(/DOMC/g, email.match(/(?<=@)[^.]+(?=\.)/g)[0].charAt(0).toUpperCase() + email.match(/(?<=@)[^.]+(?=\.)/g)[0].slice(1));
        sletter = sletter.replace(/DOMs/g, email.match(/(?<=@)[^.]+(?=\.)/g)[0]);
        return Promise.resolve(sletter);
    } catch(err){
        return Promise.reject(err);
    }
}

async function readSubject(subject, email) {
    try {
        subject = subject.replace(/USER/g, email.replace(/@[^@]+$/, ''));
        subject = subject.replace(/DOMAIN/g, email.replace(/.*@/, ''));
        subject = subject.replace(/DOMC/g, email.match(/(?<=@)[^.]+(?=\.)/g)[0].charAt(0).toUpperCase() + email.match(/(?<=@)[^.]+(?=\.)/g)[0].slice(1));
        subject = subject.replace(/DOMs/g, email.match(/(?<=@)[^.]+(?=\.)/g)[0]);
        subject = subject.replace(/SILENTCODERSEMAIL/g, email);
        subject = subject.replace(/SILENTCODERSLIMAHURUF/g, randomstring.generate({length: 5, charset: 'alphabetic'}));
        subject = subject.replace(/SILENTCODERSBANYAKHURUF/g, randomstring.generate({length: 50, charset: 'alphabetic'}));
        return Promise.resolve(subject);
    } catch(err) {
        return Promise.reject(err);
    }
}

(async function() {
    console.log(chalk`
{bold xXx - Sender 2019}
{bold.red Code by xXx | admin@xXx.com} @ {green xXx.NET}
    `);
    if (process.argv[2] == undefined) {
        console.log('Usage : node file.js listname.txt');
        process.exit(1);
    }
    let smtpConfig = {
        host: '127.0.0.1',
        port: 25,
        secure: false, // if port 587, false. if port 465 = true
        proxy: "socks5://" + process.env.http_proxy
    };
    let transporter = nodemailer.createTransport(smtpConfig);
    console.log(chalk`{bold [>] Open list file, ${process.argv[2]}.}`);
    let mailist = await fs.readFileSync(process.argv[2], 'utf-8');
    let emailist = mailist.split(/\r?\n/);
    console.log(chalk`{bold [!] Found ${emailist.length} line.}\n`);
    emailist = _.chunk(emailist, 10);
    for(let i = 0; i < emailist.length; i++) {

        await Promise.all(emailist[i].map(async(email) => {
            if(email.match(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)) {
                const doL = await readLetter('letter.txt', email, "Australia/Adelaide", 1);
                const doF = await readFrom('<bluemoon-mat@bluemoon-mat.sakura.ne.jp>', email);
                const doS = await readSubject('Psanwaool!', email);
                try {
                    let mailConfig = {
                        from: doF,
                        html: doL,
                        subject: doS,
                        to: email,
                        headers: {
                            'X-MS-Exchange-Organization-MessageDirectionality': 'Originating',
                            'X-MS-Exchange-Organization-AuthAs': 'Internal',
                            'X-MS-Exchange-Organization-AuthMechanism': '03',
                            'X-MS-Exchange-Organization-AuthSource': 'CO1NAM11FT051.eop-nam11.prod.protection.outlook.com',
                            'X-MS-Exchange-Organization-Network-Message-Id': 'acb926c4-4fb9-4b34-a46c-08d7c07682e0',
                            'X-MA4-NODE':'false'
                        },
                    };  
                    transporter.set('proxy_socks_module', require('socks'));
                    await transporter.sendMail(mailConfig);
                    console.log(chalk`{bold ${email} => SUCCESS}`);
                } catch(err) {
                console.log(chalk`{bold ${email} => ERROR : ${err.message}}`);
await fs.appendFileSync('logs-failed.txt', email+' => '+err.message+'\r\n');
                }
            }
        }));
console.log(chalk`\n{bold [-] Sleeping 1 second.}\n`);
        await delay(1000);
    }
})();