import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AGENTS, AGENT_LIST, ALL_INSTRUCTION_FILES, ALL_SKILL_DIRS, planSkillDirs } from '../lib/agents.mjs';
import { LOCK, sync } from '../lib/installer.mjs';
import { PromptCancelled, canPrompt, confirm, multiSelect } from '../lib/prompt.mjs';
import { agentChoices, interactiveInstall } from '../lib/setup.mjs';
import { formatChanges, parseArgs } from '../bin/nestjs-boost.mjs';

const CLI = fileURLToPath(new URL('../bin/nestjs-boost.mjs', import.meta.url));
const dirs = [];
function project(pkg = {}, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nestjs-boost-agents-'));
  dirs.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: { '@nestjs/core': '^12.3.0' }, ...pkg }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });

// A fake terminal: keys are written to `input`, everything drawn is collected from `output`.
function terminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const chunks = [];
  const output = new Writable({ write(c, _e, cb) { chunks.push(String(c)); cb(); } });
  output.isTTY = true;
  output.columns = 120;
  return { io: { input, output, env: { NO_COLOR: '1' } }, text: () => chunks.join('') };
}
const KEY = { up: '\x1b[A', down: '\x1b[B', space: ' ', enter: '\r', ctrlC: '\x03' };
async function press(io, ...keys) {
  for (const k of keys) {
    await new Promise((r) => setImmediate(r));
    io.input.write(k);
  }
}

describe('agent registry', () => {
  it('has unique ids and safe, consistent paths for every agent', () => {
    assert.equal(new Set(AGENT_LIST.map((a) => a.id)).size, AGENT_LIST.length);
    for (const a of AGENT_LIST) {
      assert.match(a.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, a.id);
      assert.ok(a.name && a.docs.startsWith('https://'), a.id);
      assert.equal(a.skills.reads[0], a.skills.dir, `${a.id}: native folder must be read first`);
      for (const p of [...a.skills.reads, a.instructions, ...a.markers]) {
        assert.ok(!p.startsWith('/') && !p.split('/').includes('..') && !p.includes('\\'), `${a.id}: unsafe path ${p}`);
      }
      assert.ok(a.instructions.endsWith('.md'), a.id);
    }
    assert.ok(ALL_INSTRUCTION_FILES.includes('AGENTS.md') && ALL_SKILL_DIRS.includes('.github/skills'));
  });

  it('installs a single agent into its own native folder', () => {
    for (const a of AGENT_LIST) assert.deepEqual(planSkillDirs([a.id]).map((p) => p.dir), [a.skills.dir], a.id);
  });

  it('shares folders so no agent sees a skill twice, and every agent is covered', () => {
    assert.deepEqual(planSkillDirs(['claude-code', 'cursor', 'copilot', 'opencode']).map((p) => p.dir), ['.claude/skills']);
    assert.deepEqual(planSkillDirs(['codex', 'gemini', 'roo']).map((p) => p.dir), ['.agents/skills']);
    assert.deepEqual(planSkillDirs(['claude-code', 'codex']).map((p) => p.dir), ['.claude/skills', '.agents/skills']);
    const everyone = AGENT_LIST.map((a) => a.id);
    const plan = planSkillDirs(everyone);
    for (const id of everyone) {
      const seen = plan.filter((p) => AGENTS[id].skills.reads.includes(p.dir));
      assert.ok(seen.length >= 1, `${id} reads no installed folder`);
    }
    // Agents that can't share (Windsurf, Cline, Kiro, Junie) still get their own folder.
    for (const id of ['windsurf', 'cline', 'kiro', 'junie']) assert.ok(plan.some((p) => p.dir === AGENTS[id].skills.dir));
  });
});

