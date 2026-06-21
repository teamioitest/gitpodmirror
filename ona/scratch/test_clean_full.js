const fs = require('fs');
const path = require('path');

// Read cleanHtml from clean_mirror.js
const cleanMirrorCode = fs.readFileSync(path.join(__dirname, '..', 'clean_mirror.js'), 'utf8');

// Extract cleanHtml function and translateWaybackUrls function from clean_mirror.js using regex or eval
// To be safe, we will just use clean_mirror.js code by removing its immediate execution (runCleaner()).
let code = cleanMirrorCode.replace('runCleaner();', '');
code += `
module.exports = { cleanHtml };
`;

// Eval it to get the cleanHtml function
const m = { exports: {} };
const fn = new Function('module', 'exports', 'require', '__dirname', code);
fn(m, m.exports, require, path.join(__dirname, '..'));

const cleanHtml = m.exports.cleanHtml;

const rawHtml = fs.readFileSync(path.join(__dirname, 'raw_background_agent.html'), 'utf8');
const cleanedHtml = cleanHtml(rawHtml);

fs.writeFileSync(path.join(__dirname, 'test_cleaned_background_agent.html'), cleanedHtml, 'utf8');
console.log('Processed full file.');

const idx = cleanedHtml.indexOf('banner-generic-image.webp');
if (idx !== -1) {
  console.log('Result context:');
  console.log(cleanedHtml.substring(idx - 150, idx + 150));
} else {
  console.log('Not found in output!');
}
