// Balatro Pixel - main game loop and UI.
//
// Screens:
//   menu        - title screen: pick deck, stake, start a run
//   blind       - blind select: choose small/big blind or skip
//   play        - the main gameplay screen
//   beat        - blind defeated: score breakdown and rewards
//   shop        - shop between blinds
//   pack        - booster pack: choose cards
//   gameover    - run lost
//   win         - run won (ante 8 boss beaten)
//
// The canvas is a low-resolution 428x240 buffer scaled up 3x with
// nearest-neighbour filtering, giving a genuine pixel-art look.

import {
  W, H, SCALE, PALETTE, makeCanvas, setupSurface, rect, frame, panel, roundRect, text, wrapText,
  drawCard, drawJokerCard, formatNumber, CARD_W, CARD_H, JOKER_W, JOKER_H,
  wrapName, chunk, hasCJK, displayName, cardKind, measure, fitText, CJK_MIN,
} from './pixel.js';
import { Run, DECKS } from '../engine/run.js';
import { STAKES } from '../engine/blinds.js';
import { HANDS, HAND_BY_ID, evaluateHand, handLevelValues } from '../engine/hands.js';
import {
  createShop, buyCard, buyPack, takeFromPack, sellCard, buyVoucherItem,
  rerollShop, computeBuyCost, computeSellValue, openPack, closeShop,
} from '../engine/shop.js';
import { TARGET_TAROTS, TARGET_SPECTRALS, PLANETS } from '../engine/consumables.js';
import { jokerTarget } from '../engine/jokers.js';
import { JOKER_DATA } from '../data/jokers.js';
import { jokerDescription } from '../data/descriptions.js';
import { TAGS } from '../engine/tags.js';
import { SFX, toggleMute, isMuted, unlockAudio } from './sound.js';
import { t, tf, name, effect, desc, msg, err, getLang, setLang, toggleLang, num } from './i18n.js';
import { ENHANCEMENTS, SEALS, EDITIONS, RANK_LABEL, SUIT_SYMBOL, SUIT_NAMES, cardName } from '../engine/cards.js';

const JOKER_META = Object.fromEntries(JOKER_DATA.map((j) => [j.name, j]));

// ---------------------------------------------------------------------------
// Small helpers

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Text size.
 *
 * Chinese glyphs are denser than Latin ones, so they need a little more
 * room before they turn to mush. Everything else keeps the Latin size.
 */
function cn() { return getLang() === 'zh'; }
function cs(size, min = 0) { return cn() ? Math.max(size, min, CJK_MIN) : size; }

function centerText(ctx, str, cx, y, color = PALETTE.white, size = 8) {
  text(ctx, str, Math.round(cx), y, color, size, 'center');
}

/** A clickable rectangular region. */
class Button {
  constructor(x, y, w, h, label, onClick, opts = {}) {
    Object.assign(this, { x, y, w, h, label, onClick });
    this.color = opts.color || PALETTE.panel;
    this.border = opts.border || PALETTE.panelLight;
    this.textColor = opts.textColor || PALETTE.white;
    this.size = opts.size || cs(8);
    this.disabled = !!opts.disabled;
    // A small note in the bottom-right corner, e.g. the price of a reroll.
    // Key hints are not repeated here: the bar under the canvas lists them.
    this.sub = opts.sub || null;
    this.hidden = !!opts.hidden;
    // Ghost buttons are invisible hit areas (cards, jokers, shop items).
    this.ghost = !!opts.ghost;
  }

  contains(px, py) {
    return !this.disabled && !this.hidden && px >= this.x && px < this.x + this.w
      && py >= this.y && py < this.y + this.h;
  }

  draw(ctx) {
    if (this.hidden || this.ghost) return;
    const fill = this.disabled ? PALETTE.panelDark : this.color;
    panel(ctx, this.x, this.y, this.w, this.h, fill, this.border);
    // With a corner note the label sits at the top of the button and the
    // note in the opposite corner, so the two never collide.
    const ty = this.sub
      ? this.y + 1
      : this.y + Math.floor((this.h - this.size) / 2);
    centerText(ctx, this.label, this.x + this.w / 2, ty,
      this.disabled ? PALETTE.grey : this.textColor, this.size);
    if (this.sub) {
      text(ctx, this.sub, this.x + this.w - 4, this.y + this.h - 9,
        this.disabled ? PALETTE.grey : PALETTE.yellow, 6, 'right');
    }
  }
}

/** A very small icon-ish badge, e.g. the money counter. */
function badge(ctx, x, y, label, value, color = PALETTE.yellow) {
  const w = 62;
  panel(ctx, x, y, w, 16, PALETTE.panelDark, PALETTE.outline);
  text(ctx, label, x + 4, y + 3, PALETTE.grey, cs(6));
  text(ctx, value, x + w - 4, y + 3, color, cs(8), 'right');
}

// ---------------------------------------------------------------------------

