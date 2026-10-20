const fs = require('fs');
const files = ['renderer/js/rest-service.js','renderer/js/pages/local-orders.js','renderer/js/pages/connection.js','renderer/js/pages/sales.js','renderer/phone-sales/rest-ui.js'].filter(f=>fs.existsSync(f));
const keys = new Set();
for (const f of files) {
  const s = fs.readFileSync(f,'utf8');
  const re = /t\(\s*'([A-Za-z0-9_.]+)'\s*\)/g;
  let m;
  while ((m = re.exec(s))) {
    const k = m[1];
    if (k.indexOf('rest.') === 0 || k.indexOf('nav.') === 0) keys.add(k);
  }
}
const app = fs.readFileSync('renderer/js/app.js','utf8');
const langBlocks = app.split(/\n  (ar|en|fr|zh): \{/);
const missing = [];
for (const full of [...keys].sort()) {
  let count = 0;
  for (let bi = 2; bi < langBlocks.length; bi += 2) {
    let block = langBlocks[bi];
    const start = block.indexOf('rest: {');
    if (start === -1) continue;
    block = block.slice(start);
    const restBody = block.slice(0, block.indexOf('\n    },'));
    if (full === 'nav.localOrders') {
      const navStart = langBlocks[bi].indexOf('nav: {');
      if (navStart !== -1 && langBlocks[bi].indexOf('localOrders:') !== -1) count++;
      continue;
    }
    const short = full.slice('rest.'.length);
    const rx = new RegExp('^\\s*' + short.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s*:', 'm');
    if (rx.test(restBody)) count++;
  }
  if (count < 4) missing.push('count=' + count + ' : ' + full);
}
console.log(missing.length ? missing.join('\n') : 'ALL present in 4 language blocks');