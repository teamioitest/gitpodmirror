const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const PAGES_TO_CRAWL = [
  '',
  'pricing',
  'stories',
  'docs',
  'cases/background-agent',
  'cases/automations',
  'cases/ona-environments',
  'stories/how-claude-code-escapes-its-own-denylist-and-sandbox',
  'compare/claude-code',
  'compare/cursor',
  'docs/changelog',
  'about',
  'legal/terms-of-service'
];

function getExistingPages(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      if (file === '_next' || file === 'assets' || file === 'images' || file === 'fonts') return;
      results = results.concat(getExistingPages(p, baseDir));
    } else if (file === 'index.html') {
      let rel = path.relative(baseDir, dir).replace(/\\/g, '/');
      results.push(rel);
    }
  });
  return results;
}

function getRelativePath(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.hostname === 'ona.com' || url.hostname === 'www.ona.com') {
      let rel = url.pathname;
      rel = rel.split('#')[0].split('?')[0];
      if (rel.startsWith('/')) rel = rel.slice(1);
      if (rel.endsWith('/')) rel = rel.slice(0, -1);
      return rel;
    }
  } catch (e) {}
  return null;
}

function shouldCrawl(relPath) {
  if (relPath === null || relPath === undefined) return false;
  const base = path.basename(relPath);
  if (base.includes('.') && !base.endsWith('.html')) return false;
  if (relPath.startsWith('_next') || relPath.startsWith('images') || relPath.startsWith('fonts') || relPath.startsWith('api')) return false;
  if (relPath.includes('?') || relPath.includes('#')) return false;
  return true;
}

function simulateQueue() {
  const existing = getExistingPages(PUBLIC_DIR);
  const queue = [...PAGES_TO_CRAWL];
  const visited = new Set();

  existing.forEach(p => {
    visited.add(p === '' ? '' : p);
  });

  // Extract from existing
  existing.forEach(p => {
    const filePath = p === '' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, p, 'index.html');
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const hrefRegex = /href="([^"]+)"/g;
        let match;
        while ((match = hrefRegex.exec(content)) !== null) {
          const link = match[1];
          let absoluteUrl = link;
          if (link.startsWith('/') || !link.startsWith('http')) {
            absoluteUrl = new URL(link, `https://ona.com/${p}`).toString();
          }
          const relPath = getRelativePath(absoluteUrl);
          if (shouldCrawl(relPath) && !visited.has(relPath) && !queue.includes(relPath)) {
            queue.push(relPath);
          }
        }
      } catch (e) {}
    }
  });

  console.log(`=== Simulation results ===`);
  console.log(`Visited size (already crawled): ${visited.size}`);
  console.log(`Queue size (to crawl): ${queue.length}`);
  
  // Check which of the missing docs pages are in the queue
  // Let's first identify the missing docs pages using the same logic
  const docsPages = [];
  const referencedDocsLinks = new Set();
  const htmlFiles = getExistingPages(PUBLIC_DIR).map(p => p === '' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, p, 'index.html'));

  htmlFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const hrefRegex = /href="([^"]+)"/g;
      let match;
      while ((match = hrefRegex.exec(content)) !== null) {
        let link = match[1];
        link = link.split('#')[0].split('?')[0];
        
        if (link.startsWith('/docs') || link.startsWith('docs/') || link.startsWith('https://ona.com/docs')) {
          let cleanLink = link;
          if (cleanLink.startsWith('https://ona.com')) {
            cleanLink = cleanLink.slice('https://ona.com'.length);
          }
          if (!cleanLink.startsWith('/')) {
            cleanLink = '/' + cleanLink;
          }
          if (cleanLink.endsWith('/')) {
            cleanLink = cleanLink.slice(0, -1);
          }
          const base = path.basename(cleanLink);
          if (base.includes('.') && !base.endsWith('.html')) continue;
          if (cleanLink.includes('/_next/') || cleanLink.includes('/_mintlify/') || cleanLink.includes('/images/') || cleanLink.includes('/fonts/') || cleanLink.includes('/api/') || cleanLink === '/docs') {
            continue;
          }
          referencedDocsLinks.add(cleanLink);
        }
      }
    } catch (e) {}
  });

  const missingDocs = [];
  referencedDocsLinks.forEach(link => {
    let relPath = link;
    if (relPath.startsWith('/')) relPath = relPath.slice(1);
    const targetPath = relPath === 'docs' 
      ? path.join(PUBLIC_DIR, 'docs', 'index.html')
      : path.join(PUBLIC_DIR, relPath, 'index.html');
    if (!fs.existsSync(targetPath)) {
      missingDocs.push(relPath);
    }
  });

  console.log(`Missing docs routes total: ${missingDocs.length}`);
  const inQueue = [];
  const notInQueue = [];
  missingDocs.forEach(d => {
    if (queue.includes(d)) {
      inQueue.push(d);
    } else {
      notInQueue.push(d);
    }
  });

  console.log(`Missing docs in queue: ${inQueue.length}`);
  console.log(`Missing docs NOT in queue: ${notInQueue.length}`);
  if (notInQueue.length > 0) {
    console.log(`\nSample NOT in queue:`);
    notInQueue.slice(0, 10).forEach(d => console.log(`  - ${d}`));
  }
}

simulateQueue();
