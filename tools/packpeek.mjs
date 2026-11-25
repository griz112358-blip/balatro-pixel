// Visual check: open every booster pack type and capture it.
//
//   node tools/packpeek.mjs [baseUrl]
//
// Screenshots land in shots/packs/, and every card in every pack is dumped to
// stdout so leftover English strings can be spotted.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8770';
const OUT = new URL('../shots/packs/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

const TYPES = ['Standard', 'Arcana', 'Celestial', 'Buffoon', 'Spectral'];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// Chinese first.
await page.evaluate(() => {
  localStorage.setItem('balatro-pixel-lang', 'zh');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

for (const type of TYPES) {
  const dump = await page.evaluate((packType) => {
    const g = window.game;
    g.seed = 7;
    g.startRun();
    const pack = {
      kind: 'pack', packType, size: 'Jumbo', price: 6,
      options: 5, choose: 1, cost: 6,
    };
    const options = window.__shop.openPack(g.run, pack);
    g.pack = { pack, options };
    g.packSelection = [];
    g.screen = 'pack';
    return options.map((o) => ({
      kind: o.kind,
      name: o.name || null,
      type: o.type || null,
      enhancement: o.enhancement || null,
      desc: o.desc || null,
      rank: o.rank || null,
      suit: o.suit || null,
    }));
  }, type);

  await page.waitForTimeout(300);
  await page.locator('#game').screenshot({ path: `${OUT}zh-${type}.png` });
  console.log(`\n=== ${type} (zh) ===`);
  for (const o of dump) console.log(' ', JSON.stringify(o));

  // Hover the first card so the description line shows up.
  const box = await page.locator('#game').boundingBox();
  const scale = box.width / 428;
  const firstX = Math.round((428 - 5 * 40) / 2);
  await page.mouse.move(box.x + (firstX + 14) * scale, box.y + 70 * scale);
  await page.waitForTimeout(250);
  await page.locator('#game').screenshot({ path: `${OUT}zh-${type}-hover.png` });
  console.log(`shot: zh-${type}-hover.png`);
}

// English for reference.
await page.evaluate(() => localStorage.setItem('balatro-pixel-lang', 'en'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
for (const type of TYPES) {
  await page.evaluate((packType) => {
    const g = window.game;
    g.seed = 7;
    g.startRun();
    const pack = {
      kind: 'pack', packType, size: 'Jumbo', price: 6,
      options: 5, choose: 1, cost: 6,
    };
    g.pack = { pack, options: window.__shop.openPack(g.run, pack) };
    g.packSelection = [];
    g.screen = 'pack';
  }, type);
  await page.waitForTimeout(300);
  await page.locator('#game').screenshot({ path: `${OUT}en-${type}.png` });
}
console.log('\nshot: en-*');

await browser.close();
