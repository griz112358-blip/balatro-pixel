// The rules page: every card, item and mechanic of the project.
//
// It is built from the very same tables the game runs on (jokers.js, the
// engine's consumable / deck / blind / tag tables and the locale tables),
// so the page can never drift away from what the game actually does.
//
//   rules.html            the page
//   src/ui/rules.js       this file: it fills the page
//   src/ui/rules.css      the styles

import { t, tf, name, effect, desc, getLang, toggleLang } from './i18n.js';
import { JOKER_DATA } from '../data/jokers.js';
import { jokerDescription } from '../data/descriptions.js';
import { TAROTS, SPECTRALS, PLANETS, VOUCHERS } from '../engine/consumables.js';
import { HANDS, HAND_BY_ID } from '../engine/hands.js';
import { STAKES, BOSS_BLINDS, SHOWDOWN_BLINDS, BLIND_TYPE } from '../engine/blinds.js';
import { DECKS } from '../engine/run.js';
import { TAGS } from '../engine/tags.js';
import {
  ENHANCEMENTS, SEALS, EDITIONS, RANK_LABEL,
  SUITS, rankChips, rankMult,
} from '../engine/cards.js';
import { suitSvg } from './suits.js';
import { PACK_TYPES, PACK_SIZES, PACK_SIZE_INFO } from '../engine/shop.js';

const $ = (sel) => document.querySelector(sel);

// The suits are drawn light on the dark page, so they stay readable.
const SUIT_INK = { H: '#ff8a76', D: '#ff8a76', C: '#e8dfc8', S: '#e8dfc8' };

// ---------------------------------------------------------------------------
// small DOM helpers
// ---------------------------------------------------------------------------

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A small label such as the rarity or the price of an entry. */
function chip(text, cls = '') {
  return el('span', `chip ${cls}`.trim(), text);
}

/**
 * The unlock condition of a joker, in the current language.
 *
 * The scraped wiki text is English and sometimes missing the link it pointed
 * at ("Discard a ."), so the condition lives in the locale tables and only
 * falls back to the scraped text if a joker has no entry yet.
 */
function unlockText(joker) {
  const key = `unlock.joker.${joker.name}`;
  const text = t(key);
  return text === key ? (joker.unlock || '') : text;
}

/**
 * One entry of the reference: its name, what it does and the facts around it.
 *
 * The English original is kept in the search index only: a search still finds
 * "The Tower" or "High Card", but the page itself shows one language at a
 * time, so the Chinese build reads as a finished Chinese document.
 */
function entry(nameZh, nameEn, effectText, meta = []) {
  const box = el('div', 'entry');
  const head = el('div', 'head');
  head.appendChild(el('span', 'name', nameZh));
  box.appendChild(head);
  if (effectText) box.appendChild(el('p', 'effect', effectText));
  if (meta.length) {
    const line = el('div', 'meta');
    for (const c of meta) line.appendChild(c);
    box.appendChild(line);
  }
  box.dataset.search = [nameZh, nameEn, effectText, ...meta.map((c) => c.textContent)]
    .filter(Boolean).join(' ').toLowerCase();
  return box;
}

/** A group of entries with an optional heading. */
function group(title, nodes) {
  const wrap = el('div', 'group');
  if (title) wrap.appendChild(el('h3', null, title));
  const grid = el('div', 'grid');
  for (const n of nodes) grid.appendChild(n);
  wrap.appendChild(grid);
  return { title, node: wrap, grid, count: nodes.length };
}

/** A table, for the things that read better as rows than as cards. */
function table(headers, rows) {
  const t = el('table');
  const head = el('thead');
  const hr = el('tr');
  for (const h of headers) hr.appendChild(el('th', null, h));
  head.appendChild(hr);
  t.appendChild(head);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const cell of row) {
      const td = el('td', cell && cell.cls ? cell.cls : null, cell && cell.text !== undefined ? cell.text : cell);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  t.appendChild(body);
  t.dataset.search = rows.map((r) => r.map((c) => (c && c.text !== undefined ? c.text : c)).join(' '))
    .join(' ').toLowerCase();
  return t;
}

