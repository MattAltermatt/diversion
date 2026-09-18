#!/usr/bin/env python3
"""Download curated Commons files into per-issue folders, recording attribution."""
import json, os, re, urllib.parse, urllib.request
from commons import api, strip

UA = {"User-Agent": "diversion-refs/1.0 (altermatt@gmail.com)"}

PICKS = {
  "358-lichen": [
    "Map lichen.jpg",
    "Mapovník zeměpisný, Bílá skála.jpg",
    "Elegant Sunburst Lichen - Rusavskia elegans (29407039107).jpg",
    "Lecanora campestris 179167238.jpg",
    "Rhizocarpon geographicum-1.jpg",
  ],
  "349-kolam": [
    "SikkuKolam.JPG",
    "SIKKU KOLAM.jpg",
    "SIKKU KOLAMS.jpg",
    "Traditional rice flour kolam.jpg",
  ],
  "351-asemic": [
    "Federici 05 - writing in response to.jpg",
    "Concrete Asemic Federici.jpg",
    "Asemic3.jpg",
    "Voynich Manuscript (32).jpg",
  ],
  "372-girih": [
    "Darb-i Imam shrine spandrel.JPG",
    "Dado panel2.JPG",
    "Panel50.PNG",
    "Girih in stone at Kayseri Hunat Hatun.jpg",
    "Alhambra wall 07 (7005708199).jpg",
    "Samarkand Shah-i Zinda Tuman Aqa complex cropped2.jpg",
  ],
}

def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", os.path.splitext(t)[0].lower()).strip("-")[:48]

manifest = {}
for folder, titles in PICKS.items():
    os.makedirs(folder, exist_ok=True)
    entries = []
    d = api(titles="|".join("File:" + t for t in titles), prop="imageinfo",
            iiprop="url|size|extmetadata|mime", iiurlwidth=1400)
    pages = d.get("query", {}).get("pages", {})
    for p in pages.values():
        if "missing" in p:
            print(f"  MISSING {p.get('title')}")
            continue
        ii = (p.get("imageinfo") or [{}])[0]
        em = ii.get("extmetadata", {})
        title = p["title"][5:]
        url = ii.get("thumburl") or ii["url"]
        ext = ".jpg" if "jpeg" in (ii.get("mime") or "") else os.path.splitext(url.split("?")[0])[1] or ".jpg"
        name = slug(title) + ext
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r, open(path, "wb") as f:
                f.write(r.read())
        entries.append({
            "file": name, "title": title,
            "licence": strip(em.get("LicenseShortName", {}).get("value", "?")),
            "author": strip(em.get("Artist", {}).get("value", "?")),
            "credit": strip(em.get("Credit", {}).get("value", ""))[:120],
            "page": ii.get("descriptionurl"),
            "bytes": os.path.getsize(path),
            "dims": f'{ii.get("thumbwidth", ii.get("width"))}x{ii.get("thumbheight", ii.get("height"))}',
        })
        print(f'  {folder}/{name}  {entries[-1]["dims"]}  {entries[-1]["licence"]}')
    manifest[folder] = sorted(entries, key=lambda e: titles.index(e["title"]) if e["title"] in titles else 99)

with open("manifest.json", "w") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
print("\ntotal", sum(len(v) for v in manifest.values()), "images")
