// Tags: run-long modifiers that are applied at the start of a shop.
//
// A Tag is rolled when the player enters a shop. It changes how that shop
// (and sometimes the whole run) behaves. Balatro has a fixed pool of tags;
// each one can appear at most once per run.

export const TAGS = {
  coupon: {
    name: 'Coupon Tag',
    desc: 'All cards and packs in the shop are free',
    apply(run, shop) {
      run.couponTagNextShop = true;
    },
  },
  double_tag: {
    name: 'Double Tag',
    desc: '+1 Reroll per shop',
    apply(run, shop) {
      shop.extraRerolls = (shop.extraRerolls || 0) + 1;
    },
  },
  d6_tag: {
    name: 'D6 Tag',
    desc: 'Rerolls are free',
    apply(run, shop) {
      shop.freeRerolls = true;
    },
  },
  gift_tag: {
    name: 'Gift Tag',
    desc: 'Gain a free Joker at the end of the shop',
    apply(run, shop) {
      shop.giftAtEnd = true;
    },
  },
  jumbo_tag: {
    name: 'Jumbo Tag',
    desc: '+1 card per pack',
    apply(run, shop) {
      shop.jumboPack = true;
    },
  },
  hologram_tag: {
    name: 'Hologram Tag',
    desc: 'Planet cards appear 3X more often in the shop',
    apply(run, shop) {
      shop.hologramTag = true;
    },
  },
  investment_tag: {
    name: 'Investment Tag',
    desc: 'Gain $5 at the end of the shop for every $5 you hold',
    apply(run, shop) {
      shop.investmentTag = true;
    },
  },
  voucher_tag: {
    name: 'Voucher Tag',
    desc: 'Add a Voucher to the shop',
    apply(run, shop) {
      shop.extraVoucher = true;
    },
  },
  boss_tag: {
    name: 'Boss Tag',
    desc: 'A Boss Blind appears after the Small Blind',
    apply(run, shop) {
      run.bossTag = true;
    },
  },
  anaglyph_tag: {
    name: 'Anaglyph Tag',
    desc: 'Cards have 2 copies of each enhancement and seal',
    apply(run, shop) {
      run.anaglyphTag = true;
      run.applyAnaglyphTag();
    },
  },
  rocket_tag: {
    name: 'Rocket Tag',
    desc: 'Planet cards appear more often and a Rocket may appear in the shop',
    apply(run, shop) {
      shop.rocketTag = true;
    },
  },
  uncommon_tag: {
    name: 'Uncommon Tag',
    desc: 'Uncommon Jokers appear more often in the shop',
    apply(run, shop) {
      shop.uncommonTag = true;
    },
  },
};

export const TAG_IDS = Object.keys(TAGS);

/**
 * Roll a tag for this shop. Tags never repeat within a run.
 * `chance` is the chance of a tag appearing at all (Balatro: 1 in 4).
 */
export function rollTag(run) {
  const pool = TAG_IDS.filter((id) => !run.tags.includes(id));
  if (!pool.length) return null;
  if (!run.rng.chance(1 / 4)) return null;
  const id = run.rng.pick(pool);
  run.tags.push(id);
  return id;
}

/** Apply a tag's effects to a freshly created shop. */
export function applyTag(run, shop, id) {
  const tag = TAGS[id];
  if (!tag) return null;
  tag.apply(run, shop);
  run.logMsg('log.tag', { tag: tag.name });
  return tag;
}
