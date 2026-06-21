const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'raw_background_agent.html');
if (!fs.existsSync(file)) {
  console.log('File does not exist');
  process.exit(1);
}
let cleaned = fs.readFileSync(file, 'utf8');

const scriptContents = [];
cleaned = cleaned.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, content) => {
  if (attrs.includes('organization-schema')) {
    console.log('Matched organization-schema script!');
  }
  scriptContents.push({ attrs, content });
  return `<!--SCRIPT_PLACEHOLDER_${scriptContents.length - 1}-->`;
});

console.log('Number of placeholders:', scriptContents.length);

const placeholderIndex = cleaned.indexOf('organization-schema');
console.log('Is organization-schema in placeholders?', placeholderIndex !== -1);
if (placeholderIndex !== -1) {
  console.log('Context in placeholders:', cleaned.substring(placeholderIndex - 50, placeholderIndex + 150));
}

// Restore
cleaned = cleaned.replace(/<!--SCRIPT_PLACEHOLDER_(\d+)-->/g, (match, index) => {
  const item = scriptContents[parseInt(index, 10)];
  return `<script${item.attrs}>${item.content}</script>`;
});

const restoredIndex = cleaned.indexOf('organization-schema');
console.log('Is organization-schema restored?', restoredIndex !== -1);
