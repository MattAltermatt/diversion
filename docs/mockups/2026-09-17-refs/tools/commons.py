#!/usr/bin/env python3
"""Search Wikimedia Commons for images; print title/size/licence/artist/url."""
import json, re, sys, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "diversion-refs/1.0 (altermatt@gmail.com)"}

def api(**params):
    params.setdefault("action", "query")
    params.setdefault("format", "json")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)

def strip(h):
    return re.sub(r"\s+", " ", re.sub("<[^>]+>", "", h or "")).strip()

def show(pages):
    rows = []
    for p in (pages or {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii.get("url"):
            continue
        title = p["title"][5:]
        if title.lower().endswith((".pdf", ".svg", ".tif", ".ogv", ".webm")):
            continue
        em = ii.get("extmetadata", {})
        rows.append({
            "title": title,
            "w": ii.get("width"), "h": ii.get("height"),
            "licence": strip(em.get("LicenseShortName", {}).get("value", "?")),
            "artist": strip(em.get("Artist", {}).get("value", "?"))[:50],
            "thumb": ii.get("thumburl") or ii.get("url"),
            "page": ii.get("descriptionurl"),
        })
    rows.sort(key=lambda r: -(r["w"] or 0) * (r["h"] or 0))
    for r in rows:
        print(f'{r["title"][:62]:<62} | {r["w"]}x{r["h"]:<5} | {r["licence"]:<16} | {r["artist"]}')
        print(f'   {r["thumb"]}')
    return rows

def search(term, limit=8):
    d = api(generator="search", gsrnamespace=6, gsrsearch=term, gsrlimit=limit,
            prop="imageinfo", iiprop="url|size|extmetadata", iiurlwidth=1400)
    return show(d.get("query", {}).get("pages"))

def category(cat, limit=20):
    d = api(generator="categorymembers", gcmtitle=f"Category:{cat}", gcmtype="file",
            gcmlimit=limit, prop="imageinfo", iiprop="url|size|extmetadata", iiurlwidth=1400)
    return show(d.get("query", {}).get("pages"))

if __name__ == "__main__":
    mode, arg = sys.argv[1], sys.argv[2]
    lim = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    (category if mode == "cat" else search)(arg, lim)
