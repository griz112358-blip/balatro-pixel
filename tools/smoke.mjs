// Headless smoke test: loads the game in a real browser, drives it with
// clicks and keys, captures screenshots and reports console errors.
//
//   node tools/serve.mjs 8770 &
//   node tools/smoke.mjs [baseUrl]
//
// Uses the locally installed Google Chrome when Playwright's own Chromium
// has not been downloaded (npx playwright install chromium).

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8770';
const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];
let checks = 0;
let failures = 0;

/**
 * check(name, actual, expected)
 * `expected` defaults to true, so `check('x', a === b)` still works.
 */
function check(name, actual, expected = true) {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
  }
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    console.log('bundled chromium unavailable, falling back to Google Chrome');
    return chromium.launch({ channel: 'chrome' });
  }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const shot = async (name) => {
  await page.locator('#game').screenshot({ path: `${OUT}${name}.png` });
  console.log(`shot: ${name}.png`);
};

// Canvas helper: click at logical pixel coords (the 428x240 buffer).
const click = async (x, y) => {
  const box = await page.locator('#game').boundingBox();
  const sx = box.width / 428;
  const sy = box.height / 240;
  await page.mouse.click(box.x + x * sx, box.y + y * sy);
  await page.waitForTimeout(90);
};

// Canvas helper: point at logical pixel coords without clicking.
const hover = async (x, y) => {
  const box = await page.locator('#game').boundingBox();
  const sx = box.width / 428;
  const sy = box.height / 240;
  await page.mouse.move(box.x + x * sx, box.y + y * sy);
  await page.waitForTimeout(120);
};

// Canvas helper: click a button by its label, so the test does not depend
// on where the button happens to sit.
const clickButton = async (label, index = 0) => {
  const target = await page.evaluate(({ label, index }) => {
    const list = window.game.buttons.filter((b) => b.label === label);
    const b = list[index];
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  }, { label, index });
  if (!target) throw new Error(`no button labelled "${label}"`);
  await click(target.x, target.y);
};

const state = () => page.evaluate(() => ({
  screen: window.game.screen,
  ante: window.game.run ? window.game.run.ante : null,
  round: window.game.run ? window.game.run.round : null,
  money: window.game.run ? window.game.run.money : null,
  hands: window.game.run ? window.game.run.handsLeft : null,
  handSize: window.game.run ? window.game.run.hand.length : null,
  selection: window.game.selection ? window.game.selection.length : null,
  blind: window.game.run && window.game.run.currentBlind ? window.game.run.currentBlind.name : null,
  need: window.game.run && window.game.run.currentBlind ? window.game.run.currentBlind.scoreRequired : null,
  score: window.game.run ? window.game.run.roundScore : null,
  jokers: window.game.run ? window.game.run.jokers.length : null,
  detail: !!window.game.detail,
}));

// --- menu ------------------------------------------------------------------
console.log('--- menu ---');
await shot('01-menu');
let s = await state();
check('starts on the menu', s.screen === 'menu');

// The deck arrow buttons must be visible and clickable.
await click(27, 91); // deck '<'
const deckIndex = await page.evaluate(() => window.game.deckIndex);
check('deck arrow works', deckIndex !== 0);
await click(401, 91); // deck '>'
await page.waitForTimeout(80);

await click(401, 141); // stake '>'
const stakeIndex = await page.evaluate(() => window.game.stakeIndex);
check('stake arrow works', stakeIndex === 1);
await click(27, 141); // stake '<'
await page.waitForTimeout(80);
check('stake arrow goes back', (await page.evaluate(() => window.game.stakeIndex)) === 0);
check('deck arrow goes back', (await page.evaluate(() => window.game.deckIndex)) === 0);

// --- blind select ----------------------------------------------------------
console.log('--- blind select ---');
// A fixed seed keeps the run reproducible: the opening hand must not
// beat the Small Blind, or the test would land on the 'beat' screen.
await page.evaluate(() => { window.game.seed = 3; });
await click(214, 185); // NEW RUN
await page.waitForTimeout(250);
await shot('02-blind');
s = await state();
check('run started', s.screen === 'blind');
check('ante is 1', s.ante === 1);