class Game {
  constructor(root, existingCanvas) {
    this.root = root;
    this.canvas = existingCanvas || makeCanvas();
    if (!existingCanvas) {
      root.appendChild(this.canvas);
    }
    this.ctx = setupSurface(this.canvas, SCALE, window.devicePixelRatio || 1);
    this.ctx.imageSmoothingEnabled = false;

    this.screen = 'menu';
    this.buttons = [];
    this.mouse = { x: -1, y: -1, down: false };
    this.run = null;
    this.selection = [];
    this.toast = null;
    this.toastTimer = 0;
    this.toastGood = true;
    this.anim = 0;
    this.flash = 0;

    // Menu state
    this.deckIndex = 0;
    this.stakeIndex = 0;
    this.seed = Math.floor(Math.random() * 1e9);

    // Shop / pack state
    this.pack = null;
    this.packSelection = [];

    // Interaction state
    this.detail = null;      // { title, lines[], kind }
    this.armed = null;       // consumable waiting for a target
    this.paused = false;
    this.handsOpen = false;  // the overview of all poker hand levels
    this.lastResult = null;
    this.hover = null;
    this.manualScale = 0;    // 0 = fit the window automatically
    this.scale = SCALE;

    this.bindEvents();
    this.renderHint();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /**
   * Resize the render surface.
   *
   * The canvas is a supersampled buffer: its backing store holds SS*DPR
   * device pixels for every logical pixel, so the game is drawn 1:1 with the
   * screen and every pixel block is square. SS is the largest whole multiple
   * that still fits the window, which keeps the artwork crisp and makes the
   * Chinese text legible.
   * Press '+' / '-' to step through the multiples and '0' to go back to the
   * automatic fit.
   */
  /** The key hints under the canvas, in the current language. */
  renderHint() {
    const hint = document.getElementById('hint');
    if (!hint) return;
    const kbd = (k) => `<kbd>${k}</kbd>`;
    hint.innerHTML = [
      `${kbd(t('ui.hint.mouse'))} ${t('ui.hint.select')}`,
      `${kbd('1')} ${t('ui.hint.discard')}`,
      `${kbd('2')} ${t('ui.hint.play')}`,
      `${kbd('H')} ${t('ui.hint.hands')}`,
      `${kbd('Esc')} ${t('ui.hint.pause')}`,
      `${kbd('M')} ${t('ui.hint.mute')}`,
      `${kbd('L')} ${t('ui.hint.lang')}`,
      `${kbd('+')}/${kbd('-')} ${t('ui.hint.zoom')}`,
      `${kbd('R')} ${t('ui.hint.menu')}`,
    ].join(' &nbsp;·&nbsp; ');
  }

  resize() {
    const hint = document.getElementById('hint');
    const reserve = hint ? hint.offsetHeight + 34 : 48;
    const fit = Math.min(
      (window.innerWidth - 16) / W,
      (window.innerHeight - reserve) / H,
    );
    let ss = this.manualScale || Math.floor(fit);
    ss = clamp(ss, 1, 6);
    this.scale = ss;
    this.ctx = setupSurface(this.canvas, ss, window.devicePixelRatio || 1);
  }

  // ---- events ---------------------------------------------------------

  bindEvents() {
    const c = this.canvas;
    // The canvas can sit on a half-pixel offset, so the converted coordinate is
    // rounded: otherwise the top row of a button becomes unclickable.
    const toPixel = (ev) => {
      const r = c.getBoundingClientRect();
      return {
        x: Math.round((ev.clientX - r.left) * (W / r.width)),
        y: Math.round((ev.clientY - r.top) * (H / r.height)),
      };
    };
    c.addEventListener('mousemove', (ev) => {
      const p = toPixel(ev);
      this.mouse.x = p.x; this.mouse.y = p.y;
    });
    c.addEventListener('mouseleave', () => {
      this.mouse.x = -1; this.mouse.y = -1;
    });
    c.addEventListener('mousedown', (ev) => {
      const p = toPixel(ev);
      this.mouse.down = true;
      unlockAudio();
      this.onClick(p.x, p.y);
    });
    c.addEventListener('mouseup', () => { this.mouse.down = false; });
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
    window.addEventListener('keydown', (ev) => {
      unlockAudio();
      this.onKey(ev);
    });
  }

  onClick(x, y) {
    // The score breakdown is modal: any click closes it.
    if (this.scoreBreakdown) { this.scoreBreakdown = null; return; }
    // The detail overlay is modal: only its own buttons (registered last) respond.
    const from = this.detail ? this.buttons.length - 2 : 0;
    for (let i = this.buttons.length - 1; i >= from; i--) {
      const b = this.buttons[i];
      if (b.contains(x, y)) { b.onClick(); return; }
    }
    if (this.detail) return;
  }

  onKey(ev) {
    const k = ev.key.toLowerCase();
    if (this.scoreBreakdown) {
      if (k === 'escape' || k === 'enter' || k === ' ') this.scoreBreakdown = null;
      ev.preventDefault();
      return;
    }
    if (this.detail) {
      if (k === 'escape' || k === 'enter') this.detail = null;
      ev.preventDefault();
      return;
    }
    if (this.handsOpen) {
      if (k === 'escape' || k === 'enter' || k === ' ' || k === 'h') this.handsOpen = false;
      ev.preventDefault();
      return;
    }
    if (k === 'escape') {
      if (this.screen === 'play') this.paused = !this.paused;
      ev.preventDefault();
      return;
    }
    if (k === 'm') {
      const on = toggleMute();
      this.showToast(on ? t('ui.soundOn') : t('ui.soundOff'));
      ev.preventDefault();
      return;
    }
    if (k === 'l') {
      const lang = toggleLang();
      this.renderHint();
      this.showToast(lang === 'zh' ? t('ui.languageChinese') : t('ui.languageEnglish'));
      ev.preventDefault();
      return;
    }
    if (k === '+' || k === '=' || k === '-' || k === '0') {
      if (k === '0') this.manualScale = 0;
      else {
        const step = k === '+' || k === '=' ? 1 : -1;
        const cur = this.manualScale || this.scale;
        this.manualScale = Math.max(1, Math.min(6, cur + step));
      }
      this.resize();
      ev.preventDefault();
      return;
    }
    if (this.screen === 'menu') {
      if (k === 'arrowleft') { this.deckIndex = (this.deckIndex + DECK_NAMES.length - 1) % DECK_NAMES.length; }
      if (k === 'arrowright') { this.deckIndex = (this.deckIndex + 1) % DECK_NAMES.length; }
      if (k === 'arrowup') { this.stakeIndex = (this.stakeIndex + STAKES.length - 1) % STAKES.length; }
      if (k === 'arrowdown') { this.stakeIndex = (this.stakeIndex + 1) % STAKES.length; }
      if (k === 'enter' || k === ' ') { this.startRun(); }
      ev.preventDefault();
      return;
    }
    if (this.screen === 'play') {
      if (this.paused) {
        if (k === 'q') this.toMenu();
        ev.preventDefault();
        return;
      }
      if (k === 'h') this.handsOpen = true;
      if (k === '1') this.doDiscard();
      if (k === '2') this.doPlay();
      if (k === 'r') this.toMenu();
      ev.preventDefault();
      return;
    }
    if (this.screen === 'beat') {
      if (k === 'enter' || k === ' ') this.advanceAfterBlind();
      if (k === 'r') this.toMenu();
      ev.preventDefault();
      return;
    }
    if (this.screen === 'shop') {
      if (k === 'enter' || k === ' ') this.leaveShop();
      ev.preventDefault();
      return;
    }
    if (this.screen === 'gameover' || this.screen === 'win') {
      if (k === 'r' || k === 'enter') this.toMenu();
      ev.preventDefault();
    }
  }

  // ---- flow -----------------------------------------------------------

  toMenu() {
    this.screen = 'menu';
    this.run = null;
    this.pack = null;
    this.detail = null;
    this.armed = null;
    this.paused = false;
    this.handsOpen = false;
  }

  startRun() {
    const deckName = DECK_NAMES[this.deckIndex];
    const stake = STAKES[this.stakeIndex].id;
    this.run = new Run({ deck: deckName, stake, seed: this.seed });
    this.selection = [];
    this.armed = null;
    this.screen = 'blind';
    this.run.logMsg('log.newRun', { deck: deckName, stake: STAKES[this.stakeIndex].name });
  }

  startBlind() {
    this.selection = [];
    this.armed = null;
    this.screen = 'play';
    this.flash = 0;
  }

  showToast(msg, good = true) {
    if (!good) SFX.error();
    this.toast = msg;
    this.toastGood = good;
    this.toastTimer = 2.4;
  }

  // ---- gameplay actions ------------------------------------------------

  toggleCard(card) {
    // Face-down cards can still be selected - they are only hidden.
    const i = this.selection.indexOf(card);
    if (i >= 0) this.selection.splice(i, 1);
    else this.selection.push(card);
    this.run.selectCards(this.selection);
    SFX.select();
  }

  doPlay() {
    if (!this.run || this.screen !== 'play' || this.paused) return;
    if (this.armed) { this.useArmed(); return; }
    if (!this.selection.length) { this.showToast(t('ui.selectCardsFirst'), false); return; }
    const res = this.run.playHand();
    if (!res) { this.showToast(t('ui.noValidHand'), false); return; }
    if (res.error) { this.showToast(err(res.error), false); return; }
    this.selection = [];
    this.run.selectCards([]);
    this.lastResult = res;
    this.flash = 1;
    SFX.play();
    // Show how the score was reached, step by step.
    this.scoreBreakdown = res.breakdown;
    this.checkEndConditions();
  }

  doDiscard() {
    if (!this.run || this.screen !== 'play' || this.paused) return;
    if (this.armed) { this.armed = null; this.showToast(t('ui.cancelled')); return; }
    if (!this.selection.length) { this.showToast(t('ui.selectCardsFirst'), false); return; }
    if (this.run.discardsLeft <= 0) { this.showToast(t('ui.noDiscards'), false); return; }
    this.run.discardSelection();
    this.selection = [];
    this.run.selectCards([]);
    SFX.discard();
    this.checkEndConditions();
  }

  checkEndConditions() {
    const run = this.run;
    if (run.blindBeaten()) {
      this.screen = 'beat';
      this.beatTimer = 0;
      // The blind screen shows the breakdown itself.
      this.scoreBreakdown = null;
      SFX.win();
      return;
    }
    if (run.isDead()) {
      this.screen = 'gameover';
      SFX.lose();
    }
  }

  advanceAfterBlind() {
    const run = this.run;
    run.completeBlind();
    if (run.won) {
      this.screen = 'win';
      return;
    }
    this.screen = 'shop';
  }

  leaveShop() {
    closeShop(this.run);
    this.screen = 'blind';
    this.detail = null;
  }

  // ---- consumables -----------------------------------------------------

  /** Clicking a consumable either uses it at once or arms it for a target. */
  armConsumable(c) {
    if (!this.run.consumables.includes(c)) return;
    if (this.armed === c) { this.armed = null; this.showToast(t('ui.cancelled')); return; }
    if (c.type === 'Planet') {
      this.run.useConsumable(c, []);
      this.showToast(tf('ui.used', displayName(c)));
      return;
    }
    if (c.type === 'Spectral' && !TARGET_SPECTRALS.has(c.name)) {
      this.run.useConsumable(c, []);
      SFX.buy();
      this.showToast(tf('ui.used', displayName(c)));
      return;
    }
    // Tarots that do not touch cards can be used straight away.
    if (c.type === 'Tarot' && !TARGET_TAROTS.has(c.name)) {
      this.run.useConsumable(c, []);
      SFX.buy();
      this.showToast(tf('ui.used', displayName(c)));
      return;
    }
    this.armed = c;
    this.showToast(tf('ui.selectTarget', displayName(c)), true);
  }

  useArmed() {
    const c = this.armed;
    if (!c) return;
    if (!this.selection.length) {
      this.showToast(t('ui.selectATarget'), false);
      return;
    }
    const res = this.run.useConsumable(c, this.selection);
    if (res && res.error) { this.showToast(err(res.error), false); return; }
    this.armed = null;
    this.selection = [];
    this.run.selectCards([]);
    SFX.buy();
    this.showToast(tf('ui.used', displayName(c)));
  }

  // ---- rendering -------------------------------------------------------

  loop() {
    this.anim += 1 / 60;
    if (this.toastTimer > 0) {
      this.toastTimer -= 1 / 60;
      if (this.toastTimer <= 0) this.toast = null;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 1 / 60);
    this.draw();
    requestAnimationFrame(this.loop);
  }

  draw() {
    const ctx = this.ctx;
    this.buttons = [];
    this.hoverTargets = [];
    this.tooltip = null;
    ctx.clearRect(0, 0, W, H);
    rect(ctx, 0, 0, W, H, PALETTE.bg);
    switch (this.screen) {
      case 'menu': this.drawMenu(ctx); break;
      case 'blind': this.drawBlindSelect(ctx); break;
      case 'play': this.drawPlay(ctx); break;
      case 'beat': this.drawBeat(ctx); break;
      case 'shop': this.drawShop(ctx); break;
      case 'pack': this.drawPack(ctx); break;
      case 'gameover': this.drawGameOver(ctx); break;
      case 'win': this.drawWin(ctx); break;
      default: this.drawMenu(ctx);
    }
    // Interactive widgets are registered while drawing, then painted.
    for (const b of this.buttons) b.draw(ctx);
    if (this.tooltip) this.drawTooltip(ctx);
    if (this.scoreBreakdown) this.drawScoreBreakdown(ctx);
    if (this.toast) this.drawToast(ctx);
    if (this.screen === 'play' && this.paused) this.drawPause(ctx);
    if (this.handsOpen) this.drawHandLevels(ctx);
    if (this.detail) this.drawDetail(ctx);
  }

  /**
   * The score breakdown of the hand that was just played.
   *
   * It is modal: a click, enter or escape closes it and the round goes on.
   */
  drawScoreBreakdown(ctx) {
    const br = this.scoreBreakdown;
    if (!br) return;
    rect(ctx, 0, 0, W, H, 'rgba(10,8,18,0.88)');
    const rowH = cs(6) + 1;
    const shown = Math.min(breakdownRows(br).length, 10);
    const w = 364;
    const h = 74 + shown * rowH;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2);
    panel(ctx, x, y, w, h, PALETTE.panel, PALETTE.outline);
    rect(ctx, x, y, w, 3, PALETTE.yellow);
    const hand = cn() ? name(br.handName, 'hand') : br.handName.toUpperCase();
    centerText(ctx, tf('score.title', hand, br.level ?? 1), W / 2, y + 9, PALETTE.yellow, cs(8));
    drawBreakdown(ctx, x + 8, y + 26, w - 16, shown, br);
    const totalY = y + 26 + 13 + shown * rowH;
    centerText(ctx, `${fmtScore(br.chips)} × ${fmtScore(br.mult)} = ${fmtScore(br.score)}`,
      W / 2, totalY, PALETTE.white, cs(8));
    centerText(ctx, t('ui.clickOrEnter'), W / 2, totalY + 16, PALETTE.grey, cs(6));
  }

