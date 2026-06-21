const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function getFilesRecursively(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const jsFiles = getFilesRecursively(PUBLIC_DIR);
console.log(`Found ${jsFiles.length} JS files to check.`);

let errors = 0;
jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(content, { filename: file });
  } catch (err) {
    const msg = err.message || '';
    if (
      msg.includes('Cannot use import statement outside a module') ||
      msg.includes("Unexpected token 'export'") ||
      msg.includes("Unexpected reserved word")
    ) {
      // Ignored ESM specific syntax error in classic script parsing
    } else {
      console.error(`Syntax error in ${file}: ${err.message}`);
      errors++;
    }
  }
});

console.log(`Finished checking. Total files with syntax errors: ${errors}`);
process.exit(errors > 0 ? 1 : 0);
