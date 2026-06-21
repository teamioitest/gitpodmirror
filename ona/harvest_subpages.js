const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'https://ona.com/';
const PUBLIC_DIR = path.join(__dirname, 'public');

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

function ensureDirSync(dirPath) {
  if (fs.existsSync(dirPath)) {
    const stat = fs.statSync(dirPath);
    if (stat.isDirectory()) return;
    fs.unlinkSync(dirPath);
  }
  const parent = path.dirname(dirPath);
  ensureDirSync(parent);
  fs.mkdirSync(dirPath);
}

async function runHarvester() {
  console.log(`[HARVESTER] Initializing crawler...`);
  console.log(`[HARVESTER] Target URL: ${TARGET_URL}`);
  console.log(`[HARVESTER] Public directory: ${PUBLIC_DIR}`);

  // Create public directory initially
  ensureDirSync(PUBLIC_DIR);

  const browser = await chromium.launch({ headless: true });
  
  const contextJS = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    javaScriptEnabled: true
  });

  const contextNoJS = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    javaScriptEnabled: false
  });

  const pageJS = await contextJS.newPage();
  const pageNoJS = await contextNoJS.newPage();

  // Intercept and save all asset responses on JS page
  pageJS.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    if (status !== 200) return;

    // Check if the URL is part of the target domains for ona.com
    const match = url.match(/^https?:\/\/(?:www\.)?(?:ona\.com|app\.gitpod\.io|onastatus\.com|trust\.ona\.com|background-agents\.com)\/(.*)/);
    if (!match) return;

    let relativePath = match[1] || '';
    // Strip query parameters
    relativePath = relativePath.split('?')[0];
    if (!relativePath) return;

    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('text/html') || contentType.includes('text/x-component')) {
      // HTML Pages and dynamic React components are ignored in asset logging
      return;
    }

    try {
      const buffer = await response.body();
      const destPath = path.join(PUBLIC_DIR, relativePath);
      ensureDirSync(path.dirname(destPath));
      fs.writeFileSync(destPath, buffer);
      console.log(`[ASSET SAVED] ${relativePath} (${contentType})`);
    } catch (err) {
      // Quiet fail for responses that cannot have bodies (e.g. redirected/opaque)
    }
  });

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
    } catch (e) {
      // Ignore
    }
    return null;
  }

  function shouldCrawl(relPath) {
    if (relPath === null || relPath === undefined) return false;
    // If it has a file extension, ignore unless it is .html
    const base = path.basename(relPath);
    if (base.includes('.')) {
      if (!base.endsWith('.html')) {
        return false;
      }
    }
    // Ignore external or common asset paths
    if (relPath.startsWith('_next') || relPath.startsWith('images') || relPath.startsWith('fonts') || relPath.startsWith('api')) {
      return false;
    }
    // Ignore query params or hash pages
    if (relPath.includes('?') || relPath.includes('#')) {
      return false;
    }
    return true;
  }

  const queue = [...PAGES_TO_CRAWL];
  const visited = new Set();
  const MAX_PAGES = 800;

  // Pre-populate visited with already crawled pages to resume crawl and skip duplicates
  const getExistingPages = (dir, baseDir = dir) => {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    fs.readdirSync(dir).forEach(file => {
      const p = path.join(dir, file);
      if (fs.statSync(p).isDirectory()) {
        // Skip _next and assets folders
        if (file === '_next' || file === 'assets' || file === 'images' || file === 'fonts') return;
        results = results.concat(getExistingPages(p, baseDir));
      } else if (file === 'index.html') {
        let rel = path.relative(baseDir, dir).replace(/\\/g, '/');
        results.push(rel);
      }
    });
    return results;
  };
  
  const existing = getExistingPages(PUBLIC_DIR);
  existing.forEach(p => {
    // Normalize root
    if (p === '') {
      visited.add('');
    } else {
      visited.add(p);
    }
  });
  console.log(`[RESUME] Discovered ${visited.size} already crawled pages to skip.`);

  // Parse links from existing HTML files to find any missing queued pages
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
  console.log(`[RESUME] Populate queue from local files. Total queue size: ${queue.length}`);

  // Prioritize docs pages to harvest them first
  queue.sort((a, b) => {
    const aIsDocs = a.startsWith('docs/');
    const bIsDocs = b.startsWith('docs/');
    if (aIsDocs && !bIsDocs) return -1;
    if (!aIsDocs && bIsDocs) return 1;
    return 0;
  });

  while (queue.length > 0) {
    const crawlPath = queue.shift();
    if (visited.has(crawlPath)) continue;
    visited.add(crawlPath);

    if (visited.size >= MAX_PAGES) {
      console.log(`[CRAWLER] Reached max page limit of ${MAX_PAGES}. Skipping further crawl.`);
      break;
    }

    const pageUrl = crawlPath ? `${TARGET_URL}${crawlPath}` : TARGET_URL;
    console.log(`\n[CRAWLING] Visiting: ${pageUrl} (Queue size: ${queue.length}, Visited: ${visited.size})`);

    // 1. Visit JS page to trigger asset downloading
    try {
      console.log(`  - [JS ENABLED] Triggering asset downloads: ${pageUrl}`);
      await pageJS.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
      await pageJS.waitForTimeout(3000);
    } catch (err) {
      console.warn(`  - [JS ENABLED WARNING] Load failed/timed out: ${err.message}`);
    }

    // 2. Visit No-JS page to capture clean SSR HTML
    let html = '';
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`  - [JS DISABLED] Capturing HTML (attempt ${attempt}): ${pageUrl}`);
        await pageNoJS.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
        html = await pageNoJS.content();
        success = true;
        break;
      } catch (err) {
        console.warn(`  - [JS DISABLED WARNING] Attempt ${attempt} failed: ${err.message}`);
        if (attempt < 3) {
          await pageNoJS.waitForTimeout(2000);
        }
      }
    }

    if (!success) {
      console.error(`[CRAWL ERROR] Permanently failed crawling No-JS for ${pageUrl}`);
      continue;
    }

    try {
      // Clean the DOM inside Playwright before grabbing content
      await pageNoJS.evaluate(() => {
        const cleanUrl = (urlStr) => {
          if (!urlStr) return urlStr;
          try {
            const url = new URL(urlStr, window.location.origin);
            if (url.hostname === 'ona.com' || url.hostname === 'www.ona.com') {
              return url.pathname + url.search + url.hash;
            }
          } catch (e) {}
          return urlStr;
        };

        document.querySelectorAll('[href]').forEach(el => {
          const href = el.getAttribute('href');
          const cleaned = cleanUrl(href);
          if (cleaned !== href) {
            el.setAttribute('href', cleaned);
          }
        });

        document.querySelectorAll('[src]').forEach(el => {
          const src = el.getAttribute('src');
          const cleaned = cleanUrl(src);
          if (cleaned !== src) {
            el.setAttribute('src', cleaned);
          }
        });

        document.querySelectorAll('[action]').forEach(el => {
          const action = el.getAttribute('action');
          const cleaned = cleanUrl(action);
          if (cleaned !== action) {
            el.setAttribute('action', cleaned);
          }
        });
      });

      // Extract discovered links for dynamic queueing from fully hydrated pageJS
      const extractedLinks = await pageJS.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map(a => a.getAttribute('href'))
          .filter(Boolean);
      });

      const resolvedPageUrl = pageJS.url();
      for (const link of extractedLinks) {
        let absoluteUrl = link;
        if (link.startsWith('/') || !link.startsWith('http')) {
          try {
            absoluteUrl = new URL(link, resolvedPageUrl).toString();
          } catch (e) {}
        }
        const relPath = getRelativePath(absoluteUrl);
        if (shouldCrawl(relPath) && !visited.has(relPath) && !queue.includes(relPath)) {
          console.log(`[DISCOVERED] Queueing new subpage: ${relPath}`);
          queue.push(relPath);
        }
      }

      // Retrieve cleaned HTML content
      html = await pageNoJS.content();

      // Additional text-based regex cleaning for robustness
      html = html.replace(/<!--\s*FILE ARCHIVED ON[\s\S]*?-->/g, '');
      html = html.replace(/<script[^>]*src="[^"]*archive\.org[^"]*"[^>]*><\/script>/gi, '');
      html = html.replace(/<link[^>]*href="[^"]*archive\.org[^"]*"[^>]*>/gi, '');
      html = html.replace(/<script[^>]*src="[^"]*playback\.js[^"]*"[^>]*><\/script>/gi, '');
      
      // Save HTML to output file
      let destHtmlPath;
      if (!crawlPath) {
        destHtmlPath = path.join(PUBLIC_DIR, 'index.html');
      } else {
        destHtmlPath = path.join(PUBLIC_DIR, crawlPath, 'index.html');
      }

      ensureDirSync(path.dirname(destHtmlPath));
      fs.writeFileSync(destHtmlPath, html, 'utf8');
      console.log(`[HTML SAVED] ${crawlPath || '(root)'} -> ${destHtmlPath}`);

    } catch (err) {
      console.error(`[CRAWL ERROR] Failed processing ${pageUrl}:`, err.message);
    }
  }

  await browser.close();
  console.log(`\n[HARVESTER SUCCESS] Finished harvesting!`);
}

runHarvester().catch((err) => {
  console.error('[HARVESTER FATAL]', err);
  process.exit(1);
});
