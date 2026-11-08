// nestjs-boost core: detect a NestJS project, choose the matching Agent Skills, and sync them
// (plus a guidelines block) into the folders each coding agent reads.
//
// Safety rules, enforced here for every caller (the CLI and anyone importing the package):
// - Writes only inside the project root, only to skill folders, guideline files and the lock file.
// - Edits guideline files only between the marker comments; everything else is kept.
// - Never overwrites or deletes a skill folder the user changed (tracked by content hash in
//   the lock file) unless `force` is set. Customize through `.ai/skills/<name>/` instead.
// - Never follows symbolic links: a link anywhere on a path it writes or deletes is refused, and
//   links inside skill folders, `.ai/skills` and `.ai/guidelines` are skipped.
// - Trusts nothing in the lock file: only skill-folder and guideline paths it could have written
//   are honoured, so a tampered lock file can't point a delete at other project files.
// - No network access, no child processes, no dependencies.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, AGENT_IDS, ALL_INSTRUCTION_FILES, ALL_SKILL_DIRS, DEFAULT_AGENTS, instructionFiles, planSkillDirs } from './agents.mjs';

export { AGENTS, AGENT_IDS, AGENT_LIST, DEFAULT_AGENTS, planSkillDirs } from './agents.mjs';
export const PACK_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = JSON.parse(readFileSync(join(PACK_DIR, 'manifest.json'), 'utf8'));
export const PACK_VERSION = JSON.parse(readFileSync(join(PACK_DIR, 'package.json'), 'utf8')).version;
const START = '<!-- nestjs-boost:start -->';
const END = '<!-- nestjs-boost:end -->';
export const LOCK = '.ai/nestjs-boost.lock.json';
const CONFIG_FILE = '.ai/nestjs-boost.json';

// Text from the project (lock entries, folder names, versions in package.json) ends up in terminal
// output. Control characters and bidi overrides are escaped so a hostile repository can't send
// ANSI/OSC sequences (rewrite or hide output, set the clipboard) or reorder what you read.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;
export const clean = (text) => String(text).replace(UNSAFE_CHARS, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export class BoostError extends Error {}
const fail = (msg) => { throw new BoostError(clean(msg)); };
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const toList = (v) => (Array.isArray(v) ? v : v ? String(v).split(',') : []).map((s) => String(s).trim()).filter(Boolean);

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Lock-file allowlist, derived from the agent registry: `<some agent's skills dir>/<skill name>`.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SKILL_PATH_RE = new RegExp(`^(${ALL_SKILL_DIRS.map(escapeRe).join('|')})/[a-z0-9]+(-[a-z0-9]+)*$`);
const GUIDELINE_FILES = new Set(ALL_INSTRUCTION_FILES);
const lstat = (p) => { try { return lstatSync(p); } catch { return null; } };

// Returns the first symbolic link (or Windows junction) between root (exclusive) and full, if any.
function linkOnPath(root, full) {
  let cur = root;
  for (const part of relative(root, full).split(sep)) {
    cur = join(cur, part);
    const st = lstat(cur);
    if (!st) return null; // the rest doesn't exist yet
    if (st.isSymbolicLink()) return cur;
  }
  return null;
}

// Resolve a path strictly below the project root, refusing symbolic links on the way, so
// writes and deletes can't be redirected outside the project.
function inside(root, p) {
  const full = resolve(root, p);
  if (!full.startsWith(root + sep)) fail(`refusing to touch a path outside the project: ${p}`);
  const link = linkOnPath(root, full);
  if (link) fail(`refusing to follow a symbolic link: ${relative(root, link).split(sep).join('/')}`);
  return full;
}

// A real (non-symlinked) directory below root, or null.
function safeDir(root, rel) {
  const full = resolve(root, rel);
  if (!full.startsWith(root + sep) || linkOnPath(root, full)) return null;
  return lstat(full)?.isDirectory() ? full : null;
}

// Stable content hash of a directory (relative paths + bytes), used to spot user edits.
// Symbolic links and special files are skipped (and never copied), so a link can't pull outside
// content in or make the walk loop. Anything that isn't a directory gets a sentinel hash, so it is
// treated as user content and left alone.
export function hashDir(dir) {
  const st = lstat(dir);
  if (!st) return null;
  if (!st.isDirectory()) return 'not-a-directory';
  const h = createHash('sha256');
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const full = join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile()) h.update(relative(dir, full).split(sep).join('/')).update('\0').update(readFileSync(full)).update('\0');
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 16);
}
// Copy filter: plain files and directories only. Links, FIFOs, sockets and devices are skipped
// (a FIFO would make the copy block or throw).
const noLinks = (src) => { const st = lstatSync(src); return st.isFile() || st.isDirectory(); };

