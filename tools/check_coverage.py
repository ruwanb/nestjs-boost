"""Verify every crawled page is owned by exactly one skill; write coverage-matrix.md.

Usage: python3 -I check_coverage.py <pages.json> <taxonomy.json> <coverage-matrix.md>
Exit code 1 if any page is unowned, owned twice, or a taxonomy path is unknown.
"""
import json
import sys
from collections import defaultdict

# Lines of source docs above which a skill's detail must live in references/:
# SKILL.md bodies are capped at 500 lines, and distilled guidance is typically
# well under half the size of the tutorial prose it comes from.
REFERENCES_NEEDED_ABOVE = 600


def main():
    pages = json.load(open(sys.argv[1]))
    tax = json.load(open(sys.argv[2]))
    out_path = sys.argv[3]

    by_path = {p["path"]: p for p in pages["pages"]}
    owners = defaultdict(list)
    unknown = []
    for owner in tax["owners"]:
        for path in owner["pages"]:
            if path not in by_path:
                unknown.append((owner["name"], path))
            owners[path].append(owner["name"])

    unowned = [p for p in by_path if p not in owners]
    doubled = {p: o for p, o in owners.items() if len(o) > 1}

    lines = [
        "# NestJS documentation coverage matrix",
        "",
        f"Docs commit `{pages['docsCommit'][:12]}` ({pages['docsCommitDate']}), "
        f"NestJS {tax['nestjsTargetMajor']}. {len(by_path)} sidebar pages.",
        "",
        f"**Coverage: {len(by_path) - len(unowned)}/{len(by_path)} pages owned"
        f"; unowned: {len(unowned)}; owned twice: {len(doubled)}; unknown paths: {len(unknown)}.**",
        "",
        "## Owners",
        "",
        "| Owner | Layer | Install when | Pages | Source lines | Needs references/ |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for owner in tax["owners"]:
        src_lines = sum(by_path[p]["lines"] for p in owner["pages"] if p in by_path)
        when = owner["installWhen"]
        if isinstance(when, dict):
            parts = []
            if "anyDependency" in when:
                parts.append(" or ".join(f"`{d}`" for d in when["anyDependency"]))
            if "anyFile" in when:
                parts.append("file " + " / ".join(f"`{f}`" for f in when["anyFile"]))
            if "nestjsMajorBelow" in when:
                parts.append(f"installed major < {when['nestjsMajorBelow']}")
            if when.get("optIn"):
                parts.append("opt-in")
            when = "; ".join(parts)
        lines.append(
            f"| `{owner['name']}` | {owner['layer']} | {when} | {len(owner['pages'])} | {src_lines} | "
            f"{'yes' if src_lines > REFERENCES_NEEDED_ABOVE else 'no'} |"
        )

    lines += ["", "## Page → owner", "", "| Section | Page | Source | Lines | Owner |", "| --- | --- | --- | --- | --- |"]
    for p in pages["pages"]:
        lines.append(
            f"| {p['section']} | [{p['navTitle']}]({p['url']}) | `{p['source']}` | {p['lines']} | "
            f"{', '.join(owners.get(p['path'], ['**UNOWNED**']))} |"
        )
    lines += ["", "## Deliberately excluded", "", "| Source | Reason |", "| --- | --- |"]
    lines += [f"| `{e['source']}` | {e['reason']} |" for e in tax["excluded"]]

    with open(out_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"pages={len(by_path)} owners={len(tax['owners'])} unowned={unowned} doubled={doubled} unknown={unknown}")
    sys.exit(1 if (unowned or doubled or unknown) else 0)


if __name__ == "__main__":
    main()