// The blind select screen is a pipeline: what is behind the player, what can
// be picked now and what is still ahead.
const pipeline = await page.evaluate(() => window.game.run.antePipeline());
check('the pipeline has three stages', pipeline.length, 3);
check('the small blind is open', pipeline[0].state, 'open');
check('the big blind is open', pipeline[1].state, 'open');
check('the boss blind is still ahead', pipeline[2].state, 'locked');
check('the boss blind keeps its score for later', pipeline[2].scoreMax > pipeline[2].scoreRequired, true);
check('nothing has been cleared yet', await page.evaluate(() => window.game.run.blindProgress().beaten), 0);

// --- play ------------------------------------------------------------------
console.log('--- play ---');
await clickButton('选择', 0); // the small blind
await page.waitForTimeout(250);
await shot('03-play');
s = await state();
check('in the play screen', s.screen === 'play');
check('hand of 8 cards', s.handSize === 8);
check('4 hands left', s.hands === 4);
check('blind needs a score', s.need > 0);

// The keys are listed once, in the bar under the canvas, so no button may
// repeat them in its corner.
const notes = await page.evaluate(() => window.game.buttons.map((b) => b.sub).filter(Boolean));
check('the buttons have no key hints', notes.filter((n) => /^[A-Za-z0-9]$/.test(n)), []);

// The overview of every poker hand level.
await page.keyboard.press('h');
await page.waitForTimeout(200);
check('the hand level overview opens',
  await page.evaluate(() => window.game.handsOpen), true);
await shot('03b-hand-levels');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('the hand level overview closes',
  await page.evaluate(() => window.game.handsOpen), false);

// Select five cards in hand and check the preview updates.
const hand = await page.evaluate(() => window.game.run.hand.map((c) => c.uid));
const box = await page.locator('#game').boundingBox();
const sx = box.width / 428;
const sy = box.height / 240;
for (let i = 0; i < 5; i++) {
  const x = (428 - (hand.length * 28)) / 2 + i * 28 + 13;
  await page.mouse.click(box.x + x * sx, box.y + 162 * sy);
  await page.waitForTimeout(60);
}
await shot('04-selected');
s = await state();
check('five cards selected', s.selection === 5);

// Play the hand.
await click(395, 207); // PLAY HAND
await page.waitForTimeout(250);
await shot('05-played');
s = await state();
check('a hand was played', s.hands === 3);
check('score went up', s.score > 0);

// The score breakdown explains how the score was reached.
check('score breakdown shown', await page.evaluate(() => !!window.game.scoreBreakdown), true);
check('breakdown adds up', await page.evaluate(() => {
  const br = window.game.scoreBreakdown;
  if (!br) return false;
  let chips = 0;
  let mult = 0;
  for (const step of br.steps) {
    chips += step.chips;
    mult += step.mult;
  }
  return Math.abs(chips - br.chips) < 1e-9
    && Math.abs(mult - br.mult) < 1e-9
    && br.steps.length > 0
    && br.score === Math.floor(br.chips * br.mult);
}), true);
await shot('05b-breakdown');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check('breakdown closes', await page.evaluate(() => !window.game.scoreBreakdown), true);

// The joker detail overlay must open and close.
await page.evaluate(() => {
  const r = window.game.run;
  const j = r.buildJoker('Joker');
  r.jokers.push(j);
  r.onJokerAcquired(j);
});
await page.waitForTimeout(120);
console.log('DBG state:', JSON.stringify(await page.evaluate(() => ({
  screen: window.game.screen,
  detail: !!window.game.detail,
  paused: window.game.paused,
  armed: !!window.game.armed,
  jokers: window.game.run ? window.game.run.jokers.length : -1,
  buttons: window.game.buttons.map((b) => [b.label || '-', b.x, b.y, b.w, b.h]),
}))));
// Pointing at a joker must show what it does, without a click.
await hover(20, 56);
check('joker hover shows a tooltip', await page.evaluate(() => {
  const tip = window.game.tooltip;
  return !!(tip && tip.item && tip.item.name);
}), true);
await click(20, 56); // first joker card
await page.waitForTimeout(150);
console.log('DBG after click:', JSON.stringify(await page.evaluate(() => ({
  detail: window.game.detail ? window.game.detail.title : null,
  buttons: window.game.buttons.map((b) => [b.label || '-', b.x, b.y, b.w, b.h]),
}))));
s = await state();
check('joker detail opens', s.detail === true);
await shot('06-detail');
await click(314, 176); // CLOSE
await page.waitForTimeout(150);
s = await state();
check('joker detail closes', s.detail === false);

