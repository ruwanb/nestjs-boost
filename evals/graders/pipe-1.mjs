import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const a = await req(base, 'GET', '/');
    ctx.record('GET / without key returns 401', a.status === 401, show(a));
    const b = await req(base, 'GET', '/', { headers: { 'x-api-key': 's3cret' } });
    ctx.record('GET / with key returns 200', b.status === 200, show(b));
    const h = await req(base, 'GET', '/health');
    ctx.record('GET /health is public and returns { status: ok }', h.status === 200 && h.json?.status === 'ok', show(h));
  });
  const bound = ctx.grep(/APP_GUARD|useGlobalGuards\(/);
  ctx.record('Guard bound globally (APP_GUARD / useGlobalGuards)', bound.length > 0, bound.join(', ') || 'not found');
  const meta = ctx.grep(/Reflector/);
  ctx.record('Public routes marked via metadata read by Reflector', meta.length > 0 && ctx.grep(/SetMetadata|createDecorator/).length > 0, meta.join(', ') || 'no Reflector usage');
}