  /** Is the mouse inside this rectangle? */
  mouseOver(x, y, w, h) {
    const m = this.mouse;
    return !!m && m.x >= x && m.x < x + w && m.y >= y && m.y < y + h;
  }

  /**
   * A tooltip that describes a joker or consumable.
   *
   * Reading what a card does should not need a click, so every screen that
   * shows cards registers them as hover targets and this paints the one the
   * mouse points at. The box is anchored to the card instead of the cursor,
   * so it does not run away while the player reads it.
   */
  drawTooltip(ctx) {
    const tip = this.tooltip;
    if (!tip) return;
    const label = displayName(tip.item);
    const desc = itemEffect(tip.item);
    const size = cs(6);
    const titleSize = cs(7);
    const tw = 216;
    const lines = wrapText(ctx, desc, tw - 16, size).slice(0, 3);
    // The target a joker aims at this round.
    const target = cardKind(tip.item) === 'joker' ? jokerTargetText(tip.item) : '';
    const targetText = target ? tf('ui.jokerTarget', target) : '';
    // What the card is worth, for the cards the player owns. The Egg and the
    // Gift Card push this number up over the rounds.
    const owned = cardKind(tip.item) === 'joker'
      ? this.run.jokers.includes(tip.item)
      : this.run.consumables.includes(tip.item);
    const valueText = owned ? tf('ui.sellValue', computeSellValue(this.run, tip.item)) : '';
    const th = 9 + titleSize + 4 + lines.length * (size + 1)
      + (targetText ? size + 4 : 0) + (valueText ? size + 4 : 0) + 5;

    // Next to the card: to the right for the left column, to the left for
    // the right column.
    let tx = tip.x + tip.w + 8;
    if (tip.x + tip.w / 2 > W / 2) tx = tip.x - tw - 8;
    if (tx + tw > W - 4) tx = W - 4 - tw;
    if (tx < 4) tx = 4;
    let ty = tip.y;
    if (ty + th > H - 4) ty = H - 4 - th;
    if (ty < 24) ty = 24;

    panel(ctx, tx, ty, tw, th, PALETTE.panel, PALETTE.outline);
    rect(ctx, tx, ty, tw, 2, PALETTE.yellow);
    text(ctx, label, tx + 8, ty + 8, PALETTE.yellow, titleSize);
    lines.forEach((ln, i) => {
      text(ctx, ln, tx + 8, ty + 8 + titleSize + 4 + i * (size + 1), PALETTE.cream, size);
    });
    let ry = ty + 8 + titleSize + 4 + lines.length * (size + 1);
    if (targetText) {
      text(ctx, targetText, tx + 8, ry + 3, PALETTE.pink, size);
      ry += size + 4;
    }
    if (valueText) {
      text(ctx, valueText, tx + 8, ry + 3, PALETTE.yellow, size);
    }
  }

  drawToast(ctx) {
    const w = Math.min(W - 20, measure(ctx, this.toast, cs(6)) + 16);
    const x = (W - w) / 2;
    const y = H - 26;
    ctx.globalAlpha = Math.min(1, this.toastTimer * 2);
    panel(ctx, x, y, w, 14, PALETTE.panelDark, PALETTE.outline);
    centerText(ctx, this.toast, W / 2, y + 2,
      this.toastGood ? PALETTE.lightGreen : PALETTE.lightRed, cs(6));
    ctx.globalAlpha = 1;
  }

  // ---- menu ------------------------------------------------------------

  drawMenu(ctx) {
    const bob = Math.sin(this.anim * 2) * 1;
    rect(ctx, 0, 26, W, 38, PALETTE.bg2);
    frame(ctx, 0, 26, W, 38, PALETTE.outline, 1);
    centerText(ctx, 'BALATRO', W / 2, 32 + bob, PALETTE.yellow, 16);
    centerText(ctx, 'P I X E L', W / 2, 52 + bob, PALETTE.pink, 8);

    // Deck picker
    const deck = DECKS[DECK_NAMES[this.deckIndex]];
    panel(ctx, 16, 72, W - 32, 44, PALETTE.panel, PALETTE.outline);
    text(ctx, t('ui.deck'), 24, 74, PALETTE.grey, cs(6));
    centerText(ctx, cn() ? name(DECK_NAMES[this.deckIndex], 'deck') : DECK_NAMES[this.deckIndex].toUpperCase(), W / 2, 86, PALETTE.cyan, cs(8, 12));
    centerText(ctx, desc(DECK_NAMES[this.deckIndex], 'deck', deck.desc || ''), W / 2, 102, PALETTE.cream, cs(6));
    this.buttons.push(new Button(20, 84, 14, 14, '<', () => {
      this.deckIndex = (this.deckIndex + DECK_NAMES.length - 1) % DECK_NAMES.length;
    }));
    this.buttons.push(new Button(W - 34, 84, 14, 14, '>', () => {
      this.deckIndex = (this.deckIndex + 1) % DECK_NAMES.length;
    }));

    // Stake picker
    const stake = STAKES[this.stakeIndex];
    panel(ctx, 16, 122, W - 32, 44, PALETTE.panel, PALETTE.outline);
    text(ctx, t('ui.stake'), 24, 124, PALETTE.grey, cs(6));
    centerText(ctx, cn() ? name(stake.name, 'stake') : stake.name.toUpperCase(), W / 2, 136, PALETTE.orange, cs(8, 12));
    centerText(ctx, desc(stake.name, 'stake', stake.desc), W / 2, 152, PALETTE.cream, cs(6));
    this.buttons.push(new Button(20, 134, 14, 14, '<', () => {
      this.stakeIndex = (this.stakeIndex + STAKES.length - 1) % STAKES.length;
    }));
    this.buttons.push(new Button(W - 34, 134, 14, 14, '>', () => {
      this.stakeIndex = (this.stakeIndex + 1) % STAKES.length;
    }));

    // Start
    this.buttons.push(new Button(W / 2 - 62, 174, 124, 22, t('ui.newRun'), () => this.startRun(), {
      color: PALETTE.blue, border: PALETTE.lightBlue, textColor: PALETTE.white,
      size: cs(8, 12),
    }));
    centerText(ctx, t('ui.enterToStart'), W / 2, 198, PALETTE.grey, cs(6));
    centerText(ctx, t('ui.pixelTribute'), W / 2, 213, PALETTE.dark, cs(6));
    centerText(ctx, `${t('ui.seed')} ${this.seed}`, W / 2, 228, PALETTE.dark, cs(6));

    // Language switch
    this.buttons.push(new Button(W - 66, 4, 60, 14, cn() ? '中文' : 'EN', () => {
      const lang = toggleLang();
      this.renderHint();
      this.showToast(lang === 'zh' ? t('ui.languageChinese') : t('ui.languageEnglish'));
    }, { color: PALETTE.panel, border: PALETTE.panelLight, size: cs(6, 8) }));

    // The rules page: every card, item and mechanic of the game.
    this.buttons.push(new Button(4, 4, 46, 14, t('ui.rules'), () => {
      window.open('rules.html', '_blank');
    }, { color: PALETTE.panel, border: PALETTE.panelLight, size: cs(6, 8) }));
  }

  // ---- blind select ----------------------------------------------------

  /**
   * The run so far, as a row of slots - one per blind of every ante.
   *
   * The player sees at a glance how far they have come: what is behind them,
   * what is still ahead and where they stand right now.
   */
  drawBlindTrack(ctx, progress, x, y) {
    const slot = 8;
    const gap = 2;
    const anteGap = 9;
    const groupW = 3 * slot + 2 * gap;
    const current = progress.history.length;
    for (let a = 0; a < progress.antes; a++) {
      for (let s = 0; s < 3; s++) {
        const i = a * 3 + s;
        const sx = x + a * (groupW + anteGap) + s * (slot + gap);
        const entry = progress.history[i];
        let color = PALETTE.panelLight;
        if (entry) color = entry.skipped ? PALETTE.yellow : PALETTE.green;
        else if (i === current) color = PALETTE.cyan;
        rect(ctx, sx, y, slot, slot, color);
        if (i === current) {
          // The blind the player is standing on.
          frame(ctx, sx - 1, y - 1, slot + 2, slot + 2, PALETTE.white, 1);
        }
      }
    }
  }

