import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const d = await req(base, 'GET', '/items');
    ctx.record('Defaults page 1 / limit 20 as numbers', d.status === 200 && d.json?.page === 1 && d.json?.limit === 20, show(d));
    const s = await req(base, 'GET', '/items?page=2&limit=10');
    ctx.record('page=2&limit=10 -> 2 and 10 as numbers', s.status === 200 && s.json?.page === 2 && s.json?.limit === 10, show(s));
    for (const [text, q] of [['limit=500 -> 400', 'limit=500'], ['page=abc -> 400', 'page=abc'], ['page=0 -> 400', 'page=0']]) {
      const r = await req(base, 'GET', `/items?${q}`);
      ctx.record(text, r.status === 400, show(r));
    }
  });
  const ctrl = ctx.src.filter((f) => /\/items/.test(f.text) || /items\.controller\.ts$/.test(f.path)).map((f) => f.text).join('\n');
  const pipes = /ParseIntPipe|DefaultValuePipe|ValidationPipe|StandardSchemaValidationPipe|schema:|@Query\(\)\s+\w+:\s*\w+(Dto|Query)/.test(ctrl);
  ctx.record('[docs] Query parsing via pipes or a validated query DTO/schema', pipes, pipes ? 'pipes/DTO/schema found' : 'manual parsing');
}
