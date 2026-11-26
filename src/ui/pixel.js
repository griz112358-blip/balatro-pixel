// Rendering primitives: surfaces, shapes, text and cards.
//
// The canvas is a supersampled surface: the backing store holds SS*DPR
// device pixels for every logical pixel, so the game is drawn 1:1 with the
// screen and the platform font renders crisp, anti-aliased text.
//
// The layout grid is still 428x240 logical pixels; every drawing call works
// in those coordinates and the context transform does the scaling.

import { name } from './i18n.js';
import { cardName, cardKind, RANK_LABEL } from '../engine/cards.js';
import { HAND_BY_ID } from '../engine/hands.js';
import { jokerTarget } from '../engine/jokers.js';
import { drawSuit } from './suits.js';

export const W = 428;
export const H = 240;

/** Default device pixels per logical pixel. */
export const SCALE = 3;

// A clean system stack: the UI is drawn at device resolution, so the text
// comes from the platform font rather than a bitmap face.
export const FONT = 'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif';

export const PALETTE = {
  bg: '#12101c',
  bg2: '#1c1930',
  panel: '#2a2440',
  panelDark: '#1a1730',
  panelLight: '#3a3158',
  outline: '#0c0a14',
  white: '#f4f1e8',
  cream: '#e8dfc8',
  grey: '#8b8399',
  dark: '#3a3450',
  blue: '#4a7bd6',
  lightBlue: '#7fa8ff',
  red: '#e05a4a',
  lightRed: '#ff8a76',
  green: '#4fbf6a',
  lightGreen: '#7fe89a',
  yellow: '#f5c542',
  orange: '#f08a3c',
  purple: '#a25fd6',
  pink: '#f07ab0',
  cyan: '#4ac8d6',
  gold: '#ffd94a',
  silver: '#c9d4e0',
};

export const SUIT_COLOR = {
  H: PALETTE.red,
  D: PALETTE.red,
  C: PALETTE.dark,
  S: PALETTE.dark,
};

// The suits on a dark joker card need light ink, or they cannot be seen.
export const SUIT_INK = {
  H: PALETTE.lightRed,
  D: PALETTE.lightRed,
  C: PALETTE.cream,
  S: PALETTE.cream,
};

// ---------------------------------------------------------------------------
// Render surface

/** Device pixels per logical pixel (excluding the device pixel ratio). */
export let SS = SCALE;
/** Device pixel ratio the surface was built for. */
export let DPR = 1;

/** Create the canvas element (sizing happens in setupSurface). */
export function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.style.imageRendering = 'pixelated';
  return canvas;
}

/**
 * Turn a canvas into the render surface.
 *
 * The backing store holds `scale` device pixels for every logical pixel and
 * the element is displayed at exactly that size, so the browser never
 * resamples the picture: the game is drawn 1:1 with the screen. The scale may
 * be a fraction, which is what lets a tablet or a phone use the whole screen.
 *
 * @param scale device pixels per logical pixel (may be fractional)
 * @param dpr device pixel ratio of the display
 */
export function setupSurface(canvas, scale = SCALE, dpr = 1) {
  SS = Math.max(0.1, scale);
  DPR = Math.max(1, dpr || 1);
  canvas.width = Math.max(1, Math.round(W * SS * DPR));
  canvas.height = Math.max(1, Math.round(H * SS * DPR));
  canvas.style.width = `${canvas.width / DPR}px`;
  canvas.style.height = `${canvas.height / DPR}px`;
  const ctx = canvas.getContext('2d');
  // Every drawing call works in logical 428x240 coordinates.
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.textBaseline = 'top';
  return ctx;
}

// ---------------------------------------------------------------------------

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function frame(ctx, x, y, w, h, color, t = 1) {
  rect(ctx, x, y, w, t, color);
  rect(ctx, x, y + h - t, w, t, color);
  rect(ctx, x, y, t, h, color);
  rect(ctx, x + w - t, y, t, h, color);
}

