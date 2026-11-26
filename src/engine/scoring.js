// Scoring pipeline, following Balatro's documented Activation Sequence:
//  1. Boss blind effects
//  2. 'On Played' jokers
//  3. Played cards scoring (left to right): base chips -> card modifiers
//     -> 'On Scored' jokers -> retriggers
//  4. Held in hand abilities: Steel enhancements -> 'On Held' jokers -> retriggers
//  5. Joker editions + 'Independent' jokers
//  6. Consumables (Observatory)
//  7. Plasma deck balancing
//
// Every step records what it contributed to the score, in the order it
// happened, so the interface can show the whole calculation - which cards
// scored, how much mult each of them added and how the total was reached -
// instead of just the result.

import { evaluateHand, handLevelValues, containedHands, HAND_BY_ID } from './hands.js';
import {
  rankChips, rankMult, isFace, effectiveRank, matchesSuit, SUITS,
} from './cards.js';
import { JOKERS } from './jokers.js';

export function scoreHand(state, playedCards) {
  const opts = {
    fourFingers: state.hasJoker('Four Fingers'),
    shortcut: state.hasJoker('Shortcut'),
    splash: state.hasJoker('Splash'),
  };
  const ev = evaluateHand(playedCards, opts);
  if (!ev) return null;

  const handId = ev.id;
  const contained = containedHands(handId);

  const ctx = {
    state,
    hand: ev,
    handId,
    contained,
    chips: 0,
    mult: 0,
    money: 0,
    xMult: 1,
    played: playedCards,
    scoredCards: [],
    events: [],
    log: [],
    steps: [],    // the breakdown, in the order it happened
    mulSteps: [], // every multiplier that was applied
  };

  // Every multiplier goes through here, so that flat bonuses and
  // multiplicative effects stay apart in the breakdown. A factor of zero
  // counts (Ride the Bus starts at zero) - only a factor of one is a no-op.
  ctx.xMult = (factor) => {
    if (factor === undefined || factor === null || factor === 1) return;
    const before = ctx.mult;
    ctx.mult = ctx.mult * factor;
    ctx.mulSteps.push({ before, after: ctx.mult, factor });
  };

  // --- 1. Boss blind effects
  const boss = state.currentBoss;
  const bossActive = !!(boss && state.bossActive && !state.bossDisabled);
  if (bossActive) {
    applyBossEffects(state, ctx, boss);
  }

  // --- hand base values
  const level = state.handLevels[handId] || 1;
  let base = handLevelValues(handId, level);
  if (bossActive && boss.id === 'the_flint') {
    // The Flint halves the chips and mult of the played hand.
    base = { chips: Math.floor(base.chips / 2), mult: Math.floor(base.mult / 2) };
  }
  ctx.chips += base.chips;
  ctx.mult += base.mult;
  ctx.log.push(`${HAND_BY_ID[handId].name} (level ${level}): ${base.chips} x ${base.mult}`);
  ctx.steps.push({
    kind: 'base', handId, handName: HAND_BY_ID[handId].name, level,
    chips: base.chips, mult: base.mult, factors: [],
    totals: { chips: ctx.chips, mult: ctx.mult },
  });

  // --- 2. 'On Played' jokers
  for (const joker of state.jokers) {
    if (joker.debuffed || joker.disabledThisHand) continue;
    const def = JOKERS[joker.name];
    if (!def) continue;
    if (def.activation === 'onPlayed') { ctx.joker = joker; def.fn(state, ctx, joker); }
  }

  // Jokers with a separate independent pass (scaling chips, etc).
  for (const joker of state.jokers) {
    if (joker.debuffed || joker.disabledThisHand) continue;
    const def = JOKERS[joker.name];
    if (!def || !def.independentFn) continue;
    ctx.joker = joker;
    const cBefore = snap(ctx);
    const mulStart = ctx.mulSteps.length;
    def.independentFn(state, ctx, joker);
    finishStep(ctx, cBefore, mulStart, { kind: 'joker', name: joker.name });
  }

  // Determine which cards actually score.
  let scored;
  if (opts.splash) {
    scored = playedCards.slice();
  } else {
    scored = ev.cards.slice();
  }
  ctx.scoredCards = scored;
  state.lastScoredCards = scored;

  // --- 3. Played cards scoring
  for (const card of scored) {
    if (card.debuffed) continue;
    scoreCard(state, ctx, card, 'played');
  }

  // --- 4. Held in hand abilities
  // Held cards are walked from left to right and each one triggers the
  // abilities that belong to it. The order matters: a card with a X1.5
  // multiplier has to sit to the right of the card that adds Mult, otherwise
  // that Mult is not multiplied.
  const held = state.hand.filter((c) => !playedCards.includes(c));
  for (const card of held) {
    if (card.debuffed) continue;
    const retrig = retriggerCount(state, card, 'held', ctx);
    if (card.enhancement === 'steel') {
      const cBefore = snap(ctx);
      const mulStart = ctx.mulSteps.length;
      for (let i = 0; i <= retrig; i++) ctx.xMult(1.5);
      finishStep(ctx, cBefore, mulStart, { kind: 'held', card });
    }
    for (const joker of state.jokers) {
      if (joker.debuffed || joker.disabledThisHand) continue;
      const def = JOKERS[joker.name];
      if (!def) continue;
      if (def.activation === 'onHeld') {
        ctx.joker = joker;
        if (!applyJoker(state, ctx, joker, card)) continue;
        // A retrigger (Mime, Red Seal) fires the held ability once more.
        for (let i = 0; i < retrig; i++) {
          ctx.joker = joker;
          applyJoker(state, ctx, joker, card);
        }
      }
    }
  }

  // --- 5. Joker editions + 'Independent' jokers
  for (const joker of state.jokers) {
    if (joker.debuffed || joker.disabledThisHand) continue;
    if (joker.edition !== 'foil' && joker.edition !== 'holographic') continue;
    const cBefore = snap(ctx);
    if (joker.edition === 'foil') ctx.chips += 50;
    else ctx.mult += 10;
    finishStep(ctx, cBefore, ctx.mulSteps.length, {
      kind: 'joker', name: joker.name, edition: joker.edition,
    });
  }
  for (const joker of state.jokers) {
    if (joker.debuffed || joker.disabledThisHand) continue;
    const def = JOKERS[joker.name];
    if (!def) continue;
    if (def.activation === 'independent') {
      ctx.joker = joker;
      const cBefore = snap(ctx);
      const mulStart = ctx.mulSteps.length;
      // A joker may explain its own number (the Green Joker counts hands and
      // discards). The engine stays language neutral: it only names the note.
      ctx.note = null;
      def.fn(state, ctx, joker);
      const note = ctx.note;
      ctx.note = null;
      finishStep(ctx, cBefore, mulStart, { kind: 'joker', name: joker.name, note });
    }
  }
  // onOtherJokers (Baseball Card) — after independents
  for (const joker of state.jokers) {
    if (joker.debuffed || joker.disabledThisHand) continue;
    const def = JOKERS[joker.name];
    if (!def) continue;
    if (def.activation === 'onOtherJokers') {
      ctx.joker = joker;
      applyJoker(state, ctx, joker);
    }
  }
  // Polychrome joker editions last
  for (const joker of state.jokers) {
    if (joker.debuffed || joker.disabledThisHand) continue;
    if (joker.edition !== 'polychrome') continue;
    const cBefore = snap(ctx);
    const mulStart = ctx.mulSteps.length;
    ctx.xMult(1.5);
    finishStep(ctx, cBefore, mulStart, {
      kind: 'joker', name: joker.name, edition: 'polychrome',
    });
  }

  // --- 6. Consumables: Observatory gives Planet cards X1.5
  if (state.hasVoucher('Observatory')) {
    const cBefore = snap(ctx);
    const mulStart = ctx.mulSteps.length;
    ctx.xMult(1.5);
    finishStep(ctx, cBefore, mulStart, { kind: 'voucher', name: 'Observatory' });
  }

  // --- 7. Plasma balancing
  let chips = ctx.chips;
  let mult = ctx.mult;
  if (state.deck.plasma) {
    // The Plasma Deck balances chips and mult: both become their average.
    const avg = (chips + mult) / 2;
    chips = avg;
    mult = avg;
    ctx.steps.push({
      kind: 'plasma', chips: 0, mult: 0, factors: [],
      totals: { chips, mult },
    });
  }

  const score = Math.floor(chips * mult);
  return {
    handId,
    handName: HAND_BY_ID[handId].name,
    level,
    chips,
    mult,
    score,
    scoredCards: ctx.scoredCards,
    money: ctx.money,
    log: ctx.log,
    breakdown: {
      handId,
      handName: HAND_BY_ID[handId].name,
      level,
      steps: ctx.steps,
      chips,
      mult,
      score,
    },
  };
}

