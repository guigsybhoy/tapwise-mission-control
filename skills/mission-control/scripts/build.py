#!/usr/bin/env python3
"""Build a Mission Control dashboard folder from the template and a status.json.

Usage:
  python3 build.py --status path/to/status.json --out path/to/output-folder
  python3 build.py --demo --out path/to/output-folder      (uses the fictional sample)

What it does:
  1. Validates status.json (stops if it is invalid).
  2. Copies template/ (index.html, style.css, app.js, fonts/, _headers) into --out.
  3. Writes status.json and status.fallback.js (the inline copy that makes file:// work).
The output folder is self-contained: open index.html directly, or deploy the folder
as static files. Re-running build.py over an existing output folder refreshes it.
"""
import argparse, json, pathlib, shutil, sys
sys.dont_write_bytecode = True

HERE = pathlib.Path(__file__).resolve().parent
SKILL = HERE.parent
TEMPLATE = SKILL / "template"
DEMO = SKILL / "examples" / "northwind-crew.status.json"
SHIP = ["index.html", "style.css", "app.js", "_headers", "fonts"]

sys.path.insert(0, str(HERE))
import validate  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Build a Mission Control dashboard folder.")
    ap.add_argument("--status", help="path to your status.json")
    ap.add_argument("--demo", action="store_true", help="build the fictional Northwind Crew sample instead")
    ap.add_argument("--out", required=True, help="output folder (created if missing)")
    a = ap.parse_args()
    if not a.status and not a.demo:
        ap.error("give --status path/to/status.json, or --demo")
    src = DEMO if a.demo else pathlib.Path(a.status)
    out = pathlib.Path(a.out).resolve()
    if out == TEMPLATE.resolve() or TEMPLATE.resolve() in out.parents:
        sys.exit("Refusing to build inside the template folder. Pick another --out.")

    if validate.main(["validate.py", str(src)]) != 0:
        sys.exit("Build stopped: fix the errors above and run it again.")
    data = json.loads(src.read_text(encoding="utf-8"))

    out.mkdir(parents=True, exist_ok=True)
    for name in SHIP:
        s, d = TEMPLATE / name, out / name
        if s.is_dir():
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
    (out / "status.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "status.fallback.js").write_text(
        "/* Generated from status.json by build.py. Do not edit by hand. */\n"
        "window.__STATUS_FALLBACK__ = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8")
    print(f"BUILT: {out}")
    print(f"Open:  file://{out / 'index.html'}   (add #org for the org chart)")


if __name__ == "__main__":
    main()
