"""Map every URL in the requested list to its current docs page and owning skill.

Usage: python3 -I map_requested_urls.py <pack-dir>
Reads coverage/requested-urls.txt; writes coverage/requested-url-map.md; exit 1 if any URL is unresolved.
Old paths are resolved with the docs site's own moved-page redirects, plus three renamed pages
that have no redirect (listed in RENAMED).
"""
import json
import pathlib
import re
import sys

# Moved pages, from src/app/homepage/pages/techniques/techniques.routes.ts (movedTo redirects).
MOVED = {
    "/techniques/task-scheduling": "/application/task-scheduling", "/techniques/mongodb": "/data/mongodb",
    "/techniques/caching": "/data/caching", "/techniques/versioning": "/http/versioning",
    "/techniques/cookies": "/http/cookies", "/techniques/session": "/http/session",
    "/techniques/file-upload": "/http/file-upload", "/techniques/compression": "/http/compression",
    "/techniques/server-sent-events": "/http/server-sent-events", "/techniques/mvc": "/http/mvc",
    "/techniques/performance": "/http/performance", "/cli/workspaces": "/cli/monorepo",
}
# Renamed pages with no redirect on the site (the old URL 404s); mapped by topic.
RENAMED = {
    "/techniques/webhooks": "/http/webhooks",
    "/reliability/transactional-outbox": "/reliability/outbox",
    "/recipes/commander": "/recipes/nest-commander",
}
EXTERNAL = {"https://www.devtools.nestjs.com/documentation": "nestjs-cli-tooling"}


def main():
    pack = pathlib.Path(sys.argv[1])
    pages = {p["path"]: p for p in json.loads((pack / "coverage/pages.json").read_text())["pages"]}
    owner = {}
    for o in json.loads((pack / "coverage/taxonomy.json").read_text())["owners"]:
        for p in o["pages"]:
            owner[p] = o["name"]
    rows, unresolved, section = [], [], ""
    for line in (pack / "coverage/requested-urls.txt").read_text().splitlines():
        m_sec = re.match(r"^\s*(\d+)\.\s+([A-Za-z].*)$", line)
        url = re.search(r"https?://\S+", line)
        if m_sec and not url:
            section = m_sec.group(2).strip()
            continue
        if not url:
            continue
        u = url.group(0).rstrip("/")
        if u in EXTERNAL:
            rows.append((section, u, "(external site)", "", EXTERNAL[u]))
            continue
        path = re.sub(r"^https://docs\.nestjs\.com", "", u)
        note = ""
        target = path
        if path in MOVED:
            target, note = MOVED[path], "moved (site redirects)"
        elif path in RENAMED:
            target, note = RENAMED[path], "renamed (old URL has no redirect)"
        if target not in pages:
            unresolved.append(u)
            rows.append((section, u, "**UNRESOLVED**", note, ""))
            continue
        rows.append((section, u, target, note, owner.get(target, "**UNOWNED**")))
    out = ["# Requested URL → docs page → skill", "",
           f"{len(rows)} URLs from the requested list; unresolved: {len(unresolved)}; "
           f"unowned: {sum(1 for r in rows if r[4] == '**UNOWNED**')}.", "",
           "| Section | Requested URL | Current page | Note | Skill |", "| --- | --- | --- | --- | --- |"]
    out += [f"| {s} | {u} | `{t}` | {n} | `{o}` |" for s, u, t, n, o in rows]
    listed = {r[2] for r in rows}
    extra = [p for p in pages if p not in listed]
    out += ["", f"## Also covered: {len(extra)} current docs pages not in the requested list", "",
            "| Page | Skill |", "| --- | --- |"] + [f"| `{p}` | `{owner.get(p, '**UNOWNED**')}` |" for p in extra]
    (pack / "coverage/requested-url-map.md").write_text("\n".join(out) + "\n")
    print(f"urls={len(rows)} unresolved={unresolved} unowned={[r[1] for r in rows if r[4] == '**UNOWNED**']} extra-pages-covered={len(extra)}")
    sys.exit(1 if unresolved or any(r[4] == "**UNOWNED**" for r in rows) else 0)


if __name__ == "__main__":
    main()