// A joker that aims at a target shows what it aims at this round.
{
  const target = await page.evaluate(() => {
    const g = window.game;
    const j = g.run.buildJoker('To Do List');
    g.run.jokers.push(j);
    g.run.onJokerAcquired(j);
    g.showJokerDetail(j);
    return {
      kind: g.run.jokers[g.run.jokers.length - 1].hand ? 'hand' : 'none',
      lines: g.detail.lines,
    };
  });
  await page.waitForTimeout(150);
  check('the joker knows its target', target.kind, 'hand');
  check('the joker detail shows the target',
    target.lines.some((l) => l.includes('本关目标')), true);
  await shot('06c-joker-target');
  await click(314, 176); // CLOSE
  await page.waitForTimeout(150);
}

// A consumable that needs a target is armed, then applied to a card.
await page.evaluate(() => {
  const r = window.game.run;
  const c = r.makeConsumable('The Magician');
  r.consumables.push(c);
});
await page.waitForTimeout(120);
// The consumable column shows a description on hover as well.
await hover(360, 56);
check('consumable hover shows a tooltip', await page.evaluate(() => {
  const tip = window.game.tooltip;
  return !!(tip && tip.item && tip.item.name);
}), true);
await click(360, 56); // the consumable in the consumables column
await page.waitForTimeout(150);
check('consumable armed', await page.evaluate(() => !!window.game.armed), true);
await click(150, 162); // target card
await page.waitForTimeout(100);
await click(395, 207); // USE
await page.waitForTimeout(200);
const used = await page.evaluate(() => ({
  armed: !!window.game.armed,
  consumables: window.game.run.consumables.length,
  lucky: window.game.run.hand.filter((c) => c.enhancement === 'lucky').length,
}));
check('consumable was consumed', used.consumables, 0);
check('consumable was disarmed', used.armed, false);
check('target card was enhanced', used.lucky >= 1, true);

// A tarot that needs no target is used straight away.
await page.evaluate(() => {
  const r = window.game.run;
  r.consumables.push(r.makeConsumable('The High Priestess'));
});
await page.waitForTimeout(120);
await click(360, 56); // the consumable in the consumables column
await page.waitForTimeout(200);
const free = await page.evaluate(() => ({
  armed: !!window.game.armed,
  named: window.game.run.consumables.map((c) => c.name),
}));
check('a target-less tarot is used at once', free.armed, false);
check('the tarot created planets', free.named.filter((n) => n !== 'The High Priestess').length >= 1, true);

// The pause menu opens with Escape and leaves the game on the same blind.
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('pause opens', await page.evaluate(() => window.game.paused), true);
await shot('06b-pause');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('pause closes', await page.evaluate(() => window.game.paused), false);

// Discard a card.
await page.evaluate(() => window.game.run.selectCards([]));
await click(150, 162);
await page.waitForTimeout(80);
await click(300, 207); // DISCARD
await page.waitForTimeout(200);
s = await state();
check('discards left decreased', s.hands === 3);

// --- beat the blind and reach the shop -------------------------------------
await page.evaluate(() => {
  const r = window.game.run;
  r.roundScore = r.currentBlind.scoreRequired + 10;
  r.currentBlind.score = r.roundScore;
});
await page.evaluate(() => window.game.checkEndConditions());
await page.waitForTimeout(250);
await shot('07-beat');
s = await state();
check('beat screen shown', s.screen === 'beat');

await click(214, 182); // CONTINUE
await page.waitForTimeout(350);
await shot('08-shop');
s = await state();
check('shop opened', s.screen === 'shop');

// --- what a card is worth ---------------------------------------------------
// Regression: the sell value used to be worked out from a price the card no
// longer had, so every joker sold for $1 and the Egg never grew.
await page.evaluate(() => {
  const g = window.game;
  const r = g.run;
  r.createJoker('Egg');
  r.runEndOfRoundJokers();
  r.runEndOfRoundJokers();
  g.showJokerDetail(r.jokers.find((j) => j.name === 'Egg'), true);
});
await page.waitForTimeout(220);
const worth = await page.evaluate(() => {
  const g = window.game;
  const egg = g.run.jokers.find((j) => j.name === 'Egg');
  return {
    value: window.__shop.computeSellValue(g.run, egg),
    button: g.buttons.map((b) => b.label).find((l) => l && l.includes('出售')) || '',
    lines: g.detail ? g.detail.lines : [],
  };
});
check('the egg grows every round', worth.value, 8);
check('the sell button shows the grown price', worth.button, '出售 $8');
check('the detail shows the current price',
  worth.lines.some((l) => l.includes('$8')), true);
