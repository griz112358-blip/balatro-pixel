// Tarot, Planet and Spectral card effects, plus vouchers.

import { HANDS, HAND_BY_ID, HAND_BY_PLANET } from './hands.js';
import { SUITS, RANK_LABEL, cloneCard, makeCard } from './cards.js';
import { computeSellValue } from './value.js';

export const TAROTS = {
  'The Fool': { cost: 3, desc: 'Creates the last Tarot or Planet card used during this run',
    use: (s) => {
      const last = s.lastConsumableUsed;
      if (last) s.createConsumable(last.type, last.name);
    } },
  'The Magician': { cost: 3, desc: 'Enhances 2 selected cards to Lucky Cards',
    use: (s, sel) => sel.slice(0, 2).forEach((c) => { c.enhancement = 'lucky'; }) },
  'The High Priestess': { cost: 3, desc: 'Creates up to 2 random Planet cards',
    use: (s) => { s.createConsumable('Planet'); s.createConsumable('Planet'); } },
  'The Empress': { cost: 3, desc: 'Enhances 2 selected cards to Mult Cards',
    use: (s, sel) => sel.slice(0, 2).forEach((c) => { c.enhancement = 'mult'; }) },
  'The Emperor': { cost: 3, desc: 'Creates up to 2 random Tarot cards',
    use: (s) => { s.createConsumable('Tarot'); s.createConsumable('Tarot'); } },
  'The Hierophant': { cost: 3, desc: 'Enhances 2 selected cards to Bonus Cards',
    use: (s, sel) => sel.slice(0, 2).forEach((c) => { c.enhancement = 'bonus'; }) },
  'The Lovers': { cost: 3, desc: 'Enhances 1 selected card into a Wild Card',
    use: (s, sel) => sel.slice(0, 1).forEach((c) => { c.enhancement = 'wild'; }) },
  'The Chariot': { cost: 3, desc: 'Enhances 1 selected card into a Steel Card',
    use: (s, sel) => sel.slice(0, 1).forEach((c) => { c.enhancement = 'steel'; }) },
  'Justice': { cost: 3, desc: 'Enhances 1 selected card into a Glass Card',
    use: (s, sel) => sel.slice(0, 1).forEach((c) => { c.enhancement = 'glass'; }) },
  'The Hanged Man': { cost: 3, desc: 'Destroys up to 2 selected cards',
    use: (s, sel) => s.destroySelected(sel.slice(0, 2)) },
  'Death': { cost: 3, desc: 'Select 2 cards, convert the left card into the right card',
    use: (s, sel) => {
      if (sel.length < 2) return;
      const [a, b] = sel;
      a.rank = b.rank; a.suit = b.suit;
      a.enhancement = b.enhancement; a.seal = b.seal; a.edition = b.edition;
      a.bonusChips = b.bonusChips; a.bonusMult = b.bonusMult;
    } },
  'Temperance': { cost: 3, desc: 'Gives the total sell value of all current Jokers (Max of $50)',
    use: (s) => {
      const v = Math.min(50, s.jokers.reduce((a, j) => a + computeSellValue(s, j), 0));
      s.money += v;
    } },
  'The Devil': { cost: 3, desc: 'Enhances 1 selected card into a Gold Card',
    use: (s, sel) => sel.slice(0, 1).forEach((c) => { c.enhancement = 'gold'; }) },
  'The Tower': { cost: 3, desc: 'Enhances 1 selected card into a Stone Card',
    use: (s, sel) => sel.slice(0, 1).forEach((c) => { c.enhancement = 'stone'; }) },
  'The Star': { cost: 3, desc: 'Converts up to 3 selected cards to Diamonds',
    use: (s, sel) => sel.slice(0, 3).forEach((c) => { c.suit = 'D'; }) },
  'The Moon': { cost: 3, desc: 'Converts up to 3 selected cards to Clubs',
    use: (s, sel) => sel.slice(0, 3).forEach((c) => { c.suit = 'C'; }) },
  'The Sun': { cost: 3, desc: 'Converts up to 3 selected cards to Hearts',
    use: (s, sel) => sel.slice(0, 3).forEach((c) => { c.suit = 'H'; }) },
  'The World': { cost: 3, desc: 'Converts up to 3 selected cards to Spades',
    use: (s, sel) => sel.slice(0, 3).forEach((c) => { c.suit = 'S'; }) },
  Strength: { cost: 3, desc: 'Increases rank of up to 2 selected cards by 1',
    use: (s, sel) => sel.slice(0, 2).forEach((c) => {
      if (c.rank < 13) c.rank += 1; else if (c.rank === 13) c.rank = 14;
    }) },
  Judgement: { cost: 3, desc: 'Creates a random Joker card',
    use: (s) => s.createJoker(null) },
  'The Wheel of Fortune': { cost: 3, desc: '1 in 4 chance to add Foil, Holographic, or Polychrome edition to a random Joker',
    use: (s) => {
      if (!s.jokers.length) return;
      if (!s.rng.chance(0.25)) return;
      const j = s.rng.pick(s.jokers);
      j.edition = s.rng.pick(['foil', 'holographic', 'polychrome']);
    } },
  'The Hermit': { cost: 3, desc: 'Doubles money (Max of $20)',
    use: (s) => { s.money += Math.min(20, s.money); } },
};

