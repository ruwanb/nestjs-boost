// Validates every skill against the Agent Skills spec and the pack's house rules, and checks that
// manifest.json matches the skills on disk. Run by `npm test` and before every publish.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_IDS } from '../lib/agents.mjs';

const root = resolve(process.argv[2] ?? '.');
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const XML_RE = /<[a-zA-Z/][^>]*>/;
const MAX_BODY_LINES = 500;
const MAX_REFERENCE_NO_TOC = 100;
const MAX_GUIDELINE_LINES = 150;

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  let parent = null;
  for (const line of m[1].split('\n')) {
    const top = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (top) { parent = top[1]; meta[parent] = top[2] === '' ? {} : top[2]; continue; }
    const sub = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (sub && parent && typeof meta[parent] === 'object') meta[parent][sub[1]] = sub[2].replace(/^"|"$/g, '');
  }
  return { meta, body: m[2] };
}

const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

export function checkSkill(dir) {
  const errs = [];
  const name = dir.split(/[\\/]/).pop();
  const file = join(dir, 'SKILL.md');
  if (!existsSync(file)) return ['missing SKILL.md'];
  const text = readFileSync(file, 'utf8');
  const fm = parseFrontmatter(text);
  if (!fm) return ['missing or malformed frontmatter'];
  const { meta, body } = fm;
  const desc = typeof meta.description === 'string' ? meta.description : '';
  if (!NAME_RE.test(meta.name ?? '') || meta.name.length > 64) errs.push(`name '${meta.name}' violates format`);
  if (meta.name !== name) errs.push(`name '${meta.name}' != folder '${name}'`);
  if (/anthropic|claude/i.test(meta.name ?? '')) errs.push('name contains a reserved word');
  if (desc.length < 1 || desc.length > 1024) errs.push(`description length ${desc.length} not in 1..1024`);
  if (XML_RE.test(`${meta.name} ${desc}`)) errs.push('XML tag in name/description');
  if (!/Use when/.test(desc)) errs.push("description lacks a 'Use when' clause");
  if (typeof meta.compatibility === 'string' && meta.compatibility.length > 500) errs.push('compatibility > 500 chars');
  if (meta.metadata !== undefined && typeof meta.metadata !== 'object') errs.push('metadata must be a mapping');
  const bodyLines = body.split('\n').length;
  if (bodyLines >= MAX_BODY_LINES) errs.push(`body has ${bodyLines} lines (>= ${MAX_BODY_LINES})`);
  for (const [, ref] of text.matchAll(/`((?:references|scripts|assets)\/[^`\s]+)`/g)) {
    if (!existsSync(join(dir, ref))) errs.push(`referenced file missing: ${ref}`);
    if (ref.split('/').length > 2) errs.push(`reference nested more than one level: ${ref}`);
  }
  for (const f of walk(dir)) {
    const rel = relative(dir, f);
    const t = readFileSync(f, 'utf8');
    if (rel.startsWith('references') && f.endsWith('.md')) {
      if (t.split('\n').length > MAX_REFERENCE_NO_TOC && !t.includes('## Contents')) errs.push(`${rel} > ${MAX_REFERENCE_NO_TOC} lines without '## Contents'`);
      if (/references\/[\w.-]+\.md/.test(t)) errs.push(`${rel} links to another reference file`);
    }
  }
  return errs;
}

export function validatePack(dir) {
  const problems = [];
  const skillsDir = join(dir, 'skills');
  const names = readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory()).sort();
  for (const n of names) for (const e of checkSkill(join(skillsDir, n))) problems.push(`${n}: ${e}`);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const listed = new Set(manifest.skills.map((s) => s.name));
  for (const n of names) if (!listed.has(n)) problems.push(`${n}: not in manifest.json (run tools/build_manifest.py)`);
  for (const n of listed) if (!names.includes(n)) problems.push(`${n}: in manifest.json but no skills/${n}/`);
  const pkgVersion = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  if (JSON.stringify(manifest.agents) !== JSON.stringify(AGENT_IDS)) problems.push(`manifest.json agents ${JSON.stringify(manifest.agents)} != lib/agents.mjs ${JSON.stringify(AGENT_IDS)} (update tools/build_manifest.py)`);
  if (manifest.version !== pkgVersion) problems.push(`manifest.json version ${manifest.version} != package.json ${pkgVersion} (run tools/build_manifest.py)`);
  const g = readFileSync(join(dir, 'guidelines/core.md'), 'utf8').split('\n').length;
  if (g > MAX_GUIDELINE_LINES) problems.push(`guidelines/core.md has ${g} lines (max ${MAX_GUIDELINE_LINES})`);
  return { count: names.length, problems };
}

// Compare real paths, not `file://${argv[1]}`: the string form never matches on Windows (and drive
// letter case varies), which silently skipped validation, and so `npm test` / prepublishOnly, there.
const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  const { count, problems } = validatePack(root);
  for (const p of problems) console.error(`ERR ${p}`);
  console.log(`${count} skills checked, ${problems.length} problem(s)`);
  process.exitCode = problems.length ? 1 : 0;
}