  /** A small mark that says what a stage of the pipeline is. */
  drawBlindIcon(ctx, state, x, y, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4;
    if (state === 'cleared') {
      // A tick.
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.55);
      ctx.lineTo(x + s * 0.36, y + s * 0.9);
      ctx.lineTo(x + s, y + s * 0.1);
      ctx.stroke();
    } else if (state === 'open') {
      // An arrow.
      ctx.beginPath();
      ctx.moveTo(x + s * 0.15, y);
      ctx.lineTo(x + s, y + s * 0.5);
      ctx.lineTo(x + s * 0.15, y + s);
      ctx.closePath();
      ctx.fill();
    } else {
      // A padlock.
      ctx.beginPath();
      ctx.arc(x + s * 0.5, y + s * 0.4, s * 0.28, Math.PI, 0);
      ctx.stroke();
      rect(ctx, x + s * 0.16, y + s * 0.38, s * 0.68, s * 0.56, color);
    }
    ctx.restore();
  }

  /**
   * One stage of the pipeline: a blind of the current ante, what it takes to
   * beat it and whether it is already behind the player.
   */
  drawBlindStage(ctx, stage, x, y, w, h) {
    const run = this.run;
    const cleared = stage.state === 'cleared';
    const open = stage.state === 'open';
    const accent = cleared ? PALETTE.green : open ? PALETTE.cyan : PALETTE.panelLight;
    const body = open ? PALETTE.panel : PALETTE.panelDark;

    roundRect(ctx, x, y, w, h, 3, body);
    frame(ctx, x, y, w, h, PALETTE.outline, 1);
    // A coloured bar on the left marks the state of the stage.
    rect(ctx, x + 1, y + 2, 3, h - 4, accent);

    // The state of the stage.
    this.drawBlindIcon(ctx, stage.state, x + 9, y + 6, 7, accent);
    const stateText = cleared
      ? (stage.skipped ? t('ui.blindSkippedMark') : t('ui.blindCleared'))
      : open ? t('ui.blindOpen') : t('ui.blindLocked');
    text(ctx, stateText, x + 19, y + 5, accent, cs(6));

    // The blind itself.
    const blindName = cn() ? name(stage.name, 'blind') : stage.name.toUpperCase();
    text(ctx, blindName, x + 9, y + 16, open ? PALETTE.white : PALETTE.grey, cs(8));
    if (stage.bossTag) {
      text(ctx, t('ui.bossTagMark'), x + w - 6, y + 17, PALETTE.pink, cs(5), 'right');
    }

    // What it takes to beat it.
    const need = stage.scoreRequired;
    const needText = stage.scoreMax
      ? tf('ui.blindScoreRange', formatNumber(need), formatNumber(stage.scoreMax))
      : formatNumber(need);
    text(ctx, `${t('ui.target')} ${needText}`, x + 9, y + 30, PALETTE.cyan, cs(6));
    if (stage.reward) {
      text(ctx, `$${stage.reward}`, x + w - 6, y + 30, PALETTE.yellow, cs(6), 'right');
    }

    // What the blind does.
    const descText = stage.state === 'locked' && stage.type === 'boss'
      ? t('ui.blindUnknown')
      : desc(stage.name, 'blind', stage.desc || '');
    const lines = descText
      ? wrapText(ctx, descText, w - 18, cs(5)).slice(0, 4)
      : [];
    lines.forEach((ln, i) => {
      text(ctx, ln, x + 9, y + 42 + i * (cs(5) + 2), PALETTE.cream, cs(5));
    });

    // What the player did with it.
    if (cleared) {
      const result = stage.skipped
        ? t('ui.blindSkippedMark')
        : tf('ui.blindScoreGot', formatNumber(stage.score ?? 0));
      text(ctx, result, x + 9, y + 44 + lines.length * (cs(5) + 2),
        stage.skipped ? PALETTE.yellow : PALETTE.lightGreen, cs(6));
    }

    if (open) {
      this.buttons.push(new Button(x + w / 2 - 24, y + h - 22, 48, 16, t('ui.select'), () => {
        run.selectBlind(stage.type);
        this.startBlind();
      }, { color: PALETTE.blue, border: PALETTE.lightBlue }));
    }
  }

  drawBlindSelect(ctx) {
    const run = this.run;
    rect(ctx, 0, 0, W, 24, PALETTE.bg2);
    frame(ctx, 0, 24, W, 1, PALETTE.outline, 1);
    text(ctx, `${t('ui.ante')} ${run.ante}`, 8, 3, PALETTE.yellow, cs(8));
    text(ctx, cn() ? name(run.deckName, 'deck') : run.deckName.toUpperCase(), 8, 13, PALETTE.grey, cs(6));
    badge(ctx, W - 70, 4, t('ui.money'), `$${run.money}`, PALETTE.yellow);
    badge(ctx, W - 140, 4, t('ui.round'), `${Math.min(run.round + 1, 3)}/3`, PALETTE.lightBlue);

    const stages = run.antePipeline();
    const progress = run.blindProgress();

    // The run so far.
    this.drawBlindTrack(ctx, progress, 8, 30);
    text(ctx, tf('ui.blindProgress', progress.beaten, progress.total),
      W - 8, 29, PALETTE.cream, cs(6), 'right');
    if (progress.skipped) {
      text(ctx, tf('ui.blindProgressSkipped', progress.skipped),
        W - 8, 38, PALETTE.yellow, cs(6), 'right');
    }

    // The pipeline of the current ante.
    const cardW = 126;
    const cardH = 116;
    stages.forEach((stage, i) => {
      this.drawBlindStage(ctx, stage, 7 + i * (cardW + 18), 50, cardW, cardH);
    });

    let y = 50 + cardH + 8;
    const opts = run.selectableBlinds();

    // Reroll the boss blind (Director's Cut / Retcon).
    if (opts.length === 1 && opts[0].type === 'boss'
      && (run.hasVoucher("Director's Cut") || run.hasVoucher('Retcon'))) {
      this.buttons.push(new Button(W / 2 - 40, y, 80, 16, t('ui.rerollBoss'), () => {
        const res = run.rerollBossBlind();
        if (res.error) this.showToast(err(res.error), false);
        else this.showToast(tf('ui.bossRerolled', name(res.boss.name, 'blind')));
      }));
      y += 20;
    }

    if (opts.length > 1) {
      this.buttons.push(new Button(W / 2 - 44, y, 88, 16, t('ui.skip'), () => {
        run.skipBlind();
        this.screen = 'blind';
        this.showToast(t('ui.blindSkipped'));
      }));
      y += 20;
    }

    centerText(ctx, t('ui.pickABlind'), W / 2, y + 4, PALETTE.grey, cs(7, 10));

    // What the next ante will ask for.
    const next = run.nextAntePreview();
    const nextLine = `${t('ui.nextAnte')} ${next.ante}  ·  `
      + `${name('Small Blind', 'blind')} ${formatNumber(next.small)}  ·  `
      + `${name('Big Blind', 'blind')} ${formatNumber(next.big)}  ·  `
      + `${name('Boss Blind', 'blind')} ${tf('ui.blindScoreRange', formatNumber(next.bossMin), formatNumber(next.bossMax))}`;
    panel(ctx, 7, H - 30, W - 14, 22, PALETTE.panelDark, PALETTE.outline);
    const fits = measure(ctx, nextLine, cs(6)) <= W - 30;
    text(ctx, nextLine, W / 2, H - 24, fits ? PALETTE.grey : PALETTE.dark, cs(6), 'center');
  }

  // ---- play ------------------------------------------------------------

  drawPlay(ctx) {
    const run = this.run;

    // Top bar
    rect(ctx, 0, 0, W, 22, PALETTE.bg2);
    frame(ctx, 0, 22, W, 1, PALETTE.outline, 1);
    text(ctx, `${t('ui.ante')} ${run.ante}`, 6, 2, PALETTE.yellow, cs(8));
    const blindName = run.currentBlind ? run.currentBlind.name : '';
    const blindLabel = cn() ? name(blindName, 'blind') : blindName.toUpperCase();
    text(ctx, blindLabel, 6, 12, PALETTE.grey, cs(6));
    // The effect of the boss blind stays visible while you play against it.
    // The Chinese table has the translations, the English one falls back to
    // the text of the blind itself.
    const boss = run.currentBoss;
    if (boss) {
      const why = desc(boss.name, 'blind', boss.desc || '');
      if (why) {
        const x = 6 + measure(ctx, blindLabel, cs(6)) + 6;
        const line = fitText(ctx, why, 416 - x, cs(6));
        if (line) text(ctx, line, x, 12, PALETTE.pink, cs(6));
      }
    }
    badge(ctx, W - 130, 3, t('ui.money'), `$${run.money}`, PALETTE.yellow);
    badge(ctx, W - 66, 3, t('ui.hands'), playsLeft(run), PALETTE.lightBlue);
    text(ctx, isMuted() ? t('ui.hudMute') : t('ui.hudSound'), 292, 4, PALETTE.dark, cs(6), 'right');

    this.drawJokerColumn(ctx);
    this.drawConsumableColumn(ctx);
    this.drawScorePanel(ctx);
    this.drawHandInfo(ctx);
    this.drawHand(ctx);

    // Buttons
    const armed = !!this.armed;
    this.buttons.push(new Button(W - 142, 198, 68, 18, t('ui.discard'), () => this.doDiscard(), {
      color: PALETTE.panel, border: PALETTE.panelLight, size: 7,
      disabled: run.discardsLeft <= 0 && !armed,
    }));
    this.buttons.push(new Button(W - 70, 198, 66, 18, armed ? t('ui.use') : t('ui.playHand'),
      () => this.doPlay(), {
        color: armed ? PALETTE.purple : PALETTE.blue,
        border: armed ? PALETTE.pink : PALETTE.lightBlue,
        size: armed ? cs(8, 11) : cs(6, 9),
        disabled: run.handsLeft <= 0 && !armed,
      }));

    // Log
    const log = run.log.slice(0, 3);
    log.forEach((m, i) => {
      text(ctx, formatLog(m).slice(0, 48), 6, 199 + i * (cs(6) + 1), PALETTE.grey, cs(6));
    });

    // Describe the joker or consumable under the mouse, no click needed.
    const hit = this.hoverTargets.find((b) => this.mouseOver(b.x, b.y, b.w, b.h));
    if (hit) this.tooltip = { item: hit.item, x: hit.x, y: hit.y, w: hit.w, h: hit.h };
  }

  drawJokerColumn(ctx) {
    const run = this.run;
    text(ctx, t('ui.jokers'), 6, 24, PALETTE.grey, cs(6));
    run.jokers.forEach((j, i) => {
      const x = 5 + (i % 2) * 34;
      const y = 36 + Math.floor(i / 2) * 42;
      drawJokerCard(ctx, j, x, y, {});
      this.hoverTargets.push({ item: j, x, y, w: JOKER_W, h: JOKER_H });
      if (this.mouseOver(x, y, JOKER_W, JOKER_H)) {
        frame(ctx, x - 1, y - 1, JOKER_W + 2, JOKER_H + 2, PALETTE.yellow, 1);
      }
      this.buttons.push(new Button(x, y, JOKER_W, JOKER_H, '', () => {
        this.showJokerDetail(j);
      }, { ghost: true }));
    });
  }

  drawConsumableColumn(ctx) {
    const run = this.run;
    const x = W - 68;
    text(ctx, t('ui.consumables'), W - 4, 24, PALETTE.grey, cs(6), 'right');
    run.consumables.forEach((c, i) => {
      const cx = x + (i % 2) * 34;
      const cy = 36 + Math.floor(i / 2) * 42;
      drawJokerCard(ctx, c, cx, cy, { selected: this.armed === c });
      this.hoverTargets.push({ item: c, x: cx, y: cy, w: JOKER_W, h: JOKER_H });
      if (this.mouseOver(cx, cy, JOKER_W, JOKER_H)) {
        frame(ctx, cx - 1, cy - 1, JOKER_W + 2, JOKER_H + 2, PALETTE.yellow, 1);
      }
      this.buttons.push(new Button(cx, cy, JOKER_W, JOKER_H, '', () => {
        this.armConsumable(c);
      }, { ghost: true }));
    });
  }

  drawScorePanel(ctx) {
    const run = this.run;
    const panelX = 76;
    const panelW = W - 76 - 76;
    panel(ctx, panelX, 26, panelW, 38, PALETTE.panelDark, PALETTE.outline);
    if (!run.currentBlind) return;
    const req = run.currentBlind.scoreRequired;
    const cur = run.roundScore;
    text(ctx, t('ui.score'), panelX + 6, 29, PALETTE.grey, cs(6));
    text(ctx, `${formatNumber(cur)} / ${formatNumber(req)}`,
      panelX + panelW - 6, 29, cur >= req ? PALETTE.lightGreen : PALETTE.white, 8, 'right');
    // progress bar
    const bw = panelW - 12;
    rect(ctx, panelX + 6, 42, bw, 8, PALETTE.bg);
    frame(ctx, panelX + 6, 42, bw, 8, PALETTE.outline, 1);
    const p = clamp(cur / req, 0, 1);
    if (p > 0) {
      rect(ctx, panelX + 7, 43, Math.round((bw - 2) * p), 6,
        cur >= req ? PALETTE.green : PALETTE.blue);
    }
    text(ctx, tf('ui.hudRound', Math.min(run.round + 1, 3)), panelX + 6, 52, PALETTE.grey, cs(6));
    text(ctx, tf('ui.hudDeck', run.deckPile.length, run.discardPile.length,
      run.discardsLeft, Math.max(run.discardsAtRoundStart ?? 0, run.discardsLeft)),
      panelX + panelW - 6, 52, PALETTE.grey, cs(6), 'right');
  }

  drawHandInfo(ctx) {
    const run = this.run;
    const panelX = 76;
    const panelW = W - 76 - 76;
    panel(ctx, panelX, 68, panelW, 54, PALETTE.panelDark, PALETTE.outline);
    if (this.armed) {
      text(ctx, t('ui.target'), panelX + 6, 70, PALETTE.pink, cs(6));
      centerText(ctx, cn() ? displayName(this.armed) : this.armed.name.toUpperCase(), panelX + panelW / 2, 83, PALETTE.white, cs(8));
      centerText(ctx, t('ui.selectCards'), panelX + panelW / 2, 96, PALETTE.pink, cs(6));
      centerText(ctx, t('ui.thenPressUse'), panelX + panelW / 2, 106, PALETTE.grey, cs(6));
      return;
    }
    const info = this.selection.length ? this.previewHand() : null;
    text(ctx, t('ui.hand'), panelX + 6, 70, PALETTE.grey, cs(6));
    // The levels of all poker hands.
    this.buttons.push(new Button(panelX + panelW - 50, 68, 46, 11, t('ui.handLevels'), () => {
      this.handsOpen = true;
    }, { color: PALETTE.panel, border: PALETTE.panelLight, size: cs(5, 7) }));
    if (info) {
      text(ctx, cn() ? name(info.name, 'hand') : info.name.toUpperCase(), panelX + 6, 81, PALETTE.cyan, cs(7));
      text(ctx, tf('ui.hudLevel', info.level), panelX + panelW - 6, 81, PALETTE.grey, cs(6), 'right');
      text(ctx, `${formatNumber(info.chips)}`, panelX + 6, 94, PALETTE.lightBlue, 8);
      text(ctx, `X ${formatNumber(info.mult)}`, panelX + 6, 104, PALETTE.pink, 8);
      text(ctx, `= ${formatNumber(info.score)}`, panelX + 6, 114, PALETTE.yellow, 8);
      // Show which cards actually score.
      this.lastScoredSet = new Set(info.scored);
      text(ctx, tf('ui.scoring', info.scored.length, this.selection.length),
        panelX + panelW - 6, 104, PALETTE.grey, 6, 'right');
    } else {
      this.lastScoredSet = null;
      centerText(ctx, t('ui.select'), panelX + panelW / 2, 86, PALETTE.dark, cs(7));
      centerText(ctx, t('ui.selectCards'), panelX + panelW / 2, 96, PALETTE.dark, cs(7));
      centerText(ctx, t('ui.toScore'), panelX + panelW / 2, 106, PALETTE.dark, cs(7));
    }
  }

  drawHand(ctx) {
    const run = this.run;
    const handY = 148;
    const n = run.hand.length;
    const cardW = CARD_W + 2;
    const totalW = n * cardW;
    let hx = Math.round((W - totalW) / 2);
    const scored = this.lastScoredSet;
    run.hand.forEach((card) => {
      const selected = this.selection.includes(card);
      drawCard(ctx, card, hx, handY + (selected ? 0 : 6), {
        selected,
        faceDown: card.faceDown,
        debuffed: card.debuffed,
      });
      if (card.forceSelected) {
        frame(ctx, hx - 1, handY + (selected ? 0 : 6) - 1, CARD_W + 2, CARD_H + 2,
          PALETTE.yellow, 1);
      }
      this.buttons.push(new Button(hx, handY, CARD_W, CARD_H, '', () => {
        this.toggleCard(card);
      }, { ghost: true }));
      hx += cardW;
    });
  }

  previewHand() {
    const run = this.run;
    const opts = {
      fourFingers: run.hasJoker('Four Fingers'),
      shortcut: run.hasJoker('Shortcut'),
      splash: run.hasJoker('Splash'),
      smeared: run.smeared,
    };
    const ev = evaluateHand(this.selection, opts);
    if (!ev) return null;
    const level = run.handLevels[ev.id] || 1;
    const base = handLevelValues(ev.id, level);
    return {
      name: ev.name,
      level,
      chips: base.chips,
      mult: base.mult,
      score: base.chips * base.mult,
      scored: ev.cards,
    };
  }

  /**
   * The levels of every poker hand.
   *
   * The play screen only shows the level of the hand that is currently
   * selected, so this overview lists all of them: the level, what the hand
   * is worth at that level, how it grows and which planet card levels it up.
   */
  drawHandLevels(ctx) {
    const run = this.run;
    const px = 14;
    const py = 14;
    const pw = W - 28;
    const ph = H - 28;
    rect(ctx, 0, 0, W, H, 'rgba(10,8,18,0.82)');
    panel(ctx, px, py, pw, ph, PALETTE.panel, PALETTE.outline);
    centerText(ctx, t('ui.handLevels'), W / 2, py + 5, PALETTE.yellow, cs(8, 11));

    const cName = px + 8;
    const cLevel = px + 86;
    const cValue = px + 146;
    const cGrow = px + 226;
    const cPlanet = px + 306;
    text(ctx, t('rules.label.hand'), cName, py + 18, PALETTE.grey, cs(6));
    text(ctx, t('rules.label.level'), cLevel, py + 18, PALETTE.grey, cs(6));
    text(ctx, `${t('rules.label.chips')}×${t('rules.label.mult')}`, cValue, py + 18, PALETTE.grey, cs(6));
    text(ctx, t('rules.label.perLevel'), cGrow, py + 18, PALETTE.grey, cs(6));
    text(ctx, t('rules.label.planet'), cPlanet, py + 18, PALETTE.grey, cs(6));

    let y = py + 30;
    for (const h of HANDS) {
      const level = run.handLevels[h.id] || 1;
      const base = handLevelValues(h.id, level);
      const grown = level > 1;
      text(ctx, cn() ? name(h.name, 'hand') : h.name.toUpperCase(), cName, y, PALETTE.white, cs(7));
      text(ctx, tf('ui.hudLevel', level), cLevel, y, grown ? PALETTE.yellow : PALETTE.grey, cs(6));
      text(ctx, `${formatNumber(base.chips)}×${formatNumber(base.mult)}`, cValue, y, PALETTE.cream, cs(6));
      text(ctx, `+${h.chipPerLevel}/+${h.multPerLevel}`, cGrow, y, PALETTE.grey, cs(6));
      text(ctx, cn() ? name(h.planet, 'planet') : h.planet, cPlanet, y, PALETTE.cyan, cs(6));
      y += 14;
    }
    centerText(ctx, t('ui.escClose'), W / 2, py + ph - 10, PALETTE.grey, cs(6));
  }

  drawPause(ctx) {
    const start = this.buttons.length;
    rect(ctx, 0, 0, W, H, 'rgba(10,8,18,0.82)');
    panel(ctx, W / 2 - 70, 70, 140, 100, PALETTE.panel, PALETTE.outline);
    centerText(ctx, t('ui.paused'), W / 2, 82, PALETTE.yellow, cs(10, 12));
    this.buttons.push(new Button(W / 2 - 50, 104, 100, 18, t('ui.resume'), () => {
      this.paused = false;
    }, { color: PALETTE.blue, border: PALETTE.lightBlue }));
    this.buttons.push(new Button(W / 2 - 50, 128, 100, 18, t('ui.mainMenu'), () => this.toMenu()));
    for (let i = start; i < this.buttons.length; i++) this.buttons[i].draw(ctx);
    centerText(ctx, t('ui.escResume'), W / 2, 154, PALETTE.grey, cs(6));
  }

  // ---- beat blind ------------------------------------------------------

  drawBeat(ctx) {
    const run = this.run;
    rect(ctx, 0, 0, W, H, PALETTE.bg);
    this.beatTimer = (this.beatTimer || 0) + 1 / 60;
    const res = this.lastResult;
    const shown = Math.min(breakdownRows(res?.breakdown).length, 8);
    panel(ctx, 40, 10, W - 80, 198, PALETTE.panel, PALETTE.outline);
    centerText(ctx, t('ui.blindDefeated'), W / 2, 18, PALETTE.yellow, cs(11));
    if (res) {
      const hand = cn() ? name(res.handName, 'hand') : res.handName.toUpperCase();
      centerText(ctx, tf('score.title', hand, res.level ?? 1), W / 2, 34, PALETTE.cyan, cs(8));
      drawBreakdown(ctx, 48, 50, W - 96, shown, res.breakdown);
      centerText(ctx, `${fmtScore(res.chips)} × ${fmtScore(res.mult)} = ${fmtScore(res.score)}`,
        W / 2, 138, PALETTE.white, cs(8));
    }
    const reward = run.currentBlind ? run.currentBlind.reward : 0;
    centerText(ctx, tf('ui.blindRewardLine', reward), W / 2, 152, PALETTE.lightGreen, cs(6));
    centerText(ctx, `${tf('ui.moneyLine', run.money)}   ${tf('ui.scoreLine', formatNumber(run.score))}`,
      W / 2, 162, PALETTE.yellow, cs(6));
    this.buttons.push(new Button(W / 2 - 46, 172, 92, 20, t('ui.continue'), () => {
      this.advanceAfterBlind();
    }, { color: PALETTE.blue, border: PALETTE.lightBlue }));
    centerText(ctx, t('ui.clickOrEnter'), W / 2, 196, PALETTE.grey, cs(6));
  }

  // ---- shop ------------------------------------------------------------

  drawShop(ctx) {
    const run = this.run;
    const shop = run.shop;
    rect(ctx, 0, 0, W, 22, PALETTE.bg2);
    frame(ctx, 0, 22, W, 1, PALETTE.outline, 1);
    text(ctx, t('ui.shop'), 6, 4, PALETTE.yellow, cs(8));
    badge(ctx, W - 70, 4, t('ui.money'), `$${run.money}`, PALETTE.yellow);

    if (!shop) { this.screen = 'blind'; return; }

    if (shop.tag && TAGS[shop.tag]) {
      const tag = TAGS[shop.tag];
      rect(ctx, 74, 4, 150, 14, PALETTE.panelDark);
      frame(ctx, 74, 4, 150, 14, PALETTE.purple, 1);
      text(ctx, tf('ui.hudTag', cn() ? name(tag.name, 'tag') : tag.name.toUpperCase()), 78, 6, PALETTE.pink, cs(6));
    }

    // Cards for sale
    text(ctx, t('ui.cards'), 8, 25, PALETTE.grey, cs(6));
    shop.items.forEach((item, i) => {
      const x = 8 + i * 40;
      const y = 38;
      this.drawShopItem(ctx, item, x, y);
    });

    // Packs
    text(ctx, t('ui.boosterPacks'), 8, 84, PALETTE.grey, cs(6));
    shop.packs.forEach((pack, i) => {
      const x = 8 + i * 40;
      const y = 96;
      panel(ctx, x, y, JOKER_W, JOKER_H, PALETTE.panelDark, PALETTE.outline);
      rect(ctx, x, y, JOKER_W, 3, PALETTE.green);
      text(ctx, cn() ? name(pack.packType, 'pack') : pack.packType.slice(0, 6).toUpperCase(), x + 2, y + 7, PALETTE.white, cs(4, 8));
      text(ctx, cn() ? name(pack.size, 'pack') : pack.size.slice(0, 6).toUpperCase(), x + 2, y + 18, PALETTE.grey, cs(4, 8));
      text(ctx, `$${computeBuyCost(run, pack)}`, x + 2, y + 29, PALETTE.yellow, 6);
      this.buttons.push(new Button(x, y, JOKER_W, JOKER_H, '', () => {
        const res = buyPack(run, pack);
        if (res.error) { this.showToast(err(res.error), false); return; }
        this.pack = { pack, options: res.options };
        this.packSelection = [];
        this.screen = 'pack';
      }, { ghost: true }));
    });

    // Voucher
    if (shop.voucher) {
      const v = shop.voucher;
      text(ctx, t('ui.voucher'), 176, 84, PALETTE.grey, cs(6));
      panel(ctx, 176, 96, 180, 52, PALETTE.panelDark, PALETTE.outline);
      rect(ctx, 176, 96, 180, 3, PALETTE.purple);
      text(ctx, (cn() ? name(v.name, 'voucher') : v.name.toUpperCase()).slice(0, 22), 180, 101, PALETTE.white, cs(6));
      const lines = wrapText(ctx, effect(v.name, 'voucher', v.desc || ''), 172, cs(5));
      lines.slice(0, 2).forEach((ln, i) => text(ctx, ln, 180, 113 + i * (cs(5) + 1), PALETTE.cream, cs(5)));
      text(ctx, `$${v.price ?? 10}`, 180, 135, PALETTE.yellow, 6);
      this.buttons.push(new Button(176, 96, 180, 52, '', () => {
        const res = buyVoucherItem(run);
        if (res.error) { this.showToast(err(res.error), false); return; }
        shop.voucher = null;
        SFX.buy();
        this.showToast(tf('ui.bought', name(v.name, 'voucher')));
      }, { ghost: true }));
    }

    // Owned jokers / consumables (sellable)
    text(ctx, t('ui.yourJokers'), 8, 140, PALETTE.grey, cs(6));
    run.jokers.forEach((j, i) => {
      const x = 8 + i * 34;
      drawJokerCard(ctx, j, x, 150, {});
      this.hoverTargets.push({ item: j, x, y: 150, w: JOKER_W, h: JOKER_H });
      if (this.mouseOver(x, 150, JOKER_W, JOKER_H)) {
        frame(ctx, x - 1, 149, JOKER_W + 2, JOKER_H + 2, PALETTE.yellow, 1);
      }
      this.buttons.push(new Button(x, 150, JOKER_W, JOKER_H, '', () => {
        this.showJokerDetail(j, true);
      }, { ghost: true }));
    });
    run.consumables.forEach((c, i) => {
      const x = 8 + (run.jokers.length + i) * 34;
      if (x > W - 40) return;
      drawJokerCard(ctx, c, x, 150, {});
      this.hoverTargets.push({ item: c, x, y: 150, w: JOKER_W, h: JOKER_H });
      if (this.mouseOver(x, 150, JOKER_W, JOKER_H)) {
        frame(ctx, x - 1, 149, JOKER_W + 2, JOKER_H + 2, PALETTE.yellow, 1);
      }
      this.buttons.push(new Button(x, 150, JOKER_W, JOKER_H, '', () => {
        this.showConsumableDetail(c, true);
      }, { ghost: true }));
    });

    // Buttons
    this.buttons.push(new Button(W - 140, 200, 62, 18, t('ui.reroll'), () => {
      const cost = shop.freeRerolls ? 0 : shop.rerollCost + shop.rerolls;
      if (!rerollShop(run)) this.showToast(t('ui.cannotReroll'), false);
      else this.showToast(tf('ui.rerolled', cost));
    }, { sub: `$${shop.freeRerolls ? 0 : shop.rerollCost + shop.rerolls}` }));
    this.buttons.push(new Button(W - 72, 200, 66, 18, t('ui.next'), () => this.leaveShop(), {
      color: PALETTE.blue, border: PALETTE.lightBlue,
    }));
    // The hint sits above the toast, so the two never cover each other.
    centerText(ctx, t('ui.clickJokerToSell'), W / 2, 206, PALETTE.grey, cs(6));

    // Show what a card does before the player buys it.
    const hit = this.hoverTargets.find((b) => this.mouseOver(b.x, b.y, b.w, b.h));
    if (hit) this.tooltip = { item: hit.item, x: hit.x, y: hit.y, w: hit.w, h: hit.h };
  }

  drawShopItem(ctx, item, x, y) {
    const run = this.run;
    const cost = computeBuyCost(run, item);
    if (item.kind === 'playing') {
      drawCard(ctx, item, x, y, {});
      text(ctx, `$${cost}`, x + 2, y + CARD_H + 2, PALETTE.yellow, 6);
    } else {
      drawJokerCard(ctx, item, x, y, {});
      text(ctx, `$${cost}`, x + 2, y + JOKER_H + 2, PALETTE.yellow, 6);
      this.hoverTargets.push({ item, x, y, w: JOKER_W, h: JOKER_H });
      if (this.mouseOver(x, y, JOKER_W, JOKER_H)) {
        frame(ctx, x - 1, y - 1, JOKER_W + 2, JOKER_H + 2, PALETTE.yellow, 1);
      }
    }
    this.buttons.push(new Button(x, y, 30, item.kind === 'playing' ? CARD_H : JOKER_H, '', () => {
      const res = buyCard(run, item);
      if (res.error) { this.showToast(err(res.error), false); return; }
      const i = run.shop.items.indexOf(item);
      if (i >= 0) run.shop.items.splice(i, 1);
      SFX.buy();
      this.showToast(tf('ui.bought', displayName(item)));
    }, { ghost: true }));
  }

  // ---- pack ------------------------------------------------------------

  drawPack(ctx) {
    const run = this.run;
    const pack = this.pack;
    rect(ctx, 0, 0, W, H, PALETTE.bg);
    rect(ctx, 0, 0, W, 22, PALETTE.bg2);
    text(ctx, tf('ui.hudPack',
      cn() ? name(pack.pack.packType, 'pack') : pack.pack.packType.toUpperCase(),
      cn() ? name(pack.pack.size, 'pack') : pack.pack.size.toUpperCase()),
      6, 6, PALETTE.green, 8);
    badge(ctx, W - 70, 4, t('ui.money'), `$${run.money}`, PALETTE.yellow);

    // What this kind of pack is for.
    centerText(ctx, t(`ui.packHint.${pack.pack.packType}`), W / 2, 28, PALETTE.grey, cs(6));

    const opts = pack.options;
    const gap = 40;
    const totalW = opts.length * gap;
    let x = Math.round((W - totalW) / 2);
    const boxes = [];
    opts.forEach((item) => {
      const selected = this.packSelection.includes(item);
      if (item.kind === 'playing') {
        drawCard(ctx, item, x, 60, { selected });
        boxes.push({ item, x, y: 56, w: CARD_W, h: CARD_H });
        this.buttons.push(new Button(x, 56, CARD_W, CARD_H, '', () => {
          this.togglePack(item);
        }, { ghost: true }));
      } else {
        drawJokerCard(ctx, item, x, 58, { selected });
        boxes.push({ item, x, y: 54, w: JOKER_W, h: JOKER_H });
        this.buttons.push(new Button(x, 54, JOKER_W, JOKER_H, '', () => {
          this.togglePack(item);
        }, { ghost: true }));
      }
      x += gap;
    });

    centerText(ctx, tf('ui.choose', pack.pack.choose), W / 2, 106, PALETTE.grey, cs(7));
    centerText(ctx, tf('ui.selected', this.packSelection.length, pack.pack.choose), W / 2, 119,
      this.packSelection.length >= pack.pack.choose ? PALETTE.lightGreen : PALETTE.grey, cs(6));
    this.buttons.push(new Button(W / 2 - 44, 138, 88, 20, t('ui.take'), () => {
      if (!this.packSelection.length) { this.showToast(t('ui.pickSomething'), false); return; }
      takeFromPack(run, pack.pack, this.packSelection);
      this.pack = null;
      this.packSelection = [];
      this.screen = 'shop';
    }, { color: PALETTE.blue, border: PALETTE.lightBlue }));
    this.buttons.push(new Button(W / 2 - 44, 162, 88, 18, t('ui.skipPack'), () => {
      // Skipping a pack gives Red Card its bonus mult.
      for (const j of run.jokers) {
        if (j.name === 'Red Card') j.extraMult = (j.extraMult || 0) + 3;
      }
      run.packsSkipped += 1;
      const idx = run.shop.packs.indexOf(pack.pack);
      if (idx >= 0) run.shop.packs.splice(idx, 1);
      this.pack = null;
      this.packSelection = [];
      this.screen = 'shop';
    }));

    // What the card under the mouse (or the first one taken) actually does.
    const focus = this.packFocus(boxes);
    const note = focus ? packCardText(focus.item) : '';
    const lines = wrapText(ctx, note || t('ui.packHover'), W - 40, cs(6));
    lines.slice(0, 2).forEach((ln, i) => {
      centerText(ctx, ln, W / 2, 186 + i * (cs(6) + 1), note ? PALETTE.cream : PALETTE.grey, cs(6));
    });
  }

  /** The pack card the mouse points at, or the first one that is selected. */
  packFocus(boxes) {
    const m = this.mouse;
    if (m.x >= 0) {
      const hit = boxes.find((b) => m.x >= b.x && m.x < b.x + b.w
        && m.y >= b.y && m.y < b.y + b.h);
      if (hit) return hit;
    }
    if (this.packSelection.length) {
      return boxes.find((b) => b.item === this.packSelection[0]) || null;
    }
    return null;
  }

  togglePack(item) {
    const i = this.packSelection.indexOf(item);
    if (i >= 0) this.packSelection.splice(i, 1);
    else if (this.packSelection.length < this.pack.pack.choose) this.packSelection.push(item);
  }

  // ---- detail overlay --------------------------------------------------

  showJokerDetail(joker, sellable = false) {
    const meta = JOKER_META[joker.name];
    const lines = [];
    if (meta) {
      lines.push(tf('ui.rarity', cn() ? name(meta.rarity, 'rarity') : meta.rarity.toUpperCase()));
      if (meta.price) lines.push(tf('ui.basePrice', meta.price));
    }
    if (joker.edition && joker.edition !== 'base') {
      lines.push(tf('ui.edition', cn() ? name(joker.edition, 'edition') : joker.edition.toUpperCase()));
    }
    if (joker.eternal) lines.push(t('ui.eternal'));
    if (joker.perishable) lines.push(t('ui.perishable'));
    if (joker.rental) lines.push(t('ui.rental'));
    // What the card is worth right now. The Egg and the Gift Card push it up.
    if (sellable) lines.push(tf('ui.sellValue', computeSellValue(this.run, joker)));
    // The target a joker aims at this round.
    const target = jokerTargetText(joker);
    if (target) lines.push(tf('ui.jokerTarget', target));
    const detail = effect(joker.name, 'joker', jokerDescription(joker.name, meta ? meta.effect : ''));
    this.detail = {
      title: cn() ? name(joker.name, 'joker') : joker.name.toUpperCase(),
      kind: 'joker',
      lines,
      desc: detail,
      sellable,
      joker,
    };
  }

  showConsumableDetail(c, sellable = false) {
    const lines = [tf('ui.type', cn() ? name(c.type, 'consumableType') : c.type.toUpperCase())];
    if (sellable) lines.push(tf('ui.sellValue', computeSellValue(this.run, c)));
    this.detail = {
      title: cn() ? displayName(c) : c.name.toUpperCase(),
      kind: 'consumable',
      lines,
      desc: effect(c.name, c.type.toLowerCase(), c.desc || '', consumableParams(c)),
      sellable,
      item: c,
    };
  }

  drawDetail(ctx) {
    const start = this.buttons.length;
    const d = this.detail;
    rect(ctx, 0, 0, W, H, 'rgba(10,8,18,0.85)');
    const w = 300;
    const h = 150;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    panel(ctx, x, y, w, h, PALETTE.panel, PALETTE.outline);
    rect(ctx, x, y, w, 3, PALETTE.pink);
    centerText(ctx, d.title, W / 2, y + 9, PALETTE.yellow, cs(8));
    let ly = y + 28;
    for (const l of d.lines) {
      text(ctx, l, x + 10, ly, PALETTE.cyan, cs(6));
      ly += cs(6) + 1;
    }
    if (d.desc) {
      const lines = wrapText(ctx, d.desc, w - 20, cs(6));
      lines.slice(0, cn() ? 4 : 5).forEach((ln, i) => {
        text(ctx, ln, x + 10, ly + i * (cs(6) + 1), PALETTE.cream, cs(6));
      });
    }
    const owned = d.joker || d.item;
    if (d.sellable && owned) {
      const value = computeSellValue(this.run, owned);
      this.buttons.push(new Button(x + 10, y + h - 28, 100, 18, tf('ui.sell', value), () => {
        sellCard(this.run, owned);
        this.detail = null;
        this.showToast(tf('ui.sold', displayName(owned), value));
      }, { color: PALETTE.red, border: PALETTE.lightRed }));
    }
    this.buttons.push(new Button(x + w - 90, y + h - 28, 80, 18, t('ui.close'), () => {
      this.detail = null;
    }));
    for (let i = start; i < this.buttons.length; i++) this.buttons[i].draw(ctx);
  }

  // ---- end screens -----------------------------------------------------

  drawGameOver(ctx) {
    const run = this.run;
    rect(ctx, 0, 0, W, H, PALETTE.bg);
    centerText(ctx, t('ui.gameOver'), W / 2, 56, PALETTE.red, cs(16, 18));
    centerText(ctx, `${tf('ui.hudAnte', run.ante)}  ${run.currentBlind ? (cn() ? name(run.currentBlind.name, 'blind') : run.currentBlind.name.toUpperCase()) : ''}`,
      W / 2, 88, PALETTE.cream, cs(8));
    centerText(ctx, tf('ui.hudScore', formatNumber(run.score)), W / 2, 104, PALETTE.yellow, cs(7));
    centerText(ctx, tf('ui.hudRoundsHands', run.roundsPlayed, run.handsPlayed),
      W / 2, 120, PALETTE.grey, cs(7));
    centerText(ctx, tf('ui.hudNeeded', formatNumber(run.currentBlind ? run.currentBlind.scoreRequired : 0)),
      W / 2, 134, PALETTE.grey, cs(6));
    this.buttons.push(new Button(W / 2 - 76, 156, 68, 20, t('ui.retry'), () => this.startRun(), {
      color: PALETTE.blue, border: PALETTE.lightBlue,
    }));
    this.buttons.push(new Button(W / 2 + 8, 156, 68, 20, t('ui.menu'), () => this.toMenu(), { size: cs(8, 11) }));
    centerText(ctx, t('ui.pressR'), W / 2, 190, PALETTE.grey, cs(6));
  }

  drawWin(ctx) {
    const run = this.run;
    rect(ctx, 0, 0, W, H, PALETTE.bg);
    centerText(ctx, t('ui.youWin'), W / 2, 48, PALETTE.yellow, cs(16, 18));
    centerText(ctx, tf('ui.hudFinalScore', formatNumber(run.score)), W / 2, 78, PALETTE.white, cs(8));
    centerText(ctx, tf('ui.hudRoundsHands', run.roundsPlayed, run.handsPlayed),
      W / 2, 94, PALETTE.grey, cs(7));
    centerText(ctx, tf('ui.hudJokersTags', run.jokers.length, run.tags.length),
      W / 2, 110, PALETTE.grey, cs(7));
    centerText(ctx, t('ui.endlessAwaits'), W / 2, 131, PALETTE.cyan, cs(7));
    this.buttons.push(new Button(W / 2 - 76, 156, 68, 20, t('ui.continue'), () => {
      this.run.won = false;
      this.screen = 'blind';
    }, { color: PALETTE.blue, border: PALETTE.lightBlue }));
    this.buttons.push(new Button(W / 2 + 8, 156, 68, 20, t('ui.menu'), () => this.toMenu(), { size: cs(8, 11) }));
  }
}

