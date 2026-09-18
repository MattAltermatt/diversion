#!/usr/bin/env python3
import json, os, re, urllib.request
from commons import api, strip
from fetch import slug
UA = {"User-Agent": "diversion-refs/1.0 (altermatt@gmail.com)"}
EXTRA = {
  "349-kolam": ["Pulli Kolam.jpg", "Attractive kolam.jpg", "Pulli sq.jpg", "Kolam-Pulli oodu-Tamil-culture.jpg"],
  "351-asemic": ["Voynich Manuscript (100).jpg", "Voynich Manuscript (10).jpg"],
}
man = json.load(open("manifest.json"))
for folder, titles in EXTRA.items():
    d = api(titles="|".join("File:" + t for t in titles), prop="imageinfo",
            iiprop="url|size|extmetadata|mime", iiurlwidth=1400)
    for p in d.get("query", {}).get("pages", {}).values():
        if "missing" in p:
            print("  MISSING", p.get("title")); continue
        ii = (p.get("imageinfo") or [{}])[0]; em = ii.get("extmetadata", {})
        title = p["title"][5:]; url = ii.get("thumburl") or ii["url"]
        name = slug(title) + (".jpg" if "jpeg" in (ii.get("mime") or "") else ".png")
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r, open(path, "wb") as f:
                f.write(r.read())
        e = {"file": name, "title": title,
             "licence": strip(em.get("LicenseShortName", {}).get("value", "?")),
             "author": strip(em.get("Artist", {}).get("value", "?")),
             "credit": strip(em.get("Credit", {}).get("value", ""))[:120],
             "page": ii.get("descriptionurl"), "bytes": os.path.getsize(path),
             "dims": f'{ii.get("thumbwidth", ii.get("width"))}x{ii.get("thumbheight", ii.get("height"))}'}
        if not any(x["file"] == name for x in man[folder]):
            man[folder].append(e)
        print(f'  {folder}/{name}  {e["dims"]}  {e["licence"]}')
json.dump(man, open("manifest.json", "w"), indent=2, ensure_ascii=False)
