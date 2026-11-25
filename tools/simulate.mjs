// Headless simulation harness.
//
//   node tools/simulate.mjs [--runs N] [--seed S]
//
// Three passes:
//   1. Full runs  - random decks / stakes / blinds / shop decisions, many seeds.
//   2. Every joker - force each joker into a run, then play hands.
//   3. Every consumable / voucher - force-use each tarot, spectral and voucher.
//
// The harness reports crashes, NaN scores and impossible states. It is the
// safety net for engine changes: run it before and after every refactor.

import { Run, DECKS } from '../src/engine/run.js';
import { JOKERS } from '../src/engine/jokers.js';
import { JOKER_DATA } from '../src/data/jokers.js';
import { TAROTS, SPECTRALS, PLANETS, VOUCHERS } from '../src/engine/consumables.js';
import { STAKES, BOSS_BLINDS, SHOWDOWN_BLINDS } from '../src/engine/blinds.js';

const args = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const RUNS = Number(argOf('--runs', 60));
const BASE_SEED = Number(argOf('--seed', 1));

const failures = [];
const notes = [];
let checks = 0;

function fail(where, err) {
  failures.push(`[${where}] ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err}`);
}

function expect(cond, where, msg) {
  checks++;
  if (!cond) failures.push(`[${where}] ${msg}`);
}

// ---------------------------------------------------------------------------
// helpers

function randomSubset(arr, rng, n) {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rng.next() * copy.length), 1)[0]);
  }
  return out;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    },
    int(n) { return Math.floor(this.next() * n); },
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
  };
}

// ---------------------------------------------------------------------------
// Pass 1: full random runs

function playRandomRun(seed, deckName, stake) {
  const rng = makeRng(seed);
  const run = new Run({ seed, deck: deckName, stake });
  let guard = 0;

  while (!run.won && guard++ < 400) {
    // Pick a blind (sometimes skip).
    const opts = run.selectableBlinds();
    if (!opts.length) break;
    const choice = rng.next() < 0.1 && opts.length > 1 ? 'skip' : opts[rng.int(opts.length)];
    if (choice === 'skip') {
      run.skipBlind();
      continue;
    }
    run.selectBlind(choice.type);

    // Play the round.
    let roundGuard = 0;
    while (!run.blindBeaten() && roundGuard++ < 40) {
      if (run.handsLeft <= 0 && run.discardsLeft <= 0) break;
      const selectable = run.hand.filter((c) => !c.forceSelected);
      const n = 1 + rng.int(Math.max(1, Math.min(5, selectable.length)));
      const picked = randomSubset(selectable, rng, n);

      if (rng.next() < 0.25 && run.discardsLeft > 0 && picked.length) {
        run.selectCards(picked);
        run.discardSelection();
        continue;
      }
      run.selectCards(picked);
      const res = run.playHand();
      if (!res) break;
      if (res.error) {
        // Boss restrictions can reject a hand; try again with another pick.
        run.selectCards([]);
        continue;
      }
      expect(Number.isFinite(res.score), 'score', `non-finite score ${res.score} (deck=${deckName} seed=${seed})`);
      expect(Number.isFinite(res.chips), 'score', `non-finite chips ${res.chips}`);
      expect(Number.isFinite(res.mult), 'score', `non-finite mult ${res.mult}`);
    }

    if (!run.blindBeaten()) {
      // Ran out of hands: the run should end here.
      break;
    }

    run.completeBlind();
    if (!run.shop) break;

    // Shop decisions.
    for (const item of run.shop.items.slice()) {
      if (rng.next() < 0.4 && run.money > 20) {
        const { buyCard } = await_import_shop();
        buyCard(run, item);
      }
    }
    for (const pack of run.shop.packs.slice()) {
      if (rng.next() < 0.35) {
        const { buyPack, takeFromPack } = await_import_shop();
        const res = buyPack(run, pack);
        if (!res.error && res.options.length) {
          takeFromPack(run, pack, [res.options[0]]);
        }
      }
    }
    if (run.shop.voucher && rng.next() < 0.5) {
      const { buyVoucherItem } = await_import_shop();
      buyVoucherItem(run);
    }
    if (rng.next() < 0.3) {
      const { rerollShop } = await_import_shop();
      rerollShop(run);
    }
    // Use a consumable now and then.
    if (run.consumables.length && rng.next() < 0.5) {
      const c = run.consumables[rng.int(run.consumables.length)];
      const targets = randomSubset(run.hand, rng, rng.int(4));
      run.useConsumable(c, targets);
    }
    run.shop = null;
  }
  return run;
}

