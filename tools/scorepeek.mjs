// Visual check: the score breakdown of a hand with jokers, enhancements and
// multipliers.
//
//   node tools/scorepeek.mjs [baseUrl]
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
const LANG = process.argv[3] || 'zh';
await page.evaluate((l) => localStorage.setItem('balatro-pixel-lang', l), LANG);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

await page.evaluate(() => {
  const g = window.game;
  g.seed = 11;
  g.startRun();
  g.run.selectBlind('small');
  g.startBlind();
  g.run.createJoker('Blue Joker');
  g.run.createJoker('Hologram');
  g.run.createJoker('Ride the Bus');
  const run = g.run;
  // Give the first five cards something to show.
  const enhs = ['bonus', 'mult', 'glass', 'lucky', null];
  run.hand.slice(0, 5).forEach((c, i) => {
    if (enhs[i]) c.enhancement = enhs[i];
  });
  run.hand[0].seal = 'red';
  run.hand[1].edition = 'foil';
  g.selection = run.hand.slice(0, 5);
  run.selectCards(g.selection);
  // Keep the blind alive so the breakdown overlay is shown.
  run.currentBlind.scoreRequired = 999999;
});
await page.waitForTimeout(250);
console.log('state before:', JSON.stringify(await page.evaluate(() => ({
  screen: window.game.screen,
  selection: window.game.selection.length,
  hands: window.game.run.handsLeft,
  need: window.game.run.currentBlind ? window.game.run.currentBlind.scoreRequired : null,
}))));

await page.evaluate(() => window.game.doPlay());
await page.waitForTimeout(350);
await page.locator('#game').screenshot({ path: `${OUT}${LANG}-breakdown.png` });
console.log(`shot: ${LANG}-breakdown.png`);
console.log(JSON.stringify(await page.evaluate(() => {
  const br = window.game.scoreBreakdown;
  return br.steps.map((s) => ({
    kind: s.kind,
    name: s.name || (s.card ? `${s.card.rank}${s.card.suit}` : null),
    chips: s.chips, mult: s.mult, factors: s.factors, notes: s.notes,
    totals: s.totals,
  }));
}), null, 1));

await page.keyboard.press('Enter');
await page.waitForTimeout(200);

// The blind screen shows the same breakdown.
await page.evaluate(() => {
  const run = window.game.run;
  run.roundScore = run.currentBlind.scoreRequired + 10;
  run.currentBlind.score = run.roundScore;
  window.game.checkEndConditions();
});
await page.waitForTimeout(300);
await page.locator('#game').screenshot({ path: `${OUT}${LANG}-breakdown-beat.png` });
console.log(`shot: ${LANG}-breakdown-beat.png`);

await browser.close();
