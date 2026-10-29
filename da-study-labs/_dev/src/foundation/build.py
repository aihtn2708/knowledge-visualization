"""Write da-study-labs/foundation/index.html (Data Analytics Foundations) with links to the other pages."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
from sitekit import SITE, wrap_doc

LINKS = {"hub": "../index.html",
         "coffee": "../labs/coffee-chain/index.html", "debt": "../labs/debt-classification/index.html", "loan": "../labs/loan-recommendation/index.html",
         "ind-fmcg": "../industry/retail-demand-forecasting/index.html", "ind-otif": "../industry/otif-delivery-performance/index.html",
         "ind-hedge": "../industry/freight-hedging-strategy/index.html",
         "ind-fin": "../industry/investment-risk-return/index.html", "ind-lend": "../industry/credit-scorecard/index.html"}
html = open(os.path.join(HERE, "index.src.html"), encoding="utf8").read()
for k, v in LINKS.items():
    html = html.replace("{{" + k + "}}", v)
html = html.replace("{{target}}", "")
assert "{{" not in html
os.makedirs(os.path.join(SITE, "foundation"), exist_ok=True)
open(os.path.join(SITE, "foundation", "index.html"), "w", encoding="utf8").write(wrap_doc(html))
print("  wrote foundation/index.html")
