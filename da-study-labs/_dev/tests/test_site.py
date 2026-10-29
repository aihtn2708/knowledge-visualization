"""End-to-end test of the built site in a real browser.

    python tests/test_site.py

Serves da-study-labs/ on a local port, opens the hub and every lab, loads each reference
solution (SQL, Python, Excel) into the page, runs it and expects "Matches".
Set SQLJS_DIR to a local node_modules/sql.js/dist folder to run without internet.
"""
import functools, http.server, os, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITE = os.path.dirname(ROOT)   # da-study-labs/
LABS = ["coffee-chain", "debt-classification", "loan-recommendation"]


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args): pass
    handler = functools.partial(Quiet, directory=SITE)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


def main():
    httpd, base = serve()
    failures, errors = [], []
    with sync_playwright() as p:
        kw = {"args": ["--no-sandbox"]}
        if os.environ.get("CHROMIUM_PATH"): kw["executable_path"] = os.environ["CHROMIUM_PATH"]
        browser = p.chromium.launch(**kw)
        page = browser.new_page(viewport={"width": 1100, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        if os.environ.get("SQLJS_DIR"):
            page.route("https://cdn.jsdelivr.net/npm/sql.js@*/dist/**", lambda r: r.fulfill(
                status=200, content_type="application/javascript",
                path=os.path.join(os.environ["SQLJS_DIR"], r.request.url.rsplit("/", 1)[1])))
        page.route("https://fonts.googleapis.com/**", lambda r: r.abort())

        page.goto(base + "/index.html")
        links = page.eval_on_selector_all("section.assign a.open", "els => els.map(e => e.getAttribute('href'))")
        print("hub links:", links)
        if links != [f"labs/{s}/index.html" for s in LABS]: failures.append("hub links")

        for slug in LABS:
            page.goto(f"{base}/labs/{slug}/index.html")
            page.wait_for_function("document.getElementById('sql-status') && document.getElementById('sql-status').textContent.indexOf('ready') > -1", timeout=20000)
            n = page.locator(".tcard").count()
            for t in range(n):
                page.click(f'.tcard[data-i="{t}"]')
                page.click('[data-act="reveal"]')
                for tool, load, run in (("sql", "load-sql", "run-sql"), ("py", "load-py", "run-py"), ("xl", "load-xl", None)):
                    page.click(f'.sol .tab[data-t="{tool}"]')
                    page.click(f'[data-act="{load}"]')
                    if run: page.click(f'[data-act="{run}"]')
                    verdict = page.inner_text("#verdict")
                    ok = verdict.startswith("Matches")
                    print(f"{slug:22s} task {t + 1} {tool:3s} {'ok' if ok else 'FAIL: ' + verdict[:80]}")
                    if not ok: failures.append(f"{slug} task {t + 1} {tool}")
            back = page.get_attribute("a.backlink", "href")
            if back != "../../index.html": failures.append(f"{slug} back link")
        browser.close()
    httpd.shutdown()
    errors = [e for e in errors if "fonts" not in e]
    if errors: failures.append("page errors: " + "; ".join(errors))
    print("\nFAILED: " + ", ".join(failures) if failures else "\nAll checks passed.")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
