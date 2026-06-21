const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testCrawl() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  
  const pageUrl = 'https://web.archive.org/web/20260509000821/https://ona.com/cases/background-agent';
  console.log('Crawling', pageUrl);
  await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Clean the DOM exactly as in harvest_subpages.js
  await page.evaluate(() => {
    const selectorsToNuke = [
      '#wm-ipp-base',
      '#wm-ipp-print',
      '#wm-shared-iframe',
      'iframe[src*="archive.org"]',
      '#donations',
      '#wm-ipp-hidden'
    ];
    selectorsToNuke.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });

    document.querySelectorAll('script').forEach(el => {
      const src = el.getAttribute('src') || '';
      if (src.includes('archive.org') || src.includes('/_static/js/') || src.includes('wombat.js') || src.includes('bundle-playback.js')) {
        el.remove();
      }
      if (el.textContent && (el.textContent.includes('__wm.rw') || el.textContent.includes('/* FILE ARCHIVED ON') || el.textContent.includes('playback.js'))) {
        el.remove();
      }
    });

    document.querySelectorAll('link').forEach(el => {
      const href = el.getAttribute('href') || '';
      if (href.includes('archive.org') || href.includes('/_static/css/')) {
        el.remove();
      }
    });

    const archiveRegex = /^(?:\/web\/[0-9]+(?:[a-z]{2}_)?|https?:\/\/web\.archive\.org\/web\/[0-9]+(?:[a-z]{2}_)?)\/https?:\/\/(?:www\.)?ona\.com(\/.*)?$/;
    
    const cleanUrl = (urlStr) => {
      if (!urlStr) return urlStr;
      const match = urlStr.match(archiveRegex);
      if (match) return match[1] || '/';
      const externalMatch = urlStr.match(/^(?:\/web\/[0-9]+(?:[a-z]{2}_)?|https?:\/\/web\.archive\.org\/web\/[0-9]+(?:[a-z]{2}_)?)\/(https?:\/\/.*)$/);
      if (externalMatch) return externalMatch[1];
      return urlStr;
    };

    document.querySelectorAll('[href]').forEach(el => {
      const href = el.getAttribute('href');
      const cleaned = cleanUrl(href);
      if (cleaned !== href) el.setAttribute('href', cleaned);
    });

    document.querySelectorAll('[src]').forEach(el => {
      const src = el.getAttribute('src');
      const cleaned = cleanUrl(src);
      if (cleaned !== src) el.setAttribute('src', cleaned);
    });
  });

  const html = await page.content();
  fs.writeFileSync(path.join(__dirname, 'raw_background_agent.html'), html, 'utf8');
  console.log('Saved to scratch/raw_background_agent.html');
  await browser.close();
}

testCrawl().catch(console.error);
