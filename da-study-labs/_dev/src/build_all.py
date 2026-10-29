"""Build everything into da-study-labs/ (the published folder).

    python src/build_all.py            # generate data, verify, assemble all pages
    python src/build_all.py --pages    # only re-assemble pages from existing out/ data

Each lab's build.py generates its data, runs the SQL, pandas and plain-Python
solutions and asserts that they agree. If LibreOffice is installed, it also
recalculates the Excel workbook and checks the formula results.
"""
import os, shutil, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITE = os.path.dirname(ROOT)   # da-study-labs/ is the published folder
LABS = ["coffee_chain", "debt_classification", "loan_recommendation"]


def run(script):
    print(f"> {os.path.relpath(script, ROOT)}")
    subprocess.run([sys.executable, script], check=True)


def main():
    pages_only = "--pages" in sys.argv
    os.makedirs(os.path.join(SITE, "assets", "js"), exist_ok=True)
    for lab in LABS:
        d = os.path.join(ROOT, "src", "labs", lab)
        if not pages_only:
            run(os.path.join(d, "build.py"))
        run(os.path.join(d, "assemble.py"))
    for src, dst in (("minipy.js", "minipy.js"), ("minixl.js", "minixl.js")):
        shutil.copy(os.path.join(ROOT, "src", "engines", src), os.path.join(SITE, "assets", "js", dst))
    run(os.path.join(ROOT, "src", "industry", "build.py"))
    run(os.path.join(ROOT, "src", "foundation", "build.py"))
    run(os.path.join(ROOT, "src", "hub", "build.py"))
    print("Done. Open da-study-labs/index.html, or run from the repo root: python -m http.server 8000")


if __name__ == "__main__":
    main()
