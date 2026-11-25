// Card values: what things cost in the shop and what they sell for.
//
// The rules come from balatrowiki.org ("The Shop"):
//   buy_cost   = round_half_down((base_cost + edition_cost) * discount)
//   sell_value = floor(buy_cost / 2), and never below $1
// The Egg and Gift Card jokers add to the sell value after all of that, and
// their extra value is not touched by the discount vouchers.
//
// This module deliberately imports nothing, so the engine can ask "what is
// this worth?" from anywhere without creating a cycle.

/** What each edition adds to the price of a card. */
export const EDITION_COST = {
  foil: 2,
  holographic: 3,
  polychrome: 5,
  negative: 5,
};

/**
 * Round half down, the way Balatro rounds shop prices: 8.5 becomes 8 and
 * 8.6 becomes 9.
 */
export function roundHalfDown(n) {
  const floor = Math.floor(n);
  return n - floor > 0.5 ? floor + 1 : floor;
}

/** The discount the Clearance Sale and Liquidation vouchers apply. */
export function shopDiscount(run) {
  if (run.hasVoucher('Liquidation')) return 0.5;
  if (run.hasVoucher('Clearance Sale')) return 0.75;
  return 1;
}

/** The price of an item before the discount, edition cost included. */
export function baseCost(item) {
  let base = item.price ?? 0;
  base += EDITION_COST[item.edition] ?? 0;
  // The Rental Sticker makes the joker cost $1.
  if (item.rental) base = 1;
  return base;
}

/**
 * What the item costs in the shop right now.
 *
 * The shop-only specials (the Coupon Tag, Astronomer) are left out on
 * purpose: they decide what the shop charges, not what a card you already
 * own is worth.
 */
export function itemCost(run, item) {
  const cost = roundHalfDown(baseCost(item) * shopDiscount(run));
  return cost <= 0 ? 1 : cost;
}

/**
 * What the player gets for selling this item.
 *
 * A card sells for half of what it costs, and the Egg and Gift Card jokers
 * add their extra value on top of that. The extra value is added last, so a
 * discount voucher never takes it away.
 */
export function computeSellValue(run, item) {
  let value = Math.floor(itemCost(run, item) / 2);
  if (value <= 0) value = 1;
  return value + (item.sellBonus || 0);
}
