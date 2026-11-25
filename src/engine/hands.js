// Poker hand evaluation, faithful to Balatro's rules.
//
// Balatro hand precedence (highest first):
//   Flush Five > Flush House > Five of a Kind > Straight Flush > Four of a Kind >
//   Full House > Flush > Straight > Three of a Kind > Two Pair > Pair > High Card
//
// Rules honoured here:
//  * Aces are high for chip value (11 chips) but may be low in a straight
//    (A-2-3-4-5). K-A-2-3-4 is NOT a straight.
//  * Wild cards count as any suit (and any rank).
//  * Stone cards have no rank or suit: they never contribute to the hand type
//    but are always part of the scoring hand.
//  * Four Fingers allows straights/flushes with 4 cards.
//  * Shortcut allows straights with a gap of one rank.

import { effectiveRank, matchesSuit } from './cards.js';

export const HANDS = [
  { id: 'flush_five', name: 'Flush Five', baseChips: 160, baseMult: 16, planet: 'Eris',
    chipPerLevel: 50, multPerLevel: 3 },
  { id: 'flush_house', name: 'Flush House', baseChips: 140, baseMult: 14, planet: 'Ceres',
    chipPerLevel: 40, multPerLevel: 4 },
  { id: 'five_of_a_kind', name: 'Five of a Kind', baseChips: 120, baseMult: 12, planet: 'Planet X',
    chipPerLevel: 35, multPerLevel: 3 },
  { id: 'straight_flush', name: 'Straight Flush', baseChips: 100, baseMult: 8, planet: 'Neptune',
    chipPerLevel: 40, multPerLevel: 4 },
  { id: 'four_of_a_kind', name: 'Four of a Kind', baseChips: 60, baseMult: 7, planet: 'Mars',
    chipPerLevel: 30, multPerLevel: 3 },
  { id: 'full_house', name: 'Full House', baseChips: 40, baseMult: 4, planet: 'Earth',
    chipPerLevel: 25, multPerLevel: 2 },
  { id: 'flush', name: 'Flush', baseChips: 35, baseMult: 4, planet: 'Jupiter',
    chipPerLevel: 15, multPerLevel: 2 },
  { id: 'straight', name: 'Straight', baseChips: 30, baseMult: 4, planet: 'Saturn',
    chipPerLevel: 30, multPerLevel: 3 },
  { id: 'three_of_a_kind', name: 'Three of a Kind', baseChips: 30, baseMult: 3, planet: 'Venus',
    chipPerLevel: 20, multPerLevel: 2 },
  { id: 'two_pair', name: 'Two Pair', baseChips: 20, baseMult: 2, planet: 'Uranus',
    chipPerLevel: 20, multPerLevel: 1 },
  { id: 'pair', name: 'Pair', baseChips: 10, baseMult: 2, planet: 'Mercury',
    chipPerLevel: 15, multPerLevel: 1 },
  { id: 'high_card', name: 'High Card', baseChips: 5, baseMult: 1, planet: 'Pluto',
    chipPerLevel: 10, multPerLevel: 1 },
];

export const HAND_BY_ID = Object.fromEntries(HANDS.map((h) => [h.id, h]));
export const HAND_BY_PLANET = Object.fromEntries(HANDS.map((h) => [h.planet, h]));

// ---------------------------------------------------------------------------

/**
 * Analyse a set of cards into rank counts and wild count.
 */
function analyse(cards) {
  const counts = new Map(); // rank -> count of non-wild cards
  const wilds = [];
  const byRank = new Map(); // rank -> [cards]
  for (const c of cards) {
    if (c.enhancement === 'stone') continue;
    if (c.enhancement === 'wild') { wilds.push(c); continue; }
    const r = effectiveRank(c);
    if (r == null) continue;
    counts.set(r, (counts.get(r) || 0) + 1);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(c);
  }
  return { counts, byRank, wilds, wildCount: wilds.length, n: cards.length };
}

