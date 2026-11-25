#!/usr/bin/env python3
"""Parse balatro.wiki infoboxes into structured JSON data for the game."""
import json, re, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'pages.json')
OUT = os.path.join(HERE, '..', 'src', 'data')

# Templates whose *value* is meaningful -> rendered with a readable prefix.
VALUE_TEMPLATES = {
    'Xmult': 'X{}', 'xmult': 'X{}',
    'Chips': '{} chips', 'chips': '{} chips',
    'Mult': '{} mult', 'mult': '{} mult',
    'Money': '${}', 'money': '${}',
}

# Templates that are pure links / colours -> the value is dropped, extra args kept.
DROP_VALUE_TEMPLATES = {
    'Hl', 'hl', 'Rarity', 'rarity', 'Edition', 'edition', 'Tarot', 'tarot',
    'Spectral', 'spectral', 'Planet', 'planet', 'Voucher', 'voucher', 'J',
    'Blind', 'blind', 'D', 'd', 'Ph', 'ph', 'Stake', 'stake', 'Suit', 'suit',
    'Rank', 'rank', 'Enhancement', 'enhancement', 'Seal', 'seal',
    'Consumable', 'consumable', 'Tag', 'tag', 'Booster', 'booster',
    'Chance', 'chance', 'Note', 'note', 'For', 'See', 'Replace', 'Give',
    'Add', 'Remove', 'Set', 'Decrease', 'Increase', 'Times', 'Modifier',
    'Player', 'Slot', 'Free', 'Score', 'Round', 'Type', 'Effect',
    'Description', 'Cost', 'Title', 'Image', 'Price', 'Value', 'Level',
    'Ante', 'Blue', 'Red', 'Green', 'Orange', 'Purple', 'Gray', 'White',
    'Yellow', 'sblue', 'Black', 'Pink', 'Teal', 'Cyan', 'Mint', 'Currently',
    'Main', 'Patch', 'Version',
}


def strip_wiki(t):
    # {{Name|arg}} -> label(arg)
    def rep(m):
        name = m.group(1)
        args = m.group(2)
        parts = split_args(args)
        val = (parts[0] if parts else '').strip()
        extra = [p.strip() for p in parts[1:] if p.strip()]
        if name in VALUE_TEMPLATES:
            out = VALUE_TEMPLATES[name].format(val)
            if extra:
                out = (out + ' ' + ' '.join(extra)).strip()
            return out
        if name in DROP_VALUE_TEMPLATES:
            return ' '.join(extra).strip()
        return ' '.join(extra).strip() or val
    prev = None
    while prev != t:
        prev = t
        t = re.sub(r"\{\{([A-Za-z]+)\|([^{}]*)\}\}", rep, t)
    t = re.sub(r"\{\{[^{}]*\}\}", '', t)
    # links
    t = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r'\2', t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r'\1', t)
    t = re.sub(r"'''?", '', t)
    t = re.sub(r"<br\s*/?>", ' ', t)
    t = re.sub(r"<[^>]+>", '', t)
    t = t.replace('&nbsp;', ' ').replace('&amp;', '&')
    t = re.sub(r"[ \t]+", ' ', t)
    return t.strip()


def split_args(s):
    parts, depth, cur = [], 0, ''
    for ch in s:
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
        if ch == '|' and depth == 0:
            parts.append(cur)
            cur = ''
        else:
            cur += ch
    parts.append(cur)
    return parts


def parse_infobox(text, tplnames):
    for name in tplnames:
        m = re.search(r"\{\{" + re.escape(name) + r"\s*\n(.*?)\n\}\}", text, re.S)
        if not m:
            continue
        body = m.group(1)
        fields = {}
        for fm in re.finditer(r"^\|([a-z0-9_\- ]+)\s*=\s*(.*?)(?=\n\|[a-z0-9_\- ]+\s*=|\Z)",
                             body, re.S | re.M):
            key = fm.group(1).strip().lower().replace(' ', '_')
            val = fm.group(2).strip()
            val = re.sub(r"<!--.*?-->", '', val, flags=re.S).strip()
            fields[key] = val
        return fields
    return None


def clean(v):
    return strip_wiki(v) if v else ''


def to_int(v, default=0):
    m = re.search(r'-?\d+', str(v or ''))
    return int(m.group(0)) if m else default