export const SPECTRALS = {
  Ankh: { cost: 4, desc: 'Create a copy of a random Joker, destroy all other Jokers',
    use: (s) => {
      if (!s.jokers.length) return;
      const target = s.rng.pick(s.jokers);
      const copy = { ...target, uid: s.nextUid(), edition: target.edition === 'negative' ? 'base' : target.edition };
      s.jokers = s.jokers.filter((j) => !j.eternal);
      s.jokers = [copy];
    } },
  Aura: { cost: 4, desc: 'Add Foil, Holographic, or Polychrome effect to 1 selected card in hand',
    use: (s, sel) => {
      const c = sel[0];
      if (!c) return;
      c.edition = s.rng.pick(['foil', 'holographic', 'polychrome']);
    } },
  'Black Hole': { cost: 4, desc: 'Upgrade every poker hand by 1 level',
    use: (s) => { for (const h of HANDS) s.handLevels[h.id] = (s.handLevels[h.id] || 1) + 1; } },
  Cryptid: { cost: 4, desc: 'Create 2 copies of 1 selected card in your hand',
    use: (s, sel) => {
      const c = sel[0];
      if (!c) return;
      s.addCardToDeck(cloneCard(c));
      s.addCardToDeck(cloneCard(c));
    } },
  'Deja Vu': { cost: 4, desc: 'Add a Red Seal to 1 selected card in your hand',
    use: (s, sel) => { if (sel[0]) sel[0].seal = 'red'; } },
  Ectoplasm: { cost: 4, desc: 'Add Negative to a random Joker, -1 hand size',
    use: (s) => {
      if (s.jokers.length) s.rng.pick(s.jokers).edition = 'negative';
      s.handSizeMod -= 1;
    } },
  Familiar: { cost: 4, desc: 'Destroy 1 random card in your hand, add 3 random Enhanced face cards to your hand',
    use: (s) => {
      if (s.hand.length) s.destroySelected([s.rng.pick(s.hand)]);
      for (let i = 0; i < 3; i++) s.addToHand(randomEnhanced(s, [11, 12, 13]));
    } },
  Grim: { cost: 4, desc: 'Destroy 1 random card in your hand, add 2 random Enhanced Aces to your hand',
    use: (s) => {
      if (s.hand.length) s.destroySelected([s.rng.pick(s.hand)]);
      for (let i = 0; i < 2; i++) s.addToHand(randomEnhanced(s, [14]));
    } },
  Hex: { cost: 4, desc: 'Add Polychrome to a random Joker, destroy all other Jokers',
    use: (s) => {
      if (!s.jokers.length) return;
      const target = s.rng.pick(s.jokers);
      target.edition = 'polychrome';
      s.jokers = s.jokers.filter((j) => j === target || j.eternal);
    } },
  Immolate: { cost: 4, desc: 'Destroys 5 random cards in hand, gain $20',
    use: (s) => {
      const picks = s.rng.shuffle(s.hand).slice(0, 5);
      s.destroySelected(picks);
      s.money += 20;
    } },
  Incantation: { cost: 4, desc: 'Destroy 1 random card in your hand, add 4 random Enhanced numbered cards to your hand',
    use: (s) => {
      if (s.hand.length) s.destroySelected([s.rng.pick(s.hand)]);
      for (let i = 0; i < 4; i++) s.addToHand(randomEnhanced(s, [2, 3, 4, 5, 6, 7, 8, 9, 10]));
    } },
  Medium: { cost: 4, desc: 'Add a Purple Seal to 1 selected card in your hand',
    use: (s, sel) => { if (sel[0]) sel[0].seal = 'purple'; } },
  Ouija: { cost: 4, desc: 'Converts all cards in hand to a single random rank, -1 hand size',
    use: (s) => {
      const r = s.rng.range(2, 14);
      for (const c of s.hand) c.rank = r;
      s.handSizeMod -= 1;
    } },
  Sigil: { cost: 4, desc: 'Converts all cards in hand to a single random suit',
    use: (s) => {
      const su = s.rng.pick(SUITS);
      for (const c of s.hand) c.suit = su;
    } },
  Talisman: { cost: 4, desc: 'Add a Gold Seal to 1 selected card in your hand',
    use: (s, sel) => { if (sel[0]) sel[0].seal = 'gold'; } },
  'The Soul': { cost: 4, desc: 'Creates a Legendary Joker',
    use: (s) => s.createJoker(null, 'Legendary') },
  Trance: { cost: 4, desc: 'Add a Blue Seal to 1 selected card in your hand',
    use: (s, sel) => { if (sel[0]) sel[0].seal = 'blue'; } },
  Wraith: { cost: 4, desc: 'Creates a random Rare Joker, sets money to $0',
    use: (s) => { s.createJoker(null, 'Rare'); s.money = 0; } },
};

/**
 * Tarots that operate on cards the player selects. Every other tarot can be
 * used without picking a target.
 */