// Score a blind needs, given the blind option.
// Render an engine log entry in the current language.
function formatLog(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  const p = { ...(entry.params || {}) };
  if (p.hand) p.hand = name(p.hand, 'hand');
  if (p.joker) p.joker = name(p.joker, 'joker');
  if (p.blind) p.blind = name(p.blind, 'blind');
  if (p.deck) p.deck = name(p.deck, 'deck');
  if (p.stake) p.stake = name(p.stake, 'stake');
  if (p.consumable) {
    const kind = p.consumableType === 'Tarot' ? 'tarot'
      : p.consumableType === 'Planet' ? 'planet' : 'spectral';
    p.consumable = name(p.consumable, kind);
  }
  return msg(entry.id, p);
}

/**
 * Extra parameters for a consumable's effect text.
 *
 * A Planet card levels up one poker hand, so its description has to name that
 * hand in the language the player is using.
 */
/**
 * The hands left in this blind, as "left of total".
 *
 * The total is the number of hands the blind started with, so a boss that
 * only allows one hand shows "1/1" and not "1/4".
 */
function playsLeft(run) {
  const total = Math.max(run.handsAtRoundStart ?? 0, run.handsLeft);
  return total > 0 ? `${run.handsLeft}/${total}` : `${run.handsLeft}`;
}

