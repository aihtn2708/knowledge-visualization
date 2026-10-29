"""Write da-study-labs/index.html (the Set vs Loop Lab hub) with links to the labs."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
from sitekit import SITE, wrap_doc

LINKS = {"coffee": "labs/coffee-chain/index.html",
         "debt": "labs/debt-classification/index.html",
         "loan": "labs/loan-recommendation/index.html"}

html = open(os.path.join(HERE, "index.src.html"), encoding="utf8").read()
for k, v in LINKS.items():
    html = html.replace("{{" + k + "}}", v)
html = html.replace("{{target}}", "")
html = html.replace("{{kh}}", '<a class="jump" href="../index.html" target="_top" style="font-size:0.9rem">← Knowledge Hub</a>\n    ')
assert "{{" not in html
os.makedirs(SITE, exist_ok=True)
open(os.path.join(SITE, "index.html"), "w", encoding="utf8").write(wrap_doc(html))
print("  wrote index.html")
