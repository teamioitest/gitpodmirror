const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '..', 'public');

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const files = getFilesRecursively(TARGET_DIR);
console.log(`Searching in ${files.length} files...`);

files.forEach(file => {
  const ext = path.extname(file).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff2'].includes(ext)) return;
  
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return;
  }
  
  // Check Ona
  const onaMatches = content.match(/Ona/g);
  if (onaMatches) {
    console.log(`[Ona] ${path.relative(TARGET_DIR, file)}: found ${onaMatches.length} occurrences`);
  }
  
  // Check ONA (with boundary / escape sequences)
  const regexOna1 = /\\tONA/g;
  const regexOna2 = /(?<![A-Za-z0-9])ONA(?![A-Za-z0-9])/g;
  const match1 = content.match(regexOna1);
  const match2 = content.match(regexOna2);
  if (match1 || match2) {
    console.log(`[ONA] ${path.relative(TARGET_DIR, file)}: match1=${match1 ? match1.length : 0}, match2=${match2 ? match2.length : 0}`);
  }
  
  // Check lowercase ona
  const regexOna3 = /(?<![a-zA-Z0-9])ona(?![a-zA-Z0-9])/g;
  const match3 = content.match(regexOna3);
  if (match3) {
    console.log(`[ona] ${path.relative(TARGET_DIR, file)}: found ${match3.length} occurrences`);
    // Print lines containing matches
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (regexOna3.test(line)) {
        console.log(`   Line ${idx+1}: ${line.substring(0, 120)}`);
      }
    });
  }
});