/**
 * Record what a block of scoring contributed.
 *
 * `mulStart` marks where the multiplier log stood before the block ran, so
 * the multipliers it applied can be listed apart from the flat bonuses.
 *
 * A block that changed nothing is not recorded: an ability that is checked
 * against every card in hand (Raised Fist, Baron, ...) runs once per card,
 * and only the card it actually belongs to gives anything. Those empty runs
 * would only clutter the breakdown.
 */
function finishStep(ctx, snap, mulStart, step) {
  let extra = 0;
  const factors = [];
  for (let i = mulStart; i < ctx.mulSteps.length; i++) {
    const s = ctx.mulSteps[i];
    extra += s.after - s.before;
    factors.push(s.factor);
  }
  step.chips = ctx.chips - snap.chips;
  step.mult = (ctx.mult - snap.mult) - extra;
  step.money = ctx.money - snap.money;
  step.factors = factors;
  step.totals = { chips: ctx.chips, mult: ctx.mult };
  if (!step.chips && !step.mult && !step.money && !factors.length) return step;
  ctx.steps.push(step);
  return step;
}

/** Snapshot of the running totals, for measuring what a block contributed. */
function snap(ctx) {
  return { chips: ctx.chips, mult: ctx.mult, money: ctx.money };
}

/**
 * Run a joker's effect and record what it added.
 *
 * Returns false when the joker reports that its ability did not trigger, which
 * keeps a retrigger (Mime, Red Seal) from firing an ability that never went
 * off.
 */