// Read the lock file, keeping only entries nestjs-boost itself could have written.
export function readLock(lockPath) {
  const raw = readJson(lockPath);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ignored = [];
  const files = {};
  for (const [rel, hash] of Object.entries(raw.files && typeof raw.files === 'object' ? raw.files : {})) {
    if (SKILL_PATH_RE.test(rel) && typeof hash === 'string') files[rel] = hash;
    else ignored.push(rel);
  }
  const guidelineList = (v) => (Array.isArray(v) ? v : []).filter((f) => {
    const ok = GUIDELINE_FILES.has(f);
    if (!ok) ignored.push(String(f));
    return ok;
  });
  return {
    ...raw,
    agents: Array.isArray(raw.agents) ? raw.agents.map(String) : undefined,
    skillOptions: raw.skillOptions && typeof raw.skillOptions === 'object' && !Array.isArray(raw.skillOptions) ? raw.skillOptions : undefined,
    files,
    guidelines: guidelineList(raw.guidelines),
    createdGuidelines: guidelineList(raw.createdGuidelines),
    ignored: [...new Set(ignored)],
  };
}
const ignoredWarning = (lock) => (lock?.ignored.length
  ? [`lock file lists paths nestjs-boost never writes; ignored: ${lock.ignored.join(', ')}`] : []);

// ---------- detection ----------
export function isNestProject(root) {
  const pkg = readJson(join(root, 'package.json'));
  return Boolean(pkg && { ...pkg.devDependencies, ...pkg.dependencies }['@nestjs/core']);
}

export function detect(root) {
  const rootPkg = readJson(join(root, 'package.json'));
  if (!rootPkg) fail(`no package.json in ${root}`);
  const pkgs = [rootPkg];
  for (const dir of ['apps', 'libs', 'packages']) {
    const base = join(root, dir);
    if (!existsSync(base) || !statSync(base).isDirectory()) continue;
    for (const name of readdirSync(base)) {
      const p = readJson(join(base, name, 'package.json'));
      if (p) pkgs.push(p);
    }
  }
  // Null-prototype map filled with own string entries only: a "__proto__" key in a package.json
  // can't change the prototype (Object.assign would) or make a missing dependency look present.
  const deps = Object.create(null);
  for (const p of pkgs) {
    for (const field of ['devDependencies', 'dependencies']) {
      const list = p?.[field];
      if (!list || typeof list !== 'object' || Array.isArray(list)) continue;
      for (const [name, range] of Object.entries(list)) if (typeof range === 'string') deps[name] = range;
    }
  }
  if (!deps['@nestjs/core']) fail('no @nestjs/core in package.json; run this in a NestJS project');

  const installedCore = readJson(join(root, 'node_modules/@nestjs/core/package.json'))?.version;
  const coreVersion = clean(typeof installedCore === 'string' ? installedCore : deps['@nestjs/core'].replace(/^[^\d]*/, '')).slice(0, 64);
  const nestMajor = Number(coreVersion.split('.')[0]) || null;

  const has = (name) => Boolean(deps[name]);
  const adapter = has('@nestjs/platform-node') ? 'Node adapter (@nestjs/platform-node)'
    : has('@nestjs/platform-fastify') ? 'Fastify (@nestjs/platform-fastify)'
    : has('@nestjs/platform-express') ? 'Express (@nestjs/platform-express)' : 'none (no HTTP platform package)';
  const esm = rootPkg.type === 'module';
  const testRunner = has('vitest') ? 'Vitest' : has('jest') ? 'Jest' : 'unknown';
  const linter = has('oxlint') ? 'oxlint' : has('eslint') ? 'ESLint' : has('@biomejs/biome') ? 'Biome' : 'none';
  const pm = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(join(root, 'yarn.lock')) ? 'yarn'
    : existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock')) ? 'bun' : 'npm';
  const schemaLib = ['zod', 'valibot', 'arktype'].find(has);
  const validation = [schemaLib && `Standard Schema (${schemaLib}) with StandardSchemaValidationPipe`, has('class-validator') && 'class-validator with ValidationPipe']
    .filter(Boolean).join(' + ') || 'none installed yet (default: zod + StandardSchemaValidationPipe)';
  const nestCli = readJson(join(root, 'nest-cli.json')) ?? {};

  const scripts = rootPkg.scripts ?? {};
  const run = (s) => (pm === 'npm' ? (s === 'test' ? 'npm test' : `npm run ${s}`) : `${pm} ${s}`);
  const cmd = (s, fallback) => (scripts[s] ? run(s) : fallback);

  return {
    root, deps, nestMajor, coreVersion, adapter, esm, testRunner, linter, pm, validation,
    config: rootPkg['nestjs-boost'] ?? null,
    monorepo: nestCli.monorepo === true,
    files: (names) => names.filter((n) => existsSync(join(root, n))),
    commands: {
      build: cmd('build', 'npx nest build'),
      lint: cmd('lint', '# no lint script'),
      test: cmd('test', '# no test script'),
      e2e: cmd('test:e2e', '# no e2e script'),
      start: cmd('start:prod', 'node dist/main'),
    },
  };
}