function consumableParams(c) {
  if (!c || c.type !== 'Planet') return null;
  const handId = PLANETS[c.name]?.hand;
  const handName = handId ? HAND_BY_ID[handId]?.name : null;
  if (!handName) return null;
  return { hand: cn() ? name(handName, 'hand') : handName };
}

/**
 * The effect text of a joker or consumable, in the current language.
 */
/**
 * The target a joker is aiming at this round, as text.
 *
 * A few jokers pick a new target at the end of every round, so the player has
 * to be able to see what it is right now.
 */
function jokerTargetText(joker) {
  const target = jokerTarget(joker);
  if (!target) return '';
  if (target.kind === 'hand') {
    const hand = HAND_BY_ID[target.hand];
    return hand ? name(hand.name, 'hand') : '';
  }
  if (target.kind === 'rank') return RANK_LABEL[target.rank];
  if (target.kind === 'suit') {
    return cn() ? name(target.suit, 'suit') : SUIT_NAMES[target.suit];
  }
  if (target.kind === 'card') return `${RANK_LABEL[target.rank]}${SUIT_SYMBOL[target.suit]}`;
  return '';
}

function itemEffect(item) {
  const kind = cardKind(item);
  if (kind === 'joker') {
    const meta = JOKER_META[item.name];
    return effect(item.name, 'joker', jokerDescription(item.name, meta ? meta.effect : ''));
  }
  if (kind === 'consumable') {
    return effect(item.name, item.type.toLowerCase(), item.desc || '', consumableParams(item));
  }
  return '';
}

