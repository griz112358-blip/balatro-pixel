// The run: deck, hand, jokers, consumables, shop, blinds, economy.

import { makeRng } from './rng.js';
import {
  standardDeck, makeCard, cloneCard, SUITS, RANK_LABEL, effectiveRank, isFace, matchesSuit,
} from './cards.js';
import { HANDS, HAND_BY_ID, handLevelValues, evaluateHand } from './hands.js';
import { scoreHand } from './scoring.js';
import {
  BOSS_BLINDS, SHOWDOWN_BLINDS, BLIND_TYPE, blindScore, pickBossBlind, anteBase, STAKES,
} from './blinds.js';
import { TAROTS, SPECTRALS, PLANETS, VOUCHERS } from './consumables.js';
import { JOKERS } from './jokers.js';
import { JOKER_DATA } from '../data/jokers.js';
import { createShop } from './shop.js';
import { computeSellValue } from './value.js';

const JOKER_BY_NAME = Object.fromEntries(JOKER_DATA.map((j) => [j.name, j]));

export const DECKS = {
  'Red Deck': { desc: 'Base deck' },
  'Blue Deck': { desc: '+1 hand per round', hands: 1 },
  'Green Deck': { desc: 'No interest on money held at end of round' },
  'Black Deck': { desc: '+1 Joker slot', jokerSlots: 1 },
  'Yellow Deck': { desc: 'Start with $10', money: 10 },
  'Orange Deck': { desc: 'Start with 1 less discard', discards: -1 },
  'Purple Deck': { desc: 'Start with 1 less hand', hands: -1 },
  'Plasma Deck': { desc: 'Balance Chips and Mult when calculating score, X2 base Blind size', plasma: true },
  'Anaglyph Deck': { desc: 'Cards have 2 copies of each enhancement and seal', doubleCopies: true },
  'Painted Deck': { desc: 'Cards have 2 copies of each enhancement and seal, +1 hand size, -1 Joker slot',
    handSize: 1, jokerSlots: -1, doubleCopies: true },
  'Mad World Deck': { desc: 'All cards are Glass cards' },
  'Lucky Deck': { desc: 'All cards are Lucky cards' },
  'Gold Deck': { desc: 'All cards are Gold cards' },
  'Ghost Deck': { desc: 'Spectral cards may appear in the shop', ghost: true },
  'Abandoned Deck': { desc: 'Start with no face cards' },
  'Magic Deck': { desc: 'Start with 2 The Fool tarot cards, -1 hand size', handSize: -1 },
};

let uidCounter = 1;

export class Run {
  constructor(opts = {}) {
    this.seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    this.rng = makeRng(this.seed);
    this.deckName = opts.deck || 'Red Deck';
    this.deck = DECKS[this.deckName] || DECKS['Red Deck'];
    this.stake = opts.stake || 'white';
    this.money = 4;
    this.ante = 1;
    this.anteProgress = 1; // real Ante progress, before Hieroglyph / Petroglyph
    this.anteMod = 0; // Hieroglyph / Petroglyph reduce every Ante by 1
    this.round = 0; // 0=small, 1=big, 2=boss
    this.handsLeft = 4;
    this.discardsLeft = 3;
    this.hand = [];
    this.deckPile = [];
    this.discardPile = [];
    this.jokers = [];
    this.consumables = [];
    this.vouchers = [];
    this.handLevels = Object.fromEntries(HANDS.map((h) => [h.id, 1]));
    this.unlockedHands = new Set(['high_card', 'pair', 'two_pair', 'three_of_a_kind',
      'straight', 'flush', 'full_house', 'four_of_a_kind', 'straight_flush']);
    this.handPlayedCounts = Object.fromEntries(HANDS.map((h) => [h.id, 0]));
    this.handsPlayed = 0;
    this.discardsUsed = 0;
    this.roundsPlayed = 0;
    this.blindsSkipped = 0;
    this.tarotsUsed = 0;
    this.shopRerolls = 0;
    this.currentBlind = null;
    this.currentBoss = null;
    this.bossActive = false;
    this.seenBosses = {};
    this.blindHistory = [];
    this.playedThisAnte = [];
    this.playedThisRound = [];
    this.roundHandTypes = [];
    this.lastConsumableUsed = null;
    this.shop = null;
    this.tags = [];
    this.pendingTags = [];
    this.couponTagNextShop = false;
    this.firstHandOfRound = true;
    this.firstDiscardOfRound = true;
    this.cardsSold = 0;
    this.log = [];
    this.gameOver = false;
    this.won = false;
    this.score = 0;
    this.roundScore = 0;
    this.handSizeMod = 0;
    this.handsPerRoundMod = 0;
    this.discardsPerRoundMod = 0;
    this.jokerSlotMod = 0;
    this.consumableSlotMod = 0;
    this.pareidolia = false;
    this.smeared = false;
    this.bossDisabled = false;
    this.bossTag = false;
    this.anaglyphTag = false;
    this.bossRerollsThisAnte = 0;
    this.lastHandChips = 0;
    this.madnessMult = 1;
    this.seltzerHands = 0;
    this.deckSizeMod = 0;
    this.startingDeckSize = 52;
    this.pendingBlindEffects = [];
    this.lastBlindWasBoss = false;
    this.bossTriggeredThisHand = false;
    this.packsSkipped = 0;
    this.planetsUsed = new Set();
    this.jacksDiscardedThisRound = 0;
    this.endless = false;

    this.applyDeckStart();
  }

  nextUid() { return uidCounter++; }

  applyDeckStart() {
    const d = this.deck;
    this.money = 4 + (d.money || 0);
    let deck = standardDeck();
    if (this.deckName === 'Mad World Deck') deck.forEach((c) => { c.enhancement = 'glass'; });
    if (this.deckName === 'Lucky Deck') deck.forEach((c) => { c.enhancement = 'lucky'; });
    if (this.deckName === 'Gold Deck') deck.forEach((c) => { c.enhancement = 'gold'; });
    if (this.deckName === 'Abandoned Deck') {
      deck = deck.filter((c) => !isFace(effectiveRank(c)));
    }
    // The Anaglyph / Painted decks give every card two copies of its
    // enhancement and its seal.
    if (d.doubleCopies) {
      const copies = [];
      for (const c of deck) {
        copies.push(c);
        if (c.enhancement || c.seal) {
          const twin = cloneCard(c);
          copies.push(twin);
        }
      }
      deck = copies;
    }
    this.deckPile = this.rng.shuffle(deck);
    this.fullDeck = deck.slice();
    this.startingDeckSize = deck.length;
    if (this.deckName === 'Magic Deck') {
      this.consumables.push(this.makeConsumable('The Fool'));
      this.consumables.push(this.makeConsumable('The Fool'));
    }
  }

