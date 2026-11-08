import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base, output) => {
    const c = await req(base, 'POST', '/users', { body: { email: 'trin@example.com', name: 'Trin', password: 'x' } });
    await new Promise((r) => setTimeout(r, 300));
    const lines = output().split('\n').filter((l) => l.trim());
    const json = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const share = json.filter(Boolean).length / Math.max(lines.length, 1);
    ctx.record('Log lines are JSON in production', share >= 0.9, `${json.filter(Boolean).length}/${lines.length} JSON lines; first: ${lines[0]?.slice(0, 160)}`);
    const entry = json.find((j) => j && /User created/.test(JSON.stringify(j.message ?? '')));
    const flat = entry && { ...(entry.params ?? {}), ...entry };
    ctx.record("'User created' entry carries userId and email as fields", c.status === 201 && Boolean(flat) && flat.userId !== undefined && flat.email === 'trin@example.com', entry ? JSON.stringify(entry).slice(0, 300) : `no entry; ${show(c)}`);
  });
  const consoleUse = ctx.src.filter((f) => /^src\//.test(f.path) && /console\.log\(/.test(f.text)).map((f) => f.path);
  ctx.record("Uses Nest's Logger, not console.log", consoleUse.length === 0 && ctx.grep(/new Logger\(|Logger\b/).length > 0, consoleUse.join(', ') || 'no console.log');
}
