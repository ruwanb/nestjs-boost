import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const me = await req(base, 'GET', '/users/me');
    ctx.record('GET /users/me returns user 1', me.status === 200 && me.json?.id === 1, show(me));
    const one = await req(base, 'GET', '/users/1');
    ctx.record('GET /users/1 still returns 200', one.status === 200, show(one));
  });
  const diag = ctx.grep(/routeConflictPolicy|routeResolutionStrategy/);
  const regression = ctx.src.filter((f) => /spec\.ts$/.test(f.path) && /users\/me/.test(f.text)).map((f) => f.path);
  ctx.record('Route conflict diagnostics/specificity enabled or regression test for /users/me', diag.length + regression.length > 0, `diagnostics: ${diag.join(', ') || 'none'}; tests: ${regression.join(', ') || 'none'}`);
  ctx.record('[docs] Enables route conflict diagnostics or specificity resolution', diag.length > 0, diag.join(', ') || 'not enabled');
}
