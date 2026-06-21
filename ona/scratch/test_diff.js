const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 9893;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

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
  const browser = await chromium.launch();
  
  const contextNoJS = await browser.newContext({ javaScriptEnabled: false });
  const pageNoJS = await contextNoJS.newPage();
  await pageNoJS.goto(`http://localhost:${PORT}/compare/cursor`, { waitUntil: 'load' });
  const htmlNoJS = await pageNoJS.content();
  await contextNoJS.close();

  const contextJS = await browser.newContext({ javaScriptEnabled: true });
  const pageJS = await contextJS.newPage();
  
  // Setup standard location proxies as in verify.js to prevent redirect
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
  });

  await pageJS.goto(`http://localhost:${PORT}/compare/cursor`, { waitUntil: 'load' });
  await pageJS.waitForTimeout(2000);
  const htmlJS = await pageJS.content();
  await contextJS.close();
  await browser.close();
  server.close();

  const cleanHtml = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  const s1 = cleanHtml(htmlNoJS.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)[1]);
  const s2 = cleanHtml(htmlJS.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)[1]);

  console.log('s1 length:', s1.length, 's2 length:', s2.length);
  let diffIdx = -1;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] !== s2[i]) {
      diffIdx = i;
      break;
    }
  }
  console.log('Diff index:', diffIdx);
  if (diffIdx !== -1) {
    console.log('s1 context:', JSON.stringify(s1.slice(diffIdx - 10, diffIdx + 30)));
    console.log('s2 context:', JSON.stringify(s2.slice(diffIdx - 10, diffIdx + 30)));
  } else {
    console.log('NO DIFF IN BODY');
  }
}
run().catch(console.error);