/** Does a set of cards form a straight of `len` ranks? */
function straightInfo(cards, len, gapAllowed) {
  const info = analyse(cards);
  const { counts, wildCount } = info;

  const windows = [];
  for (let start = 1; start <= 14 - len + 1; start++) {
    const set = new Set();
    for (let i = 0; i < len; i++) set.add(start + i);
    windows.push(set);
  }
  if (gapAllowed) {
    for (let start = 1; start <= 14 - len + 1; start++) {
      for (let gap = 0; gap < len; gap++) {
        const set = new Set();
        for (let i = 0; i < len; i++) set.add(start + i + (i >= gap ? 1 : 0));
        windows.push(set);
      }
    }
  }

  for (const win of windows) {
    let matched = 0;
    for (const r of win) {
      // An Ace may stand in for 1 (wheel straight) or for 14 (broadway).
      if (counts.has(r)) { matched += Math.min(counts.get(r), 1); continue; }
      if (r === 1 && counts.has(14)) matched += 1;
    }
    const need = len - matched;
    if (need <= wildCount) {
      return { win, need, wilds: need };
    }
  }
  return null;
}

/** Cards that can represent the ranks of a straight window. */
function straightCards(cards, len, gapAllowed, suitFilter, opts = {}) {
  const info = straightInfo(cards, len, gapAllowed);
  if (!info) return null;
  const { win, need } = info;
  const chosen = [];
  const usedWilds = [];
  const used = new Set();
  for (const r of win) {
    let idx = cards.findIndex((c, i) => !used.has(i)
      && c.enhancement !== 'stone'
      && c.enhancement !== 'wild'
      && effectiveRank(c) === r
      && (!suitFilter || matchesSuit(c, suitFilter, opts)));
    if (idx < 0 && r === 1) {
      // Ace standing in for 1
      idx = cards.findIndex((c, i) => !used.has(i)
        && c.enhancement !== 'stone'
        && c.enhancement !== 'wild'
        && effectiveRank(c) === 14
        && (!suitFilter || matchesSuit(c, suitFilter, opts)));
    }
    if (idx >= 0) { used.add(idx); chosen.push(cards[idx]); }
  }
  for (const c of cards) {
    if (chosen.length + usedWilds.length >= len) break;
    const idx = cards.indexOf(c);
    if (used.has(idx)) continue;
    if (c.enhancement === 'wild' && (!suitFilter || matchesSuit(c, suitFilter, opts))) {
      usedWilds.push(c);
    }
  }
  const all = [...chosen, ...usedWilds];
  return all.length === len ? all : null;
}

/** The flush suit with the most cards (wilds count for every suit). */
function bestFlush(cards, opts = {}) {
  if (opts.smeared) {
    // Hearts and Diamonds share a suit, Clubs and Spades share another.
    const groups = { HD: 0, CS: 0 };
    for (const c of cards) {
      if (c.enhancement === 'stone') continue;
      if (c.enhancement === 'wild') { groups.HD++; groups.CS++; continue; }
      groups[c.suit === 'H' || c.suit === 'D' ? 'HD' : 'CS'] += 1;
    }
    let best = null;
    for (const [g, n] of Object.entries(groups)) {
      if (!best || n > best.count) best = { suit: g, count: n };
    }
    return best;
  }
  const counts = { H: 0, D: 0, C: 0, S: 0 };
  for (const c of cards) {
    if (c.enhancement === 'stone') continue;
    if (c.enhancement === 'wild') { counts.H++; counts.D++; counts.C++; counts.S++; continue; }
    counts[c.suit] += 1;
  }
  let best = null;
  for (const [s, n] of Object.entries(counts)) {
    if (!best || n > best.count) best = { suit: s, count: n };
  }
  return best;
}

/** Cards of a given suit (wilds included). */
function suitCards(cards, suit, opts = {}) {
  if (opts.smeared) {
    const group = (s) => (s === 'H' || s === 'D' || s === 'HD' ? 'HD' : 'CS');
    const g = group(suit);
    return cards.filter((c) => {
      if (c.enhancement === 'stone') return false;
      if (c.enhancement === 'wild') return true;
      return group(c.suit) === g;
    });
  }
  return cards.filter((c) => matchesSuit(c, suit, opts));
}

