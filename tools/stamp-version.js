// Cache-busting: tags every game file link with ?v=<timestamp> so browsers
// (especially Safari on iPad) always load the newest files after an update.
// Run before publishing:  node tools/stamp-version.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const v = Date.now().toString(36);

// index.html: the stylesheet and the main script
const indexPath = path.join(root, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html
  .replace(/href="style\.css(\?v=[^"]*)?"/, `href="style.css?v=${v}"`)
  .replace(/src="src\/game\.js(\?v=[^"]*)?"/, `src="src/game.js?v=${v}"`);
fs.writeFileSync(indexPath, html);

// src/*.js: every relative `import ... from './x.js'` (and ../vendor)
const srcDir = path.join(root, 'src');
for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'))) {
  const p = path.join(srcDir, file);
  const code = fs.readFileSync(p, 'utf8');
  const next = code.replace(/(from\s+'(?:\.\.?\/)[^'?]+\.js)(\?v=[^']*)?'/g, `$1?v=${v}'`);
  if (next !== code) fs.writeFileSync(p, next);
}
console.log('Stamped version', v);
