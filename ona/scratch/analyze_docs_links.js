const fs = require('fs');
const path = require('path');

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
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

function analyzeDocs() {
  const files = getFilesRecursively(PUBLIC_DIR);
  const htmlFiles = files.filter(f => f.endsWith('.html'));

  const docsPages = [];
  const referencedDocsLinks = new Set();

  htmlFiles.forEach(file => {
    const relPath = path.relative(PUBLIC_DIR, file).replace(/\\/g, '/');
    // Check if it is a docs page
    if (relPath.startsWith('docs/')) {
      docsPages.push(relPath);
    }

    // Extract links
    try {
      const content = fs.readFileSync(file, 'utf8');
      const hrefRegex = /href="([^"]+)"/g;
      let match;
      while ((match = hrefRegex.exec(content)) !== null) {
        let link = match[1];
        // Strip hash and query params
        link = link.split('#')[0].split('?')[0];
        
        // Normalize relative/absolute links matching /docs
        if (link.startsWith('/docs') || link.startsWith('docs/') || link.startsWith('https://ona.com/docs')) {
          let cleanLink = link;
          if (cleanLink.startsWith('https://ona.com')) {
            cleanLink = cleanLink.slice('https://ona.com'.length);
          }
          if (!cleanLink.startsWith('/')) {
            cleanLink = '/' + cleanLink;
          }
          // Remove trailing slash
          if (cleanLink.endsWith('/')) {
            cleanLink = cleanLink.slice(0, -1);
          }
          
          // Ignore asset extensions and folders
          const base = path.basename(cleanLink);
          if (base.includes('.') && !base.endsWith('.html')) {
            continue;
          }
          if (
            cleanLink.includes('/_next/') ||
            cleanLink.includes('/_mintlify/') ||
            cleanLink.includes('/images/') ||
            cleanLink.includes('/fonts/') ||
            cleanLink.includes('/api/') ||
            cleanLink === '/docs' // Root /docs is redirected
          ) {
            continue;
          }
          
          referencedDocsLinks.add(cleanLink);
        }
      }
    } catch (e) {
      console.error(`Error reading ${file}:`, e);
    }
  });

  console.log(`=== Docs Analysis ===`);
  console.log(`Total real docs HTML pages found locally: ${docsPages.length}`);
  console.log(`Total unique docs links referenced: ${referencedDocsLinks.size}`);

  const missingLinks = [];
  const existingLinks = [];

  referencedDocsLinks.forEach(link => {
    // Check if the link exists locally
    // For a link like /docs/ona/getting-started, check public/docs/ona/getting-started/index.html
    let relPath = link;
    if (relPath.startsWith('/')) relPath = relPath.slice(1);
    
    // Root /docs page is mapped to docs/index.html
    const targetPath = relPath === 'docs' 
      ? path.join(PUBLIC_DIR, 'docs', 'index.html')
      : path.join(PUBLIC_DIR, relPath, 'index.html');

    if (fs.existsSync(targetPath)) {
      existingLinks.push(link);
    } else {
      missingLinks.push(link);
    }
  });

  console.log(`Existing referenced docs pages: ${existingLinks.length}`);
  console.log(`Missing referenced docs pages: ${missingLinks.length}`);
  
  if (missingLinks.length > 0) {
    console.log(`\nSample of missing routes (first 20):`);
    missingLinks.slice(0, 20).forEach(l => console.log(`  - ${l}`));
  }
}

analyzeDocs();
