const fs = require('fs');
const html = fs.readFileSync('public/_template.html','utf8');
fs.writeFileSync('public/index.html', html, 'utf8');
console.log('Written:', fs.statSync('public/index.html').size, 'bytes');
