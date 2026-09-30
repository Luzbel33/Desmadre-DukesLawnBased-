"""Public-domain paintings, verified against the museum's collection API."""
from pathlib import Path
import json, hashlib, requests
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/art';OUT.mkdir(parents=True,exist_ok=True)
# Museum image server blocks automated requests; use its public-domain works
# mirrored on Commons, with the file's license independently checked.
files={
11:'Walter Shirlaw self-portrait.jpg',
15708:'Sir Henry Raeburn - Portrait of a Man with Gray Hair - 1962.961 - Art Institute of Chicago.jpg',
95998:'Rembrandt Harmenszoon van Rijn - Old Man with a Gold Chain - 1922.4467 - Art Institute of Chicago.jpg',
94840:'Samuel van Hoogstraten - Young woman at an open half-door (1645).jpg',
88632:'Jacques Louis David - Madame François Buron - 1963.205 - Art Institute of Chicago.jpg',
146701:'Albert Bierstadt - Mountain Brook - 1997.365 - Art Institute of Chicago.jpg',
84709:'Juan Sánchez Cotán - Still Life with Game Fowl - 1955.1203 - Art Institute of Chicago.jpg',
131407:'John F. Francis - Wine, Cheese, and Fruit - 1994.239 - Art Institute of Chicago.jpg',
100829:'Martin Johnson Heade - Magnolias on Light Blue Velvet Cloth - 1983.791 - Art Institute of Chicago.jpg',
}
s=requests.Session();s.headers['User-Agent']='CodexAssetPipeline/1.0 (public-domain artwork collection)'
records=[]
for art_id,filename in files.items():
    response=s.get(f'https://api.artic.edu/api/v1/artworks/{art_id}',timeout=40)
    response.raise_for_status();data=response.json();a=data['data']
    if not a.get('is_public_domain') or not a.get('image_id'):raise RuntimeError(f'Not open access: {art_id}')
    r=s.get('https://commons.wikimedia.org/w/api.php',params={'action':'query','titles':'File:'+filename,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':960,'format':'json'},timeout=40)
    r.raise_for_status();page=next(iter(r.json()['query']['pages'].values()))
    info=page['imageinfo'][0];license=info['extmetadata']['LicenseShortName']['value']
    if license not in ['Public domain','CC0']: raise RuntimeError(license)
    url=info.get('thumburl',info['url'])
    dest=OUT/f'aic-{art_id}.jpg'
    if not dest.exists():
        r=s.get(url,timeout=60);r.raise_for_status();dest.write_bytes(r.content)
        with Image.open(dest) as im: im.verify()
    records.append({'file':dest.name,'title':a['title'],'artist':a['artist_display'],
        'source':f'https://www.artic.edu/artworks/{art_id}','image_source':info['descriptionurl'],'license':license,
        'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
(OUT/'MUSEUM-SOURCES.json').write_text(json.dumps(records,indent=2,ensure_ascii=False),encoding='utf-8')
print('Downloaded',len(records),'unique museum paintings')
