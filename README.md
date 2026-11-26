# BALATRO PIXEL

A pixel-art tribute to [Balatro](https://www.playbalatro.com/) — poker hands, jokers,
booster packs, vouchers, boss blinds and shop runs, rendered on a 428×240 pixel canvas.

Pure vanilla ES modules: no build step, no dependencies at runtime. Open `index.html`
through a local server and play.

**Play it online:** <https://griz112358-blip.github.io/balatro-pixel/> ·
the full reference of every card and mechanic:
<https://griz112358-blip.github.io/balatro-pixel/rules.html>

```bash
npm start          # http://127.0.0.1:8770
npm test           # unit tests + localisation tests + headless simulation
```

The interface speaks **Chinese and English**: it starts in Chinese and switches with the
`L` key or the button in the top-right corner of the menu. The choice is remembered.

## Playing

| Input | Action |
| --- | --- |
| Mouse | Select cards, buy things, open details |
| `1` | Discard the selected cards |
| `2` | Play the selected hand (or use the armed consumable) |
| `H` | Show the level of every poker hand |
| `Enter` | Start a run / confirm |
| `←` `→` | Change deck |
| `↑` `↓` | Change stake |
| `Esc` | Pause |
| `M` | Mute / unmute the sound |
| `L` | Switch between Chinese and English |
| `+` / `-` / `0` | Zoom the pixel buffer in / out / back to the automatic fit |
| `R` | Back to the menu |

Click a **Joker** or **consumable** to read its description; click one in the shop to
sell it. Click a consumable to arm it, then pick the card(s) it should target and press
`2`.

**The keys live in one place.** The bar under the canvas lists every shortcut; the
buttons themselves stay clean and carry no key badges.

**Every counter says what it counts.** A blind is played with four hands and three
discards, so the top bar shows `出牌 3/4` (three plays left) and the panel under the
score shows `弃牌 3/3`. The `关卡 2/3` below it is *not* a round counter: it says which
of the three blinds of the ante you are on, which is why it does not move when you
play a hand.

**Point at any joker or consumable to read what it does** — in the play screen and in
the shop the description pops up next to the card, so you can check a joker before you
commit to it and see what a card for sale is worth before buying it. Inside a booster
pack the description of the card under the mouse is shown under the cards. Clicking a
joker still opens the full card details.

**Every hand shows its arithmetic.** After you play a hand, a breakdown appears with
the hand type and its level, every card that scored and the chips and mult it added,
every joker that contributed, and the running total behind each line - ending in
`chips × mult = score`. Click, press enter or escape to get back to the round. The
same breakdown is shown on the blind-defeated screen.

**Press `H` (or the button in the hand panel) for the level of every poker hand.** The
play screen only shows the level of the hand you have selected; the overview lists all
twelve with their level, what they are worth at that level, how they grow and the
planet card that levels them up.

**The boss blind's effect stays on screen.** While you play against a boss, its name
and its effect sit in the top bar of the play screen, so you never have to remember
what it does.

**The blind select screen is a pipeline.** It shows the whole ante at once instead of
only the blind you may pick: the one you just cleared (with the score you got), the
one that is open right now, and the one still ahead - a boss blind that has not been
reached yet keeps its name secret and only shows the range of scores it may ask for.
A row of slots at the top counts every blind of the run, green for cleared, yellow
for skipped and white-framed for the one you are standing on, so you can see how far
you have come. A line at the bottom previews the scores the next ante will ask for.

## The rules page

`rules.html` is a complete reference of the game, built from the same tables the
game runs on, so it can never drift away from what the game does:

- an overview of the run, the scoring order and how additive and multiplicative
  mult are kept apart,
- the twelve poker hands with their base values, their per-level growth and the
  planet card that levels them up,
- the 52 playing cards with their chip and mult value, the enhancements, the
  seals and the editions,
- all 150 jokers with rarity, price, type and unlock condition,
- 22 tarot cards, 12 planet cards, 18 spectral cards, 32 vouchers, 16 decks,
  8 stakes, the regular, boss and showdown blinds, the shop tags and the five
  booster packs.

Every entry shows the name in the language you picked, the effect in the same
language and a search box that filters names and effects in either language - so
you can still type "the tower" or "High Card" and find the Chinese entry. The
button in the top-left corner of the menu opens it in a new tab.

## What is implemented

**Core loop** — 8 Antes × (Small / Big / Boss Blind), a shop and booster packs between
blinds, interest on your money, the full hand-type table (High Card → Flush Five) with
per-hand levels, wild/stone cards, four fingers, shortcut and splash.

**Jokers** — all 150 cards from the wiki, with real behaviour: additive and
multiplicative effects, suit-locked jokers that change suit each round, scaling jokers
(Runner, Castle, Obelisk, Yorick, Canio, Glass Joker, Hologram, Constellation, Lucky
Cat, Campfire, Hit the Road, Loyalty Card, Spare Trousers), first-hand-of-round jokers
(DNA, Sixth Sense, Trading Card, Burnt Joker), passives (Pareidolia, Juggler, Drunkard,
Splash, Four Fingers, Shortcut, Merry Andy, Astronomer, Smeared Joker) and shop
abilities (Ceremonial Dagger, Chicot, Luchador, Perkeo, Invisible Joker, Diet Cola,
Credit Card, Mr. Bones).

**Jokers that grow** — the card shows what it is worth right now, the way Balatro does:
the Ice Cream's chips, the Green Joker's mult, the Popcorn's mult, the Runner's chips
and the X multipliers of the scaling jokers. Each joker keeps its own number, so one
picked up half way through a run starts from zero instead of counting the whole run.

Jokers that read the cards **held in hand** follow the wiki order: played cards leave
the hand and do not count, the cards left in hand are walked from left to right, and
each card triggers the ability that belongs to it. So Raised Fist doubles the lowest
card left in hand (face cards +20, Aces +22), Baron gives one X1.5 per King left in
hand, Shoot the Moon gives +13 Mult per Queen left in hand, a Steel card left in hand
gives X1.5, and a multiplier has to sit to the right of the card that adds Mult for it
to multiply that Mult. Mime and Red Seals retrigger these abilities.

**Consumables** — 22 Tarot cards, 18 Spectral cards, 12 Planet cards and 30 vouchers,
including the Telescope, Omen Globe, Hone, Glow Up, Money Tree, Director's Cut and
Retcon lines.

**Booster packs** — five kinds, each in three sizes (Normal / Jumbo / Mega). A pack
opens into a set of cards; you take one of them (a Mega pack lets you take two) or skip
the pack. Point at a card inside the pack to read what it does.

| Pack | Contains | What it is for |
| --- | --- | --- |
| Standard 标准 | Playing cards, sometimes with an enhancement, a seal or an edition | Adds a card to your deck |
| Buffoon 丑角 | Jokers | A joker that stays with you for the whole run |
| Arcana 奥秘 | Tarot cards | Change the cards in your deck |
| Celestial 天体 | Planet cards | Level up one of your poker hands |
| Spectral 幽灵 | Spectral cards | Powerful effects, some of them risky |

**Decks** — 16 decks, each with its own rule (Blue Deck, Green Deck, Black Deck, Yellow
Deck, Orange Deck, Purple Deck, Plasma Deck with its chip/mult balancing, Anaglyph and
Painted Deck double copies, Mad World, Lucky, Gold, Ghost, Abandoned and Magic Deck).

**Stakes** — White, Red, Green, Black, Blue, Purple, Orange and Gold.

**Boss blinds** — all 23 regular bosses plus the 5 Showdown blinds, each with its real
effect (debuffed suits, forced hands, card limits, face-down draws, and so on).

**Tags** — 12 shop tags (Coupon, Double, D6, Gift, Jumbo, Hologram, Investment,
Voucher, Boss, Anaglyph, Rocket, Uncommon).

**Prices and sell values** — a card costs its price plus the price of its edition
(Foil +$2, Holographic +$3, Polychrome +$5, Negative +$5), multiplied by the Clearance
Sale (25% off) or Liquidation (50% off) discount and rounded half down. It sells for
half of that and never for less than $1. The Egg and the Gift Card add to the sell
value at the end of every round, on top of that, and a discount never takes their
bonus away - which is what makes an Egg worth holding for a few rounds and then
selling. The value on the card is the same number the shop pays you, so Temperance,
Swashbuckler and the Ceremonial Dagger all read the same thing.

## Rendering

The canvas is a **supersampled** surface: the logical game is still 428×240 pixels, but
the backing store holds `SS × DPR` device pixels for every logical pixel, so the artwork
is drawn 1:1 with the screen and every pixel block is square. `SS` is the largest whole
multiple that fits the window (`+` / `-` override it).

Text is drawn straight onto that surface with the platform font, so Chinese and Latin
sit on the same line with the same weight - no bitmap face, no nearest-neighbour
stretching.

- Both scripts use the system font stack (`system-ui`, `PingFang SC`, ...).
- Chinese glyphs need a little more room than Latin ones, so a Chinese string never
  drops below `CJK_MIN` (8 logical pixels, 24 device pixels on a 3x screen); a Latin
  string keeps its own size.
- A Chinese card name that needs two lines is split evenly ("黄金小丑" becomes
  "黄金" / "小丑"), so no line ends up with a single orphan character.

**The cards are drawn, not typed.** The four suits (♥ ♦ ♣ ♠) have their own outlines
in `src/ui/suits.js` - a heart, a diamond, three lobes with a stem for the club and a
heart on its head for the spade - and are drawn with bezier curves on the canvas and
as inline SVG on the rules page. The font glyphs are gone: they look blobby at small
sizes and every platform draws them differently. A playing card has rounded corners,
the rank and a small suit sit in the top left corner and the big suit fills the
middle of the card, the way a real card is printed.

## Layout

```
index.html            page shell and canvas
src/
  engine/             rules, no DOM access
    run.js            run state: deck, economy, blinds, round flow
    hands.js          poker hand evaluation
    scoring.js        the activation sequence
    cards.js          card model, enhancements, seals, editions
    jokers.js         joker behaviour
    consumables.js    tarots, spectrals, planets, vouchers
    shop.js           shop stock, pricing, buying and selling
    value.js          the pricing rules: buy cost, sell value, editions
    blinds.js         ante tables, stakes, boss blinds
    tags.js           shop tags
    rng.js            seeded RNG
  data/               scraped wiki data (jokers, card list)
    en.js             English locale: interface strings and log templates
    zh.js             Chinese locale, mirroring the English keys
  ui/
    pixel.js          drawing primitives and the render surface
    suits.js          the four suit shapes, drawn as vectors
    main.js           screens, input and the game loop
    i18n.js           the localisation layer (t / name / effect / desc / msg)
    sound.js          synthesised sound effects (no audio assets)
    rules.js          fills the rules page
rules.html           the rules page: every card, item and mechanic
test/engine.test.mjs  unit tests for the rules
test/pixel.test.mjs   text metrics and CJK aware wrapping
test/i18n.test.mjs    localisation coverage: nothing may stay untranslated
test/ui.test.mjs      interface source rules: no English residue, no key badges
tools/
  serve.mjs           zero-dependency static server
  simulate.mjs        headless run simulator (every joker, tarot, voucher, boss)
  smoke.mjs           Playwright end-to-end test with screenshots
  peek.mjs            screenshots of every screen, in both languages
  packpeek.mjs        screenshots of every booster pack type, in both languages
  hoverpeek.mjs       screenshots of the hover descriptions
  scorepeek.mjs       screenshots of the score breakdown
  rulespeek.mjs       screenshots of the rules page, in both languages
  cardstates.mjs      one card per state (stone, wild, seal, edition, ...)
  parse.py scrape.py  the wiki scraper that builds src/data
```

## Testing

`npm test` runs four layers:

- `test/engine.test.mjs` — hand evaluation, hand levels, ante maths, RNG determinism
  and a set of regression tests for every bug that was fixed (Plasma balancing, the
  Blue Joker's chip count, voucher double counting, cards lost between rounds, ...).
- `test/pixel.test.mjs` — text metrics, word wrapping and the CJK aware line breaking.
- `test/i18n.test.mjs` — localisation coverage: every joker, deck, stake, blind, hand,
  consumable, voucher and tag must have a Chinese name and description, every joker
  with an unlock condition must have a translated one, and the two locales must use
  the same placeholders.
- `test/ui.test.mjs` — interface source rules: no button may carry a key hint, the
  rules page may not render an English name next to a Chinese one and every heading
  comes from the locale tables.
- `tools/simulate.mjs` — plays hundreds of automated runs across every deck and stake,
  then forces every joker, tarot, spectral, planet, voucher and boss blind through a
  round and asserts that no score is ever `NaN` and nothing throws. It also plays a
  run from Ante 1 to the win screen.

`npm run test:smoke` drives the real UI in a browser (needs `npm install` first; it
uses the installed Google Chrome when Playwright's own Chromium is not downloaded) and
writes screenshots to `shots/`. `npm run shots` captures every screen.

## Localisation

The rules engine stays language neutral: it logs message ids plus their parameters
(`log.played`, `{hand}`, `{chips}`, ...) and the interface layer renders them, so the
Chinese build shows Chinese log lines without the engine knowing about languages.

`src/data/en.js` is the source of truth for every interface string; `src/data/zh.js`
mirrors those keys in Chinese. Anything missing from the Chinese table falls back to
the English original, so a partial translation never breaks the game.

**The interface shows one language at a time.** The Chinese build never prints an
English card name next to the Chinese one: the rules page lists only the names of the
current language, the poker hand overview has no English column and the unlock
conditions of the jokers are translated. The English originals stay in the search
index, so searching for "the tower" still finds 高塔. Only proper nouns that are
part of the Chinese wording itself - `Boss 盲注`, `DNA` - keep their spelling.

## Sound

All sound effects are synthesised with the Web Audio API in `src/ui/sound.js` - there
are no audio assets. Press `M` to mute.

## Credits

Card and joker data is scraped from [balatro.wiki](https://balatro.wiki/).
Balatro is a game by LocalThunk; this is an unofficial fan tribute.
