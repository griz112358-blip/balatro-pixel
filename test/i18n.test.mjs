// Localisation coverage tests.
//
// Every piece of content the game can show must have a Chinese translation,
// otherwise the Chinese build falls back to English and looks half-finished.
//
//   node test/i18n.test.mjs

import { ZH } from '../src/data/zh.js';
import { EN } from '../src/data/en.js';
import { readFileSync, readdirSync } from 'node:fs';
import { JOKER_DATA } from '../src/data/jokers.js';
import { JOKER_DESCRIPTIONS } from '../src/data/descriptions.js';
import { TAROTS, SPECTRALS, PLANETS, VOUCHERS } from '../src/engine/consumables.js';
import { HANDS } from '../src/engine/hands.js';
import { STAKES, BOSS_BLINDS, SHOWDOWN_BLINDS, BLIND_TYPE } from '../src/engine/blinds.js';
import { DECKS } from '../src/engine/run.js';
import { TAGS } from '../src/engine/tags.js';
import { ENHANCEMENTS, SEALS, EDITIONS } from '../src/engine/cards.js';
import { PACK_TYPES, PACK_SIZES } from '../src/engine/shop.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; return; }
  fail++;
  failures.push(`${name}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}

/** Every key of the English table must exist in the Chinese table. */
{
  const missing = Object.keys(EN).filter((k) => !(k in ZH));
  check('en keys missing in zh', missing, []);
}

/** The Chinese table must not contain keys the English table lacks. */
{
  const extra = Object.keys(ZH).filter((k) => !(k in EN) && !/^(name|effect|desc|err|log)\./.test(k));
  check('zh keys missing in en', extra, []);
}

/** Jokers: name + effect. */
{
  const missingName = [];
  const missingEffect = [];
  for (const j of JOKER_DATA) {
    if (!(ZH[`name.joker.${j.name}`])) missingName.push(j.name);
    const desc = JOKER_DESCRIPTIONS[j.name] || j.effect || '';
    if (desc && !(ZH[`effect.joker.${j.name}`])) missingEffect.push(j.name);
  }
  check('joker names missing', missingName, []);
  check('joker effects missing', missingEffect, []);
}

/** Decks: name + description. */
{
  const missingName = [];
  const missingDesc = [];
  for (const [key, deck] of Object.entries(DECKS)) {
    if (!(ZH[`name.deck.${key}`])) missingName.push(key);
    if (deck.desc && !(ZH[`desc.deck.${key}`])) missingDesc.push(key);
  }
  check('deck names missing', missingName, []);
  check('deck descriptions missing', missingDesc, []);
}

/** Stakes: name + description. */
{
  const missingName = [];
  const missingDesc = [];
  for (const s of STAKES) {
    if (!(ZH[`name.stake.${s.name}`])) missingName.push(s.name);
    if (s.desc && !(ZH[`desc.stake.${s.name}`])) missingDesc.push(s.name);
  }
  check('stake names missing', missingName, []);
  check('stake descriptions missing', missingDesc, []);
}

/** Blinds: name + description. */
{
  const missingName = [];
  const missingDesc = [];
  const blinds = [...BOSS_BLINDS, ...SHOWDOWN_BLINDS];
  for (const b of blinds) {
    if (!(ZH[`name.blind.${b.name}`])) missingName.push(b.name);
    if (b.desc && !(ZH[`desc.blind.${b.name}`])) missingDesc.push(b.name);
  }
  for (const [id, b] of Object.entries(BLIND_TYPE)) {
    if (!(ZH[`name.blind.${b.name}`])) missingName.push(b.name);
  }
  check('blind names missing', missingName, []);
  check('blind descriptions missing', missingDesc, []);
}

/** Hands: name. */
{
  const missing = HANDS.filter((h) => !(ZH[`name.hand.${h.name}`])).map((h) => h.name);
  check('hand names missing', missing, []);
}

/** Tarot / spectral / planet / voucher: name + effect. */
{
  const missing = { tarot: [], spectral: [], planet: [], voucher: [] };
  for (const [k, c] of Object.entries(TAROTS)) {
    if (!(ZH[`name.tarot.${k}`])) missing.tarot.push(k);
    if (c.desc && !(ZH[`effect.tarot.${k}`])) missing.tarot.push(`${k} (effect)`);
  }
  for (const [k, c] of Object.entries(SPECTRALS)) {
    if (!(ZH[`name.spectral.${k}`])) missing.spectral.push(k);
    if (c.desc && !(ZH[`effect.spectral.${k}`])) missing.spectral.push(`${k} (effect)`);
  }
  for (const [k, c] of Object.entries(PLANETS)) {
    if (!(ZH[`name.planet.${k}`])) missing.planet.push(k);
    if (c.desc && !(ZH[`effect.planet.${k}`])) missing.planet.push(`${k} (effect)`);
  }
  for (const [k, c] of Object.entries(VOUCHERS)) {
    if (!(ZH[`name.voucher.${k}`])) missing.voucher.push(k);
    if (c.desc && !(ZH[`effect.voucher.${k}`])) missing.voucher.push(`${k} (effect)`);
  }
  check('tarot missing', missing.tarot, []);
  check('spectral missing', missing.spectral, []);
  check('planet missing', missing.planet, []);
  check('voucher missing', missing.voucher, []);
}

/** Tags: name + description. */
{
  const missingName = [];
  const missingDesc = [];
  for (const [id, tag] of Object.entries(TAGS)) {
    if (!(ZH[`name.tag.${tag.name}`])) missingName.push(tag.name);
    if (tag.desc && !(ZH[`desc.tag.${tag.name}`])) missingDesc.push(tag.name);
  }
  check('tag names missing', missingName, []);
  check('tag descriptions missing', missingDesc, []);
}

/**
 * Planet cards: the effect names the poker hand that gets levelled up, so
 * every planet needs a template with a {hand} slot in both locales.
 */
{
  const missing = [];
  const noSlot = [];
  for (const k of Object.keys(PLANETS)) {
    if (!(ZH[`effect.planet.${k}`])) missing.push(k);
    else if (!/\{hand\}/.test(ZH[`effect.planet.${k}`])) noSlot.push(k);
    if (!(EN[`effect.planet.${k}`])) missing.push(`${k} (en)`);
  }
  check('planet effects missing', missing, []);
  check('planet effects without hand slot', noSlot, []);
}

/** Enhancements, seals and editions: label + effect text. */
{
  const missing = [];
  for (const kind of ['enhancement', 'seal', 'edition']) {
    const table = kind === 'enhancement' ? ENHANCEMENTS
      : kind === 'seal' ? SEALS : EDITIONS;
    for (const key of Object.keys(table)) {
      if (!(ZH[`name.${kind}.${key}`])) missing.push(`name.${kind}.${key}`);
      if (table[key].text && !(ZH[`effect.${kind}.${key}`])) missing.push(`effect.${kind}.${key}`);
      if (table[key].text && !(EN[`effect.${kind}.${key}`])) missing.push(`effect.${kind}.${key} (en)`);
    }
  }
  check('card modifier translations missing', missing, []);
}

/** Consumable types and booster pack types. */
{
  const missing = [];
  for (const type of ['Tarot', 'Planet', 'Spectral']) {
    if (!(ZH[`name.consumableType.${type}`])) missing.push(`name.consumableType.${type}`);
  }
  for (const type of PACK_TYPES) {
    if (!(ZH[`name.pack.${type}`])) missing.push(`name.pack.${type}`);
    if (!(ZH[`ui.packHint.${type}`])) missing.push(`ui.packHint.${type}`);
  }
  for (const size of PACK_SIZES) {
    if (!(ZH[`name.pack.${size}`])) missing.push(`name.pack.${size}`);
  }
  check('pack translations missing', missing, []);
}

/**
 * Every error the engine can return must have a Chinese translation.
 *
 * The engine hands out plain English messages and the interface looks them up
 * as `err.<message>`, so a message without a translation pops up in English in
 * the middle of the Chinese build.
 */
{
  const dir = new URL('../src/engine/', import.meta.url);
  const missing = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    for (const line of src.split('\n')) {
      if (!line.includes('error:')) continue;
      for (const m of line.matchAll(/'([^']+)'/g)) {
        const text = m[1];
        // Ids like 'the_eye' are not messages.
        if (/^[a-z0-9_]+$/.test(text)) continue;
        if (!ZH[`err.${text}`]) missing.push(`${file}: ${text}`);
      }
    }
  }
  check('engine errors missing', missing, []);
}

/**
 * The unlock condition of every joker that has one.
 *
 * The scraped wiki text is English and sometimes lost the link it pointed at
 * ("Discard a ."), so the conditions live in the locale tables. A joker with
 * an unlock must have a Chinese and an English entry, and the Chinese one has
 * to be Chinese.
 */
{
  const missing = [];
  const notChinese = [];
  const hasCJK = (s) => /[\u3400-\u4DBF\u4E00-\u9FFF]/.test(s);
  for (const j of JOKER_DATA) {
    if (!j.unlock) continue;
    const key = `unlock.joker.${j.name}`;
    if (!(ZH[key])) missing.push(`zh ${key}`);
    if (!(EN[key])) missing.push(`en ${key}`);
    else if (ZH[key] && !hasCJK(ZH[key])) notChinese.push(`${key} = ${ZH[key]}`);
  }
  check('joker unlock translations missing', missing, []);
  check('joker unlock translations not chinese', notChinese, []);
}

/**
 * Chinese strings must actually be Chinese (no untranslated leftovers). */
{
  const hasCJK = (s) => /[\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(s);
  const latin = Object.entries(ZH)
    .filter(([k, v]) => /^(ui|log|err|desc|effect|name|note|score|unlock)\./.test(k))
    // Proper nouns keep their own spelling.
    .filter(([k]) => k !== 'name.joker.DNA')
    // Pure templates such as '%s %s' carry no words of their own.
    .filter(([, v]) => !hasCJK(String(v)) && /[A-Za-z]{2,}/.test(String(v)))
    .map(([k, v]) => `${k} = ${v}`);
  check('untranslated chinese strings', latin, []);
}

/** Placeholder shapes must match between the two locales. */
{
  const bad = [];
  for (const key of Object.keys(EN)) {
    if (!EN[key] || !ZH[key]) continue;
    const slots = (s) => (String(s).match(/%[ds]|\{\w+\}/g) || []).sort().join(',');
    if (slots(EN[key]) !== slots(ZH[key])) {
      bad.push(`${key}: ${EN[key]} vs ${ZH[key]}`);
    }
  }
  check('placeholder mismatch', bad, []);
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
