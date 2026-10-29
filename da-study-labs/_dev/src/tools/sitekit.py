"""Shared helpers for building the labs and the static site."""
import json, os, shutil, subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))   # da-study-labs/_dev
SITE = os.path.dirname(ROOT)                                                     # da-study-labs/ (published)
TEMPLATE = os.path.join(ROOT, "src", "shared", "lab-template.html")


def recalc(xlsx, outdir):
    """Recalculate a workbook with LibreOffice so formula results are stored.
    Returns the path of the recalculated copy, or None when LibreOffice is not installed."""
    exe = shutil.which("soffice") or shutil.which("libreoffice")
    if not exe:
        print("  ! LibreOffice not found: skipping the Excel formula check")
        return None
    os.makedirs(outdir, exist_ok=True)
    subprocess.run([exe, "--headless", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", outdir, xlsx],
                   check=True, capture_output=True)
    return os.path.join(outdir, os.path.basename(xlsx))


HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
"""


def wrap_doc(html):
    """Turn an artifact-style page (no doctype/head) into a standalone HTML document."""
    html = html.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
    return HEAD + html.rstrip() + "\n</html>\n"


BACK_CSS = """.backlink { display: inline-flex; align-items: center; min-height: 36px; color: var(--muted); font-size: 0.9rem; text-decoration: none; }
.backlink:hover { color: var(--ink); text-decoration: underline; }
.dl { font-weight: 600; }
</style>"""


def finish_lab(html, data, slug, xlsx_src, xlsx_name):
    """Inject data, link the shared engines, add navigation and write labs/<slug>/."""
    block = "<script>\n/*PYINTERP*/\n/*XLENGINE*/\n</script>"
    assert html.count(block) == 1, "engine placeholder not found"
    html = html.replace(block, '<script src="../../assets/js/minipy.js"></script>\n<script src="../../assets/js/minixl.js"></script>')
    assert html.count("/*DATA*/null") == 1
    html = html.replace("/*DATA*/null", json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    html = html.replace("</style>", BACK_CSS, 1)
    html = html.replace("<header>", '<header>\n    <a class="backlink" href="../../index.html">← Set vs Loop Lab · all assignments</a>', 1)
    html = html.replace("<footer>", f'<footer>\n    <p><a class="dl" href="{xlsx_name}" download>Download the Excel workbook</a> with the data and one reference solution per task.</p>\n    ', 1)
    out = os.path.join(SITE, "labs", slug)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "index.html"), "w", encoding="utf8") as f:
        f.write(wrap_doc(html))
    shutil.copy(xlsx_src, os.path.join(out, xlsx_name))
    print(f"  wrote labs/{slug}/index.html and {xlsx_name}")
