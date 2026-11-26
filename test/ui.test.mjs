// Interface source tests.
//
// Part of the interface is drawn on a canvas and part of it is built in the
// DOM, so a few rules cannot be checked by calling a function. They are
// checked by reading the sources instead - the same way the localisation
// test scans the engine for untranslated error messages.
//
//   node test/ui.test.mjs

import { readFileSync } from 'node:fs';

const mainSrc = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const rulesSrc = readFileSync(new URL('../src/ui/rules.js', import.meta.url), 'utf8');
const pixelSrc = readFileSync(new URL('../src/ui/pixel.js', import.meta.url), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; return; }
  fail++;
  failures.push(`${name}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}

// ---------------------------------------------------------------------------
// Buttons carry no keyboard hints
// ---------------------------------------------------------------------------

/**
 * The key hints are listed once, in the bar under the canvas. Repeating them
 * on every button only crowds the interface, so a button may not carry a
 * single key character as its corner note.
 */
{
  const notes = [...mainSrc.matchAll(/sub:\s*'([^']*)'/g)].map((m) => m[1]);
  const keys = notes.filter((n) => /^[A-Za-z0-9]$/.test(n));
  check('buttons have no key hints', keys, []);
}

// ---------------------------------------------------------------------------
// The Chinese interface stays Chinese
// ---------------------------------------------------------------------------

/**
 * The hand level overlay used to have a second column with the English name
 * of every poker hand. The overlay shows one language at a time now.
 */
{
  check('the hand level overlay has no english column', /\bcEn\b/.test(mainSrc), false);
}

/**
 * The rules page used to print the English name next to the Chinese one.
 * The English name stays in the search index, but it is never rendered.
 */
{
  check('the rules page renders no english names', /appendChild\(el\('span',\s*'en'/.test(rulesSrc), false);
}

/** No entry puts an English name in brackets behind the Chinese one. */
{
  const bracketed = [...rulesSrc.matchAll(/\$\{name\([^)]*\)\}\s*\(/g)].map((m) => m[0]);
  check('the rules page has no bracketed english', bracketed, []);
}

/**
 * Every heading of the rules page comes from the locale tables, so the page
 * has no hardcoded English group titles ("Seal", "Edition", "Boss Blind").
 */
{
  const groups = [...rulesSrc.matchAll(/group\(\s*'([^']*)'/g)].map((m) => m[1]);
  check('the rules page groups are localised', groups, []);
}

// ---------------------------------------------------------------------------
// The suits are drawn, not typed
// ---------------------------------------------------------------------------

/**
 * The font glyphs (♥ ♦ ♣ ♠) look blobby and differ per platform, so the cards
 * and the rules page draw the suits from their own outlines.
 */
{
  check('the cards do not print the font glyphs', /suitGlyph/.test(pixelSrc), false);
  check('the rules page does not print the font glyphs',
    /SUIT_SYMBOL/.test(rulesSrc), false);
  check('the cards draw the suits', /drawSuit\(/.test(pixelSrc), true);
}

// ---------------------------------------------------------------------------
// The end screen tells the truth about the blind that was lost
// ---------------------------------------------------------------------------

/**
 * The game over screen used to print the score of the whole run right above
 * the score the blind needed. The run score counts every blind before this
 * one, so it is always bigger than the requirement: the screen read like the
 * blind had been beaten after all. The score of the lost blind is the number
 * that belongs there, and the run score stays on its own line.
 */
{
  const fn = mainSrc.match(/gameOverInfo\(\)\s*\{([\s\S]*?)\n {2}\}/);
  const body = fn ? fn[1] : '';
  check('the end screen has the score of the blind', /run\.roundScore/.test(body), true);
  check('the end screen has the requirement', /scoreRequired/.test(body), true);
  check('the end screen keeps the run score apart',
    /total:\s*formatNumber\(run\.score\)/.test(body), true);
}

/**
 * A joker can take away from the score. The breakdown used to print the sign
 * of its own, so a joker that gave -8 mult read as "+-8", which is not a
 * number anyone can make sense of.
 */
{
  check('the breakdown prints a signed change', /fmtDelta\(s\.mult\)/.test(mainSrc), true);
  check('the breakdown prints a signed chip change', /fmtDelta\(s\.chips\)/.test(mainSrc), true);
  check('the breakdown does not print a plus before a minus',
    /`\+\$\{fmtScore\(/.test(mainSrc), false);
}

/**
 * The Green Joker counts hands played against discarded cards, so its number
 * only makes sense with both of them. The breakdown has to say which is which.
 */
{
  check('the breakdown explains the green joker',
    /noteLabel\(step\.note\)/.test(mainSrc), true);
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