export function panel(ctx, x, y, w, h, fill = PALETTE.panel, border = PALETTE.outline) {
  rect(ctx, x, y, w, h, fill);
  frame(ctx, x, y, w, h, border, 1);
  // inner highlight
  rect(ctx, x + 1, y + 1, w - 2, 1, 'rgba(255,255,255,0.08)');
}

/** A filled circle. */
export function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A rectangle with rounded corners, as a path.
 *
 * Playing cards have rounded corners, so the cards are drawn with this
 * instead of the square `rect`.
 */
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * The top of a card: the two upper corners are rounded, the bottom is square.
 * Used for the colour strip along the top of a joker card.
 */
export function topRoundPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/** A filled rectangle with rounded corners and an optional border. */
export function roundRect(ctx, x, y, w, h, r, fill, border = null, borderWidth = 1) {
  roundRectPath(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
  }
}

/** Draw a bitmap glyph (rows of characters, '#' marks a filled pixel). */
export function glyph(ctx, g, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  for (let ry = 0; ry < g.length; ry++) {
    for (let rx = 0; rx < g[ry].length; rx++) {
      if (g[ry][rx] === '#') {
        ctx.fillRect(x + rx * scale, y + ry * scale, scale, scale);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Text

/** Ranges that need a CJK capable font. */
const CJK_RE = /[\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;

/** True when the string contains characters the Latin font cannot draw. */
export function hasCJK(str) {
  return CJK_RE.test(String(str ?? ''));
}

/**
 * Smallest size a Chinese glyph stays readable at. The surface is
 * supersampled, so this is a logical size: eight logical pixels are 24
 * device pixels on a 3x screen.
 */
export const CJK_MIN = 8;

/**
 * Text with a soft shadow, for readability on busy backgrounds.
 *
 * Everything is drawn straight onto the surface, which is supersampled, so
 * the platform font renders the glyphs at full device resolution.
 */
export function text(ctx, str, x, y, color = PALETTE.white, size = 8, align = 'left', shadow = true) {
  const s = String(str ?? '');
  if (!s) return;
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (shadow) {
    // One device pixel, not one logical pixel.
    const k = 1 / (SS * DPR);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(s, x + k, y + k);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** The width of a string in logical pixels. */
export function measure(ctx, str, size) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  const w = ctx.measureText(String(str ?? '')).width;
  ctx.restore();
  return w;
}

/**
 * Shorten a string until it fits into `maxWidth`, ending in an ellipsis.
 *
 * Used for one-line labels that must not run into whatever is drawn next to
 * them, like the effect of a boss blind in the top bar.
 */
export function fitText(ctx, str, maxWidth, size = 8) {
  const s = String(str ?? '');
  if (!s || maxWidth <= 0) return '';
  if (measure(ctx, s, size) <= maxWidth) return s;
  const dots = '…';
  let out = '';
  for (const ch of s) {
    if (measure(ctx, out + ch + dots, size) > maxWidth) break;
    out += ch;
  }
  return out ? out + dots : '';
}

/** Split a string into lines of at most `max` characters. */
export function chunk(str, max) {
  const s = String(str);
  const out = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out;
}

/**
 * Wrap a name into at most `maxLines` lines that each fit `maxWidth`.
 * Latin names break on word boundaries, Chinese names have no spaces and
 * are broken per character. A Chinese name that needs two lines is split
 * evenly, so "黄金小丑" becomes "黄金" / "小丑" instead of "黄金小" / "丑".
 */
export function wrapName(ctx, str, maxWidth, size, maxLines = 2) {
  const s = String(str);
  if (!s) return [];
  if (hasCJK(s) && !/[A-Za-z0-9]/.test(s)) return balanceCJK(ctx, s, maxWidth, size, maxLines);

  const lines = [];
  let line = '';
  for (const atom of tokenize(s)) {
    const test = line + atom;
    if (line && measure(ctx, test, size) > maxWidth) {
      lines.push(line.replace(/\s+$/, ''));
      if (lines.length >= maxLines) return lines;
      line = atom.replace(/^\s+/, '');
    } else {
      line = test;
    }
  }
  const tail = line.replace(/\s+$/, '');
  if (tail) lines.push(tail);
  return lines.slice(0, maxLines);
}

/** Split a Chinese name into equally long lines. */
function balanceCJK(ctx, s, maxWidth, size, maxLines) {
  const chars = [...s];
  let perLine = 0;
  while (perLine < chars.length
    && measure(ctx, chars.slice(0, perLine + 1).join(''), size) <= maxWidth) perLine++;
  if (perLine <= 0) return [s];
  const lineCount = Math.min(maxLines, Math.ceil(chars.length / perLine));
  const base = Math.floor(chars.length / lineCount);
  const extra = chars.length % lineCount;
  const lines = [];
  let i = 0;
  for (let l = 0; l < lineCount; l++) {
    const take = base + (l < extra ? 1 : 0);
    lines.push(chars.slice(i, i + take).join(''));
    i += take;
  }
  return lines;
}

/**
 * Word-wrap helper. Chinese text has no spaces, so it is broken between
 * characters instead.
 */
export function wrapText(ctx, str, maxWidth, size = 8) {
  const s = String(str ?? '');
  if (!s) return [];
  const lines = [];
  let line = '';
  for (const atom of tokenize(s)) {
    const test = line + atom;
    if (line && measure(ctx, test, size) > maxWidth) {
      lines.push(line.replace(/\s+$/, ''));
      line = atom.replace(/^\s+/, '');
    } else {
      line = test;
    }
  }
  const tail = line.replace(/\s+$/, '');
  if (tail) lines.push(tail);
  return lines;
}

/** Split a string into wrappable atoms: words keep their trailing space. */
function tokenize(str) {
  const out = [];
  let buf = '';
  for (const ch of str) {
    if (hasCJK(ch)) {
      if (buf) { out.push(buf); buf = ''; }
      out.push(ch);
    } else if (ch === ' ') {
      out.push(buf + ch);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

// ---------------------------------------------------------------------------
// Cards

export const CARD_W = 26;
export const CARD_H = 36;

const ENH_STYLE = {
  bonus: { frame: PALETTE.blue },
  mult: { frame: PALETTE.red },
  glass: { frame: PALETTE.lightBlue },
  steel: { frame: PALETTE.silver },
  stone: { frame: PALETTE.grey },
  gold: { frame: PALETTE.gold },
  lucky: { frame: PALETTE.green },
  wild: { frame: PALETTE.purple },
};

/**
 * The localised label of an enhancement.
 *
 * Chinese needs a taller tag: two glyphs at the minimum readable size do not
 * fit in the five pixel strip the Latin label uses.
 */
export function enhLabel(enh) {
  const label = name(enh, 'enhancement');
  return hasCJK(label) ? label : String(label).toUpperCase();
}

const SEAL_COLOR = {
  red: PALETTE.red,
  gold: PALETTE.gold,
  blue: PALETTE.blue,
  purple: PALETTE.purple,
};

const EDITION_STYLE = {
  foil: PALETTE.silver,
  holographic: PALETTE.cyan,
  polychrome: PALETTE.pink,
  negative: PALETTE.dark,
  base: null,
};

/**
 * Draw a playing card.
 * @param opts { selected, faceDown, debuffed, tiny, scale }
 */
export function drawCard(ctx, card, x, y, opts = {}) {
  const s = opts.scale || 1;
  const w = CARD_W * s;
  const h = CARD_H * s;
  const sel = opts.selected;
  const oy = sel ? -4 * s : 0;
  const r = 3 * s;

  // shadow
  // The shadow follows the rounded shape, so it never peeks out.
  roundRect(ctx, x + 2 * s, y + oy + 3 * s, w, h, 3 * s, 'rgba(0,0,0,0.35)');

  if (opts.faceDown) {
    roundRect(ctx, x, y + oy, w, h, r, '#3b2f5e');
    roundRectPath(ctx, x + 1.5 * s, y + oy + 1.5 * s, w - 3 * s, h - 3 * s, r - 1.5 * s);
    ctx.strokeStyle = '#6b5aa8';
    ctx.lineWidth = s;
    ctx.stroke();
    // little diamond pattern
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        drawSuit(ctx, 'D', x + (8 + i * 7) * s, y + oy + (12 + j * 12) * s, 3.5 * s, '#8f7fd0');
      }
    }
    return { w, h };
  }

  const enh = card.enhancement ? ENH_STYLE[card.enhancement] : null;
  const body = enh ? shade(PALETTE.cream, enh.frame, 0.22) : PALETTE.cream;

  // A playing card has rounded corners. The outline and the face are two
  // concentric shapes: stroking the outline instead would leave a one pixel
  // seam where the rounded corner meets the straight edge.
  const inset = enh ? 2 : 1;
  roundRect(ctx, x, y + oy, w, h, r, PALETTE.outline);
  if (enh) roundRect(ctx, x + s, y + oy + s, w - 2 * s, h - 2 * s, r - s, enh.frame);
  roundRect(ctx, x + inset * s, y + oy + inset * s,
    w - 2 * inset * s, h - 2 * inset * s, r - inset * s, body);

  if (card.debuffed) {
    roundRect(ctx, x, y + oy, w, h, r, 'rgba(30,28,45,0.72)');
  }

  const col = card.debuffed ? PALETTE.grey : (SUIT_COLOR[card.suit] || PALETTE.dark);
  const label = card.rank === 14 ? 'A' : card.rank === 11 ? 'J'
    : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : String(card.rank);

  // The index in the top left corner: the rank with a small suit under it.
  text(ctx, label, x + 3.5 * s, y + oy + 1 * s, col, 9 * s, 'left', false);
  drawSuit(ctx, card.suit, x + 6.5 * s, y + oy + 13 * s, 7 * s, col);

  // The big suit in the middle of the card, the way a real card is printed.
  const tagH = enh ? (hasCJK(enhLabel(card.enhancement)) ? 8 * s : 5 * s) : 0;
  const bodyTop = y + oy + 17 * s;
  const bodyBottom = y + oy + h - tagH;
  const size = Math.max(7 * s, Math.min(bodyBottom - bodyTop - 3 * s, 16 * s));
  drawSuit(ctx, card.suit, x + w / 2, (bodyTop + bodyBottom) / 2, size, col);

  // Stone cards have no rank/suit
  if (card.enhancement === 'stone') {
    roundRect(ctx, x + 3 * s, y + oy + 3 * s, 10 * s, 24 * s, 1.5 * s, PALETTE.grey);
    text(ctx, 'S', x + 6 * s, y + oy + 9 * s, PALETTE.panelDark, 8 * s, 'left', false);
  }

  // Seal badge
  if (card.seal) {
    roundRect(ctx, x + w - 7 * s, y + oy + 2 * s, 5 * s, 5 * s, 1.5 * s,
      SEAL_COLOR[card.seal], PALETTE.outline, 1 * s);
  }
  // Edition badge
  if (card.edition && EDITION_STYLE[card.edition]) {
    roundRect(ctx, x + w - 7 * s, y + oy + 8 * s, 5 * s, 5 * s, 1.5 * s,
      EDITION_STYLE[card.edition], PALETTE.outline, 1 * s);
  }
  // Enhancement tag
  if (enh) {
    const label = enhLabel(card.enhancement);
    const cjk = hasCJK(label);
    const tagSize = cjk ? 8 * s
      : (measure(ctx, label, 5 * s) > w - 6 * s ? 4 * s : 5 * s);
    roundRect(ctx, x + 2 * s, y + oy + h - 1 * s - tagH, w - 4 * s, tagH, 1.5 * s, enh.frame);
    text(ctx, label, x + w / 2, y + oy + h - 1 * s - tagH + (tagH - tagSize) / 2,
      PALETTE.panelDark, tagSize, 'center', false);
  }

  // Bonus chips / mult from Hiker etc.
  if (card.bonusChips) {
    text(ctx, `+${card.bonusChips}`, x + w - 2 * s, y + oy + h - 12 * s, PALETTE.lightBlue, 5 * s, 'right', false);
  }
  return { w, h };
}

/** A joker / consumable card, wider and shorter than a playing card. */
export const JOKER_W = 30;
export const JOKER_H = 40;

/** Localised display name for anything that can appear as a card. */
export function displayName(card) {
  if (!card) return '';
  const kind = cardKind(card);
  if (kind === 'playing') {
    const base = cardName(card);
    return card.enhancement ? `${base} (${enhLabel(card.enhancement)})` : base;
  }
  if (!card.name) return '';
  if (kind === 'joker') return name(card.name, 'joker');
  if (kind === 'voucher') return name(card.name, 'voucher');
  if (card.type === 'Tarot') return name(card.name, 'tarot');
  if (card.type === 'Planet') return name(card.name, 'planet');
  if (card.type === 'Spectral') return name(card.name, 'spectral');
  return card.name;
}

/**
 * The number a joker has grown to: "+12", "85" or "X1.5".
 *
 * Chips are blue, mult is pink and an x mult is orange, the same way the
 * score breakdown colours them.
 */
export function formatJokerValue(value) {
  if (!value) return '';
  if (value.kind === 'xmult') return `X${Math.round(value.value * 100) / 100}`;
  if (value.kind === 'chips') return String(Math.round(value.value));
  return `+${Math.round(value.value)}`;
}

/**
 * The picture on a joker card.
 *
 * Most jokers get a jester hat, but the ones that aim at a target show that
 * target instead: the poker hand, the rank or the suit they want this round.
 * The target changes at the end of every round, so it has to be on the card.
 * A joker that grows shows what it is worth now instead of the hat.
 */
function drawJokerIcon(ctx, card, x, y, s, color, value) {
  const target = jokerTarget(card);
  if (!target && value) {
    const ink = value.kind === 'chips' ? PALETTE.lightBlue
      : value.kind === 'xmult' ? PALETTE.orange : PALETTE.pink;
    text(ctx, formatJokerValue(value), x + 15 * s, y + 9 * s, ink, 8 * s, 'center', false);
    return;
  }
  if (!target) {
    // a jester hat: a cone with a bell on either side
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 10 * s, y + 17 * s);
    ctx.lineTo(x + 15 * s, y + 6 * s);
    ctx.lineTo(x + 20 * s, y + 17 * s);
    ctx.closePath();
    ctx.fill();
    circle(ctx, x + 15 * s, y + 6 * s, 2 * s, PALETTE.gold);
    circle(ctx, x + 9 * s, y + 10 * s, 1.6 * s, PALETTE.gold);
    circle(ctx, x + 21 * s, y + 10 * s, 1.6 * s, PALETTE.gold);
    return;
  }
  if (target.kind === 'suit') {
    drawSuit(ctx, target.suit, x + 15 * s, y + 12 * s, 12 * s, SUIT_INK[target.suit]);
  } else if (target.kind === 'card') {
    text(ctx, RANK_LABEL[target.rank], x + 15 * s, y + 5 * s, PALETTE.white, 7 * s, 'center', false);
    drawSuit(ctx, target.suit, x + 15 * s, y + 15 * s, 6 * s, SUIT_INK[target.suit]);
  } else if (target.kind === 'rank') {
    text(ctx, RANK_LABEL[target.rank], x + 15 * s, y + 6 * s, PALETTE.white, 11 * s, 'center', false);
  } else {
    const hand = HAND_BY_ID[target.hand];
    const label = hand ? name(hand.name, 'hand') : '';
    text(ctx, label, x + 15 * s, y + 9 * s, PALETTE.white,
      (hasCJK(label) ? 5 : 6) * s, 'center', false);
  }
}

export function drawJokerCard(ctx, card, x, y, opts = {}) {
  const s = opts.scale || 1;
  const w = JOKER_W * s;
  const h = JOKER_H * s;
  const oy = opts.selected ? -4 * s : 0;
  const r = 3 * s;

  // The shadow follows the rounded shape, so it never peeks out.
  roundRect(ctx, x + 2 * s, y + oy + 3 * s, w, h, 3 * s, 'rgba(0,0,0,0.35)');

  const isJoker = cardKind(card) === 'joker';
  const body = isJoker ? '#2b2140' : (card.type === 'Tarot' ? '#2d1f45'
    : card.type === 'Planet' ? '#152c3f' : '#16283d');
  roundRect(ctx, x, y + oy, w, h, r, PALETTE.outline);
  // The face sits one pixel inside the outline.
  roundRect(ctx, x + s, y + oy + s, w - 2 * s, h - 2 * s, r - s, body);

  const accent = isJoker ? PALETTE.orange
    : card.type === 'Tarot' ? PALETTE.purple
      : card.type === 'Planet' ? PALETTE.cyan : PALETTE.blue;
  // The colour strip along the top shares the rounded corners of the card
  // and covers the upper corners of the face.
  topRoundPath(ctx, x, y + oy, w, 4 * s, r);
  ctx.fillStyle = accent;
  ctx.fill();

  // icon area
  const iconColor = isJoker ? PALETTE.pink : accent;
  if (isJoker) {
    drawJokerIcon(ctx, card, x, y + oy, s, iconColor, opts.value);
  } else if (card.type === 'Tarot') {
    rect(ctx, x + 9 * s, y + oy + 7 * s, 12 * s, 15 * s, '#4a3570');
    frame(ctx, x + 9 * s, y + oy + 7 * s, 12 * s, 15 * s, PALETTE.purple, 1 * s);
    circle(ctx, x + 15 * s, y + oy + 14 * s, 4 * s, PALETTE.pink);
  } else if (card.type === 'Planet') {
    circle(ctx, x + 15 * s, y + oy + 12 * s, 3.6 * s, PALETTE.cyan);
    rect(ctx, x + 8 * s, y + oy + 17 * s, 14 * s, 2 * s, PALETTE.lightBlue);
  } else {
    rect(ctx, x + 10 * s, y + oy + 7 * s, 10 * s, 15 * s, '#2a4a70');
    frame(ctx, x + 10 * s, y + oy + 7 * s, 10 * s, 15 * s, PALETTE.blue, 1 * s);
    circle(ctx, x + 15 * s, y + oy + 14 * s, 3.4 * s, PALETTE.lightBlue);
  }

  // name, wrapped over up to two lines
  const label = displayName(card);
  const nameSize = (hasCJK(label) ? 8 : 6) * s;
  const nameLines = wrapName(ctx, label, w - 5 * s, nameSize, 2);
  const nameTop = y + oy + (nameLines.length > 1 ? 20 : 25) * s;
  nameLines.forEach((ln, i) => {
    text(ctx, ln, x + w / 2, nameTop + i * (nameSize + 2), PALETTE.white, nameSize, 'center', false);
  });

  // edition / sticker
  if (card.edition && EDITION_STYLE[card.edition]) {
    rect(ctx, x + 2.5 * s, y + oy + h - 4 * s, w - 5 * s, 3 * s, EDITION_STYLE[card.edition]);
  }
  if (card.eternal) {
    roundRect(ctx, x + w - 5 * s, y + oy + h - 8 * s, 4 * s, 4 * s, 1.5 * s, PALETTE.dark);
  }
  if (card.perishable) {
    roundRect(ctx, x + w - 9 * s, y + oy + h - 8 * s, 4 * s, 4 * s, 1.5 * s, PALETTE.orange);
  }
  if (card.rental) {
    roundRect(ctx, x + w - 13 * s, y + oy + h - 8 * s, 4 * s, 4 * s, 1.5 * s, PALETTE.silver);
  }
  return { w, h };
}

// ---------------------------------------------------------------------------

function shade(base, tint, amount) {
  const b = hexToRgb(base);
  const t = hexToRgb(tint);
  const r = Math.round(b[0] + (t[0] - b[0]) * amount);
  const g = Math.round(b[1] + (t[1] - b[1]) * amount);
  const bl = Math.round(b[2] + (t[2] - b[2]) * amount);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(h) {
  const s = h.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

export function formatNumber(n) {
  if (n === Infinity) return 'Infinity';
  if (Number.isNaN(n)) return 'NaN';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return n.toLocaleString('en-US');
  return String(Math.round(n));
}

export { cardKind };
