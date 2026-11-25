// Joker implementations. Each entry: { activation, fn(state, ctx, joker[, card]) }
// Activation types follow the wiki's Activation Sequence:
//   onPlayed | onScored | onHeld | independent | onOtherJokers | onDiscard | blindSelect

import {
  effectiveRank, isFace, isEven, isOdd, matchesSuit, SUITS, rankChips,
} from './cards.js';
import { computeSellValue } from './value.js';

const has = (ctx, id) => ctx.contained.has(id);
const contains = (ctx, id) => ctx.contained.has(id);

/**
 * Do these cards hold two of the same rank?
 *
 * The Jolly Joker and the Sly Joker trigger off a pair of matching ranks, not
 * off the hand type: "the hand itself doesn't have to be a Pair, as long as
 * it contains 2 of the same card rank". A Two Pair therefore triggers them.
 */
function duplicateRank(cards) {
  const seen = new Set();
  for (const c of cards) {
    const r = effectiveRank(c);
    if (r == null) continue; // stone cards have no rank
    if (seen.has(r)) return true;
    seen.add(r);
  }
  return false;
}

// Helpers to count things in the played / held cards.
function playedCards(ctx) { return ctx.played; }
function deckCards(state) { return state.deck; }
function fullDeck(state) { return state.fullDeck; }

/**
 * The cards that are still in hand once the hand was played.
 *
 * "Held in hand" effects look at these and not at the played cards: played
 * cards leave the hand, so a Queen that was played does not trigger Shoot the
 * Moon and a King that was played does not feed Baron.
 */
function remainingHand(state, ctx) {
  const played = ctx.played || [];
  return state.hand.filter((c) => !played.includes(c));
}

/**
 * The lowest ranked card left in hand.
 *
 * Stone cards have no rank, and when several cards share the lowest rank the
 * rightmost one is the one that triggers (the wiki says so, and it decides
 * which debuff / seal of the pair applies).
 */
function lowestHeldCard(state, ctx) {
  let best = null;
  let bestRank = null;
  for (const c of remainingHand(state, ctx)) {
    const r = effectiveRank(c);
    if (r == null) continue; // stone cards have no rank
    if (bestRank === null || r <= bestRank) { bestRank = r; best = c; }
  }
  return best;
}

function faceCount(cards, state) {
  return cards.filter((c) => (state.pareidolia ? true : isFace(effectiveRank(c)))).length;
}

function countSuit(cards, suit) {
  return cards.filter((c) => matchesSuit(c, suit)).length;
}

function fullHouseParts(ctx) {
  const byRank = new Map();
  for (const c of ctx.scoredCards) {
    const r = effectiveRank(c);
    if (r == null) continue;
    byRank.set(r, (byRank.get(r) || 0) + 1);
  }
  let trip = 0; let pair = 0;
  for (const n of byRank.values()) {
    if (n >= 3) trip += 1; else if (n === 2) pair += 1;
  }
  return { trip, pair };
}

// ---------------------------------------------------------------------------

/**
 * What a joker is aiming at right now.
 *
 * A few jokers pick a new target at the end of every round - a poker hand, a
 * rank, a suit or one specific card - and the player has to be able to see
 * it, or the joker cannot be played around.
 *
 *   { kind: 'hand', hand: 'pair' }
 *   { kind: 'rank', rank: 14 }
 *   { kind: 'suit', suit: 'H' }
 *   { kind: 'card', rank: 12, suit: 'H' }
 */
export function jokerTarget(joker) {
  if (!joker) return null;
  switch (joker.name) {
    case 'To Do List':
      return joker.hand ? { kind: 'hand', hand: joker.hand } : null;
    case 'Mail-In Rebate':
      return joker.rank ? { kind: 'rank', rank: joker.rank } : null;
    case 'Castle':
    case 'Ancient Joker':
      return joker.suit ? { kind: 'suit', suit: joker.suit } : null;
    case 'The Idol':
      return joker.rank && joker.suit
        ? { kind: 'card', rank: joker.rank, suit: joker.suit }
        : null;
    default:
      return null;
  }
}