// shop.js is imported lazily to keep the import graph flat at the top.
let _shop = null;
function await_import_shop() {
  if (!_shop) throw new Error('shop module not loaded');
  return _shop;
}

// ---------------------------------------------------------------------------

async function main() {
  _shop = await import('../src/engine/shop.js');

  const deckNames = Object.keys(DECKS).filter((d) => d !== 'Anaglyph Deck 2');
  const stakeIds = STAKES.map((s) => s.id);

  // ---- Pass 1: random runs -----------------------------------------------
  for (let i = 0; i < RUNS; i++) {
    const seed = BASE_SEED + i;
    const deckName = deckNames[i % deckNames.length];
    const stake = stakeIds[i % stakeIds.length];
    try {
      const run = playRandomRun(seed, deckName, stake);
      expect(Number.isFinite(run.money), 'run', `money became ${run.money}`);
      expect(run.money >= -100, 'run', `money went badly negative: ${run.money}`);
    } catch (e) {
      fail(`run seed=${seed} deck=${deckName} stake=${stake}`, e);
    }
  }

  // ---- Pass 2: every joker -----------------------------------------------
  const jokerNames = JOKER_DATA.map((j) => j.name);
  for (const name of jokerNames) {
    try {
      const run = new Run({ seed: 4242, deck: 'Red Deck', stake: 'white' });
      run.selectBlind('small');
      const joker = run.buildJoker(name);
      run.jokers.push(joker);
      run.onJokerAcquired(joker);
      // Play several hands with different card counts.
      for (let h = 0; h < 4; h++) {
        const n = 1 + (h % 5);
        const picked = run.hand.slice(0, Math.min(n, run.hand.length));
        if (!picked.length) break;
        run.selectCards(picked);
        const res = run.playHand();
        if (res && !res.error) {
          expect(Number.isFinite(res.score), `joker:${name}`,
            `non-finite score ${res.score}`);
          expect(Number.isFinite(res.chips), `joker:${name}`, `non-finite chips`);
          expect(Number.isFinite(res.mult), `joker:${name}`, `non-finite mult`);
        }
      }
      // Also exercise discard + round end so end-of-round hooks fire.
      run.selectCards(run.hand.slice(0, 2));
      run.discardSelection();
      run.endRound();
      expect(Number.isFinite(run.money), `joker:${name}`, `money became ${run.money}`);
    } catch (e) {
      fail(`joker ${name}`, e);
    }
  }

  // ---- Pass 3: every consumable and voucher ------------------------------
  for (const name of Object.keys(TAROTS)) {
    try {
      const run = new Run({ seed: 777, deck: 'Red Deck', stake: 'white' });
      run.selectBlind('small');
      const c = run.makeConsumable(name);
      run.consumables.push(c);
      run.useConsumable(c, run.hand.slice(0, 3));
      expect(!run.consumables.includes(c), `tarot:${name}`, 'tarot was not consumed');
    } catch (e) {
      fail(`tarot ${name}`, e);
    }
  }

  for (const name of Object.keys(SPECTRALS)) {
    try {
      const run = new Run({ seed: 778, deck: 'Red Deck', stake: 'white' });
      run.selectBlind('small');
      const c = run.makeConsumable(name);
      run.consumables.push(c);
      run.useConsumable(c, run.hand.slice(0, 3));
      expect(!run.consumables.includes(c), `spectral:${name}`, 'spectral was not consumed');
    } catch (e) {
      fail(`spectral ${name}`, e);
    }
  }

  for (const name of Object.keys(PLANETS)) {
    try {
      const run = new Run({ seed: 779, deck: 'Red Deck', stake: 'white' });
      run.selectBlind('small');
      const c = run.makeConsumable(name);
      run.consumables.push(c);
      run.useConsumable(c, []);
    } catch (e) {
      fail(`planet ${name}`, e);
    }
  }

  for (const name of Object.keys(VOUCHERS)) {
    try {
      const run = new Run({ seed: 780, deck: 'Red Deck', stake: 'white' });
      run.buyVoucher(name);
      run.selectBlind('small');
      const picked = run.hand.slice(0, 3);
      run.selectCards(picked);
      const res = run.playHand();
      if (res && !res.error) {
        expect(Number.isFinite(res.score), `voucher:${name}`, `non-finite score ${res.score}`);
      }
      run.endRound();
      expect(Number.isFinite(run.money), `voucher:${name}`, `money became ${run.money}`);
    } catch (e) {
      fail(`voucher ${name}`, e);
    }
  }

  // ---- Pass 4: every boss blind ------------------------------------------
  for (const boss of [...BOSS_BLINDS, ...SHOWDOWN_BLINDS]) {
    try {
      const run = new Run({ seed: 900 + boss.minAnte, deck: 'Red Deck', stake: 'white' });
      run.ante = boss.minAnte;
      run.currentBoss = boss;
      run.startBlind();
      let guard = 0;
      while (!run.blindBeaten() && guard++ < 20 && run.handsLeft > 0) {
        const picked = run.hand.filter((c) => !c.faceDown).slice(0, 5);
        run.selectCards(picked);
        const res = run.playHand();
        if (res && !res.error) {
          expect(Number.isFinite(res.score), `boss:${boss.id}`, `non-finite score ${res.score}`);
        }
        run.selectCards([]);
      }
    } catch (e) {
      fail(`boss ${boss.id}`, e);
    }
  }

  // ---- Pass 5: a full run to the win screen --------------------------------
  // Every blind is beaten automatically, so the whole ante ladder, the shop
  // and the final win transition are exercised.
  {
    const run = new Run({ seed: 31337, deck: 'Red Deck', stake: 'white' });
    let guard = 0;
    while (!run.won && guard++ < 60) {
      const opts = run.selectableBlinds();
      if (!opts.length) break;
      run.selectBlind(opts[0].type);
      run.roundScore = run.currentBlind.scoreRequired;
      run.currentBlind.score = run.roundScore;
      run.completeBlind();
      if (run.shop) {
        for (const item of run.shop.items.slice()) {
          if (item.kind === 'joker') _shop.buyCard(run, item);
        }
        const shop = run.shop;
        _shop.closeShop(run);
        void shop;
      }
      if (run.ante > 10) break;
    }
    expect(run.won === true, 'win', `the run should be won (ante=${run.ante})`);
    expect(run.ante >= 9, 'win', `ante should pass 8, got ${run.ante}`);
    // 24 rounds for a clean run; a rolled Boss Tag replaces a Big Blind and
    // turns that ante into two rounds instead of three.
    expect(run.roundsPlayed >= 22 && run.roundsPlayed <= 24, 'win',
      `expected 22-24 rounds, got ${run.roundsPlayed}`);
    expect(Number.isFinite(run.money), 'win', `money became ${run.money}`);
  }

  // ---- report ------------------------------------------------------------
  console.log(`checks: ${checks}`);
  if (notes.length) {
    console.log('notes:');
    for (const n of notes) console.log('  -', n);
  }
  if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):`);
    const seen = new Set();
    for (const f of failures) {
      const key = f.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      console.log('  ' + f);
    }
    process.exit(1);
  }
  console.log('\nAll simulation checks passed.');
}

main().catch((e) => {
  console.error('harness crashed:', e);
  process.exit(2);
});