export const TARGET_TAROTS = new Set([
  'The Magician', 'The Empress', 'The Hierophant', 'The Lovers', 'The Chariot',
  'Justice', 'The Hanged Man', 'Death', 'The Devil', 'The Tower', 'The Star',
  'The Moon', 'The Sun', 'The World', 'Strength',
]);

/** Spectral cards that operate on cards the player selects. */
export const TARGET_SPECTRALS = new Set([
  'Aura', 'Cryptid', 'Deja Vu', 'Medium', 'Talisman', 'Trance',
]);

export const PLANETS = {
  Mercury: { hand: 'pair', chips: 15, mult: 1 },
  Venus: { hand: 'three_of_a_kind', chips: 20, mult: 2 },
  Earth: { hand: 'full_house', chips: 25, mult: 2 },
  Mars: { hand: 'four_of_a_kind', chips: 30, mult: 3 },
  Jupiter: { hand: 'flush', chips: 15, mult: 2 },
  Saturn: { hand: 'straight', chips: 30, mult: 3 },
  Uranus: { hand: 'two_pair', chips: 20, mult: 1 },
  Neptune: { hand: 'straight_flush', chips: 40, mult: 4 },
  Pluto: { hand: 'high_card', chips: 10, mult: 1 },
  Ceres: { hand: 'flush_house', chips: 40, mult: 4 },
  Eris: { hand: 'flush_five', chips: 50, mult: 3 },
  'Planet X': { hand: 'five_of_a_kind', chips: 35, mult: 3 },
};

function randomEnhanced(s, ranks) {
  const rank = s.rng.pick(ranks);
  const suit = s.rng.pick(SUITS);
  const enhs = ['bonus', 'mult', 'glass', 'steel', 'gold', 'lucky', 'wild'];
  return makeCard(rank, suit, { enhancement: s.rng.pick(enhs) });
}

// ---------------------------------------------------------------------------

export const VOUCHERS = {
  'Blank': { desc: 'Does nothing?', base: true },
  'Antimatter': { desc: '+1 Joker Slot', prev: 'Blank' },
  'Clearance Sale': { desc: 'All cards and packs in shop are 25% off', base: true },
  'Liquidation': { desc: 'All cards and packs in shop are 50% off', prev: 'Clearance Sale' },
  'Crystal Ball': { desc: '+1 consumable slot', base: true },
  "Director's Cut": { desc: 'Reroll Boss Blind 1 time per Ante, $10 per roll', base: true },
  'Retcon': { desc: 'Reroll Boss Blind unlimited times, $10 per roll', prev: "Director's Cut" },
  'Glow Up': { desc: 'Foil, Holographic, and Polychrome cards appear 4X more often', prev: 'Hone' },
  'Grabber': { desc: 'Permanently gain +1 hand per round', base: true },
  'Nacho Tong': { desc: 'Permanently gain an additional +1 hand per round', prev: 'Grabber' },
  'Hieroglyph': { desc: '-1 Ante, -1 hand each round', base: true },
  'Petroglyph': { desc: '-1 Ante, -1 discard each round', prev: 'Hieroglyph' },
  'Hone': { desc: 'Foil, Holographic, and Polychrome cards appear 2X more often', base: true },
  'Illusion': { desc: 'Playing cards in shop may have an Enhancement, Edition, and/or a Seal', prev: 'Magic Trick' },
  'Magic Trick': { desc: 'Playing cards can be purchased from the shop', base: true },
  'Money Tree': { desc: 'Raise the cap on interest earned in each round to $20', prev: 'Seed Money' },
  'Seed Money': { desc: 'Raise the cap on interest earned in each round to $10', base: true },
  'Observatory': { desc: 'Planet cards in your consumable area give X1.5 for their specified poker hand', prev: 'Telescope' },
  'Telescope': { desc: 'Celestial Packs always contain the card for your most played poker hand', base: true },
  'Omen Globe': { desc: 'Spectral cards may appear in any of the Arcana Packs', prev: 'Crystal Ball' },
  'Overstock': { desc: '+1 card slot available in shop', base: true },
  'Overstock Plus': { desc: '+1 card slot available in shop', prev: 'Overstock' },
  'Paint Brush': { desc: '+1 hand size', base: true },
  'Palette': { desc: '+1 hand size', prev: 'Paint Brush' },
  'Recyclomancy': { desc: 'Permanently gain an additional +1 discard each round', prev: 'Wasteful' },
  'Wasteful': { desc: 'Permanently gain +1 discard each round', base: true },
  'Reroll Glut': { desc: 'Rerolls cost an additional $2 less', prev: 'Reroll Surplus' },
  'Reroll Surplus': { desc: 'Rerolls cost $2 less', base: true },
  'Planet Merchant': { desc: 'Planet cards appear 2X more frequently in the shop', base: true },
  'Planet Tycoon': { desc: 'Planet cards appear 4X more frequently in the shop', prev: 'Planet Merchant' },
  'Tarot Merchant': { desc: 'Tarot cards appear 2X more frequently in the shop', base: true },
  'Tarot Tycoon': { desc: 'Tarot cards appear 4X more frequently in the shop', prev: 'Tarot Merchant' },
};