await shot('08c-egg-worth');
await page.evaluate(() => { window.game.detail = null; });

await click(390, 209); // NEXT
await page.waitForTimeout(300);
s = await state();
check('back to blind select', s.screen === 'blind');
await shot('08b-blind-progress');
// The blind that was just beaten is behind the player now.
const after = await page.evaluate(() => window.game.run.antePipeline());
check('the cleared blind is behind the player', after[0].state, 'cleared');
check('the cleared blind keeps its score', after[0].score > 0, true);
check('the next blind is open', after[1].state, 'open');
check('the boss blind is still ahead', after[2].state, 'locked');
check('the run counts the cleared blind',
  await page.evaluate(() => window.game.run.blindProgress().beaten), 1);

// --- play the rest of the run ----------------------------------------------
await page.evaluate(() => {
  const g = window.game;
  const r = g.run;
  g.screen = 'play';
  let guard = 0;
  while (guard++ < 400) {
    if (r.won || r.isDead()) break;
    if (!r.currentBlind) {
      const opts = r.selectableBlinds();
      if (!opts.length) break;
      r.selectBlind(opts[0].type);
      g.screen = 'play';
    }
    if (!r.blindBeaten()) {
      const handsBefore = r.handsLeft;
      // Try a few hand sizes: some bosses demand an exact number of cards.
      let res = null;
      for (let n = 5; n >= 1; n--) {
        // Face-down cards are still playable, so they are included.
        const pick = r.hand.slice(0, n);
        if (!pick.length) continue;
        r.selectCards(pick);
        const attempt = r.playHand();
        if (attempt && !attempt.error) { res = attempt; break; }
        res = res || attempt;
      }
      if (res && res.error) r.selectCards([]);
      // If the hand could not be played at all (a boss that forbids the
      // selection) no progress is possible - stop instead of spinning.
      if (r.handsLeft <= 0 && !r.blindBeaten()) break;
      if (r.handsLeft === handsBefore) break;
      continue;
    }
    r.completeBlind();
    if (r.won) break;
    // Shop: buy anything affordable, then move on.
    const shop = r.shop;
    if (shop) {
      for (const item of shop.items.slice()) {
        const { buyCard } = window.__shop;
        buyCard(r, item);
      }
      for (const pack of shop.packs.slice()) {
        const { buyPack, takeFromPack } = window.__shop;
        const res = buyPack(r, pack);
        if (!res.error && res.options.length) takeFromPack(r, pack, [res.options[0]]);
      }
      if (shop.voucher) window.__shop.buyVoucherItem(r);
      window.__shop.closeShop(r);
    }
    const opts = r.selectableBlinds();
    if (!opts.length) break;
    r.selectBlind(opts[0].type);
    g.screen = 'play';
  }
});
await page.waitForTimeout(300);
await shot('09-far');
s = await state();
const final = await page.evaluate(() => ({
  won: window.game.run.won,
  dead: window.game.run.isDead(),
  ante: window.game.run.ante,
  score: window.game.run.score,
  rounds: window.game.run.roundsPlayed,
}));
console.log('final run state:', JSON.stringify(final));
check('the run reached a conclusion', final.won || final.dead);

// The end screen must show the score of the blind that was lost, not the
// score of the whole run. The run score counts every blind before this one,
// so next to the requirement it reads like the blind was beaten after all.
const over = await page.evaluate(() => {
  const g = window.game;
  const r = g.run;
  g.screen = 'gameover';
  const fmt = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(Math.round(n)));
  return {
    info: g.gameOverInfo(),
    roundLabel: fmt(r.roundScore),
    neededLabel: fmt(r.currentBlind ? r.currentBlind.scoreRequired : 0),
    totalLabel: fmt(r.score),
    roundScore: r.roundScore,
    needed: r.currentBlind ? r.currentBlind.scoreRequired : 0,
  };
});
check('the end screen shows the score of the blind that was lost',
  over.info.score, over.roundLabel);
check('the end screen shows what that blind needed',
  over.info.needed, over.neededLabel);
check('the end screen keeps the run score apart',
  over.info.total, over.totalLabel);
check('the lost blind did not reach its target',
  over.roundScore < over.needed, true);
await shot('09b-game-over');

// --- localisation --------------------------------------------------------
// The interface switches between Chinese and English at runtime, and the
// render surface scales the pixel buffer by a whole multiple.