/**
 * A short description of what a card inside a booster pack does.
 *
 * This is what the pack screen shows under the cards, so the player can see
 * what a card is worth before taking it.
 */
function packCardText(item) {
  const kind = cardKind(item);
  if (kind === 'playing') {
    const parts = [t('ui.packPlaying')];
    if (item.enhancement) {
      parts.push(effect(item.enhancement, 'enhancement', ENHANCEMENTS[item.enhancement]?.text || ''));
    }
    if (item.seal) parts.push(effect(item.seal, 'seal', SEALS[item.seal]?.text || ''));
    if (item.edition && item.edition !== 'base') {
      parts.push(effect(item.edition, 'edition', EDITIONS[item.edition]?.text || ''));
    }
    return parts.join(' · ');
  }
  return itemEffect(item);
}

/**
 * The label of one line of the score breakdown.
 */
function breakdownLabel(step) {
  if (step.kind === 'base') {
    const hand = cn() ? name(step.handName, 'hand') : step.handName.toUpperCase();
    return tf('score.base', hand, step.level);
  }
  if (step.kind === 'card') {
    const nm = cardName(step.card);
    const notes = (step.notes || []).map(noteLabel).filter(Boolean);
    return notes.length ? `${nm} (${notes.join(' ')})` : nm;
  }
  if (step.kind === 'held') return tf('score.held', cardName(step.card));
  if (step.kind === 'plasma') return t('score.plasma');
  if (step.kind === 'voucher') return cn() ? name(step.name, 'voucher') : step.name;
  if (step.kind === 'joker') {
    const base = cn() ? name(step.name, 'joker') : step.name.toUpperCase();
    if (step.edition && step.edition !== 'base') {
      const ed = cn() ? name(step.edition, 'edition') : step.edition.toUpperCase();
      return `${base} (${ed})`;
    }
    return base;
  }
  return '';
}

