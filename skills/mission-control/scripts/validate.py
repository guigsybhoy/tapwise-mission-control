#!/usr/bin/env python3
"""Validate a Mission Control status.json. No dependencies beyond Python 3.8+.

Usage:  python3 validate.py path/to/status.json [--schema path/to/status.schema.json]

Checks, in order:
  1. The JSON Schema in template/status.schema.json (the subset of keywords it uses).
  2. Cross-references: routine owners, log bots, org hub, group members and org nodes
     must all point at roster ids, and each roster member is placed exactly once.
  3. Honesty rules: SNAPSHOT and DEMO panels need an as_of date, LIVE panels that
     depend on recorded data are flagged, and obvious placeholders are warned about.
Exit code 0 when valid (warnings allowed), 1 when there are errors.
"""
import json, re, sys, pathlib

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_SCHEMA = HERE.parent / "template" / "status.schema.json"


class Checker:
    def __init__(self, schema):
        self.root = schema
        self.errors = []

    def ref(self, r):
        node = self.root
        for part in r.lstrip("#/").split("/"):
            node = node[part]
        return node

    def ok(self, data, sch):
        """Return True if data matches sch, without recording errors."""
        saved, self.errors = self.errors, []
        self.check(data, sch, "")
        good = not self.errors
        self.errors = saved
        return good

    def check(self, d, s, path):
        if "$ref" in s:
            self.check(d, self.ref(s["$ref"]), path)
        if "type" in s:
            types = s["type"] if isinstance(s["type"], list) else [s["type"]]
            if not any(self.is_type(d, t) for t in types):
                self.errors.append(f"{path or '/'}: expected {'/'.join(types)}, got {type(d).__name__}")
                return
        if "const" in s and d != s["const"]:
            self.errors.append(f"{path}: must be {s['const']!r}")
        if "enum" in s and d not in s["enum"]:
            self.errors.append(f"{path}: {d!r} is not one of {s['enum']}")
        if isinstance(d, str):
            if "pattern" in s and not re.search(s["pattern"], d):
                self.errors.append(f"{path}: {d!r} does not match the expected format")
            if "maxLength" in s and len(d) > s["maxLength"]:
                self.errors.append(f"{path}: longer than {s['maxLength']} characters")
        if isinstance(d, list):
            if "minItems" in s and len(d) < s["minItems"]:
                self.errors.append(f"{path}: needs at least {s['minItems']} item(s)")
            if "items" in s:
                for i, x in enumerate(d):
                    self.check(x, s["items"], f"{path}[{i}]")
        if isinstance(d, dict):
            for k in s.get("required", []):
                if k not in d:
                    self.errors.append(f"{path or '/'}: missing required field '{k}'")
            props = s.get("properties", {})
            for k, v in d.items():
                if k in props:
                    self.check(v, props[k], f"{path}.{k}" if path else k)
                elif s.get("additionalProperties") is False:
                    self.errors.append(f"{path or '/'}: unknown field '{k}'")
        if "oneOf" in s:
            n = sum(1 for alt in s["oneOf"] if self.ok(d, alt))
            if n != 1:
                self.errors.append(f"{path}: value {d!r} is not in an allowed form")
        for sub in s.get("allOf", []):
            if "if" in sub:
                if self.ok(d, sub["if"]) and "then" in sub:
                    self.check(d, sub["then"], path)
            else:
                self.check(d, sub, path)

    @staticmethod
    def is_type(d, t):
        return {
            "object": isinstance(d, dict),
            "array": isinstance(d, list),
            "string": isinstance(d, str),
            "integer": isinstance(d, int) and not isinstance(d, bool),
            "number": isinstance(d, (int, float)) and not isinstance(d, bool),
            "boolean": isinstance(d, bool),
            "null": d is None,
        }[t]


