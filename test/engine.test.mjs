// Test harness: verifies scoring, hands, blinds, ante math.
import { evaluateHand, handLevelValues, HANDS, HAND_BY_ID } from '../src/engine/hands.js';
import { makeCard, SUITS } from '../src/engine/cards.js';
import { Run } from '../src/engine/run.js';
import { jokerTarget, jokerValue, JOKERS } from '../src/engine/jokers.js';
import { anteBase, blindScore, BOSS_BLINDS } from '../src/engine/blinds.js';
import { createShop, buyCard, sellCard, computeSellValue, computeBuyCost } from '../src/engine/shop.js';
import { roundHalfDown } from '../src/engine/value.js';
import { readFileSync } from 'node:fs';
import { JOKER_DESCRIPTIONS } from '../src/data/descriptions.js';

let pass = 0; let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else {
    fail++;
    console.log(`FAIL ${name}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
  }
}

const C = (r, s, o) => makeCard(r, s, o);

// --- hand detection ---
check('high card', evaluateHand([C(14, 'S')]).id, 'high_card');
check('pair', evaluateHand([C(5, 'H'), C(5, 'C')]).id, 'pair');
check('two pair', evaluateHand([C(5, 'H'), C(5, 'C'), C(9, 'D'), C(9, 'S')]).id, 'two_pair');
check('three of a kind', evaluateHand([C(7, 'H'), C(7, 'C'), C(7, 'D')]).id, 'three_of_a_kind');
check('straight', evaluateHand([C(2, 'H'), C(3, 'C'), C(4, 'D'), C(5, 'S'), C(6, 'H')]).id, 'straight');
check('broadway straight', evaluateHand([C(10, 'H'), C(11, 'C'), C(12, 'D'), C(13, 'S'), C(14, 'H')]).id, 'straight');
check('wheel straight', evaluateHand([C(14, 'H'), C(2, 'C'), C(3, 'D'), C(4, 'S'), C(5, 'H')]).id, 'straight');
check('flush', evaluateHand([C(2, 'H'), C(5, 'H'), C(9, 'H'), C(11, 'H'), C(13, 'H')]).id, 'flush');
check('full house', evaluateHand([C(7, 'H'), C(7, 'C'), C(7, 'D'), C(2, 'S'), C(2, 'H')]).id, 'full_house');
check('four of a kind', evaluateHand([C(9, 'H'), C(9, 'C'), C(9, 'D'), C(9, 'S')]).id, 'four_of_a_kind');
check('straight flush', evaluateHand([C(2, 'H'), C(3, 'H'), C(4, 'H'), C(5, 'H'), C(6, 'H')]).id, 'straight_flush');
check('four of a kind beats flush', evaluateHand([C(9, 'H'), C(9, 'C'), C(9, 'D'), C(9, 'S'), C(2, 'H')]).id, 'four_of_a_kind');
check('five of a kind', evaluateHand([C(9, 'H'), C(9, 'C'), C(9, 'D'), C(9, 'S'), C(9, 'H')]).id, 'five_of_a_kind');
check('flush five', evaluateHand([C(9, 'H'), C(9, 'H'), C(9, 'H'), C(9, 'H'), C(9, 'H')]).id, 'flush_five');
// Ace high is not a straight (K A 2 3 4)
check('K A 2 3 4 not straight', evaluateHand([C(13, 'H'), C(14, 'C'), C(2, 'D'), C(3, 'S'), C(4, 'H')]).id, 'high_card');
// Wild card makes a flush
check('wild makes flush', evaluateHand([C(2, 'H'), C(5, 'H'), C(9, 'H'), C(11, 'H'), C(9, 'C', { enhancement: 'wild' })]).id, 'flush');
// Stone card has no rank
check('stone no rank', evaluateHand([C(2, 'H', { enhancement: 'stone' })]).id, 'high_card');

// --- hand levels ---
check('pair level 1', handLevelValues('pair', 1), { chips: 10, mult: 2 });
check('pair level 2', handLevelValues('pair', 2), { chips: 25, mult: 3 });
check('high card level 1', handLevelValues('high_card', 1), { chips: 5, mult: 1 });
check('flush level 1', handLevelValues('flush', 1), { chips: 35, mult: 4 });
check('straight flush level 1', handLevelValues('straight_flush', 1), { chips: 100, mult: 8 });

// --- ante requirements ---
check('ante 1 white', anteBase(1, 'white'), 300);
check('ante 2 white', anteBase(2, 'white'), 800);
check('ante 8 white', anteBase(8, 'white'), 50000);
check('ante 8 green', anteBase(8, 'green'), 100000);
check('ante 8 purple', anteBase(8, 'purple'), 200000);
check('ante 2 green', anteBase(2, 'green'), 900);
check('ante 3 green', anteBase(3, 'green'), 2600);
check('small blind ante1', blindScore(1, 'white', 1), 300);
check('big blind ante1', blindScore(1, 'white', 1.5), 450);
check('boss blind ante1', blindScore(1, 'white', 2), 600);
check('plasma doubles', blindScore(1, 'white', 1, true), 600);

// --- full run smoke test ---
{
  const run = new Run({ seed: 12345 });
  run.currentBoss = BOSS_BLINDS[0];
  run.startBlind();
  check('hand size 8', run.hand.length, 8);
  check('hands left 4', run.handsLeft, 4);
  check('discards left 3', run.discardsLeft, 3);
  // Play a high card
  run.selectCards([run.hand[0]]);
  const res = run.playHand();
  check('high card scored', res.handId, 'high_card');
  check('score > 0', res.score > 0, true);
  check('hands left decremented', run.handsLeft, 3);
}

// --- deterministic RNG ---
{
  const a = new Run({ seed: 999 });
  const b = new Run({ seed: 999 });
  check('same seed same deck', a.deckPile.map((c) => c.rank + c.suit).join(),
    b.deckPile.map((c) => c.rank + c.suit).join());
}

// --- regressions: bugs that used to break the game ---

// The Plasma Deck balances chips and mult (it never used to apply at all).
{
  const run = new Run({ seed: 5, deck: 'Plasma Deck' });
  run.selectBlind('small');
  run.selectCards([run.hand[0]]);
  const res = run.playHand();
  check('plasma balances chips and mult', res.chips, res.mult);
}

// The Blue Joker counts the cards left in the deck (it produced NaN before).
{
  const run = new Run({ seed: 6 });
  run.selectBlind('small');
  const joker = run.buildJoker('Blue Joker');
  run.jokers.push(joker);
  run.onJokerAcquired(joker);
  run.selectCards([run.hand[0]]);
  const res = run.playHand();
  check('blue joker is finite', Number.isFinite(res.score), true);
  check('blue joker chips > 0', res.chips > 0, true);
}

// Swashbuckler counts the sell value of the *other* jokers only.
{
  const run = new Run({ seed: 7 });
  run.selectBlind('small');
  const a = run.buildJoker('Swashbuckler');
  const b = run.buildJoker('Joker');
  run.jokers.push(a, b);
  run.onJokerAcquired(a);
  run.onJokerAcquired(b);
  run.selectCards([run.hand[0]]);
  const res = run.playHand();
  check('swashbuckler ignores itself', res.mult > 4, true);
}

// The Blue Deck gives an extra hand per round, not an extra hand size.
{
  const run = new Run({ seed: 8, deck: 'Blue Deck' });
  run.selectBlind('small');
  check('blue deck hand size', run.hand.length, 8);
  check('blue deck hands per round', run.handsLeft, 5);
}

// Vouchers must not be counted twice (Paint Brush gave +2 hand size before).
{
  const run = new Run({ seed: 9 });
  run.buyVoucher('Paint Brush');
  check('paint brush hand size', run.handSize, 9);
  const run2 = new Run({ seed: 9 });
  run2.buyVoucher('Grabber');
  check('grabber hand size', run2.handSize, 8);
  run2.selectBlind('small');
  check('grabber hands per round', run2.handsLeft, 5);
}

// Hieroglyph lowers every Ante instead of only the one it was bought in.
{
  const run = new Run({ seed: 10 });
  run.buyVoucher('Hieroglyph');
  run.anteProgress = 2;
  run.advanceBlind();
  check('hieroglyph lowers the ante', run.ante, 1);
}

// Running out of hands loses the blind even when discards remain.
{
  const run = new Run({ seed: 11 });
  run.selectBlind('small');
  run.handsLeft = 0;
  run.discardsLeft = 3;
  check('out of hands is fatal', run.isDead(), true);
  run.roundScore = run.currentBlind.scoreRequired;
  check('a beaten blind is not fatal', run.isDead(), false);
}

// Perishable and Rental jokers expire at the end of the round.
{
  const run = new Run({ seed: 12 });
  run.selectBlind('small');
  const j = run.buildJoker('Joker');
  j.perishable = true;
  run.jokers.push(j);
  run.endRound();
  check('perishable joker expires', run.jokers.length, 0);
}

// Mime retriggers held cards (its definition used to be overwritten).
{
  const run = new Run({ seed: 13 });
  run.selectBlind('small');
  const mime = run.buildJoker('Mime');
  run.jokers.push(mime);
  run.onJokerAcquired(mime);
  run.selectCards(run.hand.slice(0, 1));
  const res = run.playHand();
  check('mime runs', res.handId, 'high_card');
}

// The legendaries can only be rolled on purpose (The Soul).
{
  const run = new Run({ seed: 14 });
  const soul = run.createJoker(null, 'Legendary');
  check('legendary joker can be created', !!soul, true);
  check('legendary is legendary', soul.rarity, 'Legendary');
}

// Flower Pot needs a 2, 3, 4 and 5 - not four different suits.
{
  const hand2345 = [makeCard(2, 'H'), makeCard(3, 'H'), makeCard(4, 'H'), makeCard(5, 'H')];
  const run = new Run({ seed: 15 });
  run.selectBlind('small');
  const fp = run.buildJoker('Flower Pot');
  run.jokers.push(fp);
  run.onJokerAcquired(fp);
  run.selectCards(hand2345);
  const res = run.playHand();

  const plain = new Run({ seed: 15 });
  plain.selectBlind('small');
  plain.selectCards(hand2345);
  const base = plain.playHand();
  check('flower pot triples the mult', res.mult, base.mult * 3);
}

// Smeared Joker merges Hearts/Diamonds and Clubs/Spades.
{
  const run = new Run({ seed: 16 });
  run.selectBlind('small');
  const sm = run.buildJoker('Smeared Joker');
  run.jokers.push(sm);
  run.onJokerAcquired(sm);
  check('smeared joker is active', run.smeared, true);
  const hand = [makeCard(2, 'H'), makeCard(4, 'H'), makeCard(7, 'D'), makeCard(9, 'D'), makeCard(11, 'H')];
  check('smeared flush', evaluateHand(hand, { smeared: true }).id, 'flush');
}

// The Anaglyph and Painted decks give every enhanced card a twin.
{
  const run = new Run({ seed: 17, deck: 'Anaglyph Deck' });
  const enhanced = run.fullDeck.filter((c) => c.enhancement || c.seal).length;
  check('anaglyph deck adds copies', run.fullDeck.length, 52 + enhanced);
}

// Tags apply to the shop they are rolled into.
{
  const run = new Run({ seed: 18 });
  run.shop = createShop(run);
  check('shop exists', !!run.shop, true);
  check('shop has items', run.shop.items.length >= 2, true);
}

// A negative consumable takes a slot of its own.
{
  const run = new Run({ seed: 19 });
  const c = run.makeConsumable('The Fool');
  c.edition = 'negative';
  run.consumables.push(c);
  check('negative consumable slot', run.consumableSlots, 1);
}

// Cards left in hand at the end of a round must go back to the discard pile,
// otherwise the deck empties out after a few rounds.
{
  const run = new Run({ seed: 21 });
  run.selectBlind('small');
  const count = () => run.deckPile.length + run.discardPile.length + run.hand.length;
  const before = count();
  run.completeBlind();
  const opts = run.selectableBlinds();
  run.selectBlind(opts[0].type);
  check('no cards are lost between rounds', count(), before);
}

// The whole deck must still be reachable after several rounds.
{
  const run = new Run({ seed: 22 });
  for (let i = 0; i < 12; i++) {
    const opts = run.selectableBlinds();
    run.selectBlind(opts[0].type);
    run.roundScore = run.currentBlind.scoreRequired;
    run.currentBlind.score = run.roundScore;
    run.completeBlind();
    if (run.shop) { run.shop = null; }
  }
  const total = run.deckPile.length + run.discardPile.length + run.hand.length;
  check('the deck survives many rounds', total >= 52, true);
}

// --- selling removes the card ---
// Regression: the engine strips `kind` when an item joins the run, so the
// sell path has to work the type out from the item itself. Selling used to
// hand out the money while leaving the card in the run.
{
  const run = new Run({ deck: 'Red Deck', stake: 'white', seed: 7 });
  const joker = run.createJoker('Blue Joker');
  const tarot = run.createConsumable('Tarot');
  const money = run.money;

  const value = computeSellValue(run, joker);
  sellCard(run, joker);
  check('selling a joker removes it', run.jokers.length, 0);
  check('selling a joker pays out', run.money, money + value);

  sellCard(run, tarot);
  check('selling a consumable removes it', run.consumables.length, 0);
  check('selling a consumable pays out', run.money > money + value, true);
}

// --- score breakdown ---
// Every scoring step records what it contributed. The steps have to add up
// to the totals, otherwise the breakdown would lie about the score.
{
  const run = new Run({ seed: 21 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Blue Joker'));
  run.selection = run.hand.slice(0, 5);
  const res = run.playHand();
  const br = res.breakdown;
  let chips = 0;
  let mult = 0;
  for (const step of br.steps) {
    chips += step.chips;
    mult += step.mult;
  }
  check('breakdown chips add up', Math.abs(chips - br.chips) < 1e-9, true);
  check('breakdown mult adds up', Math.abs(mult - br.mult) < 1e-9, true);
  check('breakdown score matches', br.score, Math.floor(br.chips * br.mult));
  check('breakdown starts with the hand', br.steps[0].kind, 'base');
  check('breakdown lists the scored cards',
    br.steps.filter((s) => s.kind === 'card').length > 0, true);
  check('breakdown lists the jokers',
    br.steps.some((s) => s.kind === 'joker' && s.name === 'Blue Joker'), true);
  // The running totals of the last step are the final totals.
  const last = br.steps[br.steps.length - 1];
  check('breakdown running total', last.totals.chips, br.chips);
}

// A multiplier that hits zero still applies (Madness can drop to zero).
{
  const run = new Run({ seed: 22 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Madness'));
  run.madnessMult = 0;
  run.selection = run.hand.slice(0, 5);
  const res = run.playHand();
  check('a zero multiplier zeroes the mult', res.mult, 0);
  check('a zero multiplier is recorded',
    res.breakdown.steps.some((s) => s.factors.includes(0)), true);
}

// --- pair jokers trigger off matching ranks ---
// The Jolly Joker and the Sly Joker trigger on any hand that holds two
// cards of the same rank, not only on a Pair. A Two Pair counts.
{
  const run = new Run({ seed: 31 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Jolly Joker'));
  run.jokers.push(run.buildJoker('Sly Joker'));
  const two = [C(5, 'H'), C(5, 'C'), C(9, 'D'), C(9, 'S')];
  run.hand = two.slice();
  run.selection = two;
  const res = run.playHand();
  check('the hand is a two pair', res.handId, 'two_pair');
  const jolly = res.breakdown.steps.find((s) => s.name === 'Jolly Joker');
  const sly = res.breakdown.steps.find((s) => s.name === 'Sly Joker');
  check('the jolly joker triggers on a two pair', jolly ? jolly.mult : 0, 8);
  check('the sly joker triggers on a two pair', sly ? sly.chips : 0, 50);
}

// A hand without two cards of the same rank does not trigger them.
{
  const run = new Run({ seed: 32 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Jolly Joker'));
  run.jokers.push(run.buildJoker('Sly Joker'));
  const high = [C(2, 'H'), C(5, 'C'), C(9, 'D'), C(11, 'S')];
  run.hand = high.slice();
  run.selection = high;
  const res = run.playHand();
  check('the hand is a high card', res.handId, 'high_card');
  const jolly = res.breakdown.steps.find((s) => s.name === 'Jolly Joker');
  const sly = res.breakdown.steps.find((s) => s.name === 'Sly Joker');
  check('the jolly joker stays quiet on a high card', jolly ? jolly.mult : 0, 0);
  check('the sly joker stays quiet on a high card', sly ? sly.chips : 0, 0);
}

// The hand a joker checks and the text that describes it have to agree.
{
  const src = readFileSync(new URL('../src/engine/jokers.js', import.meta.url), 'utf8');
  const lines = src.split('\n');
  const names = {
    pair: 'Pair', two_pair: 'Two Pair', three_of_a_kind: 'Three of a Kind',
    straight: 'Straight', flush: 'Flush', full_house: 'Full House',
    four_of_a_kind: 'Four of a Kind', five_of_a_kind: 'Five of a Kind',
    flush_house: 'Flush House', flush_five: 'Flush Five', high_card: 'High Card',
  };
  let joker = null;
  const impl = {};
  for (const line of lines) {
    const m = /^\s*'([^']+)':\s*\{/.exec(line);
    if (m) joker = m[1];
    const h = /has\(ctx,\s*'(\w+)'\)/.exec(line);
    if (h && joker) {
      impl[joker] = impl[joker] || new Set();
      impl[joker].add(names[h[1]]);
    }
  }
  const wrong = [];
  for (const [name, hands] of Object.entries(impl)) {
    const text = JOKER_DESCRIPTIONS[name] || '';
    const claimed = /contains an?\s+([A-Za-z ]+?)(?:\.|$|,)/.exec(text);
    if (!claimed || !hands.has(claimed[1].trim())) {
      if (name !== 'Superposition') wrong.push(`${name}: ${text}`);
    }
  }
  check('joker text matches the hand it checks', wrong, []);
}

// --- face down cards ---
// Boss blinds like The House turn cards face down. That is the blind's doing
// and not a property of the card, so a card has to come back face up once it
// is drawn again.
{
  const run = new Run({ seed: 41 });
  run.selectBlind('small');
  const card = run.hand[0];
  card.faceDown = true;
  run.discardPile.push(card);
  run.deckPile = [];
  run.drawCards(1);
  check('a redrawn card is face up', run.hand[0].faceDown, false);
}

// The blind effects themselves still turn cards over.
{
  const run = new Run({ seed: 42 });
  run.currentBoss = { id: 'the_house', name: 'The House', scoreRequired: 100, reward: 5 };
  run.round = 2;
  run.startBlind();
  check('the house draws the hand face down',
    run.hand.every((c) => c.faceDown), true);
}

// --- jokers that read the cards held in hand ---
// "Held in hand" means the cards that stay in the hand, not the ones that were
// played, and an ability of that kind triggers once per card it belongs to.

// Raised Fist: double the rank of the lowest card left in hand, once.
{
  const run = new Run({ seed: 51 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  const cards = [C(2, 'H'), C(5, 'C'), C(7, 'D'), C(9, 'S'), C(13, 'H')];
  run.hand = cards.slice();
  run.selection = [cards[4]];
  const res = run.playHand();
  const steps = res.breakdown.steps.filter((s) => s.name === 'Raised Fist');
  const mult = steps.reduce((a, s) => a + s.mult, 0);
  check('raised fist doubles the lowest card', mult, 4);
  check('raised fist triggers once', steps.filter((s) => s.mult > 0).length, 1);
}

// A face card is worth 10, so it gives +20 Mult.
{
  const run = new Run({ seed: 52 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  const cards = [C(11, 'H'), C(13, 'C'), C(12, 'D')];
  run.hand = cards.slice();
  run.selection = [cards[1], cards[2]];
  const res = run.playHand();
  const mult = res.breakdown.steps.filter((s) => s.name === 'Raised Fist')
    .reduce((a, s) => a + s.mult, 0);
  check('raised fist gives +20 for a face card', mult, 20);
}

// An Ace is worth 11, so it gives +22 Mult.
{
  const run = new Run({ seed: 53 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  const cards = [C(14, 'H'), C(14, 'C'), C(5, 'D')];
  run.hand = cards.slice();
  run.selection = [cards[2]];
  const res = run.playHand();
  const mult = res.breakdown.steps.filter((s) => s.name === 'Raised Fist')
    .reduce((a, s) => a + s.mult, 0);
  check('raised fist gives +22 for an ace', mult, 22);
}

// The lowest card is looked for in the cards that stay in the hand.
{
  const run = new Run({ seed: 54 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  const cards = [C(2, 'H'), C(5, 'C'), C(7, 'D')];
  run.hand = cards.slice();
  run.selection = [cards[0]];
  const res = run.playHand();
  const mult = res.breakdown.steps.filter((s) => s.name === 'Raised Fist')
    .reduce((a, s) => a + s.mult, 0);
  check('raised fist ignores the played cards', mult, 10);
}

// Stones have no rank and can never trigger it.
{
  const run = new Run({ seed: 55 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  const cards = [C(2, 'H', { enhancement: 'stone' }), C(5, 'C'), C(7, 'D')];
  run.hand = cards.slice();
  run.selection = [cards[1], cards[2]];
  const res = run.playHand();
  const mult = res.breakdown.steps.filter((s) => s.name === 'Raised Fist')
    .reduce((a, s) => a + s.mult, 0);
  check('raised fist ignores stone cards', mult, 0);
}

// A debuffed card gives nothing.
{
  const run = new Run({ seed: 56 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  const cards = [C(2, 'H'), C(5, 'C')];
  run.hand = cards.slice();
  cards[0].debuffed = true;
  run.selection = [cards[1]];
  const res = run.playHand();
  const mult = res.breakdown.steps.filter((s) => s.name === 'Raised Fist')
    .reduce((a, s) => a + s.mult, 0);
  check('raised fist gives nothing for a debuffed card', mult, 0);
}

// Mime retriggers abilities that trigger on cards held in hand.
{
  const run = new Run({ seed: 57 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  run.jokers.push(run.buildJoker('Mime'));
  const cards = [C(2, 'H'), C(5, 'C')];
  run.hand = cards.slice();
  run.selection = [cards[1]];
  const res = run.playHand();
  const mult = res.breakdown.steps.filter((s) => s.name === 'Raised Fist')
    .reduce((a, s) => a + s.mult, 0);
  check('mime retriggers raised fist', mult, 8);
}

// Shoot the Moon: +13 Mult for every Queen left in hand.
{
  const run = new Run({ seed: 58 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Shoot the Moon'));
  const cards = [C(12, 'H'), C(12, 'C'), C(5, 'D'), C(7, 'S')];
  run.hand = cards.slice();
  run.selection = [cards[2], cards[3]];
  const res = run.playHand();
  const mult = res.breakdown.steps.filter((s) => s.name === 'Shoot the Moon')
    .reduce((a, s) => a + s.mult, 0);
  check('shoot the moon counts the queens in hand', mult, 26);
}

// Baron: one X1.5 for every King left in hand, not one per card.
{
  const run = new Run({ seed: 59 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Baron'));
  const cards = [C(13, 'H'), C(5, 'C'), C(7, 'D'), C(9, 'S')];
  run.hand = cards.slice();
  run.selection = [cards[1]];
  const res = run.playHand();
  const steps = res.breakdown.steps.filter((s) => s.name === 'Baron' && s.factors.length);
  check('baron multiplies once per king', steps.length, 1);
  check('baron multiplies by 1.5', steps[0] ? steps[0].factors : [], [1.5]);
}

// A Steel card in hand gives X1.5 on its own.
{
  const run = new Run({ seed: 60 });
  run.selectBlind('small');
  const cards = [C(5, 'H', { enhancement: 'steel' }), C(9, 'C')];
  run.hand = cards.slice();
  run.selection = [cards[1]];
  const res = run.playHand();
  const held = res.breakdown.steps.filter((s) => s.kind === 'held');
  check('a steel card in hand multiplies by 1.5',
    held.flatMap((s) => s.factors), [1.5]);
}

// Held cards are walked from left to right, so a card with a multiplier has to
// sit to the right of the card that adds Mult.
{
  const run = new Run({ seed: 61 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  const cards = [C(2, 'H'), C(9, 'C', { enhancement: 'steel' }), C(7, 'D')];
  run.hand = cards.slice();
  run.selection = [cards[2]];
  const res = run.playHand();
  // high card (1) + the seven (2) + raised fist (4) = 7, times 1.5
  check('the mult is added before the multiplier', res.mult, 10.5);
}

// Bull: +2 chips for every $1 the player has.
{
  const run = new Run({ seed: 62 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Bull'));
  run.money = 10;
  run.selection = run.hand.slice(0, 1);
  const res = run.playHand();
  const bull = res.breakdown.steps.find((s) => s.name === 'Bull');
  check('bull gives 2 chips per dollar', bull ? bull.chips : 0, 20);
}

// Blackboard: X3 when every card left in hand is a Spade or a Club.
{
  const run = new Run({ seed: 63 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Blackboard'));
  const cards = [C(13, 'S'), C(7, 'C')];
  run.hand = cards.slice();
  run.selection = [cards[1]];
  const res = run.playHand();
  const bb = res.breakdown.steps.find((s) => s.name === 'Blackboard');
  check('blackboard multiplies a black hand', bb ? bb.factors : [], [3]);
}
{
  const run = new Run({ seed: 64 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Blackboard'));
  const cards = [C(13, 'S'), C(7, 'H')];
  run.hand = cards.slice();
  run.selection = [cards[0]];
  const res = run.playHand();
  const bb = res.breakdown.steps.find((s) => s.name === 'Blackboard');
  check('blackboard stays quiet with a red card', bb ? bb.factors : [], []);
}
{
  const run = new Run({ seed: 65 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Blackboard'));
  const cards = [C(13, 'S')];
  run.hand = cards.slice();
  run.selection = [cards[0]];
  const res = run.playHand();
  const bb = res.breakdown.steps.find((s) => s.name === 'Blackboard');
  check('blackboard multiplies with an empty hand', bb ? bb.factors : [], [3]);
}

// The breakdown lists the effect once, not once per card in hand, and it has
// no empty rows.
{
  const run = new Run({ seed: 66 });
  run.selectBlind('small');
  run.jokers.push(run.buildJoker('Raised Fist'));
  const cards = [C(2, 'H'), C(5, 'C'), C(7, 'D'), C(9, 'S')];
  run.hand = cards.slice();
  run.selection = [cards[3]];
  const res = run.playHand();
  const steps = res.breakdown.steps.filter((s) => s.name === 'Raised Fist');
  check('the breakdown lists raised fist once', steps.length, 1);
  check('the breakdown has no empty rows',
    res.breakdown.steps.filter((s) => !s.chips && !s.mult && !s.money
      && !(s.factors || []).length).length, 0);
}

// --- the blind pipeline ---
// The blind select screen shows the whole ante: what is behind the player,
// what can be picked now and what is still ahead.
{
  const run = new Run({ seed: 91 });
  let stages = run.antePipeline();
  check('the pipeline has three stages', stages.length, 3);
  check('the small blind is open', stages[0].state, 'open');
  check('the big blind is open too', stages[1].state, 'open');
  check('the boss blind is still ahead', stages[2].state, 'locked');
  check('the boss blind keeps a score range', stages[2].scoreMax > stages[2].scoreRequired, true);
  check('the pipeline starts with nothing cleared', run.blindProgress().beaten, 0);

  // Beat the small blind: it moves behind the player.
  run.selectBlind('small');
  run.roundScore = 500;
  run.currentBlind.score = 500;
  run.completeBlind();
  stages = run.antePipeline();
  check('the beaten blind is behind the player', stages[0].state, 'cleared');
  check('the beaten blind keeps its score', stages[0].score, 500);
  check('the big blind is open now', stages[1].state, 'open');
  check('the boss blind is still ahead', stages[2].state, 'locked');
  check('the run counts the beaten blind', run.blindProgress().beaten, 1);
  check('the history holds the blind', run.blindHistory.length, 1);
  check('the history knows the ante', run.blindHistory[0].ante, 1);

  // Skipping a blind counts as resolved, but not as beaten.
  run.skipBlind();
  check('a skipped blind is remembered', run.blindHistory[1].skipped, true);
  check('a skipped blind is not beaten', run.blindProgress().beaten, 1);
  check('a skipped blind is resolved', run.blindProgress().resolved, 2);
}

// The boss blind of the current ante is only known once the player reaches
// it, so the stage ahead of the player stays a surprise.
{
  const run = new Run({ seed: 92 });
  run.selectBlind('small');
  run.roundScore = 500;
  run.currentBlind.score = 500;
  run.completeBlind();
  const ahead = run.antePipeline()[2];
  check('the boss ahead keeps its name secret', ahead.name, 'Boss Blind');
  check('the boss ahead shows a range', ahead.scoreMax > ahead.scoreRequired, true);
}

// The next ante is previewed with the scores it will ask for.
{
  const run = new Run({ seed: 93 });
  const next = run.nextAntePreview();
  check('the next ante is the one after this one', next.ante, 2);
  check('the next ante asks for more', next.small > blindScore(1, 'white', 1), true);
  check('the next boss has a range', next.bossMax > next.bossMin, true);
}

// --- the hands of a blind ---
// A blind is played with four hands and three discards. The interface shows
// how many are left, so the numbers must not drift.
{
  const run = new Run({ seed: 94 });
  run.selectBlind('small');
  check('a blind starts with four hands', run.handsAtRoundStart, 4);
  check('four hands are left', run.handsLeft, 4);
  check('a blind starts with three discards', run.discardsAtRoundStart, 3);
  const cards = [C(2, 'H'), C(5, 'C'), C(7, 'D'), C(9, 'S')];
  run.hand = cards.slice();
  run.selection = [cards[3]];
  run.playHand();
  check('playing a hand uses one of them', run.handsLeft, 3);
  check('the budget of the blind does not change', run.handsAtRoundStart, 4);
}

// The Needle only allows a single hand, so the blind shows 1 of 1 and not
// 1 of 4.
{
  const run = new Run({ seed: 95 });
  run.currentBoss = { id: 'the_needle', name: 'The Needle', mult: 2, reward: 5 };
  run.selectBlind('boss');
  check('the needle allows one hand', run.handsAtRoundStart, 1);
}

// --- the jokers that aim at a target ---
// A few jokers pick a new target at the end of every round. The target has to
// be readable, and it has to be the one the joker really uses.
{
  const run = new Run({ seed: 96 });
  const todo = run.buildJoker('To Do List');
  run.onJokerAcquired(todo);
  check('the to do list aims at a poker hand', jokerTarget(todo).kind, 'hand');
  check('the to do list names a hand', !!HAND_BY_ID[jokerTarget(todo).hand], true);

  const rebate = run.buildJoker('Mail-In Rebate');
  run.onJokerAcquired(rebate);
  check('the mail in rebate aims at a rank', jokerTarget(rebate).kind, 'rank');
  check('the mail in rebate names a rank', jokerTarget(rebate).rank >= 2 && jokerTarget(rebate).rank <= 14, true);

  const castle = run.buildJoker('Castle');
  run.onJokerAcquired(castle);
  check('the castle aims at a suit', jokerTarget(castle).kind, 'suit');
  check('the castle names a suit', ['H', 'D', 'C', 'S'].includes(jokerTarget(castle).suit), true);

  const idol = run.buildJoker('The Idol');
  run.onJokerAcquired(idol);
  check('the idol aims at one card', jokerTarget(idol).kind, 'card');
  check('the idol names a rank', jokerTarget(idol).rank >= 2 && jokerTarget(idol).rank <= 14, true);

  check('a joker without a target has none', jokerTarget(run.buildJoker('Joker')), null);

  // The target changes at the end of the round.
  const before = jokerTarget(todo).hand;
  run.selectBlind('small');
  run.jokers.push(todo);
  run.roundScore = 500;
  run.currentBlind.score = 500;
  run.completeBlind();
  check('the to do list picks a new hand', jokerTarget(todo).hand !== before, true);
}

// The Idol only counts the one card it points at: both the rank and the suit
// have to match.
{
  const run = new Run({ seed: 97 });
  run.selectBlind('small');
  const idol = run.buildJoker('The Idol');
  idol.rank = 12;
  idol.suit = 'H';
  run.jokers.push(idol);
  const cards = [C(12, 'H'), C(5, 'C'), C(7, 'D'), C(9, 'S'), C(3, 'C')];
  run.hand = cards.slice();
  run.selection = cards.slice();
  const res = run.playHand();
  const factors = res.breakdown.steps.flatMap((s) => s.factors || []);
  check('the idol doubles its card', factors.includes(2), true);
}
{
  const run = new Run({ seed: 97 });
  run.selectBlind('small');
  const idol = run.buildJoker('The Idol');
  idol.rank = 12;
  idol.suit = 'H';
  run.jokers.push(idol);
  // A jack of hearts is the wrong rank, so the idol stays quiet.
  const cards = [C(11, 'H'), C(5, 'C'), C(7, 'D'), C(9, 'S'), C(3, 'C')];
  run.hand = cards.slice();
  run.selection = cards.slice();
  const res = run.playHand();
  const factors = res.breakdown.steps.flatMap((s) => s.factors || []);
  check('the idol ignores the wrong rank', factors.includes(2), false);
}

// Burnt Joker levels the hand the discarded cards form, not the hand the
// player plays most.
{
  const run = new Run({ seed: 98 });
  run.selectBlind('small');
  const burnt = run.buildJoker('Burnt Joker');
  run.jokers.push(burnt);
  run.handLevels.pair = 1;
  run.handLevels.high_card = 1;
  run.discardCards([C(5, 'H'), C(5, 'C')]);
  check('burnt joker levels the discarded hand', run.handLevels.pair, 2);
  check('burnt joker leaves the other hands alone', run.handLevels.high_card, 1);
}

// --- what a card is worth ---
// Regression: the sell value used to be worked out from the buy price of a
// card that no longer had one, so every joker sold for $1 and the Egg never
// grew no matter how many rounds it survived.
{
  const run = new Run({ seed: 110 });
  run.selectBlind('small');
  const egg = run.createJoker('Egg');
  check('the egg starts worth $2', computeSellValue(run, egg), 2);
  run.runEndOfRoundJokers();
  check('the egg grows by $3 a round', computeSellValue(run, egg), 5);
  run.runEndOfRoundJokers();
  check('the egg keeps growing', computeSellValue(run, egg), 8);
  const money = run.money;
  const value = computeSellValue(run, egg);
  sellCard(run, egg);
  check('selling the egg pays the grown value', run.money, money + value);
  check('selling the egg takes it out of the run', run.jokers.length, 0);
}

// A card sells for half of what it costs.
{
  const run = new Run({ seed: 111 });
  const joker = run.createJoker('Joker');
  const raised = run.createJoker('Raised Fist');
  check('a $2 joker sells for $1', computeSellValue(run, joker), 1);
  check('a $5 joker sells for $2', computeSellValue(run, raised), 2);
}

// An edition raises the sell value as well as the price.
{
  const run = new Run({ seed: 112 });
  const joker = run.createJoker('Joker');
  joker.edition = 'foil';
  check('a foil joker sells for $2', computeSellValue(run, joker), 2);
  joker.edition = 'polychrome';
  check('a polychrome joker sells for $3', computeSellValue(run, joker), 3);
}

// Liquidation halves what the jokers you own are worth, but it cannot touch
// the extra value the Egg and the Gift Card added.
{
  const run = new Run({ seed: 113 });
  run.buyVoucher('Liquidation');
  const egg = run.createJoker('Egg');
  check('liquidation halves the egg', computeSellValue(run, egg), 1);
  run.runEndOfRoundJokers();
  check('liquidation cannot touch the egg bonus', computeSellValue(run, egg), 4);
  check('liquidation halves the price', computeBuyCost(run, { kind: 'joker', price: 5 }), 2);
}

// The Gift Card lifts every joker and consumable at the end of a round.
{
  const run = new Run({ seed: 114 });
  run.createJoker('Gift Card');
  const other = run.createJoker('Joker');
  const tarot = run.createConsumable('Tarot');
  run.runEndOfRoundJokers();
  check('the gift card lifts the jokers', computeSellValue(run, other), 2);
  check('the gift card lifts the consumables', computeSellValue(run, tarot), 2);
}

// Consumables sell for half of what they cost, and a consumable bought in
// the shop can be sold again.
{
  const run = new Run({ seed: 115 });
  const tarot = run.createConsumable('Tarot');
  const spectral = run.createConsumable('Spectral');
  check('a tarot sells for $1', computeSellValue(run, tarot), 1);
  check('a spectral sells for $2', computeSellValue(run, spectral), 2);

  const shopRun = new Run({ seed: 115 });
  shopRun.money = 100;
  buyCard(shopRun, { kind: 'consumable', type: 'Tarot', name: 'The Fool', price: 3, sellBonus: 0 });
  check('the bought consumable joined the run', shopRun.consumables.length, 1);
  const value = computeSellValue(shopRun, shopRun.consumables[0]);
  sellCard(shopRun, shopRun.consumables[0]);
  check('selling the consumable takes it out of the run', shopRun.consumables.length, 0);
  check('selling the consumable pays out', shopRun.money, 100 - 3 + value);
}

// Temperance and Swashbuckler read the same sell value the player would get.
{
  const run = new Run({ seed: 116 });
  const egg = run.createJoker('Egg');
  run.runEndOfRoundJokers();
  const temperance = run.createConsumable('Tarot', 'Temperance');
  const money = run.money;
  run.useConsumable(temperance);
  check('temperance pays the sell value of the jokers', run.money, money + 5);

  const swash = run.createJoker('Swashbuckler');
  const ctx = { mult: 0 };
  JOKERS['Swashbuckler'].fn(run, ctx, swash);
  check('swashbuckler counts the grown egg', ctx.mult, 5);
}

// Balatro rounds shop prices half down: 8.5 becomes 8.
check('prices round half down', [roundHalfDown(8.5), roundHalfDown(8.6), roundHalfDown(8.4)], [8, 9, 8]);

// --- beating a blind ---
// The blind is beaten as soon as the score of the round reaches what the blind
// asks for, and running out of hands only kills the run when it did not.
{
  const run = new Run({ seed: 120 });
  run.ante = 3;
  run.selectBlind('big');
  run.startBlind();
  check('the ante 3 big blind needs 3000', run.currentBlind.scoreRequired, 3000);
  check('the blind is not beaten yet', run.blindBeaten(), false);

  run.roundScore = 13047;
  run.currentBlind.score = run.roundScore;
  check('a score over the requirement beats the blind', run.blindBeaten(), true);

  // Running out of hands must not kill a run that already cleared the blind.
  run.handsLeft = 0;
  run.discardsLeft = 0;
  check('a beaten blind is not a loss', run.isDead(), false);

  // And a blind that was not beaten is a loss once the hands are gone.
  const lost = new Run({ seed: 121 });
  lost.ante = 3;
  lost.selectBlind('big');
  lost.startBlind();
  lost.roundScore = 2999;
  lost.handsLeft = 0;
  lost.discardsLeft = 0;
  check('a blind that fell short is a loss', lost.isDead(), true);
  check('the lost blind was not beaten', lost.blindBeaten(), false);
}

// The Green Joker counts the hands played against the discarded cards, and it
// never goes below zero.
{
  const run = new Run({ seed: 122 });
  const green = run.buildJoker('Green Joker');
  run.jokers.push(green);
  const ctx = () => {
    const c = { mult: 0 };
    JOKERS['Green Joker'].fn(run, c, green);
    return c;
  };

  green.hands = 5;
  green.discards = 0;
  check('the green joker counts the hands played', ctx().mult, 5);

  green.discards = 2;
  check('every discarded card counts against it', ctx().mult, 3);

  green.discards = 9;
  check('the green joker never goes below zero', ctx().mult, 0);
  check('the green joker explains itself', ctx().note.id, 'greenJoker');
  check('the green joker reports both numbers', ctx().note.args, [5, 9]);
}

// Cards the game discards for the player count against the Green Joker too.
{
  const run = new Run({ seed: 123 });
  run.selectBlind('small');
  const green = run.buildJoker('Green Joker');
  run.jokers.push(green);
  green.hands = 1;
  const a = C(5, 'H');
  const b = C(7, 'D');
  run.hand.push(a, b);
  run.discardCards([a, b]);
  const c = { mult: 0 };
  JOKERS['Green Joker'].fn(run, c, green);
  check('discards the player did not choose count too', c.mult, 0);
  check('the green joker counted the discarded cards', green.discards, 2);
}

// The growing jokers keep their own number, so one picked up half way through
// a run starts from zero instead of counting the whole run.
{
  const run = new Run({ seed: 124 });
  run.selectBlind('small');
  const ice = run.createJoker('Ice Cream');
  const green = run.createJoker('Green Joker');
  const pop = run.createJoker('Popcorn');

  check('the ice cream starts at 100 chips', jokerValue(run, ice), { kind: 'chips', value: 100 });
  check('the green joker starts at 0 mult', jokerValue(run, green), { kind: 'mult', value: 0 });
  check('the popcorn starts at 20 mult', jokerValue(run, pop), { kind: 'mult', value: 20 });

  // A hand played: the ice cream loses 5 chips, the green joker gains a mult.
  run.hand = [C(5, 'H'), C(7, 'D'), C(9, 'C'), C(11, 'S'), C(13, 'H')];
  run.selectCards(run.hand);
  run.playHand();
  check('the ice cream loses 5 chips a hand', jokerValue(run, ice), { kind: 'chips', value: 95 });
  check('the green joker gains a mult a hand', jokerValue(run, green), { kind: 'mult', value: 1 });

  // The popcorn only shrinks at the end of a round.
  run.runEndOfRoundJokers();
  check('the popcorn loses 4 mult a round', jokerValue(run, pop), { kind: 'mult', value: 16 });

  // A joker picked up late starts from scratch.
  const late = run.buildJoker('Ice Cream');
  run.jokers.push(late);
  check('a late ice cream starts at 100 chips', jokerValue(run, late), { kind: 'chips', value: 100 });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
