export async function check(ctx) {
  let cfg = {};
  try { cfg = JSON.parse(ctx.file('nest-cli.json') ?? '{}'); } catch (e) { cfg = {}; }
  const projects = Object.keys(cfg.projects ?? {});
  ctx.record('nest-cli.json monorepo with worker app and common library', cfg.monorepo === true && projects.includes('worker') && projects.includes('common'), JSON.stringify({ monorepo: cfg.monorepo, projects }));
  const b = ctx.run('npx nest build worker');
  ctx.record('Worker app builds', b.ok, b.tail);
  const importers = ctx.src.filter((f) => /from '@app\/common(\/[^']*)?'|from "@app\/common/.test(f.text) && /^apps\//.test(f.path)).map((f) => f.path.split('/')[1]);
  const apps = new Set(importers);
  ctx.record('Both apps import from the library alias', apps.size >= 2, [...apps].join(', ') || 'none');
}
