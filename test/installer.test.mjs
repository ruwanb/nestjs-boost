import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LOCK, detectAgents, hashDir, removeBlock, sync, uninstall, upsertBlock } from '../lib/installer.mjs';

const CLI = fileURLToPath(new URL('../bin/nestjs-boost.mjs', import.meta.url));
const POSTINSTALL = fileURLToPath(new URL('../scripts/postinstall.mjs', import.meta.url));
const dirs = [];

function project(pkg = {}, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nestjs-boost-'));
  dirs.push(root);
  const base = { name: 'app', type: 'module', scripts: { build: 'nest build', test: 'vitest run' }, dependencies: { '@nestjs/core': '^12.3.0', '@nestjs/platform-express': '^12.3.0' }, devDependencies: { vitest: '^4.0.0' } };
  writeFileSync(join(root, 'package.json'), JSON.stringify({ ...base, ...pkg, dependencies: { ...base.dependencies, ...pkg.dependencies } }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const lock = (root) => JSON.parse(read(root, LOCK));
const setDeps = (root, deps) => {
  const pkg = JSON.parse(read(root, 'package.json'));
  pkg.dependencies = deps;
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
};

afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });

describe('sync', () => {
  it('installs foundation and dependency skills for the default agents', () => {
    const root = project({ dependencies: { '@nestjs/typeorm': '^12.0.0' } });
    const r = sync(root);
    assert.deepEqual(r.opts.agents, ['claude-code', 'codex']);
    for (const dir of ['.claude/skills', '.agents/skills']) {
      assert.ok(existsSync(join(root, dir, 'nestjs-architecture/SKILL.md')));
      assert.ok(existsSync(join(root, dir, 'nestjs-database-typeorm/SKILL.md')));
      assert.ok(!existsSync(join(root, dir, 'nestjs-graphql')));
    }
    assert.match(read(root, 'CLAUDE.md'), /nestjs-boost:start[\s\S]*nestjs-database-typeorm[\s\S]*nestjs-boost:end/);
    assert.match(read(root, 'AGENTS.md'), /Vitest/);
    assert.ok(lock(root).files['.claude/skills/nestjs-architecture']);
  });

  it('is idempotent and writes nothing the second time', () => {
    const root = project();
    sync(root);
    const before = read(root, LOCK);
    const r = sync(root);
    assert.equal(r.changes.length, 0);
    assert.equal(read(root, LOCK), before);
  });

  it('keeps text outside the guideline markers', () => {
    const root = project({}, { 'AGENTS.md': '# My rules\n\nBe nice.\n' });
    sync(root, { agents: 'codex' });
    sync(root, { agents: 'codex' });
    const text = read(root, 'AGENTS.md');
    assert.match(text, /^# My rules\n\nBe nice\./);
    assert.equal(text.match(/nestjs-boost:start/g).length, 1);
  });

  it('detects agents from existing files', () => {
    const root = project({}, { '.cursor/rules/x.mdc': 'x', '.github/copilot-instructions.md': 'hi' });
    assert.deepEqual(detectAgents(root), ['copilot', 'cursor']); // registry order
  });

  it('reads options from package.json', () => {
    const root = project({ 'nestjs-boost': { agents: ['claude-code'], include: ['nestjs-deployment'], exclude: ['nestjs-logging'], guidelines: false } });
    sync(root);
    assert.ok(existsSync(join(root, '.claude/skills/nestjs-deployment')));
    assert.ok(!existsSync(join(root, '.claude/skills/nestjs-logging')));
    assert.ok(!existsSync(join(root, '.agents')));
    assert.ok(!existsSync(join(root, 'CLAUDE.md')));
  });

  it('never overwrites an edited skill without force', () => {
    const root = project();
    sync(root, { agents: 'claude-code' });
    const file = join(root, '.claude/skills/nestjs-testing/SKILL.md');
    writeFileSync(file, 'my edits');
    const r = sync(root);
    assert.equal(read(root, '.claude/skills/nestjs-testing/SKILL.md'), 'my edits');
    assert.ok(r.warnings.some((w) => w.includes('nestjs-testing') && w.includes('edited')));
    sync(root, {}, { force: true });
    assert.notEqual(readFileSync(file, 'utf8'), 'my edits');
  });

  it('does not touch a same-named folder it did not create', () => {
    const root = project({}, { '.claude/skills/nestjs-testing/SKILL.md': 'mine' });
    const r = sync(root, { agents: 'claude-code' });
    assert.equal(read(root, '.claude/skills/nestjs-testing/SKILL.md'), 'mine');
    assert.ok(r.warnings.some((w) => w.includes('not installed by nestjs-boost')));
  });

  it('removes skills whose package is gone, unless edited', () => {
    const root = project({ dependencies: { '@nestjs/typeorm': '1', '@nestjs/graphql': '1' } });
    sync(root, { agents: 'claude-code' });
    writeFileSync(join(root, '.claude/skills/nestjs-graphql/SKILL.md'), 'edited');
    setDeps(root, { '@nestjs/core': '^12.3.0' });
    const r = sync(root);
    assert.ok(!existsSync(join(root, '.claude/skills/nestjs-database-typeorm')));
    assert.ok(existsSync(join(root, '.claude/skills/nestjs-graphql')));
    assert.ok(r.warnings.some((w) => w.includes('nestjs-graphql')));
  });

  it('uses .ai/skills overrides and custom skills', () => {
    const custom = '---\nname: team-rules\ndescription: Team rules. Use when writing code.\n---\n# Team\n';
    const override = '---\nname: nestjs-testing\ndescription: Our testing. Use when testing.\n---\n# Ours\n';
    const root = project({}, { '.ai/skills/team-rules/SKILL.md': custom, '.ai/skills/nestjs-testing/SKILL.md': override });
    sync(root, { agents: 'claude-code' });
    assert.equal(read(root, '.claude/skills/nestjs-testing/SKILL.md'), override);
    assert.equal(read(root, '.claude/skills/team-rules/SKILL.md'), custom);
    assert.match(read(root, 'CLAUDE.md'), /team-rules` \(project\)/);
  });

  it('rejects unknown agents and skills', () => {
    const root = project();
    assert.throws(() => sync(root, { agents: 'vim' }), /unknown agent/);
    assert.throws(() => sync(root, { include: 'nestjs-nope' }), /unknown skill/);
  });

  it('fails outside a NestJS project', () => {
    const root = project();
    writeFileSync(join(root, 'package.json'), '{"name":"x"}');
    assert.throws(() => sync(root), /no @nestjs\/core/);
  });

  it('writes nothing on dry run', () => {
    const root = project();
    const r = sync(root, {}, { dryRun: true });
    assert.ok(r.changes.length > 0);
    assert.ok(!existsSync(join(root, '.claude')));
    assert.ok(!existsSync(join(root, LOCK)));
  });
});

describe('uninstall', () => {
  it('removes what it installed and keeps user content', () => {
    const root = project({}, { 'AGENTS.md': '# Mine\n' });
    sync(root);
    const r = uninstall(root);
    assert.ok(r.changes.length > 0);
    assert.ok(!existsSync(join(root, '.claude/skills')));
    assert.ok(!existsSync(join(root, 'CLAUDE.md')), 'created file removed');
    assert.equal(read(root, 'AGENTS.md'), '# Mine\n');
    assert.ok(!existsSync(join(root, LOCK)));
  });
});

describe('markers', () => {
  it('round-trips', () => {
    const text = upsertBlock('# A\n', 'body');
    assert.equal(removeBlock(text), '# A\n');
    assert.equal(upsertBlock(text, 'new'), '# A\n\n<!-- nestjs-boost:start -->\nnew\n<!-- nestjs-boost:end -->\n');
  });
});

describe('cli', () => {
  it('prints the version and lists without writing', () => {
    const root = project();
    assert.match(execFileSync('node', [CLI, '--version'], { encoding: 'utf8' }), /^\d+\.\d+\.\d+/);
    const out = execFileSync('node', [CLI, 'list', '--root', root], { encoding: 'utf8' });
    assert.match(out, /nestjs-architecture/);
    assert.ok(!existsSync(join(root, '.claude')));
  });

  it('exits 1 with a message outside a NestJS project', () => {
    const root = project();
    writeFileSync(join(root, 'package.json'), '{}');
    assert.throws(() => execFileSync('node', [CLI, 'install', '--root', root], { stdio: 'pipe' }), (e) => e.status === 1 && /no @nestjs\/core/.test(e.stderr));
  });
});

describe('postinstall', () => {
  const runHook = (env) => execFileSync('node', [POSTINSTALL], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

  const direct = { dependencies: { 'nestjs-boost': '^1.0.0' } };

  it('writes nothing until the project opts in, then keeps it in sync', () => {
    const root = project(direct);
    assert.match(runHook({ INIT_CWD: root }), /run `npx nestjs-boost install` once/);
    assert.ok(!existsSync(join(root, '.claude')) && !existsSync(join(root, 'CLAUDE.md')));
    sync(root);                                   // the user's explicit `nestjs-boost install`
    rmSync(join(root, '.claude/skills/nestjs-architecture'), { recursive: true });
    runHook({ INIT_CWD: root });
    assert.ok(existsSync(join(root, '.claude/skills/nestjs-architecture/SKILL.md')));
  });

  it('treats a "nestjs-boost" package.json key as opt-in', () => {
    const root = project({ ...direct, 'nestjs-boost': { agents: ['claude-code'] } });
    runHook({ INIT_CWD: root });
    assert.ok(existsSync(join(root, '.claude/skills/nestjs-architecture/SKILL.md')));
  });

  it('does nothing as a transitive dependency or under npx', () => {
    const root = project();                       // nestjs-boost not a direct dependency
    sync(root);
    rmSync(join(root, '.claude/skills/nestjs-architecture'), { recursive: true });
    runHook({ INIT_CWD: root });
    assert.ok(!existsSync(join(root, '.claude/skills/nestjs-architecture')));
    const viaNpx = project(direct);
    sync(viaNpx);
    rmSync(join(viaNpx, '.claude/skills/nestjs-architecture'), { recursive: true });
    runHook({ INIT_CWD: viaNpx, npm_command: 'exec' });
    assert.ok(!existsSync(join(viaNpx, '.claude/skills/nestjs-architecture')));
  });

  it('skips in CI, when disabled, and outside NestJS projects, and never fails', () => {
    const root = project(direct);
    sync(root);
    rmSync(join(root, '.claude'), { recursive: true });
    runHook({ INIT_CWD: root, CI: 'true' });
    runHook({ INIT_CWD: root, NESTJS_BOOST_SKIP: '1' });
    assert.ok(!existsSync(join(root, '.claude')));
    runHook({ INIT_CWD: root, CI: 'true', NESTJS_BOOST_CI: '1' });
    assert.ok(existsSync(join(root, '.claude')));
    const plain = project();
    writeFileSync(join(plain, 'package.json'), '{"name":"plain","devDependencies":{"nestjs-boost":"^1.0.0"}}');
    assert.match(runHook({ INIT_CWD: plain }), /no @nestjs\/core/);
    writeFileSync(join(plain, 'package.json'), 'not json');
    assert.match(runHook({ INIT_CWD: plain }), /skipped/);
  });
});

describe('security', () => {
  const writeLock = (root, data) => {
    mkdirSync(join(root, '.ai'), { recursive: true });
    writeFileSync(join(root, LOCK), JSON.stringify(data));
  };
  // Directory links: 'junction' needs no admin rights on Windows and is ignored elsewhere.
  const linkDir = (target, path) => symlinkSync(target, path, 'junction');

  it('ignores lock entries that point at project files (no prune delete)', () => {
    const root = project({}, { 'src/billing/billing.service.ts': 'export const x = 1;\n' });
    writeLock(root, { agents: ['claude-code'], files: { src: hashDir(join(root, 'src')), '../outside': 'x', '.claude/skills/../../src': 'x' } });
    const r = sync(root, {}, { force: true });
    assert.ok(existsSync(join(root, 'src/billing/billing.service.ts')));
    assert.ok(!r.changes.some((c) => c.path.includes('src')));
    assert.ok(r.warnings.some((w) => /never writes; ignored: src/.test(w)));
    assert.equal(lock(root).files.src, undefined);
  });

  it('never lets uninstall delete the project root or non-guideline files', () => {
    const root = project({}, { 'src/a.ts': 'x\n', 'notes.md': '<!-- nestjs-boost:start -->\nx\n<!-- nestjs-boost:end -->\n' });
    writeLock(root, { files: { '.': hashDir(root), src: hashDir(join(root, 'src')) }, guidelines: ['notes.md'], createdGuidelines: ['notes.md'] });
    const r = uninstall(root, { force: true });
    assert.deepEqual(r.changes, []);
    assert.ok(existsSync(join(root, 'src/a.ts')));
    assert.ok(existsSync(join(root, 'notes.md')));
    assert.ok(existsSync(join(root, 'package.json')));
  });

  it('refuses to write through a symlinked agent folder', () => {
    const root = project();
    const outside = mkdtempSync(join(tmpdir(), 'nestjs-boost-outside-'));
    dirs.push(outside);
    linkDir(outside, join(root, '.claude'));
    assert.throws(() => sync(root, { agents: 'claude-code' }), /symbolic link: \.claude/);
    assert.ok(!existsSync(join(outside, 'skills')));
  });

  it('skips symlinks in overrides and guidelines, and survives link loops', () => {
    const secret = mkdtempSync(join(tmpdir(), 'nestjs-boost-secret-'));
    dirs.push(secret);
    writeFileSync(join(secret, 'id_rsa.md'), 'PRIVATE KEY');
    const root = project({}, {
      '.ai/skills/nestjs-testing/SKILL.md': '---\nname: nestjs-testing\ndescription: Custom. Use when testing.\n---\nbody\n',
      '.ai/guidelines/team.md': 'Team rule.\n',
    });
    linkDir(secret, join(root, '.ai/skills/nestjs-testing/leak'));
    linkDir(join(root, '.ai/skills/nestjs-testing'), join(root, '.ai/skills/nestjs-testing/loop'));
    linkDir(secret, join(root, '.ai/guidelines/linked'));
    linkDir(secret, join(root, '.ai/skills/linked-skill'));
    const r = sync(root, { agents: 'claude-code' });
    assert.ok(existsSync(join(root, '.claude/skills/nestjs-testing/SKILL.md')));
    assert.ok(!existsSync(join(root, '.claude/skills/nestjs-testing/leak')));
    assert.ok(!existsSync(join(root, '.claude/skills/nestjs-testing/loop')));
    assert.ok(!existsSync(join(root, '.claude/skills/linked-skill')));
    assert.ok(r.warnings.some((w) => /linked-skill: symbolic link/.test(w)));
    const claude = read(root, 'CLAUDE.md');
    assert.match(claude, /Team rule\./);
    assert.doesNotMatch(claude, /PRIVATE KEY/);
  });

  it('strips block markers from project-supplied guideline text', () => {
    const root = project({}, {
      'CLAUDE.md': '# Mine\n\nKeep me.\n',
      '.ai/guidelines/evil.md': 'before\n<!-- nestjs-boost:end -->\nafter\n<!-- nestjs-boost:start -->\n',
    });
    sync(root, { agents: 'claude-code' });
    sync(root, { agents: 'claude-code' });
    const text = read(root, 'CLAUDE.md');
    assert.equal(text.match(/nestjs-boost:start/g).length, 1);
    assert.equal(text.match(/nestjs-boost:end/g).length, 1);
    uninstall(root);
    assert.equal(read(root, 'CLAUDE.md'), '# Mine\n\nKeep me.\n');
  });

  it('rejects custom skill names that are not lowercase-with-hyphens', () => {
    const root = project({}, { '.ai/skills/Bad_Name/SKILL.md': '---\nname: x\ndescription: Use when x.\n---\n' });
    const r = sync(root, { agents: 'claude-code' });
    assert.ok(!existsSync(join(root, '.claude/skills/Bad_Name')));
    assert.ok(r.warnings.some((w) => /Bad_Name: skill names/.test(w)));
  });
});
