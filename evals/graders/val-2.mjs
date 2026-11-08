import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const g = await req(base, 'GET', '/users/1');
    ctx.record('GET /users/1 without passwordHash', g.status === 200 && g.json?.email && !('passwordHash' in g.json), show(g));
    const p = await req(base, 'POST', '/users', { body: { email: 'b@example.com', name: 'B', password: 'pw' } });
    ctx.record('POST /users without passwordHash', p.status === 201 && p.json?.email && !('passwordHash' in p.json), show(p));
  });
  const builtIn = ctx.grep(/ClassSerializerInterceptor|StandardSchemaSerializerInterceptor/);
  const global = ctx.grep(/APP_INTERCEPTOR|useGlobalInterceptors\(/);
  ctx.record('Exclusion centralized (global interceptor / serializer)', builtIn.length + global.length > 0, `built-in: ${builtIn.join(', ') || 'none'}; global: ${global.join(', ') || 'none'}`);
  ctx.record("Uses Nest's documented serializer", builtIn.length > 0, builtIn.join(', ') || 'custom stripping only');
}