describe('sync with the new agents', () => {
  it('writes Cursor skills to .cursor/skills and its guidelines to AGENTS.md', () => {
    const root = project();
    const r = sync(root, { agents: 'cursor' });
    assert.ok(existsSync(join(root, '.cursor/skills/nestjs-architecture/SKILL.md')));
    assert.match(read(root, 'AGENTS.md'), /nestjs-boost:start/);
    assert.deepEqual(r.guidelineFiles, ['AGENTS.md']);
    assert.ok(!existsSync(join(root, '.agents')) && !existsSync(join(root, 'CLAUDE.md')));
  });

  it('writes Gemini guidelines to GEMINI.md and Copilot skills to .github/skills', () => {
    const root = project();
    sync(root, { agents: 'gemini,copilot' });
    assert.ok(existsSync(join(root, '.gemini/skills/nestjs-testing/SKILL.md')));
    assert.ok(existsSync(join(root, '.github/skills/nestjs-testing/SKILL.md')));
    assert.match(read(root, 'GEMINI.md'), /nestjs-boost:start/);
    assert.match(read(root, '.github/copilot-instructions.md'), /nestjs-boost:start/);
  });

  it('cleans up after switching agents, keeping user text', () => {
    const root = project({}, { 'CLAUDE.md': '# Team notes\n' });
    sync(root, { agents: 'claude-code' });
    const r = sync(root, { agents: 'windsurf' });
    assert.ok(existsSync(join(root, '.windsurf/skills/nestjs-architecture/SKILL.md')));
    assert.ok(!existsSync(join(root, '.claude')), 'emptied .claude/ is removed');
    assert.equal(read(root, 'CLAUDE.md'), '# Team notes\n', 'only our block is removed');
    assert.ok(r.changes.some((c) => c.path === 'CLAUDE.md (guidelines block removed)'));
    const lock = JSON.parse(read(root, LOCK));
    assert.deepEqual(lock.agents, ['windsurf']);
    assert.ok(Object.keys(lock.files).every((f) => f.startsWith('.windsurf/skills/')));
  });

  it('deletes an instructions file it created once its agent is deselected', () => {
    const root = project();
    sync(root, { agents: 'claude-code,gemini' });
    sync(root, { agents: 'claude-code' });
    assert.ok(!existsSync(join(root, 'GEMINI.md')) && !existsSync(join(root, '.gemini')));
    assert.ok(existsSync(join(root, 'CLAUDE.md')));
  });

  it('remembers the choice in the lock file for the next run', () => {
    const root = project();
    sync(root, { agents: 'kiro' });
    const r = sync(root);
    assert.deepEqual(r.opts.agents, ['kiro']);
    assert.equal(r.opts.agentSource, 'lock');
  });

  it('rejects unknown agents with the list of known ones', () => {
    assert.throws(() => sync(project(), { agents: 'notepad' }), /unknown agent\(s\): notepad \(known: claude-code,/);
  });
});

describe('prompts', () => {
  it('needs a real terminal', () => {
    assert.equal(canPrompt({ input: { isTTY: false }, output: { isTTY: true } }), false);
    assert.equal(canPrompt(terminal().io), true);
  });

  it('multi-select: move, toggle and confirm', async () => {
    const t = terminal();
    const choices = [{ value: 'a', label: 'A', checked: true }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }];
    const p = multiSelect({ message: 'Pick', choices }, t.io);
    await press(t.io, KEY.space, KEY.down, KEY.down, KEY.space, KEY.enter);   // untick A, tick C
    assert.deepEqual(await p, ['c']);
    assert.match(t.text(), /Pick C/);
  });

  it('multi-select: requires at least one and supports select-all', async () => {
    const t = terminal();
    const p = multiSelect({ message: 'Pick', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }, t.io);
    await press(t.io, KEY.enter);
    await press(t.io, 'a', KEY.enter);
    assert.deepEqual(await p, ['a', 'b']);
    assert.match(t.text(), /Select at least 1/);
  });

  it('ctrl+c cancels', async () => {
    const t = terminal();
    const p = multiSelect({ message: 'Pick', choices: [{ value: 'a', label: 'A' }] }, t.io);
    await press(t.io, KEY.ctrlC);
    await assert.rejects(p, PromptCancelled);
  });

  it('confirm: y, n and enter for the default', async () => {
    for (const [key, expected] of [['y', true], ['n', false], [KEY.enter, true]]) {
      const t = terminal();
      const p = confirm({ message: 'Go?' }, t.io);
      await press(t.io, key);
      assert.equal(await p, expected);
    }
  });
});

