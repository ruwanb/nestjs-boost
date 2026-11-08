"""Structural validation of every skill against the Agent Skills spec + pack rules.

Usage: python3 -I validate_skills.py <pack-dir>
Checks (exit 1 on any failure):
  - frontmatter present; name 1-64 chars [a-z0-9-], no leading/trailing/double hyphen,
    equals folder name, no reserved words (anthropic, claude), no XML tags
  - description 1-1024 chars, no XML tags, contains "Use when"
  - optional fields: compatibility <= 500 chars; metadata values are strings
  - SKILL.md body < 500 lines
  - every referenced relative file (references/, scripts/, assets/) exists; references are one level deep
  - reference files > 100 lines start with a Contents section
  - no Windows-style paths
  - guidelines/core.md template <= 150 lines
"""
import pathlib
import re
import sys

NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
XML_RE = re.compile(r"<[a-zA-Z/][^>]*>")
MAX_BODY_LINES = 500          # spec recommendation for SKILL.md
MAX_REFERENCE_NO_TOC = 100    # best practice: TOC for longer reference files
MAX_GUIDELINE_LINES = 150     # pack rule for the always-loaded file


def parse_frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        return None, text
    fm, body = m.group(1), m.group(2)
    data, key = {}, None
    for line in fm.splitlines():
        top = re.match(r"^([a-zA-Z][\w-]*):\s*(.*)$", line)
        if top:
            key, val = top.group(1), top.group(2).strip()
            data[key] = val.strip("'\"") if val else {}
        elif key and isinstance(data.get(key), dict):
            sub = re.match(r"^\s+([\w-]+):\s*(.*)$", line)
            if sub:
                data[key][sub.group(1)] = sub.group(2).strip()
    return data, body


def check_skill(skill_dir: pathlib.Path):
    errs = []
    md = skill_dir / "SKILL.md"
    text = md.read_text()
    fm, body = parse_frontmatter(text)
    if fm is None:
        return [f"{md}: missing YAML frontmatter"]
    name, desc = fm.get("name", ""), fm.get("description", "")
    if not (1 <= len(name) <= 64) or not NAME_RE.match(name):
        errs.append(f"name '{name}' violates format")
    if name != skill_dir.name:
        errs.append(f"name '{name}' != folder '{skill_dir.name}'")
    if "anthropic" in name or "claude" in name:
        errs.append("name contains a reserved word")
    if not (1 <= len(desc) <= 1024):
        errs.append(f"description length {len(desc)} not in 1..1024")
    if XML_RE.search(desc) or XML_RE.search(name):
        errs.append("XML tag in name/description")
    if "Use when" not in desc:
        errs.append("description lacks a 'Use when' clause")
    comp = fm.get("compatibility")
    if isinstance(comp, str) and len(comp) > 500:
        errs.append("compatibility > 500 chars")
    meta = fm.get("metadata", {})
    if meta and not isinstance(meta, dict):
        errs.append("metadata must be a mapping")
    body_lines = body.count("\n") + 1
    if body_lines >= MAX_BODY_LINES:
        errs.append(f"SKILL.md body has {body_lines} lines (>= {MAX_BODY_LINES})")
    for ref in set(re.findall(r"`((?:references|scripts|assets)/[^`\s]+)`", text)):
        p = skill_dir / ref
        if not p.exists():
            errs.append(f"referenced file missing: {ref}")
        if ref.count("/") > 1 and ref.startswith("references/"):
            errs.append(f"reference nested more than one level: {ref}")
    for f in skill_dir.rglob("*.md"):
        if "evals" in f.parts:
            continue
        t = f.read_text()
        if re.search(r"[a-z]\\[a-z_]+\.(md|py|mjs|ts)", t):
            errs.append(f"Windows-style path in {f.relative_to(skill_dir)}")
        if f.parent.name == "references":
            if t.count("\n") > MAX_REFERENCE_NO_TOC and "## Contents" not in t:
                errs.append(f"{f.relative_to(skill_dir)} > {MAX_REFERENCE_NO_TOC} lines without '## Contents'")
            # one level deep: reference files must not send the agent to other reference files
            if re.search(r"references/[\w.-]+\.md", t):
                errs.append(f"{f.relative_to(skill_dir)} links to another reference file")
    return errs


def main():
    pack = pathlib.Path(sys.argv[1])
    failures = 0
    for skill_dir in sorted((pack / "skills").iterdir()):
        if not (skill_dir / "SKILL.md").exists():
            continue
        errs = check_skill(skill_dir)
        body = parse_frontmatter((skill_dir / "SKILL.md").read_text())[1]
        status = "OK " if not errs else "ERR"
        print(f"{status} {skill_dir.name:34} body={body.count(chr(10)) + 1:3} lines")
        for e in errs:
            print(f"      - {e}")
        failures += bool(errs)
    g = (pack / "guidelines/core.md").read_text().count("\n") + 1
    print(f"{'OK ' if g <= MAX_GUIDELINE_LINES else 'ERR'} guidelines/core.md {g} lines (max {MAX_GUIDELINE_LINES})")
    failures += g > MAX_GUIDELINE_LINES
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
