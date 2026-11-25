// Visual check: the rules page lists every card, item and mechanic.
//
//   node tools/rulespeek.mjs [baseUrl] [zh|en]
//
// Screenshots land in shots/peek/.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8770';
const LANG = process.argv[3] || 'zh';
const OUT = new URL('../shots/peek/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR:', e.message); });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto(`${BASE}/rules.html`, { waitUntil: 'networkidle' });
await page.evaluate((l) => localStorage.setItem('balatro-pixel-lang', l), LANG);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const summary = await page.evaluate(() => {
  const sections = [...document.querySelectorAll('main > section')].map((s) => ({
    id: s.id,
    title: s.querySelector('h2').textContent,
    count: s.querySelector('.count') ? s.querySelector('.count').textContent : '',
    entries: s.querySelectorAll('.entry').length,
  }));
  return {
    sections,
    nav: [...document.querySelectorAll('nav a')].map((a) => a.textContent),
    emptyEntries: [...document.querySelectorAll('.entry')].filter((e) => !e.querySelector('.effect') || !e.querySelector('.effect').textContent.trim()).length,
  };
});
console.log(JSON.stringify(summary, null, 1));

await page.screenshot({ path: `${OUT}${LANG}-rules-top.png` });
console.log(`shot: ${LANG}-rules-top.png`);

// The joker list.
await page.evaluate(() => document.querySelector('#sec-jokers').scrollIntoView());
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}${LANG}-rules-jokers.png` });
console.log(`shot: ${LANG}-rules-jokers.png`);

// The search.
const query = LANG === 'zh' ? '举拳' : 'Raised Fist';
await page.fill('#search', query);
await page.waitForTimeout(250);
const hits = await page.evaluate(() => [...document.querySelectorAll('.entry:not(.hidden)')]
  .map((e) => e.querySelector('.name').textContent));
console.log(`search ${query} ->`, JSON.stringify(hits));
await page.screenshot({ path: `${OUT}${LANG}-rules-search.png` });
console.log(`shot: ${LANG}-rules-search.png`);

console.log('=== errors ===');
console.log(errors.length ? errors.join('\n') : 'none');

await browser.close();