/** The short label of a card modifier: enhancement, seal or edition. */
function noteLabel(note) {
  return t(`note.${note}`);
}

/** A score number: whole numbers stay whole, the Plasma Deck does not. */
function fmtScore(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? formatNumber(r) : r.toFixed(1);
}

/** The rows of a breakdown that actually contribute something. */
function breakdownRows(br) {
  if (!br) return [];
  return (br.steps || []).filter((s) => s.chips || s.mult
    || (s.factors && s.factors.length) || s.money);
}

/**
 * Draw the score breakdown: every step of the calculation.
 *
 * Each line shows what added to the chips and the mult, and the running
 * total behind it, so the final score can be followed step by step.
 *
 * @param maxRows how many lines fit; the rest are counted in a last line.
 */
function drawBreakdown(ctx, x, y, w, maxRows, br) {
  const size = cs(6);
  const rowH = size + 1;
  const colTotal = x + w - 6;
  const colMoney = colTotal - 40;
  const colFactor = colMoney - 26;
  const colMult = colFactor - 30;
  const colChips = colMult - 36;

  const steps = breakdownRows(br);
  const rows = steps.length > maxRows ? steps.slice(0, maxRows - 1) : steps;
  const more = steps.length - rows.length;

  text(ctx, t('score.item'), x, y, PALETTE.grey, size);
  text(ctx, t('score.colChips'), colChips, y, PALETTE.grey, size, 'right');
  text(ctx, t('score.colMult'), colMult, y, PALETTE.grey, size, 'right');
  text(ctx, t('score.colTotal'), colTotal, y, PALETTE.grey, size, 'right');

  let ry = y + rowH + 2;
  for (const s of rows) {
    text(ctx, breakdownLabel(s), x, ry, PALETTE.cream, size);
    if (s.chips) {
      text(ctx, `+${fmtScore(s.chips)}`, colChips, ry, PALETTE.lightBlue, size, 'right');
    }
    if (s.mult) {
      text(ctx, `+${fmtScore(s.mult)}`, colMult, ry, PALETTE.pink, size, 'right');
    }
    if (s.factors && s.factors.length) {
      const f = s.factors.map((v) => `×${v}`).join(' ');
      text(ctx, f, colFactor, ry, PALETTE.orange, size, 'right');
    }
    if (s.money) {
      text(ctx, `+$${s.money}`, colMoney, ry, PALETTE.yellow, size, 'right');
    }
    text(ctx, `${fmtScore(s.totals.chips)} × ${fmtScore(s.totals.mult)}`,
      colTotal, ry, PALETTE.grey, size, 'right');
    ry += rowH;
  }
  if (more > 0) {
    text(ctx, tf('score.more', more), x, ry, PALETTE.grey, size);
  }
  return ry - y;
}

// ---------------------------------------------------------------------------

const DECK_NAMES = Object.keys(DECKS);

// Boot
const root = document.getElementById('stage') || document.body;
const existing = document.getElementById('game');
const game = new Game(root, existing);
window.game = game;
// Exposed for the headless smoke test and for poking at a run in the console.
window.__shop = {
  createShop, buyCard, buyPack, takeFromPack, sellCard, buyVoucherItem,
  rerollShop, computeBuyCost, computeSellValue, openPack, closeShop,
};
window.__i18n = { t, tf, name, effect, desc, msg, err, getLang, toggleLang, setLang };
