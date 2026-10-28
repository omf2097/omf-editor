#!/usr/bin/env python3
"""Generate packages/omf-formats/src/tags.json.

Which tags exist comes from pyomftools valid_tags.py; whether they take an
argument follows openomf src/formats/tag_list.c, whose parser the library
mirrors. Descriptions are merged from both, keeping the longer text. Known discrepancies are resolved by OVERRIDES
(spec 08) and every disagreement is printed so none is resolved silently.
"""

import json
import os
import pathlib
import re
import runpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
PYOMFTOOLS = pathlib.Path(os.environ.get("PYOMFTOOLS_DIR", ROOT.parent / "pyomftools"))
OPENOMF = pathlib.Path(os.environ.get("OPENOMF_DIR", ROOT.parent / "openomf"))
OUT = ROOT / "packages/omf-formats/src/tags.json"

# Decisions recorded in spec 08 "Known discrepancies".
OVERRIDES = {
    "u": False,  # missing from pyomftools (which then fails on shipped strings); openomf: no argument
}


def load_pyomftools():
    ns = runpy.run_path(str(PYOMFTOOLS / "omftools/pyshadowdive/valid_tags.py"))
    return ns["VALID_TAGS"], sorted(ns["INVALID_TAGS"])


def load_openomf():
    src = (OPENOMF / "src/formats/tag_list.c").read_text()
    out = {}
    for m in re.finditer(r'\{"([^"]+)",\s*(\d+),\s*(NULL|"((?:[^"\\]|\\.)*)")\s*\}', src):
        out[m.group(1)] = (m.group(2) != "0", (m.group(4) or "").strip())
    return out


def main():
    py, invalid = load_pyomftools()
    oo = load_openomf()
    tags = {}
    for name in sorted(set(py) | set(OVERRIDES)):
        py_arg, py_desc = py.get(name, (None, ""))
        oo_arg, oo_desc = oo.get(name, (None, ""))
        arg = OVERRIDES.get(name, oo_arg if oo_arg is not None else py_arg)
        if py_arg is not None and oo_arg is not None and py_arg != oo_arg:
            note = "override" if name in OVERRIDES else "using openomf"
            print(f"arg mismatch {name!r}: pyomftools={py_arg} openomf={oo_arg} ({note})")
        desc = max(py_desc.strip(), oo_desc, key=len)
        tags[name] = {"arg": bool(arg), "desc": desc}
    for name in sorted(set(oo) - set(py)):
        print(f"only in openomf: {name!r}" + (" (added)" if name in OVERRIDES else ""))
    for name in sorted(set(py) - set(oo)):
        print(f"only in pyomftools: {name!r}")
    OUT.write_text(json.dumps({"tags": tags, "invalid": invalid}, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(tags)} tags to {OUT}")


if __name__ == "__main__":
    main()
