# Security policy

## Supported versions

Only the latest published version of `nestjs-boost` receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Advisories → Report a vulnerability** on
[ruwanb/nestjs-boost](https://github.com/ruwanb/nestjs-boost/security/advisories/new).

Include what you found, how to reproduce it, and the version affected. You'll get a reply within
7 days. Once a fix is released, the advisory is published with credit to you, unless you'd rather
stay anonymous.

## Scope

In scope:
- The CLI and `postinstall` hook (`bin/`, `lib/`, `scripts/postinstall.mjs`): for example, writing
  or deleting files outside the documented paths, following symlinks, or trusting a tampered
  `.ai/nestjs-boost.lock.json`.
- Skill or guideline content that instructs AI agents to do something unsafe (prompt injection,
  insecure code patterns presented as recommended).
- The release pipeline (`.github/workflows/`).

Out of scope: vulnerabilities in NestJS itself or in the AI agents that read the skills. Please
report those to their maintainers.