export const JOKERS = {
  // ---------------- Common: additive mult ----------------
  Joker: {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += 4; },
  },
  'Greedy Joker': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => { if (matchesSuit(card, 'D', { smeared: s.smeared })) ctx.mult += 3; },
  },
  'Lusty Joker': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => { if (matchesSuit(card, 'H', { smeared: s.smeared })) ctx.mult += 3; },
  },
  'Wrathful Joker': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => { if (matchesSuit(card, 'S', { smeared: s.smeared })) ctx.mult += 3; },
  },
  'Gluttonous Joker': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => { if (matchesSuit(card, 'C', { smeared: s.smeared })) ctx.mult += 3; },
  },
  'Jolly Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (duplicateRank(ctx.scoredCards)) ctx.mult += 8; },
  },
  'Zany Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'three_of_a_kind')) ctx.mult += 12; },
  },
  'Mad Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'two_pair')) ctx.mult += 10; },
  },
  'Crazy Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'straight')) ctx.mult += 12; },
  },
  'Droll Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'flush')) ctx.mult += 10; },
  },
  'Abstract Joker': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += 3 * s.jokers.length; },
  },
  'Even Steven': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      const r = effectiveRank(card);
      if (r != null && isEven(r)) ctx.mult += 4;
    },
  },
  'Fibonacci': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      const r = effectiveRank(card);
      if (r == null) return;
      if (r === 14 || [2, 3, 5, 8].includes(r)) ctx.mult += 8;
    },
  },
  'Scholar': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (effectiveRank(card) === 14) { ctx.chips += 20; ctx.mult += 4; }
    },
  },
  'Smiley Face': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (faceCount([card], s) > 0) ctx.mult += 5;
    },
  },
  'Raised Fist': {
    activation: 'onHeld',
    fn: (s, ctx, j, card) => {
      // "Adds double the rank of lowest ranked card held in hand to Mult".
      // Only the lowest ranked card triggers it, so it fires once per hand.
      // Face cards count as 10 and Aces as 11, so they give +20 and +22 Mult.
      const target = lowestHeldCard(s, ctx);
      if (!target || target !== card) return false;
      ctx.mult += 2 * rankChips(effectiveRank(card));
      return true;
    },
  },
  'Shoot the Moon': {
    activation: 'onHeld',
    fn: (s, ctx, j, card) => {
      // "Each Queen held in hand gives +13 mult".
      if (effectiveRank(card) === 12) ctx.mult += 13;
    },
  },
  'Supernova': {
    activation: 'independent',
    fn: (s, ctx) => {
      ctx.mult += s.handPlayedCounts[ctx.handId] || 0;
    },
  },
  'Green Joker': {
    activation: 'independent',
    fn: (s, ctx) => {
      ctx.mult += s.handsPlayed - s.discardsUsed;
    },
  },
  'Popcorn': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += 20 - 4 * s.roundsPlayed; },
  },
  'Ice Cream': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.chips += 100 - 5 * s.handsPlayed; },
  },
  'Misprint': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += s.rng.int(24); },
  },
  'Ride the Bus': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += s.rideTheBus; },
  },
  'Runner': {
    activation: 'independent',
    fn: (s, ctx, j) => {
      // Gains +15 chips every time a Straight is played.
      if (has(ctx, 'straight')) j.chips = (j.chips || 0) + 15;
      ctx.chips += j.chips || 0;
    },
  },
  'Square Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (ctx.played.length === 4) ctx.chips += 4; },
  },
  'Spare Trousers': {
    activation: 'independent',
    fn: (s, ctx, j) => {
      // Gains +2 mult every time a Two Pair is played.
      if (has(ctx, 'two_pair')) j.extraMult = (j.extraMult || 0) + 2;
      ctx.mult += j.extraMult || 0;
    },
  },
  'Erosion': {
    activation: 'independent',
    fn: (s, ctx) => {
      ctx.mult += 4 * Math.max(0, s.startingDeckSize - fullDeck(s).length);
    },
  },
  'Swashbuckler': {
    activation: 'independent',
    fn: (s, ctx, j) => {
      const others = s.jokers.filter((k) => k !== j);
      ctx.mult += others.reduce((a, k) => a + computeSellValue(s, k), 0);
    },
  },
  'Fortune Teller': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += s.tarotsUsed; },
  },
  'Flash Card': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += 2 * s.shopRerolls; },
  },
  'Joker Stencil': {
    activation: 'independent',
    fn: (s, ctx) => {
      ctx.xMult(Math.max(1, s.jokerSlots - s.jokers.length + 1));
    },
  },
  'Blueprint': {
    activation: 'independent',
    fn: (s, ctx, joker) => {
      const idx = s.jokers.indexOf(joker);
      const target = s.jokers[idx + 1];
      if (!target) return;
      const def = JOKERS[target.name];
      if (!def || def.noCopy) return;
      if (def.activation === 'independent') def.fn(s, ctx, target);
    },
    noCopy: false,
  },
  'Brainstorm': {
    activation: 'independent',
    fn: (s, ctx, joker) => {
      const idx = s.jokers.indexOf(joker);
      const target = s.jokers[idx - 1];
      if (!target) return;
      const def = JOKERS[target.name];
      if (!def || def.noCopy) return;
      if (def.activation === 'independent') def.fn(s, ctx, target);
    },
  },

  // ---------------- Common: chips ----------------
  'Sly Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (duplicateRank(ctx.scoredCards)) ctx.chips += 50; },
  },
  'Wily Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'three_of_a_kind')) ctx.chips += 100; },
  },
  'Clever Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'two_pair')) ctx.chips += 80; },
  },
  'Devious Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'straight')) ctx.chips += 100; },
  },
  'Crafty Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'flush')) ctx.chips += 80; },
  },
  'Half Joker': {
    activation: 'independent',
    fn: (s, ctx) => { if (ctx.played.length <= 3) ctx.mult += 20; },
  },
  'Banner': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.chips += 30 * s.discardsLeft; },
  },
  'Mystic Summit': {
    activation: 'independent',
    fn: (s, ctx) => { if (s.discardsLeft === 0) ctx.mult += 15; },
  },
  'Scary Face': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => { if (faceCount([card], s) > 0) ctx.chips += 30; },
  },
  'Odd Todd': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      const r = effectiveRank(card);
      if (r != null && isOdd(r)) ctx.chips += 31;
    },
  },
  'Arrowhead': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => { if (matchesSuit(card, 'S', { smeared: s.smeared })) ctx.chips += 50; },
  },
  'Onyx Agate': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => { if (matchesSuit(card, 'C', { smeared: s.smeared })) ctx.mult += 7; },
  },
  'Walkie Talkie': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      const r = effectiveRank(card);
      if (r === 10 || r === 4) { ctx.chips += 10; ctx.mult += 4; }
    },
  },
  'Hiker': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      card.bonusChips = (card.bonusChips || 0) + 5;
    },
  },
  'Blue Joker': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.chips += 2 * s.deckPile.length; },
  },
  'Bull': {
    activation: 'independent',
    fn: (s, ctx) => {
      // "+2 chips for each $1 you have" - nothing at all with no money.
      ctx.chips += 2 * Math.max(0, s.money);
    },
  },
  'Stone Joker': {
    activation: 'independent',
    fn: (s, ctx) => {
      ctx.chips += 25 * fullDeck(s).filter((c) => c.enhancement === 'stone').length;
    },
  },

  // ---------------- Common: effect / economy ----------------
  'Splash': { activation: 'none', fn: () => {} },
  'Pareidolia': { activation: 'none', fn: () => {} },
  'Juggler': { activation: 'none', fn: () => {} },
  'Drunkard': { activation: 'none', fn: () => {} },
  'Madness': { activation: 'independent', fn: (s, ctx) => { ctx.xMult(s.madnessMult); } },
  'Marble Joker': { activation: 'blindSelect', fn: () => {} },
  'Riff-Raff': { activation: 'blindSelect', fn: () => {} },
  'Burglar': { activation: 'blindSelect', fn: () => {} },
  'Ceremonial Dagger': {
    activation: 'blindSelect',
    fn: (s, ctx, j) => { ctx.mult += j.extraMult || 0; },
  },
  'Chaos the Clown': { activation: 'none', fn: () => {} },
  'Space Joker': { activation: 'none', fn: () => {} },
  'Oops! All 6s': { activation: 'none', fn: () => {} },
  'Sixth Sense': { activation: 'none', fn: () => {} },
  'DNA': { activation: 'none', fn: () => {} },
  'Trading Card': { activation: 'none', fn: () => {} },
  'Hallucination': { activation: 'none', fn: () => {} },
  '8 Ball': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (effectiveRank(card) === 8 && s.chance(1 / 4)) s.createConsumable('Tarot', null);
    },
  },
  'Superposition': {
    activation: 'independent',
    fn: (s, ctx) => {
      const hasAce = ctx.scoredCards.some((c) => effectiveRank(c) === 14);
      if (hasAce && has(ctx, 'straight')) s.createConsumable('Tarot', null);
    },
  },
  'Vagabond': {
    activation: 'independent',
    fn: (s, ctx) => {
      if (ctx.played.length <= 4) s.createConsumable('Tarot', null);
    },
  },
  'Séance': {
    activation: 'independent',
    fn: (s, ctx) => {
      if (ctx.handId === 'straight_flush') s.createConsumable('Spectral', null);
    },
  },
  'Cartomancer': { activation: 'blindSelect', fn: () => {} },
  'Burnt Joker': { activation: 'none', fn: () => {} },
  'Diet Cola': { activation: 'none', fn: () => {} },
  'The Idol': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      // The idol is one specific card; both its rank and its suit change at
      // the end of every round.
      if (effectiveRank(card) !== j.rank) return;
      if (!matchesSuit(card, j.suit, { smeared: s.smeared })) return;
      ctx.xMult(2);
    },
  },
  'Lucky Cat': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.xMult(j.xMult || 1); },
  },
  'Loyalty Card': {
    activation: 'independent',
    fn: (s, ctx, j) => {
      // X4 for every 6 hands played.
      if ((j.count || 0) > 0 && (j.count % 6) === 0) {
        ctx.xMult(4);
        j.count = 0;
      }
    },
  },
  'Constellation': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.xMult(j.xMult || 1); },
  },
  'Glass Joker': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.xMult(j.xMult || 1); },
  },
  'Hologram': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.xMult(j.xMult || 1); },
  },
  'Steel Joker': {
    activation: 'independent',
    fn: (s, ctx) => {
      ctx.xMult(1 + 0.2 * fullDeck(s).filter((c) => c.enhancement === 'steel').length);
    },
  },
  'Blackboard': {
    activation: 'independent',
    fn: (s, ctx) => {
      // "X3 if all cards held in hand are Spades or Clubs". The boost also
      // kicks in when no card is left in hand.
      const held = remainingHand(s, ctx);
      if (held.every((c) => matchesSuit(c, 'S', { smeared: s.smeared })
        || matchesSuit(c, 'C', { smeared: s.smeared }))) ctx.xMult(3);
    },
  },
  'Vampire': {
    activation: 'independent',
    fn: (s, ctx, j) => {
      const enhanced = ctx.scoredCards.filter((c) => c.enhancement && c.enhancement !== 'stone');
      if (enhanced.length) {
        j.xMult = (j.xMult || 1) + 0.1 * enhanced.length;
        for (const c of enhanced) c.enhancement = null;
      }
      ctx.xMult(j.xMult || 1);
    },
  },
  'Obelisk': {
    activation: 'independent',
    fn: (s, ctx, j) => {
      const most = s.mostPlayedHand();
      if (most && most !== ctx.handId) {
        j.xMult = (j.xMult || 1) + 0.2;
      }
      ctx.xMult(j.xMult || 1);
    },
  },
  'Baron': {
    activation: 'onHeld',
    fn: (s, ctx, j, card) => {
      // "Each King held in hand gives X1.5" - one multiplier per King.
      if (effectiveRank(card) === 13) ctx.xMult(1.5);
    },
  },
  'Photograph': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (!j.used && faceCount([card], s) > 0) {
        j.used = true;
        ctx.xMult(2);
      }
    },
  },
  'Flower Pot': {
    activation: 'independent',
    fn: (s, ctx) => {
      // X3 if the played hand contains a 2, a 3, a 4 and a 5.
      const ranks = new Set(ctx.played.map((c) => effectiveRank(c)));
      if ([2, 3, 4, 5].every((r) => ranks.has(r))) ctx.xMult(3);
    },
  },
  'Seeing Double': {
    activation: 'independent',
    fn: (s, ctx) => {
      const clubs = ctx.scoredCards.some((c) => matchesSuit(c, 'C', { smeared: s.smeared }));
      const other = ctx.scoredCards.some((c) => !matchesSuit(c, 'C', { smeared: s.smeared }));
      if (clubs && other) ctx.xMult(2);
    },
  },
  'Acrobat': {
    activation: 'independent',
    fn: (s, ctx) => { if (s.handsLeft === 1) ctx.xMult(3); },
  },
  'Sock and Buskin': {
    activation: 'onScored',
    fn: () => {},
    retriggers: (s, card, phase) => phase === 'played' && faceCount([card], s) > 0,
  },
  'Hanging Chad': {
    activation: 'onScored',
    fn: () => {},
    retriggers: (s, card, phase, ctx) => phase === 'played' && !!ctx && ctx.scoredCards.includes(card),
  },
  'Hack': {
    activation: 'onScored',
    fn: () => {},
    retriggers: (s, card, phase) => phase === 'played' && [2, 3, 4, 5].includes(effectiveRank(card)),
  },
  'Mime': {
    activation: 'onHeld',
    fn: () => {},
  },
  'Dusk': {
    activation: 'onScored',
    fn: () => {},
    retriggers: (s, card, phase) => phase === 'played' && s.handsLeft === 1,
  },
  'Seltzer': {
    activation: 'onScored',
    fn: () => {},
    retriggers: (s, card, phase) => phase === 'played' && s.seltzerHands > 0,
  },
  'Showman': { activation: 'none', fn: () => {} },
  'Luchador': { activation: 'none', fn: () => {} },
  'Chicot': { activation: 'none', fn: () => {} },
  'Perkeo': { activation: 'none', fn: () => {} },
  'Turtle Bean': { activation: 'none', fn: () => {} },
  'Erasure': { activation: 'none', fn: () => {} },
  'Reserved Parking': {
    activation: 'onHeld',
    fn: (s, ctx, j, card) => {
      // "Each face card held in hand has a 1 in 2 chance to give $1".
      // Returning false marks the ability as not triggered, so a retrigger
      // (Mime, Red Seal) only happens after a successful roll.
      if (faceCount([card], s) === 0) return false;
      if (!s.chance(0.5)) return false;
      ctx.money += 1;
      return true;
    },
  },
  'Business Card': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (faceCount([card], s) > 0 && s.chance(0.5)) ctx.money += 2;
    },
  },
  'Golden Ticket': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (card.enhancement === 'gold') ctx.money += 4;
    },
  },
  'Royal Flush': {
    activation: 'onScored',
    fn: (s, ctx) => {
      // X2 if the played hand is a Royal Flush (10 J Q K A of one suit).
      const ranks = ctx.scoredCards.map((c) => effectiveRank(c)).sort((a, b) => a - b);
      const suits = new Set(ctx.scoredCards.map((c) => c.suit));
      if (ranks.join(',') === '10,11,12,13,14' && suits.size === 1) ctx.xMult(2);
    },
  },
  'Mail-In Rebate': {
    activation: 'onDiscard',
    fn: (s, ctx, j, card) => {
      // Earn $5 for each discarded card of this joker's rank.
      if (effectiveRank(card) === j.rank) ctx.money += 5;
    },
  },
  'Faceless Joker': {
    activation: 'onDiscard',
    fn: (s, ctx, j, card, batch) => {
      // Earn $5 if 3 or more face cards are discarded at the same time.
      const faces = (batch || []).filter((c) => faceCount([c], s) > 0).length;
      if (faces >= 3) ctx.money += 5;
    },
  },
  'Delayed Gratification': {
    activation: 'none',
    fn: () => {},
  },
  'Golden Joker': { activation: 'none', fn: () => {} },
  'Rocket': { activation: 'none', fn: () => {} },
  'Cloud 9': { activation: 'none', fn: () => {} },
  'Egg': { activation: 'none', fn: () => {} },
  'Gift Card': { activation: 'none', fn: () => {} },
  'To the Moon': { activation: 'none', fn: () => {} },
  'Credit Card': {
    activation: 'none',
    fn: () => {},
    // Can be used in the shop to take on up to $20 of debt.
    usable: true,
  },
  'To Do List': {
    activation: 'independent',
    fn: (s, ctx, j) => {
      if (j.hand && ctx.handId === j.hand) ctx.money += 4;
    },
  },
  'Midas Mask': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      // All played face cards become Gold cards when scored.
      if (faceCount([card], s) > 0) card.enhancement = 'gold';
    },
  },
  'Ancient Joker': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (matchesSuit(card, j.suit, { smeared: s.smeared })) ctx.xMult(1.5);
    },
  },
  'Castle': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.chips += j.chips || 0; },
  },
  'Baseball Card': {
    activation: 'onOtherJokers',
    fn: (s, ctx) => {
      const uncommons = s.jokers.filter((k) => k.rarity === 'Uncommon').length;
      ctx.xMult(Math.pow(1.5, uncommons));
    },
  },
  'Invisible Joker': {
    activation: 'none',
    fn: () => {},
    // After 2 rounds, selling it duplicates a random Joker.
    sellHook: 'duplicateJoker',
  },
  'Campfire': {
    activation: 'independent',
    fn: (s, ctx, j) => {
      ctx.xMult(j.xMult || 1);
    },
  },
  'Canio': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.xMult(j.xMult || 1); },
  },
  'Triboulet': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      const r = effectiveRank(card);
      if (r === 13 || r === 12) ctx.xMult(2);
    },
  },
  'Yorick': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.xMult(j.xMult || 1); },
  },
  'Mr. Bones': {
    activation: 'none',
    fn: () => {},
    // Prevents death if the chips scored are at least 25% of the requirement.
    savesDeath: true,
  },
  'Troubadour': { activation: 'none', fn: () => {} },
  'Certificate': { activation: 'none', fn: () => {} },
  'Smeared Joker': { activation: 'none', fn: () => {} },

  // ---------------- Passive effect jokers ----------------
  // These grant their bonus through the engine rather than the scoring pass.
  'Four Fingers': { activation: 'none', fn: () => {} },
  'Shortcut': { activation: 'none', fn: () => {} },
  'Merry Andy': { activation: 'none', fn: () => {} },
  'Astronomer': { activation: 'none', fn: () => {} },

  // ---------------- Common: scaling / multiplicative ----------------
  'Gros Michel': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += 15; },
  },
  'Cavendish': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.xMult(3); },
  },
  'Bootstraps': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.mult += 2 * Math.floor(s.money / 5); },
  },
  'Card Sharp': {
    activation: 'independent',
    fn: (s, ctx) => {
      if (s.roundHandTypes.includes(ctx.handId)) ctx.xMult(3);
    },
  },
  "Driver's License": {
    activation: 'independent',
    fn: (s, ctx) => {
      const enhanced = s.fullDeck.filter((c) => c.enhancement).length;
      if (enhanced >= 16) ctx.xMult(3);
    },
  },
  'Throwback': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.xMult(1 + 0.25 * s.blindsSkipped); },
  },
  'Stuntman': {
    activation: 'independent',
    fn: (s, ctx) => { ctx.chips += 250; },
  },
  'Red Card': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.mult += j.extraMult || 0; },
  },

  // ---------------- Rare: hand-conditioned multipliers ----------------
  'The Duo': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'two_pair')) ctx.xMult(2); },
  },
  'The Trio': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'three_of_a_kind')) ctx.xMult(3); },
  },
  'The Family': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'full_house')) ctx.xMult(4); },
  },
  'The Tribe': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'flush')) ctx.xMult(2); },
  },
  'The Order': {
    activation: 'independent',
    fn: (s, ctx) => { if (has(ctx, 'straight')) ctx.xMult(3); },
  },

  // ---------------- Suit-locked jokers ----------------
  'Bloodstone': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (matchesSuit(card, 'H', { smeared: s.smeared }) && s.chance(1 / 2)) ctx.xMult(1.5);
    },
  },
  'Rough Gem': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (matchesSuit(card, 'D', { smeared: s.smeared })) ctx.money += 1;
    },
  },

  // ---------------- Mixed activation ----------------
  'Hit the Road': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.xMult(j.xMult || 1); },
  },
  'Ramen': {
    activation: 'independent',
    fn: (s, ctx, j) => { ctx.xMult(j.xMult || 2); },
  },
  'Wee Joker': {
    activation: 'onScored',
    fn: (s, ctx, j, card) => {
      if (effectiveRank(card) === 2) j.chips = (j.chips || 0) + 8;
    },
    // The accumulated chips apply to every hand once earned.
    independentFn: (s, ctx, j) => { ctx.chips += j.chips || 0; },
  },
  'Matador': {
    activation: 'independent',
    fn: (s, ctx) => {
      if (s.bossTriggeredThisHand) ctx.money += 8;
    },
  },
  'Satellite': {
    activation: 'none',
    fn: () => {},
  },
};

/** Jokers whose scaling value lives on the joker instance. */
export function jokerScale(j) {
  if (!j) return 1;
  if (j.name === 'Ramen') return j.xMult || 2;
  if (j.name === 'Hit the Road') return j.xMult || 1;
  return 1;
}
