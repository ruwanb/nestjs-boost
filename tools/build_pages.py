"""Build coverage/pages.json: one record per sidebar page of docs.nestjs.com.

Usage: python3 -I build_pages.py <docs-repo-dir> <output-json>

Reads the sidebar (src/app/shared/nav/nav-items.ts) for the authoritative page
list and order, resolves each route to its Markdown source via the Angular
route files, then extracts facts from each page.
"""
import json
import pathlib
import re
import subprocess
import sys

DOCS_BASE = "https://docs.nestjs.com"


def parse_nav(nav_ts: str):
    """Return [(section, title, path)] in sidebar order; skips external links."""
    pages = []
    section = None
    for line in nav_ts.splitlines():
        if line.strip().startswith("//"):
            continue
        # Top-level entries are indented with exactly 4 spaces.
        m_top = re.match(r"^    title: '([^']+)'", line)
        if m_top:
            section = m_top.group(1)
            continue
        for title, path in re.findall(r"title: '([^']+)', path: '([^']+)'", line):
            pages.append((section, title, path))
    # Multi-line children ({ title: ..., \n path: ... }) and top-level paths.
    text = nav_ts
    for m in re.finditer(r"\{\s*title: '([^']+)',\s*(?:isNew: \w+,\s*)?(?:isOpened: \w+,\s*)?path: '([^']+)'", text):
        title, path = m.group(1), m.group(2)
        if not any(p[2] == path for p in pages):
            pages.append((None, title, path))
    return pages


def section_for(nav_ts: str, path: str):
    """Find the enclosing top-level section title for a path by position."""
    idx = nav_ts.find(f"'{path}'")
    tops = [(m.start(), m.group(1)) for m in re.finditer(r"\n  \{\n    title: '([^']+)'", nav_ts)]
    best = None
    for pos, title in tops:
        if pos < idx:
            best = title
    return best


def route_map(repo: pathlib.Path):
    """Map full URL path -> component folder name, following redirects."""
    pages_dir = repo / "src/app/homepage/pages"
    mapping = {}
    for f in list(pages_dir.rglob("*.routes.ts")) + [repo / "src/app/app.routes.ts"]:
        src = f.read_text()
        imports = dict(
            (cls, folder.split("/")[-1])
            for cls, folder in re.findall(r"import \{ (\w+) \} from '([^']+)'", src)
        )
        prefix = ""
        if f.name != "app.routes.ts" and f.parent != pages_dir:
            prefix = "/" + f.parent.relative_to(pages_dir).as_posix()
        for path, cls in re.findall(r"path: '([^']*)',\s*component: (\w+)", src):
            if cls in imports:
                folder = imports[cls].replace(".component", "")
                mapping[(prefix + "/" + path).replace("//", "/").rstrip("/") or "/"] = folder
    return mapping


def find_md(repo: pathlib.Path, path: str, folder: str):
    content = repo / "content"
    section = path.strip("/").split("/")[0] if "/" in path.strip("/") else ""
    candidates = []
    if folder:
        candidates += [content / section / f"{folder}.md", content / f"{folder}.md"]
        candidates += list(content.rglob(f"{folder}.md"))
    candidates.append(content / (path.strip("/") + ".md"))
    for c in candidates:
        if c.exists():
            return c
    return None


# Single-line install commands only ([ \t], never \n) so prose after a bare
# `npm install` is not mistaken for package names.
PKG_RE = re.compile(r"(?:npm (?:i|install)|yarn add|pnpm add)[ \t]+(?:-[-\w]+[ \t]+)*([^\n`]+)")
IMPORT_RE = re.compile(r"from '((?:@[\w.-]+/)?[\w.-]+)(?:/[\w./-]*)?'")
DECORATOR_RE = re.compile(r"@([A-Z]\w+)\(")
CLI_RE = re.compile(r"\$ (nest [^\n]+)")
NOTE_RE = re.compile(r"> (warning|info|hint) \*\*([^*]+)\*\*\s*([^\n]+(?:\n> [^\n]+)*)")


def extract(md_text: str):
    pkgs = set()
    for m in PKG_RE.finditer(md_text):
        for tok in m.group(1).split():
            tok = tok.strip()
            if tok.startswith("-") or not re.match(r"^(@[\w.-]+/)?[\w.-]+(@[\w.^~-]+)?$", tok):
                continue
            pkgs.add(re.sub(r"(?<=.)@[\w.^~-]+$", "", tok))
    imports = sorted({m.group(1) for m in IMPORT_RE.finditer(md_text) if not m.group(1).startswith(".")})
    notes = [
        {"kind": k, "label": label.strip(), "text": re.sub(r"\n> ", " ", body).strip()}
        for k, label, body in NOTE_RE.findall(md_text)
    ]
    headings = re.findall(r"^#{2,4} (.+)$", md_text, re.M)
    return {
        "title": (re.findall(r"^### (.+)$", md_text, re.M) or [""])[0],
        "installs": sorted(pkgs),
        "imports": imports,
        "decorators": sorted(set(DECORATOR_RE.findall(md_text))),
        "cli": sorted(set(CLI_RE.findall(md_text))),
        "notes": notes,
        "headings": headings,
        "lines": md_text.count("\n") + 1,
    }


def main():
    repo = pathlib.Path(sys.argv[1]).resolve()
    out = pathlib.Path(sys.argv[2])
    nav_ts = (repo / "src/app/shared/nav/nav-items.ts").read_text()
    commit = subprocess.run(["git", "-C", str(repo), "log", "-1", "--format=%H %cs"],
                            capture_output=True, text=True).stdout.split()
    routes = route_map(repo)
    records, unresolved = [], []
    for _, title, path in parse_nav(nav_ts):
        if path == "/support" or path.startswith("/discover"):
            continue  # non-technical pages
        sec = section_for(nav_ts, path) or title
        md = find_md(repo, path, routes.get(path.rstrip("/") or "/", ""))
        rec = {"url": DOCS_BASE + (path if path != "/" else ""), "path": path,
               "section": sec, "navTitle": title,
               "source": md.relative_to(repo).as_posix() if md else None}
        if md:
            rec.update(extract(md.read_text()))
        else:
            unresolved.append(path)
        records.append(rec)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"docsCommit": commit[0], "docsCommitDate": commit[1],
                               "pageCount": len(records), "pages": records}, indent=2))
    print(f"pages: {len(records)}  unresolved: {unresolved}")


if __name__ == "__main__":
    main()
