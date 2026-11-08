// Grade one eval run objectively and write grading.json.
// Usage: node grade.mjs <eval-id> <workdir> <out-grading.json>
//
// Standard assertions (every eval): build, lint, the project's own unit and e2e
// tests. Then the real app is started from dist/main.js (so main.ts setup is
// exercised, unlike an e2e test built from AppModule) and the eval's grader
// module in evals/graders/<eval-id>.mjs runs its HTTP and source checks.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findEval } from './prepare.mjs';

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
// Generous because a cold `nest build` plus app bootstrap can take several
// seconds on a loaded machine; a real hang still fails well within a run.
const BOOT_TIMEOUT_MS = 20_000;
const CMD_TIMEOUT_MS = 180_000;

function run(cmd, cwd, env = {}) {
  const r = spawnSync('bash', ['-lc', cmd], {
    cwd, env: { ...process.env, ...env, CI: '1' }, encoding: 'utf8', timeout: CMD_TIMEOUT_MS,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, status: r.status, tail: out.trim().split('\n').slice(-12).join('\n') };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function startApp(workdir, env) {
  const port = await freePort();
  const child = spawn('node', ['dist/main.js'], {
    cwd: workdir, env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  let exited = false;
  child.on('exit', () => { exited = true; });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline && !exited) {
    // Probe an unmatched path: any HTTP answer (even 404) means the server is up,
    // and guards/throttlers don't run for unmatched routes, so no budget is used.
    try { await fetch(`${base}/__grader_ready__`, { signal: AbortSignal.timeout(1000) }); return { base, child, port, getOutput: () => output }; }
    catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  child.kill('SIGKILL');
  return { base: null, child, port, getOutput: () => output, exited };
}

function listSrc(workdir) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) files.push(p);
    }
  };
  for (const d of ['src', 'test', 'apps', 'libs']) if (existsSync(join(workdir, d))) walk(join(workdir, d));
  return files;
}

async function main() {
  const [evalId, workdir, outFile] = process.argv.slice(2);
  if (!evalId || !workdir || !outFile) {
    console.error('Usage: node grade.mjs <eval-id> <workdir> <out-grading.json>');
    process.exit(2);
  }
  const ev = findEval(evalId);
  const graderPath = join(EVALS_DIR, 'graders', `${evalId}.mjs`);
  const grader = existsSync(graderPath) ? await import(pathToFileURL(graderPath).href) : {};
  const results = [];
  const record = (text, passed, evidence) => results.push({ text, passed: Boolean(passed), evidence: String(evidence).slice(0, 600) });

  const build = run('npm run build', workdir);
  record('Project builds (npm run build)', build.ok, build.ok ? 'exit 0' : build.tail);
  const lint = run('npm run lint', workdir);
  record('Lint passes (npm run lint)', lint.ok, lint.ok ? 'exit 0' : lint.tail);
  const unit = run('npm test', workdir);
  record('Unit tests pass (npm test)', unit.ok, unit.tail.split('\n').filter((l) => /Tests|Test Files|FAIL|Error/.test(l)).join(' | ') || unit.tail);
  const e2e = run('npm run test:e2e', workdir);
  record('E2E tests pass (npm run test:e2e)', e2e.ok, e2e.tail.split('\n').filter((l) => /Tests|Test Files|FAIL|Error/.test(l)).join(' | ') || e2e.tail);

  const src = listSrc(workdir).map((p) => ({ path: relative(workdir, p), text: readFileSync(p, 'utf8') }));
  const pkg = JSON.parse(readFileSync(join(workdir, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const ctx = {
    ev, env: ev.env ?? {}, workdir, src, deps, pkg, record, run: (cmd, env) => run(cmd, workdir, env),
    grep: (re) => src.filter((f) => re.test(f.text)).map((f) => f.path),
    file: (p) => (existsSync(join(workdir, p)) ? readFileSync(join(workdir, p), 'utf8') : null),
    // Starts dist/main.js with the given env; returns { base, stop, output }.
    boot: async (env = {}) => {
      if (!build.ok) return { base: null, stop: () => {}, output: () => 'not built' };
      const app = await startApp(workdir, env);
      return { base: app.base, stop: () => app.child.kill('SIGKILL'), output: app.getOutput };
    },
  };
  if (grader.check) {
    try { await grader.check(ctx); }
    catch (err) { record('Grader ran without error', false, err.stack); }
  }

  const passed = results.filter((r) => r.passed).length;
  const grading = {
    eval_id: evalId, skill: ev.skill,
    assertion_results: results,
    summary: { passed, failed: results.length - passed, total: results.length, pass_rate: +(passed / results.length).toFixed(3) },
  };
  writeFileSync(outFile, JSON.stringify(grading, null, 2));
  console.log(`${evalId}: ${passed}/${results.length}`);
}

main();