// ---------------------------------------------------------------------------
// the sections
// ---------------------------------------------------------------------------

function overviewSection() {
  const wrap = el('div', 'overview');
  for (let i = 1; i <= 6; i++) {
    const key = `rules.overview.${i}`;
    const text = t(key);
    if (text && text !== key) wrap.appendChild(el('p', null, text));
  }
  wrap.appendChild(el('p', 'formula', t('rules.formula')));
  return {
    id: 'overview',
    title: t('rules.section.overview'),
    groups: [{ title: null, node: wrap, grid: wrap, count: 0 }],
  };
}

function handsSection() {
  const rows = HANDS.map((h) => [
    { text: name(h.name, 'hand') },
    { text: `${h.baseChips} × ${h.baseMult}`, cls: 'num' },
    { text: `+${h.chipPerLevel} / +${h.multPerLevel}`, cls: 'num' },
    { text: name(h.planet, 'planet') },
  ]);
  const tbl = table([
    t('rules.label.hand'),
    `${t('rules.label.base')} ${t('rules.label.chips')} × ${t('rules.label.mult')}`,
    t('rules.label.perLevel'),
    t('rules.label.planet'),
  ], rows);
  return {
    id: 'hands',
    title: t('rules.section.hands'),
    groups: [{ title: null, node: tbl, grid: tbl, count: HANDS.length }],
  };
}

function cardsSection() {
  const rows = [];
  for (let rank = 2; rank <= 14; rank++) {
    rows.push([
      { text: name(String(rank), 'rank') },
      { text: String(rankChips(rank)), cls: 'num' },
      { text: String(rankMult(rank)), cls: 'num' },
    ]);
  }
  const tbl = table([
    t('rules.label.rank'),
    t('rules.label.chips'),
    t('rules.label.mult'),
  ], rows);
  const suits = el('div', 'overview');
  const suitLine = el('p', 'suits');
  suitLine.appendChild(el('span', null, `${t('rules.label.suit')}:`));
  for (const s of SUITS) {
    const item = el('span', 'suit-item');
    const swatch = el('span', 'suit-swatch');
    swatch.innerHTML = suitSvg(s, 18, SUIT_INK[s]);
    item.appendChild(swatch);
    item.appendChild(el('span', null, name(s, 'suit')));
    suitLine.appendChild(item);
  }
  suits.appendChild(suitLine);
  suits.appendChild(el('p', null,
    getLang() === 'zh'
      ? 'A 是最大的牌（14），但在 A-2-3-4-5 里可以当 1 用；K-A-2-3-4 不算顺子。'
      : 'An Ace is the highest rank (14) but counts as 1 in A-2-3-4-5; K-A-2-3-4 is not a straight.'));
  return {
    id: 'cards',
    title: t('rules.section.cards'),
    groups: [
      { title: null, node: tbl, grid: tbl, count: rows.length },
      { title: null, node: suits, grid: suits, count: 0 },
    ],
  };
}

function modifiersSection() {
  const groups = [];

  const enh = Object.entries(ENHANCEMENTS).map(([key, e]) => entry(
    name(key, 'enhancement'),
    e.name,
    effect(key, 'enhancement', e.text || ''),
  ));
  groups.push(group(t('rules.group.enhancement'), enh));

  const seals = Object.entries(SEALS).map(([key, s]) => entry(
    name(key, 'seal'),
    s.name,
    effect(key, 'seal', s.text || ''),
  ));
  groups.push(group(t('rules.group.seal'), seals));

  const editions = Object.entries(EDITIONS).filter(([key]) => key !== 'base').map(([key, e]) => entry(
    name(key, 'edition'),
    e.name,
    effect(key, 'edition', e.text || ''),
  ));
  groups.push(group(t('rules.group.edition'), editions));

  return { id: 'modifiers', title: t('rules.section.modifiers'), groups };
}