def xref(d):
    bad, ids = [], [r.get("id") for r in d.get("roster", [])]
    idset = set(ids)
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        bad.append(f"roster id '{dup}' is used more than once")
    for r in d.get("routines", []):
        if r.get("owner") and r["owner"] not in idset:
            bad.append(f"routine '{r.get('id')}' owner '{r['owner']}' is not a roster id")
    for i, e in enumerate(d.get("log", [])):
        if e.get("bot") and e["bot"] not in idset:
            bad.append(f"log[{i}] bot '{e['bot']}' is not a roster id")
    o = d.get("org")
    if o:
        hub = o.get("hub")
        if hub and hub not in idset:
            bad.append(f"org.hub '{hub}' is not a roster id")
        placed = ([hub] if hub else []) + [m for g in o.get("groups", []) for m in g.get("members", [])]
        for m in placed:
            if m not in idset:
                bad.append(f"org member '{m}' is not a roster id")
        for m in sorted({m for m in placed if placed.count(m) > 1}):
            bad.append(f"'{m}' is placed more than once in the org chart")
        nodes = {n.get("id") for n in o.get("nodes", [])}
        for i in ids:
            if i not in nodes:
                bad.append(f"roster member '{i}' has no org.nodes entry")
            if i not in placed:
                bad.append(f"roster member '{i}' is not in the hub or any group")
    return bad


PLACEHOLDER = re.compile(r"\b(lorem|ipsum|tbd|todo|xxx|placeholder|example name)\b", re.I)


def honesty(d):
    warn = []
    panels = d.get("panels", {})
    for pid in ("roster", "routines", "deploys", "log", "org", "roster_count"):
        p = panels.get(pid)
        if p and p.get("source") == "LIVE":
            warn.append(f"panels.{pid} is LIVE, but it shows recorded facts. Use SNAPSHOT (real) or DEMO (sample).")
    demo = any(p.get("source") == "DEMO" for p in panels.values())
    if demo and panels.get("met", {}).get("source") == "LIVE":
        warn.append("This file has DEMO panels but 'met' is LIVE. If team_formed is made up, mark met as DEMO too.")
    def walk(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                walk(v, f"{path}.{k}" if path else k)
        elif isinstance(x, list):
            for i, v in enumerate(x):
                walk(v, f"{path}[{i}]")
        elif isinstance(x, str) and PLACEHOLDER.search(x):
            warn.append(f"{path}: looks like a placeholder ({x[:40]!r}). Use null for unknowns.")
    walk(d, "")
    sample = {"northwind", "atlas", "juno", "pip", "wren", "kit", "sable", "moss", "orla"}
    real = any(p.get("source") == "SNAPSHOT" for p in panels.values())
    names = {str(r.get("name", "")).lower() for r in d.get("roster", [])} | {str(d.get("team", {}).get("name", "")).lower()}
    left = sorted(n for n in names if n in sample or "northwind" in n)
    if real and left:
        warn.append("SNAPSHOT panels, but sample names from the Northwind example remain: " + ", ".join(left) + ". Replace or delete them.")
    return warn


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 2
    status = pathlib.Path(argv[1])
    schema_path = pathlib.Path(argv[argv.index("--schema") + 1]) if "--schema" in argv else DEFAULT_SCHEMA
    try:
        data = json.loads(status.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"INVALID: {status} is not readable JSON ({e})")
        return 1
    c = Checker(json.loads(schema_path.read_text(encoding="utf-8")))
    c.check(data, c.root, "")
    errs = c.errors + xref(data)
    for w in honesty(data):
        print("WARN  " + w)
    if errs:
        for e in errs:
            print("ERROR " + e)
        print(f"INVALID: {len(errs)} problem(s) in {status}")
        return 1
    print(f"VALID: {status} (schema v{data.get('schema_version')}, {len(data.get('roster', []))} crew, "
          f"{len(data.get('routines', []))} routines, {len(data.get('deploys', []))} deploys, {len(data.get('log', []))} log entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
