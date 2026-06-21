const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');

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
    // But do not strip them from CSS or JS assets to match Next.js deployment versions
    const isAsset = /\.(?:css|js)(?:\?|$)/i.test(text);
    if (!isAsset) {
      text = text.replace(/(?:&amp;|&)dpl=[^"'\s&>;]*/gi, '');
      text = text.replace(/\?dpl=[^"'\s&>;]*/gi, '');
    }
  }

  return text;
}

function cleanHydrationScript(content) {
  if (typeof content !== 'string') return content;
  
  // 1. Replace Wayback prefix with target ona.com/path -> /path
  let text = content.replace(/(?:\/web\/[0-9]+[a-z_]*|https?:\/\/web\.archive\.org\/web\/[0-9]+[a-z_]*)\/https?:\/\/(?:www\.)?ona\.com\/([a-zA-Z0-9._-]+.*)/gi, (match, path) => {
    return '/' + path;
  });
  text = text.replace(/(?:\/web\/[0-9]+[a-z_]*|https?:\/\/web\.archive\.org\/web\/[0-9]+[a-z_]*)\/https?:\/\/(?:www\.)?ona\.com\/?/gi, '/');

  // 2. Replace Wayback prefix with external absolute targets -> absolute target URL
  text = text.replace(/(?:\/web\/[0-9]+[a-z_]*|https?:\/\/web\.archive\.org\/web\/[0-9]+[a-z_]*)\/(https?:\/\/[a-zA-Z0-9.-]+)/gi, '$1');

  // 3. Replace relative Wayback prefixes -> root relative path (e.g. /_next/...)
  text = text.replace(/(?:\/web\/[0-9]+[a-z_]*|https?:\/\/web\.archive\.org\/web\/[0-9]+[a-z_]*)\/([a-zA-Z0-9_-]+)/gi, '/$1');

  // 4. Translate absolute target domain links to relative paths
  text = text.replace(/https?:\/\/(?:www\.)?ona\.com\/([a-zA-Z0-9._-]+.*)/gi, (match, path) => {
    return '/' + path;
  });
  text = text.replace(/https?:\/\/(?:www\.)?ona\.com\/?/gi, '/');

  return text;
}

function getFilesRecursively(dir) {
  let results = [];
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

function removeDivWithId(html, id) {
  const regex = new RegExp(`id\\s*=\\s*["']${id}["']`, 'i');
  while (true) {
    const match = html.match(regex);
    if (!match) break;
    const idx = match.index;

    const divStart = html.lastIndexOf('<div', idx);
    if (divStart === -1) break;

    let depth = 0;
    let pos = divStart;
    let foundEnd = false;
    while (pos < html.length) {
      if (html.slice(pos, pos + 4).toLowerCase() === '<div' && (html[pos+4] === ' ' || html[pos+4] === '>')) {
        depth++;
        pos += 4;
      } else if (html.slice(pos, pos + 5).toLowerCase() === '</div' && (html[pos+5] === ' ' || html[pos+5] === '>')) {
        depth--;
        pos += 5;
        if (depth === 0) {
          const closingBracket = html.indexOf('>', pos);
          if (closingBracket !== -1) {
            const endPos = closingBracket + 1;
            html = html.slice(0, divStart) + html.slice(endPos);
            foundEnd = true;
            break;
          }
        }
      } else {
        pos++;
      }
    }
    if (!foundEnd) {
      break;
    }
  }
  return html;
}

function removeDivWithClass(html, className) {
  const regex = new RegExp(`class\\s*=\\s*["'][^"']*${className}[^"']*["']`, 'i');
  while (true) {
    const match = html.match(regex);
    if (!match) break;
    const idx = match.index;

    const divStart = html.lastIndexOf('<div', idx);
    if (divStart === -1) {
      html = html.slice(0, idx) + `__removed_class__` + html.slice(idx + match[0].length);
      continue;
    }

    let depth = 0;
    let pos = divStart;
    let foundEnd = false;
    while (pos < html.length) {
      if (html.slice(pos, pos + 4).toLowerCase() === '<div' && (html[pos+4] === ' ' || html[pos+4] === '>')) {
        depth++;
        pos += 4;
      } else if (html.slice(pos, pos + 5).toLowerCase() === '</div' && (html[pos+5] === ' ' || html[pos+5] === '>')) {
        depth--;
        pos += 5;
        if (depth === 0) {
          const closingBracket = html.indexOf('>', pos);
          if (closingBracket !== -1) {
            const endPos = closingBracket + 1;
            html = html.slice(0, divStart) + html.slice(endPos);
            foundEnd = true;
            break;
          }
        }
      } else {
        pos++;
      }
    }
    if (!foundEnd) {
      html = html.slice(0, idx) + `__failed_class__` + html.slice(idx + match[0].length);
    }
  }
  return html;
}

function removeTag(html, tagName) {
  const startTagRegex = new RegExp(`<${tagName}\\b`, 'i');
  const closeTagStr = `</${tagName}>`;
  
  while (true) {
    const match = html.match(startTagRegex);
    if (!match) break;
    const startIdx = match.index;
    
    let depth = 0;
    let pos = startIdx;
    let foundEnd = false;
    
    while (pos < html.length) {
      if (html.slice(pos).toLowerCase().startsWith(`<${tagName}`) && 
          (html[pos + tagName.length + 1] === ' ' || html[pos + tagName.length + 1] === '>')) {
        depth++;
        pos += tagName.length + 1;
      } else if (html.slice(pos).toLowerCase().startsWith(closeTagStr)) {
        depth--;
        pos += closeTagStr.length;
        if (depth === 0) {
          html = html.slice(0, startIdx) + html.slice(pos);
          foundEnd = true;
          break;
        }
      } else {
        pos++;
      }
    }
    if (!foundEnd) {
      break;
    }
  }
  return html;
}

function cleanHtml(content, isDocsPage = false) {
  let cleaned = content;

  // Clean html and body tags
  cleaned = cleaned.replace(/<html\b([^>]*?)>/i, (match, attrs) => {
    let cleanedAttrs = attrs;
    
    // Remove data-dpl-id
    cleanedAttrs = cleanedAttrs.replace(/\bdata-dpl-id\s*=\s*["']?[^"'\s>]*["']?/gi, '');
    
    // Handle docs changelog specific attributes
    if (isDocsPage) {
      // Replace dark with light in class
      cleanedAttrs = cleanedAttrs.replace(/\bdark\b/g, 'light');
      
      // Set data-banner-state to hidden
      if (/\bdata-banner-state\s*=/i.test(cleanedAttrs)) {
        cleanedAttrs = cleanedAttrs.replace(/\bdata-banner-state\s*=\s*["']?[^"'\s>]*["']?/gi, 'data-banner-state="hidden"');
      } else {
        cleanedAttrs = cleanedAttrs + ' data-banner-state="hidden"';
      }
      
      // Set data-current-path to /changelog
      if (/\bdata-current-path\s*=/i.test(cleanedAttrs)) {
        cleanedAttrs = cleanedAttrs.replace(/\bdata-current-path\s*=\s*["']?[^"'\s>]*["']?/gi, 'data-current-path="/changelog"');
      } else {
        cleanedAttrs = cleanedAttrs + ' data-current-path="/changelog"';
      }
      
      // Set style on html tag
      if (/\bstyle\s*=/i.test(cleanedAttrs)) {
        cleanedAttrs = cleanedAttrs.replace(/\bstyle\s*=\s*["']([^"']*)["']/i, 'style="--banner-height: 0px; color-scheme: light; --assistant-sheet-width: 0px;"');
      } else {
        cleanedAttrs = cleanedAttrs + ' style="--banner-height: 0px; color-scheme: light; --assistant-sheet-width: 0px;"';
      }
    } else {
      // Non-docs pages: clean style
      cleanedAttrs = cleanedAttrs.replace(/\bstyle\s*=\s*["']([^"']*)["']/i, (styleMatch, styleVal) => {
        let cleanedStyle = styleVal.replace(/--wm-toolbar-height:\s*[^;"]*;?/g, '').trim();
        return cleanedStyle ? `style="${cleanedStyle}"` : '';
      });
      if (!/\bclass\s*=/i.test(cleanedAttrs)) {
        cleanedAttrs = cleanedAttrs + ' class="light"';
      }
    }
    
    // Normalize spaces
    cleanedAttrs = cleanedAttrs.trim();
    return `<html ${cleanedAttrs}>`;
  });

  cleaned = cleaned.replace(/<body\b([^>]*?)>/i, (match, attrs) => {
    let hasStyle = /\bstyle\s*=/i.test(attrs);
    let cleanedAttrs = attrs;
    if (hasStyle) {
      cleanedAttrs = attrs.replace(/\bstyle\s*=\s*["']([^"']*)["']/i, (styleMatch, styleVal) => {
        let cleanedStyle = styleVal.replace(/--wm-toolbar-height:\s*[^;"]*;?/g, '').trim();
        return cleanedStyle ? `style="${cleanedStyle}"` : '';
      });
    }
    if (!isDocsPage) {
      if (!/style\s*=\s*["']([^"']*)overflow\s*:\s*unset;?[^"']*["']/i.test(cleanedAttrs)) {
        if (/\bstyle\s*=\s*["']([^"']*)["']/i.test(cleanedAttrs)) {
          cleanedAttrs = cleanedAttrs.replace(/\bstyle\s*=\s*["']([^"']*)["']/i, (sm, sv) => {
            let space = sv.trim().endsWith(';') ? '' : ';';
            return `style="${sv.trim()}${space} overflow: unset;"`;
          });
        } else {
          cleanedAttrs = cleanedAttrs + ' style="overflow: unset;"';
        }
      }
    }
    return `<body${cleanedAttrs}>`;
  });

  // 1. Remove Wayback Machine head analytics, Ruffle, and Wombat init block
  cleaned = cleaned.replace(/<script[^>]*>(?:(?!<\/script>)[\s\S])*?archive_analytics(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*>(?:(?!<\/script>)[\s\S])*?RufflePlayer(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*>(?:(?!<\/script>)[\s\S])*?__wm\.init(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '');

  // Extract original content from Wombat wrappers instead of deleting the scripts
  cleaned = cleaned.replace(/var _____WB\$wombat\$assign\$function_____\s*=\s*(?:(?!<\/script>)[\s\S])*?opener\s*=\s*_____WB\$wombat\$assign\$function_____\("opener"\);\s*\{\s*((?:(?!<\/script>)[\s\S])*?)\s*\}\}(?=\s*<\/script>)/g, '$1');

  // Clean up any remaining Wombat scripts that couldn't be extracted
  cleaned = cleaned.replace(/<script[^>]*>(?:(?!<\/script>)[\s\S])*?_____WB\$wombat\$assign\$function_____(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '');

  // 2. Remove other archive.org scripts/stylesheets and utility calls
  cleaned = cleaned.replace(/<script[^>]*src="[^"]*archive\.org(?!.*(?:ona\.com|gitpod|onastatus|background-agents))[^"]*"(?:(?!<\/script>)[\s\S])*?><\/script>/gi, '');
  cleaned = cleaned.replace(/<link[^>]*href="[^"]*archive\.org(?!.*(?:ona\.com|gitpod|onastatus|background-agents))[^"]*"[^>]*>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*src="[^"]*playback\.js[^"]*"(?:(?!<\/script>)[\s\S])*?><\/script>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*>\s*update_aoheader\(\);\s*<\/script>/gi, '');

  // Remove Shady DOM style sheets injected by the Wayback Machine toolbar
  cleaned = cleaned.replace(/<!-- Shady DOM styles for [a-zA-Z0-9_-]+ -->\s*<style scope="[a-zA-Z0-9_-]+">(?:(?!<\/style>)[\s\S])*?<\/style>/gi, '');

  // Remove static blob: URLs
  cleaned = cleaned.replace(/(src|href)="blob:[^"]*"/gi, '$1=""');

  // Remove progress bar default scale styles that cause hydration mismatches
  cleaned = cleaned.replace(/ style="transform:\s*scaleX\(0\);?"/gi, '');

  // Reset video progress input max attribute to 0 to match initial client state
  cleaned = cleaned.replace(/<input\b([^>]*?aria-label="Video progress"[^>]*?)>/gi, (match, attrs) => {
    const cleanedAttrs = attrs.replace(/\bmax="[0-9.]+"/gi, 'max="0"');
    return `<input${cleanedAttrs}>`;
  });

  // Reset video duration text to 00:00 to match initial client state
  cleaned = cleaned.replace(/(class="[^"]*absolute left-1\/2 top-1\/2 -translate-x-1\/2 -translate-y-1\/2[^"]*">\s*)[0-9:]+(\s*<\/span>)/gi, '$100:00$2');

  // 3. Remove Wayback machine comments
  cleaned = cleaned.replace(/<!--(?:(?!-->)[\s\S])*?FILE ARCHIVED ON(?:(?!-->)[\s\S])*?-->/g, '');

  // --- Extract script contents to preserve them ---
  const scriptContents = [];
  const dynamicScripts = [];
  cleaned = cleaned.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, content) => {
    const lowerAttrs = attrs.toLowerCase();
    const lowerContent = content.toLowerCase();

    // Check if it's a Wayback Machine script we want to exclude
    if (
      lowerAttrs.includes('archive.org') ||
      lowerAttrs.includes('playback.js') ||
      lowerContent.includes('archive_analytics') ||
      lowerContent.includes('ruffleplayer') ||
      lowerContent.includes('__wm.init') ||
      lowerContent.includes('update_aoheader()') ||
      lowerContent.includes('_____wb$wombat$assign$function_____')
    ) {
      return '';
    }

    let cleanedAttrs = translateWaybackUrls(attrs);

    // Check if it's a Next.js hydration script to clean its URLs safely
    const isNextHydration = content.includes('__next_f') || content.includes('__NEXT_DATA__');
    let cleanedContent = content;

    if (isNextHydration) {
      if (!isDocsPage) {
        cleanedContent = cleanHydrationScript(cleanedContent);
      }
    } else {
      cleanedContent = translateWaybackUrls(cleanedContent, true);
    }

    // Check if it is a dynamic script to move before <div hidden=""></div>
    const isDynamic = attrs.includes('data-nscript');
    if (isDynamic) {
      dynamicScripts.push({ attrs: cleanedAttrs, content: cleanedContent });
      return `<!--DYNAMIC_SCRIPT_PLACEHOLDER-->`;
    }

    scriptContents.push({ attrs: cleanedAttrs, content: cleanedContent });
    return `<!--SCRIPT_PLACEHOLDER_${scriptContents.length - 1}-->`;
  });

  // Remove duplicate/empty noscripts and hidden divs to match client DOM structure
  let firstNoscript = true;
  cleaned = cleaned.replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi, (match) => {
    if (firstNoscript) {
      firstNoscript = false;
      return '<noscript></noscript>';
    }
    return '';
  });

  let firstDiv = true;
  cleaned = cleaned.replace(/<div\s+hidden(?:=""|)\s*><\/div>/gi, (match) => {
    if (firstDiv) {
      firstDiv = false;
      return match;
    }
    return '';
  });

  // 4. Translate URLs only inside HTML attributes (href, src, srcset, action, content, style) on non-script HTML content
  cleaned = cleaned.replace(/(href|src|srcset|action|content|style)\s*=\s*"([^"]*)"/gi, (match, attrName, attrValue) => {
    return `${attrName}="${translateWaybackUrls(attrValue)}"`;
  });
  cleaned = cleaned.replace(/(href|src|srcset|action|content|style)\s*=\s*'([^']*)'/gi, (match, attrName, attrValue) => {
    return `${attrName}='${translateWaybackUrls(attrValue)}'`;
  });

  // 5. Remove any leftover Wayback toolbars and custom navigation tags completely
  cleaned = removeDivWithId(cleaned, 'wm-ipp-base');
  cleaned = removeDivWithId(cleaned, 'wm-ipp');
  cleaned = removeDivWithId(cleaned, 'wm-ipp-print');
  cleaned = removeTag(cleaned, 'ia-topnav');
  cleaned = removeDivWithClass(cleaned, 'floating-announcement-module-scss-module');

  // Fix video controls progress bar hydration mismatch
  cleaned = cleaned.replace(/class="absolute left-0 top-0 h-full bottom-0 pointer-events-none w-full origin-left bg-white controls_progress__psDJQ"/g, 'class="absolute left-0 top-0 h-full bottom-0 pointer-events-none w-full origin-left bg-white controls_progress__psDJQ" style="transform: scaleX(0);"');

  // Inject local link routing helper inside head to allow functional local routing on absolute links
  const clickInterceptor = `
    <script>
      document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (anchor && anchor.href) {
          try {
            const url = new URL(anchor.href);
            if (url.hostname === 'ona.com') {
              e.preventDefault();
              window.location.href = url.pathname + url.search + url.hash;
            }
          } catch (err) {}
        }
      });
    </script>
  `;
  cleaned = cleaned.replace('</head>', `${clickInterceptor}</head>`);

  // --- Restore scripts and clean their contents ---
  cleaned = cleaned.replace(/<!--SCRIPT_PLACEHOLDER_(\d+)-->/g, (match, index) => {
    const item = scriptContents[parseInt(index, 10)];
    return `<script${item.attrs}>${item.content}</script>`;
  });

  // Restore dynamic scripts right before <div hidden=""></div>
  const dynamicScriptsHtml = dynamicScripts.map(item => `<script${item.attrs}>${item.content}</script>`).join('');
  if (cleaned.includes('<div hidden=""></div>')) {
    cleaned = cleaned.replace('<div hidden=""></div>', `${dynamicScriptsHtml}<div hidden=""></div>`);
  } else if (cleaned.includes('<div hidden></div>')) {
    cleaned = cleaned.replace('<div hidden></div>', `${dynamicScriptsHtml}<div hidden></div>`);
  } else {
    if (cleaned.includes('</body>')) {
      cleaned = cleaned.replace('</body>', `${dynamicScriptsHtml}</body>`);
    } else {
      cleaned = cleaned + dynamicScriptsHtml;
    }
  }

  // Remove any leftover dynamic placeholders
  cleaned = cleaned.replace(/<!--DYNAMIC_SCRIPT_PLACEHOLDER-->/g, '');

  return cleaned;
}

function cleanCss(content) {
  return translateWaybackUrls(content);
}

function cleanJs(content) {
  let cleaned = content.trim();

  // Remove archive.org comments at the end of the file safely.
  const archiveKeywords = ["FILE ARCHIVED ON", "playback timings"];
  archiveKeywords.forEach(keyword => {
    const kwIdx = cleaned.lastIndexOf(keyword);
    if (kwIdx !== -1) {
      const commentStart = cleaned.lastIndexOf("/*", kwIdx);
      if (commentStart !== -1) {
        const commentEnd = cleaned.indexOf("*/", kwIdx);
        if (commentEnd !== -1) {
          cleaned = cleaned.slice(0, commentStart) + cleaned.slice(commentEnd + 2);
        }
      }
    }
  });
  cleaned = cleaned.trim();

  // Remove Wombat execution wrapper
  const prefix = 'var _____WB$wombat$assign$function_____';
  if (cleaned.startsWith(prefix)) {
    const openerKey = 'let opener = _____WB$wombat$assign$function_____("opener");';
    const openerIdx = cleaned.indexOf(openerKey);
    if (openerIdx !== -1) {
      const startOfCode = openerIdx + openerKey.length;
      let codeStartIdx = startOfCode;
      while (codeStartIdx < cleaned.length && (cleaned[codeStartIdx] === ';' || cleaned[codeStartIdx] === '\r' || cleaned[codeStartIdx] === '\n' || cleaned[codeStartIdx] === ' ' || cleaned[codeStartIdx] === '\t')) {
        codeStartIdx++;
      }
      let temp = cleaned.slice(codeStartIdx).trim();
      if (temp.endsWith('}')) {
        cleaned = temp.slice(0, -1).trim();
      } else {
        cleaned = temp;
      }
    }
  }

  // Clean Wayback URLs inside JS files
  cleaned = translateWaybackUrls(cleaned, true);

  // Automatically repair Wayback Machine image loader corruption if present
  cleaned = cleaned.replace(/a\?\s*`""\}`\}i\.__next_img_default\s*=\s*!0/g, 'a?`?dpl=$${a}`:""}`i.__next_img_default=!0');

  return cleaned;
}

function runCleaner() {
  console.log(`[CLEANER] Starting cleanup scan...`);
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error(`[CLEANER] Public directory does not exist!`);
    return;
  }

  const files = getFilesRecursively(PUBLIC_DIR);
  console.log(`[CLEANER] Found ${files.length} files. Cleaning...`);

  let htmlCleaned = 0;
  let cssCleaned = 0;
  let jsCleaned = 0;

  files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    
    if (ext === '.html') {
      const content = fs.readFileSync(file, 'utf8');
      
      const relativePath = path.relative(PUBLIC_DIR, file).replace(/\\/g, '/');
      if (relativePath === 'docs/index.html') {
        const cleanRedirectContent = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=/docs/ona/getting-started">
  <script>
    window.location.href = "/docs/ona/getting-started";
  </script>
</head>
<body>
  Redirecting to <a href="/docs/ona/getting-started">/docs/ona/getting-started</a>...
</body>
</html>`;
        fs.writeFileSync(file, cleanRedirectContent, 'utf8');
        htmlCleaned++;
        return;
      }
      
      const isDocsPage = relativePath.startsWith('docs/');
      const cleaned = cleanHtml(content, isDocsPage);
      if (cleaned !== content) {
        fs.writeFileSync(file, cleaned, 'utf8');
        htmlCleaned++;
      }
    } else if (ext === '.css') {
      const content = fs.readFileSync(file, 'utf8');
      const cleaned = cleanCss(content);
      if (cleaned !== content) {
        fs.writeFileSync(file, cleaned, 'utf8');
        cssCleaned++;
      }
    } else if (ext === '.js') {
      const content = fs.readFileSync(file, 'utf8');
      const cleaned = cleanJs(content);
      if (cleaned !== content) {
        fs.writeFileSync(file, cleaned, 'utf8');
        jsCleaned++;
      }
    }
  });

  console.log(`[CLEANER SUCCESS] Cleanup finished:`);
  console.log(`  - HTML files cleaned: ${htmlCleaned}`);
  console.log(`  - CSS files cleaned: ${cssCleaned}`);
  console.log(`  - JS files cleaned: ${jsCleaned}`);
}

runCleaner();
