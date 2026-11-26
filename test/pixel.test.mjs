// Pixel rendering unit tests.
//
// The canvas helpers are exercised with a stub context so they can run in
// Node: the text metrics, the wrapping and the name splitting are pure
// functions.
//
//   node test/pixel.test.mjs

import {
  hasCJK, wrapName, wrapText, measure, fitText, chunk, enhLabel, formatJokerValue, W, H,
} from '../src/ui/pixel.js';
import { setLang } from '../src/ui/i18n.js';
import { SUIT_SHAPES, suitShape, suitSvg, pathData, drawSuit } from '../src/ui/suits.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; return; }
  fail++;
  failures.push(`${name}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}

/** A context stub whose text metrics follow a monospaced font. */
function stubCtx() {
  const calls = [];
  return {
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    calls,
    measureText(s) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const size = m ? Number(m[1]) : 8;
      return { width: String(s).length * size };
    },
    fillText() {}, clearRect() {}, fillRect() {}, save() {}, restore() {},
    drawImage() {}, setTransform() {},
    beginPath() { calls.push('beginPath'); },
    moveTo() { calls.push('moveTo'); },
    lineTo() { calls.push('lineTo'); },
    bezierCurveTo() { calls.push('bezierCurveTo'); },
    arcTo() { calls.push('arcTo'); },
    arc() { calls.push('arc'); },
    closePath() { calls.push('closePath'); },
    fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
  };
}

const ctx = stubCtx();

// ---- CJK detection ----------------------------------------------------
check('hasCJK chinese', hasCJK('回合 1/3'), true);
check('hasCJK latin', hasCJK('ROUND 1/3'), false);
check('hasCJK mixed', hasCJK('底注 1'), true);
check('hasCJK empty', hasCJK(''), false);

// ---- metrics -----------------------------------------------------------
check('measure follows the font size', measure(ctx, 'ABC', 8), 24);
check('measure empty', measure(ctx, '', 8), 0);
check('chunk splits', chunk('ABCDEFG', 3), ['ABC', 'DEF', 'G']);
check('surface size', [W, H], [428, 240]);

// ---- wrapping ----------------------------------------------------------
// Latin wraps on word boundaries.
check('wrapText latin', wrapText(ctx, 'Beat the blind for a reward', 100, 6),
  ['Beat the blind', 'for a reward']);
// Chinese has no spaces, so it wraps between characters.
check('wrapText chinese', wrapText(ctx, '击败盲注奖励较少', 40, 6),
  ['击败盲注奖励', '较少']);
check('wrapText empty', wrapText(ctx, '', 100, 6), []);

// ---- name wrapping -----------------------------------------------------
// Names break on word boundaries when they fit, and are split evenly when
// they do not.
check('wrapName latin fits', wrapName(ctx, 'Joker', 60, 8), ['Joker']);
check('wrapName latin splits', wrapName(ctx, 'THE MAGICIAN', 40, 8), ['THE', 'MAGICIAN']);
check('wrapName cjk one line', wrapName(ctx, '小丑', 40, 8), ['小丑']);
check('wrapName cjk even split', wrapName(ctx, '稳重的史蒂文', 30, 8), ['稳重的', '史蒂文']);
// A four character name is split two and two, not three and one.
check('wrapName cjk balanced', wrapName(ctx, '黄金小丑', 24, 8), ['黄金', '小丑']);

// ---- fitting ------------------------------------------------------------
// A label that must not run into its neighbour is shortened with an ellipsis.
check('fitText keeps a short string', fitText(ctx, 'ABC', 20, 6), 'ABC');
check('fitText shortens a long string', fitText(ctx, 'ABCDEFGH', 20, 6), 'AB…');
check('fitText empty', fitText(ctx, '', 20, 6), '');
check('fitText no room', fitText(ctx, 'ABC', 0, 6), '');

// ---- enhancement labels -------------------------------------------------
// The tag under a playing card comes from the locale table, never from a
// hardcoded English string.
check('enhLabel chinese', enhLabel('wild'), '万能');
check('enhLabel chinese short', enhLabel('mult'), '倍率');
setLang('en');
check('enhLabel latin upper case', enhLabel('bonus'), 'BONUS');
check('enhLabel latin', enhLabel('glass'), 'GLASS');
setLang('zh');

// ---- the four suits --------------------------------------------------------
// The suits are drawn from their own outlines, not from the font glyphs, so
// they look the same everywhere and stay sharp at every size.
{
  check('every suit has a shape', ['H', 'D', 'C', 'S'].every((s) => !!suitShape(s)), true);
  check('an unknown suit falls back to the spade', suitShape('X'), SUIT_SHAPES.S);
  const bad = [];
  for (const [suit, shape] of Object.entries(SUIT_SHAPES)) {
    const [x0, y0, x1, y1] = shape.bbox;
    if (!(x0 < x1 && y0 < y1)) bad.push(`${suit} bbox`);
    const parts = (shape.paths || []).length + (shape.circles || []).length;
    if (!parts) bad.push(`${suit} is empty`);
    for (const path of shape.paths || []) {
      const d = pathData(path);
      if (!d.startsWith('M') || !d.endsWith('Z')) bad.push(`${suit} path`);
    }
  }
  check('the suit shapes are well formed', bad, []);
  // The club and the spade need their stem, or they read as a blob.
  check('the club has a stem', SUIT_SHAPES.C.paths.length > 0, true);
  check('the spade has a stem', SUIT_SHAPES.S.paths.length > 1, true);

  const svg = suitSvg('S', 16, '#000');
  check('the svg markup is complete',
    svg.startsWith('<svg') && svg.includes('viewBox=') && svg.includes('</svg>'), true);

  // Drawing a suit fills one path per shape part.
  const c = stubCtx();
  drawSuit(c, 'C', 10, 10, 8, '#fff');
  check('the club is drawn with its circles and its stem',
    c.calls.filter((x) => x === 'arc').length, 3);
  check('the club is filled for every part',
    c.calls.filter((x) => x === 'fill').length, 4);
  check('the fill colour is used', c.fillStyle, '#fff');
}

// ---------------------------------------------------------------------------
// The value on a joker card
// ---------------------------------------------------------------------------

/**
 * The jokers that grow show what they are worth right now. Chips are blue,
 * mult is pink and an x mult is orange, the same way the breakdown colours
 * them, so the number alone has to be readable.
 */
{
  check('a mult value reads +12', formatJokerValue({ kind: 'mult', value: 12 }), '+12');
  check('a chip value reads 85', formatJokerValue({ kind: 'chips', value: 85 }), '85');
  check('an x mult value reads X1.5', formatJokerValue({ kind: 'xmult', value: 1.5 }), 'X1.5');
  check('an x mult keeps its decimals', formatJokerValue({ kind: 'xmult', value: 2.25 }), 'X2.25');
  check('a joker with no value shows nothing', formatJokerValue(null), '');
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
