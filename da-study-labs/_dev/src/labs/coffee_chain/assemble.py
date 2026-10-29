"""Assemble the Coffee Chain Lab page (shared template + data) and write it into da-study-labs/labs/."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from sitekit import TEMPLATE, finish_lab
os.chdir(HERE)
from pysol import PYPLAIN

html = open(TEMPLATE, encoding="utf8").read()
data = json.load(open(os.path.join("out", "data.json"), encoding="utf8"))
data["pyPlain"] = {str(k): v for k, v in PYPLAIN.items()}
finish_lab(html, data, "coffee-chain", os.path.join("out", "coffee-chain-lab.xlsx"), "coffee-chain-lab.xlsx")
