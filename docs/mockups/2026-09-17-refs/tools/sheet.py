#!/usr/bin/env python3
import json, html
M = json.load(open("manifest.json"))
ISSUES = {
 "358-lichen": ("#358", "Lichen", "colonies spreading over stone across decades",
   "Colony = centre + radial profile r(&theta;) growing at a species rate with noisy lobing; where two fronts meet the older wins or a dark margin forms."),
 "349-kolam": ("#349", "Kolam", "one continuous line drawn around a dot grid, then washed away",
   "A dot lattice, then a single closed curve threaded between the dots on a fixed set of arc tiles; several loops merged into one Eulerian circuit, traced at pen speed."),
 "351-asemic": ("#351", "Asemic Script", "an unseen pen writes flowing meaningless calligraphy",
   "Glyphs are short chains of stroke primitives over a per-page invented alphabet; a pen model varies width with speed. Page fills, page turns."),
 "372-girih": ("#372", "Girih", "Persian strapwork stars laid tile by tile, then drawn stroke by stroke",
   "Girih tiling by subdivision, then Hankin/Kaplan inference: two strapwork rays leave every edge midpoint at a fixed contact angle and extend until they meet."),
}
cards = []
for folder, (num, name, sub, mech) in ISSUES.items():
    imgs = "".join(
      f'''<figure>
        <a href="{html.escape(e['page'] or '#')}" target="_blank" rel="noopener">
          <img src="{folder}/{html.escape(e['file'])}" alt="{html.escape(e['title'])}" loading="lazy">
        </a>
        <figcaption>
          <p class="note">{html.escape(e['note'])}</p>
          <p class="cred">{html.escape(e['title'])}<br>
            <span>{html.escape(e['licence'])} &middot; {html.escape(e['author'][:60] or 'unknown')}</span></p>
        </figcaption>
      </figure>''' for e in M[folder])
    cards.append(f'''<section>
      <h2><span class="num">{num}</span> {name}</h2>
      <p class="sub">{sub}</p>
      <p class="mech"><b>Mechanism in the issue:</b> {mech}</p>
      <div class="grid">{imgs}</div>
    </section>''')

open("index.html", "w").write(f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reference Sheet</title>
<style>
  :root {{ --bg:#0e1013; --panel:#161a20; --ink:#e6eaef; --dim:#98a2ad; --line:#2a3039; --accent:#7fd4c1; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
    font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; padding:32px 16px 72px; }}
  .wrap {{ max-width:1180px; margin:0 auto; }}
  h1 {{ font-size:26px; margin:0 0 6px; letter-spacing:-.01em; }}
  .lede {{ color:var(--dim); margin:0 0 34px; max-width:70ch; }}
  section {{ background:var(--panel); border:1px solid var(--line); border-radius:14px;
    padding:22px 22px 26px; margin-bottom:26px; }}
  h2 {{ font-size:20px; margin:0 0 2px; }}
  .num {{ color:var(--accent); font-variant-numeric:tabular-nums; }}
  .sub {{ color:var(--dim); margin:0 0 12px; font-style:italic; }}
  .mech {{ margin:0 0 20px; padding:10px 13px; background:#11151a; border-left:3px solid var(--accent);
    border-radius:0 7px 7px 0; color:#c4ccd5; font-size:13.5px; }}
  .grid {{ display:grid; gap:18px; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); }}
  figure {{ margin:0; background:#0f1317; border:1px solid var(--line); border-radius:10px; overflow:hidden;
    display:flex; flex-direction:column; }}
  img {{ width:100%; height:210px; object-fit:cover; display:block; background:#000; }}
  figcaption {{ padding:11px 13px 13px; flex:1; display:flex; flex-direction:column; gap:9px; }}
  .note {{ margin:0; font-size:13.5px; color:#d3dae2; }}
  .cred {{ margin:0; font-size:11.5px; color:var(--dim); line-height:1.45; margin-top:auto; }}
  .cred span {{ color:#6f7985; }}
  a {{ color:inherit; }}
  footer {{ color:var(--dim); font-size:12.5px; max-width:80ch; margin:30px auto 0; }}
  @media (max-width:520px) {{ img {{ height:180px; }} }}
</style></head><body><div class="wrap">
<h1>Four candidate diversions &mdash; reference sheet</h1>
<p class="lede">Real images for #358, #349, #351 and #372, pulled from Wikimedia Commons on 2026-09-17.
Every image is public domain or CC-licensed with its author and licence recorded; click any image for its
source page. Notes say what each one is evidence <em>for</em> &mdash; they are not decoration.</p>
{"".join(cards)}
<footer><b>Licensing.</b> All 23 files are PD, CC0, CC BY or CC BY-SA. Attribution is recorded per image
above and in <code>manifest.json</code>. Redistributing unmodified copies with attribution is permitted under
all of these; a CC BY-SA image would additionally impose share-alike on an <em>adaptation</em>, so treat these
as look-reference, not as source art to trace or bundle into a shipped diversion.
<br><br><b>#372 guardrail.</b> Its issue is explicit: purely geometric, no religious text, no calligraphy,
no figures, no mosque imagery. Photographs here were chosen for geometry only; the Darb-i Imam and Kayseri
frames include inscription bands at the edge, which are context, not something to reproduce.</footer>
</div></body></html>''')
print("index.html written")