// Agents whose files are already in the project (registry order); empty if none.
export function findAgents(root) {
  return AGENT_IDS.filter((id) => AGENTS[id].markers.some((m) => existsSync(join(root, m))));
}

export function detectAgents(root) {
  const found = findAgents(root);
  return found.length ? found : DEFAULT_AGENTS;
}

// Validate and normalise an agent list: known ids only, registry order, no duplicates.
export function normalizeAgents(list) {
  const ids = toList(list);
  const unknown = ids.filter((a) => !AGENTS[a]);
  if (unknown.length) fail(`unknown agent(s): ${unknown.join(', ')} (known: ${AGENT_IDS.join(', ')}; see \`nestjs-boost agents\`)`);
  return AGENT_IDS.filter((id) => ids.includes(id));
}

// Options precedence: explicit (CLI) > package.json "nestjs-boost" > .ai/nestjs-boost.json > lock > detection.
// `agentSource` says which one decided the agents, so the CLI knows whether to ask.
export function resolveOptions(root, facts, explicit = {}, lock = null) {
  const file = readJson(join(root, CONFIG_FILE)) ?? {};
  const pkg = facts.config ?? {};
  const given = (v) => v !== undefined && !(Array.isArray(v) && !v.length) && v !== '';
  const pick = (key) => [explicit[key], pkg[key], file[key]].find(given);
  const agentSources = [['cli', explicit.agents], ['package.json', pkg.agents], [CONFIG_FILE, file.agents], ['lock', lock?.agents]];
  const [agentSource, agentList] = agentSources.find(([, v]) => toList(v).length) ?? [findAgents(root).length ? 'detected' : 'default', detectAgents(root)];
  const agents = normalizeAgents(agentList);
  // Skill choices also fall back to the lock, so `install --include x` once keeps x on later
  // syncs. An explicit value wins even when empty: the picker passes `include: []` to clear it.
  // Lock names are filtered to known skills so a skill dropped from the pack can't break a sync.
  const known = new Set(MANIFEST.skills.map((s) => s.name));
  const saved = lock?.skillOptions ?? {};
  const fromLock = { all: saved.all === true || undefined, include: toList(saved.include).filter((n) => known.has(n)), exclude: toList(saved.exclude).filter((n) => known.has(n)) };
  const pickSkill = (key) => (explicit[key] !== undefined ? explicit[key] : [pkg[key], file[key], fromLock[key]].find(given));
  // Skills pinned in config aren't offered in the picker (like pinned agents).
  const skillSource = ['include', 'all'].some((k) => given(pkg[k])) ? 'package.json'
    : ['include', 'all'].some((k) => given(file[k])) ? CONFIG_FILE : null;
  return {
    agents,
    agentSource,
    skillSource,
    configExclude: toList([pkg.exclude, file.exclude].find(given)),
    all: Boolean(pickSkill('all')),
    include: toList(pickSkill('include')),
    exclude: toList(pickSkill('exclude')),
    guidelines: pick('guidelines') !== false,
  };
}

