"""Baja texturas CC0 de Poly Haven a public/assets/tex/ con los nombres que usa el juego (<id>_color/_normal/_rough
[/_ao/_disp].jpg, 1024 px) y anota la procedencia en public/assets/tex/SOURCES.json.
  python tools/fetch_textures.py stony_dirt_path mud_forest forrest_ground_01 [--ao] [--disp] [--res 1k]
"""
import json, os, sys, urllib.request, io, datetime
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TEX = os.path.join(ROOT, 'public', 'assets', 'tex')
LEDGER = os.path.join(TEX, 'SOURCES.json')
UA = {'User-Agent': 'desmadre-textures (CC0)'}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    res = '1k'
    if '--res' in sys.argv:
        res = sys.argv[sys.argv.index('--res') + 1]
        args = [a for a in args if a != res]
    want = [('Diffuse', 'color'), ('nor_gl', 'normal'), ('Rough', 'rough')]
    if '--ao' in sys.argv:
        want.append(('AO', 'ao'))
    if '--disp' in sys.argv:
        want.append(('Displacement', 'disp'))
    ledger = json.load(open(LEDGER, encoding='utf-8')) if os.path.exists(LEDGER) else []
    for tid in args:
        meta = json.loads(get('https://api.polyhaven.com/files/' + tid))
        got = []
        for key, suffix in want:
            if key not in meta or res not in meta[key]:
                print('falta', tid, key)
                continue
            fmts = meta[key][res]
            f = fmts.get('jpg') or fmts.get('png')
            data = get(f['url'])
            im = Image.open(io.BytesIO(data))
            im = im.convert('L' if suffix in ('rough', 'ao', 'disp') else 'RGB')
            if im.size[0] > 1024:
                im = im.resize((1024, 1024), Image.LANCZOS)
            dst = os.path.join(TEX, f'{tid}_{suffix}.jpg')
            im.save(dst, quality=88)
            got.append(suffix)
        ledger = [e for e in ledger if e.get('id') != tid]
        ledger.append({'id': tid, 'source': 'https://polyhaven.com/a/' + tid, 'license': 'CC0', 'maps': got, 'resolution': res, 'date': datetime.date.today().isoformat()})
        print('ok', tid, got)
    json.dump(ledger, open(LEDGER, 'w', encoding='utf-8', newline='\n'), indent=1)


main()
