"""Generate manifest.json (read by the installer) from coverage/taxonomy.json + pages.json.

Usage: python3 -I build_manifest.py <pack-dir>
The taxonomy is the single place skill ownership is edited; never hand-edit manifest.json.
"""
import json
import pathlib
import sys

PACK_NAME = "nestjs-boost"
# The manifest version always follows package.json, so the lock file and release check agree.
PACK_VERSION = json.loads((pathlib.Path(__file__).resolve().parent.parent / "package.json").read_text())["version"]


def main():
    pack = pathlib.Path(sys.argv[1])
    tax = json.loads((pack / "coverage/taxonomy.json").read_text())
    pages = json.loads((pack / "coverage/pages.json").read_text())
    by_path = {p["path"]: p for p in pages["pages"]}
    major = tax["nestjsTargetMajor"]

    skills = []
    for owner in tax["owners"]:
        if owner["layer"] == "guidelines":
            continue
        when = owner["installWhen"]
        skills.append({
            "name": owner["name"],
            "layer": owner["layer"],
            "installWhen": {"always": True} if when == "always" else when,
            "docPages": [by_path[p]["url"] for p in owner["pages"]],
        })

    manifest = {
        "pack": PACK_NAME,
        "version": PACK_VERSION,
        "nestjs": {"targetMajor": major, "supportedRange": f">={major} <{major + 1}"},
        "docs": {"repo": "nestjs/docs.nestjs.com", "commit": pages["docsCommit"],
                 "crawled": pages["docsCommitDate"]},
        # Must match the ids in lib/agents.mjs (scripts/validate.mjs checks this).
        "agents": ["claude-code", "codex", "copilot", "cursor", "gemini", "windsurf", "cline", "roo", "kiro", "junie", "opencode"],
        "skills": skills,
    }
    (pack / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"manifest.json: {len(skills)} skills")


if __name__ == "__main__":
    main()