// ---------- skill selection ----------
export function selectSkills(facts, { all = false, include = [], exclude = [] } = {}) {
  const known = new Set(MANIFEST.skills.map((s) => s.name));
  const unknown = [...include, ...exclude].filter((n) => !known.has(n));
  if (unknown.length) fail(`unknown skill(s): ${unknown.join(', ')} (see \`nestjs-boost list --all\`)`);
  const selected = [];
  for (const s of MANIFEST.skills) {
    const w = s.installWhen ?? {};
    let reason = null;
    if (w.always) reason = 'foundation';
    else if (w.anyDependency?.some((d) => facts.deps[d])) reason = `dependency: ${w.anyDependency.filter((d) => facts.deps[d]).join(', ')}`;
    else if (w.anyFile && facts.files(w.anyFile).length) reason = `file: ${facts.files(w.anyFile).join(', ')}`;
    else if (w.nestjsMajorBelow && facts.nestMajor && facts.nestMajor < w.nestjsMajorBelow) reason = `NestJS ${facts.nestMajor} < ${w.nestjsMajorBelow}`;
    if (!reason && (all || include.includes(s.name))) reason = all ? 'all' : 'include';
    if (reason && exclude.includes(s.name)) reason = null;
    if (reason && existsSync(join(PACK_DIR, 'skills', s.name, 'SKILL.md'))) selected.push({ name: s.name, reason });
  }
  return selected;
}

// ---------- guidelines ----------
function skillSummary(skillDir) {
  const md = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
  const desc = md.match(/^description:\s*(.+)$/m)?.[1] ?? '';
  const use = desc.match(/Use when (.+?)(?:\. Not for |\.?$)/)?.[1];
  return use ? `use when ${use}` : desc;
}

export function renderGuidelines(facts, skills, root, customSkills = []) {
  let tpl = readFileSync(join(PACK_DIR, 'guidelines/core.md'), 'utf8');
  const runnerApi = facts.testRunner === 'Vitest' ? '`vi.fn()`, `vi.spyOn()`' : facts.testRunner === 'Jest' ? '`jest.fn()`, `jest.spyOn()`' : 'the configured runner';
  const values = {
    nestjsVersion: facts.coreVersion,
    docsCrawled: MANIFEST.docs.crawled,
    httpAdapter: facts.adapter,
    moduleFormat: facts.esm ? 'ESM (`"type": "module"`)' : 'CommonJS',
    testRunner: facts.testRunner,
    linter: facts.linter,
    packageManager: facts.pm,
    validation: facts.validation,
    esmNote: facts.esm ? 'This is an **ESM** project: relative imports use the `.js` extension (`import { X } from \'./x.service.js\'`), and `main.ts` may use top-level `await`.' : '',
    buildCommand: facts.commands.build,
    lintCommand: facts.commands.lint,
    testCommand: facts.commands.test,
    e2eCommand: facts.commands.e2e,
    startCommand: facts.commands.start,
    testRunnerApi: runnerApi,
    skillMap: [
      ...skills.map((s) => `- \`${s.name}\`: ${skillSummary(join(PACK_DIR, 'skills', s.name))}`),
      ...customSkills.map((n) => `- \`${n}\` (project): ${skillSummary(join(root, '.ai/skills', n))}`),
    ].join('\n'),
  };
  tpl = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '');
  const extraDir = safeDir(root, '.ai/guidelines');
  if (extraDir) {
    const extras = readdirSync(extraDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.md')).map((d) => d.name).sort();
    for (const f of extras) tpl += `\n\n${readFileSync(join(extraDir, f), 'utf8').trim()}\n`;
  }
  return stripMarkers(tpl).replace(/\n{3,}/g, '\n\n').trim();
}

// Project-supplied text (custom guidelines, skill descriptions) must not contain the block
// markers, or it would move the block boundaries and later syncs could overwrite user text.
const stripMarkers = (text) => text.split(START).join('').split(END).join('');