function jokersSection() {
  const order = ['Common', 'Uncommon', 'Rare', 'Legendary'];
  const typeKeys = {
    'Additive Mult': 'AdditiveMult',
    'Multiplicative Mult': 'MultiplicativeMult',
    Chips: 'Chips',
    'Chips and Additive Mult': 'ChipsAndAdditiveMult',
    Economy: 'Economy',
    Effect: 'Effect',
    Retrigger: 'Retrigger',
  };
  const groups = [];
  for (const rarity of order) {
    const list = JOKER_DATA.filter((j) => j.rarity === rarity);
    if (!list.length) continue;
    const nodes = list.map((j) => {
      const meta = [chip(t(`rules.rarity.${j.rarity}`), `rarity-${j.rarity}`)];
      if (j.price) meta.push(chip(`$${j.price}`, 'price'));
      if (j.type) meta.push(chip(t(`rules.type.${typeKeys[j.type]}`) || j.type));
      if (j.unlock) meta.push(chip(`${t('rules.label.unlock')}: ${unlockText(j)}`));
      return entry(name(j.name, 'joker'), j.name, effect(j.name, 'joker', jokerDescription(j.name, j.effect || '')), meta);
    });
    groups.push(group(t(`rules.rarity.${rarity}`), nodes));
  }
  return { id: 'jokers', title: t('rules.section.jokers'), groups };
}

function tarotSection() {
  const nodes = Object.entries(TAROTS).map(([key, c]) => entry(
    name(key, 'tarot'),
    key,
    effect(key, 'tarot', c.desc || ''),
    c.cost ? [chip(`$${c.cost}`, 'price')] : [],
  ));
  return { id: 'tarot', title: t('rules.section.tarot'), groups: [group(null, nodes)] };
}

function planetSection() {
  const nodes = Object.entries(PLANETS).map(([key, p]) => {
    const hand = HAND_BY_ID[p.hand];
    const handName = hand ? name(hand.name, 'hand') : p.hand;
    const text = effect(key, 'planet', '', { hand: handName });
    return entry(name(key, 'planet'), key, text, [
      chip(`${handName} +${p.chips} ${t('rules.label.chips')} / +${p.mult} ${t('rules.label.mult')}`),
    ]);
  });
  return { id: 'planet', title: t('rules.section.planet'), groups: [group(null, nodes)] };
}

function spectralSection() {
  const nodes = Object.entries(SPECTRALS).map(([key, c]) => entry(
    name(key, 'spectral'),
    key,
    effect(key, 'spectral', c.desc || ''),
    c.cost ? [chip(`$${c.cost}`, 'price')] : [],
  ));
  return { id: 'spectral', title: t('rules.section.spectral'), groups: [group(null, nodes)] };
}

function vouchersSection() {
  const nodes = Object.entries(VOUCHERS).map(([key, v]) => {
    const meta = [];
    if (v.prev) meta.push(chip(`${t('rules.label.prev')}: ${name(v.prev, 'voucher')}`));
    return entry(name(key, 'voucher'), key, effect(key, 'voucher', v.desc || ''), meta);
  });
  return { id: 'vouchers', title: t('rules.section.vouchers'), groups: [group(null, nodes)] };
}

function decksSection() {
  const nodes = Object.entries(DECKS).map(([key, d]) => entry(
    name(key, 'deck'),
    key,
    desc(key, 'deck', d.desc || ''),
  ));
  return { id: 'decks', title: t('rules.section.decks'), groups: [group(null, nodes)] };
}

function stakesSection() {
  const nodes = STAKES.map((s) => entry(
    name(s.name, 'stake'),
    s.name,
    desc(s.name, 'stake', s.desc || ''),
  ));
  return { id: 'stakes', title: t('rules.section.stakes'), groups: [group(null, nodes)] };
}

function blindsSection() {
  const regular = Object.values(BLIND_TYPE).map((b) => entry(
    name(b.name, 'blind'),
    b.name,
    `${t('rules.label.scoreNeed')} ×${b.mult} · ${t('rules.label.reward')} $${b.reward}`,
  ));
  const bosses = BOSS_BLINDS.map((b) => entry(
    name(b.name, 'blind'),
    b.name,
    desc(b.name, 'blind', b.desc || ''),
    [
      chip(`${t('rules.label.ante')} ${b.minAnte}`),
      chip(`${t('rules.label.reward')} $${b.reward}`),
    ],
  ));
  const showdown = SHOWDOWN_BLINDS.map((b) => entry(
    name(b.name, 'blind'),
    b.name,
    desc(b.name, 'blind', b.desc || ''),
    [
      chip(`${t('rules.label.ante')} ${b.minAnte}`),
      chip(`${t('rules.label.reward')} $${b.reward}`),
    ],
  ));
  return {
    id: 'blinds',
    title: t('rules.section.blinds'),
    groups: [
      group(t('rules.group.blind'), regular),
      group(t('rules.group.bossBlind'), bosses),
      group(t('rules.group.showdownBlind'), showdown),
    ],
  };
}

