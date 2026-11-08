"""Print a condensed view of the docs pages owned by a skill, for authoring.

Usage: python3 -I condense.py <pack-dir> <docs-dir> <skill-name> [max_code_lines]
Keeps: headings, first sentence after each heading, warning/hint boxes, install commands,
and the first N lines of each TypeScript code block (JS duplicates after @@switch dropped).
"""
import json
import pathlib
import re
import sys


def condense(text, max_code):
    out, lines, i = [], text.splitlines(), 0
    want_sentence = False
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("```"):
            lang = ln[3:].strip()
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            if "@@switch" in block:
                block = block[: block.index("@@switch")]
            block = [b for b in block if b.strip() and b.strip() != "@@filename()" and not b.startswith("@@filename")]
            if lang in ("bash", "shell") or (block and block[0].startswith("$ ")):
                out += [f"  $ {b.lstrip('$ ')}" for b in block if re.search(r"npm|nest |npx|yarn|pnpm", b)][:3]
            elif block:
                out.append("  ```")
                out += ["  " + b for b in block[:max_code]]
                if len(block) > max_code:
                    out.append(f"  … (+{len(block) - max_code} lines)")
                out.append("  ```")
        elif re.match(r"^#{2,4} ", ln):
            out.append(ln)
            want_sentence = True
        elif ln.startswith("> "):
            out.append(re.sub(r"<[^>]+>", "", ln)[:400])
        elif want_sentence and ln.strip():
            out.append("  " + re.sub(r"<[^>]+>", "", ln)[:300])
            want_sentence = False
        i += 1
    return out


def main():
    pack, docs, skill = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
    max_code = int(sys.argv[4]) if len(sys.argv) > 4 else 10
    pages = {p["path"]: p for p in json.loads((pack / "coverage/pages.json").read_text())["pages"]}
    owner = next(o for o in json.loads((pack / "coverage/taxonomy.json").read_text())["owners"] if o["name"] == skill)
    for path in owner["pages"]:
        p = pages[path]
        print(f"\n######## {p['url']}  ({p['source']}, {p['lines']} lines)")
        print("\n".join(condense((docs / p["source"]).read_text(), max_code)))


if __name__ == "__main__":
    main()
