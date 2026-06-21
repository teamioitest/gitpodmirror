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

const inputs = [
  'color: transparent;',
  'color:transparent',
  'transform: scaleX(0);',
  'opacity: 1; transform: none;',
  'margin-top: 10px;',
];

inputs.forEach(input => {
  console.log(`Input: "${input}" -> Output: "${translateWaybackUrls(input)}"`);
});
