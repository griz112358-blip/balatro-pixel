// Ante / Blind progression, score requirements, and the run state machine.

export const STAKES = [
  { id: 'white', name: 'White Stake', desc: 'Base difficulty' },
  { id: 'red', name: 'Red Stake', desc: 'Small Blind gives no reward money' },
  { id: 'green', name: 'Green Stake', desc: 'Required score scales faster for each Ante' },
  { id: 'black', name: 'Black Stake', desc: 'Shop can have Eternal Jokers' },
  { id: 'blue', name: 'Blue Stake', desc: '-1 Discard' },
  { id: 'purple', name: 'Purple Stake', desc: 'Required score scales faster for each Ante' },
  { id: 'orange', name: 'Orange Stake', desc: 'Shop can have Perishable Jokers' },
  { id: 'gold', name: 'Gold Stake', desc: 'Shop can have Rental Jokers' },
];

// Base chip requirement per ante, indexed by stake tier:
//   0 = White (and Red), 1 = Green (and Black), 2 = Purple (and above)
export const ANTE_BASE = {
  0: [100, 300, 800, 2000, 5000, 11000, 20000, 35000, 50000],
  1: [100, 300, 900, 2600, 8000, 20000, 36000, 60000, 100000],
  2: [100, 300, 1000, 3200, 9000, 25000, 60000, 110000, 200000],
};

// Extended ante requirements (endless mode) from the wiki's Module:Ante Table.
export const ANTE_BASE_EXTENDED = {
  0: [110000, 560000, 7200000, 300000000, 47000000000, 2.9e13, 7.7e16, 8.6e20,
      4.2e25, 9.2e30, 9.2e36, 4.3e43, 9.7e50, 1.0e59, 5.8e67, 1.6e77,
      2.4e87, 1.9e98, 8.4e109, 2.0e122, 2.7e135, 2.1e149, 9.9e163,
      2.7e179, 4.4e195, 4.4e212, 2.8e230, 1.1e249, 2.7e268, 4.5e288],
  1: [230000, 1100000, 14000000, 600000000, 94000000000, 5.8e13, 1.5e17, 1.7e21,
      8.4e25, 1.8e31, 1.8e37, 8.6e43, 1.9e51, 2.1e59, 1.1e68, 3.3e77,
      4.9e87, 3.9e98, 1.6e110, 4.0e122, 5.5e135, 4.3e149, 1.9e164,
      5.4e179, 8.9e195, 8.9e212, 5.6e230, 2.2e249, 5.5e268, 9.0e288],
  2: [460000, 2200000, 29000000, 1.2e9, 1.8e11, 1.1e14, 3.0e17, 3.4e21,
      1.6e26, 3.7e31, 3.7e37, 1.7e44, 3.8e51, 4.2e59, 2.3e68, 6.6e77,
      9.8e87, 7.8e98, 3.3e110, 8.1e122, 1.1e136, 8.6e149, 3.9e164,
      1.0e180, 1.7e196, 1.7e213, 1.1e231, 4.4e249, 1.1e269, 1.8e289],
};

export const STAKE_TIER = {
  white: 0, red: 0, green: 1, black: 1, blue: 1, purple: 2, orange: 2, gold: 2,
};

/** Base chip requirement for an ante at a given stake. */
export function anteBase(ante, stakeId) {
  const tier = STAKE_TIER[stakeId] ?? 0;
  if (ante <= 8) return ANTE_BASE[tier][ante];
  const idx = ante - 9;
  const ext = ANTE_BASE_EXTENDED[tier];
  if (idx < ext.length) return ext[idx];
  // Endless fallback: the wiki's formula
  const a8 = ANTE_BASE[tier][8];
  const v = a8 * Math.pow(1.6 + Math.pow(0.75 * (ante - 8), 1 + 0.2 * (ante - 8)), ante - 8);
  return v;
}

/** Score needed to beat a blind. */
export function blindScore(ante, stakeId, multiplier = 1, plasma = false) {
  let base = anteBase(ante, stakeId);
  if (plasma) base *= 2;
  return Math.floor(base * multiplier);
}

// ---------------------------------------------------------------------------
// Boss blinds