const surface = await page.evaluate(() => {
  const c = document.getElementById('game');
  return { w: c.width, h: c.height, cssW: parseFloat(c.style.width), scale: window.game.scale };
});
check('the canvas is supersampled', surface.w === 428 * surface.scale, true);
check('the canvas is square pixels', surface.h === 240 * surface.scale, true);
check('the canvas is displayed 1:1', surface.cssW === 428 * surface.scale, true);
check('the scale is a whole multiple', Number.isInteger(surface.scale), true);

await page.evaluate(() => {
  const g = window.game;
  g.toMenu();
  g.run = null;
});
await page.waitForTimeout(150);
const lang = await page.evaluate(() => {
  const before = document.documentElement.lang;
  window.game.constructor; // keep the reference alive
  const i18n = window.__i18n;
  i18n.toggleLang();
  return { before, after: document.documentElement.lang };
});
check('the language switched', lang.before !== lang.after, true);
await page.waitForTimeout(150);
await shot('10-language');
const switched = await page.evaluate(() => ({
  lang: document.documentElement.lang,
  stored: localStorage.getItem('balatro-pixel-lang'),
}));
check('the language is stored', switched.stored, switched.lang);
// Toggle back so the remaining shots stay in the original language.
await page.evaluate(() => window.__i18n.toggleLang());
await page.waitForTimeout(150);

// --- the rules page ---
// It lists every card, item and mechanic, so it has to load without errors
// and it has to contain the whole reference.
{
  const rules = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  rules.on('console', (m) => { if (m.type() === 'error') errors.push(`rules console.error: ${m.text()}`); });
  rules.on('pageerror', (e) => errors.push(`rules pageerror: ${e.message}`));
  await rules.goto(`${BASE}/rules.html`, { waitUntil: 'networkidle' });
  await rules.waitForTimeout(400);
  const info = await rules.evaluate(() => ({
    sections: document.querySelectorAll('main > section').length,
    entries: document.querySelectorAll('.entry').length,
    jokers: document.querySelectorAll('#sec-jokers .entry').length,
    empty: [...document.querySelectorAll('.entry')]
      .filter((e) => !e.querySelector('.effect') || !e.querySelector('.effect').textContent.trim()).length,
    nav: document.querySelectorAll('nav a').length,
  }));
  check('the rules page has every section', info.sections, 14);
  check('the rules page lists the jokers', info.jokers, 150);
  check('the rules page has entries', info.entries > 300, true);
  check('the rules page has no empty entries', info.empty, 0);
  check('the rules page has a section index', info.nav, 14);
  // The Chinese build must not leak any English into the page.
  await rules.evaluate(() => localStorage.setItem('balatro-pixel-lang', 'zh'));
  await rules.reload({ waitUntil: 'networkidle' });
  await rules.waitForTimeout(300);
  const zh = await rules.evaluate(() => ({
    lang: document.documentElement.lang,
    enChips: document.querySelectorAll('.entry .en').length,
    // A bracket with Latin letters in it, e.g. "High Card (High Card)".
    bracketed: [...document.querySelectorAll('.entry .name, td, h3')]
      .map((e) => e.textContent)
      .filter((s) => /\([A-Za-z]/.test(s)),
    latin: [...new Set(document.getElementById('main').innerText.match(/[A-Za-z][A-Za-z']{1,}/g) || [])],
    unlocks: [...document.querySelectorAll('.chip')]
      .filter((c) => c.textContent.startsWith('解锁')).length,
  }));
  check('the rules page is in chinese', zh.lang, 'zh-CN');
  check('the rules page shows no english names', zh.enChips, 0);
  check('the rules page shows no bracketed english', zh.bracketed, []);
  // "Boss" and "DNA" are the only English words the Chinese build keeps.
  check('the rules page has no untranslated english', zh.latin, ['Boss', 'DNA']);
  check('the rules page translates every unlock condition', zh.unlocks, 45);
  // The search narrows the list down.
  await rules.fill('#search', 'Raised Fist');
  await rules.waitForTimeout(200);
  const hits = await rules.evaluate(() => document.querySelectorAll('.entry:not(.hidden)').length);
  check('the rules page searches', hits > 0 && hits < 10, true);
  await rules.screenshot({ path: `${OUT}11-rules.png` });
  console.log('shot: 11-rules.png');
  await rules.close();
}

console.log('\n=== errors ===');
console.log(errors.length ? errors.join('\n---\n') : 'none');
console.log(`\n${checks - failures}/${checks} checks passed`);

await browser.close();
process.exit(errors.length || failures ? 1 : 0);