function applyJoker(state, ctx, joker, card) {
  const def = JOKERS[joker.name];
  if (!def) return false;
  const cBefore = snap(ctx);
  const mulStart = ctx.mulSteps.length;
  const triggered = def.fn(state, ctx, joker, card);
  finishStep(ctx, cBefore, mulStart, {
    kind: 'joker', name: joker.name, activation: def.activation,
  });
  return triggered !== false;
}

function retriggerCount(state, card, phase, ctx) {
  let n = 0;
  if (card.seal === 'red') n += 1;
  for (const joker of state.jokers) {
    if (joker.debuffed || joker.disabledThisHand) continue;
    const def = JOKERS[joker.name];
    if (!def || !def.retriggers) continue;
    if (def.retriggers(state, card, phase, ctx)) n += 1;
  }
  // Mime retriggers every held-in-hand card ability.
  if (phase === 'held' && state.hasJoker('Mime')) n += 1;
  return n;
}

function scoreCard(state, ctx, card, phase) {
  const retrig = retriggerCount(state, card, phase, ctx);
  const cBefore = snap(ctx);
  const mulStart = ctx.mulSteps.length;
  const notes = [];
  for (let r = 0; r <= retrig; r++) {
    // base effect
    const rank = effectiveRank(card);
    let baseChips = 0;
    let baseMult = 0;
    if (card.enhancement === 'stone') {
      baseChips += 50; // Stone cards have no rank
      notes.push('stone');
    } else {
      baseChips += rankChips(rank);
      baseMult += rankMult(rank);
    }
    baseChips += card.bonusChips || 0;
    baseMult += card.bonusMult || 0;
    ctx.chips += baseChips;
    ctx.mult += baseMult;

    // card modifiers: enhancements -> seals -> editions
    if (card.enhancement === 'bonus') { ctx.chips += 30; notes.push('bonus'); }
    else if (card.enhancement === 'mult') { ctx.mult += 4; notes.push('mult'); }
    else if (card.enhancement === 'glass') { ctx.xMult(2); notes.push('glass'); }
    else if (card.enhancement === 'lucky') {
      notes.push('lucky');
      if (state.chance(1 / 5)) {
        ctx.mult += 20;
        ctx.events.push('Lucky: +20 Mult');
        state.onLuckyTriggered();
      }
      if (state.chance(1 / 15)) { ctx.money += 20; ctx.events.push('Lucky: +$20'); }
    }
    if (card.seal === 'gold') {
      ctx.money += 3;
      ctx.events.push('Gold Seal: +$3');
      notes.push('goldSeal');
    }
    if (card.seal === 'red') notes.push('redSeal');
    if (card.edition === 'foil') { ctx.chips += 50; notes.push('foil'); }
    else if (card.edition === 'holographic') { ctx.mult += 10; notes.push('holographic'); }
    else if (card.edition === 'polychrome') { ctx.xMult(1.5); notes.push('polychrome'); }

    // 'On Scored' jokers
    for (const joker of state.jokers) {
      if (joker.debuffed || joker.disabledThisHand) continue;
      const def = JOKERS[joker.name];
      if (!def) continue;
      if (def.activation === 'onScored') { ctx.joker = joker; def.fn(state, ctx, joker, card); }
    }
  }
  finishStep(ctx, cBefore, mulStart, {
    kind: 'card', card, notes, retriggers: retrig,
  });
}

function applyBossEffects(state, ctx, boss) {
  switch (boss.id) {
    case 'the_arm': {
      const lvl = state.handLevels[ctx.handId] || 1;
      if (lvl > 1) {
        state.handLevels[ctx.handId] = lvl - 1;
        ctx.log.push(`The Arm: ${HAND_BY_ID[ctx.handId].name} level ${lvl} -> ${lvl - 1}`);
        state.bossTriggeredThisHand = true;
      }
      break;
    }
    case 'the_ox': {
      const most = state.mostPlayedHand();
      if (most && ctx.handId === most) {
        state.money = 0;
        ctx.log.push(`The Ox: ${HAND_BY_ID[ctx.handId].name} is your most played hand - money reset to $0`);
        state.bossTriggeredThisHand = true;
      }
      break;
    }
    default: break;
  }
}

export { containedHands };
