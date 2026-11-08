import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, { FEATURE_GREETING: 'Hi' }, async (base) => {
    const r = await req(base, 'GET', '/');
    ctx.record("FEATURE_GREETING=Hi -> 'Hi World!'", r.status === 200 && r.text === 'Hi World!', show(r));
  });
  const app = await ctx.boot({});
  if (app.base) { const r = await req(app.base, 'GET', '/'); ctx.record("Default -> 'Hello World!'", r.text === 'Hello World!', show(r)); app.stop(); }
  else ctx.record("Default -> 'Hello World!'", false, app.output().slice(-300));
  ctx.record('ConfigModule isGlobal: true', ctx.grep(/isGlobal:\s*true/).length > 0, ctx.grep(/isGlobal/).join(', ') || 'none');
}
