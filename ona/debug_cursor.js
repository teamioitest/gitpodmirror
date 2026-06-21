const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9555;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Start a mini static server like verify.js
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = req.url.split('?')[0];
      let filePath = path.join(PUBLIC_DIR, pathname);
      
      if (!fs.existsSync(filePath) || fs.lstatSync(filePath).isDirectory()) {
        if (!path.extname(filePath)) {
          const pathWithIndex = path.join(filePath, 'index.html');
          if (fs.existsSync(pathWithIndex)) {
            filePath = pathWithIndex;
          } else if (fs.existsSync(filePath + '.html')) {
            filePath = filePath + '.html';
          } else {
            filePath = path.join(PUBLIC_DIR, 'index.html');
          }
        }
      }

      let contentType = 'text/html';
      if (filePath.endsWith('.js')) contentType = 'application/javascript';
      else if (filePath.endsWith('.css')) contentType = 'text/css';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function debug() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Setup location/document mocks as in verify.js
  await page.addInitScript(() => {
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
    
    window.__wm = { init() {}, wombat() {}, assign_function() { return () => {}; }, assign_functions() {} };
    window.archive_analytics = { values: {}, send_pageview() {} };
  });

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`[BROWSER PAGE ERROR] ${err.stack || err.message}`);
  });

  page.on('request', req => {
    console.log(`[BROWSER REQUEST] ${req.url()}`);
  });

  console.log(`Loading /compare/cursor...`);
  await page.goto(`http://localhost:${PORT}/compare/cursor`);
  await page.waitForTimeout(3000);

  await browser.close();
  server.close();
}

debug().catch(console.error);
