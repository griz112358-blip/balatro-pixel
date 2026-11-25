import json, urllib.request, urllib.parse, os, time
BASE="https://balatro.wiki/api.php"
proxy=os.environ.get('https_proxy')
opener=urllib.request.build_opener(urllib.request.ProxyHandler({'https':proxy}) if proxy else urllib.request.ProxyHandler())
def api(params):
    url=BASE+"?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url, headers={'User-Agent':'balatro-pixel-scraper/1.0'})
    return json.loads(opener.open(req, timeout=60).read().decode())
cats=json.load(open('tools/cats.json'))
out={}
for c,pages in cats.items():
    out[c]={}
    for i,p in enumerate(pages):
        try:
            d=api({'action':'parse','page':p,'prop':'wikitext','format':'json'})
            out[c][p]=d['parse']['wikitext']['*']
        except Exception as e:
            print('ERR',p,e, flush=True)
        time.sleep(0.05)
    print('done',c,flush=True)
json.dump(out, open('tools/pages.json','w'))
