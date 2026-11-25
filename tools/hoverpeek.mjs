// Visual check: hover a joker, a consumable and a shop card to see that the
// description tooltip shows up.
//
//   node tools/hoverpeek.mjs [baseUrl]
//
// Screenshots land in shots/peek/.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8770';
const OUT = new URL('../shots/peek/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('balatro-pixel-lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// A run with a joker and a consumable in it.
await page.evaluate(() => {
  const g = window.game;
  g.seed = 3;
  g.startRun();
  g.run.selectBlind('small');
  g.startBlind();
  g.run.createJoker('Blue Joker');
  g.run.createJoker('Golden Joker');
  g.run.consumables.push(g.run.makeConsumable('Jupiter'));
});
await page.waitForTimeout(250);

const box = await page.locator('#game').boundingBox();
const scale = box.width / 428;
const hover = async (lx, ly) => {
  await page.mouse.move(box.x + lx * scale, box.y + ly * scale);
  await page.waitForTimeout(220);
};

// The joker column sits on the left, the consumables on the right.
await hover(5 + 15, 36 + 20);
await page.locator('#game').screenshot({ path: `${OUT}zh-hover-joker.png` });
console.log('shot: zh-hover-joker.png');

await hover(428 - 68 + 15, 36 + 20);
await page.locator('#game').screenshot({ path: `${OUT}zh-hover-consumable.png` });
console.log('shot: zh-hover-consumable.png');

// The shop: hover a card that is for sale.
await page.evaluate(() => {
  const g = window.game;
  g.screen = 'shop';
  g.run.shop = window.__shop.createShop(g.run);
});
await page.waitForTimeout(250);
await hover(8 + 15, 38 + 20);
await page.locator('#game').screenshot({ path: `${OUT}zh-hover-shop.png` });
console.log('shot: zh-hover-shop.png');

await browser.close();
