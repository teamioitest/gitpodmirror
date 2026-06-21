const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 9889;
const PUBLIC_DIR = '/home/heathledger/Documents/ioi/repos/ioi/internal-docs/reverse-engineering/ona/public';

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let pathname = req.url.split('?')[0];
      if (pathname.endsWith('/') && pathname !== '/') {
        pathname = pathname.slice(0, -1);
      }
      let filePath = path.join(PUBLIC_DIR, pathname);
      if (!fs.existsSync(filePath) || fs.lstatSync(filePath).isDirectory()) {
        const indexFile = path.join(filePath, 'index.html');
        if (fs.existsSync(indexFile)) {
          filePath = indexFile;
        } else if (fs.existsSync(filePath + '.html')) {
          filePath = filePath + '.html';
        } else {
          filePath = path.join(PUBLIC_DIR, 'index.html');
        }
      }
      
      let contentType = 'text/html';
      const ext = path.extname(filePath);
      if (ext === '.js') contentType = 'application/javascript';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  
  // 1. Get HTML without JavaScript (pure server-rendered)
  const contextNoJS = await browser.newContext({ javaScriptEnabled: false });
  const pageNoJS = await contextNoJS.newPage();
  await pageNoJS.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  const htmlNoJS = await pageNoJS.content();
  await contextNoJS.close();
  
  // 2. Get HTML with JavaScript (after hydration)
  const contextJS = await browser.newContext({
    javaScriptEnabled: true,
    timezoneId: 'UTC',
    locale: 'en-US'
  });
  const pageJS = await contextJS.newPage();
  
  // Setup location prototypes as in verify.js
  await pageJS.addInitScript(() => {
    Object.defineProperty(Location.prototype, 'hostname', { get() { return 'ona.com'; }, configurable: true });
    Object.defineProperty(Location.prototype, 'host', { get() { return 'ona.com'; }, configurable: true });
    Object.defineProperty(Location.prototype, 'origin', { get() { return 'https://ona.com'; }, configurable: true });
    Object.defineProperty(Location.prototype, 'protocol', { get() { return 'https:'; }, configurable: true });
    Object.defineProperty(Location.prototype, 'port', { get() { return ''; }, configurable: true });
    Object.defineProperty(Location.prototype, 'href', {
      get() { return window.location.toString().replace(/https?:\/\/localhost:\d+/i, 'https://ona.com'); },
      configurable: true
    });
    Object.defineProperty(Location.prototype, 'toString', { value: function() { return this.href; }, configurable: true });
    Object.defineProperty(Document.prototype, 'domain', { get() { return 'ona.com'; }, configurable: true });
    
    window.__wm = {
      init() {},
      wombat() {},
      assign_function() { return () => {}; },
      assign_functions() {}
    };
    window.archive_analytics = { values: {}, send_pageview() {} };
    
    // Mock URL.createObjectURL to prevent video src from changing to blob
    window.URL.createObjectURL = function() {
      return '';
    };
  });

  // Freeze Date/time to May 9, 2026 00:08:21 UTC
  await pageJS.addInitScript(() => {
    const OriginalDate = window.Date;
    const startTime = 1778285301000;
    const MockDate = new Proxy(OriginalDate, {
      construct(target, args) {
        return args.length === 0 ? new target(startTime) : new target(...args);
      },
      apply(target, thisArg, args) {
        return args.length === 0 ? new OriginalDate(startTime).toString() : OriginalDate.apply(thisArg, args);
      }
    });
    MockDate.now = () => startTime;
    MockDate.parse = OriginalDate.parse;
    MockDate.UTC = OriginalDate.UTC;
    MockDate.prototype = OriginalDate.prototype;
    window.Date = MockDate;
  });

  // Capture page error to see if it still mismatches
  pageJS.on('pageerror', (err) => {
    console.log('[BROWSER PAGE ERROR]', err.message);
  });

  await pageJS.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await pageJS.waitForTimeout(50); // Wait briefly for hydration but before async state changes
  const htmlJS = await pageJS.content();
  await contextJS.close();
  
  await browser.close();
  server.close();
  
  // Clean up and compare HTML structures
  function cleanHtml(html) {
    // Strip only comments to compare layout and attributes, keeping scripts/styles
    return html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Compare Head and Body separately
  const headNoJS = cleanHtml(htmlNoJS.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || '');
  const headJS = cleanHtml(htmlJS.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || '');
  
  const bodyNoJS = cleanHtml(htmlNoJS.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '');
  const bodyJS = cleanHtml(htmlJS.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '');

  const htmlTagNoJS = htmlNoJS.match(/<html\b[^>]*>/i)?.[0];
  const htmlTagJS = htmlJS.match(/<html\b[^>]*>/i)?.[0];
  const bodyTagNoJS = htmlNoJS.match(/<body\b[^>]*>/i)?.[0];
  const bodyTagJS = htmlJS.match(/<body\b[^>]*>/i)?.[0];
  
  console.log('--- ROOT TAGS ---');
  console.log('Server html tag:', htmlTagNoJS);
  console.log('Client html tag:', htmlTagJS);
  console.log('Server body tag:', bodyTagNoJS);
  console.log('Client body tag:', bodyTagJS);
  
  console.log('\n--- HEAD COMPARISON ---');
  if (headNoJS === headJS) {
    console.log('SUCCESS: Head matches exactly!');
  } else {
    console.log('FAILURE: Head differs!');
    findDifference(headNoJS, headJS);
  }
  
  console.log('\n--- BODY COMPARISON ---');
  if (bodyNoJS === bodyJS) {
    console.log('SUCCESS: Body matches exactly!');
  } else {
    console.log('FAILURE: Body differs!');
    findDifference(bodyNoJS, bodyJS);
  }
}

function findDifference(s1, s2) {
  let diffIdx = -1;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] !== s2[i]) {
      diffIdx = i;
      break;
    }
  }
  if (diffIdx !== -1) {
    console.log('Difference found at character:', diffIdx);
    console.log('\n--- SERVER HTML (No JS) ---');
    console.log(s1.slice(Math.max(0, diffIdx - 100), diffIdx + 300));
    console.log('\n--- CLIENT HTML (JS) ---');
    console.log(s2.slice(Math.max(0, diffIdx - 100), diffIdx + 300));
  }
}

run().catch(console.error);