  // ---------------- helpers ----------------

  hasJoker(name) { return this.jokers.some((j) => j.name === name); }
  hasVoucher(name) { return this.vouchers.includes(name); }
  get jokerSlots() {
    const base = 5 + (this.deck.jokerSlots || 0) + this.jokerSlotMod;
    const negative = this.jokers.filter((j) => j.edition === 'negative').length;
    return Math.max(0, base + negative);
  }
  get consumableSlots() {
    let n = 2 + this.consumableSlotMod;
    // Negative consumables (from Perkeo) occupy a slot of their own.
    const negative = this.consumables.filter((c) => c.edition === 'negative').length;
    return Math.max(0, n - negative);
  }
  get handSize() {
    let n = 8 + (this.deck.handSize || 0) + this.handSizeMod;
    // Vouchers that add hand size are applied through handSizeMod on purchase.
    n += this.hasJoker('Juggler') ? 1 : 0;
    n += this.hasJoker('Turtle Bean') ? Math.max(0, 5 - (this.roundsPlayed || 0)) : 0;
    n += this.hasJoker('Troubadour') ? 2 : 0;
    n -= this.hasJoker('Merry Andy') ? 1 : 0;
    n -= this.hasJoker('Stuntman') ? 2 : 0;
    if (this.currentBoss?.id === 'the_manacle') n -= 1;
    return Math.max(1, n);
  }
  /** +1 hand per round from the Grabber / Nacho Tong vouchers. */
  get handsPerRound() {
    return 4 + (this.deck.hands || 0) + this.handsPerRoundMod
      + (this.hasJoker('Burglar') ? 3 : 0)
      - (this.hasJoker('Troubadour') ? 1 : 0);
  }
  get discardsPerRound() {
    return 3 + (this.deck.discards || 0) + this.discardsPerRoundMod
      + (this.hasJoker('Drunkard') ? 1 : 0)
      + (this.hasJoker('Merry Andy') ? 3 : 0)
      - (this.hasJoker('Troubadour') ? 1 : 0)
      - (['blue', 'purple', 'orange', 'gold'].includes(this.stake) ? 1 : 0);
  }

  mostPlayedHand() {
    let best = null; let bestN = -1;
    for (const [k, v] of Object.entries(this.handPlayedCounts)) {
      if (v > bestN) { bestN = v; best = k; }
    }
    return best;
  }

  /**
   * Append a log entry. The engine stays language neutral: it stores a
   * message id plus its parameters, and the interface layer renders it.
   */
  logMsg(id, params = {}) {
    this.log.unshift({ id, params });
    if (this.log.length > 200) this.log.pop();
  }

  // ---------------- deck / hand ----------------

  drawCards(n) {
    for (let i = 0; i < n; i++) {
      if (this.deckPile.length === 0) {
        if (this.discardPile.length === 0) break;
        this.deckPile = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
      }
      const c = this.deckPile.pop();
      // Being drawn face down is a blind's doing, not a property of the card:
      // a card that was turned over in an earlier round has to come back up.
      c.faceDown = false;
      this.hand.push(c);
    }
  }

  addCardToDeck(card) {
    this.fullDeck.push(card);
    // insert into the draw pile at a random position
    const idx = this.rng.int(this.deckPile.length + 1);
    this.deckPile.splice(idx, 0, card);
    this.onCardAddedToDeck();
  }

  addToHand(card) { this.hand.push(card); }

  destroySelected(cards) {
    for (const c of cards) {
      const i = this.hand.indexOf(c);
      if (i >= 0) this.hand.splice(i, 1);
      this.fullDeck = this.fullDeck.filter((x) => x.uid !== c.uid);
      this.deckPile = this.deckPile.filter((x) => x.uid !== c.uid);
      this.onCardDestroyed(c);
    }
  }

  discardCards(cards) {
    const isFirstDiscard = this.firstDiscardOfRound;
    for (const c of cards) {
      const i = this.hand.indexOf(c);
      if (i >= 0) this.hand.splice(i, 1);
      this.discardPile.push(c);
      if (c.seal === 'purple') this.createConsumable('Tarot');
      if (effectiveRank(c) === 11) this.jacksDiscardedThisRound += 1;

      // On-discard jokers
      for (const j of this.jokers) {
        const def = JOKERS[j.name];
        if (!def || def.activation !== 'onDiscard' || j.debuffed) continue;
        j.count = (j.count || 0) + 1;
        const ctx = { money: 0, chips: 0, mult: 0, state: this, card: c, batch: cards };
        ctx.xMult = (factor) => { ctx.mult = ctx.mult * factor; };
        def.fn(this, ctx, j, c, cards);
        this.money += ctx.money;
      }

      // Castle: gains +3 chips per discarded card of its suit.
      for (const j of this.jokers) {
        if (j.debuffed) continue;
        if (j.name === 'Castle' && matchesSuit(c, j.suit, { smeared: this.smeared })) {
          j.chips = (j.chips || 0) + 3;
        }
      }
    }
    this.discardsUsed += cards.length;

    // The Green Joker loses one mult for every card that gets discarded.
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Green Joker') j.discards = (j.discards || 0) + cards.length;
    }

