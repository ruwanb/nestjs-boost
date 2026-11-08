import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const ok = await req(base, 'POST', '/products', { body: { name: 'Kibble', price: 9.5, tags: ['cat'] } });
    ctx.record('Valid body -> 201 with id', ok.status === 201 && ok.json?.id !== undefined, show(ok));
    const cases = [
      ['Missing name -> 400', { price: 1 }],
      ['Negative price -> 400', { name: 'A', price: -1 }],
      ['Non-string tags -> 400', { name: 'A', price: 1, tags: [1] }],
      ['Unknown field -> 400', { name: 'A', price: 1, extra: true }],
      ['price as string "5" -> 400', { name: 'A', price: '5' }],
    ];
    for (const [text, body] of cases) {
      const r = await req(base, 'POST', '/products', { body });
      ctx.record(text, r.status === 400, show(r));
    }
  });
}
