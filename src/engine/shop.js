// The Shop: random cards, booster packs, vouchers, rerolls, pricing.

import { makeCard, cloneCard, SUITS } from './cards.js';
import { JOKERS } from './jokers.js';
import { TAROTS, SPECTRALS, PLANETS, VOUCHERS } from './consumables.js';
import { cardKind } from './cards.js';
import { rollTag, applyTag, TAGS } from './tags.js';
import {
  EDITION_COST, roundHalfDown, shopDiscount, itemCost, computeSellValue,
} from './value.js';

// The pricing rules live in value.js; they are re-exported here so the rest
// of the engine has one obvious place to look for them.
export { EDITION_COST, roundHalfDown, shopDiscount, computeSellValue };

export const PACK_TYPES = ['Arcana', 'Celestial', 'Standard', 'Buffoon', 'Spectral'];
export const PACK_SIZES = ['Normal', 'Jumbo', 'Mega'];

export const PACK_SIZE_INFO = {
  Normal: { cost: 4, options: 3, choose: 1 },
  Jumbo: { cost: 6, options: 5, choose: 1 },
  Mega: { cost: 8, options: 5, choose: 2 },
};
// Buffoon/Spectral packs have fewer options than the others.
export const PACK_TYPE_OPTIONS = {
  Buffoon: { Normal: 2, Jumbo: 4, Mega: 4 },
  Spectral: { Normal: 2, Jumbo: 4, Mega: 4 },
  Arcana: { Normal: 3, Jumbo: 5, Mega: 5 },
  Celestial: { Normal: 3, Jumbo: 5, Mega: 5 },
  Standard: { Normal: 3, Jumbo: 5, Mega: 5 },
};

export const PACK_WEIGHTS = {
  Standard: { Normal: 4, Jumbo: 2, Mega: 0.5 },
  Arcana: { Normal: 4, Jumbo: 2, Mega: 0.5 },
  Celestial: { Normal: 4, Jumbo: 2, Mega: 0.5 },
  Buffoon: { Normal: 1.2, Jumbo: 0.6, Mega: 0.15 },
  Spectral: { Normal: 0.6, Jumbo: 0.3, Mega: 0.07 },
};

export const CARD_WEIGHTS = { Joker: 20, Tarot: 4, Planet: 4, Spectral: 2 };

export function computeBuyCost(run, item) {
  let cost = itemCost(run, item);
  if (run.hasJoker('Astronomer') && (item.type === 'Planet' || item.packType === 'Celestial')) cost = 0;
  // The Coupon Tag makes everything in the shop free (vouchers stay pricey).
  if (run.shop && run.shop.tag === 'coupon' && item.kind !== 'voucher') cost = 0;
  return cost;
}

export function createShop(run) {
  const rng = run.rng;
  const slots = 2 + (run.hasVoucher('Overstock') ? 1 : 0) + (run.hasVoucher('Overstock Plus') ? 1 : 0);
  const items = [];

  // 2 random cards (Joker / Tarot / Planet / Spectral / Playing card)
  for (let i = 0; i < slots; i++) {
    items.push(rollShopCard(run));
  }

  // 2 booster packs
  const packs = [];
  for (let i = 0; i < 2; i++) {
    packs.push(rollPack(run));
  }
  // The first shop of a run always has a Normal Buffoon Pack.
  if (run.roundsPlayed === 0 && !packs.some((p) => p.packType === 'Buffoon' && p.size === 'Normal')) {
    packs[0] = makePack(run, 'Buffoon', 'Normal');
  }

  // 1 voucher
  const voucher = rollVoucher(run);

  const shop = {
    items,
    packs,
    voucher,
    rerollCost: 5 - (run.hasVoucher('Reroll Surplus') ? 2 : 0) - (run.hasVoucher('Reroll Glut') ? 2 : 0),
    rerolls: 0,
    extraRerolls: 0,
    freeRerolls: false,
    giftAtEnd: false,
    jumboPack: false,
    hologramTag: false,
    investmentTag: false,
    rocketTag: false,
    uncommonTag: false,
    extraVoucher: false,
    tag: null,
  };
  if (run.hasJoker('Chaos the Clown')) shop.rerollCost = 0;

  // Tags modify the shop that was just rolled.
  const tagId = rollTag(run);
  if (tagId) {
    shop.tag = tagId;
    applyTag(run, shop, tagId);
  }
  // Tags created by jokers (Diet Cola) apply on top.
  while (run.pendingTags.length) {
    const id = run.pendingTags.shift();
    applyTag(run, shop, id);
  }
  if (shop.jumboPack) {
    for (const p of shop.packs) p.options += 1;
  }
  if (shop.extraVoucher && !shop.voucher) {
    shop.voucher = rollVoucher(run);
  }
  return shop;
}

