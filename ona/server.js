#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

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
    } catch (e) {
      // ignore
    }
  });
  console.log(`[SERVER] Discovered ${Object.keys(chunkMap).length} chunk mappings from HTML files.`);
}

buildChunkMap();

const server = http.createServer((req, res) => {
  let pathname;
  let hasRsc = false;
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = urlObj.pathname;
    hasRsc = urlObj.searchParams.has('_rsc');
  } catch (e) {
    pathname = req.url.split('?')[0];
    hasRsc = req.url.includes('_rsc=');
  }

  // Strip Wayback Machine prefix if present
  const waybackRegex = /^\/web\/[0-9]+[a-z_]*\/https?:\/\/(?:www\.)?(?:ona\.com|app\.gitpod\.io|onastatus\.com|trust\.ona\.com|background-agents\.com)\/(.*)/i;
  const waybackMatch = pathname.match(waybackRegex);
  if (waybackMatch) {
    pathname = '/' + waybackMatch[1];
  } else {
    const relativeWaybackRegex = /^\/web\/[0-9]+[a-z_]*\/(.*)/i;
    const relativeWaybackMatch = pathname.match(relativeWaybackRegex);
    if (relativeWaybackMatch) {
      pathname = '/' + relativeWaybackMatch[1];
    }
  }

  // Remove trailing slash
  if (pathname.endsWith('/') && pathname !== '/') {
    pathname = pathname.slice(0, -1);
  }

  // Intercept RSC prefetch requests to prevent parsing index.html fallbacks
  if (hasRsc) {
    console.log(`[SERVER] Mocking RSC call: ${pathname}`);
    res.writeHead(200, { 'Content-Type': 'text/x-component' });
    res.end();
    return;
  }

  // Wildcard API Mocking
  if (pathname.startsWith('/api/') && !fs.existsSync(path.join(PUBLIC_DIR, pathname))) {
    console.log(`[SERVER] Mocking API call: ${pathname}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({}));
    return;
  }

  let filePath = path.join(PUBLIC_DIR, pathname);

  // Missing JS chunks/assets fallback mock (returns 200 OK to prevent client-side ChunkLoadErrors)
  if (pathname.endsWith('.js') && !fs.existsSync(filePath)) {
    const filename = path.basename(pathname);
    let fallbackChunkId = chunkMap[filename];
    
    if (fallbackChunkId === undefined) {
      const chunkMatch = filename.match(/^([a-zA-Z0-9_-]+?)(?:[-.][a-f0-9]+)?\.js$/);
      fallbackChunkId = 'unknown';
      if (chunkMatch) {
        fallbackChunkId = chunkMatch[1];
        if (/^\d+$/.test(fallbackChunkId)) {
          fallbackChunkId = parseInt(fallbackChunkId, 10);
        }
      }
    }
    
    const mockContent = `
      (() => {
        let chunkId = ${JSON.stringify(fallbackChunkId)};
        const filename = ${JSON.stringify(filename)};
        const scriptEl = document.querySelector(\`script[src*="\${filename}"]\`);
        if (scriptEl) {
          const dw = scriptEl.getAttribute('data-webpack');
          if (dw && dw.includes(':')) {
            const parts = dw.split(':');
            let id = parts[parts.length - 1];
            if (id.startsWith('chunk-')) {
              id = id.slice(6);
            }
            chunkId = /^\\d+$/.test(id) ? parseInt(id, 10) : id;
          }
        }
        (self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([[chunkId], {}]);
      })();
    `;
    console.log(`[SERVER] Mocking missing JS chunk/asset: ${pathname}`);
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(mockContent);
    return;
  }

  // Missing CSS assets fallback mock (returns 200 OK to prevent 404/403 errors)
  if (pathname.endsWith('.css') && !fs.existsSync(filePath)) {
    console.log(`[SERVER] Mocking missing CSS: ${pathname}`);
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end('/* mocked CSS */');
    return;
  }

  // Missing image assets fallback mock (returns 200 OK with 1x1 transparent PNG/SVG to prevent 404/403 errors)
  if (/\.(png|jpg|jpeg|gif|ico|svg|webp)$/i.test(pathname) && !fs.existsSync(filePath)) {
    console.log(`[SERVER] Mocking missing image asset: ${pathname}`);
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const contentType = pathname.endsWith('.svg') ? 'image/svg+xml' : (pathname.endsWith('.webp') ? 'image/webp' : 'image/png');
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(pathname.endsWith('.svg') ? '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' : Buffer.from(pngBase64, 'base64'));
    return;
  }

  // Missing font assets fallback mock (returns 200 OK with empty body to prevent 404/403 errors)
  if (/\.(woff|woff2|ttf|otf|eot)$/i.test(pathname) && !fs.existsSync(filePath)) {
    console.log(`[SERVER] Mocking missing font asset: ${pathname}`);
    res.writeHead(200, { 'Content-Type': 'font/woff2' });
    res.end(Buffer.alloc(0));
    return;
  }

  // SPA Routing Fallback
  if (!fs.existsSync(filePath) || fs.lstatSync(filePath).isDirectory()) {
    if (!path.extname(filePath)) {
      const pathWithIndex = path.join(filePath, 'index.html');
      if (fs.existsSync(pathWithIndex)) {
        filePath = pathWithIndex;
      } else if (fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      } else {
        // Fallback to SPA root index.html
        filePath = path.join(PUBLIC_DIR, 'index.html');
      }
    }
  }

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('404 Not Found');
    return;
  }

  // Determine content type
  let contentType = 'text/html';
  const ext = path.extname(filePath);
  switch (ext) {
    case '.js': contentType = 'application/javascript'; break;
    case '.css': contentType = 'text/css'; break;
    case '.json': contentType = 'application/json'; break;
    case '.png': contentType = 'image/png'; break;
    case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
    case '.gif': contentType = 'image/gif'; break;
    case '.svg': contentType = 'image/svg+xml'; break;
    case '.woff2': contentType = 'font/woff2'; break;
    case '.ico': contentType = 'image/x-icon'; break;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`   ONA MIRROR STATIC SERVER STARTED SUCCESSFULLY`);
  console.log(`============================================================`);
  console.log(`Local URL:  http://localhost:${PORT}`);
  console.log(`Serving:    ${PUBLIC_DIR}`);
  console.log(`============================================================`);
});