// Replace only the marked block; keep everything the user wrote outside it.
export function upsertBlock(existing, body) {
  const block = `${START}\n${body}\n${END}`;
  if (!existing) return `${block}\n`;
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s !== -1 && e > s) return existing.slice(0, s) + block + existing.slice(e + END.length);
  return `${existing.trimEnd()}\n\n${block}\n`;
}

export function removeBlock(existing) {
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s === -1 || e < s) return existing;
  return `${existing.slice(0, s).trimEnd()}\n\n${existing.slice(e + END.length).trimStart()}`.trim() + '\n';
}

// ---------- sync ----------
// Returns a report; writes nothing when dryRun is set.
export function sync(root, explicit = {}, { dryRun = false, force = false, prune = true } = {}) {
  root = resolve(root);
  const lockPath = inside(root, LOCK);
  const lock = readLock(lockPath);
  const facts = detect(root);
  const opts = resolveOptions(root, facts, explicit, lock);
  const skills = selectSkills(facts, opts);
  const warnings = ignoredWarning(lock);
  const overridesDir = safeDir(root, '.ai/skills');
  const overrides = [];
  for (const d of overridesDir ? readdirSync(overridesDir, { withFileTypes: true }) : []) {
    const skillFile = lstat(join(overridesDir, d.name, 'SKILL.md'));
    if (!d.isDirectory() || !skillFile?.isFile()) {
      if (d.isSymbolicLink()) warnings.push(`.ai/skills/${d.name}: symbolic link; skipped`);
      continue;
    }
    if (!NAME_RE.test(d.name)) { warnings.push(`.ai/skills/${d.name}: skill names must be lowercase-with-hyphens; skipped`); continue; }
    overrides.push(d.name);
  }
  const custom = overrides.filter((n) => !skills.some((s) => s.name === n));
  const prevFiles = lock?.files ?? {};
  const files = {};
  const changes = [];

  const wanted = new Map();
  const skillDirs = planSkillDirs(opts.agents);
  for (const { dir } of skillDirs) {
    for (const s of skills) wanted.set(`${dir}/${s.name}`, overrides.includes(s.name) ? join(overridesDir, s.name) : join(PACK_DIR, 'skills', s.name));
    for (const n of custom) wanted.set(`${dir}/${n}`, join(overridesDir, n));
  }

  for (const [rel, src] of wanted) {
    const dest = inside(root, rel);
    const srcHash = hashDir(src);
    const destHash = hashDir(dest);
    const tracked = prevFiles[rel];
    if (destHash === srcHash) { files[rel] = srcHash; continue; }
    if (destHash && !force && (tracked === undefined || destHash !== tracked)) {
      warnings.push(`${rel}: ${tracked === undefined ? 'exists and was not installed by nestjs-boost' : 'was edited'}; left as is (customize via .ai/skills/${rel.split('/').pop()}/, or use --force)`);
      if (tracked !== undefined) files[rel] = tracked;
      continue;
    }
    changes.push({ action: destHash ? 'update' : 'add', path: rel });
    if (!dryRun) {
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true, filter: noLinks });
    }
    files[rel] = srcHash;
  }

  // Skills installed earlier whose condition no longer holds.
  for (const [rel, hash] of Object.entries(prevFiles)) {
    if (wanted.has(rel)) continue;
    const dest = inside(root, rel);
    const current = hashDir(dest);
    if (!current) continue;
    if (!prune || (current !== hash && !force)) {
      if (prune) warnings.push(`${rel}: no longer needed but was edited; left as is (delete it yourself, or use --force)`);
      files[rel] = hash;
      continue;
    }
    changes.push({ action: 'remove', path: rel });
    if (!dryRun) rmSync(dest, { recursive: true, force: true });
  }

  // Guidelines block in each agent's instructions file.
  const guidelineFiles = opts.guidelines ? instructionFiles(opts.agents) : [];
  const created = new Set(lock?.createdGuidelines ?? []);
  if (guidelineFiles.length) {
    const body = renderGuidelines(facts, skills, root, custom);
    for (const rel of guidelineFiles) {
      const dest = inside(root, rel);
      const before = existsSync(dest) ? readFileSync(dest, 'utf8') : '';
      const after = upsertBlock(before, body);
      if (!before) created.add(rel);
      if (before === after) continue;
      changes.push({ action: before ? 'update' : 'add', path: `${rel} (guidelines block)` });
      if (!dryRun) { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, after); }
    }
  }
  // Instructions files of agents no longer selected (or guidelines turned off): take the block out.
  if (prune) {
    for (const rel of lock?.guidelines ?? []) {
      if (!guidelineFiles.includes(rel)) removeGuideline(root, rel, lock.createdGuidelines.includes(rel), changes, dryRun);
    }
  }
  if (!dryRun) removeEmptyDirs(root, changes);

  const nextLock = {
    pack: MANIFEST.pack, version: PACK_VERSION, agents: opts.agents,
    ...(opts.all || opts.include.length || opts.exclude.length
      ? { skillOptions: { ...(opts.all ? { all: true } : {}), ...(opts.include.length ? { include: opts.include } : {}), ...(opts.exclude.length ? { exclude: opts.exclude } : {}) } }
      : {}),
    skills: skills.map((s) => s.name), guidelines: guidelineFiles,
    createdGuidelines: [...created].filter((f) => guidelineFiles.includes(f)).sort(), files,
  };
  const lockText = JSON.stringify(nextLock, null, 2) + '\n';
  if (!dryRun && (!existsSync(lockPath) || readFileSync(lockPath, 'utf8') !== lockText)) {
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, lockText);
  }
  return { facts, opts, foundAgents: findAgents(root), skills, custom, skillDirs, guidelineFiles, changes, warnings: warnings.map(clean), dryRun };
}

