import json, urllib.request, urllib.parse, os, re, time
BASE="https://balatro.wiki/api.php"
def api(params):
    url=BASE+"?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url, headers={'User-Agent':'balatro-pixel-scraper/1.0'})
    import os
    proxy=os.environ.get('https_proxy')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({'https':proxy}) if proxy else urllib.request.ProxyHandler())
    return json.loads(opener.open(req, timeout=60).read().decode())
def catmembers(cat):
    out=[]; cont={}
    while True:
        p={'action':'query','list':'categorymembers','cmtitle':'Category:'+cat,'cmlimit':'500','format':'json','cmnamespace':'0'}
        p.update(cont)
        d=api(p)
        out+= [m['title'] for m in d['query']['categorymembers']]
        if 'continue' in d: cont=d['continue']
        else: break
    return out
def wikitext(title):
    d=api({'action':'parse','page':title,'prop':'wikitext','format':'json'})
    return d['parse']['wikitext']['*']
cats=['Jokers','Tarot Cards','Spectral Cards','Planet Cards','Vouchers','Tags','Boss Blinds','Decks','Enhancements','Seals']
res={}
for c in cats:
    t=catmembers(c); res[c]=t; print(c, len(t), flush=True)
    time.sleep(0.3)
json.dump(res, open('tools/cats.json','w'), indent=1)