function rollShopCard(run) {
  const rng = run.rng;
  const shop = run.shop;
  const hologram = shop?.hologramTag;
  const rocket = shop?.rocketTag;
  const uncommon = shop?.uncommonTag;
  const weights = [
    ['Joker', CARD_WEIGHTS.Joker],
    ['Tarot', run.hasVoucher('Tarot Tycoon') ? 32 : run.hasVoucher('Tarot Merchant') ? 9.6 : CARD_WEIGHTS.Tarot],
    ['Planet', hologram ? 12
      : run.hasVoucher('Planet Tycoon') ? 32
        : run.hasVoucher('Planet Merchant') ? 9.6 : CARD_WEIGHTS.Planet],
  ];
  if (run.hasVoucher('Magic Trick')) weights.push(['Playing', 4]);
  if (run.deck.ghost) weights.push(['Spectral', 2]);
  // The Rocket Tag makes a Rocket (a free rare joker) show up in the shop.
  if (rocket) weights.push(['Rocket', 0.6]);
  const kind = rng.weighted(weights);

  if (kind === 'Joker') {
    const j = run.rollJoker(uncommon ? 'Uncommon' : undefined);
    if (j) {
      this_applyEdition(run, j);
      return { kind: 'joker', ...j, price: j.price };
    }
    return rollShopCard(run);
  }
  if (kind === 'Rocket') {
    const j = run.buildJoker('Rocket');
    return { kind: 'joker', ...j, price: j.price };
  }
  if (kind === 'Tarot') {
    const name = rng.pick(Object.keys(TAROTS));
    return { kind: 'consumable', ...run.makeConsumable(name), price: 3 };
  }
  if (kind === 'Planet') {
    const name = rng.pick(Object.keys(PLANETS));
    return { kind: 'consumable', ...run.makeConsumable(name), price: 3 };
  }
  if (kind === 'Spectral') {
    const name = rng.pick(Object.keys(SPECTRALS));
    return { kind: 'consumable', ...run.makeConsumable(name), price: 4 };
  }
  // Playing card
  const card = makeCard(rng.range(2, 14), rng.pick(SUITS));
  if (run.hasVoucher('Illusion')) {
    const enhs = ['bonus', 'mult', 'glass', 'steel', 'stone', 'gold', 'lucky', 'wild'];
    if (rng.chance(0.4)) card.enhancement = rng.pick(enhs);
    if (rng.chance(0.2)) card.edition = rng.pick(['foil', 'holographic', 'polychrome']);
    if (rng.chance(0.2)) card.seal = rng.pick(['red', 'gold', 'blue', 'purple']);
  }
  return { kind: 'playing', ...card, price: 1 };
}

function this_applyEdition(run, joker) {
  const rng = run.rng;
  const hone = run.hasVoucher('Hone') ? 2 : 1;
  const glow = run.hasVoucher('Glow Up') ? 4 : 1;
  const foil = 0.02 * hone * glow;
  const holo = 0.014 * hone * glow;
  const poly = 0.003 * hone * glow;
  const neg = 0.003 * hone * glow;
  const r = rng.next();
  if (r < neg) { joker.edition = 'negative'; return; }
  if (r < neg + poly) { joker.edition = 'polychrome'; return; }
  if (r < neg + poly + holo) { joker.edition = 'holographic'; return; }
  if (r < neg + poly + holo + foil) { joker.edition = 'foil'; return; }
  // Stake stickers
  if (['black', 'blue', 'purple', 'orange', 'gold'].includes(run.stake)) {
    const s = rng.next();
    if (s < 0.3 && run.stake !== 'orange') joker.eternal = true;
    else if (s < 0.6 && run.stake !== 'black') joker.perishable = true;
    else if (s < 0.9 && run.stake === 'gold') joker.rental = true;
  }
}

export function makePack(run, packType, size) {
  const info = PACK_SIZE_INFO[size];
  const cost = info.cost;
  return {
    kind: 'pack',
    packType,
    size,
    price: cost,
    options: PACK_TYPE_OPTIONS[packType][size],
    choose: info.choose,
    cost: cost,
  };
}

