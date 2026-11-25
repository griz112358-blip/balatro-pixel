// Visual check: capture every screen, in Chinese and in English.
//
//   node tools/peek.mjs [baseUrl] [width] [height]
//
// Screenshots land in shots/peek/.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8770';
const VW = Number(process.argv[3] || 1400);
const VH = Number(process.argv[4] || 900);
const OUT = new URL('../shots/peek/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const shot = async (name) => {
  await page.locator('#game').screenshot({ path: `${OUT}${name}.png` });
  console.log('shot:', name);
};

const setLang = (lang) => page.evaluate((l) => {
  localStorage.setItem('balatro-pixel-lang', l);
  location.reload();
}, lang);

for (const lang of ['zh', 'en']) {
  const p = `${lang}-`;
  await setLang(lang);
  await page.waitForTimeout(600);

  await shot(`${p}menu`);

  // Play screen with a selection.
  await page.evaluate(() => {
    const g = window.game;
    g.seed = 3;
    g.startRun();
    g.run.selectBlind('small');
    g.startBlind();
    g.run.createJoker('Blue Joker');
    g.selection = g.run.hand.slice(0, 5);
    g.run.selectCards(g.selection);
  });
  await page.waitForTimeout(250);
  await shot(`${p}play`);

  // Joker detail overlay.
  await page.evaluate(() => {
    const g = window.game;
    g.showJokerDetail(g.run.jokers[0]);
  });
  await page.waitForTimeout(200);
  await shot(`${p}detail`);
  await page.evaluate(() => { window.game.detail = null; });

  // Consumable detail (a Planet card).
  await page.evaluate(() => {
    const g = window.game;
    g.showConsumableDetail(g.run.makeConsumable('Jupiter'));
  });
  await page.waitForTimeout(200);
  await shot(`${p}consumable`);
  await page.evaluate(() => { window.game.detail = null; });

  // Blind select.
  await page.evaluate(() => {
    const g = window.game;
    g.screen = 'blind';
    g.run.shop = null;
  });
  await page.waitForTimeout(200);
  await shot(`${p}blind`);

  // Shop.
  await page.evaluate(() => {
    const g = window.game;
    g.screen = 'shop';
    g.run.shop = window.__shop.createShop(g.run);
  });
  await page.waitForTimeout(250);
  await shot(`${p}shop`);

  // Booster pack.
  await page.evaluate(() => {
    const g = window.game;
    const shop = window.__shop.createShop(g.run);
    g.run.shop = shop;
    const res = window.__shop.buyPack(g.run, shop.packs[0]);
    g.pack = { pack: shop.packs[0], options: res.options };
    g.packSelection = [];
    g.screen = 'pack';
  });
  await page.waitForTimeout(250);
  await shot(`${p}pack`);

  // Blind defeated: play a hand for real, so the breakdown is real too.
  await page.evaluate(() => {
    const g = window.game;
    g.pack = null;
    g.scoreBreakdown = null;
    g.screen = 'play';
    g.selection = g.run.hand.slice(0, 5);
    g.run.selectCards(g.selection);
    g.doPlay();
    g.scoreBreakdown = null;
    g.run.roundScore = g.run.currentBlind.scoreRequired + 10;
    g.run.currentBlind.score = g.run.roundScore;
    g.checkEndConditions();
  });
  await page.waitForTimeout(200);
  await shot(`${p}beat`);

  // End screens.
  await page.evaluate(() => { window.game.screen = 'gameover'; });
  await page.waitForTimeout(200);
  await shot(`${p}over`);
  await page.evaluate(() => {
    const g = window.game;
    g.screen = 'win';
    g.run.won = true;
    g.run.score = 1234567;
    g.run.roundsPlayed = 24;
    g.run.handsPlayed = 63;
  });
  await page.waitForTimeout(200);
  await shot(`${p}win`);
}

// The whole page, including the key hints under the canvas.
await page.screenshot({ path: `${OUT}page.png` });
console.log('shot: page.png');

await browser.close();
