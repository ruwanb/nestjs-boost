import { withApp } from './_lib.mjs';
export async function check(ctx) {
  let cfg = {};
  try { cfg = JSON.parse(ctx.file('nest-cli.json') ?? '{}'); } catch { cfg = {}; }
  const co = cfg.compilerOptions ?? {};
  const builder = typeof co.builder === 'string' ? co.builder : co.builder?.type;
  ctx.record('nest-cli.json sets the SWC builder', builder === 'swc', JSON.stringify(co));
  ctx.record('Type checking stays enabled (typeCheck: true)', co.typeCheck === true, JSON.stringify(co));
  ctx.record('@swc/cli and @swc/core are installed', Boolean(ctx.deps['@swc/cli'] && ctx.deps['@swc/core']), Object.keys(ctx.deps).filter((d) => d.includes('swc')).join(', ') || 'none');
  await withApp(ctx, ctx.env, async () => {});
}
