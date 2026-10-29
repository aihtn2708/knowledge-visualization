# DA Study Labs

Hands-on labs for learning to think like a data analyst in **SQL**, **Python** and **Excel**, and to see why the same question feels so different in each tool. Everything runs in the browser: SQL on SQLite (sql.js), Python on a small built-in interpreter, Excel formulas on a small built-in formula engine.

This folder lives inside the `knowledge-visualization` site and does not change any other page. Once it is on `main`, GitHub Pages serves it at:

- Hub (Set vs Loop Lab): `https://aihtn2708.github.io/knowledge-visualization/da-study-labs/`
- Coffee Chain Lab (beginner): `.../da-study-labs/labs/coffee-chain/`
- Debt Classification Lab (intermediate): `.../da-study-labs/labs/debt-classification/`
- Loan Recommendation Lab (intermediate to advanced): `.../da-study-labs/labs/loan-recommendation/`

Each lab has 4 or 5 tasks. For every task you can write SQL, Python or Excel formulas in the page, run them and get a verdict against the expected result, with hints, reference solutions (plus pandas versions to run locally) and an Excel workbook to download.

## Layout

```
da-study-labs/
  index.html                 Set vs Loop Lab, the hub with the assignments table
  labs/<lab>/index.html      one page per lab, data embedded
  labs/<lab>/*.xlsx          workbook with the data and Excel reference solutions
  assets/js/                 minipy.js (Python interpreter), minixl.js (formula engine)
  _dev/                      sources, build scripts and tests (not published: Jekyll skips folders starting with _)
    src/build_all.py         builds every lab and the hub into da-study-labs/
    src/engines/             sources of the two engines
    src/shared/              page template shared by the labs
    src/hub/                 hub page source
    src/labs/<lab>/          build.py (data + verification), assemble.py (page), solutions and page parts
    tests/test_site.py       opens every page in Chromium and runs every reference solution
    requirements.txt
```

## Run locally

From the repository root run `python -m http.server 8000`, then open `http://localhost:8000/da-study-labs/`. You can also open `da-study-labs/index.html` directly from disk. Python and Excel work offline. The SQL engine loads from the jsDelivr CDN, so SQL needs an internet connection.

## Rebuild and test

```bash
cd da-study-labs/_dev
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium

python src/build_all.py           # regenerate data, check SQL = pandas = Python (= Excel if LibreOffice is installed), rebuild pages
python src/build_all.py --pages   # only re-assemble pages after editing text or page parts
python tests/test_site.py         # every reference solution must say "Matches"
```

The workflow `.github/workflows/da-study-labs.yml` runs the same build and browser test when files in this folder change. It does not deploy anything; GitHub Pages keeps publishing the repository as before.

To add a lab, copy `_dev/src/labs/debt_classification`, edit `gen.py`, `solutions.py`, `xlspec.py` and the page parts, then register the new folder in three places: the `LABS` list in `_dev/src/build_all.py`, the assignments table in `_dev/src/hub/index.src.html`, and the `LABS` list in `_dev/tests/test_site.py`.

## About the data

All data is generated for teaching and describes no real people, companies or portfolios. "Lotus Consumer Finance" is fictional. The debt groups and provision rates are a simplified, days-past-due-only reading of Vietnam's Circular 11/2021/TT-NHNN (as amended by 31/2024/TT-NHNN), a teaching model and not compliance advice. The 300 to 850 credit score scale and bands follow SeABank's explanation of the CIC score. Product rules, rates and limits in the loan lab are invented.