function tagsSection() {
  const nodes = Object.values(TAGS).map((tag) => entry(
    name(tag.name, 'tag'),
    tag.name,
    desc(tag.name, 'tag', tag.desc || ''),
  ));
  return { id: 'tags', title: t('rules.section.tags'), groups: [group(null, nodes)] };
}

function packsSection() {
  const nodes = PACK_TYPES.map((type) => {
    const sizes = PACK_SIZES.map((size) => {
      const info = PACK_SIZE_INFO[size];
      return `${name(size, 'pack')} $${info.cost} · ${info.options} → ${info.choose}`;
    }).join(' / ');
    return entry(
      name(type, 'pack'),
      type,
      t(`ui.packHint.${type}`),
      [chip(sizes)],
    );
  });
  return { id: 'packs', title: t('rules.section.packs'), groups: [group(null, nodes)] };
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function buildSections() {
  return [
    overviewSection(),
    handsSection(),
    cardsSection(),
    modifiersSection(),
    jokersSection(),
    tarotSection(),
    planetSection(),
    spectralSection(),
    vouchersSection(),
    decksSection(),
    stakesSection(),
    blindsSection(),
    tagsSection(),
    packsSection(),
  ];
}

function render() {
  document.title = `${t('rules.title')} · BALATRO PIXEL`;
  $('#title').textContent = 'BALATRO PIXEL';
  $('#subtitle').textContent = t('rules.subtitle');
  $('#back').textContent = t('rules.back');
  $('#lang').textContent = getLang() === 'zh' ? 'EN' : '中文';
  $('#search').placeholder = t('rules.search');
  $('#empty').textContent = t('rules.searchEmpty');

  const main = $('#main');
  const nav = $('#nav');
  main.innerHTML = '';
  nav.innerHTML = '';

  let total = 0;
  for (const s of buildSections()) {
    const sec = el('section');
    sec.id = `sec-${s.id}`;
    sec.appendChild(el('h2', null, s.title));
    let count = 0;
    for (const g of s.groups) {
      count += g.count;
      sec.appendChild(g.node);
    }
    total += count;
    if (count) sec.appendChild(el('p', 'count', tf('rules.count', count)));
    main.appendChild(sec);

    const link = el('a', null, s.title);
    link.href = `#sec-${s.id}`;
    nav.appendChild(link);
  }
  sec_count(total);
  filter('');
}

/** Keep the total number of entries in the search field for reference. */
function sec_count(total) {
  $('#search').dataset.total = String(total);
}

function filter(query) {
  const q = query.trim().toLowerCase();
  let visible = 0;
  for (const sec of document.querySelectorAll('main > section')) {
    let sectionHits = 0;
    for (const grid of sec.querySelectorAll('.grid, table')) {
      let hits = 0;
      for (const node of grid.children) {
        const text = node.dataset.search || node.textContent || '';
        const match = !q || text.toLowerCase().includes(q);
        node.classList.toggle('hidden', !match);
        if (match) hits++;
      }
      grid.classList.toggle('hidden', hits === 0);
      sectionHits += hits;
    }
    sec.classList.toggle('hidden', q && sectionHits === 0);
    visible += sectionHits;
  }
  $('#empty').hidden = !(q && visible === 0);
  $('#empty').classList.toggle('hidden', !(q && visible === 0));
}

// ---------------------------------------------------------------------------
// wiring
// ---------------------------------------------------------------------------

$('#search').addEventListener('input', (e) => filter(e.target.value));

$('#lang').addEventListener('click', () => {
  toggleLang();
  render();
});

render();
