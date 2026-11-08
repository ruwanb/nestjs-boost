"""List every `> warning` box from the docs, grouped by owning skill, as gotcha candidates.

Usage: python3 -I gotcha_candidates.py <pages.json> <taxonomy.json> <out.md>
Warnings are the docs' own "this will bite you" notes; hints are omitted here
because most are cross-references rather than corrections.
"""
import json
import sys


def main():
    pages = {p["path"]: p for p in json.load(open(sys.argv[1]))["pages"]}
    tax = json.load(open(sys.argv[2]))
    out = ["# Gotcha candidates (docs warning boxes, by owner)", "",
           "Each item is a candidate for the owning skill's Gotchas section. Keep only those an agent "
           "would plausibly get wrong; confirm against baseline failures in Phase 3.", ""]
    total = 0
    for owner in tax["owners"]:
        items = []
        for path in owner["pages"]:
            p = pages[path]
            for n in p.get("notes", []):
                if n["kind"] == "warning":
                    items.append(f"- {n['text']} ([{p['navTitle']}]({p['url']}))")
        total += len(items)
        out += [f"## `{owner['name']}` ({len(items)})", ""] + (items or ["- none"]) + [""]
    open(sys.argv[3], "w").write("\n".join(out))
    print(f"warnings: {total}")


if __name__ == "__main__":
    main()
