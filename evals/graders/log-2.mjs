import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const a = await req(base, 'GET', '/', { headers: { 'x-request-id': 'req-abc-123' } });
    ctx.record('Incoming x-request-id echoed', a.headers.get('x-request-id') === 'req-abc-123', `${show(a)} header=${a.headers.get('x-request-id')}`);
    const b = await req(base, 'GET', '/');
    const id = b.headers.get('x-request-id');
    ctx.record('Generated x-request-id when absent', Boolean(id) && id !== 'req-abc-123', `header=${id}`);
  });
  const als = ctx.grep(/AsyncLocalStorage|ClsModule|ClsService/);
  ctx.record('Request ID propagated through AsyncLocalStorage / nestjs-cls', als.length > 0, als.join(', ') || 'none');
}
