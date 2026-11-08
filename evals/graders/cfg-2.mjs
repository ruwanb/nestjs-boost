import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, { DB_HOST: 'db.internal', DB_PORT: '6543' }, async (base) => {
    const r = await req(base, 'GET', '/db-info');
    ctx.record('Env values -> db.internal / 6543 (number)', r.status === 200 && r.json?.host === 'db.internal' && r.json?.port === 6543, show(r));
  });
  const app = await ctx.boot({});
  if (app.base) {
    const r = await req(app.base, 'GET', '/db-info');
    ctx.record('Defaults -> localhost / 5432', r.status === 200 && r.json?.host === 'localhost' && r.json?.port === 5432, show(r));
    app.stop();
  } else ctx.record('Defaults -> localhost / 5432', false, app.output().slice(-300));
  const typed = ctx.grep(/registerAs\(/).length > 0 && ctx.grep(/ConfigType</).length > 0 && ctx.grep(/\.KEY\)/).length > 0;
  ctx.record('Uses registerAs + ConfigType + .KEY injection', typed, ctx.grep(/registerAs\(|ConfigType</).join(', ') || 'none');
}