function rollPack(run) {
  const entries = [];
  for (const t of PACK_TYPES) {
    for (const s of PACK_SIZES) {
      entries.push([`${t}|${s}`, PACK_WEIGHTS[t][s]]);
    }
  }
  const [type, size] = run.rng.weighted(entries).split('|');
  return makePack(run, type, size);
}

function rollVoucher(run) {
  const base = Object.keys(VOUCHERS).filter((v) => VOUCHERS[v].base);
  const upgraded = Object.keys(VOUCHERS).filter((v) => !VOUCHERS[v].base);
  // Base vouchers are always available; upgraded ones need their predecessor.
  const eligible = base.filter((v) => !run.vouchers.includes(v));
  if (run.rng.chance(0.5) || !eligible.length) {
    const up = upgraded.filter((v) => {
      const prev = VOUCHERS[v].prev;
      return prev && run.vouchers.includes(prev) && !run.vouchers.includes(v);
    });
    if (up.length) {
      const name = run.rng.pick(up);
      return { kind: 'voucher', name, price: 10, desc: VOUCHERS[name].desc };
    }
  }
  if (!eligible.length) {
    // All vouchers redeemed -> Blank
    return { kind: 'voucher', name: 'Blank', price: 10, desc: VOUCHERS.Blank.desc };
  }
  const name = run.rng.pick(eligible);
  return { kind: 'voucher', name, price: 10, desc: VOUCHERS[name].desc };
}

// ---------------------------------------------------------------------------
// Buying and selling

/** Buy a shop card (joker / consumable / playing card) into the run. */
export function buyCard(run, item) {
  const cost = computeBuyCost(run, item);
  if (run.money < cost) return { error: 'Not enough money' };
  if (item.kind === 'joker') {
    if (run.jokers.length >= run.jokerSlots) return { error: 'No joker slots left' };
  } else if (item.kind === 'consumable') {
    if (run.consumables.length >= run.consumableSlots) return { error: 'No consumable slots left' };
  }
  run.money -= cost;
  if (item.kind === 'joker') {
    // The base price stays on the card: the sell value is derived from it.
    const j = { ...item };
    run.jokers.push(j);
    run.onJokerAcquired(j);
  } else if (item.kind === 'consumable') {
    const c = { ...item };
    run.consumables.push(c);
  } else {
    run.addCardToDeck(item);
  }
  return { ok: true, cost };
}

/** Buy a booster pack and return its contents for the player to choose from. */
export function buyPack(run, pack) {
  const cost = pack.price;
  if (run.money < cost) return { error: 'Not enough money' };
  run.money -= cost;
  const options = openPack(run, pack);
  return { ok: true, options };
}

/** Take the chosen cards out of an opened pack. */
export function takeFromPack(run, pack, chosen) {
  for (const item of chosen) {
    if (item.kind === 'joker') {
      if (run.jokers.length >= run.jokerSlots) continue;
      const j = { ...item };
      run.jokers.push(j);
      run.onJokerAcquired(j);
    } else if (item.kind === 'consumable') {
      if (run.consumables.length >= run.consumableSlots) continue;
      const c = { ...item };
      run.consumables.push(c);
    } else {
      run.addCardToDeck(item);
    }
  }
  const idx = run.shop.packs.indexOf(pack);
  if (idx >= 0) run.shop.packs.splice(idx, 1);
}

/** Sell a joker or consumable back to the shop. */
export function sellCard(run, item) {
  const value = computeSellValue(run, item);
  const kind = cardKind(item);
  run.money += value;
  if (kind === 'joker') {
    const i = run.jokers.indexOf(item);
    if (i >= 0) run.jokers.splice(i, 1);
    // Selling the Luchador disables the current Boss Blind.
    if (item.name === 'Luchador' && run.bossActive) {
      run.bossDisabled = true;
      run.logMsg('log.luchador');
    }
    run.onJokerSold(item);
  } else if (kind === 'consumable') {
    const i = run.consumables.indexOf(item);
    if (i >= 0) run.consumables.splice(i, 1);
  } else {
    run.fullDeck = run.fullDeck.filter((c) => c.uid !== item.uid);
    run.deckPile = run.deckPile.filter((c) => c.uid !== item.uid);
  }
  run.onCardSold(value);
  return value;
}