    // Yorick gains X1 every 23 discarded cards.
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Yorick') {
        j.xMult = 1 + Math.floor((j.count || 0) / 23);
      }
    }

    // Trading Card: if the first discard of the round is a single card,
    // destroy it and earn $3.
    if (isFirstDiscard && cards.length === 1 && this.hasJoker('Trading Card')) {
      this.destroySelected([cards[0]]);
      this.money += 3;
      this.logMsg('log.tradingCard');
    }

    // Burnt Joker: upgrade the level of the first poker hand discarded in the
    // round - the one the discarded cards form.
    if (isFirstDiscard && this.hasJoker('Burnt Joker')) {
      const hid = evaluateHand(cards).id;
      if (hid) {
        this.handLevels[hid] = (this.handLevels[hid] || 1) + 1;
        this.logMsg('log.burntJoker', { hand: HAND_BY_ID[hid].name, level: this.handLevels[hid] });
      }
    }

    // Ramen loses X0.01 per card discarded this round.
    for (const j of this.jokers) {
      if (j.name === 'Ramen') j.xMult = Math.max(1, (j.xMult ?? 2) - 0.01 * cards.length);
    }
    this.firstDiscardOfRound = false;
  }

  // ---------------- jokers ----------------

  createJoker(name, rarity) {
    if (this.jokers.length >= this.jokerSlots) return null;
    let j;
    if (name) {
      j = this.buildJoker(name);
    } else {
      j = this.rollJoker(rarity);
    }
    if (!j) return null;
    this.jokers.push(j);
    this.onJokerAcquired(j);
    return j;
  }

  /**
   * Called whenever a joker enters the run. Sets up the state that a joker
   * needs before it can do anything: its starting suit / rank / poker hand,
   * its starting multiplier, and any run-wide flag it turns on.
   */
  onJokerAcquired(joker) {
    if (!joker) return;
    const rnd = this.rng;
    switch (joker.name) {
      case 'Pareidolia': this.pareidolia = true; break;
      case 'The Idol': joker.rank = rnd.range(2, 14); joker.suit = rnd.pick(SUITS); break;
      case 'Ancient Joker': joker.suit = rnd.pick(SUITS); break;
      case 'Castle': joker.suit = rnd.pick(SUITS); break;
      case 'Mail-In Rebate': joker.rank = rnd.range(2, 14); break;
      case 'To Do List': joker.hand = rnd.pick(Object.keys(HAND_BY_ID)); break;
      case 'Lucky Cat': joker.xMult = 1; break;
      case 'Constellation': joker.xMult = 1; break;
      case 'Campfire': joker.xMult = 1; break;
      case 'Canio': joker.xMult = 1; break;
      case 'Yorick': joker.xMult = 1; break;
      case 'Glass Joker': joker.xMult = 1; break;
      case 'Hologram': joker.xMult = 1; break;
      case 'Hit the Road': joker.xMult = 1; break;
      case 'Ramen': joker.xMult = 2; break;
      case 'Loyalty Card': joker.count = 0; break;
      case 'Obelisk': joker.xMult = 1; break;
      case 'Runner': joker.chips = 0; break;
      case 'Spare Trousers': joker.extraMult = 0; break;
      case 'Smeared Joker': this.smeared = true; break;
      case 'Chicot': this.bossDisabled = true; break;
      case 'Showman': break;
      default: break;
    }
  }

  /** A joker was sold: some jokers have a special effect when sold. */
  onJokerSold(joker) {
    const def = JOKERS[joker.name];
    if (!def || !joker) return;
    if (def.sellHook === 'duplicateJoker' && this.roundsPlayed >= 2) {
      const pool = this.jokers.filter((j) => j.uid !== joker.uid);
      if (pool.length) {
        const src = this.rng.pick(pool);
        const copy = {
          ...src,
          uid: this.nextUid(),
          edition: src.edition === 'negative' ? 'base' : src.edition,
        };
        this.jokers.push(copy);
        this.logMsg('log.invisibleJoker', { joker: src.name });
      }
    }
    if (joker.name === 'Diet Cola') {
      this.pendingTags.push('double_tag');
      this.logMsg('log.dietCola');
    }
    // The Verdant Leaf keeps every card debuffed until a Joker is sold.
    if (this.currentBoss?.id === 'verdant_leaf' && this.allCardsDebuffed) {
      this.allCardsDebuffed = false;
      this.applyDebuffs();
      this.logMsg('log.verdantLeaf');
    }
  }

  /** The Anaglyph Tag: every enhanced or sealed card gets a twin. */
  applyAnaglyphTag() {
    const twins = [];
    for (const c of this.fullDeck) {
      if (c.enhancement || c.seal) twins.push(cloneCard(c));
    }
    if (!twins.length) return;
    this.fullDeck.push(...twins);
    for (const t of twins) {
      const idx = this.rng.int(this.deckPile.length + 1);
      this.deckPile.splice(idx, 0, t);
    }
    this.logMsg('log.anaglyphTag', { count: twins.length });
  }

  /** Use a joker that has a one-shot effect (the Credit Card). */
  useJoker(joker) {
    if (!joker || !this.jokers.includes(joker)) return { error: 'Not owned' };
    if (joker.name === 'Credit Card') {
      this.money += 20;
      this.jokers.splice(this.jokers.indexOf(joker), 1);
      this.logMsg('log.creditCard');
      return { ok: true };
    }
    return { error: 'This Joker cannot be used' };
  }

  /** A card was destroyed: scaling jokers react. */
  onCardDestroyed(card) {
    if (!card) return;
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Canio' && isFace(effectiveRank(card))) {
        j.xMult = (j.xMult || 1) + 1;
      }
      if (j.name === 'Glass Joker' && card.enhancement === 'glass') {
        j.xMult = (j.xMult || 1) + 0.75;
      }
    }
  }

  /** A playing card was added to the deck. */
  onCardAddedToDeck() {
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Hologram') j.xMult = (j.xMult || 1) + 0.25;
    }
  }

  /** A card was sold in the shop. */
  onCardSold(value) {
    this.cardsSold += 1;
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Campfire') j.xMult = (j.xMult || 1) + 0.25;
    }
  }

  /** A Planet card was used. */
  onPlanetUsed() {
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Constellation') j.xMult = (j.xMult || 1) + 0.1;
    }
  }

  /** A Lucky card triggered successfully. */
  onLuckyTriggered() {
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Lucky Cat') j.xMult = (j.xMult || 1) + 0.25;
    }
  }

  buildJoker(name) {
    const meta = JOKER_BY_NAME[name] || {};
    return {
      uid: this.nextUid(),
      name,
      rarity: meta.rarity || 'Common',
      price: meta.price || 3,
      edition: 'base',
      // The Egg and the Gift Card add to this; the sell value is derived
      // from the price and the edition, plus this bonus.
      sellBonus: 0,
      debuffed: false,
      eternal: false,
      perishable: false,
      rental: false,
      xMult: 1,
      extraMult: 0,
      count: 0,
      used: false,
    };
  }

  rollJoker(rarity) {
    const pool = JOKER_DATA.filter((j) => {
      // Legendary jokers only appear when explicitly requested (The Soul, Wraith).
      if (rarity) {
        if (j.rarity !== rarity) return false;
      } else if (j.rarity === 'Legendary') {
        return false;
      }
      if (this.hasJoker(j.name) && !this.hasJoker('Showman')) return false;
      return true;
    });
    if (!pool.length) return null;
    // rarity weights: common 70, uncommon 25, rare 5, legendary 1
    const weights = pool.map((j) => (
      j.rarity === 'Common' ? 70
        : j.rarity === 'Uncommon' ? 25
          : j.rarity === 'Rare' ? 5 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = this.rng.next() * total;
    let chosen = pool[0];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = pool[i]; break; }
    }
    return this.buildJoker(chosen.name);
  }

  // ---------------- consumables ----------------

  makeConsumable(name) {
    const type = name in PLANETS ? 'Planet' : name in SPECTRALS ? 'Spectral' : 'Tarot';
    const meta = type === 'Planet'
      ? { desc: `Level up ${HAND_BY_ID[PLANETS[name].hand].name} by 1 level`, cost: 3 }
      : type === 'Spectral'
        ? { desc: SPECTRALS[name].desc, cost: 4 }
        : { desc: TAROTS[name].desc, cost: 3 };
    return {
      uid: this.nextUid(),
      kind: 'consumable',
      type,
      name,
      desc: meta.desc,
      cost: meta.cost,
      price: meta.cost,
      sellBonus: 0,
      edition: 'base',
      debuffed: false,
    };
  }

  createConsumable(type, name) {
    if (this.consumables.length >= this.consumableSlots) return null;
    let n = name;
    if (!n) {
      if (type === 'Planet') {
        const unlocked = HANDS.filter((h) => this.unlockedHands.has(h.id));
        n = this.rng.pick(unlocked).planet;
      } else if (type === 'Tarot') {
        n = this.rng.pick(Object.keys(TAROTS));
      } else if (type === 'Spectral') {
        n = this.rng.pick(Object.keys(SPECTRALS));
      }
    }
    const c = this.makeConsumable(n);
    this.consumables.push(c);
    return c;
  }

  useConsumable(consumable, selected = []) {
    const type = consumable.type;
    if (type === 'Planet') {
      const p = PLANETS[consumable.name];
      const hid = p.hand;
      this.handLevels[hid] = (this.handLevels[hid] || 1) + 1;
      this.unlockedHands.add(hid);
      this.planetsUsed.add(consumable.name);
      this.onPlanetUsed();
      this.logMsg('log.usedConsumable', {
          consumable: consumable.name,
          consumableType: consumable.type,
          hand: HAND_BY_ID[hid].name,
          level: this.handLevels[hid],
        });
    } else if (type === 'Tarot') {
      TAROTS[consumable.name].use(this, selected);
      this.tarotsUsed += 1;
      this.lastConsumableUsed = { type: 'Tarot', name: consumable.name };
    } else if (type === 'Spectral') {
      SPECTRALS[consumable.name].use(this, selected);
      this.lastConsumableUsed = { type: 'Spectral', name: consumable.name };
    }
    const i = this.consumables.indexOf(consumable);
    if (i >= 0) this.consumables.splice(i, 1);
  }

  // ---------------- vouchers ----------------

  buyVoucher(name) {
    if (this.vouchers.includes(name)) return;
    this.vouchers.push(name);
    switch (name) {
      case 'Antimatter': this.jokerSlotMod += 1; break;
      case 'Crystal Ball': this.consumableSlotMod += 1; break;
      case 'Grabber': this.handsPerRoundMod += 1; break;
      case 'Nacho Tong': this.handsPerRoundMod += 1; break;
      case 'Wasteful': this.discardsPerRoundMod += 1; break;
      case 'Recyclomancy': this.discardsPerRoundMod += 1; break;
      case 'Paint Brush': this.handSizeMod += 1; break;
      case 'Palette': this.handSizeMod += 1; break;
      case 'Hieroglyph':
        // -1 Ante and -1 hand size each round.
        this.anteMod -= 1;
        this.handSizeMod -= 1;
        break;
      case 'Petroglyph':
        // -1 Ante and -1 discard each round.
        this.anteMod -= 1;
        this.discardsPerRoundMod -= 1;
        break;
      default: break;
    }
  }

  // ---------------- blind flow ----------------

  currentBlindType() {
    if (this.round === 0) return 'small';
    if (this.round === 1) return 'big';
    return 'boss';
  }

  /** Blinds the player may pick right now (Small / Big, or the fixed boss). */
  selectableBlinds() {
    if (this.round === 2) {
      const boss = this.currentBoss || this.pickBoss();
      return [{
        type: 'boss', name: boss.name, desc: boss.desc || '',
        mult: boss.mult, reward: boss.reward, id: boss.id,
      }];
    }
    // The Boss Tag replaces the Big Blind with a Boss Blind.
    if (this.round === 1 && this.bossTag) {
      const boss = this.currentBoss || this.pickBoss();
      return [{
        type: 'boss', name: boss.name, desc: boss.desc || '',
        mult: boss.mult, reward: boss.reward, id: boss.id,
      }];
    }
    const opts = [];
    const small = BLIND_TYPE.small;
    const big = BLIND_TYPE.big;
    if (this.round === 0) {
      opts.push({
        type: 'small', name: small.name,
        desc: small.desc,
        mult: small.mult, reward: small.reward,
      });
    }
    opts.push({
      type: 'big', name: big.name,
      desc: big.desc,
      mult: big.mult, reward: big.reward,
    });
    return opts;
  }

  /**
   * Reroll the current Boss Blind.
   * Director's Cut allows one reroll per Ante; Retcon allows unlimited.
   */
  rerollBossBlind() {
    const cost = 10;
    if (this.money < cost) return { error: 'Not enough money' };
    if (this.round !== 2 && !this.bossTag) return { error: 'No Boss Blind to reroll' };
    if (!this.hasVoucher("Director's Cut") && !this.hasVoucher('Retcon')) {
      return { error: 'You do not own a reroll voucher' };
    }
    if (this.hasVoucher("Director's Cut") && !this.hasVoucher('Retcon')
      && this.bossRerollsThisAnte >= 1) {
      return { error: 'No rerolls left this Ante' };
    }
    this.money -= cost;
    this.bossRerollsThisAnte = (this.bossRerollsThisAnte || 0) + 1;
    this.currentBoss = null;
    const boss = this.pickBoss();
    this.logMsg('log.rerolledBoss', { blind: boss.name });
    return { ok: true, boss };
  }

  pickBoss() {
    const boss = pickBossBlind(this.rng, this.ante, this.seenBosses, this.showdownNext);
    this.currentBoss = boss;
    this.seenBosses[boss.id] = (this.seenBosses[boss.id] || 0) + 1;
    return boss;
  }

  /** Start the blind of the given type; picks the boss when needed. */
  selectBlind(type) {
    if (type === 'boss') {
      if (!this.currentBoss) this.pickBoss();
    } else {
      this.currentBoss = null;
    }
    this.round = type === 'small' ? 0 : type === 'big' ? 1 : 2;
    this.startBlind();
  }

  /** Skip the current blind for money. */
  skipBlind() {
    const type = this.currentBlindType();
    const reward = type === 'small' ? 2 : type === 'big' ? 3 : 5;
    this.money += reward;
    this.blindsSkipped += 1;
    this.logMsg('log.skippedBlind', { blind: BLIND_TYPE[type].name, reward });
    // Remember the blind, so the pipeline can show it as skipped.
    this.blindHistory.push({
      ante: this.ante,
      type,
      name: this.currentBlind?.name || BLIND_TYPE[type].name,
      desc: this.currentBlind?.desc || '',
      scoreRequired: this.currentBlind?.scoreRequired ?? null,
      score: null,
      skipped: true,
      reward,
    });
    // Red Card gains +3 mult whenever a pack is skipped.
    for (const j of this.jokers) {
      if (j.name === 'Red Card') j.extraMult = (j.extraMult || 0) + 3;
    }
    this.advanceBlind();
    return reward;
  }

  /** The round of the current ante a blind option leads to. */
  blindOptionRound(type) {
    if (this.round === 0) return type === 'small' ? 0 : 1;
    if (this.round === 1) return 1;
    return 2;
  }

  /**
   * The three blinds of the current ante, as a pipeline.
   *
   * Every stage says what the blind is, what it takes to beat it and whether
   * it is already behind the player, waiting to be picked or still ahead. A
   * boss blind that has not been reached yet is still a surprise, so it shows
   * its reward and the range of its score instead of a name.
   */
  antePipeline() {
    const ante = this.ante;
    const plasma = !!this.deck.plasma;
    const options = this.selectableBlinds();
    const history = this.blindHistory.filter((b) => b.ante === ante);
    const stages = [];

    for (let round = 0; round < 3; round++) {
      const option = options.find((o) => this.blindOptionRound(o.type) === round);
      const done = history[round];

      if (done) {
        stages.push({
          round,
          type: done.type,
          state: 'cleared',
          name: done.name,
          desc: done.desc || '',
          scoreRequired: done.scoreRequired,
          scoreMax: null,
          score: done.score,
          skipped: done.skipped,
          reward: done.reward,
          bossTag: false,
        });
        continue;
      }

      if (option) {
        stages.push({
          round,
          type: option.type,
          state: 'open',
          name: option.name,
          desc: option.desc || '',
          scoreRequired: Math.floor(blindScore(ante, this.stake, option.mult ?? 1, plasma)),
          scoreMax: null,
          score: null,
          skipped: false,
          reward: option.reward,
          bossTag: false,
        });
        continue;
      }

      // Still ahead. The small and the big blind are known; a boss is not.
      const bossSlot = round === 2 || (round === 1 && this.bossTag && this.round >= 1);
      const def = bossSlot ? null : BLIND_TYPE[round === 0 ? 'small' : 'big'];
      stages.push({
        round,
        type: bossSlot ? 'boss' : round === 0 ? 'small' : 'big',
        state: 'locked',
        name: def ? def.name : 'Boss Blind',
        desc: def ? def.desc || '' : '',
        scoreRequired: Math.floor(blindScore(ante, this.stake, def ? def.mult : 2, plasma)),
        scoreMax: bossSlot ? Math.floor(blindScore(ante, this.stake, 4, plasma)) : null,
        score: null,
        skipped: false,
        reward: def ? def.reward : 5,
        bossTag: bossSlot && this.bossTag,
      });
    }
    return stages;
  }

  /**
   * The blinds of the next ante, as a preview.
   *
   * The boss blind of that ante is still a surprise, so it shows the range
   * of scores it could ask for.
   */
  nextAntePreview() {
    const ante = this.ante + 1;
    const plasma = !!this.deck.plasma;
    return {
      ante,
      small: Math.floor(blindScore(ante, this.stake, BLIND_TYPE.small.mult, plasma)),
      big: Math.floor(blindScore(ante, this.stake, BLIND_TYPE.big.mult, plasma)),
      bossMin: Math.floor(blindScore(ante, this.stake, 2, plasma)),
      bossMax: Math.floor(blindScore(ante, this.stake, 4, plasma)),
    };
  }

  /**
   * How far the player has come: the blinds of the whole run, the ones that
   * were beaten and the ones that were skipped.
   */
  blindProgress() {
    const beaten = this.blindHistory.filter((b) => !b.skipped).length;
    const skipped = this.blindHistory.filter((b) => b.skipped).length;
    const antes = Math.max(8, this.ante);
    return {
      beaten,
      skipped,
      resolved: beaten + skipped,
      total: antes * 3,
      antes,
      history: this.blindHistory,
    };
  }

  /** Move to the next blind of the ante (or the next ante). */
  advanceBlind() {
    this.round += 1;
    if (this.round > 2) {
      this.round = 0;
      this.anteProgress += 1;
      this.ante = Math.max(0, this.anteProgress + this.anteMod);
      this.currentBoss = null;
      if (this.ante > 8) {
        this.won = true;
        this.showdownNext = true;
        this.endless = true;
      }
    }
  }

  startBlind() {
    const type = this.currentBlindType();
    const ante = this.ante;
    this.currentBlind = {
      type,
      name: type === 'boss' ? this.currentBoss?.name || 'Boss Blind'
        : BLIND_TYPE[type].name,
      desc: type === 'boss' ? (this.currentBoss?.desc || '') : (BLIND_TYPE[type].desc || ''),
      mult: type === 'boss' ? (this.currentBoss?.mult ?? 2) : BLIND_TYPE[type].mult,
      reward: type === 'boss' ? (this.currentBoss?.reward ?? 5) : BLIND_TYPE[type].reward,
    };
    const plasma = this.deck.plasma;
    this.currentBlind.scoreRequired = blindScore(ante, this.stake, this.currentBlind.mult, plasma);
    this.currentBlind.score = 0;
    this.bossActive = type === 'boss' && !this.hasJoker('Chicot');
    this.roundScore = 0;
    this.playedThisRound = [];
    this.roundHandTypes = [];
    this.firstHandOfRound = true;
    this.firstDiscardOfRound = true;

    // Round setup
    this.handsLeft = Math.max(0, this.handsPerRound);
    this.discardsLeft = Math.max(0, this.discardsPerRound);
    if (this.currentBoss?.id === 'the_water') this.discardsLeft = 0;
    if (this.currentBoss?.id === 'the_needle') this.handsLeft = 1;
    this.discardsAtRoundStart = this.discardsLeft;
    this.handsAtRoundStart = this.handsLeft;

    this.applyBlindEffects();
    this.onBlindSelected();
    this.onRoundStart();

    // The Amber Acorn flips and shuffles all Joker cards.
    if (this.currentBoss?.id === 'amber_acorn') {
      this.jokers = this.rng.shuffle(this.jokers);
      const editions = ['foil', 'holographic', 'polychrome', 'base'];
      for (const j of this.jokers) {
        if (j.edition && j.edition !== 'negative') {
          j.edition = this.rng.pick(editions);
        }
      }
      this.logMsg('log.amberAcorn');
    }

    // Draw the opening hand. Cards left over from the previous round are
    // discarded - without this they would vanish from the deck for good.
    this.discardPile.push(...this.hand);
    this.hand = [];
    this.drawCards(this.handSize);
    if (this.currentBoss?.id === 'the_house') this.hand.forEach((c) => { c.faceDown = true; });
    if (this.currentBoss?.id === 'the_mark') {
      this.hand.filter((c) => isFace(effectiveRank(c))).forEach((c) => { c.faceDown = true; });
    }
    if (this.currentBoss?.id === 'the_wheel') {
      this.hand.forEach((c) => { if (this.rng.chance(1 / 7)) c.faceDown = true; });
    }
    this.applyDebuffs();
    this.logMsg('log.anteBlind', {
        ante,
        blind: this.currentBlind.name,
        score: this.currentBlind.scoreRequired,
      });
  }

  /** Effects that trigger when a new round begins. */
  onRoundStart() {
    // Certificate: add a random playing card with a random seal to the hand.
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Certificate') {
        const card = makeCard(this.rng.range(2, 14), this.rng.pick(SUITS));
        card.seal = this.rng.pick(['red', 'gold', 'blue', 'purple']);
        this.addToHand(card);
      }
    }
    // Troubadour loses one hand per round; Turtle Bean shrinks by one.
    if (this.hasJoker('Troubadour')) this.handsLeft = Math.max(0, this.handsLeft - 1);
  }

  applyBlindEffects() {
    const boss = this.currentBoss;
    this.debuffedSuits = [];
    this.allCardsDebuffed = false;
    if (!boss) return;
    switch (boss.id) {
      case 'the_club': this.debuffedSuits = ['C']; break;
      case 'the_goad': this.debuffedSuits = ['S']; break;
      case 'the_head': this.debuffedSuits = ['H']; break;
      case 'the_window': this.debuffedSuits = ['D']; break;
      case 'the_plant': this.debuffedSuits = ['face']; break;
      case 'verdant_leaf': this.allCardsDebuffed = true; break;
      default: break;
    }
  }

  applyDebuffs() {
    const suits = this.debuffedSuits || [];
    for (const c of this.fullDeck) {
      c.debuffed = false;
      if (this.allCardsDebuffed) { c.debuffed = true; continue; }
      if (suits.includes('face') && isFace(effectiveRank(c))) { c.debuffed = true; continue; }
      if (suits.includes(c.suit)) c.debuffed = true;
    }
    // The Pillar: cards played previously this Ante are debuffed
    if (this.currentBoss?.id === 'the_pillar') {
      for (const c of this.playedThisAnte) c.debuffed = true;
    }
  }

  onBlindSelected() {
    // Blind-select jokers
    for (const j of this.jokers) {
      const def = JOKERS[j.name];
      if (!def || def.activation !== 'blindSelect' || j.debuffed) continue;
      switch (j.name) {
        case 'Marble Joker': {
          const c = makeCard(2, 'D', { enhancement: 'stone' });
          this.addCardToDeck(c);
          break;
        }
        case 'Riff-Raff':
          this.createJoker(null, 'Common');
          this.createJoker(null, 'Common');
          break;
        case 'Burglar':
          this.handsLeft += 3;
          this.discardsLeft = 0;
          break;
        case 'Cartomancer':
          this.createConsumable('Tarot');
          break;
        case 'Ceremonial Dagger': {
          // Destroys the Joker to the right and adds double its sell value.
          const idx = this.jokers.indexOf(j);
          const target = this.jokers[idx + 1];
          if (target) {
            j.extraMult = (j.extraMult || 0) + 2 * computeSellValue(this, target);
            this.jokers.splice(this.jokers.indexOf(target), 1);
            this.logMsg('log.ceremonialDagger', { joker: target.name });
          }
          break;
        }
        default: break;
      }
    }
    // Madness scales on Small/Big Blind
    if ((this.round === 0 || this.round === 1) && this.hasJoker('Madness')) {
      this.madnessMult += 0.5;
      const others = this.jokers.filter((j) => j.name !== 'Madness' && !j.eternal);
      if (others.length) {
        const victim = this.rng.pick(others);
        this.jokers.splice(this.jokers.indexOf(victim), 1);
      }
    }
  }

  // ---------------- playing ----------------

  playableCards() {
    return this.hand.filter((c) => {
      if (this.currentBoss?.id === 'the_psychic') return true;
      return true;
    });
  }

  selectCards(cards) { this.selection = cards.slice(); }

  canPlay() {
    return this.selection && this.selection.length > 0 && this.handsLeft > 0;
  }

  checkHandRestrictions(handId) {
    const boss = this.currentBoss;
    if (!boss) return true;
    if (boss.id === 'the_mouth') {
      if (this.roundHandTypes.length && !this.roundHandTypes.includes(handId)) return false;
    }
    if (boss.id === 'the_eye') {
      if (this.roundHandTypes.includes(handId)) return false;
    }
    return true;
  }

  /**
   * A probability check that honours the Oops! All 6s joker
   * (1 in 3 becomes 2 in 3).
   */
  chance(p) {
    const boosted = this.hasJoker('Oops! All 6s') ? Math.min(1, p * 2) : p;
    return this.rng.chance(boosted);
  }

  playHand() {
    if (!this.canPlay()) return null;
    const played = this.selection.slice();
    const before = this.handsLeft;

    // Showdown blind: Crimson Heart disables a random Joker every hand.
    for (const j of this.jokers) j.disabledThisHand = false;
    if (this.currentBoss?.id === 'crimson_heart' && this.jokers.length) {
      const victim = this.rng.pick(this.jokers);
      victim.disabledThisHand = true;
    }

    // Cerulean Bell: one card is always selected.
    for (const c of this.hand) {
      if (c.forceSelected && !played.includes(c)) played.push(c);
    }

    // Restriction checks (blind effects) - The Psychic requires 5 cards
    if (this.currentBoss?.id === 'the_psychic' && played.length !== 5) {
      return { error: 'The Psychic requires exactly 5 cards' };
    }

    // The hand type is checked before anything is scored, so a rejected hand
    // has no side effects at all.
    const ev = evaluateHand(played, {
      fourFingers: this.hasJoker('Four Fingers'),
      shortcut: this.hasJoker('Shortcut'),
      splash: this.hasJoker('Splash'),
      smeared: this.smeared,
    });
    if (!ev) return { error: 'No valid hand' };
    if (!this.checkHandRestrictions(ev.id)) {
      return { error: this.currentBoss.id === 'the_eye'
        ? 'The Eye: cannot repeat a hand type this round'
        : 'The Mouth: only one hand type allowed this round' };
    }

    const res = scoreHand(this, played);
    if (!res) return { error: 'No valid hand' };

    // Consume the played cards
    for (const c of played) {
      const i = this.hand.indexOf(c);
      if (i >= 0) this.hand.splice(i, 1);
      this.discardPile.push(c);
      c.forceSelected = false;
    }
    this.playedThisAnte.push(...played);
    this.playedThisRound.push(...played);
    this.roundHandTypes.push(res.handId);
    this.handPlayedCounts[res.handId] = (this.handPlayedCounts[res.handId] || 0) + 1;
    this.unlockedHands.add(res.handId);
    this.handsPlayed += 1;
    this.handsLeft -= 1;
    this.selection = [];
    this.score += res.score;
    this.roundScore += res.score;
    this.currentBlind.score = this.roundScore;
    this.money += res.money;

    // Reset per-hand joker state
    for (const j of this.jokers) j.used = false;
    this.bossTriggeredThisHand = false;

    // Space Joker: 1 in 4 chance to upgrade the level of the played hand.
    if (this.hasJoker('Space Joker') && this.chance(1 / 4)) {
      this.handLevels[res.handId] = (this.handLevels[res.handId] || 1) + 1;
      this.logMsg('log.spaceJoker', { hand: res.handName, level: this.handLevels[res.handId] });
    }

    // DNA: if the first hand of the round is a single card, copy it into the deck.
    if (this.firstHandOfRound && played.length === 1 && this.hasJoker('DNA')) {
      const copy = cloneCard(played[0]);
      this.addCardToDeck(copy);
      this.addToHand(copy);
      this.logMsg('log.dna');
    }
    // Sixth Sense: if the first hand of the round is a single 6, destroy it.
    if (this.firstHandOfRound && played.length === 1
      && effectiveRank(played[0]) === 6 && this.hasJoker('Sixth Sense')) {
      this.destroySelected([played[0]]);
      this.createConsumable('Spectral');
      this.logMsg('log.sixthSense');
    }
    this.firstHandOfRound = false;

    // The Tooth: lose $1 per card played
    if (this.currentBoss?.id === 'the_tooth') this.money -= played.length;

    // Glass cards may break after scoring
    this.breakGlassCards(played, res.scoredCards);

    // Ride the Bus: consecutive hands without a scoring face card.
    // The Ice Cream loses 5 chips with every hand played, and the Green
    // Joker gains a mult with every hand played. Each joker keeps its own
    // number, so a joker picked up half way through a run starts from zero.
    const scoredFace = res.scoredCards.some((c) => isFace(effectiveRank(c)) || this.pareidolia);
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Ride the Bus') j.mult = scoredFace ? 0 : (j.mult || 0) + 1;
      if (j.name === 'Ice Cream') j.chips = Math.max(0, (j.chips ?? 100) - 5);
      if (j.name === 'Green Joker') j.hands = (j.hands || 0) + 1;
    }

    // Draw back to hand size
    this.drawCards(Math.max(0, this.handSize - this.hand.length));
    if (this.currentBoss?.id === 'the_fish') this.hand.forEach((c) => { c.faceDown = true; });
    if (this.currentBoss?.id === 'the_serpent') this.drawCards(3);
    if (this.currentBoss?.id === 'the_hook') {
      const n = Math.min(2, this.hand.length);
      const picks = this.rng.shuffle(this.hand).slice(0, n);
      this.discardCards(picks);
    }
    // Cerulean Bell: force a new card to be selected.
    if (this.currentBoss?.id === 'cerulean_bell' && this.hand.length) {
      const c = this.rng.pick(this.hand);
      c.forceSelected = true;
    }

    // Blue Seal: Planet card for the final played hand of the round
    if (this.handsLeft === 0 && this.lastHandOfRound()) {
      this.generateBlueSealPlanets();
    }

    this.logMsg('log.played', {
        hand: res.handName,
        chips: Math.floor(res.chips),
        mult: Math.floor(res.mult),
        score: res.score,
      });
    this.lastHandChips = res.chips;
    return res;
  }

  lastHandOfRound() {
    return this.handsLeft <= 0;
  }

  generateBlueSealPlanets() {
    const held = this.hand.filter((c) => c.seal === 'blue');
    if (!held.length) return;
    const handId = this.roundHandTypes[this.roundHandTypes.length - 1];
    const planet = HAND_BY_ID[handId]?.planet;
    if (!planet) return;
    for (let i = 0; i < held.length; i++) {
      this.createConsumable('Planet', planet);
    }
  }

  breakGlassCards(played, scored) {
    for (const c of played) {
      if (c.enhancement !== 'glass') continue;
      if (!scored.includes(c)) continue;
      if (this.rng.chance(0.25)) {
        c.enhancement = null;
        this.fullDeck = this.fullDeck.filter((x) => x.uid !== c.uid);
        this.logMsg('log.glassBroke');
      }
    }
  }

  discardSelection() {
    if (!this.selection || !this.selection.length) return 0;
    if (this.discardsLeft <= 0) return 0;
    const n = this.selection.length;
    this.discardCards(this.selection);
    this.discardsLeft -= 1;
    this.selection = [];
    this.drawCards(Math.max(0, this.handSize - this.hand.length));
    if (this.currentBoss?.id === 'the_serpent') this.drawCards(3);
    return n;
  }

  // ---------------- round end ----------------

  /** True once the blind's score requirement has been met. */
  blindBeaten() {
    return this.currentBlind && this.roundScore >= this.currentBlind.scoreRequired;
  }

  /** Can the player still act this round? */
  roundOver() {
    return this.handsLeft <= 0 && this.discardsLeft <= 0;
  }

  /**
   * Has the player lost the run?
   * Running out of hands loses the blind. Mr. Bones buys one more chance
   * if the last hand scored at least 25% of the requirement.
   */
  isDead() {
    if (!this.currentBlind) return false;
    if (this.roundScore >= this.currentBlind.scoreRequired) return false;
    if (this.handsLeft > 0) return false;
    const bones = this.jokers.find((j) => j.name === 'Mr. Bones' && !j.debuffed);
    if (bones) {
      const need = this.currentBlind.scoreRequired * 0.25;
      if (this.lastHandChips >= need) {
        this.jokers.splice(this.jokers.indexOf(bones), 1);
        this.handsLeft = 1;
        this.logMsg('log.mrBones');
        return false;
      }
    }
    return true;
  }

  /** Called when the blind is beaten: move on to the shop. */
  completeBlind() {
    const result = this.endRound();
    if (!this.won) this.openShop();
    return result;
  }

  openShop() {
    this.shop = createShop(this);
    return this.shop;
  }

  endRound() {
    this.roundsPlayed += 1;
    // Money earned from the blind
    const reward = this.currentBlind.reward;
    // Remember the blind, so the pipeline can show what was cleared.
    this.blindHistory.push({
      ante: this.ante,
      type: this.currentBlind.type,
      name: this.currentBlind.name,
      desc: this.currentBlind.desc || '',
      scoreRequired: this.currentBlind.scoreRequired ?? null,
      score: this.roundScore,
      skipped: false,
      reward,
    });
    const isSmall = this.currentBlind.type === 'small';
    const noReward = isSmall && ['red', 'green', 'black', 'blue', 'purple', 'orange', 'gold'].includes(this.stake);
    if (!noReward) this.money += reward;

    // Interest
    const interestCap = this.hasVoucher('Money Tree') ? 20
      : this.hasVoucher('Seed Money') ? 10 : 5;
    const noInterest = this.deckName === 'Green Deck';
    let interest = 0;
    if (!noInterest) {
      interest = Math.min(interestCap, Math.floor(this.money / 5));
      if (this.hasJoker('To the Moon')) interest += Math.floor(this.money / 5);
      this.money += interest;
    }

    // End-of-round joker effects
    this.runEndOfRoundJokers();

    // Perishable and Rental jokers expire at the end of the round.
    this.expireStickerJokers();

    // Perkeo: create a Negative copy of a random consumable.
    for (const j of this.jokers) {
      if (j.debuffed) continue;
      if (j.name === 'Perkeo' && this.consumables.length) {
        const src = this.rng.pick(this.consumables);
        const copy = { ...src, uid: this.nextUid(), edition: 'negative' };
        this.consumables.push(copy);
        this.logMsg('log.perkeo');
      }
    }

    this.advanceBlind();
    this.shop = null;
    this.roundScore = 0;
    this.currentBlind = null;
    return { reward, interest };
  }

  /** Perishable jokers last one round, Rental jokers one round as well. */
  expireStickerJokers() {
    const kept = [];
    for (const j of this.jokers) {
      if ((j.perishable || j.rental) && !j.eternal) {
        this.logMsg('log.expired', { joker: j.name });
        continue;
      }
      kept.push(j);
    }
    this.jokers = kept;
  }

  runEndOfRoundJokers() {
    const wasBoss = this.currentBlind?.type === 'boss';
    for (const j of this.jokers) {
      const def = JOKERS[j.name];
      if (!def || j.debuffed) continue;
      switch (j.name) {
        case 'Golden Joker': this.money += 4; break;
        case 'Rocket': this.money += 1 + (wasBoss ? 2 : 0); break;
        case 'Delayed Gratification':
          if (this.discardsLeft === this.discardsAtRoundStart) this.money += 2 * this.discardsAtRoundStart;
          break;
        case 'Egg': j.sellBonus = (j.sellBonus || 0) + 3; break;
        // Popcorn loses 4 mult with every round and never goes below 0.
        case 'Popcorn': j.mult = Math.max(0, (j.mult ?? 20) - 4); break;
        case 'Gift Card':
          this.jokers.forEach((x) => { x.sellBonus = (x.sellBonus || 0) + 1; });
          this.consumables.forEach((x) => { x.sellBonus = (x.sellBonus || 0) + 1; });
          break;
        case 'Cloud 9':
          this.money += this.fullDeck.filter((c) => effectiveRank(c) === 9).length;
          break;
        case 'Gros Michel':
          if (this.rng.chance(1 / 6)) {
            this.jokers.splice(this.jokers.indexOf(j), 1);
            this.logMsg('log.grosMichel');
          }
          break;
        case 'Cavendish':
          if (this.rng.chance(1 / 1000)) {
            this.jokers.splice(this.jokers.indexOf(j), 1);
            this.logMsg('log.cavendish');
          }
          break;
        case 'Popcorn': j.xMult = Math.max(0, (j.xMult ?? 1) - 1); break;
        case 'Ice Cream': j.chips = Math.max(0, (j.chips ?? 100) - 5); break;
        case 'Green Joker': break;
        case 'Satellite': this.money += this.planetsUsed.size; break;
        case 'Hit the Road':
          j.xMult = 1 + 0.5 * this.jacksDiscardedThisRound;
          this.jacksDiscardedThisRound = 0;
          break;
        case 'Runner':
          if (this.roundHandTypes.includes('straight')) j.chips = (j.chips || 0) + 15;
          break;
        case 'Spare Trousers':
          if (this.roundHandTypes.includes('two_pair')) j.extraMult = (j.extraMult || 0) + 2;
          break;
        case 'Loyalty Card':
          j.count = (j.count || 0) + 1;
          break;
        case 'Campfire':
          // Resets when a Boss Blind is defeated.
          if (wasBoss) j.xMult = 1;
          break;
        // Jokers that change their target at the end of the round.
        case 'The Idol':
          j.rank = this.rng.range(2, 14);
          j.suit = this.rng.pick(SUITS);
          break;
        case 'Ancient Joker': j.suit = this.rng.pick(SUITS); break;
        case 'Castle': j.suit = this.rng.pick(SUITS); break;
        case 'Mail-In Rebate': j.rank = this.rng.range(2, 14); break;
        case 'To Do List': j.hand = this.rng.pick(Object.keys(HAND_BY_ID)); break;
        default: break;
      }
    }
    // Gold cards held in hand at end of round
    for (const c of this.hand) {
      if (c.enhancement === 'gold') this.money += 3;
    }
  }
}