// ---------------------------------------------------------------------------

/**
 * Evaluate played cards.
 * opts: { fourFingers, shortcut, splash, smeared }
 */
export function evaluateHand(cards, opts = {}) {
  const fourFingers = !!opts.fourFingers;
  const shortcut = !!opts.shortcut;
  const len = fourFingers ? 4 : 5;
  const info = analyse(cards);
  const { counts, byRank, wildCount, n } = info;

  // -- Flush Five: 5 cards, same rank and same suit
  {
    const flush = bestFlush(cards, opts);
    if (flush && flush.count >= 5) {
      const same = suitCards(cards, flush.suit, opts);
      if (same.length === 5) {
        const ranks = new Set(same.map((c) => effectiveRank(c)).filter((r) => r != null));
        if (ranks.size === 1) return mk('flush_five', same, cards);
      }
    }
  }

  // -- Five of a Kind
  {
    const sel = groupOfSize(cards, counts, byRank, wildCount, 5);
    if (sel) return mk('five_of_a_kind', sel, cards);
  }

  // -- Flush House (Full House where all 5 share a suit)
  {
    const fh = fullHouse(cards, counts, byRank, wildCount);
    if (fh) {
      const flush = bestFlush(cards, opts);
      if (flush && flush.count >= 5) {
        const same = suitCards(cards, flush.suit, opts);
        if (same.length === 5) return mk('flush_house', same, cards);
      }
    }
  }

  // -- Straight Flush
  {
    const flush = bestFlush(cards, opts);
    if (flush && flush.count >= 5) {
      const sc = straightCards(cards, len, shortcut, flush.suit, opts);
      if (sc) return mk('straight_flush', sc, cards);
    }
  }

  // -- Four of a Kind
  {
    const sel = groupOfSize(cards, counts, byRank, wildCount, 4);
    if (sel) return mk('four_of_a_kind', sel, cards);
  }

  // -- Full House
  {
    const sel = fullHouse(cards, counts, byRank, wildCount);
    if (sel) return mk('full_house', sel, cards);
  }

  // -- Flush
  {
    const flush = bestFlush(cards, opts);
    if (flush && flush.count >= len) {
      const same = suitCards(cards, flush.suit, opts);
      if (same.length >= len) return mk('flush', same.slice(0, len), cards);
    }
  }

  // -- Straight
  {
    const sc = straightCards(cards, len, shortcut, null, opts);
    if (sc) return mk('straight', sc, cards);
  }

  // -- Three of a Kind
  {
    const sel = groupOfSize(cards, counts, byRank, wildCount, 3);
    if (sel) return mk('three_of_a_kind', sel, cards);
  }

  // -- Two Pair
  {
    const sel = twoPair(cards, counts, byRank, wildCount);
    if (sel) return mk('two_pair', sel, cards);
  }

  // -- Pair
  {
    const sel = groupOfSize(cards, counts, byRank, wildCount, 2);
    if (sel) return mk('pair', sel, cards);
  }

  // -- High Card: the single highest-ranked card scores
  {
    let best = null;
    for (const c of cards) {
      if (c.enhancement === 'stone') continue;
      const r = effectiveRank(c);
      if (r == null) continue;
      if (!best || r > effectiveRank(best)) best = c;
    }
    if (best) return mk('high_card', [best], cards);
    // Only Stone cards played -> still a High Card
    return mk('high_card', [], cards);
  }
}

function mk(id, scored, all) {
  return { id, name: HAND_BY_ID[id].name, hand: HAND_BY_ID[id], cards: scored, all };
}

