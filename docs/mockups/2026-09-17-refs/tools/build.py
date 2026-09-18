#!/usr/bin/env python3
"""Final curated set -> manifest.json. Idempotent; downloads only what is missing."""
import json, os, re, urllib.request
import commons

UA = {"User-Agent": "diversion-refs/1.0 (altermatt@gmail.com)"}

FINAL = {
 "358-lichen": [
   ("Map lichen.jpg", "Dense map-lichen mosaic: yellow-green areolate patches meeting pale crusts, black margins where two fronts touch. The competition rule, photographed."),
   ("Mapovník zeměpisný, Bílá skála.jpg", "Separate colonies on pink quartzite — each a lobed radial disc with a distinct margin. Closest to 'centre + radial profile r(theta)'."),
   ("Elegant Sunburst Lichen - Rusavskia elegans (29407039107).jpg", "Rust-orange Rusavskia over grey rock beside grey-white crusts: the species-mix palette."),
   ("Lecanora campestris 179167238.jpg", "One pale disc on dark stone — a single colony in isolation, diffuse growing edge."),
   ("Rhizocarpon geographicum-1.jpg", "High-contrast yellow areoles on near-black rock; the saturated end of the palette."),
 ],
 "349-kolam": [
   ("SikkuKolam.JPG", "A large sikku kolam: the looping line woven around the dot field, colour filled in after. The target structure."),
   ("SIKKU KOLAM.jpg", "Sikku kolam at a house threshold — the everyday scale and placement."),
   ("Traditional rice flour kolam.jpg", "Rice-flour white on ochre ground with a red border; shows the multi-pass stroke texture."),
   ("Pulli Kolam.jpg", "Pulli kolam: petal loops drawn around an implied dot grid, single-line freehand."),
   ("Pulli sq.jpg", "Square dot lattice (pulli) — the substrate before any line is drawn."),
   ("Kolam-Pulli oodu-Tamil-culture.jpg", "Hexagonal/triangular dot lattice with connectors — the other grid the issue names."),
 ],
 "351-asemic": [
   ("Voynich Manuscript (32).jpg", "Unknown script on cream vellum: ascenders, flourishes, consistent invented alphabet. The single closest reference to the brief."),
   ("Voynich Manuscript (10).jpg", "A denser block of the same script — line rhythm and word spacing without a plant dominating."),
   ("Federici 05 - writing in response to.jpg", "Ruled rows of illegible marks filling a whole page top to bottom: the page-fill rhythm."),
   ("Concrete Asemic Federici.jpg", "Dense horizontal bands with red annotation and a signature block — margin-note texture."),
   ("Asemic3.jpg", "The gestural end of the range: Twombly-ish white scrawl, no baseline discipline."),
   ("Nastaliq Calligraphy Album (MS 35342) p. 01, signed Shah Mahmud Nishapuri.jpg", "PEN MODEL ONLY, not letterforms to copy: nastaliq is the canonical thick-and-thin stroke modulation the brief asks for."),
 ],
 "372-girih": [
   ("Darb-i Imam shrine spandrel.JPG", "The Lu & Steinhardt subject: bold strapwork at one scale over a finer girih pattern at another. The two-scale self-similarity, in one photo."),
   ("Panel50.PNG", "A construction drawing — heavy strapwork over faint dotted polygon lines. The Hankin/Kaplan inference made visible."),
   ("Dado panel2.JPG", "Tan-and-red interlaced strapwork panel, 8- and 10-fold stars. Over/under weave clearly readable."),
   ("Samarkand Shah-i Zinda Tuman Aqa complex cropped2.jpg", "Cobalt, turquoise, cream and white ten-fold stars: the 'Isfahan' palette the issue names."),
   ("Girih in stone at Kayseri Hunat Hatun.jpg", "Carved in stone, no colour — the monochrome 'ink on paper' end."),
   ("Alhambra wall 07 (7005708199).jpg", "Zellij mosaic, NOT strapwork — included only as the 'Alhambra ochre' palette cue."),
 ],
}

def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", os.path.splitext(t)[0].lower()).strip("-")[:48]

manifest = {}
for folder, picks in FINAL.items():
    os.makedirs(folder, exist_ok=True)
    titles = [t for t, _ in picks]
    notes = dict(picks)
    d = commons.api(titles="|".join("File:" + t for t in titles), prop="imageinfo",
                    iiprop="url|size|extmetadata|mime", iiurlwidth=1400)
    by_title = {}
    for p in d.get("query", {}).get("pages", {}).values():
        if "missing" in p:
            print("  MISSING", p.get("title")); continue
        ii = (p.get("imageinfo") or [{}])[0]; em = ii.get("extmetadata", {})
        title = p["title"][5:]
        url = ii.get("thumburl") or ii["url"]
        name = slug(title) + (".jpg" if "jpeg" in (ii.get("mime") or "") else ".png")
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r, open(path, "wb") as f:
                f.write(r.read())
            print("  + downloaded", path)
        by_title[title] = {
            "file": name, "title": title, "note": notes[title],
            "licence": commons.strip(em.get("LicenseShortName", {}).get("value", "?")),
            "author": commons.strip(em.get("Artist", {}).get("value", "?")),
            "page": ii.get("descriptionurl"),
            "dims": f'{ii.get("thumbwidth", ii.get("width"))}x{ii.get("thumbheight", ii.get("height"))}',
        }
    manifest[folder] = [by_title[t] for t in titles if t in by_title]
    print(f'{folder}: {len(manifest[folder])}/{len(titles)}')

json.dump(manifest, open("manifest.json", "w"), indent=2, ensure_ascii=False)
print("total", sum(len(v) for v in manifest.values()))
