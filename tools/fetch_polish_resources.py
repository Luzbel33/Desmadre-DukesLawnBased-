"""Download selected CC0 source assets, preserving provenance and API checksums."""
from pathlib import Path
import hashlib, json, requests

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'assets' / 'polish-source'
OUT = ROOT / 'public' / 'assets' / 'environment'
OUT.mkdir(parents=True, exist_ok=True)
ledger = []
session = requests.Session()

def fetch(url, dest, md5=None):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        r = session.get(url, timeout=90); r.raise_for_status(); dest.write_bytes(r.content)
    raw = dest.read_bytes()
    if md5 and hashlib.md5(raw).hexdigest() != md5:
        raise ValueError('checksum mismatch: ' + str(dest))
    return hashlib.sha256(raw).hexdigest()

for asset in ['fern_02', 'periwinkle_plant', 'rock_moss_set_01']:
    data = session.get('https://api.polyhaven.com/files/' + asset, timeout=45).json()
    entry = data['gltf']['1k']['gltf']
    dest = SOURCE / asset
    fetch(entry['url'], dest / (asset + '_1k.gltf'), entry['md5'])
    for relative, item in entry['include'].items():
        fetch(item['url'], dest / relative, item['md5'])
    ledger.append({'id':asset, 'source':'https://polyhaven.com/a/'+asset, 'license':'CC0', 'resolution':'1k', 'date':'2026-09-29'})
    print('DOWNLOADED', asset, flush=True)

for asset, filename in [('kloofendal_48d_partly_cloudy_puresky','day.hdr'), ('kloofendal_overcast_puresky','storm.hdr')]:
    data = session.get('https://api.polyhaven.com/files/' + asset, timeout=45).json()
    entry = data['hdri']['2k']['hdr']
    sha = fetch(entry['url'], OUT / filename, entry['md5'])
    ledger.append({'id':asset, 'file':filename, 'source':'https://polyhaven.com/a/'+asset, 'license':'CC0', 'resolution':'2k', 'sha256':sha, 'date':'2026-09-29'})
    print('DOWNLOADED', filename, flush=True)
(OUT / 'SOURCES.json').write_text(json.dumps(ledger, indent=2), encoding='utf8')
