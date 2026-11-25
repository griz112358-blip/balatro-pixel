// Playing card model, deck construction, card modifiers.

export const SUITS = ['H', 'D', 'C', 'S'];
export const SUIT_NAMES = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' };
export const SUIT_SYMBOL = { H: '♥', D: '♦', C: '♣', S: '♠' };
export const SUIT_COLOR = { H: 'red', D: 'red', C: 'black', S: 'black' };

// rank: 2..14 where 14 = Ace
export const RANK_LABEL = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
export const RANK_NAME = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven',
  8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

// Chip / mult values of a plain card.
export function rankChips(rank) {
  if (rank === 14) return 11; // Ace
  if (rank >= 11) return 10; // face cards
  return rank;
}
export function rankMult(rank) {
  if (rank >= 11) return 4; // J Q K
  if (rank === 14) return 4; // Ace
  if (rank === 10) return 4;
  if (rank >= 9) return 3;
  if (rank >= 7) return 2;
  return 1;
}
export function isFace(rank) {
  return rank >= 11 && rank <= 13;
}

/**
 * Is this card a "face card" for Joker purposes?
 * The Pareidolia joker makes every card count as a face card.
 */
export function isFaceCard(card, opts = {}) {
  if (opts.pareidolia) return true;
  const r = effectiveRank(card);
  return r != null && isFace(r);
}
export function isEven(rank) {
  return rank <= 13 ? rank % 2 === 0 : false; // Ace is odd
}
export function isOdd(rank) {
  return rank === 14 || (rank <= 13 && rank % 2 === 1);
}

export const ENHANCEMENTS = {
  bonus: { name: 'Bonus', text: '+30 Chips' },
  mult: { name: 'Mult', text: '+4 Mult' },
  glass: { name: 'Glass', text: 'X2 Mult, 1 in 4 chance to be destroyed' },
  steel: { name: 'Steel', text: 'X1.5 Mult while held in hand' },
  stone: { name: 'Stone', text: '+50 Chips, no rank or suit' },
  gold: { name: 'Gold', text: '$3 if held in hand at end of round' },
  lucky: { name: 'Lucky', text: '1 in 5 chance for +20 Mult, 1 in 15 chance to win $20' },
  wild: { name: 'Wild', text: 'Counts as any suit' },
};

export const SEALS = {
  red: { name: 'Red Seal', text: 'Retrigger this card 1 time' },
  gold: { name: 'Gold Seal', text: 'Earn $3 when this card is played and scores' },
  blue: { name: 'Blue Seal', text: 'Creates the Planet card for the final played hand of the round' },
  purple: { name: 'Purple Seal', text: 'Creates a Tarot card when discarded' },
};

export const EDITIONS = {
  foil: { name: 'Foil', text: '+50 Chips' },
  holographic: { name: 'Holographic', text: '+10 Mult' },
  polychrome: { name: 'Polychrome', text: 'X1.5 Mult' },
  negative: { name: 'Negative', text: '+1 Joker slot' },
  base: { name: 'Base', text: '' },
};

let cardCounter = 0;
export function makeCard(rank, suit, opts = {}) {
  cardCounter += 1;
  return {
    uid: cardCounter,
    rank,
    suit,
    enhancement: opts.enhancement || null,
    seal: opts.seal || null,
    edition: opts.edition || null,
    bonusChips: 0, // permanent +chips from Hiker etc.
    bonusMult: 0,
    faceDown: false,
    debuffed: false,
    forceSelected: false,
    // transient scoring state
    xMult: 1,
  };
}

export function cloneCard(card, opts = {}) {
  return {
    ...card,
    uid: cardCounter++,
    enhancement: opts.enhancement !== undefined ? opts.enhancement : card.enhancement,
    seal: opts.seal !== undefined ? opts.seal : card.seal,
    edition: opts.edition !== undefined ? opts.edition : card.edition,
    bonusChips: opts.bonusChips !== undefined ? opts.bonusChips : card.bonusChips,
    bonusMult: opts.bonusMult !== undefined ? opts.bonusMult : card.bonusMult,
  };
}

export function standardDeck() {
  const deck = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push(makeCard(r, s));
  return deck;
}

export function cardName(card) {
  if (!card) return '';
  return `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

/**
 * What kind of item this is: 'playing', 'joker', 'consumable' or 'voucher'.
 *
 * Shop and pack entries carry an explicit `kind`, and so do the cards the
 * player owns. Anything else has to be worked out from the item's own
 * fields: a consumable is recognisable by its type, a joker by its rarity.
 */
export function cardKind(item) {
  if (!item) return null;
  if (item.kind) return item.kind;
  if (item.type === 'Tarot' || item.type === 'Planet' || item.type === 'Spectral') {
    return 'consumable';
  }
  if (item.rarity !== undefined || item.sellBonus !== undefined) return 'joker';
  return null;
}

export function cardKey(card) {
  return `${card.rank}${card.suit}`;
}

// The effective rank a card counts as, honouring Stone cards (no rank).
export function effectiveRank(card) {
  if (card.enhancement === 'stone') return null;
  return card.rank;
}

// The effective suit a card counts as; Wild cards match every suit.
//
// With the Smeared Joker, Hearts and Diamonds count as the same suit, and
// Clubs and Spades count as the same suit.
export function matchesSuit(card, suit, opts = {}) {
  if (card.enhancement === 'stone') return false;
  if (card.enhancement === 'wild') return true;
  if (opts.smeared) {
    const group = (s) => (s === 'H' || s === 'D' ? 'HD' : 'CS');
    return group(card.suit) === group(suit);
  }
  return card.suit === suit;
}

/** All four suits a card can count as (Wild cards count as all of them). */
export function suitsOf(card) {
  if (card.enhancement === 'stone') return [];
  if (card.enhancement === 'wild') return SUITS.slice();
  return [card.suit];
}