/** Pick `size` cards of one rank, using wilds to fill. */
function groupOfSize(cards, counts, byRank, wildCount, size) {
  let best = null;
  for (const [r, list] of byRank) {
    if (list.length < 1) continue;
    const have = Math.min(list.length, size);
    const need = size - have;
    if (need > wildCount) continue;
    const sel = list.slice(0, have);
    if (!best || sel.length > best.length) best = sel;
  }
  if (best && best.length === size) return best;
  // All wilds (or a mix with no real card) can form a group of any size.
  if (size <= wildCount && wildCount > 0) {
    const wilds = cards.filter((c) => c.enhancement === 'wild');
    if (wilds.length >= size) return wilds.slice(0, size);
  }
  return null;
}

/** Full House: a triple and a pair of *different* ranks. */
function fullHouse(cards, counts, byRank, wildCount) {
  const ranks = [...byRank.keys()];
  for (const r1 of ranks) {
    for (const r2 of ranks) {
      if (r1 === r2) continue;
      const haveTriple = Math.min(byRank.get(r1).length, 3);
      const havePair = Math.min(byRank.get(r2).length, 2);
      const needTriple = 3 - haveTriple;
      const needPair = 2 - havePair;
      if (needTriple + needPair > wildCount) continue;
      const wilds = cards.filter((c) => c.enhancement === 'wild');
      const sel = [
        ...byRank.get(r1).slice(0, haveTriple),
        ...byRank.get(r2).slice(0, havePair),
        ...wilds.slice(0, needTriple + needPair),
      ];
      if (sel.length === 5) return sel;
    }
  }
  return null;
}

/** Two Pair: two pairs of different ranks. */
function twoPair(cards, counts, byRank, wildCount) {
  const ranks = [...byRank.keys()].sort((a, b) => b - a);
  const wilds = cards.filter((c) => c.enhancement === 'wild');
  for (let i = 0; i < ranks.length; i++) {
    for (let j = i + 1; j < ranks.length; j++) {
      const r1 = ranks[i]; const r2 = ranks[j];
      const have1 = Math.min(byRank.get(r1).length, 2);
      const have2 = Math.min(byRank.get(r2).length, 2);
      const need = (2 - have1) + (2 - have2);
      if (need > wildCount) continue;
      const sel = [
        ...byRank.get(r1).slice(0, have1),
        ...byRank.get(r2).slice(0, have2),
        ...wilds.slice(0, need),
      ];
      if (sel.length === 4) return sel;
    }
  }
  return null;
}

/**
 * Which lower hands does the played hand "contain"?
 * Per the wiki: Three of a Kind contains a Pair; Four of a Kind does NOT
 * contain Two Pair; Five of a Kind / Full House do not contain each other.
 */
export function containedHands(handId) {
  const set = new Set([handId]);
  const add = (...ids) => ids.forEach((i) => set.add(i));
  switch (handId) {
    case 'flush_five': add('five_of_a_kind', 'four_of_a_kind', 'three_of_a_kind', 'pair', 'flush'); break;
    case 'flush_house': add('full_house', 'three_of_a_kind', 'pair', 'flush'); break;
    case 'five_of_a_kind': add('four_of_a_kind', 'three_of_a_kind', 'pair'); break;
    case 'straight_flush': add('straight', 'flush'); break;
    case 'four_of_a_kind': add('three_of_a_kind', 'pair'); break;
    case 'full_house': add('three_of_a_kind', 'pair'); break;
    case 'three_of_a_kind': add('pair'); break;
    // Two Pair holds a pair of matching ranks, so it contains a Pair.
    case 'two_pair': add('pair'); break;
    default: break;
  }
  return set;
}

/** Chip / mult for a hand at a given level (level 1 = base). */
export function handLevelValues(handId, level) {
  const h = HAND_BY_ID[handId];
  const lvl = Math.max(1, level);
  return {
    chips: h.baseChips + h.chipPerLevel * (lvl - 1),
    mult: h.baseMult + h.multPerLevel * (lvl - 1),
  };
}

export function describeHand(handId) {
  return HAND_BY_ID[handId]?.name ?? handId;
}
