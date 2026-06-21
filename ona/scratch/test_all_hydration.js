const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 9891;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const testPaths = [
  '/',
  '/pricing',
  '/stories',
  '/docs',
  '/cases/background-agent',
  '/cases/automations',
  '/cases/ona-environments',
  '/stories/how-claude-code-escapes-its-own-denylist-and-sandbox',
  '/compare/claude-code',
  '/compare/cursor',
  '/docs/changelog',
  '/about',
  '/legal/terms-of-service'
];

const chunkMap = {};

function buildChunkMap() {
  const getFiles = (dir) => {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    fs.readdirSync(dir).forEach(file => {
      const p = path.join(dir, file);
      if (fs.statSync(p).isDirectory()) {
        results = results.concat(getFiles(p));
      } else if (file.endsWith('.html')) {
        results.push(p);
      }
    });
    return results;
  };

  const htmlFiles = getFiles(PUBLIC_DIR);
  const regex = /\\?"(\d+)\\?",\\?"static\/chunks\/([^?"]+?\.js)(?:\?[^"]*)?\\?"/g;

  htmlFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const id = parseInt(match[1], 10);
        const chunkPath = match[2];
        const filename = path.basename(chunkPath);
        chunkMap[filename] = id;
      }
    } catch (e) {}
  });
}

function startServer() {
  buildChunkMap();
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let pathname = req.url.split('?')[0];
      if (pathname.endsWith('/') && pathname !== '/') {
        pathname = pathname.slice(0, -1);
      }
      
      // API mocking
      if (pathname.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
        return;
      }

      let filePath = path.join(PUBLIC_DIR, pathname);

      // JS Chunk mocking
      if (pathname.endsWith('.js') && !fs.existsSync(filePath)) {
        const filename = path.basename(pathname);
        let fallbackChunkId = chunkMap[filename] || 'unknown';
        const mockContent = `(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([[${JSON.stringify(fallbackChunkId)}], {}]);`;
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(mockContent);
        return;
      }

      // CSS fallback
      if (pathname.endsWith('.css') && !fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('/* mocked css */');
        return;
      }

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

function cleanHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    return {
      index: diffIdx,
      noJS: s1.slice(Math.max(0, diffIdx - 50), diffIdx + 150),
      JS: s2.slice(Math.max(0, diffIdx - 50), diffIdx + 150)
    };
  }
  return null;
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch();
  
  for (const testPath of testPaths) {
    console.log(`\n=================== PATH: ${testPath} ===================`);
    
    let htmlNoJS = '';
    let htmlJS = '';
    let browserErrors = [];

    try {
      // 1. Get HTML without JS
      const contextNoJS = await browser.newContext({ javaScriptEnabled: false });
      const pageNoJS = await contextNoJS.newPage();
      await pageNoJS.goto(`http://localhost:${PORT}${testPath}`, { waitUntil: 'load', timeout: 5000 });
      try {
        htmlNoJS = await pageNoJS.content();
      } catch (e) {
        // Fallback wait if redirect in progress
        await pageNoJS.waitForTimeout(1000);
        htmlNoJS = await pageNoJS.content();
      }
      await contextNoJS.close();
    } catch (err) {
      console.warn(`[No-JS Page load error]:`, err.message);
      continue;
    }
    
    try {
      // 2. Get HTML with JS (stabilized with location mocks & date mock)
      const contextJS = await browser.newContext({
        javaScriptEnabled: true,
        timezoneId: 'UTC',
        locale: 'en-US'
      });
      const pageJS = await contextJS.newPage();
      
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
      });

      // Date mock (May 9, 2026)
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

      pageJS.on('pageerror', (err) => {
        browserErrors.push(err.message);
      });

      pageJS.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
        }
      });

      await pageJS.goto(`http://localhost:${PORT}${testPath}`, { waitUntil: 'load', timeout: 5000 });
      await pageJS.waitForTimeout(2000); // Wait for hydration
      try {
        htmlJS = await pageJS.content();
      } catch (e) {
        await pageJS.waitForTimeout(1000);
        htmlJS = await pageJS.content();
      }
      await contextJS.close();
    } catch (err) {
      console.warn(`[JS Page load error]:`, err.message);
      continue;
    }

    console.log('Browser errors caught:', browserErrors);

    const htmlTagNoJS = htmlNoJS.match(/<html\b[^>]*>/i)?.[0];
    const htmlTagJS = htmlJS.match(/<html\b[^>]*>/i)?.[0];
    const bodyTagNoJS = htmlNoJS.match(/<body\b[^>]*>/i)?.[0];
    const bodyTagJS = htmlJS.match(/<body\b[^>]*>/i)?.[0];
    
    console.log('HTML tag No-JS:', htmlTagNoJS);
    console.log('HTML tag JS:   ', htmlTagJS);
    console.log('Body tag No-JS:', bodyTagNoJS);
    console.log('Body tag JS:   ', bodyTagJS);

    const bodyNoJS = cleanHtml(htmlNoJS.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '');
    const bodyJS = cleanHtml(htmlJS.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '');
    
    if (bodyNoJS === bodyJS) {
      console.log('SUCCESS: Body matches exactly!');
    } else {
      console.log('FAILURE: Body mismatch!');
      const diff = findDifference(bodyNoJS, bodyJS);
      if (diff) {
        console.log('Diff at index:', diff.index);
        console.log('No-JS:', diff.noJS);
        console.log('JS:   ', diff.JS);
      }
    }
  }
  
  await browser.close();
  server.close();
}

run().catch(console.error);