export const BOSS_BLINDS = [
  { id: 'the_hook', name: 'The Hook', minAnte: 1, mult: 2, reward: 5, matador: false,
    desc: 'Discards 2 random cards per hand played' },
  { id: 'the_ox', name: 'The Ox', minAnte: 6, mult: 2, reward: 5, matador: true,
    desc: 'Playing your most played hand sets money to $0' },
  { id: 'the_house', name: 'The House', minAnte: 2, mult: 2, reward: 5, matador: false,
    desc: 'First hand is drawn face down' },
  { id: 'the_wall', name: 'The Wall', minAnte: 2, mult: 4, reward: 5, matador: false,
    desc: 'Extra large blind' },
  { id: 'the_wheel', name: 'The Wheel', minAnte: 2, mult: 2, reward: 5, matador: false,
    desc: '1 in 7 cards get drawn face down' },
  { id: 'the_arm', name: 'The Arm', minAnte: 2, mult: 2, reward: 5, matador: true,
    desc: 'Decrease level of played poker hand' },
  { id: 'the_club', name: 'The Club', minAnte: 1, mult: 2, reward: 5, matador: true,
    desc: 'All Club cards are debuffed' },
  { id: 'the_fish', name: 'The Fish', minAnte: 2, mult: 2, reward: 5, matador: false,
    desc: 'Cards drawn face down after each hand played' },
  { id: 'the_psychic', name: 'The Psychic', minAnte: 1, mult: 2, reward: 5, matador: true,
    desc: 'Must play 5 cards' },
  { id: 'the_goad', name: 'The Goad', minAnte: 1, mult: 2, reward: 5, matador: true,
    desc: 'All Spade cards are debuffed' },
  { id: 'the_water', name: 'The Water', minAnte: 2, mult: 2, reward: 5, matador: false,
    desc: 'Start with 0 discards' },
  { id: 'the_window', name: 'The Window', minAnte: 1, mult: 2, reward: 5, matador: true,
    desc: 'All Diamond cards are debuffed' },
  { id: 'the_manacle', name: 'The Manacle', minAnte: 1, mult: 2, reward: 5, matador: false,
    desc: '-1 Hand Size' },
  { id: 'the_eye', name: 'The Eye', minAnte: 3, mult: 2, reward: 5, matador: true,
    desc: 'No repeat hand types this round' },
  { id: 'the_mouth', name: 'The Mouth', minAnte: 2, mult: 2, reward: 5, matador: true,
    desc: 'Play only 1 hand type this round' },
  { id: 'the_plant', name: 'The Plant', minAnte: 4, mult: 2, reward: 5, matador: true,
    desc: 'All face cards are debuffed' },
  { id: 'the_serpent', name: 'The Serpent', minAnte: 5, mult: 2, reward: 5, matador: false,
    desc: 'After Play or Discard, always draw 3 cards' },
  { id: 'the_pillar', name: 'The Pillar', minAnte: 1, mult: 2, reward: 5, matador: true,
    desc: 'Cards played previously this Ante are debuffed' },
  { id: 'the_needle', name: 'The Needle', minAnte: 2, mult: 1, reward: 5, matador: false,
    desc: 'Play only 1 hand' },
  { id: 'the_head', name: 'The Head', minAnte: 1, mult: 2, reward: 5, matador: true,
    desc: 'All Heart cards are debuffed' },
  { id: 'the_tooth', name: 'The Tooth', minAnte: 3, mult: 2, reward: 5, matador: false,
    desc: 'Lose $1 per card played' },
  { id: 'the_flint', name: 'The Flint', minAnte: 2, mult: 2, reward: 5, matador: true,
    desc: 'Base Chips and Mult are halved' },
  { id: 'the_mark', name: 'The Mark', minAnte: 2, mult: 2, reward: 5, matador: false,
    desc: 'All face cards are drawn face down' },
];

export const SHOWDOWN_BLINDS = [
  { id: 'amber_acorn', name: 'Amber Acorn', minAnte: 8, mult: 2, reward: 8, matador: false,
    desc: 'Flips and shuffles all Joker cards' },
  { id: 'verdant_leaf', name: 'Verdant Leaf', minAnte: 8, mult: 2, reward: 8, matador: true,
    desc: 'All cards debuffed until 1 Joker sold' },
  { id: 'violet_vessel', name: 'Violet Vessel', minAnte: 8, mult: 6, reward: 8, matador: false,
    desc: 'Very large blind' },
  { id: 'crimson_heart', name: 'Crimson Heart', minAnte: 8, mult: 2, reward: 8, matador: false,
    desc: 'One random Joker disabled every hand' },
  { id: 'cerulean_bell', name: 'Cerulean Bell', minAnte: 8, mult: 2, reward: 8, matador: false,
    desc: 'Forces 1 card to always be selected' },
];

export const BLIND_BY_ID = Object.fromEntries(
  [...BOSS_BLINDS, ...SHOWDOWN_BLINDS].map((b) => [b.id, b]),
);

export const BLIND_TYPE = {
  small: { name: 'Small Blind', mult: 1, reward: 3, desc: 'Beat the blind for a smaller reward' },
  big: { name: 'Big Blind', mult: 1.5, reward: 4, desc: 'Beat the blind for a bigger reward, but a harder score' },
  boss: { name: 'Boss Blind', mult: 2, reward: 5, desc: '' },
};

/** Pick a boss blind, preferring the least recently used ones. */
export function pickBossBlind(rng, ante, seenBosses, showdown = false) {
  const pool = (showdown ? SHOWDOWN_BLINDS : BOSS_BLINDS).filter((b) => ante >= b.minAnte);
  if (!pool.length) return (showdown ? SHOWDOWN_BLINDS : BOSS_BLINDS)[0];
  // Only bosses with the fewest appearances so far are eligible.
  const counts = pool.map((b) => seenBosses[b.id] || 0);
  const min = Math.min(...counts);
  const eligible = pool.filter((b) => (seenBosses[b.id] || 0) === min);
  return rng.pick(eligible);
}