describe('interactive install', () => {
  it('pre-selects detected agents and marks them', () => {
    const choices = agentChoices(['cursor'], ['cursor']);
    assert.equal(choices.length, AGENT_LIST.length);
    const cursor = choices.find((c) => c.value === 'cursor');
    assert.ok(cursor.checked && cursor.tag === '(detected)' && cursor.hint.includes('.cursor/skills/'));
  });

  it('installs for the agents picked, after confirmation', async () => {
    const root = project({}, { '.cursor/rules/x.mdc': 'x' });       // Cursor detected and pre-checked
    const t = terminal();
    const lines = [];
    // Picker order follows the registry: claude-code, codex, copilot, cursor, gemini, ...
    const p = interactiveInstall(root, {}, {}, t.io, (l) => lines.push(l));
    await press(t.io, KEY.down, KEY.down, KEY.down, KEY.down, KEY.space, KEY.enter);  // add Gemini CLI
    await press(t.io, 'y');
    const r = await p;
    assert.deepEqual(r.opts.agents, ['cursor', 'gemini']);
    assert.ok(existsSync(join(root, '.cursor/skills/nestjs-architecture/SKILL.md')));
    assert.ok(existsSync(join(root, '.gemini/skills/nestjs-architecture/SKILL.md')));
    assert.ok(lines.some((l) => /\.cursor\/skills\/\s+read by Cursor/.test(l)));
    assert.ok(lines.some((l) => /Guidelines block: AGENTS\.md, GEMINI\.md/.test(l)));
  });

  it('writes nothing when the user declines', async () => {
    const root = project();
    const t = terminal();
    const p = interactiveInstall(root, {}, {}, t.io, () => {});
    await press(t.io, KEY.enter, 'n');
    assert.equal(await p, null);
    assert.ok(!existsSync(join(root, '.claude')) && !existsSync(join(root, LOCK)));
  });

  it('does not ask for agents pinned in package.json', async () => {
    const root = project({ 'nestjs-boost': { agents: ['junie'] } });
    const t = terminal();
    const p = interactiveInstall(root, {}, {}, t.io, () => {});
    await press(t.io, 'y');
    const r = await p;
    assert.deepEqual(r.opts.agents, ['junie']);
    assert.doesNotMatch(t.text(), /Which AI coding agents/);
  });
});

describe('cli', () => {
  it('parses -y and --agents', () => {
    assert.deepEqual(parseArgs(['install', '-y', '--agents', 'cursor']), { _: ['install'], yes: true, agents: 'cursor' });
    assert.throws(() => parseArgs(['--agents', '-y']), /--agents needs a value/);
  });

  it('groups skill changes per folder', () => {
    const changes = [
      ...['a', 'b', 'c', 'd', 'e'].map((n) => ({ action: 'add', path: `.claude/skills/nestjs-${n}` })),
      { action: 'add', path: 'CLAUDE.md (guidelines block)' },
    ];
    assert.deepEqual(formatChanges(changes), [
      '  + .claude/skills/ 5 skills: nestjs-a, nestjs-b, nestjs-c, nestjs-d, …',
      '  + CLAUDE.md (guidelines block)',
    ]);
  });

  it('never prompts without a terminal (piped / CI) and lists agents', () => {
    const root = project();
    const out = execFileSync('node', [CLI, 'install', '--root', root], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CI: '' } });
    assert.match(out, /Changed:/);
    assert.ok(existsSync(join(root, '.claude/skills/nestjs-architecture')));
    assert.match(execFileSync('node', [CLI, 'agents'], { encoding: 'utf8' }), /cursor\s+Cursor\s+\.cursor\/skills\//);
  });
});