// Take the nestjs-boost block out of an instructions file; delete the file if nestjs-boost created
// it and nothing else is left.
function removeGuideline(root, rel, createdByUs, changes, dryRun) {
  const dest = inside(root, rel);
  if (!lstat(dest)?.isFile()) return;
  const before = readFileSync(dest, 'utf8');
  const after = removeBlock(before);
  if (before === after) return;
  const drop = after.trim() === '' && createdByUs;
  changes.push({ action: drop ? 'remove' : 'update', path: `${rel}${drop ? '' : ' (guidelines block removed)'}` });
  if (!dryRun) drop ? rmSync(dest) : writeFileSync(dest, after);
}

// After removing skill folders, also remove the skills folder and its agent folder (e.g. `.cursor/`)
// if that left them empty. Only folders above a removed path are considered.
function removeEmptyDirs(root, changes, extra = []) {
  const removed = changes.filter((c) => c.action === 'remove').map((c) => c.path);
  const candidates = [...new Set([...removed.flatMap((p) => [dirname(p), dirname(dirname(p))]), ...extra])]
    .filter((d) => d !== '.' && (ALL_SKILL_DIRS.some((s) => s === d || dirname(s) === d) || extra.includes(d)));
  for (const rel of candidates) {
    const d = safeDir(root, rel);
    try { if (d && !readdirSync(d).length) rmSync(d, { recursive: true }); } catch { /* absent or busy */ }
  }
}

// Remove everything nestjs-boost installed (edited skills are kept unless force).
export function uninstall(root, { dryRun = false, force = false } = {}) {
  root = resolve(root);
  const lockPath = inside(root, LOCK);
  const lock = readLock(lockPath);
  const changes = [];
  if (!lock) return { changes, warnings: ['nothing to remove: no .ai/nestjs-boost.lock.json'], dryRun };
  const warnings = ignoredWarning(lock);
  for (const [rel, hash] of Object.entries(lock.files)) {
    const dest = inside(root, rel);
    const current = hashDir(dest);
    if (!current) continue;
    if (current !== hash && !force) { warnings.push(`${rel}: edited; kept (use --force to remove)`); continue; }
    changes.push({ action: 'remove', path: rel });
    if (!dryRun) rmSync(dest, { recursive: true, force: true });
  }
  for (const rel of lock.guidelines) removeGuideline(root, rel, lock.createdGuidelines.includes(rel), changes, dryRun);
  if (!dryRun) {
    rmSync(lockPath, { force: true });
    removeEmptyDirs(root, changes, ['.ai']);
  }
  return { changes, warnings: warnings.map(clean), dryRun };
}
