// The four suit shapes, drawn as vectors.
//
// The font glyphs (♥ ♦ ♣ ♠) look blobby at small sizes and differ from
// platform to platform, so every suit is drawn from the same outline here:
// crisp at any size and identical everywhere.
//
// The shapes live in a 100 x 100 box; each one carries the box it actually
// fills, so it can be scaled to a target height without distorting it.
//
//   drawSuit(ctx, 'H', x, y, height, color)   the canvas version
//   suitSvg('H', 16, '#e05a4a')                the same shape as SVG markup

/**
 * A circle of the shape.
 * @typedef {{ cx: number, cy: number, r: number }} SuitCircle
 */

/**
 * One path of the shape. The commands are kept as plain arrays so the same
 * data can drive the canvas and the SVG renderer:
 *   ['M', x, y]                move to
 *   ['L', x, y]                line to
 *   ['C', x1, y1, x2, y2, x, y] cubic bezier
 *   ['Z']                      close
 * @typedef {Array<Array<number|string>>} SuitPath
 */

/** The stem of the club: wide at the top, flaring out at the foot. */
const CLUB_STEM = [
  ['M', 42, 36],
  ['L', 58, 36],
  ['L', 58, 82],
  ['C', 58, 89, 62, 93, 70, 93],
  ['L', 30, 93],
  ['C', 38, 93, 42, 89, 42, 82],
  ['Z'],
];

/**
 * The stem of the spade: a narrow point that grows into a flared foot. It
 * starts inside the body, so the notch between the two lobes stays visible.
 */
const SPADE_STEM = [
  ['M', 50, 50],
  ['C', 53, 62, 54, 74, 54, 83],
  ['C', 54, 89, 58, 94, 67, 94],
  ['L', 33, 94],
  ['C', 42, 94, 46, 89, 46, 83],
  ['C', 46, 74, 47, 62, 50, 50],
  ['Z'],
];

export const SUIT_SHAPES = {
  // A heart: two rounded lobes on top, a point at the bottom.
  H: {
    bbox: [4, 6, 96, 88],
    paths: [[
      ['M', 50, 88],
      ['C', 22, 66, 4, 49, 4, 31],
      ['C', 4, 16, 16, 6, 30, 6],
      ['C', 40, 6, 47, 12, 50, 20],
      ['C', 53, 12, 60, 6, 70, 6],
      ['C', 84, 6, 96, 16, 96, 31],
      ['C', 96, 49, 78, 66, 50, 88],
      ['Z'],
    ]],
  },

  // A diamond: four straight edges.
  D: {
    bbox: [4, 2, 96, 98],
    paths: [[
      ['M', 50, 2],
      ['L', 96, 50],
      ['L', 50, 98],
      ['L', 4, 50],
      ['Z'],
    ]],
  },

  // A club: three lobes and a stem.
  C: {
    bbox: [4, 2, 96, 94],
    circles: [
      { cx: 50, cy: 24, r: 22 },
      { cx: 26, cy: 52, r: 22 },
      { cx: 74, cy: 52, r: 22 },
    ],
    paths: [CLUB_STEM],
  },

  // A spade: a heart on its head and a stem.
  S: {
    bbox: [8, 3, 92, 94],
    paths: [[
      ['M', 50, 3],
      ['C', 69, 24, 92, 42, 92, 58],
      ['C', 92, 70, 82, 78, 72, 78],
      ['C', 61, 78, 53, 70, 50, 56],
      ['C', 47, 70, 39, 78, 28, 78],
      ['C', 18, 78, 8, 70, 8, 58],
      ['C', 8, 42, 31, 24, 50, 3],
      ['Z'],
    ], SPADE_STEM],
  },
};

/** The shape of a suit, with the spade as the fallback. */
export function suitShape(suit) {
  return SUIT_SHAPES[suit] || SUIT_SHAPES.S;
}

/**
 * Draw a suit on a canvas.
 *
 * The shape is centred on (cx, cy) and `height` logical pixels tall; its
 * width follows from the shape, so a heart stays a little wider than tall.
 */
export function drawSuit(ctx, suit, cx, cy, height, color) {
  const shape = suitShape(suit);
  const [x0, y0, x1, y1] = shape.bbox;
  const k = height / (y1 - y0);
  const ox = cx - ((x0 + x1) / 2) * k;
  const oy = cy - ((y0 + y1) / 2) * k;

  ctx.save();
  ctx.fillStyle = color;
  for (const c of shape.circles || []) {
    ctx.beginPath();
    ctx.arc(ox + c.cx * k, oy + c.cy * k, c.r * k, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const path of shape.paths || []) {
    ctx.beginPath();
    for (const cmd of path) {
      const op = cmd[0];
      if (op === 'M') ctx.moveTo(ox + cmd[1] * k, oy + cmd[2] * k);
      else if (op === 'L') ctx.lineTo(ox + cmd[1] * k, oy + cmd[2] * k);
      else if (op === 'C') {
        ctx.bezierCurveTo(
          ox + cmd[1] * k, oy + cmd[2] * k,
          ox + cmd[3] * k, oy + cmd[4] * k,
          ox + cmd[5] * k, oy + cmd[6] * k,
        );
      } else if (op === 'Z') ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

/** The path of a shape as SVG path data. */
export function pathData(path) {
  const parts = [];
  for (const cmd of path) {
    const op = cmd[0];
    if (op === 'M') parts.push(`M${cmd[1]} ${cmd[2]}`);
    else if (op === 'L') parts.push(`L${cmd[1]} ${cmd[2]}`);
    else if (op === 'C') parts.push(`C${cmd[1]} ${cmd[2]} ${cmd[3]} ${cmd[4]} ${cmd[5]} ${cmd[6]}`);
    else if (op === 'Z') parts.push('Z');
  }
  return parts.join(' ');
}

/**
 * The same shape as SVG markup, for the rules page.
 *
 * @param {string} suit   'H', 'D', 'C' or 'S'
 * @param {number} height the height in CSS pixels
 * @param {string} color  the fill colour
 */
export function suitSvg(suit, height, color) {
  const shape = suitShape(suit);
  const [x0, y0, x1, y1] = shape.bbox;
  const w = (x1 - x0) * (height / (y1 - y0));
  const parts = [];
  for (const c of shape.circles || []) {
    parts.push(`<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"/>`);
  }
  for (const path of shape.paths || []) {
    parts.push(`<path d="${pathData(path)}"/>`);
  }
  return `<svg class="suit" width="${w.toFixed(2)}" height="${height.toFixed(2)}"`
    + ` viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" fill="${color}"`
    + ` aria-hidden="true">${parts.join('')}</svg>`;
}