/** Leave the shop: applies end-of-shop tag effects. */
export function closeShop(run) {
  const shop = run.shop;
  if (!shop) return;
  if (shop.giftAtEnd) {
    const j = run.rollJoker();
    if (j) {
      run.jokers.push(j);
      run.onJokerAcquired(j);
      run.logMsg('log.giftTag', { joker: j.name });
    }
  }
  if (shop.investmentTag) {
    const bonus = Math.floor(run.money / 5) * 5;
    run.money += bonus;
    if (bonus) run.logMsg('log.investmentTag', { bonus });
  }
  run.shop = null;
}

/** Buy the shop's voucher. */
export function buyVoucherItem(run) {
  const v = run.shop.voucher;
  if (!v) return { error: 'No voucher available' };
  const cost = v.price ?? 10;
  if (run.money < cost) return { error: 'Not enough money' };
  if (run.hasVoucher(v.name)) return { error: 'Already owned' };
  run.money -= cost;
  run.buyVoucher(v.name);
  return { ok: true, cost };
}

export function rerollShop(run) {
  const shop = run.shop;
  if (!shop) return false;
  const free = shop.freeRerolls || shop.rerolls < (shop.extraRerolls || 0);
  const cost = free ? 0 : shop.rerollCost + shop.rerolls;
  if (run.money < cost) return false;
  run.money -= cost;
  shop.rerolls += 1;
  run.shopRerolls += 1;
  const slots = shop.items.length;
  shop.items = [];
  for (let i = 0; i < slots; i++) shop.items.push(rollShopCard(run));
  return true;
}

/** Open a booster pack: returns the options the player may choose from. */
export function openPack(run, pack) {
  const rng = run.rng;
  const options = [];
  for (let i = 0; i < pack.options; i++) {
    switch (pack.packType) {
      case 'Arcana': {
        // The Omen Globe lets Spectral cards show up in Arcana packs.
        if (run.hasVoucher('Omen Globe') && rng.chance(1 / 4)) {
          const name = rng.pick(Object.keys(SPECTRALS));
          options.push({ kind: 'consumable', ...run.makeConsumable(name) });
          break;
        }
        const name = rng.pick(Object.keys(TAROTS));
        options.push({ kind: 'consumable', ...run.makeConsumable(name) });
        break;
      }
      case 'Celestial': {
        let name;
        if (run.hasVoucher('Telescope')) {
          const most = run.mostPlayedHand();
          name = planetForHand(most);
        } else {
          name = rng.pick(Object.keys(PLANETS));
        }
        options.push({ kind: 'consumable', ...run.makeConsumable(name) });
        break;
      }
      case 'Standard': {
        const card = makeCard(rng.range(2, 14), rng.pick(SUITS));
        if (rng.chance(0.4)) {
          const enhs = ['bonus', 'mult', 'glass', 'steel', 'stone', 'gold', 'lucky', 'wild'];
          card.enhancement = rng.pick(enhs);
        }
        if (rng.chance(0.2)) card.edition = rng.pick(['foil', 'holographic', 'polychrome']);
        if (rng.chance(0.2)) card.seal = rng.pick(['red', 'gold', 'blue', 'purple']);
        options.push({ kind: 'playing', ...card });
        break;
      }
      case 'Buffoon': {
        const j = run.rollJoker();
        if (j) {
          this_applyEdition(run, j);
          options.push({ kind: 'joker', ...j });
        } else {
          const j2 = run.buildJoker('Joker');
          options.push({ kind: 'joker', ...j2 });
        }
        break;
      }
      case 'Spectral': {
        const name = rng.pick(Object.keys(SPECTRALS));
        options.push({ kind: 'consumable', ...run.makeConsumable(name) });
        break;
      }
      default: break;
    }
  }
  // Hallucination: 1 in 2 chance to create a tarot when any pack is opened
  if (run.hasJoker('Hallucination') && rng.chance(0.5)) {
    run.createConsumable('Tarot');
  }
  return options;
}

function planetForHand(handId) {
  const map = {
    pair: 'Mercury', three_of_a_kind: 'Venus', full_house: 'Earth',
    four_of_a_kind: 'Mars', flush: 'Jupiter', straight: 'Saturn',
    two_pair: 'Uranus', straight_flush: 'Neptune', high_card: 'Pluto',
    flush_house: 'Ceres', flush_five: 'Eris', five_of_a_kind: 'Planet X',
  };
  return map[handId] || 'Pluto';
}
