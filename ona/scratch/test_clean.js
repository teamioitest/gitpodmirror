const fs = require('fs');

function translateWaybackUrls(text, isJs = false) {
  if (typeof text !== 'string') return text;
  
  // 1. Replace Wayback prefix with target ona.com/path -> /path
  text = text.replace(/(?:\/web\/[0-9]+[a-z_]*|https?:\/\/web\.archive\.org\/web\/[0-9]+[a-z_]*)\/https?:\/\/(?:www\.)?ona\.com\/([a-zA-Z0-9._-]+.*)/gi, (match, path) => {
    return '/' + path;
  });
  text = text.replace(/(?:\/web\/[0-9]+[a-z_]*|https?:\/\/web\.archive\.org\/web\/[0-9]+[a-z_]*)\/https?:\/\/(?:www\.)?ona\.com\/?/gi, '/');

  // 2. Replace Wayback prefix with external absolute targets -> absolute target URL
  text = text.replace(/(?:\/web\/[0-9]+[a-z_]*|https?:\/\/web\.archive\.org\/web\/[0-9]+[a-z_]*)\/(https?:\/\/[a-zA-Z0-9.-]+)/gi, '$1');

  // 3. Replace relative Wayback prefixes -> root relative path (e.g. /_next/...)
  text = text.replace(/(?:\/web\/[0-9]+[a-z_]*|https?:\/\/web\.archive\.org\/web\/[0-9]+[a-z_]*)\/([a-zA-Z0-9_-]+)/gi, '/$1');

  if (!isJs) {
    // 4. Translate absolute target domain links to relative paths
    text = text.replace(/https?:\/\/(?:www\.)?ona\.com\/([a-zA-Z0-9._-]+.*)/gi, (match, path) => {
      return '/' + path;
    });
    text = text.replace(/https?:\/\/(?:www\.)?ona\.com\/?/gi, '/');

    // 5. Strip ?dpl=... and &dpl=... query parameters robustly (including percent-encoded chars)
    text = text.replace(/(?:&amp;|&)dpl=[^"'\s&>;]*/gi, '');
    text = text.replace(/\?dpl=[^"'\s&>;]*/gi, '');
  }

  return text;
}

function cleanHtml(content) {
  let cleaned = content;
  
  // Extract scripts
  const scriptContents = [];
  cleaned = cleaned.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, content) => {
    scriptContents.push({ attrs, content });
    return `<!--SCRIPT_PLACEHOLDER_${scriptContents.length - 1}-->`;
  });

  // Translate attributes
  const attrRegex = /(href|src|srcset|action|content|style)\s*=\s*["']([^"']*)["']/gi;
  cleaned = cleaned.replace(attrRegex, (match, attrName, attrValue) => {
    return `${attrName}="${translateWaybackUrls(attrValue)}"`;
  });

  // Restore scripts
  cleaned = cleaned.replace(/<!--SCRIPT_PLACEHOLDER_(\d+)-->/g, (match, index) => {
    const item = scriptContents[parseInt(index, 10)];
    return `<script${item.attrs}>${item.content}</script>`;
  });

  return cleaned;
}

const inputHtml = `<img alt="" loading="lazy" width="40" height="40" decoding="async" data-nimg="1" class="floating-announcement_iconImage__D3kX5" src="/web/20260422095256im_/https://ona.com/images/banner-generic-image.webp" style="color: transparent;">`;
console.log('Result:', cleanHtml(inputHtml));
