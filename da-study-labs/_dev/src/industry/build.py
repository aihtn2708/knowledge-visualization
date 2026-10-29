"""Build the four industry labs into da-study-labs/industry/<slug>/index.html.

Each lab folder holds body.html (page text), main.js (analysis and interactivity),
data.json (data extracted from the source repository) and ref*.py (the Python
reference analysis that produced and verified the numbers)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
from sitekit import SITE, wrap_doc

LABS = {"fmcg": "retail-demand-forecasting", "otif": "otif-delivery-performance", "hedge": "freight-hedging-strategy", "fin": "investment-risk-return", "lend": "credit-scorecard"}
rd = lambda *p: open(os.path.join(HERE, *p), encoding="utf8").read()
css = rd("base.css") + rd("lab.css")
shared = rd("lab.js")
for folder, slug in LABS.items():
    meta = json.loads(rd(folder, "meta.json"))
    data = json.loads(rd(folder, "data.json"))
    html = (f"<title>{meta['title']}</title>\n"
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">\n'
            f"<style>{css}</style>\n{rd(folder, 'body.html')}\n<script>\n(function () {{\n\"use strict\";\n{shared}\n"
            f"var DATA = {json.dumps(data, separators=(',', ':'))};\n{rd(folder, 'main.js')}\n}})();\n</script>\n")
    html = html.replace("{{foundation}}", "../../foundation/index.html").replace("{{target}}", "")
    assert "{{" not in html, folder
    out = os.path.join(SITE, "industry", slug)
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "index.html"), "w", encoding="utf8").write(wrap_doc(html))
    print(f"  wrote industry/{slug}/index.html")