def main():
    data = json.load(open(SRC))
    out = {}

    jokers = []
    for title, txt in data['Jokers'].items():
        if title == 'Jokers' or title.startswith('Category:'):
            continue
        f = parse_infobox(txt, ['Joker info'])
        if not f:
            continue
        jokers.append({
            'name': clean(f.get('title', title)) or title,
            'effect': clean(f.get('effect', '')),
            'rarity': clean(f.get('rarity', 'Common')),
            'price': to_int(f.get('buyprice')),
            'type': clean(f.get('type', '')),
            'activation': clean(f.get('activation', '')),
            'unlock': clean(f.get('unlock', '')),
            'number': to_int(f.get('number')),
            'wiki': title,
        })
    out['jokers'] = jokers

    consumables = []
    for cat in ('Tarot Cards', 'Spectral Cards', 'Planet Cards'):
        for title, txt in data[cat].items():
            if title == 'Consumables' or title.startswith('Category:'):
                continue
            f = parse_infobox(txt, ['Consumable info'])
            if not f:
                continue
            consumables.append({
                'name': clean(f.get('title', title)) or title,
                'effect': clean(f.get('effect', '')),
                'type': clean(f.get('type', '')),
                'price': to_int(f.get('buyprice')),
                'sellprice': to_int(f.get('sellprice')),
                'unlock': clean(f.get('unlock', '')),
                'number': to_int(f.get('number')),
                'wiki': title,
            })
    out['consumables'] = consumables

    vouchers = []
    for title, txt in data['Vouchers'].items():
        if title == 'Vouchers' or title.startswith('Category:'):
            continue
        f = parse_infobox(txt, ['Voucher info'])
        if not f:
            continue
        vouchers.append({
            'name': clean(f.get('title', title)) or title,
            'effect': clean(f.get('effect', '')),
            'type': clean(f.get('type', '')),
            'unlock': clean(f.get('unlock', '')),
            'previous': clean(f.get('previous', '')),
            'notes': clean(f.get('notes', '')),
            'number': to_int(f.get('number')),
            'wiki': title,
        })
    out['vouchers'] = vouchers

    tags = []
    for title, txt in data['Tags'].items():
        if title == 'Tags' or title.startswith('Category:'):
            continue
        f = parse_infobox(txt, ['Tag info'])
        if not f:
            continue
        tags.append({
            'name': clean(f.get('title', title)) or title,
            'effect': clean(f.get('description', '')),
            'ante': clean(f.get('ante', '1')),
            'unlock': clean(f.get('unlock', '')),
            'number': to_int(f.get('number')),
            'wiki': title,
        })
    out['tags'] = tags

    blinds = []
    for title, txt in data['Boss Blinds'].items():
        if title == 'Boss Blinds' or title.startswith('Category:'):
            continue
        f = parse_infobox(txt, ['Blind info'])
        if not f:
            continue
        blinds.append({
            'name': clean(f.get('title', title)) or title,
            'effect': clean(f.get('description', '')),
            'ante': to_int(f.get('ante'), 1),
            'score': clean(f.get('score', '2')),
            'reward': to_int(f.get('reward'), 5),
            'matador': clean(f.get('compat-matador', '')),
            'number': to_int(f.get('number')),
            'wiki': title,
        })
    out['boss_blinds'] = blinds

    for key, cat, label in (('enhancements', 'Enhancements', 'Card'),
                            ('seals', 'Seals', 'Seal')):
        items = []
        for title, txt in data[cat].items():
            if title == cat or title.startswith('Category:'):
                continue
            f = parse_infobox(txt, ['Modifier info'])
            if not f:
                continue
            items.append({
                'name': clean(f.get('title', title)) or title,
                'effect': clean(f.get('effect', '')),
                'wiki': title,
            })
        out[key] = items

    decks = []
    for title, txt in data['Decks'].items():
        if title == 'Decks' or title.startswith('Category:'):
            continue
        f = parse_infobox(txt, ['Deck info'])
        if not f:
            continue
        decks.append({
            'name': clean(f.get('title', title)) or title,
            'effect': clean(f.get('description', f.get('effect', ''))),
            'unlock': clean(f.get('unlock', '')),
            'wiki': title,
        })
    out['decks'] = decks

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'cards.json'), 'w') as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    for k, v in out.items():
        print(k, len(v))


if __name__ == '__main__':
    main()
