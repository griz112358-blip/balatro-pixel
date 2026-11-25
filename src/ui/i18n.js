// Tiny localisation layer.
//
//   t('ui.newRun')          -> interface string
//   name('Red Deck', 'deck')-> content name (card, deck, blind, hand, ...)
//   effect('Joker', 'joker')-> effect description
//   desc('Red Deck', 'deck')-> deck / stake / blind description
//   msg('log.played', {...})-> engine log message
//
// Missing keys fall back to the English original, so the game always works
// even if the translation is incomplete.

import { ZH } from '../data/zh.js';
import { EN } from '../data/en.js';

const STORAGE_KEY = 'balatro-pixel-lang';

let lang = 'zh';

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) lang = saved;
} catch {
  // localStorage may be unavailable (private mode); the default still works.
}

export function getLang() { return lang; }

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'zh';
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }
  return lang;
}

export function toggleLang() {
  return setLang(lang === 'zh' ? 'en' : 'zh');
}

/** Interface string. */
export function t(key) {
  const table = lang === 'zh' ? ZH : EN;
  return table[key] ?? EN[key] ?? key;
}

/** Interface string with %d / %s placeholders filled in. */
export function tf(key, ...args) {
  let s = t(key);
  let i = 0;
  s = s.replace(/%[ds]/g, () => (i < args.length ? String(args[i++]) : '%?'));
  return s;
}

/** Content name, e.g. name('Red Deck', 'deck'). */
export function name(text, kind) {
  if (!text) return '';
  if (!kind) return text;
  const table = lang === 'zh' ? ZH : EN;
  return table[`name.${kind}.${text}`] ?? text;
}

/**
 * Effect description for a card.
 *
 * The template may contain `{placeholder}` slots; `params` fills them in.
 */
export function effect(text, kind, fallback = '', params = null) {
  if (!text) return fallback;
  const table = lang === 'zh' ? ZH : EN;
  const key = `effect.${kind}.${text}`;
  const s = table[key] ?? (fallback || text);
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (whole, slot) => (
    params[slot] === undefined ? whole : String(params[slot])
  ));
}

/** Description of a deck, stake or blind. */
export function desc(itemName, kind, fallback = '') {
  if (!itemName) return fallback;
  const table = lang === 'zh' ? ZH : EN;
  const key = `desc.${kind}.${itemName}`;
  return table[key] ?? fallback;
}

/** Engine error message, e.g. err('Not enough money'). */
export function err(text) {
  if (!text) return '';
  const table = lang === 'zh' ? ZH : EN;
  return table[`err.${text}`] ?? text;
}

/**
 * Engine log message. The templates live in the locale tables and use
 * `{placeholder}` slots.
 */
export function msg(id, params = {}) {
  const table = lang === 'zh' ? ZH : EN;
  let tmpl = table[id];
  if (tmpl === undefined) tmpl = EN[id];
  if (tmpl === undefined) return id;
  return tmpl.replace(/\{(\w+)\}/g, (whole, key) => (
    params[key] === undefined ? whole : String(params[key])
  ));
}

/** Format a number with the Chinese locale when needed. */
export function num(n) {
  return Number(n).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
}
